package auth

import (
	"testing"
	"time"
)

func TestIssueVerifyRoundTrip(t *testing.T) {
	sm := NewSessionManager([]byte("topsecret"), time.Hour)
	tok := sm.Issue("goncalo@example.com")
	email, err := sm.Verify(tok)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if email != "goncalo@example.com" {
		t.Fatalf("got %q", email)
	}
}

func TestVerifyRejectsTamperedSignature(t *testing.T) {
	sm := NewSessionManager([]byte("topsecret"), time.Hour)
	tok := sm.Issue("a@b.com")
	if _, err := sm.Verify(tok + "x"); err == nil {
		t.Fatal("expected error for tampered token")
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	tok := NewSessionManager([]byte("secret-a"), time.Hour).Issue("a@b.com")
	if _, err := NewSessionManager([]byte("secret-b"), time.Hour).Verify(tok); err != ErrBadSignature {
		t.Fatalf("got %v want ErrBadSignature", err)
	}
}

func TestVerifyExpired(t *testing.T) {
	sm := NewSessionManager([]byte("s"), time.Hour)
	base := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	sm.now = func() time.Time { return base }
	tok := sm.Issue("a@b.com")
	sm.now = func() time.Time { return base.Add(2 * time.Hour) }
	if _, err := sm.Verify(tok); err != ErrExpired {
		t.Fatalf("got %v want ErrExpired", err)
	}
}

func TestVerifyMalformed(t *testing.T) {
	sm := NewSessionManager([]byte("s"), time.Hour)
	for _, tok := range []string{"", "nodot", "!!!.###"} {
		if _, err := sm.Verify(tok); err == nil {
			t.Fatalf("expected error for %q", tok)
		}
	}
}
