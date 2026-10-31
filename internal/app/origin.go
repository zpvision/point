package app

import (
	"fmt"
	"net/http"
	"net/url"
)

const productionOrigin = "https://app.2point.ru"

func publicOrigin(appEnv string) (string, error) {
	defaultOrigin := productionOrigin
	if appEnv == "development" {
		defaultOrigin = "http://localhost:8080"
	}
	origin := env("PUBLIC_ORIGIN", defaultOrigin)
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", fmt.Errorf("PUBLIC_ORIGIN must be an exact origin (scheme://host[:port], without a trailing slash)")
	}
	if appEnv != "development" && origin != productionOrigin {
		return "", fmt.Errorf("production PUBLIC_ORIGIN must be %s", productionOrigin)
	}
	return origin, nil
}

// The browser uses same-origin /api requests. Do not grant CORS access to
// other origins, including the landing page: it links to the cabinet instead.
func (a *App) protectOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		unsafe := r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions
		origin := r.Header.Get("Origin")
		forbidden := origin != "" && origin != a.origin
		if unsafe {
			// Same-site subdomains are not trusted with the cabinet's session.
			forbidden = forbidden || r.Header.Get("Sec-Fetch-Site") == "cross-site"
			if origin == "" {
				if referer := r.Header.Get("Referer"); referer != "" {
					u, err := url.Parse(referer)
					forbidden = forbidden || err != nil || u == nil || u.User != nil || u.Scheme+"://"+u.Host != a.origin
				} else {
					// Cookie-authenticated writes need a verifiable browser source.
					for _, name := range []string{"point_auth", "point_consent"} {
						if _, err := r.Cookie(name); err == nil {
							forbidden = true
						}
					}
				}
			}
		}
		if forbidden {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusForbidden)
			jsonResponse(w, &apiError{Code: "ORIGIN_FORBIDDEN", Message: "Недопустимый источник запроса"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
