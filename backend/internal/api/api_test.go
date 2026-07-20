package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/workout-log/backend/internal/domain"
	"github.com/gmestre98/workout-log/backend/internal/stats"
	"github.com/gmestre98/workout-log/backend/internal/store"
)

func newServer() (*httptest.Server, *store.Memory) {
	m := store.NewMemory()
	srv := httptest.NewServer(New(m).Routes())
	return srv, m
}

func do(t *testing.T, method, url string, body any) *http.Response {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req, err := http.NewRequestWithContext(context.Background(), method, url, &buf)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestCreateAndListExercise(t *testing.T) {
	srv, _ := newServer()
	defer srv.Close()

	ex := domain.Exercise{Name: "Pull-ups", TimeSlot: "Wake up", Unit: domain.UnitReps, PlannedSets: 4, PlannedAmount: 8, Active: true}
	resp := do(t, http.MethodPost, srv.URL+"/api/exercises", ex)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: got %d", resp.StatusCode)
	}
	var created domain.Exercise
	json.NewDecoder(resp.Body).Decode(&created)
	resp.Body.Close()
	if created.ID == "" {
		t.Fatal("expected generated id")
	}

	resp = do(t, http.MethodGet, srv.URL+"/api/exercises", nil)
	var list []domain.Exercise
	json.NewDecoder(resp.Body).Decode(&list)
	resp.Body.Close()
	if len(list) != 1 || list[0].Name != "Pull-ups" {
		t.Fatalf("unexpected list %+v", list)
	}
}

func TestCreateExerciseValidation(t *testing.T) {
	srv, _ := newServer()
	defer srv.Close()
	bad := domain.Exercise{Name: "", TimeSlot: "Wake up", Unit: domain.UnitReps, PlannedSets: 1, PlannedAmount: 1}
	resp := do(t, http.MethodPost, srv.URL+"/api/exercises", bad)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d want 400", resp.StatusCode)
	}
}

func TestGetMissingExercise404(t *testing.T) {
	srv, _ := newServer()
	defer srv.Close()
	resp := do(t, http.MethodGet, srv.URL+"/api/exercises/nope", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("got %d want 404", resp.StatusCode)
	}
}

func TestSaveAndGetDay(t *testing.T) {
	srv, _ := newServer()
	defer srv.Close()
	day := domain.DayLog{Exercises: map[string]domain.ExerciseLog{
		"ex-1": {ExerciseID: "ex-1", PlannedSets: 2, PlannedAmount: 10, Unit: domain.UnitReps,
			Sets: []domain.SetEntry{{Completed: true, ActualAmount: 10}, {Completed: true, ActualAmount: 8}}},
	}}
	resp := do(t, http.MethodPut, srv.URL+"/api/days/2026-07-18", day)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save day: got %d", resp.StatusCode)
	}
	resp.Body.Close()

	resp = do(t, http.MethodGet, srv.URL+"/api/days/2026-07-18", nil)
	var got domain.DayLog
	json.NewDecoder(resp.Body).Decode(&got)
	resp.Body.Close()
	if got.Date != "2026-07-18" || len(got.Exercises) != 1 {
		t.Fatalf("unexpected day %+v", got)
	}
}

func TestBadDateRejected(t *testing.T) {
	srv, _ := newServer()
	defer srv.Close()
	resp := do(t, http.MethodGet, srv.URL+"/api/days/18-07-2026", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d want 400", resp.StatusCode)
	}
}

func TestSummary(t *testing.T) {
	srv, m := newServer()
	defer srv.Close()
	ctx := context.Background()
	a, _ := m.CreateExercise(ctx, domain.Exercise{ID: "ex-1", Name: "A", TimeSlot: "Wake up", Unit: domain.UnitReps, PlannedSets: 1, PlannedAmount: 10, Active: true})
	full := domain.ExerciseLog{ExerciseID: a.ID, PlannedSets: 1, PlannedAmount: 10, Sets: []domain.SetEntry{{Completed: true, ActualAmount: 10}}}
	m.SaveDay(ctx, domain.DayLog{Date: "2026-07-01", Exercises: map[string]domain.ExerciseLog{a.ID: full}})
	m.SaveDay(ctx, domain.DayLog{Date: "2026-07-02", Exercises: map[string]domain.ExerciseLog{}})

	resp := do(t, http.MethodGet, srv.URL+"/api/summary?from=2026-07-01&to=2026-07-31", nil)
	var s stats.Summary
	json.NewDecoder(resp.Body).Decode(&s)
	resp.Body.Close()
	if s.Days != 2 || s.DaysAbove0 != 1 {
		t.Fatalf("unexpected summary %+v", s)
	}
}

func TestSummaryRequiresDates(t *testing.T) {
	srv, _ := newServer()
	defer srv.Close()
	resp := do(t, http.MethodGet, srv.URL+"/api/summary", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d want 400", resp.StatusCode)
	}
}

func TestListDays(t *testing.T) {
	srv, m := newServer()
	defer srv.Close()
	ctx := context.Background()
	m.SaveDay(ctx, domain.DayLog{Date: "2026-07-03", Exercises: map[string]domain.ExerciseLog{}})
	m.SaveDay(ctx, domain.DayLog{Date: "2026-07-10", Exercises: map[string]domain.ExerciseLog{}})
	m.SaveDay(ctx, domain.DayLog{Date: "2026-08-01", Exercises: map[string]domain.ExerciseLog{}})

	resp := do(t, http.MethodGet, srv.URL+"/api/days?from=2026-07-01&to=2026-07-31", nil)
	var days []domain.DayLog
	json.NewDecoder(resp.Body).Decode(&days)
	resp.Body.Close()
	if len(days) != 2 {
		t.Fatalf("expected 2 July days, got %d", len(days))
	}
}

func TestListDaysRequiresDates(t *testing.T) {
	srv, _ := newServer()
	defer srv.Close()
	resp := do(t, http.MethodGet, srv.URL+"/api/days?from=bad", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d want 400", resp.StatusCode)
	}
}

func TestRoutineVersionsFlow(t *testing.T) {
	srv, m := newServer()
	defer srv.Close()
	ctx := context.Background()
	m.CreateExercise(ctx, domain.Exercise{ID: "ex-1", Name: "Pull-ups", TimeSlot: "Wake up", Unit: domain.UnitReps, PlannedSets: 4, PlannedAmount: 8, Active: true})

	// snapshot current routine
	resp := do(t, http.MethodPost, srv.URL+"/api/routine/versions", map[string]string{"note": "first cut"})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create version: got %d", resp.StatusCode)
	}
	var created domain.RoutineVersion
	json.NewDecoder(resp.Body).Decode(&created)
	resp.Body.Close()
	if created.ID == "" || len(created.Exercises) != 1 || created.Note != "first cut" {
		t.Fatalf("unexpected version %+v", created)
	}

	// list
	resp = do(t, http.MethodGet, srv.URL+"/api/routine/versions", nil)
	var list []domain.RoutineVersion
	json.NewDecoder(resp.Body).Decode(&list)
	resp.Body.Close()
	if len(list) != 1 {
		t.Fatalf("expected 1 version, got %d", len(list))
	}

	// get by id
	resp = do(t, http.MethodGet, srv.URL+"/api/routine/versions/"+created.ID, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get version: got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// missing
	resp = do(t, http.MethodGet, srv.URL+"/api/routine/versions/nope", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("get missing version: got %d want 404", resp.StatusCode)
	}
	resp.Body.Close()
}
