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
	mux.HandleFunc("DELETE /api/routine/versions/{id}", h.deleteVersion)
	mux.HandleFunc("PUT /api/routine/versions/{id}/status", h.setVersionStatus)
	mux.HandleFunc("POST /api/routine/versions/{id}/activate", h.activateVersion)
	mux.HandleFunc("POST /api/routine/versions/{id}/load", h.loadVersion)
	mux.HandleFunc("GET /api/routine/schedule", h.listSchedule)
	mux.HandleFunc("PUT /api/routine/schedule/{date}", h.setAssignment)
	mux.HandleFunc("DELETE /api/routine/schedule/{date}", h.deleteAssignment)
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
// from the client. Status defaults to "current" (which demotes any prior
// current version to "past"); a client may instead save it as a "future" plan.
func (h *Handler) createVersion(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Note   string               `json:"note"`
		Status domain.VersionStatus `json:"status"`
	}
	// Body is optional; ignore decode errors on empty body.
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Status == "" {
		body.Status = domain.StatusCurrent
	}
	if !body.Status.Valid() {
		writeErr(w, http.StatusBadRequest, "status must be current, future or past")
		return
	}

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
		Status:    body.Status,
		Exercises: exercises,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Enforce the single-current invariant when saving directly as current.
	if body.Status == domain.StatusCurrent {
		if err := h.store.SetRoutineVersionStatus(r.Context(), v.ID, domain.StatusCurrent); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusCreated, v)
}

func (h *Handler) deleteVersion(w http.ResponseWriter, r *http.Request) {
	err := h.store.DeleteRoutineVersion(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "version not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// setVersionStatus relabels a version as "future" or "past". Marking a version
// "current" is done through activateVersion, which also swaps in its exercises.
func (h *Handler) setVersionStatus(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status domain.VersionStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Status != domain.StatusFuture && body.Status != domain.StatusPast {
		writeErr(w, http.StatusBadRequest, "status must be future or past (use activate to make current)")
		return
	}
	err := h.store.SetRoutineVersionStatus(r.Context(), r.PathValue("id"), body.Status)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "version not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	v, err := h.store.GetRoutineVersion(r.Context(), r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// activateVersion makes a version the current routine: its snapshot replaces
// the live exercises and it is marked current (demoting the previous current to
// past). This is how the user switches which workout version they are using.
func (h *Handler) activateVersion(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	v, err := h.store.GetRoutineVersion(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "version not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.ReplaceExercises(r.Context(), v.Exercises); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.SetRoutineVersionStatus(r.Context(), id, domain.StatusCurrent); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	v.Status = domain.StatusCurrent
	writeJSON(w, http.StatusOK, v)
}

// loadVersion copies a version's exercises into the live editable routine
// WITHOUT changing any version status. It is the basis for "create a routine
// from an existing one": load a copy, tweak a few exercises in the routine
// editor, then save it as a new version — no need to re-enter every exercise.
// Exercise IDs are preserved so day logs for unchanged exercises stay aligned.
func (h *Handler) loadVersion(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	v, err := h.store.GetRoutineVersion(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "version not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.ReplaceExercises(r.Context(), v.Exercises); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	exercises := v.Exercises
	if exercises == nil {
		exercises = []domain.Exercise{}
	}
	writeJSON(w, http.StatusOK, exercises)
}

// listSchedule returns the version schedule: which routine version was in
// effect from which date, oldest first. It is a record/label only.
func (h *Handler) listSchedule(w http.ResponseWriter, r *http.Request) {
	assignments, err := h.store.ListVersionAssignments(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if assignments == nil {
		assignments = []domain.VersionAssignment{}
	}
	writeJSON(w, http.StatusOK, assignments)
}

// setAssignment records that a version is in effect starting on {date}. The
// date is the boundary key, so re-assigning the same date replaces it.
func (h *Handler) setAssignment(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if !dateRe.MatchString(date) {
		writeErr(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	var body struct {
		VersionID string `json:"versionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.VersionID == "" {
		writeErr(w, http.StatusBadRequest, "versionId is required")
		return
	}
	// Reject assignments that point at a version that does not exist.
	if _, err := h.store.GetRoutineVersion(r.Context(), body.VersionID); errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "version not found")
		return
	} else if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	a := domain.VersionAssignment{StartDate: date, VersionID: body.VersionID}
	if err := h.store.SetVersionAssignment(r.Context(), a); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (h *Handler) deleteAssignment(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if !dateRe.MatchString(date) {
		writeErr(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	err := h.store.DeleteVersionAssignment(r.Context(), date)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "assignment not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
