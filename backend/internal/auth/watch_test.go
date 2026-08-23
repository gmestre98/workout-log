package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gmestre98/workout-log/backend/internal/store"
)

// newWatchService returns a Service with watch tokens enabled over an in-memory
// store, plus that store for assertions.
func newWatchService(t *testing.T) (*Service, store.Store) {
	t.Helper()
	st := store.NewMemory()
	svc := NewService(Config{}, NewSessionManager([]byte("secret"), time.Hour))
	svc.UseWatchStore(st)
	return svc, st
}

func TestWatchTokenRoundTrip(t *testing.T) {
	svc, _ := newWatchService(t)
	ctx := context.Background()

	tok, exp, err := svc.IssueWatchToken(ctx, "me@gmail.com")
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if exp.Before(time.Now().Add(300 * 24 * time.Hour)) {
		t.Fatalf("expiry too soon: %v", exp)
	}
	email, err := svc.verifyWatchToken(ctx, tok)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if email != "me@gmail.com" {
		t.Fatalf("email = %q, want me@gmail.com", email)
	}
}

func TestWatchTokenRevoked(t *testing.T) {
	svc, _ := newWatchService(t)
	ctx := context.Background()
	tok, _, _ := svc.IssueWatchToken(ctx, "me@gmail.com")
	if err := svc.RevokeWatchToken(ctx); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if _, err := svc.verifyWatchToken(ctx, tok); err == nil {
		t.Fatal("revoked token still verifies")
	}
	active, _ := svc.WatchTokenActive(ctx)
	if active {
		t.Fatal("WatchTokenActive true after revoke")
	}
}

// Minting a new token must invalidate the previous one (nonce rotation).
func TestWatchTokenRotationInvalidatesOld(t *testing.T) {
	svc, _ := newWatchService(t)
	ctx := context.Background()
	old, _, _ := svc.IssueWatchToken(ctx, "me@gmail.com")
	if _, _, err := svc.IssueWatchToken(ctx, "me@gmail.com"); err != nil {
		t.Fatalf("second issue: %v", err)
	}
	if _, err := svc.verifyWatchToken(ctx, old); err == nil {
		t.Fatal("old token still verifies after rotation")
	}
}

// A session cookie must not be accepted as a watch token, and vice versa.
func TestWatchTokenDomainSeparation(t *testing.T) {
	svc, _ := newWatchService(t)
	ctx := context.Background()
	sessionTok := svc.sessions.Issue("me@gmail.com")
	if _, err := svc.verifyWatchToken(ctx, sessionTok); err == nil {
		t.Fatal("session token wrongly accepted as watch token")
	}
	watchTok, _, _ := svc.IssueWatchToken(ctx, "me@gmail.com")
	if _, err := svc.sessions.Verify(watchTok); err == nil {
		t.Fatal("watch token wrongly accepted as session token")
	}
}

// RequireAuth admits a valid watch token supplied as a Bearer header.
func TestRequireAuthAdmitsWatchBearer(t *testing.T) {
	svc, _ := newWatchService(t)
	tok, _, _ := svc.IssueWatchToken(context.Background(), "me@gmail.com")

	var seen string
	h := svc.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, _ = EmailFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/exercises", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || seen != "me@gmail.com" {
		t.Fatalf("bearer auth failed: code=%d email=%q", rec.Code, seen)
	}
}

func TestRequireAuthRejectsBadBearer(t *testing.T) {
	svc, _ := newWatchService(t)
	h := svc.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be reached")
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/exercises", nil)
	req.Header.Set("Authorization", "Bearer not-a-real-token")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d want 401", rec.Code)
	}
}

// The HTTP handler mints, reports status, and revokes.
func TestWatchTokenHandler(t *testing.T) {
	svc, _ := newWatchService(t)
	ctx := WithEmail(context.Background(), "me@gmail.com")

	post := httptest.NewRequest(http.MethodPost, "/auth/watch-token", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	svc.WatchToken(rec, post)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST got %d", rec.Code)
	}

	get := httptest.NewRequest(http.MethodGet, "/auth/watch-token", nil).WithContext(ctx)
	rec = httptest.NewRecorder()
	svc.WatchToken(rec, get)
	if rec.Code != http.StatusOK || rec.Body.String() != "{\"active\":true}\n" {
		t.Fatalf("GET got %d body=%q", rec.Code, rec.Body.String())
	}

	del := httptest.NewRequest(http.MethodDelete, "/auth/watch-token", nil).WithContext(ctx)
	rec = httptest.NewRecorder()
	svc.WatchToken(rec, del)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("DELETE got %d", rec.Code)
	}
}
