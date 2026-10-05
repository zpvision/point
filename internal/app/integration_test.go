package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

type harness struct {
	a      *App
	server *httptest.Server
	client *http.Client
	t      *testing.T
}

func integration(t *testing.T) *harness {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	base, e := sql.Open("pgx", dsn)
	if e != nil {
		t.Fatal(e)
	}
	schema := "point_test_" + newID()[:16]
	if _, e = base.Exec("CREATE SCHEMA " + schema); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { _, _ = base.Exec("DROP SCHEMA " + schema + " CASCADE"); _ = base.Close() })
	parsed, e := url.Parse(dsn)
	if e != nil {
		t.Fatal(e)
	}
	q := parsed.Query()
	q.Set("search_path", schema)
	parsed.RawQuery = q.Encode()
	db, e := sql.Open("pgx", parsed.String())
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { _ = db.Close() })
	a := &App{db: db, env: "development", uploadDir: t.TempDir(), rates: map[string]rateEntry{}, lookup: DaDataProvider{}, geo: YandexProvider{}, verification: DisabledVerification{}}
	if e = a.migrate(context.Background()); e != nil {
		t.Fatal(e)
	}
	if e = a.seed(context.Background()); e != nil {
		t.Fatal(e)
	}
	if e = a.seed(context.Background()); e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(a.routes())
	a.origin = server.URL
	t.Cleanup(server.Close)
	jar, _ := cookiejar.New(nil)
	return &harness{a: a, server: server, client: &http.Client{Jar: jar, Timeout: 15 * time.Second}, t: t}
}
func (h *harness) request(method, path string, v any, status int) []byte {
	h.t.Helper()
	var reader io.Reader
	if v != nil {
		b, e := json.Marshal(v)
		if e != nil {
			h.t.Fatal(e)
		}
		reader = bytes.NewReader(b)
	}
	r, e := http.NewRequest(method, h.server.URL+"/api"+path, reader)
	if e != nil {
		h.t.Fatal(e)
	}
	r.Header.Set("Origin", h.server.URL)
	r.Header.Set("Content-Type", "application/json")
	res, e := h.client.Do(r)
	if e != nil {
		h.t.Fatal(e)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != status {
		h.t.Fatalf("%s %s status=%d expected=%d body=%s", method, path, res.StatusCode, status, b)
	}
	return b
}
func (h *harness) start(code string) Session {
	h.t.Helper()
	var out struct {
		Session Session `json:"session"`
	}
	b := h.request("POST", "/registration/sessions", map[string]any{"code": code}, 200)
	if e := json.Unmarshal(b, &out); e != nil {
		h.t.Fatal(e)
	}
	return out.Session
}
func (h *harness) answer(s Session, key string, v any, status int) Session {
	h.t.Helper()
	b := h.request("POST", "/registration/sessions/"+s.ID+"/answers", map[string]any{"key": key, "value": v, "version_id": s.VersionID}, status)
	if status != 200 {
		return s
	}
	var next Session
	if e := json.Unmarshal(b, &next); e != nil {
		h.t.Fatal(e)
	}
	return next
}
func (h *harness) signup(email string) string {
	h.t.Helper()
	s := h.start("USER_REGISTRATION")
	values := map[string]any{"first_name": "Сергей", "last_name": "Данилюк", "phone": "+79991234567", "email": email, "password": "secure-password-12345", "consent": true}
	for s.Next != nil {
		s = h.answer(s, s.Next.Key, values[s.Next.Key], 200)
	}
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 200)
	var id string
	if e := h.a.db.QueryRow("SELECT id FROM users WHERE email=$1", email).Scan(&id); e != nil {
		h.t.Fatal(e)
	}
	return id
}
func (h *harness) upload(s Session, category string) FileRef {
	h.t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("question_key", "photos")
	_ = writer.WriteField("category", category)
	file, e := writer.CreateFormFile("file", category+".png")
	if e != nil {
		h.t.Fatal(e)
	}
	if e = png.Encode(file, image.NewRGBA(image.Rect(0, 0, 2, 2))); e != nil {
		h.t.Fatal(e)
	}
	_ = writer.Close()
	req, _ := http.NewRequest("POST", h.server.URL+"/api/registration/sessions/"+s.ID+"/attachments", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Origin", h.server.URL)
	res, e := h.client.Do(req)
	if e != nil {
		h.t.Fatal(e)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 {
		h.t.Fatalf("upload %d %s", res.StatusCode, b)
	}
	var ref FileRef
	_ = json.Unmarshal(b, &ref)
	return ref
}
func fixtureAnswers() map[string]any {
	days := map[string]Day{}
	for _, d := range []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"} {
		days[d] = Day{Enabled: true, Opening: "09:00", Closing: "19:00"}
	}
	return map[string]any{"organization_type": "ooo", "organization_inn": OrganizationData{INN: "7707083893", KPP: "773601001", OGRN: "1027700132195", ShortName: "Тестовая организация", FullName: "Тестовая организация", LegalAddress: "Москва", DirectorName: "Тестовый Руководитель", Confirmed: true}, "point_address": Address{Address: "Москва, Ленинградский проспект, 36", Components: AddressComponents{Country: "Россия", City: "Москва", Street: "Ленинградский проспект", House: "36"}, AddressLatitude: 55.790, AddressLongitude: 37.560, EntranceLatitude: 55.791, EntranceLongitude: 37.561, MarkerAdjusted: true, Confirmed: true}, "entrance_type": "street", "courier_comment": "Синяя дверь", "premise_type": "shop", "operations": []string{"pickup", "dropoff"}, "capacity": "100", "weight": "20", "schedule": Schedule{Days: days}, "contact_owner": "OTHER", "contact_name": "Иван", "contact_phone": "+79990000000", "contact_email": "ivan@example.com", "parking": true}
}
func (h *harness) fillPoint(s Session) Session {
	values := fixtureAnswers()
	for s.Next != nil {
		q := s.Next
		if q.Type == "PHOTO_UPLOAD" {
			values[q.Key] = []FileRef{h.upload(s, "facade"), h.upload(s, "interior")}
		}
		s = h.answer(s, q.Key, values[q.Key], 200)
	}
	return s
}
func TestIntegrationRegistrationSecurityAndModeration(t *testing.T) {
	h := integration(t)
	uid := h.signup("owner@example.com")
	var count int
	_ = h.a.db.QueryRow("SELECT count(*) FROM questionnaire_answers WHERE question_key='password' OR value_json::text LIKE '%secure-password%'").Scan(&count)
	if count != 0 {
		t.Fatal("password persisted in answers")
	}
	var credential sql.NullString
	_ = h.a.db.QueryRow("SELECT credential_hash FROM questionnaire_sessions WHERE user_id=$1", uid).Scan(&credential)
	if credential.Valid {
		t.Fatal("completed credential retained")
	}
	h.request("GET", "/admin/scenarios", nil, 403)
	s := h.start("POINT_REGISTRATION")
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 422)
	s = h.answer(s, "organization_type", "forged", 422)
	s = h.fillPoint(s)
	if s.Next != nil {
		t.Fatal("flow unfinished")
	}
	s = h.answer(s, "contact_owner", "SELF", 200)
	if _, ok := s.Answers["contact_phone"]; ok {
		t.Fatal("hidden contact retained")
	}
	if s.Percent != 100 {
		t.Fatalf("progress %d", s.Percent)
	}
	resumed := h.start("POINT_REGISTRATION")
	if resumed.ID != s.ID || resumed.VersionID != s.VersionID {
		t.Fatal("resume changed session")
	}
	var complete struct {
		EntityID string `json:"entity_id"`
	}
	_ = json.Unmarshal(h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 200), &complete)
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 200)
	var contact, phone string
	var lat, entrance float64
	_ = h.a.db.QueryRow("SELECT contact_name,contact_phone,address_latitude,entrance_latitude FROM points WHERE owner_id=$1", uid).Scan(&contact, &phone, &lat, &entrance)
	if contact != "Сергей Данилюк" || phone != "+79991234567" || lat == entrance {
		t.Fatalf("domain mapping incorrect %s %s %f %f", contact, phone, lat, entrance)
	}
	h.request("GET", "/applications/"+complete.EntityID, nil, 200)
	h.request("GET", "/points", nil, 200)
	original := h.client
	jar, _ := cookiejar.New(nil)
	h.client = &http.Client{Jar: jar}
	h.signup("other@example.com")
	h.request("GET", "/registration/sessions/"+s.ID, nil, 404)
	h.request("GET", "/applications/"+complete.EntityID, nil, 404)
	h.request("POST", "/admin/applications/"+complete.EntityID+"/moderate", map[string]any{"status": "APPROVED"}, 403)
	h.client = original
	_, e := h.a.db.Exec("UPDATE users SET role='admin' WHERE id=$1", uid)
	if e != nil {
		t.Fatal(e)
	}
	h.request("POST", "/admin/applications/"+complete.EntityID+"/moderate", map[string]any{"status": "NEEDS_CHANGES", "comment": "Уточните вход"}, 200)
	h.request("POST", "/applications/"+complete.EntityID+"/reopen", map[string]any{}, 200)
	s = h.answer(s, "courier_comment", "Справа от аптеки", 200)
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 200)
	h.request("POST", "/admin/applications/"+complete.EntityID+"/moderate", map[string]any{"status": "APPROVED", "comment": ""}, 200)
	h.request("POST", "/admin/applications/"+complete.EntityID+"/moderate", map[string]any{"status": "APPROVED", "comment": ""}, 409)
	var status string
	_ = h.a.db.QueryRow("SELECT status FROM points WHERE owner_id=$1", uid).Scan(&status)
	if status != "ACTIVE" {
		t.Fatal(status)
	}
	var events int
	_ = h.a.db.QueryRow("SELECT count(*) FROM audit_events WHERE application_id=$1", complete.EntityID).Scan(&events)
	if events != 4 {
		t.Fatalf("audit count %d", events)
	}
	next := h.start("POINT_REGISTRATION")
	if next.ID == s.ID {
		t.Fatal("multiple points blocked")
	}
}
func TestIntegrationVersioningCustomQuestionsAndOptions(t *testing.T) {
	h := integration(t)
	uid := h.signup("admin@example.com")
	_, _ = h.a.db.Exec("UPDATE users SET role='admin' WHERE id=$1", uid)
	old := h.start("POINT_REGISTRATION")
	var sid string
	_ = h.a.db.QueryRow("SELECT id FROM questionnaire_scenarios WHERE code='POINT_REGISTRATION'").Scan(&sid)
	var draft struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(h.request("POST", "/admin/scenarios/"+sid+"/draft", map[string]any{}, 200), &draft)
	graph := initialGraphs()["POINT_REGISTRATION"]
	graph.Questions = append(graph.Questions, Question{Key: "parking", Title: "Есть ли парковка рядом с вашей точкой?", Type: "YES_NO", Enabled: true, Required: true, Order: 100, Section: "contact", Options: []Option{}, Conditions: []Condition{}})
	graph.Questions[0].Options = append(graph.Questions[0].Options, Option{"new_type", "Новый вариант", true})
	h.request("PUT", "/admin/versions/"+draft.ID, map[string]any{"graph": graph, "revision": 1}, 200)
	h.request("POST", "/admin/versions/"+draft.ID+"/publish", map[string]any{"revision": 2}, 200)
	h.request("PUT", "/admin/versions/"+draft.ID, map[string]any{"graph": graph, "revision": 2}, 409)
	if _, e := h.a.db.Exec("UPDATE questionnaire_versions SET graph='{}' WHERE id=$1", draft.ID); e == nil {
		t.Fatal("DB permits published mutation")
	}
	var resumed Session
	_ = json.Unmarshal(h.request("GET", "/registration/sessions/"+old.ID, nil, 200), &resumed)
	if resumed.VersionID != old.VersionID || len(resumed.Graph.Questions) != len(old.Graph.Questions) {
		t.Fatal("published revision changed existing session")
	}
	h.request("POST", "/registration/sessions/"+old.ID+"/cancel", map[string]any{}, 200)
	next := h.start("POINT_REGISTRATION")
	if next.VersionID != draft.ID {
		t.Fatal("new session wrong version")
	}
	next = h.answer(next, "organization_type", "new_type", 200)
	next = h.fillPoint(next)
	h.request("POST", "/registration/sessions/"+next.ID+"/complete", map[string]any{}, 200)
	var custom bool
	if e := h.a.db.QueryRow("SELECT (value_json::text)::boolean FROM questionnaire_answers WHERE session_id=$1 AND question_key='parking'", next.ID).Scan(&custom); e != nil || !custom {
		t.Fatalf("custom missing %v", e)
	}
	var aid string
	_ = h.a.db.QueryRow("SELECT id FROM point_applications WHERE session_id=$1", next.ID).Scan(&aid)
	body := h.request("GET", "/applications/"+aid, nil, 200)
	if !bytes.Contains(body, []byte("parking")) {
		t.Fatal("custom answer missing from application")
	}
}
func TestIntegrationEmailUniquenessAndAnonymousOwnership(t *testing.T) {
	h := integration(t)
	h.signup("same@example.com")
	h.request("POST", "/auth/logout", map[string]any{}, 200)
	s := h.start("USER_REGISTRATION")
	h.answer(s, "email", "same@example.com", 409)
	first := h.client
	jar, _ := cookiejar.New(nil)
	h.client = &http.Client{Jar: jar}
	h.request("GET", "/registration/sessions/"+s.ID, nil, 404)
	h.client = first
	h.request("GET", "/registration/sessions/"+s.ID, nil, 200)
	req, _ := http.NewRequest("POST", h.server.URL+"/api/auth/login", strings.NewReader(`{}`))
	req.Header.Set("Origin", "https://evil.example")
	res, e := h.client.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatal("CSRF accepted")
	}
}
func TestIntegrationFileOwnershipAndValidation(t *testing.T) {
	h := integration(t)
	h.signup("files@example.com")
	s := h.start("POINT_REGISTRATION")
	ref := h.upload(s, "facade")
	h.request("GET", "/attachments/"+ref.ID, nil, 200)
	h.answer(s, "photos", []FileRef{ref}, 422)
	forged := FileRef{ID: newID(), Category: "interior"}
	h.answer(s, "photos", []FileRef{ref, forged}, 422)
	h.request("DELETE", "/attachments/"+ref.ID, nil, 200)
	h.request("GET", "/attachments/"+ref.ID, nil, 404)
}
func TestIntegrationDisabledVerification(t *testing.T) {
	h := integration(t)
	h.signup("verify@example.com")
	h.request("POST", "/verification/start", map[string]any{"channel": "email"}, 503)
	h.a.verification = DevelopmentVerification{}
	var challenge map[string]string
	_ = json.Unmarshal(h.request("POST", "/verification/start", map[string]any{"channel": "email"}, 200), &challenge)
	if challenge["development_code"] == "" {
		t.Fatal("missing development code")
	}
	h.request("POST", "/verification/confirm", map[string]string{"id": challenge["id"], "code": challenge["development_code"]}, 200)
	h.request("POST", "/verification/confirm", map[string]string{"id": challenge["id"], "code": challenge["development_code"]}, 422)
}
func TestIntegrationSeedIdempotent(t *testing.T) {
	h := integration(t)
	var n int
	_ = h.a.db.QueryRow("SELECT count(*) FROM questionnaire_scenarios").Scan(&n)
	if n != 2 {
		t.Fatal(fmt.Sprintf("seed count %d", n))
	}
}

func TestIntegrationMigrationDownAndUp(t *testing.T) {
	h := integration(t)
	b, e := os.ReadFile("migrations/001_platform.down.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = h.a.db.Exec(string(b)); e != nil {
		t.Fatal(e)
	}
	if e = h.a.migrate(context.Background()); e != nil {
		t.Fatal(e)
	}
	if e = h.a.seed(context.Background()); e != nil {
		t.Fatal(e)
	}
}

func TestIntegrationGenericScenario(t *testing.T) {
	h := integration(t)
	uid := h.signup("generic@example.com")
	_, _ = h.a.db.Exec("UPDATE users SET role='admin' WHERE id=$1", uid)
	var created struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(h.request("POST", "/admin/scenarios", map[string]string{"code": "PARTNER_SURVEY", "name": "Опрос партнёра"}, 200), &created)
	var versions []struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(h.request("GET", "/admin/scenarios/"+created.ID, nil, 200), &versions)
	g := Graph{Sections: []Section{{Code: "general", Name: "Основные данные"}}, Questions: []Question{{Key: "parking", Title: "Есть парковка?", Type: "YES_NO", Enabled: true, Required: true, Section: "general"}}, ShowReview: true}
	h.request("PUT", "/admin/versions/"+versions[0].ID, map[string]any{"graph": g, "revision": 1}, 200)
	h.request("POST", "/admin/versions/"+versions[0].ID+"/publish", map[string]int{"revision": 2}, 200)
	s := h.start("PARTNER_SURVEY")
	s = h.answer(s, "parking", true, 200)
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 200)
	var n int
	_ = h.a.db.QueryRow("SELECT count(*) FROM points").Scan(&n)
	if n != 0 {
		t.Fatal("generic survey created a Point")
	}
}

func TestIntegrationUploadRejectsExecutableContent(t *testing.T) {
	h := integration(t)
	h.signup("unsafe@example.com")
	s := h.start("POINT_REGISTRATION")
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	_ = form.WriteField("question_key", "photos")
	_ = form.WriteField("category", "facade")
	part, _ := form.CreateFormFile("file", "photo.png")
	_, _ = part.Write([]byte("<script>alert('x')</script>"))
	_ = form.Close()
	r, _ := http.NewRequest("POST", h.server.URL+"/api/registration/sessions/"+s.ID+"/attachments", &body)
	r.Header.Set("Content-Type", form.FormDataContentType())
	res, e := h.client.Do(r)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	if res.StatusCode != 422 {
		t.Fatalf("unsafe upload status %d", res.StatusCode)
	}
}

func TestIntegrationSelfContactWithMissingProfilePhone(t *testing.T) {
	h := integration(t)
	userID := h.signup("no-phone@example.com")
	if _, e := h.a.db.Exec("UPDATE users SET phone='' WHERE id=$1", userID); e != nil {
		t.Fatal(e)
	}
	h.request("POST", "/verification/start", map[string]string{"channel": "phone"}, 422)
	s := h.fillPoint(h.start("POINT_REGISTRATION"))
	s = h.answer(s, "contact_owner", "SELF", 200)
	response := h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 422)
	if !bytes.Contains(response, []byte("PROFILE_PHONE_REQUIRED")) {
		t.Fatalf("unexpected error: %s", response)
	}
	h.request("PATCH", "/me/phone", map[string]string{"phone": "invalid"}, 422)
	h.request("PATCH", "/me/phone", map[string]string{"phone": "8 (999) 123-45-67"}, 200)
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 200)
	var phone string
	if e := h.a.db.QueryRow("SELECT p.contact_phone FROM points p WHERE p.owner_id=$1", userID).Scan(&phone); e != nil {
		t.Fatal(e)
	}
	if phone != "+79991234567" {
		t.Fatalf("contact phone not normalized: %s", phone)
	}
}
