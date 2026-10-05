package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

type Session struct {
	ID         string         `json:"id"`
	UserID     string         `json:"-"`
	Owner      string         `json:"-"`
	VersionID  string         `json:"version_id"`
	Version    int            `json:"version"`
	Code       string         `json:"code"`
	Status     string         `json:"status"`
	EntityID   string         `json:"entity_id"`
	Credential string         `json:"-"`
	Graph      Graph          `json:"graph"`
	Answers    map[string]any `json:"answers"`
	Questions  []Question     `json:"questions"`
	Next       *Question      `json:"next"`
	Preview    map[string]any `json:"preview"`
	Answered   int            `json:"answered"`
	Total      int            `json:"total"`
	Percent    int            `json:"percent"`
}
type querier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func (a *App) loadSession(ctx context.Context, db querier, id string, lock bool) (*Session, error) {
	s := &Session{Answers: map[string]any{}}
	var graph []byte
	q := "SELECT s.id,coalesce(s.user_id,''),s.owner_token_hash,s.scenario_version_id,s.status,coalesce(s.entity_id,''),coalesce(s.credential_hash,''),v.number,v.graph,c.code FROM questionnaire_sessions s JOIN questionnaire_versions v ON v.id=s.scenario_version_id JOIN questionnaire_scenarios c ON c.id=v.scenario_id WHERE s.id=$1"
	if lock {
		q += " FOR UPDATE OF s"
	}
	e := db.QueryRowContext(ctx, q, id).Scan(&s.ID, &s.UserID, &s.Owner, &s.VersionID, &s.Status, &s.EntityID, &s.Credential, &s.Version, &graph, &s.Code)
	if errors.Is(e, sql.ErrNoRows) {
		return nil, fail(404, "NOT_FOUND", "Регистрация не найдена")
	}
	if e != nil {
		return nil, e
	}
	if e = json.Unmarshal(graph, &s.Graph); e != nil {
		return nil, e
	}
	rows, e := db.QueryContext(ctx, "SELECT question_key,value_json FROM questionnaire_answers WHERE session_id=$1 AND active=true", id)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var b []byte
		if e = rows.Scan(&key, &b); e != nil {
			return nil, e
		}
		var v any
		if e = json.Unmarshal(b, &v); e != nil {
			return nil, e
		}
		s.Answers[key] = v
	}
	if e = rows.Err(); e != nil {
		return nil, e
	}
	s.calculate()
	return s, nil
}
func (s *Session) calculate() {
	s.Questions, s.Answers = s.Graph.Effective(s.Answers)
	s.Preview = s.Graph.Bound(s.Answers)
	s.Next = nil
	s.Answered = 0
	s.Total = len(s.Questions)
	for i := range s.Questions {
		q := s.Questions[i]
		_, ok := s.Answers[q.Key]
		if q.Type == "PASSWORD" {
			ok = s.Credential != ""
		}
		if ok {
			s.Answered++
		} else if s.Next == nil {
			copy := q
			s.Next = &copy
		}
	}
	if s.Total > 0 {
		s.Percent = s.Answered * 100 / s.Total
	}
}
func (a *App) owns(r *http.Request, s *Session) error {
	u, _ := a.user(r)
	if s.UserID != "" {
		if u != nil && u.ID == s.UserID {
			return nil
		}
	} else if c, e := r.Cookie("point_registration"); e == nil && digest(c.Value) == s.Owner {
		return nil
	}
	return fail(404, "NOT_FOUND", "Регистрация не найдена")
}
func publicSession(s *Session) *Session {
	c := *s
	c.Graph.Questions = append([]Question(nil), s.Graph.Questions...)
	for i := range c.Graph.Questions {
		c.Graph.Questions[i].AdminNote = ""
	}
	c.Questions = append([]Question(nil), s.Questions...)
	for i := range c.Questions {
		c.Questions[i].AdminNote = ""
	}
	if c.Next != nil {
		q := *c.Next
		q.AdminNote = ""
		c.Next = &q
	}
	if s.Credential != "" {
		c.Answers = map[string]any{}
		for k, v := range s.Answers {
			c.Answers[k] = v
		}
		for _, q := range s.Graph.Questions {
			if q.Type == "PASSWORD" {
				c.Answers[q.Key] = "••••••••"
			}
		}
	}
	return &c
}
func (a *App) activeScenario(w http.ResponseWriter, r *http.Request) error {
	var graph []byte
	var id string
	var number int
	e := a.db.QueryRowContext(r.Context(), "SELECT v.id,v.number,v.graph FROM questionnaire_scenarios c JOIN questionnaire_versions v ON v.id=c.current_version_id WHERE c.code=$1", r.PathValue("code")).Scan(&id, &number, &graph)
	if errors.Is(e, sql.ErrNoRows) {
		return fail(503, "SCENARIO_UNAVAILABLE", "Регистрация временно недоступна. Попробуйте позже.")
	}
	if e != nil {
		return e
	}
	var g Graph
	if e = json.Unmarshal(graph, &g); e != nil {
		return e
	}
	for i := range g.Questions {
		g.Questions[i].AdminNote = ""
	}
	jsonResponse(w, map[string]any{"id": id, "number": number, "graph": g})
	return nil
}
func (a *App) startSession(w http.ResponseWriter, r *http.Request) error {
	if !a.allow("start:"+r.RemoteAddr[:strings.LastIndex(r.RemoteAddr, ":")], 30) {
		return fail(429, "RATE_LIMIT", "Слишком много регистраций. Попробуйте через минуту.")
	}
	var in struct {
		Code    string `json:"code"`
		Restart bool   `json:"restart"`
	}
	if e := readJSON(w, r, &in); e != nil {
		return e
	}
	if !regexp.MustCompile(`^[A-Z][A-Z_0-9]{2,63}$`).MatchString(in.Code) {
		return fail(400, "INVALID_SCENARIO", "Некорректный код сценария")
	}
	u, _ := a.user(r)
	if in.Code != "USER_REGISTRATION" && u == nil {
		return fail(401, "AUTH_REQUIRED", "Войдите в аккаунт")
	}
	if in.Code == "USER_REGISTRATION" && u != nil {
		return fail(409, "ALREADY_REGISTERED", "Вы уже вошли в аккаунт")
	}
	owner := a.owner(w, r)
	uid := ""
	if u != nil {
		uid = u.ID
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	lockOwner := owner
	if uid != "" {
		lockOwner = uid
	}
	if _, e = tx.ExecContext(r.Context(), "SELECT pg_advisory_xact_lock(hashtext($1))", lockOwner+in.Code); e != nil {
		return e
	}
	var existing string
	e = tx.QueryRowContext(r.Context(), "SELECT s.id FROM questionnaire_sessions s JOIN questionnaire_versions v ON v.id=s.scenario_version_id JOIN questionnaire_scenarios c ON c.id=v.scenario_id WHERE c.code=$1 AND s.status='IN_PROGRESS' AND ((s.user_id IS NOT NULL AND s.user_id=$2) OR (s.user_id IS NULL AND s.owner_token_hash=$3)) ORDER BY s.started_at DESC LIMIT 1", in.Code, uid, owner).Scan(&existing)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		return e
	}
	if existing != "" && !in.Restart {
		s, e := a.loadSession(r.Context(), tx, existing, false)
		if e != nil {
			return e
		}
		jsonResponse(w, map[string]any{"session": publicSession(s), "resumed": true})
		return tx.Commit()
	}
	if existing != "" {
		var entity sql.NullString
		if e = tx.QueryRowContext(r.Context(), "SELECT entity_id FROM questionnaire_sessions WHERE id=$1", existing).Scan(&entity); e != nil {
			return e
		}
		if entity.Valid {
			return fail(409, "APPLICATION_EXISTS", "Исправьте существующую заявку перед созданием новой")
		}
		if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_sessions SET status='CANCELLED',credential_hash=NULL,updated_at=now() WHERE id=$1", existing); e != nil {
			return e
		}
	}
	var vid string
	if e = tx.QueryRowContext(r.Context(), "SELECT current_version_id FROM questionnaire_scenarios WHERE code=$1 AND current_version_id IS NOT NULL", in.Code).Scan(&vid); errors.Is(e, sql.ErrNoRows) {
		return fail(503, "SCENARIO_UNAVAILABLE", "Регистрация временно недоступна. Попробуйте позже.")
	} else if e != nil {
		return e
	}
	id := newID()
	if _, e = tx.ExecContext(r.Context(), "INSERT INTO questionnaire_sessions(id,user_id,owner_token_hash,scenario_version_id) VALUES($1,NULLIF($2,''),$3,$4)", id, uid, owner, vid); e != nil {
		return e
	}
	s, e := a.loadSession(r.Context(), tx, id, false)
	if e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]any{"session": publicSession(s), "resumed": false})
	return nil
}
func (a *App) getSession(w http.ResponseWriter, r *http.Request) error {
	s, e := a.loadSession(r.Context(), a.db, r.PathValue("id"), false)
	if e != nil {
		return e
	}
	if e = a.owns(r, s); e != nil {
		return e
	}
	jsonResponse(w, publicSession(s))
	return nil
}
func (a *App) answer(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Key       string `json:"key"`
		Value     any    `json:"value"`
		VersionID string `json:"version_id"`
	}
	if e := readJSON(w, r, &in); e != nil {
		return e
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
	if s.Status != "IN_PROGRESS" {
		return fail(409, "SESSION_CLOSED", "Регистрация завершена или отменена")
	}
	if !a.allow("answers:"+s.Owner, 120) {
		return fail(429, "RATE_LIMIT", "Слишком много ответов. Попробуйте через минуту.")
	}
	if in.VersionID != s.VersionID {
		return fail(409, "VERSION_MISMATCH", "Версия сценария не совпадает. Обновите страницу.")
	}
	var q *Question
	for i := range s.Questions {
		if s.Questions[i].Key == in.Key {
			q = &s.Questions[i]
		}
	}
	if q == nil {
		return fail(400, "QUESTION_HIDDEN", "Вопрос сейчас недоступен")
	}
	v, e := validateAnswer(*q, in.Value)
	if e != nil {
		return &apiError{Status: 422, Code: "INVALID_ANSWER", Message: e.Error(), QuestionKey: q.Key}
	}
	if q.Binding == "user.email" {
		var exists bool
		if e = tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE lower(email)=$1)", v).Scan(&exists); e != nil {
			return e
		}
		if exists {
			return &apiError{Status: 409, Code: "EMAIL_EXISTS", Message: "Этот e-mail уже зарегистрирован", QuestionKey: q.Key}
		}
	}
	if q.Type == "PHOTO_UPLOAD" || q.Type == "FILE_UPLOAD" {
		if e = a.validateFiles(r.Context(), tx, s.ID, *q, v); e != nil {
			return e
		}
	}
	if q.Type == "PASSWORD" {
		h, e := bcrypt.GenerateFromPassword([]byte(v.(string)), 12)
		if e != nil {
			return e
		}
		s.Credential = string(h)
		if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_sessions SET credential_hash=$1 WHERE id=$2", s.Credential, s.ID); e != nil {
			return e
		}
	} else {
		b, _ := json.Marshal(v)
		if _, e = tx.ExecContext(r.Context(), "INSERT INTO questionnaire_answers(session_id,question_key,value_json) VALUES($1,$2,$3) ON CONFLICT(session_id,question_key) DO UPDATE SET value_json=excluded.value_json,active=true,updated_at=now()", s.ID, q.Key, b); e != nil {
			return e
		}
		var canonical any
		_ = json.Unmarshal(b, &canonical)
		s.Answers[q.Key] = canonical
	}
	s.calculate()
	for _, question := range s.Graph.Questions {
		active := false
		for _, v := range s.Questions {
			if question.Key == v.Key {
				active = true
				break
			}
		}
		if !active {
			if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_answers SET active=false,updated_at=now() WHERE session_id=$1 AND question_key=$2", s.ID, question.Key); e != nil {
				return e
			}
		}
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_sessions SET updated_at=now() WHERE id=$1", s.ID); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, publicSession(s))
	return nil
}
func (a *App) validateFiles(ctx context.Context, db querier, sid string, q Question, v any) error {
	refs, _ := decodeValue[[]FileRef](v)
	for _, f := range refs {
		var exists bool
		if e := db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM attachments WHERE id=$1 AND session_id=$2 AND question_key=$3 AND category=$4)", f.ID, sid, q.Key, f.Category).Scan(&exists); e != nil {
			return e
		}
		if !exists {
			return fail(422, "INVALID_ATTACHMENT", "Файл недоступен или относится к другой регистрации")
		}
	}
	return nil
}
func (a *App) cancelSession(w http.ResponseWriter, r *http.Request) error {
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
	if s.Status != "IN_PROGRESS" || s.EntityID != "" {
		return fail(409, "SESSION_CLOSED", "Эту регистрацию нельзя отменить")
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_sessions SET status='CANCELLED',credential_hash=NULL,updated_at=now() WHERE id=$1", s.ID); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]bool{"ok": true})
	return nil
}
func (a *App) complete(w http.ResponseWriter, r *http.Request) error {
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
	if s.Status == "COMPLETED" {
		jsonResponse(w, map[string]any{"entity_id": s.EntityID, "code": s.Code})
		return nil
	}
	if s.Status != "IN_PROGRESS" {
		return fail(409, "SESSION_CLOSED", "Регистрация отменена")
	}
	for _, q := range s.Questions {
		if q.Type == "PASSWORD" {
			if s.Credential == "" {
				return fail(422, "REQUIRED", "Укажите пароль")
			}
			continue
		}
		v, ok := s.Answers[q.Key]
		if !ok && q.Required {
			return &apiError{Status: 422, Code: "REQUIRED", Message: "Ответьте на обязательный вопрос", QuestionKey: q.Key}
		}
		if ok {
			if _, e = validateAnswer(q, v); e != nil {
				return &apiError{Status: 422, Code: "INVALID_ANSWER", Message: e.Error(), QuestionKey: q.Key}
			}
			if q.Type == "PHOTO_UPLOAD" || q.Type == "FILE_UPLOAD" {
				if e = a.validateFiles(r.Context(), tx, s.ID, q, v); e != nil {
					return e
				}
			}
		}
	}
	b := s.Preview
	id, token := "", ""
	if s.Code == "USER_REGISTRATION" {
		id = newID()
		result, e := tx.ExecContext(r.Context(), "INSERT INTO users(id,first_name,last_name,phone,email,password_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", id, b["user.first_name"], b["user.last_name"], b["user.phone"], b["user.email"], s.Credential)
		if e != nil {
			return e
		}
		n, _ := result.RowsAffected()
		if n == 0 {
			return fail(409, "EMAIL_EXISTS", "Этот e-mail уже зарегистрирован")
		}
		token, e = a.authToken(r.Context(), tx, id)
		if e != nil {
			return e
		}
		if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_sessions SET user_id=$1 WHERE id=$2", id, s.ID); e != nil {
			return e
		}
	} else if s.Code == "POINT_REGISTRATION" {
		u, e := a.user(r)
		if e != nil {
			return e
		}
		id, e = a.savePoint(r.Context(), tx, s, u)
		if e != nil {
			return e
		}
	} else {
		// Generic questionnaires complete without creating an operational entity.
		id = s.ID
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE questionnaire_sessions SET status='COMPLETED',entity_id=$1,credential_hash=NULL,updated_at=now(),completed_at=now() WHERE id=$2", id, s.ID); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	if token != "" {
		a.cookie(w, "point_auth", token, 30*86400)
	}
	jsonResponse(w, map[string]any{"entity_id": id, "code": s.Code})
	return nil
}
func (a *App) savePoint(ctx context.Context, tx *sql.Tx, s *Session, u *User) (string, error) {
	b := s.Preview
	get := func(key string) string { return stringValue(b[key]) }
	org, e := decodeValue[OrganizationData](b["organization.inn"])
	if e != nil {
		return "", e
	}
	if (get("organization.type") == "ip" && len(org.INN) != 12) || (get("organization.type") == "ooo" && len(org.INN) != 10) {
		return "", fail(422, "ORGANIZATION_TYPE", "Тип организации не соответствует ИНН")
	}
	if v := get("organization.kpp"); v != "" {
		org.KPP = v
	}
	if v := get("organization.ogrn"); v != "" {
		org.OGRN = v
	}
	if v := get("organization.ogrnip"); v != "" {
		org.OGRNIP = v
	}
	if v := get("organization.name"); v != "" {
		org.ShortName = v
	}
	if v := get("organization.director_name"); v != "" {
		org.DirectorName = v
	}
	if _, e = validateAnswer(Question{Type: "INN_LOOKUP", Required: true}, org); e != nil {
		return "", fail(422, "INVALID_ORGANIZATION", e.Error())
	}
	oid := newID()
	e = tx.QueryRowContext(ctx, "INSERT INTO organizations(id,owner_id,type,inn,kpp,ogrn,ogrnip,short_name,full_name,legal_address,director_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(owner_id,inn) DO UPDATE SET type=excluded.type,kpp=excluded.kpp,ogrn=excluded.ogrn,ogrnip=excluded.ogrnip,short_name=excluded.short_name,full_name=excluded.full_name,legal_address=excluded.legal_address,director_name=excluded.director_name RETURNING id", oid, u.ID, get("organization.type"), org.INN, org.KPP, org.OGRN, org.OGRNIP, org.ShortName, org.FullName, org.LegalAddress, org.DirectorName).Scan(&oid)
	if e != nil {
		return "", e
	}
	address, e := decodeValue[Address](b["point.address"])
	if e != nil {
		return "", e
	}
	contactSelf := b["point.contact_is_owner"] == true || get("point.contact_is_owner") == "SELF"
	name, phone, email := get("point.contact_name"), get("point.contact_phone"), get("point.contact_email")
	if contactSelf {
		name = strings.TrimSpace(u.FirstName + " " + u.LastName)
		phone = u.Phone
		email = u.Email
		if !phonePattern.MatchString(phone) {
			return "", &apiError{Status: 422, Code: "PROFILE_PHONE_REQUIRED", Message: "Вы выбрали себя контактным лицом. Укажите номер телефона в профиле, затем отправьте заявку.", QuestionKey: "contact_owner"}
		}
	}
	if name == "" || !phonePattern.MatchString(phone) {
		return "", fail(422, "CONTACT_REQUIRED", "Укажите имя и телефон контактного лица")
	}
	pid := newID()
	aid := s.EntityID
	if aid != "" {
		var status string
		if e = tx.QueryRowContext(ctx, "SELECT point_id,status FROM point_applications WHERE id=$1 FOR UPDATE", aid).Scan(&pid, &status); e != nil {
			return "", e
		}
		if status != "NEEDS_CHANGES" {
			return "", fail(409, "APPLICATION_LOCKED", "Заявка недоступна для редактирования")
		}
	} else {
		aid = newID()
	}
	operations, _ := json.Marshal(b["point.operations"])
	schedule, _ := json.Marshal(b["point.schedule"])
	c := address.Components
	_, e = tx.ExecContext(ctx, `INSERT INTO points(id,organization_id,owner_id,name,formatted_address,country,region,city,street,house,building,postal_code,address_latitude,address_longitude,entrance_latitude,entrance_longitude,entrance_type,courier_comment,premise_type,operations,storage_capacity,max_parcel_weight,schedule,contact_is_owner,contact_name,contact_phone,contact_email)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
 ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,name=excluded.name,formatted_address=excluded.formatted_address,country=excluded.country,region=excluded.region,city=excluded.city,street=excluded.street,house=excluded.house,building=excluded.building,postal_code=excluded.postal_code,address_latitude=excluded.address_latitude,address_longitude=excluded.address_longitude,entrance_latitude=excluded.entrance_latitude,entrance_longitude=excluded.entrance_longitude,entrance_type=excluded.entrance_type,courier_comment=excluded.courier_comment,premise_type=excluded.premise_type,operations=excluded.operations,storage_capacity=excluded.storage_capacity,max_parcel_weight=excluded.max_parcel_weight,schedule=excluded.schedule,contact_is_owner=excluded.contact_is_owner,contact_name=excluded.contact_name,contact_phone=excluded.contact_phone,contact_email=excluded.contact_email`, pid, oid, u.ID, "Point · "+address.Address, address.Address, c.Country, c.Region, c.City, c.Street, c.House, c.Building, c.PostalCode, address.AddressLatitude, address.AddressLongitude, address.EntranceLatitude, address.EntranceLongitude, get("point.entrance_type"), get("point.courier_comment"), get("point.premise_type"), operations, get("point.storage_capacity"), get("point.max_parcel_weight"), schedule, contactSelf, name, phone, email)
	if e != nil {
		return "", e
	}
	if _, e = tx.ExecContext(ctx, "INSERT INTO point_applications(id,point_id,session_id,status) VALUES($1,$2,$3,'IN_REVIEW') ON CONFLICT(id) DO UPDATE SET status='IN_REVIEW',updated_at=now()", aid, pid, s.ID); e != nil {
		return "", e
	}
	if _, e = tx.ExecContext(ctx, "UPDATE attachments SET point_id=NULL WHERE session_id=$1", s.ID); e != nil {
		return "", e
	}
	for _, q := range s.Questions {
		if q.Type == "PHOTO_UPLOAD" || q.Type == "FILE_UPLOAD" {
			refs, _ := decodeValue[[]FileRef](s.Answers[q.Key])
			for _, ref := range refs {
				if _, e = tx.ExecContext(ctx, "UPDATE attachments SET point_id=$1 WHERE id=$2 AND session_id=$3", pid, ref.ID, s.ID); e != nil {
					return "", e
				}
			}
		}
	}
	if _, e = tx.ExecContext(ctx, "INSERT INTO audit_events(id,actor_id,application_id,action) VALUES($1,$2,$3,'IN_REVIEW')", newID(), u.ID, aid); e != nil {
		return "", e
	}
	return aid, nil
}
