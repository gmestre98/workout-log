package auth

// Watch tokens let the Garmin watch app authenticate to the API without the
// interactive Google SSO flow (which a watch cannot perform). A token is an
// HMAC-signed "watch|email|nonce|expiryUnix" string, signed with the same
// secret as the session cookie but domain-separated by the "watch" prefix so
// neither token type can be replayed as the other.
//
// The nonce is stored server-side (one per install). Minting a new token
// rotates the nonce and revoking clears it; either way every previously issued
// token stops verifying — the kill switch for a leaked long-lived bearer token.

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gmestre98/workout-log/backend/internal/store"
)

// writeJSON writes v as a 200 JSON response.
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// WatchTokenTTL is how long a minted watch token stays valid.
const WatchTokenTTL = 365 * 24 * time.Hour

const (
	// watchNonceKey is the Store key holding the current watch-token nonce.
	watchNonceKey = "watch_token_nonce"
	// watchPrefix domain-separates watch tokens from session tokens.
	watchPrefix = "watch"
)

// WatchTokenStore is the slice of Store the watch-token flow needs: a small
// server-side KV to hold the nonce.
type WatchTokenStore interface {
	GetSetting(ctx context.Context, key string) (string, error)
	SetSetting(ctx context.Context, key, value string) error
}

// IssueWatchToken rotates the nonce (invalidating any prior token) and returns a
// fresh signed token bound to email, valid for WatchTokenTTL.
func (s *Service) IssueWatchToken(ctx context.Context, email string) (string, time.Time, error) {
	if s.watch == nil {
		return "", time.Time{}, errors.New("watch tokens not configured")
	}
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return "", time.Time{}, err
	}
	nonce := hex.EncodeToString(nonceBytes)
	if err := s.watch.SetSetting(ctx, watchNonceKey, nonce); err != nil {
		return "", time.Time{}, err
	}
	exp := s.sessions.now().Add(WatchTokenTTL)
	payload := watchPrefix + "|" + email + "|" + nonce + "|" + strconv.FormatInt(exp.Unix(), 10)
	return b64.EncodeToString([]byte(payload)) + "." + s.sessions.sign(payload), exp, nil
}

// RevokeWatchToken clears the nonce so every existing token stops verifying.
func (s *Service) RevokeWatchToken(ctx context.Context) error {
	if s.watch == nil {
		return errors.New("watch tokens not configured")
	}
	return s.watch.SetSetting(ctx, watchNonceKey, "")
}

// WatchTokenActive reports whether a live (non-revoked) watch token exists.
func (s *Service) WatchTokenActive(ctx context.Context) (bool, error) {
	nonce, err := s.currentNonce(ctx)
	return nonce != "", err
}

// currentNonce returns the stored nonce, or "" when unset or revoked.
func (s *Service) currentNonce(ctx context.Context) (string, error) {
	if s.watch == nil {
		return "", nil
	}
	nonce, err := s.watch.GetSetting(ctx, watchNonceKey)
	if errors.Is(err, store.ErrNotFound) {
		return "", nil
	}
	return nonce, err
}

// verifyWatchToken checks a bearer token's signature, expiry, and that it
// carries the current nonce; it returns the bound email.
func (s *Service) verifyWatchToken(ctx context.Context, token string) (string, error) {
	if s.watch == nil {
		return "", ErrBadSignature
	}
	encPayload, sig, ok := strings.Cut(token, ".")
	if !ok {
		return "", ErrMalformed
	}
	payloadBytes, err := b64.DecodeString(encPayload)
	if err != nil {
		return "", ErrMalformed
	}
	payload := string(payloadBytes)
	if !hmac.Equal([]byte(sig), []byte(s.sessions.sign(payload))) {
		return "", ErrBadSignature
	}
	parts := strings.Split(payload, "|")
	if len(parts) != 4 || parts[0] != watchPrefix {
		return "", ErrMalformed
	}
	email, nonce, expStr := parts[1], parts[2], parts[3]
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return "", ErrMalformed
	}
	if s.sessions.now().Unix() > exp {
		return "", ErrExpired
	}
	current, err := s.currentNonce(ctx)
	if err != nil {
		return "", err
	}
	if current == "" || !hmac.Equal([]byte(nonce), []byte(current)) {
		return "", ErrBadSignature
	}
	return email, nil
}

// WatchToken handles the watch-token endpoints, all behind RequireAuth so only
// the signed-in owner (via the browser session) can manage them:
//
//	GET    /auth/watch-token  -> {"active": bool}
//	POST   /auth/watch-token  -> {"token": "...", "expiresAt": "RFC3339"} (mints/rotates)
//	DELETE /auth/watch-token  -> 204 (revokes)
func (s *Service) WatchToken(w http.ResponseWriter, r *http.Request) {
	if s.watch == nil {
		http.Error(w, "watch tokens not configured", http.StatusServiceUnavailable)
		return
	}
	email, _ := EmailFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		active, err := s.WatchTokenActive(r.Context())
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]bool{"active": active})
	case http.MethodPost:
		token, exp, err := s.IssueWatchToken(r.Context(), email)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"token": token, "expiresAt": exp.UTC().Format(time.RFC3339)})
	case http.MethodDelete:
		if err := s.RevokeWatchToken(r.Context()); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
