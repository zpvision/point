package app

import (
	"errors"
	"net/http/httptest"
	"testing"
)

func TestUploadSizeBoundary(t *testing.T) {
	for _, tc := range []struct {
		size   int64
		status int
	}{{0, 422}, {15 << 20, 0}, {(15 << 20) + 1, 413}} {
		err := validateUploadSize(tc.size)
		if tc.status == 0 {
			if err != nil {
				t.Fatal(err)
			}
			continue
		}
		var apiErr *apiError
		if !errors.As(err, &apiErr) || apiErr.Status != tc.status {
			t.Fatalf("size %d: %v", tc.size, err)
		}
	}
}

func TestUploadRejectsOversizeAndFloodBeforeDatabaseAccess(t *testing.T) {
	a := &App{rates: map[string]rateEntry{}}
	for i := 0; i < 31; i++ {
		r := httptest.NewRequest("POST", "/upload", nil)
		r.RemoteAddr = "192.0.2.1:1234"
		r.ContentLength = 17 << 20
		w := httptest.NewRecorder()
		err := a.upload(w, r)
		want := 413
		if i == 30 {
			want = 429
			if w.Header().Get("Retry-After") != "60" {
				t.Fatal("missing retry hint")
			}
		}
		var apiErr *apiError
		if !errors.As(err, &apiErr) || apiErr.Status != want {
			t.Fatalf("attempt %d: %v", i, err)
		}
	}
}
