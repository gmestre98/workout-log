// Package api exposes the REST handlers over a Store. Handlers depend only on
// the store.Store interface, so they are tested against the in-memory store.
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/gmestre98/workout-log/backend/internal/domain"
	"github.com/gmestre98/workout-log/backend/internal/stats"
	"github.com/gmestre98/workout-log/backend/internal/store"
)

// Handler serves the JSON API.
type Handler struct {
	store store.Store
}

// New returns a Handler backed by s.
func New(s store.Store) *Handler { return &Handler{store: s} }

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// Routes returns the API mux. All routes are relative to /api and expect the
// caller to have already applied auth middleware.
func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/exercises", h.listExercises)
	mux.HandleFunc("POST /api/exercises", h.createExercise)
	mux.HandleFunc("GET /api/exercises/{id}", h.getExercise)
	mux.HandleFunc("PUT /api/exercises/{id}", h.updateExercise)
	mux.HandleFunc("DELETE /api/exercises/{id}", h.deleteExercise)
	mux.HandleFunc("GET /api/days", h.listDays)
	mux.HandleFunc("GET /api/days/{date}", h.getDay)
	mux.HandleFunc("PUT /api/days/{date}", h.saveDay)
	mux.HandleFunc("GET /api/summary", h.summary)
	mux.HandleFunc("GET /api/routine/versions", h.listVersions)
	mux.HandleFunc("POST /api/routine/versions", h.createVersion)
	mux.HandleFunc("GET /api/routine/versions/{id}", h.getVersion)
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// validateExercise returns a human-readable reason if e is invalid.
func validateExercise(e domain.Exercise) string {
	if e.Name == "" {
		return "name is required"
	}
	if e.TimeSlot == "" {
		return "timeSlot is required"
	}
	if !e.Unit.Valid() {
		return "unit must be reps, seconds or minutes"
	}
	if e.PlannedSets <= 0 {
		return "plannedSets must be > 0"
	}
	if e.PlannedAmount <= 0 {
		return "plannedAmount must be > 0"
	}
	return ""
}

func (h *Handler) listExercises(w http.ResponseWriter, r *http.Request) {
	list, err := h.store.ListExercises(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if list == nil {
		list = []domain.Exercise{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) createExercise(w http.ResponseWriter, r *http.Request) {
	var e domain.Exercise
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	e.ID = "" // server assigns
	if msg := validateExercise(e); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	created, err := h.store.CreateExercise(r.Context(), e)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *Handler) getExercise(w http.ResponseWriter, r *http.Request) {
	e, err := h.store.GetExercise(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "exercise not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func (h *Handler) updateExercise(w http.ResponseWriter, r *http.Request) {
	var e domain.Exercise
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	e.ID = r.PathValue("id")
	if msg := validateExercise(e); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	err := h.store.UpdateExercise(r.Context(), e)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "exercise not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func (h *Handler) deleteExercise(w http.ResponseWriter, r *http.Request) {
	err := h.store.DeleteExercise(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "exercise not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) getDay(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if !dateRe.MatchString(date) {
		writeErr(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	d, err := h.store.GetDay(r.Context(), date)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (h *Handler) saveDay(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if !dateRe.MatchString(date) {
		writeErr(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	var d domain.DayLog
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	d.Date = date // path is the source of truth
	if d.Exercises == nil {
		d.Exercises = map[string]domain.ExerciseLog{}
	}
	if err := h.store.SaveDay(r.Context(), d); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (h *Handler) listDays(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if !dateRe.MatchString(from) || !dateRe.MatchString(to) {
		writeErr(w, http.StatusBadRequest, "from and to must be YYYY-MM-DD")
		return
	}
	days, err := h.store.ListDays(r.Context(), from, to)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if days == nil {
		days = []domain.DayLog{}
	}
	writeJSON(w, http.StatusOK, days)
}

func (h *Handler) listVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := h.store.ListRoutineVersions(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if versions == nil {
		versions = []domain.RoutineVersion{}
	}
	writeJSON(w, http.StatusOK, versions)
}

func (h *Handler) getVersion(w http.ResponseWriter, r *http.Request) {
	v, err := h.store.GetRoutineVersion(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "version not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// createVersion snapshots the current routine. The note is optional; the
// exercise list is always taken from the server's current state, never trusted
// from the client.
func (h *Handler) createVersion(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Note string `json:"note"`
	}
	// Body is optional; ignore decode errors on empty body.
	_ = json.NewDecoder(r.Body).Decode(&body)

	exercises, err := h.store.ListExercises(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if exercises == nil {
		exercises = []domain.Exercise{}
	}
	v, err := h.store.CreateRoutineVersion(r.Context(), domain.RoutineVersion{
		CreatedAt: time.Now().UTC(),
		Note:      body.Note,
		Exercises: exercises,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

func (h *Handler) summary(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if !dateRe.MatchString(from) || !dateRe.MatchString(to) {
		writeErr(w, http.StatusBadRequest, "from and to must be YYYY-MM-DD")
		return
	}
	exercises, err := h.store.ListExercises(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	active := make([]domain.Exercise, 0, len(exercises))
	for _, e := range exercises {
		if e.Active {
			active = append(active, e)
		}
	}
	days, err := h.store.ListDays(r.Context(), from, to)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stats.Summarize(active, days))
}
