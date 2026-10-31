package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPublicOrigin(t *testing.T) {
	for _, tc := range []struct {
		name, environment, configured, want string
		invalid                             bool
	}{
		{"production default", "production", "", productionOrigin, false},
		{"production explicit", "production", productionOrigin, productionOrigin, false},
		{"development default", "development", "", "http://localhost:8080", false},
		{"vite", "development", "http://localhost:5175", "http://localhost:5175", false},
		{"old cabinet", "production", "https://app.s1point.ru", "", true},
		{"landing is not cabinet", "production", "https://2point.ru", "", true},
		{"http production", "production", "http://app.2point.ru", "", true},
		{"wildcard", "development", "*", "", true},
		{"path", "development", "https://app.2point.ru/", "", true},
		{"query", "development", "https://app.2point.ru?x=1", "", true},
		{"userinfo", "development", "https://user@app.2point.ru", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("PUBLIC_ORIGIN", tc.configured)
			got, err := publicOrigin(tc.environment)
			if (err != nil) != tc.invalid || got != tc.want {
				t.Fatalf("got %q, %v; want %q, invalid=%v", got, err, tc.want, tc.invalid)
			}
		})
	}
}

func TestOriginProtection(t *testing.T) {
	a := &App{origin: productionOrigin}
	for _, tc := range []struct {
		name, method, origin, referer, fetchSite string
		cookie, forbidden                        bool
	}{
		{"cabinet write", "POST", productionOrigin, "", "same-origin", true, false},
		{"old cabinet", "POST", "https://app.s1point.ru", "", "", true, true},
		{"old landing", "POST", "https://s1point.ru", "", "", false, true},
		{"new landing", "POST", "https://2point.ru", "", "same-site", true, true},
		{"suffix attack", "POST", productionOrigin + ".evil.example", "", "", true, true},
		{"null", "POST", "null", "", "", false, true},
		{"origin wins over referer", "POST", "null", productionOrigin + "/account", "", true, true},
		{"referer fallback", "PUT", "", productionOrigin + "/account", "", true, false},
		{"bad referer", "DELETE", "", "https://evil.example/account", "", true, true},
		{"no browser source with session", "PATCH", "", "", "", true, true},
		{"machine request without session", "POST", "", "", "", false, false},
		{"cross-site form", "POST", "", "", "cross-site", false, true},
		{"cross-origin read", "GET", "https://evil.example", "", "", true, true},
		{"cross-origin preflight", "OPTIONS", "https://2point.ru", "", "", false, true},
		{"cabinet read", "GET", productionOrigin, "", "", true, false},
		{"navigation", "GET", "", "", "", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			h := a.protectOrigin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				called = true
				w.WriteHeader(http.StatusNoContent)
			}))
			r := httptest.NewRequest(tc.method, productionOrigin+"/api/me", nil)
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("Referer", tc.referer)
			r.Header.Set("Sec-Fetch-Site", tc.fetchSite)
			if tc.cookie {
				r.AddCookie(&http.Cookie{Name: "point_auth", Value: "test"})
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if called == tc.forbidden || (w.Code == http.StatusForbidden) != tc.forbidden {
				t.Fatalf("called=%v status=%d body=%s", called, w.Code, w.Body.String())
			}
			if tc.forbidden && !strings.Contains(w.Body.String(), "ORIGIN_FORBIDDEN") {
				t.Fatal(w.Body.String())
			}
			if w.Header().Get("Access-Control-Allow-Origin") != "" {
				t.Fatal("unexpected CORS grant")
			}
		})
	}
}

func TestProductionCookie(t *testing.T) {
	a := &App{env: "production"}
	for _, maxAge := range []int{30 * 86400, -1} {
		w := httptest.NewRecorder()
		a.cookie(w, "point_auth", "test", maxAge)
		c := w.Result().Cookies()[0]
		if c.Domain != "" || c.Path != "/" || !c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.MaxAge != maxAge {
			t.Fatalf("unsafe session cookie: %+v", c)
		}
	}
}

func TestProductionAPIRouting(t *testing.T) {
	a := &App{env: "production", origin: productionOrigin}
	h := a.routes()
	for _, path := range []string{"/api/me", "/api/point-consent", "/api/cabinet/profile", "/api/organizations"} {
		r := httptest.NewRequest("GET", productionOrigin+path, nil)
		r.Header.Set("Origin", productionOrigin)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusOK && w.Code != http.StatusUnauthorized {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
}

func TestProductionAPIWrites(t *testing.T) {
	a := &App{env: "production", origin: productionOrigin, rates: map[string]rateEntry{}}
	h := a.routes()
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{"POST", "/api/auth/login", http.StatusBadRequest},
		{"POST", "/api/auth/logout", http.StatusOK},
		{"POST", "/api/point-consent", http.StatusBadRequest},
		{"PATCH", "/api/me/phone", http.StatusUnauthorized},
		{"PUT", "/api/cabinet/profile", http.StatusUnauthorized},
		{"DELETE", "/api/domain-probe", http.StatusNotFound},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, productionOrigin+tc.path, strings.NewReader("{"))
			r.Header.Set("Origin", productionOrigin)
			r.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.status || strings.Contains(w.Body.String(), "ORIGIN_FORBIDDEN") {
				t.Fatalf("status=%d want=%d: %s", w.Code, tc.status, w.Body.String())
			}
		})
	}
}

func TestConsentCookieNeedsSource(t *testing.T) {
	a := &App{origin: productionOrigin}
	r := httptest.NewRequest("POST", productionOrigin+"/api/point-consent", nil)
	r.AddCookie(&http.Cookie{Name: "point_consent", Value: "test"})
	w := httptest.NewRecorder()
	a.protectOrigin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("write with consent cookie but no browser source was accepted")
	})).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d", w.Code)
	}
}
