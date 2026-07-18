// Command server runs the workout-log HTTP server: it serves the JSON API
// (behind Google SSO) and the built React frontend from one process, which is
// what gets deployed to Cloud Run.
package main

import (
	"context"
	"crypto/rand"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gmestre98/workout-log/backend/internal/api"
	"github.com/gmestre98/workout-log/backend/internal/auth"
	"github.com/gmestre98/workout-log/backend/internal/store"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	ctx := context.Background()

	// --- store ---
	var st store.Store
	switch env("WORKOUT_STORE", "firestore") {
	case "memory":
		st = store.NewMemory()
		log.Println("using in-memory store (data is not persisted)")
	default:
		project := env("GOOGLE_CLOUD_PROJECT", os.Getenv("GCP_PROJECT"))
		if project == "" {
			log.Fatal("GOOGLE_CLOUD_PROJECT is required for the firestore store")
		}
		fs, err := store.NewFirestore(ctx, project, os.Getenv("FIRESTORE_DATABASE"))
		if err != nil {
			log.Fatalf("firestore: %v", err)
		}
		defer fs.Close()
		st = fs
		log.Printf("using firestore store (project %s)", project)
	}

	// --- auth ---
	secret := []byte(os.Getenv("SESSION_SECRET"))
	if len(secret) == 0 {
		secret = make([]byte, 32)
		if _, err := rand.Read(secret); err != nil {
			log.Fatalf("generate session secret: %v", err)
		}
		log.Println("warning: SESSION_SECRET not set; using a random secret (sessions reset on restart)")
	}
	sessions := auth.NewSessionManager(secret, 30*24*time.Hour)
	authSvc := auth.NewService(auth.Config{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		RedirectURL:  os.Getenv("OAUTH_REDIRECT_URL"),
		AllowedEmail: os.Getenv("ALLOWED_EMAIL"),
		SecureCookie: env("COOKIE_SECURE", "true") != "false",
	}, sessions)

	// --- routing ---
	apiHandler := api.New(st)
	mux := http.NewServeMux()
	// Note: "/healthz" is reserved by Google Front End on Cloud Run and never
	// reaches the container, so the health route is exposed as "/livez".
	mux.HandleFunc("GET /livez", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /auth/login", authSvc.Login)
	mux.HandleFunc("GET /auth/callback", authSvc.Callback)
	mux.HandleFunc("POST /auth/logout", authSvc.Logout)
	mux.Handle("GET /auth/me", authSvc.RequireAuth(http.HandlerFunc(authSvc.Me)))
	mux.Handle("/api/", authSvc.RequireAuth(apiHandler.Routes()))
	mux.Handle("/", spaHandler(env("STATIC_DIR", "./web")))

	port := env("PORT", "8080")
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("listening on :%s", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

// spaHandler serves static files from dir, falling back to index.html for
// unknown paths so client-side routing works. If dir is missing it returns a
// small placeholder (useful when running the API without a built frontend).
func spaHandler(dir string) http.Handler {
	index := filepath.Join(dir, "index.html")
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := os.Stat(index); err != nil {
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte("frontend not built; API is running"))
			return
		}
		// Serve real files directly; fall back to index.html otherwise.
		clean := filepath.Clean(r.URL.Path)
		if clean != "/" && !strings.Contains(clean, "..") {
			if _, err := os.Stat(filepath.Join(dir, clean)); err == nil {
				fs.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, index)
	})
}
