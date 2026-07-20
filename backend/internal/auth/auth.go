package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const (
	stateCookieName = "wl_oauth_state"
	userinfoURL     = "https://www.googleapis.com/oauth2/v2/userinfo"
)

type ctxKey int

const emailKey ctxKey = 0

// Config configures Google SSO.
type Config struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string // e.g. https://host/auth/callback
	AllowedEmail string // only this Google account may sign in
	SecureCookie bool   // set Secure flag (true in production/HTTPS)

	// DevBypassEmail, when non-empty, treats every request as authenticated as
	// this email WITHOUT any cookie. It exists only for local development and
	// UI work; it is wired solely from the DEV_AUTH_EMAIL env var and is never
	// set by the production deploy. Leave empty in any deployed environment.
	DevBypassEmail string
}

// Service wires the OAuth flow to the session manager.
type Service struct {
	cfg      Config
	oauth    *oauth2.Config
	sessions *SessionManager
}

// NewService builds the auth service.
func NewService(cfg Config, sessions *SessionManager) *Service {
	return &Service{
		cfg:      cfg,
		sessions: sessions,
		oauth: &oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
	}
}

// emailAllowed reports whether got matches want, case-insensitively.
func emailAllowed(got, want string) bool {
	return strings.EqualFold(strings.TrimSpace(got), strings.TrimSpace(want))
}

func randomState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Login starts the OAuth flow: store a state cookie and redirect to Google.
func (s *Service) Login(w http.ResponseWriter, r *http.Request) {
	state := randomState()
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    state,
		Path:     "/",
		MaxAge:   int((10 * time.Minute).Seconds()),
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, s.oauth.AuthCodeURL(state), http.StatusFound)
}

// Callback handles Google's redirect: validate state, exchange the code, check
// the email against the allowlist, and issue a session cookie.
func (s *Service) Callback(w http.ResponseWriter, r *http.Request) {
	stateCookie, err := r.Cookie(stateCookieName)
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid oauth state", http.StatusBadRequest)
		return
	}
	token, err := s.oauth.Exchange(r.Context(), r.URL.Query().Get("code"))
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
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    s.sessions.Issue(email),
		Path:     "/",
		MaxAge:   int(s.sessions.TTL().Seconds()),
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, "/", http.StatusFound)
}

func (s *Service) fetchEmail(ctx context.Context, token *oauth2.Token) (string, bool, error) {
	resp, err := s.oauth.Client(ctx, token).Get(userinfoURL)
	if err != nil {
		return "", false, err
	}
	defer resp.Body.Close()
	var info struct {
		Email    string `json:"email"`
		Verified bool   `json:"verified_email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", false, err
	}
	return info.Email, info.Verified, nil
}

// Logout clears the session cookie.
func (s *Service) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
	})
	w.WriteHeader(http.StatusNoContent)
}

// Me returns the currently signed-in email as JSON, or 401.
func (s *Service) Me(w http.ResponseWriter, r *http.Request) {
	email, ok := EmailFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthenticated", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"email": email})
}

// RequireAuth is middleware that admits only requests carrying a valid session
// cookie, injecting the email into the request context.
func (s *Service) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.DevBypassEmail != "" {
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), emailKey, s.cfg.DevBypassEmail)))
			return
		}
		cookie, err := r.Cookie(SessionCookieName)
		if err != nil {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}
		email, err := s.sessions.Verify(cookie.Value)
		if err != nil {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), emailKey, email)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// EmailFromContext returns the authenticated email set by RequireAuth.
func EmailFromContext(ctx context.Context) (string, bool) {
	email, ok := ctx.Value(emailKey).(string)
	return email, ok
}

// WithEmail returns a context carrying email; used in tests.
func WithEmail(ctx context.Context, email string) context.Context {
	return context.WithValue(ctx, emailKey, email)
}
