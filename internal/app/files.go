package app

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const maxUpload = 15 << 20

func validateUploadSize(size int64) error {
	if size > maxUpload {
		return fail(413, "FILE_TOO_LARGE", "Размер файла не должен превышать 15 МБ")
	}
	if size <= 0 {
		return fail(422, "INVALID_SIZE", "Файл пустой")
	}
	return nil
}

func (a *App) sessionAttachments(w http.ResponseWriter, r *http.Request) error {
	s, e := a.loadSession(r.Context(), a.db, r.PathValue("id"), false)
	if e != nil {
		return e
	}
	if e = a.owns(r, s); e != nil {
		return e
	}
	rows, e := a.db.QueryContext(r.Context(), "SELECT id,question_key,category,mime,original_name FROM attachments WHERE session_id=$1 ORDER BY created_at", s.ID)
	if e != nil {
		return e
	}
	out, e := rowsJSON(rows)
	if e != nil {
		return e
	}
	jsonResponse(w, out)
	return nil
}

func (a *App) upload(w http.ResponseWriter, r *http.Request) error {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	if !a.allow("upload-ip:"+ip, 30) {
		w.Header().Set("Retry-After", "60")
		return fail(429, "RATE_LIMIT", "Слишком много загрузок. Подождите минуту.")
	}
	if r.ContentLength > maxUpload+(1<<20) {
		return fail(413, "FILE_TOO_LARGE", "Размер файла не должен превышать 15 МБ")
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	s, e := a.loadSession(r.Context(), tx, r.PathValue("id"), true)
	if e != nil {
		return e
	}
	if e = a.owns(r, s); e != nil {
		return e
	}
	if !a.allow("upload-owner:"+s.Owner, 20) {
		w.Header().Set("Retry-After", "60")
		return fail(429, "RATE_LIMIT", "Слишком много загрузок. Подождите минуту.")
	}
	if s.Status != "IN_PROGRESS" {
		return fail(409, "SESSION_CLOSED", "Регистрация недоступна для загрузки")
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+(1<<20))
	if e = r.ParseMultipartForm(1 << 20); e != nil {
		return fail(413, "FILE_TOO_LARGE", "Размер файла не должен превышать 15 МБ")
	}
	defer r.MultipartForm.RemoveAll()
	key, category := r.FormValue("question_key"), r.FormValue("category")
	var question *Question
	for i := range s.Questions {
		if s.Questions[i].Key == key {
			question = &s.Questions[i]
		}
	}
	if question == nil || (question.Type != "PHOTO_UPLOAD" && question.Type != "FILE_UPLOAD") {
		return fail(422, "INVALID_QUESTION", "Этот вопрос не принимает файлы")
	}
	if len(question.Settings.Categories) > 0 {
		found := false
		for _, c := range question.Settings.Categories {
			if c.Value == category && c.Enabled {
				found = true
			}
		}
		if !found {
			return fail(422, "INVALID_CATEGORY", "Выберите категорию файла")
		}
	}
	var count int
	if e = tx.QueryRowContext(r.Context(), "SELECT count(*) FROM attachments WHERE session_id=$1 AND question_key=$2", s.ID, key).Scan(&count); e != nil {
		return e
	}
	max := question.Settings.MaxFiles
	if max == 0 {
		max = 8
	}
	if count >= max {
		return fail(422, "TOO_MANY_FILES", "Удалите лишние файлы перед загрузкой")
	}
	f, h, e := r.FormFile("file")
	if e != nil {
		return fail(422, "FILE_REQUIRED", "Выберите файл")
	}
	defer f.Close()
	if e = validateUploadSize(h.Size); e != nil {
		return e
	}
	b, e := io.ReadAll(io.LimitReader(f, maxUpload+1))
	if e != nil {
		return e
	}
	if e = validateUploadSize(int64(len(b))); e != nil {
		return e
	}
	contentType := http.DetectContentType(b)
	ext := strings.ToLower(filepath.Ext(h.Filename))
	allowed := map[string][]string{"image/jpeg": {".jpg", ".jpeg"}, "image/png": {".png"}}
	if question.Type == "FILE_UPLOAD" {
		allowed["application/pdf"] = []string{".pdf"}
	}
	if !includes(allowed[contentType], ext) {
		return fail(422, "INVALID_FILE", "Разрешены JPEG, PNG; для документов также PDF")
	}
	if strings.HasPrefix(contentType, "image/") {
		cfg, _, e := image.DecodeConfig(bytes.NewReader(b))
		if e != nil || cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > 40000000 {
			return fail(422, "INVALID_IMAGE", "Изображение повреждено или слишком большое")
		}
		if _, _, e = image.Decode(bytes.NewReader(b)); e != nil {
			return fail(422, "INVALID_IMAGE", "Изображение повреждено")
		}
	} else {
		for _, marker := range []string{"/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/OpenAction"} {
			if bytes.Contains(b, []byte(marker)) {
				return fail(422, "UNSAFE_FILE", "Активное содержимое PDF не допускается")
			}
		}
	}
	id := newID()
	storage := id + ext
	path := filepath.Join(a.uploadDir, storage)
	if e = os.WriteFile(path, b, 0600); e != nil {
		return e
	}
	keep := false
	defer func() {
		if !keep {
			_ = os.Remove(path)
		}
	}()
	if _, e = tx.ExecContext(r.Context(), "INSERT INTO attachments(id,session_id,question_key,storage_name,mime,size,original_name,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", id, s.ID, key, storage, contentType, len(b), filepath.Base(h.Filename), category); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	keep = true
	jsonResponse(w, FileRef{ID: id, Category: category})
	return nil
}
func (a *App) attachment(w http.ResponseWriter, r *http.Request) (string, string, string, string, error) {
	var sid, name, typ, original string
	e := a.db.QueryRowContext(r.Context(), "SELECT session_id,storage_name,mime,original_name FROM attachments WHERE id=$1", r.PathValue("id")).Scan(&sid, &name, &typ, &original)
	if errors.Is(e, sql.ErrNoRows) {
		return "", "", "", "", fail(404, "NOT_FOUND", "Файл не найден")
	}
	if e != nil {
		return "", "", "", "", e
	}
	s, e := a.loadSession(r.Context(), a.db, sid, false)
	if e != nil {
		return "", "", "", "", e
	}
	if e = a.owns(r, s); e != nil {
		u, _ := a.user(r)
		if u == nil || u.Role != "admin" || r.Method != "GET" {
			return "", "", "", "", e
		}
	}
	return sid, name, typ, original, nil
}
func (a *App) download(w http.ResponseWriter, r *http.Request) error {
	_, name, typ, original, e := a.attachment(w, r)
	if e != nil {
		return e
	}
	disposition := "inline"
	if typ == "application/pdf" {
		disposition = "attachment"
	}
	w.Header().Set("Content-Type", typ)
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": original}))
	w.Header().Set("Content-Security-Policy", "sandbox")
	http.ServeFile(w, r, filepath.Join(a.uploadDir, name))
	return nil
}
func (a *App) deleteAttachment(w http.ResponseWriter, r *http.Request) error {
	sid, name, _, _, e := a.attachment(w, r)
	if e != nil {
		return e
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	s, e := a.loadSession(r.Context(), tx, sid, true)
	if e != nil {
		return e
	}
	if s.Status != "IN_PROGRESS" {
		return fail(409, "SESSION_CLOSED", "Файлы завершённой заявки нельзя удалить")
	}
	var qkey string
	if e = tx.QueryRowContext(r.Context(), "SELECT question_key FROM attachments WHERE id=$1", r.PathValue("id")).Scan(&qkey); e != nil {
		return e
	}
	if _, e = tx.ExecContext(r.Context(), "DELETE FROM attachments WHERE id=$1", r.PathValue("id")); e != nil {
		return e
	}
	if _, e = tx.ExecContext(r.Context(), "DELETE FROM questionnaire_answers WHERE session_id=$1 AND question_key=$2", sid, qkey); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	if e = os.Remove(filepath.Join(a.uploadDir, name)); e != nil && !os.IsNotExist(e) {
		return fmt.Errorf("remove attachment: %w", e)
	}
	jsonResponse(w, map[string]bool{"ok": true})
	return nil
}
