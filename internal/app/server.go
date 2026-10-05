package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
)

//go:embed migrations/*.up.sql
var migrations embed.FS

type App struct {
	db                     *sql.DB
	origin, env, uploadDir string
	lookup                 OrganizationLookupProvider
	geo                    GeoProvider
	verification           VerificationProvider
	rateMu                 sync.Mutex
	rates                  map[string]rateEntry
}
type rateEntry struct {
	Count int
	Start time.Time
}
type authContextKey struct{}
type authState struct {
	user *User
	err  error
}
type apiError struct {
	Status      int    `json:"-"`
	Code        string `json:"code"`
	Message     string `json:"message"`
	QuestionKey string `json:"question_key,omitempty"`
}

func (e *apiError) Error() string { return e.Message }
func fail(status int, code, message string) error {
	return &apiError{Status: status, Code: code, Message: message}
}
func newID() string {
	var b [24]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}
func digest(s string) string { b := sha256.Sum256([]byte(s)); return hex.EncodeToString(b[:]) }
func env(key, def string) string {
	if s := os.Getenv(key); s != "" {
		return s
	}
	return def
}
func jsonResponse(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(v)
}
func readJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		return fail(400, "INVALID_JSON", "Некорректные данные запроса")
	}
	if d.Decode(&struct{}{}) != io.EOF {
		return fail(400, "INVALID_JSON", "Некорректные данные запроса")
	}
	return nil
}

type endpoint func(http.ResponseWriter, *http.Request) error

func (a *App) handle(fn endpoint) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if e := fn(w, r); e != nil {
			var ae *apiError
			if !errors.As(e, &ae) {
				ae = &apiError{Status: 500, Code: "INTERNAL_ERROR", Message: "Не удалось выполнить действие. Попробуйте ещё раз."}
				log.Printf("request failed: %s %s (%T)", r.Method, r.Pattern, e)
			}
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(ae.Status)
			_ = json.NewEncoder(w).Encode(ae)
		}
	}
}
func (a *App) migrate(ctx context.Context) error {
	tx, e := a.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(82139011)"); e != nil {
		return e
	}
	if _, e = tx.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"); e != nil {
		return e
	}
	entries, _ := migrations.ReadDir("migrations")
	for _, f := range entries {
		var exists bool
		if e = tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)", f.Name()).Scan(&exists); e != nil {
			return e
		}
		if exists {
			continue
		}
		b, _ := migrations.ReadFile("migrations/" + f.Name())
		if _, e = tx.ExecContext(ctx, string(b)); e != nil {
			return fmt.Errorf("migration %s: %w", f.Name(), e)
		}
		if _, e = tx.ExecContext(ctx, "INSERT INTO schema_migrations(name) VALUES($1)", f.Name()); e != nil {
			return e
		}
	}
	return tx.Commit()
}
func Run() error {
	db, e := sql.Open("pgx", os.Getenv("DATABASE_URL"))
	if e != nil {
		return e
	}
	defer db.Close()
	db.SetMaxOpenConns(16)
	db.SetMaxIdleConns(4)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if e = db.PingContext(ctx); e != nil {
		return fmt.Errorf("database connection: %w", e)
	}
	a := &App{db: db, env: env("APP_ENV", "production"), origin: env("PUBLIC_ORIGIN", "http://localhost:8080"), uploadDir: env("UPLOAD_DIR", "var/uploads"), rates: map[string]rateEntry{}}
	a.lookup = DaDataProvider{Key: os.Getenv("DADATA_API_KEY")}
	a.geo = FallbackGeoProvider{
		Primary: YandexProvider{GeocoderKey: os.Getenv("YANDEX_GEOCODER_API_KEY"), SuggestKey: os.Getenv("YANDEX_SUGGEST_API_KEY")},
		Backup:  DaDataGeoProvider{Key: os.Getenv("DADATA_API_KEY")},
	}
	a.verification = DisabledVerification{}
	if os.Getenv("VERIFICATION_PROVIDER") == "development" {
		if a.env != "development" {
			return fmt.Errorf("development verification requires APP_ENV=development")
		}
		a.verification = DevelopmentVerification{}
	}
	if e = a.migrate(ctx); e != nil {
		return e
	}
	if e = a.seed(ctx); e != nil {
		return e
	}
	if e = a.bootstrap(ctx); e != nil {
		return e
	}
	if e = os.MkdirAll(a.uploadDir, 0700); e != nil {
		return e
	}
	server := &http.Server{Addr: env("HTTP_ADDR", "127.0.0.1:8080"), Handler: a.routes(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 45 * time.Second, WriteTimeout: 45 * time.Second, IdleTimeout: 90 * time.Second}
	shutdown, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	go func() {
		<-shutdown.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	log.Printf("Point listening at %s", server.Addr)
	e = server.ListenAndServe()
	if errors.Is(e, http.ErrServerClosed) {
		return nil
	}
	return e
}
func (a *App) bootstrap(ctx context.Context) error {
	email, password := strings.ToLower(os.Getenv("ADMIN_EMAIL")), os.Getenv("ADMIN_PASSWORD")
	if email == "" && password == "" {
		return nil
	}
	if email == "" || len(password) < 12 || len(password) > 72 {
		return fmt.Errorf("bootstrap admin requires email and password of 12–72 bytes")
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(password), 12)
	if e != nil {
		return e
	}
	_, e = a.db.ExecContext(ctx, "INSERT INTO users(id,first_name,last_name,phone,email,password_hash,role) VALUES($1,'Администратор','','',$2,$3,'admin') ON CONFLICT DO NOTHING", newID(), email, string(hash))
	return e
}
func (a *App) routes() http.Handler {
	m := http.NewServeMux()
	route := func(pattern string, h endpoint) { m.HandleFunc(pattern, a.handle(h)) }
	route("GET /api/me", func(w http.ResponseWriter, r *http.Request) error {
		u, _ := a.user(r)
		jsonResponse(w, map[string]any{"user": u, "maps_key": os.Getenv("YANDEX_MAPS_API_KEY"), "development": a.env == "development"})
		return nil
	})
	route("PATCH /api/me/phone", a.updateOwnPhone)
	route("POST /api/auth/login", a.login)
	route("POST /api/auth/logout", a.logout)
	route("GET /api/scenarios/{code}", a.activeScenario)
	route("POST /api/registration/sessions", a.startSession)
	route("GET /api/registration/sessions/{id}", a.getSession)
	route("POST /api/registration/sessions/{id}/answers", a.answer)
	route("POST /api/registration/sessions/{id}/complete", a.complete)
	route("POST /api/registration/sessions/{id}/cancel", a.cancelSession)
	route("POST /api/registration/sessions/{id}/attachments", a.upload)
	route("GET /api/registration/sessions/{id}/attachments", a.sessionAttachments)
	route("GET /api/attachments/{id}", a.download)
	route("DELETE /api/attachments/{id}", a.deleteAttachment)
	route("GET /api/organizations", a.organizations)
	route("GET /api/points", a.points)
	route("GET /api/applications/{id}", a.applicationDetail)
	route("POST /api/applications/{id}/reopen", a.reopen)
	route("POST /api/organization-lookup", a.organizationLookup)
	route("GET /api/geo/suggest", a.suggest)
	route("GET /api/geo/geocode", a.geocode)
	route("POST /api/verification/start", a.startVerification)
	route("POST /api/verification/confirm", a.confirmVerification)
	route("GET /api/admin/registry", a.registry)
	route("GET /api/admin/scenarios", a.scenarios)
	route("POST /api/admin/scenarios", a.createScenario)
	route("GET /api/admin/scenarios/{id}", a.scenarioDetail)
	route("POST /api/admin/scenarios/{id}/draft", a.createDraft)
	route("PUT /api/admin/versions/{id}", a.saveDraft)
	route("POST /api/admin/versions/{id}/publish", a.publish)
	route("POST /api/admin/versions/{id}/preview", a.previewDraft)
	route("GET /api/admin/applications", a.applications)
	route("POST /api/admin/applications/{id}/moderate", a.moderate)
	m.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
		jsonResponse(w, &apiError{Code: "NOT_FOUND", Message: "Не найдено"})
	})
	m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "\\") {
			http.NotFound(w, r)
			return
		}
		p := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		root := env("STATIC_DIR", filepath.Join("web", "dist"))
		file := filepath.Join(root, filepath.FromSlash(p))
		if info, e := os.Stat(file); e == nil && !info.IsDir() {
			http.ServeFile(w, r, file)
			return
		}
		http.ServeFile(w, r, filepath.Join(root, "index.html"))
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
			ctx, cancel := context.WithTimeout(r.Context(), 40*time.Second)
			defer cancel()
			r = r.WithContext(ctx)
			u, e := a.lookupUser(r)
			r = r.WithContext(context.WithValue(r.Context(), authContextKey{}, authState{user: u, err: e}))
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			origin := r.Header.Get("Origin")
			if origin != "" && origin != a.origin {
				w.WriteHeader(403)
				jsonResponse(w, &apiError{Code: "ORIGIN_FORBIDDEN", Message: "Недопустимый источник запроса"})
				return
			}
		}
		m.ServeHTTP(w, r)
	})
}
func (a *App) user(r *http.Request) (*User, error) {
	if cached, ok := r.Context().Value(authContextKey{}).(authState); ok {
		return cached.user, cached.err
	}
	return a.lookupUser(r)
}
func (a *App) lookupUser(r *http.Request) (*User, error) {
	c, e := r.Cookie("point_auth")
	if e != nil {
		return nil, fail(401, "AUTH_REQUIRED", "Войдите в аккаунт")
	}
	u := &User{}
	e = a.db.QueryRowContext(r.Context(), "SELECT u.id,u.first_name,u.last_name,u.phone,u.email,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()", digest(c.Value)).Scan(&u.ID, &u.FirstName, &u.LastName, &u.Phone, &u.Email, &u.Role)
	if e != nil {
		return nil, fail(401, "AUTH_REQUIRED", "Войдите в аккаунт")
	}
	return u, nil
}
func (a *App) admin(r *http.Request) (*User, error) {
	u, e := a.user(r)
	if e != nil {
		return nil, e
	}
	if u.Role != "admin" {
		return nil, fail(403, "FORBIDDEN", "Недостаточно прав")
	}
	return u, nil
}
func (a *App) cookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: a.env != "development", SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}
func (a *App) owner(w http.ResponseWriter, r *http.Request) string {
	c, e := r.Cookie("point_registration")
	if e == nil && len(c.Value) == 48 {
		return digest(c.Value)
	}
	token := newID()
	a.cookie(w, "point_registration", token, 30*86400)
	return digest(token)
}
func (a *App) authToken(ctx context.Context, tx *sql.Tx, userID string) (string, error) {
	token := newID()
	_, e := tx.ExecContext(ctx, "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')", digest(token), userID)
	return token, e
}
func (a *App) allow(key string, limit int) bool {
	a.rateMu.Lock()
	defer a.rateMu.Unlock()
	now := time.Now()
	if len(a.rates) > 10000 {
		for k, v := range a.rates {
			if now.Sub(v.Start) > time.Minute {
				delete(a.rates, k)
			}
		}
	}
	v := a.rates[key]
	if now.Sub(v.Start) > time.Minute {
		v = rateEntry{Start: now}
	}
	v.Count++
	a.rates[key] = v
	return v.Count <= limit
}
func (a *App) login(w http.ResponseWriter, r *http.Request) error {
	if !a.allow("login:"+r.RemoteAddr[:strings.LastIndex(r.RemoteAddr, ":")], 10) {
		return fail(429, "RATE_LIMIT", "Попробуйте через минуту")
	}
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if e := readJSON(w, r, &in); e != nil {
		return e
	}
	var id, hash string
	e := a.db.QueryRowContext(r.Context(), "SELECT id,password_hash FROM users WHERE lower(email)=$1", strings.ToLower(strings.TrimSpace(in.Email))).Scan(&id, &hash)
	if e != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		return fail(401, "LOGIN_FAILED", "Неверный e-mail или пароль")
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	token, e := a.authToken(r.Context(), tx, id)
	if e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	a.cookie(w, "point_auth", token, 30*86400)
	jsonResponse(w, map[string]bool{"ok": true})
	return nil
}
func (a *App) logout(w http.ResponseWriter, r *http.Request) error {
	if c, e := r.Cookie("point_auth"); e == nil {
		if _, e = a.db.ExecContext(r.Context(), "DELETE FROM auth_sessions WHERE token_hash=$1", digest(c.Value)); e != nil {
			return e
		}
	}
	a.cookie(w, "point_auth", "", -1)
	jsonResponse(w, map[string]bool{"ok": true})
	return nil
}
