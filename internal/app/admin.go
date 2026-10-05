package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
)

func rowsJSON(rows *sql.Rows) ([]map[string]any, error) {
	defer rows.Close()
	cols, e := rows.Columns()
	if e != nil {
		return nil, e
	}
	out := []map[string]any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if e = rows.Scan(ptrs...); e != nil {
			return nil, e
		}
		m := map[string]any{}
		for i, c := range cols {
			if b, ok := vals[i].([]byte); ok {
				var v any
				if json.Unmarshal(b, &v) == nil {
					m[c] = v
				} else {
					m[c] = string(b)
				}
			} else {
				m[c] = vals[i]
			}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
func (a *App) registry(w http.ResponseWriter, r *http.Request) error {
	if _, e := a.admin(r); e != nil {
		return e
	}
	jsonResponse(w, map[string]any{"types": Types, "bindings": Bindings})
	return nil
}
func (a *App) scenarios(w http.ResponseWriter, r *http.Request) error {
	if _, e := a.admin(r); e != nil {
		return e
	}
	rows, e := a.db.QueryContext(r.Context(), `SELECT c.*,v.number,v.status,v.updated_at,v.published_at,jsonb_array_length(v.graph->'questions') AS question_count FROM questionnaire_scenarios c LEFT JOIN questionnaire_versions v ON v.id=coalesce((SELECT id FROM questionnaire_versions WHERE scenario_id=c.id AND status='DRAFT'),c.current_version_id) ORDER BY c.code`)
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
func (a *App) createScenario(w http.ResponseWriter, r *http.Request) error {
	u, e := a.admin(r)
	if e != nil {
		return e
	}
	var in struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	if e = readJSON(w, r, &in); e != nil {
		return e
	}
	if !regexp.MustCompile(`^[A-Z][A-Z_0-9]{2,63}$`).MatchString(in.Code) || in.Name == "" {
		return fail(422, "INVALID_SCENARIO", "Укажите название и код: A–Z, 0–9, _")
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	id, vid := newID(), newID()
	res, e := tx.ExecContext(r.Context(), "INSERT INTO questionnaire_scenarios(id,code,name) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING", id, in.Code, in.Name)
	if e != nil {
		return e
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fail(409, "CODE_EXISTS", "Код уже существует")
	}
	g := Graph{Sections: []Section{{Code: "general", Name: "Основные данные"}}, Questions: []Question{}, ShowReview: true}
	b, _ := json.Marshal(g)
	if _, e = tx.ExecContext(r.Context(), "INSERT INTO questionnaire_versions(id,scenario_id,number,status,graph,created_by) VALUES($1,$2,1,'DRAFT',$3,$4)", vid, id, b, u.ID); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]string{"id": id})
	return nil
}
func (a *App) scenarioDetail(w http.ResponseWriter, r *http.Request) error {
	if _, e := a.admin(r); e != nil {
		return e
	}
	rows, e := a.db.QueryContext(r.Context(), "SELECT * FROM questionnaire_versions WHERE scenario_id=$1 ORDER BY number DESC", r.PathValue("id"))
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
func (a *App) createDraft(w http.ResponseWriter, r *http.Request) error {
	u, e := a.admin(r)
	if e != nil {
		return e
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	sid := r.PathValue("id")
	var exists string
	if e = tx.QueryRowContext(r.Context(), "SELECT id FROM questionnaire_scenarios WHERE id=$1 FOR UPDATE", sid).Scan(&exists); errors.Is(e, sql.ErrNoRows) {
		return fail(404, "NOT_FOUND", "Сценарий не найден")
	} else if e != nil {
		return e
	}
	var draft string
	e = tx.QueryRowContext(r.Context(), "SELECT id FROM questionnaire_versions WHERE scenario_id=$1 AND status='DRAFT'", sid).Scan(&draft)
	if e == nil {
		jsonResponse(w, map[string]string{"id": draft})
		return tx.Commit()
	}
	if !errors.Is(e, sql.ErrNoRows) {
		return e
	}
	var graph []byte
	var number int
	if e = tx.QueryRowContext(r.Context(), "SELECT graph,number+1 FROM questionnaire_versions WHERE scenario_id=$1 ORDER BY number DESC LIMIT 1", sid).Scan(&graph, &number); e != nil {
		return e
	}
	draft = newID()
	if _, e = tx.ExecContext(r.Context(), "INSERT INTO questionnaire_versions(id,scenario_id,number,status,graph,created_by) VALUES($1,$2,$3,'DRAFT',$4,$5)", draft, sid, number, graph, u.ID); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]string{"id": draft})
	return nil
}
func (a *App) saveDraft(w http.ResponseWriter, r *http.Request) error {
	if _, e := a.admin(r); e != nil {
		return e
	}
	var in struct {
		Graph    Graph `json:"graph"`
		Revision int   `json:"revision"`
	}
	if e := readJSON(w, r, &in); e != nil {
		return e
	}
	if len(in.Graph.Questions) > 200 {
		return fail(422, "TOO_MANY_QUESTIONS", "Максимум 200 вопросов")
	}
	b, e := json.Marshal(in.Graph)
	if e != nil {
		return e
	}
	res, e := a.db.ExecContext(r.Context(), "UPDATE questionnaire_versions SET graph=$1,updated_at=now(),revision=revision+1 WHERE id=$2 AND status='DRAFT' AND revision=$3", b, r.PathValue("id"), in.Revision)
	if e != nil {
		return e
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fail(409, "DRAFT_CONFLICT", "Версия опубликована или изменена другим администратором. Обновите страницу.")
	}
	jsonResponse(w, map[string]int{"revision": in.Revision + 1})
	return nil
}
func (a *App) publish(w http.ResponseWriter, r *http.Request) error {
	u, e := a.admin(r)
	if e != nil {
		return e
	}
	var in struct {
		Revision int `json:"revision"`
	}
	if e = readJSON(w, r, &in); e != nil {
		return e
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var sid, code, status string
	var b []byte
	var revision int
	id := r.PathValue("id")
	e = tx.QueryRowContext(r.Context(), "SELECT v.scenario_id,c.code,v.status,v.graph,v.revision FROM questionnaire_versions v JOIN questionnaire_scenarios c ON c.id=v.scenario_id WHERE v.id=$1 FOR UPDATE OF v,c", id).Scan(&sid, &code, &status, &b, &revision)
	if errors.Is(e, sql.ErrNoRows) {
		return fail(404, "NOT_FOUND", "Версия не найдена")
	}
	if e != nil {
		return e
	}
	if status != "DRAFT" || revision != in.Revision {
		return fail(409, "DRAFT_CONFLICT", "Версия изменилась. Обновите страницу.")
	}
	var graph Graph
	if e = json.Unmarshal(b, &graph); e != nil {
		return e
	}
	if e = graph.Validate(code); e != nil {
		return fail(422, "INVALID_SCENARIO", e.Error())
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_versions SET status='ARCHIVED' WHERE scenario_id=$1 AND status='PUBLISHED'", sid); e != nil {
		return e
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_versions SET status='PUBLISHED',published_at=now(),published_by=$1,updated_at=now() WHERE id=$2", u.ID, id); e != nil {
		return e
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_scenarios SET current_version_id=$1 WHERE id=$2", id, sid); e != nil {
		return e
	}
	if _, e = tx.ExecContext(r.Context(), "INSERT INTO audit_events(id,actor_id,version_id,action) VALUES($1,$2,$3,'PUBLISHED')", newID(), u.ID, id); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]bool{"ok": true})
	return nil
}
func (a *App) previewDraft(w http.ResponseWriter, r *http.Request) error {
	if _, e := a.admin(r); e != nil {
		return e
	}
	var in struct {
		Answers map[string]any `json:"answers"`
		Key     string         `json:"key"`
		Value   any            `json:"value"`
	}
	if e := readJSON(w, r, &in); e != nil {
		return e
	}
	var b []byte
	if e := a.db.QueryRowContext(r.Context(), "SELECT graph FROM questionnaire_versions WHERE id=$1", r.PathValue("id")).Scan(&b); e != nil {
		return e
	}
	var g Graph
	if e := json.Unmarshal(b, &g); e != nil {
		return e
	}
	if in.Answers == nil {
		in.Answers = map[string]any{}
	}
	if in.Key != "" {
		questions, _ := g.Effective(in.Answers)
		found := false
		for _, q := range questions {
			if q.Key == in.Key {
				found = true
				if q.Type == "PASSWORD" {
					if _, e := validateAnswer(q, in.Value); e != nil {
						return fail(422, "INVALID_ANSWER", e.Error())
					}
					in.Answers[q.Key] = "••••••••"
				} else if q.Type == "PHOTO_UPLOAD" || q.Type == "FILE_UPLOAD" {
					// Preview never creates files or domain entities.
					in.Answers[q.Key] = []any{}
				} else {
					v, e := validateAnswer(q, in.Value)
					if e != nil {
						return fail(422, "INVALID_ANSWER", e.Error())
					}
					in.Answers[q.Key] = v
				}
			}
		}
		if !found {
			return fail(422, "QUESTION_HIDDEN", "Вопрос недоступен")
		}
	}
	s := &Session{ID: "preview", VersionID: r.PathValue("id"), Graph: g, Answers: in.Answers, Status: "IN_PROGRESS"}
	for _, q := range g.Questions {
		if q.Type == "PASSWORD" && in.Answers[q.Key] != nil {
			s.Credential = "preview"
		}
	}
	s.calculate()
	jsonResponse(w, s)
	return nil
}

func (a *App) organizations(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	rows, e := a.db.QueryContext(r.Context(), "SELECT id,type,inn,kpp,ogrn,ogrnip,short_name,full_name,legal_address,director_name FROM organizations WHERE owner_id=$1 ORDER BY created_at", u.ID)
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
func (a *App) points(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	rows, e := a.db.QueryContext(r.Context(), "SELECT p.id,p.name,p.formatted_address,p.city,p.status AS point_status,p.created_at,a.id AS application_id,a.status,a.session_id FROM points p JOIN point_applications a ON a.point_id=p.id WHERE p.owner_id=$1 ORDER BY p.created_at DESC", u.ID)
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
func (a *App) applications(w http.ResponseWriter, r *http.Request) error {
	if _, e := a.admin(r); e != nil {
		return e
	}
	q := r.URL.Query()
	for _, key := range []string{"from", "to"} {
		if q.Get(key) != "" {
			if _, e := validateAnswer(Question{Type: "DATE"}, q.Get(key)); e != nil {
				return fail(422, "INVALID_DATE", "Некорректная дата фильтра")
			}
		}
	}
	rows, e := a.db.QueryContext(r.Context(), `SELECT a.id,a.status,a.created_at,p.name,p.formatted_address,p.city,o.short_name,o.inn,u.first_name,u.last_name,u.email,u.phone FROM point_applications a JOIN points p ON p.id=a.point_id JOIN organizations o ON o.id=p.organization_id JOIN users u ON u.id=p.owner_id WHERE ($1='' OR a.status=$1) AND ($2='' OR p.city ILIKE '%'||$2||'%') AND ($3='' OR concat_ws(' ',p.formatted_address,o.inn,o.short_name,u.first_name,u.last_name,u.email,u.phone) ILIKE '%'||$3||'%') AND (NULLIF($4,'')::date IS NULL OR a.created_at>=NULLIF($4,'')::date) AND (NULLIF($5,'')::date IS NULL OR a.created_at<NULLIF($5,'')::date+interval '1 day') ORDER BY a.created_at DESC LIMIT 200`, q.Get("status"), q.Get("city"), q.Get("search"), q.Get("from"), q.Get("to"))
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
func (a *App) applicationDetail(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	var sid string
	e = a.db.QueryRowContext(r.Context(), "SELECT a.session_id FROM point_applications a JOIN points p ON p.id=a.point_id WHERE a.id=$1 AND (p.owner_id=$2 OR $3='admin')", r.PathValue("id"), u.ID, u.Role).Scan(&sid)
	if errors.Is(e, sql.ErrNoRows) {
		return fail(404, "NOT_FOUND", "Заявка не найдена")
	}
	if e != nil {
		return e
	}
	rows, e := a.db.QueryContext(r.Context(), `SELECT to_jsonb(a) AS application,to_jsonb(p) AS point,to_jsonb(o) AS organization,jsonb_build_object('id',u.id,'first_name',u.first_name,'last_name',u.last_name,'email',u.email,'phone',u.phone) AS owner FROM point_applications a JOIN points p ON p.id=a.point_id JOIN organizations o ON o.id=p.organization_id JOIN users u ON u.id=p.owner_id WHERE a.id=$1`, r.PathValue("id"))
	if e != nil {
		return e
	}
	out, e := rowsJSON(rows)
	if e != nil {
		return e
	}
	s, e := a.loadSession(r.Context(), a.db, sid, false)
	if e != nil {
		return e
	}
	rows, e = a.db.QueryContext(r.Context(), "SELECT e.action,e.comment,e.created_at,u.first_name,u.last_name FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id WHERE application_id=$1 ORDER BY e.created_at", r.PathValue("id"))
	if e != nil {
		return e
	}
	events, e := rowsJSON(rows)
	if e != nil {
		return e
	}
	rows, e = a.db.QueryContext(r.Context(), "SELECT id,mime,category,original_name FROM attachments WHERE point_id=$1", out[0]["point"].(map[string]any)["id"])
	if e != nil {
		return e
	}
	files, e := rowsJSON(rows)
	if e != nil {
		return e
	}
	jsonResponse(w, map[string]any{"data": out[0], "session": publicSession(s), "events": events, "files": files})
	return nil
}
func (a *App) moderate(w http.ResponseWriter, r *http.Request) error {
	u, e := a.admin(r)
	if e != nil {
		return e
	}
	var in struct {
		Status  string `json:"status"`
		Comment string `json:"comment"`
	}
	if e = readJSON(w, r, &in); e != nil {
		return e
	}
	if !includes([]string{"APPROVED", "NEEDS_CHANGES", "REJECTED"}, in.Status) || (in.Status != "APPROVED" && in.Comment == "") || len(in.Comment) > 4000 {
		return fail(422, "INVALID_MODERATION", "Выберите действие и укажите комментарий")
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var pid, status string
	e = tx.QueryRowContext(r.Context(), "SELECT point_id,status FROM point_applications WHERE id=$1 FOR UPDATE", r.PathValue("id")).Scan(&pid, &status)
	if errors.Is(e, sql.ErrNoRows) {
		return fail(404, "NOT_FOUND", "Заявка не найдена")
	}
	if e != nil {
		return e
	}
	if status != "IN_REVIEW" {
		return fail(409, "INVALID_TRANSITION", "Решение доступно только для заявки на проверке")
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE point_applications SET status=$1,updated_at=now() WHERE id=$2", in.Status, r.PathValue("id")); e != nil {
		return e
	}
	if in.Status == "APPROVED" {
		if _, e = tx.ExecContext(r.Context(), "UPDATE points SET status='ACTIVE' WHERE id=$1", pid); e != nil {
			return e
		}
	}
	if _, e = tx.ExecContext(r.Context(), "INSERT INTO audit_events(id,actor_id,application_id,action,comment) VALUES($1,$2,$3,$4,$5)", newID(), u.ID, r.PathValue("id"), in.Status, in.Comment); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]bool{"ok": true})
	return nil
}
func (a *App) reopen(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var sid string
	e = tx.QueryRowContext(r.Context(), "SELECT a.session_id FROM point_applications a JOIN points p ON p.id=a.point_id WHERE a.id=$1 AND p.owner_id=$2 AND a.status='NEEDS_CHANGES' FOR UPDATE OF a", r.PathValue("id"), u.ID).Scan(&sid)
	if errors.Is(e, sql.ErrNoRows) {
		return fail(404, "NOT_FOUND", "Заявка недоступна для исправлений")
	}
	if e != nil {
		return e
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_sessions SET status='IN_PROGRESS',updated_at=now() WHERE id=$1", sid); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]string{"session_id": sid})
	return nil
}
