package app

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestStaticRoutesOnWindowsAndUnix(t *testing.T) {
	root := t.TempDir()
	if e := os.MkdirAll(filepath.Join(root, "assets"), 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(root, "index.html"), []byte("<html>Point</html>"), 0600); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(root, "assets", "app.js"), []byte("window.point=true;"), 0600); e != nil {
		t.Fatal(e)
	}
	t.Setenv("STATIC_DIR", root)
	a := &App{}
	for _, path := range []string{"/", "/register", "/points/new", "/admin/scenarios", "/assets/app.js"} {
		t.Run(path, func(t *testing.T) {
			res := httptest.NewRecorder()
			a.routes().ServeHTTP(res, httptest.NewRequest(http.MethodGet, path, nil))
			if res.Code != 200 {
				t.Fatalf("status %d body %s", res.Code, res.Body)
			}
		})
	}
}
