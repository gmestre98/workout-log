package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gmestre98/workout-log/backend/internal/store"
)

func newSheetsService(t *testing.T) (*Service, store.Store) {
	t.Helper()
	st := store.NewMemory()
	svc := NewService(Config{RedirectURL: "https://host/auth/callback"}, NewSessionManager([]byte("secret"), time.Hour))
	svc.UseSheetsStore(st)
	return svc, st
}

func TestSheetsRedirectDerivedFromLogin(t *testing.T) {
	got := sheetsRedirect("https://host/auth/callback")
	if want := "https://host/auth/sheets/callback"; got != want {
		t.Fatalf("sheetsRedirect = %q, want %q", got, want)
	}
	// Non-absolute input is returned unchanged.
	if got := sheetsRedirect("not a url"); got != "not a url" {
		t.Fatalf("sheetsRedirect(non-url) = %q", got)
	}
}

func TestTokenEncryptRoundTrip(t *testing.T) {
	svc, _ := newSheetsService(t)
	enc, err := svc.encryptToken("1//refresh-token-value")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if enc == "1//refresh-token-value" || enc == "" {
		t.Fatalf("token not encrypted: %q", enc)
	}
	got, err := svc.decryptToken(enc)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if got != "1//refresh-token-value" {
		t.Fatalf("roundtrip = %q", got)
	}
}

// A token encrypted under one secret must not decrypt under another.
func TestTokenDecryptWrongSecret(t *testing.T) {
	svc, _ := newSheetsService(t)
	enc, _ := svc.encryptToken("secret-token")

	other := NewService(Config{}, NewSessionManager([]byte("different"), time.Hour))
	other.UseSheetsStore(store.NewMemory())
	if _, err := other.decryptToken(enc); err == nil {
		t.Fatal("token decrypted under the wrong secret")
	}
}

func TestSheetsConnectedAndDisconnect(t *testing.T) {
	svc, _ := newSheetsService(t)
	ctx := context.Background()

	connected, err := svc.SheetsConnected(ctx)
	if err != nil || connected {
		t.Fatalf("fresh service: connected=%v err=%v", connected, err)
	}
	if _, err := svc.SheetsClient(ctx); !errors.Is(err, ErrSheetsNotConnected) {
		t.Fatalf("SheetsClient before connect = %v, want ErrSheetsNotConnected", err)
	}

	// Simulate a stored refresh token.
	enc, _ := svc.encryptToken("1//rt")
	if err := svc.sheetsStore.SetSetting(ctx, sheetsTokenKey, enc); err != nil {
		t.Fatalf("store token: %v", err)
	}
	if connected, _ := svc.SheetsConnected(ctx); !connected {
		t.Fatal("connected=false after storing token")
	}
	if _, err := svc.SheetsClient(ctx); err != nil {
		t.Fatalf("SheetsClient after connect: %v", err)
	}

	// Disconnect clears it.
	if err := svc.sheetsStore.SetSetting(ctx, sheetsTokenKey, ""); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if connected, _ := svc.SheetsConnected(ctx); connected {
		t.Fatal("still connected after disconnect")
	}
}
