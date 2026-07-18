package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestEmailAllowed(t *testing.T) {
	cases := []struct {
		got, want string
		allowed   bool
	}{
		{"goncalo@gmail.com", "goncalo@gmail.com", true},
		{"Goncalo@Gmail.com", "goncalo@gmail.com", true},
		{"  goncalo@gmail.com  ", "goncalo@gmail.com", true},
		{"someone@gmail.com", "goncalo@gmail.com", false},
		{"", "goncalo@gmail.com", false},
	}
	for _, c := range cases {
		if got := emailAllowed(c.got, c.want); got != c.allowed {
			t.Errorf("emailAllowed(%q,%q)=%v want %v", c.got, c.want, got, c.allowed)
		}
	}
}

func TestRequireAuthRejectsMissingCookie(t *testing.T) {
	svc := NewService(Config{}, NewSessionManager([]byte("s"), time.Hour))
	h := svc.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be reached")
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/exercises", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d want 401", rec.Code)
	}
}

func TestRequireAuthAdmitsValidCookie(t *testing.T) {
	sm := NewSessionManager([]byte("s"), time.Hour)
	svc := NewService(Config{}, sm)
	var seen string
	h := svc.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, _ = EmailFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/exercises", nil)
	req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: sm.Issue("me@gmail.com")})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d want 200", rec.Code)
	}
	if seen != "me@gmail.com" {
		t.Fatalf("context email got %q", seen)
	}
}
