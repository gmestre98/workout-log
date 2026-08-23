package auth

// Sheets export uses a *separate* Google authorization from login: the user
// grants the drive.file scope once ("connect"), and the resulting refresh token
// is kept server-side (encrypted) so the "Export to Google Sheets" button works
// repeatedly without re-consenting. Login itself is untouched and still only
// asks for openid/email/profile.
//
// drive.file is the least-privilege scope: the app may create and write only
// the spreadsheets it creates, never the user's other Drive files. openid+email
// are also requested so the returned account can be checked against the
// allow-list, exactly as login does.

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"net/http"
	"net/url"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/gmestre98/workout-log/backend/internal/store"
)

const (
	// sheetsStateCookie carries the CSRF state for the connect flow.
	sheetsStateCookie = "wl_sheets_state"
	// sheetsTokenKey is the Store key holding the (encrypted) refresh token.
	sheetsTokenKey = "sheets_refresh_token"
	// driveFileScope lets the app touch only the files it creates.
	driveFileScope = "https://www.googleapis.com/auth/drive.file"
)

// ErrSheetsNotConnected is returned by SheetsClient when no refresh token has
// been stored yet (the user has not connected Google Sheets).
var ErrSheetsNotConnected = errors.New("google sheets not connected")

// SettingStore is the slice of Store the sheets flow needs: a small server-side
// KV to hold the encrypted refresh token.
type SettingStore interface {
	GetSetting(ctx context.Context, key string) (string, error)
	SetSetting(ctx context.Context, key, value string) error
}

// UseSheetsStore enables the Google Sheets export authorization, backed by st.
// Without it, the connect/export endpoints report "not configured".
func (s *Service) UseSheetsStore(st SettingStore) {
	s.sheetsStore = st
	s.sheetsOAuth = &oauth2.Config{
		ClientID:     s.cfg.ClientID,
		ClientSecret: s.cfg.ClientSecret,
		RedirectURL:  sheetsRedirect(s.cfg.RedirectURL),
		Scopes:       []string{"openid", "email", driveFileScope},
		Endpoint:     google.Endpoint,
	}
}

// sheetsRedirect derives the sheets callback URL from the login redirect URL by
// swapping the path, so only OAUTH_REDIRECT_URL needs configuring. It falls
// back to the input unchanged if it cannot be parsed as an absolute URL.
func sheetsRedirect(loginRedirect string) string {
	u, err := url.Parse(loginRedirect)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return loginRedirect
	}
	u.Path = "/auth/sheets/callback"
	u.RawQuery = ""
	return u.String()
}

// SheetsConnect starts the connect flow: store a state cookie and redirect to
// Google, asking for offline access (a refresh token) with forced consent so a
// refresh token is always returned, even on re-connect.
func (s *Service) SheetsConnect(w http.ResponseWriter, r *http.Request) {
	if s.sheetsStore == nil {
		http.Error(w, "sheets export not configured", http.StatusServiceUnavailable)
		return
	}
	state := randomState()
	http.SetCookie(w, &http.Cookie{
		Name:     sheetsStateCookie,
		Value:    state,
		Path:     "/",
		MaxAge:   int((10 * time.Minute).Seconds()),
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
	})
	url := s.sheetsOAuth.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)
	http.Redirect(w, r, url, http.StatusFound)
}

// SheetsCallback finishes the connect flow: validate state, exchange the code,
// confirm the granted account is the allowed one, and store the refresh token
// (encrypted). It then redirects back to the app.
func (s *Service) SheetsCallback(w http.ResponseWriter, r *http.Request) {
	if s.sheetsStore == nil {
		http.Error(w, "sheets export not configured", http.StatusServiceUnavailable)
		return
	}
	stateCookie, err := r.Cookie(sheetsStateCookie)
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid oauth state", http.StatusBadRequest)
		return
	}
	token, err := s.sheetsOAuth.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "token exchange failed", http.StatusBadGateway)
		return
	}
	email, verified, err := s.fetchEmail(r.Context(), token)
	if err != nil {
		http.Error(w, "failed to fetch profile", http.StatusBadGateway)
		return
	}
	if !verified || !emailAllowed(email, s.cfg.AllowedEmail) {
		http.Error(w, "this account is not allowed", http.StatusForbidden)
		return
	}
	if token.RefreshToken == "" {
		// Should not happen with AccessTypeOffline+ApprovalForce, but guard so we
		// never store a useless (unrefreshable) credential.
		http.Error(w, "google did not return a refresh token; try connecting again", http.StatusBadGateway)
		return
	}
	enc, err := s.encryptToken(token.RefreshToken)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if err := s.sheetsStore.SetSetting(r.Context(), sheetsTokenKey, enc); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/?sheets=connected", http.StatusFound)
}

// SheetsAuth reports connection status (GET) and disconnects (DELETE). Both are
// mounted behind RequireAuth so only the signed-in owner can call them.
func (s *Service) SheetsAuth(w http.ResponseWriter, r *http.Request) {
	if s.sheetsStore == nil {
		http.Error(w, "sheets export not configured", http.StatusServiceUnavailable)
		return
	}
	switch r.Method {
	case http.MethodGet:
		connected, err := s.SheetsConnected(r.Context())
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]bool{"connected": connected})
	case http.MethodDelete:
		if err := s.sheetsStore.SetSetting(r.Context(), sheetsTokenKey, ""); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// SheetsConnected reports whether a usable refresh token is stored.
func (s *Service) SheetsConnected(ctx context.Context) (bool, error) {
	rt, err := s.sheetsRefreshToken(ctx)
	return rt != "", err
}

// SheetsClient returns an HTTP client authorized for the Sheets/Drive APIs,
// backed by the stored refresh token (which the oauth2 library refreshes as
// needed). It returns ErrSheetsNotConnected when no token is stored.
func (s *Service) SheetsClient(ctx context.Context) (*http.Client, error) {
	rt, err := s.sheetsRefreshToken(ctx)
	if err != nil {
		return nil, err
	}
	if rt == "" {
		return nil, ErrSheetsNotConnected
	}
	return s.sheetsOAuth.Client(ctx, &oauth2.Token{RefreshToken: rt}), nil
}

// sheetsRefreshToken returns the decrypted refresh token, or "" when none is
// stored (or it was disconnected).
func (s *Service) sheetsRefreshToken(ctx context.Context) (string, error) {
	if s.sheetsStore == nil {
		return "", nil
	}
	enc, err := s.sheetsStore.GetSetting(ctx, sheetsTokenKey)
	if errors.Is(err, store.ErrNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if enc == "" {
		return "", nil
	}
	return s.decryptToken(enc)
}

// --- token encryption at rest (AES-GCM keyed off SESSION_SECRET) ---

func (s *Service) tokenKey() [32]byte {
	return sha256.Sum256(append([]byte("sheets-token:"), s.sessions.secret...))
}

func (s *Service) encryptToken(plain string) (string, error) {
	key := s.tokenKey()
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return b64.EncodeToString(sealed), nil
}

func (s *Service) decryptToken(enc string) (string, error) {
	raw, err := b64.DecodeString(enc)
	if err != nil {
		return "", err
	}
	key := s.tokenKey()
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
