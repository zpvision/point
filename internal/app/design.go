package app

import (
	"crypto/subtle"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"html"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

//go:embed design-documents/*.json
var designDocuments embed.FS

func designDocument(name string) json.RawMessage {
	b, e := designDocuments.ReadFile("design-documents/" + name + ".json")
	if e != nil {
		panic(e)
	}
	return b
}
func designVersion(name string) string {
	var d struct {
		Version string `json:"version"`
	}
	_ = json.Unmarshal(designDocument(name), &d)
	return d.Version
}
func (a *App) designRoutes(m *http.ServeMux) {
	route := func(p string, h endpoint) { m.HandleFunc(p, a.handle(h)) }
	route("GET /api/market", a.marketGet)
	route("POST /api/market", a.marketPost)
	route("GET /api/photo/{id}", a.marketPhoto)
	route("GET /api/point-consent/status", func(w http.ResponseWriter, r *http.Request) error {
		uid := ""
		if u, _ := a.user(r); u != nil {
			uid = u.ID
		}
		jsonResponse(w, map[string]bool{"accepted": a.requireDesignConsent(r, uid) == nil})
		return nil
	})
	route("GET /api/point-consent", a.designConsent)
	route("POST /api/point-consent", a.designConsent)
	route("GET /api/cabinet/points", a.designDrafts)
	route("PUT /api/cabinet/points", a.designDrafts)
	route("GET /api/cabinet/profile", a.designProfile)
	route("PUT /api/cabinet/profile", a.designProfile)
	route("GET /api/point-registration", func(w http.ResponseWriter, r *http.Request) error {
		if _, e := a.user(r); e != nil {
			return e
		}
		jsonResponse(w, map[string]any{"application": nil})
		return nil
	})
	route("GET /api/cabinet/offer", a.designOffer)
	route("POST /api/cabinet/offer", a.designOffer)
	route("GET /api/cabinet/plans", a.designPlan)
	route("PUT /api/cabinet/plans", a.designPlan)
	route("GET /api/cabinet/operations", a.designOperations)
	route("POST /api/integrations/point-events", a.designEvent)
	route("GET /legal/{document}", a.designLegal)
}
func (a *App) designConsent(w http.ResponseWriter, r *http.Request) error {
	if r.Method == "GET" {
		jsonResponse(w, designDocument("consent"))
		return nil
	}
	var in struct {
		Accepted bool   `json:"accepted"`
		Read     bool   `json:"readToEnd"`
		Version  string `json:"version"`
	}
	if e := readJSON(w, r, &in); e != nil {
		return e
	}
	if !in.Accepted || !in.Read || in.Version != designVersion("consent") {
		return fail(400, "CONSENT_REQUIRED", "Прочитайте актуальное согласие до конца и подтвердите его")
	}
	token, uid := newID(), ""
	if u, _ := a.user(r); u != nil {
		uid = u.ID
	}
	_, e := a.db.ExecContext(r.Context(), "INSERT INTO point_consents(token_hash,owner_id,version,document,expires_at) VALUES($1,NULLIF($2,''),$3,$4,now()+interval '365 days')", digest(token), uid, in.Version, designDocument("consent"))
	if e != nil {
		return e
	}
	http.SetCookie(w, &http.Cookie{Name: "point_consent", Value: token, Path: "/", HttpOnly: true, Secure: a.env != "development", SameSite: http.SameSiteLaxMode, MaxAge: 365 * 86400})
	jsonResponse(w, map[string]bool{"accepted": true})
	return nil
}
func (a *App) requireDesignConsent(r *http.Request, uid string) error {
	c, e := r.Cookie("point_consent")
	if e != nil {
		return fail(403, "CONSENT_REQUIRED", "Подтвердите согласие на обработку персональных данных")
	}
	result, e := a.db.ExecContext(r.Context(), "UPDATE point_consents SET owner_id=COALESCE(owner_id,NULLIF($1,'')) WHERE token_hash=$2 AND version=$3 AND expires_at>now() AND (owner_id IS NULL OR owner_id=$1)", uid, digest(c.Value), designVersion("consent"))
	if e != nil {
		return e
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fail(403, "CONSENT_REQUIRED", "Подтвердите актуальное согласие на обработку персональных данных")
	}
	return nil
}
func (a *App) ownDesignPoint(r *http.Request, id string) (*User, error) {
	u, e := a.user(r)
	if e != nil {
		return nil, e
	}
	var ok bool
	e = a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM questionnaire_sessions s JOIN questionnaire_versions v ON v.id=s.scenario_version_id JOIN questionnaire_scenarios c ON c.id=v.scenario_id WHERE s.id=$1 AND s.user_id=$2 AND c.code='POINT_REGISTRATION' AND s.status<>'CANCELLED')", id, u.ID).Scan(&ok)
	if e != nil {
		return nil, e
	}
	if !ok {
		return nil, fail(404, "NOT_FOUND", "Точка не найдена")
	}
	return u, nil
}
func (a *App) designDrafts(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	if r.Method == "GET" {
		rows, e := a.db.QueryContext(r.Context(), `SELECT d.id,d.data,CASE WHEN s.status='COMPLETED' THEN 'ready' ELSE 'draft' END status,d.updated_at AS updated FROM cabinet_drafts d JOIN questionnaire_sessions s ON s.id=d.id WHERE d.owner_id=$1 AND s.status<>'CANCELLED' ORDER BY d.updated_at DESC`, u.ID)
		if e != nil {
			return e
		}
		items, e := rowsJSON(rows)
		if e != nil {
			return e
		}
		jsonResponse(w, items)
		return nil
	}
	if e = a.requireDesignConsent(r, u.ID); e != nil {
		return e
	}
	var in struct {
		ID      string          `json:"id"`
		Data    json.RawMessage `json:"data"`
		Status  string          `json:"status"`
		Updated string          `json:"updated"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64000)
	if e = readJSON(w, r, &in); e != nil {
		return e
	}
	if !regexp.MustCompile(`^[a-zA-Z0-9-]{20,64}$`).MatchString(in.ID) || len(in.Data) == 0 || len(in.Data) > 60000 || in.Data[0] != '{' {
		return fail(400, "INVALID_DRAFT", "Некорректная заявка")
	}
	var data map[string]any
	if json.Unmarshal(in.Data, &data) != nil {
		return fail(400, "INVALID_DRAFT", "Некорректная заявка")
	}
	step, ok := data["step"].(float64)
	if !ok || step < 0 || step > 12 || step != float64(int(step)) {
		return fail(400, "INVALID_DRAFT", "Некорректный шаг заявки")
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(r.Context(), "SELECT pg_advisory_xact_lock(hashtext($1))", "cabinet-draft:"+in.ID); e != nil {
		return e
	}
	var owner, status, code string
	e = tx.QueryRowContext(r.Context(), "SELECT coalesce(s.user_id,''),s.status,c.code FROM questionnaire_sessions s JOIN questionnaire_versions v ON v.id=s.scenario_version_id JOIN questionnaire_scenarios c ON c.id=v.scenario_id WHERE s.id=$1 FOR UPDATE OF s", in.ID).Scan(&owner, &status, &code)
	if errors.Is(e, sql.ErrNoRows) {
		var vid string
		if e = tx.QueryRowContext(r.Context(), "SELECT current_version_id FROM questionnaire_scenarios WHERE code='POINT_REGISTRATION'").Scan(&vid); e != nil {
			return e
		}
		_, e = tx.ExecContext(r.Context(), "INSERT INTO questionnaire_sessions(id,user_id,owner_token_hash,scenario_version_id) VALUES($1,$2,$3,$4)", in.ID, u.ID, digest(newID()), vid)
		if e != nil {
			return e
		}
		status = "IN_PROGRESS"
	} else if e != nil {
		return e
	} else if owner != u.ID || code != "POINT_REGISTRATION" {
		return fail(404, "NOT_FOUND", "Точка не найдена")
	}
	if status != "IN_PROGRESS" {
		return fail(409, "SESSION_CLOSED", "Заявка уже отправлена. Изменения доступны после возврата на доработку.")
	}
	if in.Status == "ready" {
		return fail(409, "USE_COMPLETION", "Отправьте заявку через проверку регистрации")
	}
	var photos struct {
		Photos []struct {
			ID string `json:"id"`
		} `json:"photos"`
	}
	_ = json.Unmarshal(in.Data, &photos)
	for _, p := range photos.Photos {
		var own bool
		if e = tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM attachments WHERE id=$1 AND session_id=$2)", p.ID, in.ID).Scan(&own); e != nil {
			return e
		}
		if !own {
			return fail(422, "INVALID_ATTACHMENT", "Фотография относится к другой заявке")
		}
	}
	_, e = tx.ExecContext(r.Context(), `INSERT INTO cabinet_drafts(id,owner_id,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=now() WHERE cabinet_drafts.owner_id=excluded.owner_id`, in.ID, u.ID, in.Data)
	if e != nil {
		return e
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_sessions SET updated_at=now() WHERE id=$1", in.ID); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]any{"id": in.ID, "data": data, "status": "draft", "updated": time.Now().UTC().Format(time.RFC3339Nano)})
	return nil
}
func (a *App) designProfile(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	if r.Method == "PUT" {
		if e = a.requireDesignConsent(r, u.ID); e != nil {
			return e
		}
		var in struct {
			Name  string `json:"name"`
			Phone string `json:"phone"`
		}
		if e = readJSON(w, r, &in); e != nil {
			return e
		}
		in.Name = strings.TrimSpace(in.Name)
		if len([]rune(in.Name)) < 1 || len([]rune(in.Name)) > 150 {
			return fail(422, "INVALID_PROFILE", "Укажите имя и фамилию")
		}
		phone := normalizePhone(in.Phone)
		if phone != "" && !phonePattern.MatchString(phone) {
			return fail(422, "INVALID_PHONE", "Укажите телефон с кодом страны")
		}
		parts := strings.SplitN(in.Name, " ", 2)
		last := ""
		if len(parts) > 1 {
			last = parts[1]
		}
		_, e = a.db.ExecContext(r.Context(), "UPDATE users SET first_name=$1,last_name=$2,phone_verified_at=CASE WHEN phone=$3 THEN phone_verified_at ELSE NULL END,phone=$3 WHERE id=$4", parts[0], last, phone, u.ID)
		if e != nil {
			return e
		}
		u.FirstName = parts[0]
		u.LastName = last
		u.Phone = phone
	}
	jsonResponse(w, map[string]string{"name": strings.TrimSpace(u.FirstName + " " + u.LastName), "phone": u.Phone, "email": u.Email})
	return nil
}
func (a *App) designOffer(w http.ResponseWriter, r *http.Request) error {
	id, version := r.URL.Query().Get("pointId"), designVersion("offer")
	if r.Method == "POST" {
		var in struct {
			PointID  string `json:"pointId"`
			Version  string `json:"version"`
			Reviewed bool   `json:"reviewed"`
			Read     bool   `json:"readToEnd"`
		}
		if e := readJSON(w, r, &in); e != nil {
			return e
		}
		id = in.PointID
		if in.Version != version || !in.Reviewed || !in.Read {
			return fail(400, "OFFER_REQUIRED", "Прочитайте актуальный проект оферты до конца")
		}
	}
	u, e := a.ownDesignPoint(r, id)
	if e != nil {
		return e
	}
	if r.Method == "POST" {
		if e = a.requireDesignConsent(r, u.ID); e != nil {
			return e
		}
		_, e = a.db.ExecContext(r.Context(), "INSERT INTO point_offer_reviews(point_id,owner_id,version,document) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", id, u.ID, version, designDocument("offer"))
		if e != nil {
			return e
		}
	}
	var at time.Time
	var review any
	e = a.db.QueryRowContext(r.Context(), "SELECT reviewed_at FROM point_offer_reviews WHERE point_id=$1 AND owner_id=$2 AND version=$3", id, u.ID, version).Scan(&at)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		return e
	}
	if e == nil {
		review = map[string]any{"reviewed_at": at}
	}
	jsonResponse(w, map[string]any{"document": designDocument("offer"), "review": review, "canStart": false})
	return nil
}
func (a *App) requireDesignSessionConsent(r *http.Request, s *Session) error {
	var design bool
	if e := a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM cabinet_drafts WHERE id=$1)", s.ID).Scan(&design); e != nil {
		return e
	}
	if design {
		return a.requireDesignConsent(r, s.UserID)
	}
	return nil
}
func (a *App) designCompletionCheck(r *http.Request, s *Session) error {
	var design bool
	if e := a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM cabinet_drafts WHERE id=$1)", s.ID).Scan(&design); e != nil {
		return e
	}
	if !design {
		return nil
	}
	if e := a.requireDesignConsent(r, s.UserID); e != nil {
		return e
	}
	var reviewed bool
	if e := a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM point_offer_reviews WHERE point_id=$1 AND owner_id=$2 AND version=$3)", s.ID, s.UserID, designVersion("offer")).Scan(&reviewed); e != nil {
		return e
	}
	if !reviewed {
		return fail(403, "OFFER_REQUIRED", "Ознакомьтесь с проектом оферты перед завершением заявки")
	}
	return nil
}

var regexpID = regexp.MustCompile(`^[a-zA-Z0-9-]{20,64}$`)
var designMonth = regexp.MustCompile(`^20\d{2}-(0[1-9]|1[0-2])$`)

func (a *App) designPlan(w http.ResponseWriter, r *http.Request) error {
	id, month := r.URL.Query().Get("pointId"), r.URL.Query().Get("month")
	var data map[string]any
	if r.Method == "PUT" {
		if e := readJSON(w, r, &data); e != nil {
			return e
		}
		id, _ = data["pointId"].(string)
		month, _ = data["month"].(string)
	}
	if !designMonth.MatchString(month) {
		return fail(400, "INVALID_MONTH", "Проверьте месяц")
	}
	u, e := a.ownDesignPoint(r, id)
	if e != nil {
		return e
	}
	if data != nil {
		if e = a.requireDesignConsent(r, u.ID); e != nil {
			return e
		}
		date, _ := time.Parse("2006-01", month)
		days := float64(date.AddDate(0, 1, -1).Day())
		limits := map[string][2]float64{"workingDays": {1, days}, "acceptPerDay": {0, 10000}, "issuePerDay": {0, 10000}, "storageSlots": {1, 100000}, "averageStorageDays": {1, 90}}
		for key, lim := range limits {
			n, ok := data[key].(float64)
			if !ok || n < lim[0] || n > lim[1] || n != float64(int(n)) {
				return fail(422, "INVALID_PLAN", "Проверьте рабочие дни и значения плана")
			}
		}
		b, _ := json.Marshal(data)
		_, e = a.db.ExecContext(r.Context(), "INSERT INTO point_plans(point_id,month,data) VALUES($1,$2,$3) ON CONFLICT(point_id,month) DO UPDATE SET data=excluded.data,updated_at=now()", id, month, b)
		if e != nil {
			return e
		}
	}
	var b []byte
	var at time.Time
	var plan any
	e = a.db.QueryRowContext(r.Context(), "SELECT data,updated_at FROM point_plans WHERE point_id=$1 AND month=$2", id, month).Scan(&b, &at)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		return e
	}
	if e == nil {
		plan = json.RawMessage(b)
	}
	jsonResponse(w, map[string]any{"plan": plan, "updatedAt": at})
	return nil
}
func (a *App) designOperations(w http.ResponseWriter, r *http.Request) error {
	id, month := r.URL.Query().Get("pointId"), r.URL.Query().Get("month")
	if !designMonth.MatchString(month) {
		return fail(400, "INVALID_MONTH", "Проверьте месяц")
	}
	if _, e := a.ownDesignPoint(r, id); e != nil {
		return e
	}
	var accrued, paid, pa, pp, issued int64
	e := a.db.QueryRowContext(r.Context(), `SELECT COALESCE(sum(amount_kopecks) FILTER(WHERE kind='issued'),0),COALESCE(sum(amount_kopecks) FILTER(WHERE kind='paid'),0),COALESCE(sum(amount_kopecks) FILTER(WHERE kind='issued' AND to_char(occurred_at AT TIME ZONE 'Europe/Moscow','YYYY-MM')=$2),0),COALESCE(sum(amount_kopecks) FILTER(WHERE kind='paid' AND to_char(occurred_at AT TIME ZONE 'Europe/Moscow','YYYY-MM')=$2),0),count(*) FILTER(WHERE kind='issued' AND to_char(occurred_at AT TIME ZONE 'Europe/Moscow','YYYY-MM')=$2) FROM point_operation_events WHERE point_id=$1`, id, month).Scan(&accrued, &paid, &pa, &pp, &issued)
	if e != nil {
		return e
	}
	rows, e := a.db.QueryContext(r.Context(), "SELECT id,kind,reference,amount_kopecks,occurred_at FROM point_operation_events WHERE point_id=$1 AND to_char(occurred_at AT TIME ZONE 'Europe/Moscow','YYYY-MM')=$2 ORDER BY occurred_at DESC LIMIT 50", id, month)
	if e != nil {
		return e
	}
	events, e := rowsJSON(rows)
	if e != nil {
		return e
	}
	jsonResponse(w, map[string]any{"totals": map[string]int64{"accrued": accrued, "paid": paid, "balance": accrued - paid}, "period": map[string]int64{"issued": issued, "accrued": pa, "paid": pp}, "events": events})
	return nil
}
func (a *App) designEvent(w http.ResponseWriter, r *http.Request) error {
	secret := os.Getenv("POINT_EVENTS_SECRET")
	provided := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if len(secret) < 32 || subtle.ConstantTimeCompare([]byte(secret), []byte(provided)) != 1 {
		return fail(401, "UNAUTHORIZED", "Недопустимый источник событий")
	}
	var in struct {
		ID        string    `json:"id"`
		PointID   string    `json:"pointId"`
		Kind      string    `json:"kind"`
		Reference string    `json:"reference"`
		Amount    int64     `json:"amount_kopecks"`
		At        time.Time `json:"occurred_at"`
	}
	if e := readJSON(w, r, &in); e != nil {
		return e
	}
	if in.ID == "" || len(in.ID) > 128 || len(in.Reference) > 240 || in.Reference == "" || (in.Kind != "issued" && in.Kind != "paid") || in.Amount < 0 || in.At.IsZero() {
		return fail(422, "INVALID_EVENT", "Проверьте событие")
	}
	var ok bool
	if e := a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM questionnaire_sessions WHERE id=$1 AND status='COMPLETED')", in.PointID).Scan(&ok); e != nil {
		return e
	}
	if !ok {
		return fail(404, "NOT_FOUND", "Точка не найдена")
	}
	result, e := a.db.ExecContext(r.Context(), "INSERT INTO point_operation_events(id,point_id,kind,reference,amount_kopecks,occurred_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", in.ID, in.PointID, in.Kind, in.Reference, in.Amount, in.At)
	if e != nil {
		return e
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		var same bool
		if e = a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM point_operation_events WHERE id=$1 AND point_id=$2 AND kind=$3 AND reference=$4 AND amount_kopecks=$5 AND occurred_at=$6)", in.ID, in.PointID, in.Kind, in.Reference, in.Amount, in.At).Scan(&same); e != nil {
			return e
		}
		if !same {
			return fail(409, "EVENT_CONFLICT", "Событие с таким идентификатором уже отличается")
		}
	}
	jsonResponse(w, map[string]bool{"ok": true})
	return nil
}
func (a *App) designLegal(w http.ResponseWriter, r *http.Request) error {
	kind := r.PathValue("document")
	var title, body string
	if kind == "point-offer" {
		var d struct {
			Title string `json:"title"`
			HTML  string `json:"html"`
		}
		_ = json.Unmarshal(designDocument("offer"), &d)
		title = d.Title
		body = d.HTML
	} else {
		var sections []struct {
			Title string `json:"title"`
			Text  string `json:"text"`
		}
		if kind == "point-consent" {
			var d struct {
				Title    string          `json:"title"`
				Sections json.RawMessage `json:"sections"`
			}
			_ = json.Unmarshal(designDocument("consent"), &d)
			title = d.Title
			_ = json.Unmarshal(d.Sections, &sections)
		} else if kind == "point-privacy" {
			title = "Политика обработки персональных данных"
			_ = json.Unmarshal(designDocument("privacy"), &sections)
		} else {
			return fail(404, "NOT_FOUND", "Документ не найден")
		}
		for _, s := range sections {
			body += "<section translate=\"no\"><h2>" + html.EscapeString(s.Title) + "</h2><p>" + html.EscapeString(s.Text) + "</p></section>"
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, e := w.Write([]byte(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/point-consent.css"><link rel="stylesheet" href="/point-global.css"><title>` + html.EscapeString(title) + `</title></head><body class="point-legal"><main><a class="pc-brand" href="/account">point<span class="point-dot">.</span></a><h1>` + html.EscapeString(title) + `</h1>` + body + `<button onclick="window.print()" class="pc-secondary">Распечатать / сохранить PDF</button></main></body></html>`))
	return e
}
