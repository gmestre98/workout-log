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

	// saving as current should have marked it current
	if created.Status != domain.StatusCurrent {
		t.Fatalf("expected new version current, got %q", created.Status)
	}

	// rename the version
	resp = do(t, http.MethodPut, srv.URL+"/api/routine/versions/"+created.ID+"/note", map[string]string{"note": "Winter block"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("rename: got %d", resp.StatusCode)
	}
	var renamed domain.RoutineVersion
	json.NewDecoder(resp.Body).Decode(&renamed)
	resp.Body.Close()
	if renamed.Note != "Winter block" {
		t.Fatalf("rename not applied: %q", renamed.Note)
	}
	// renaming a missing version 404s
	resp = do(t, http.MethodPut, srv.URL+"/api/routine/versions/nope/note", map[string]string{"note": "x"})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("rename missing: got %d want 404", resp.StatusCode)
	}
	resp.Body.Close()

	// missing
	resp = do(t, http.MethodGet, srv.URL+"/api/routine/versions/nope", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("get missing version: got %d want 404", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestVersionStatusActivateDelete(t *testing.T) {
	srv, m := newServer()
	defer srv.Close()
	ctx := context.Background()
	m.CreateExercise(ctx, domain.Exercise{ID: "ex-1", Name: "Pull-ups", TimeSlot: "Wake up", Unit: domain.UnitReps, PlannedSets: 4, PlannedAmount: 8, Active: true})

	// v1 saved as current
	v1 := createVersion(t, srv.URL, "v1", domain.StatusCurrent)

	// Change the live routine, then save v2 as a future plan.
	m.ReplaceExercises(ctx, []domain.Exercise{{ID: "ex-2", Name: "Squats", TimeSlot: "Evening", Unit: domain.UnitReps, PlannedSets: 3, PlannedAmount: 12, Active: true}})
	v2 := createVersion(t, srv.URL, "v2", domain.StatusFuture)
	if v2.Status != domain.StatusFuture {
		t.Fatalf("v2 status: got %q want future", v2.Status)
	}

	// Relabel via status endpoint; making it current directly is rejected.
	resp := do(t, http.MethodPut, srv.URL+"/api/routine/versions/"+v2.ID+"/status", map[string]string{"status": "current"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=current should be rejected, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Activate v1: its single exercise should replace the live routine, and it
	// becomes current while any prior current is demoted.
	resp = do(t, http.MethodPost, srv.URL+"/api/routine/versions/"+v1.ID+"/activate", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("activate v1: got %d", resp.StatusCode)
	}
	resp.Body.Close()
	exs, _ := m.ListExercises(ctx)
	if len(exs) != 1 || exs[0].ID != "ex-1" {
		t.Fatalf("activate did not restore v1 exercises: %+v", exs)
	}

	// Now activate v2; v1 must become past.
	resp = do(t, http.MethodPost, srv.URL+"/api/routine/versions/"+v2.ID+"/activate", nil)
	resp.Body.Close()
	list := listVersions(t, srv.URL)
	byID := map[string]domain.VersionStatus{}
	for _, v := range list {
		byID[v.ID] = v.Status
	}
	if byID[v2.ID] != domain.StatusCurrent || byID[v1.ID] != domain.StatusPast {
		t.Fatalf("statuses after activate: v1=%q v2=%q", byID[v1.ID], byID[v2.ID])
	}

	// Delete v1.
	resp = do(t, http.MethodDelete, srv.URL+"/api/routine/versions/"+v1.ID, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete v1: got %d", resp.StatusCode)
	}
	resp.Body.Close()
	if len(listVersions(t, srv.URL)) != 1 {
		t.Fatalf("expected 1 version after delete")
	}

	// Deleting a missing version 404s.
	resp = do(t, http.MethodDelete, srv.URL+"/api/routine/versions/nope", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("delete missing: got %d want 404", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestVersionSchedule(t *testing.T) {
	srv, m := newServer()
	defer srv.Close()
	ctx := context.Background()
	m.CreateExercise(ctx, domain.Exercise{ID: "ex-1", Name: "Pull-ups", TimeSlot: "Wake up", Unit: domain.UnitReps, PlannedSets: 4, PlannedAmount: 8, Active: true})
	v := createVersion(t, srv.URL, "July block", domain.StatusCurrent)

	// Empty schedule to start.
	if got := getSchedule(t, srv.URL); len(got) != 0 {
		t.Fatalf("expected empty schedule, got %d", len(got))
	}

	// Assigning to a bad date is rejected.
	resp := do(t, http.MethodPut, srv.URL+"/api/routine/schedule/2026-7-1", map[string]string{"versionId": v.ID})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad date: got %d want 400", resp.StatusCode)
	}
	resp.Body.Close()

	// Assigning an unknown version is rejected.
	resp = do(t, http.MethodPut, srv.URL+"/api/routine/schedule/2026-07-01", map[string]string{"versionId": "nope"})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown version: got %d want 404", resp.StatusCode)
	}
	resp.Body.Close()

	// Valid assignment.
	resp = do(t, http.MethodPut, srv.URL+"/api/routine/schedule/2026-07-01", map[string]string{"versionId": v.ID})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("assign: got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Re-assigning the same date replaces (still one entry).
	v2 := createVersion(t, srv.URL, "July revision", domain.StatusFuture)
	resp = do(t, http.MethodPut, srv.URL+"/api/routine/schedule/2026-07-01", map[string]string{"versionId": v2.ID})
	resp.Body.Close()
	sched := getSchedule(t, srv.URL)
	if len(sched) != 1 || sched[0].VersionID != v2.ID || sched[0].StartDate != "2026-07-01" {
		t.Fatalf("expected single replaced assignment, got %+v", sched)
	}

	// A second boundary, listed oldest-first.
	do(t, http.MethodPut, srv.URL+"/api/routine/schedule/2026-08-01", map[string]string{"versionId": v.ID}).Body.Close()
	sched = getSchedule(t, srv.URL)
	if len(sched) != 2 || sched[0].StartDate != "2026-07-01" || sched[1].StartDate != "2026-08-01" {
		t.Fatalf("expected two ordered assignments, got %+v", sched)
	}

	// Delete one.
	resp = do(t, http.MethodDelete, srv.URL+"/api/routine/schedule/2026-07-01", nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete assignment: got %d", resp.StatusCode)
	}
	resp.Body.Close()
	if len(getSchedule(t, srv.URL)) != 1 {
		t.Fatalf("expected 1 assignment after delete")
	}
	// Deleting a missing boundary 404s.
	resp = do(t, http.MethodDelete, srv.URL+"/api/routine/schedule/2020-01-01", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("delete missing: got %d want 404", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestLoadVersionIntoRoutine(t *testing.T) {
	srv, m := newServer()
	defer srv.Close()
	ctx := context.Background()
	m.CreateExercise(ctx, domain.Exercise{ID: "ex-1", Name: "Pull-ups", TimeSlot: "Wake up", Unit: domain.UnitReps, PlannedSets: 4, PlannedAmount: 8, Active: true})
	v := createVersion(t, srv.URL, "base", domain.StatusCurrent)

	// Change the live routine so we can prove load overwrites it.
	m.ReplaceExercises(ctx, []domain.Exercise{{ID: "ex-9", Name: "Squats", TimeSlot: "Evening", Unit: domain.UnitReps, PlannedSets: 3, PlannedAmount: 12, Active: true}})

	resp := do(t, http.MethodPost, srv.URL+"/api/routine/versions/"+v.ID+"/load", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("load: got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Live routine is now the version's exercises, IDs preserved.
	exs, _ := m.ListExercises(ctx)
	if len(exs) != 1 || exs[0].ID != "ex-1" || exs[0].Name != "Pull-ups" {
		t.Fatalf("load did not restore version exercises: %+v", exs)
	}
	// Statuses are untouched: the version is still current, none demoted.
	vv, _ := m.GetRoutineVersion(ctx, v.ID)
	if vv.Status != domain.StatusCurrent {
		t.Fatalf("load should not change status, got %q", vv.Status)
	}

	// Unknown version 404s.
	resp = do(t, http.MethodPost, srv.URL+"/api/routine/versions/nope/load", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("load missing: got %d want 404", resp.StatusCode)
	}
	resp.Body.Close()
}

func getSchedule(t *testing.T, base string) []domain.VersionAssignment {
	t.Helper()
	resp := do(t, http.MethodGet, base+"/api/routine/schedule", nil)
	var out []domain.VersionAssignment
	json.NewDecoder(resp.Body).Decode(&out)
	resp.Body.Close()
	return out
}

func createVersion(t *testing.T, base, note string, s domain.VersionStatus) domain.RoutineVersion {
	t.Helper()
	resp := do(t, http.MethodPost, base+"/api/routine/versions", map[string]string{"note": note, "status": string(s)})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create version %q: got %d", note, resp.StatusCode)
	}
	var v domain.RoutineVersion
	json.NewDecoder(resp.Body).Decode(&v)
	resp.Body.Close()
	return v
}

func listVersions(t *testing.T, base string) []domain.RoutineVersion {
	t.Helper()
	resp := do(t, http.MethodGet, base+"/api/routine/versions", nil)
	var list []domain.RoutineVersion
	json.NewDecoder(resp.Body).Decode(&list)
	resp.Body.Close()
	return list
}
