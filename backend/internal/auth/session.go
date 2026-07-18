// Package auth implements Google SSO restricted to a single allowed email,
// plus a signed-cookie session. The session signing/verification is pure and
// unit tested independently of any Google interaction.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"
)

// SessionCookieName is the cookie that carries the signed session token.
const SessionCookieName = "wl_session"

var (
	// ErrMalformed means the token is not in the expected format.
	ErrMalformed = errors.New("malformed session token")
	// ErrBadSignature means the token's signature does not verify.
	ErrBadSignature = errors.New("bad session signature")
	// ErrExpired means the token is past its expiry.
	ErrExpired = errors.New("session expired")
)

// SessionManager issues and verifies HMAC-signed session tokens. Tokens are
// stateless: "base64(email|expiryUnix).base64(hmac)".
type SessionManager struct {
	secret []byte
	ttl    time.Duration
	now    func() time.Time // injectable for tests
}

// NewSessionManager returns a manager signing with secret and expiring tokens
// after ttl.
func NewSessionManager(secret []byte, ttl time.Duration) *SessionManager {
	return &SessionManager{secret: secret, ttl: ttl, now: time.Now}
}

var b64 = base64.RawURLEncoding

func (s *SessionManager) sign(payload string) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(payload))
	return b64.EncodeToString(mac.Sum(nil))
}

// Issue creates a signed token for email valid for the manager's TTL.
func (s *SessionManager) Issue(email string) string {
	exp := s.now().Add(s.ttl).Unix()
	payload := email + "|" + strconv.FormatInt(exp, 10)
	return b64.EncodeToString([]byte(payload)) + "." + s.sign(payload)
}

// Verify checks a token's signature and expiry and returns the email.
func (s *SessionManager) Verify(token string) (string, error) {
	encPayload, sig, ok := strings.Cut(token, ".")
	if !ok {
		return "", ErrMalformed
	}
	payloadBytes, err := b64.DecodeString(encPayload)
	if err != nil {
		return "", ErrMalformed
	}
	payload := string(payloadBytes)
	if !hmac.Equal([]byte(sig), []byte(s.sign(payload))) {
		return "", ErrBadSignature
	}
	email, expStr, ok := strings.Cut(payload, "|")
	if !ok {
		return "", ErrMalformed
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return "", ErrMalformed
	}
	if s.now().Unix() > exp {
		return "", ErrExpired
	}
	return email, nil
}

// TTL exposes the configured token lifetime (used to set cookie MaxAge).
func (s *SessionManager) TTL() time.Duration { return s.ttl }
