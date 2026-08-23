package export

import (
	"errors"
	"testing"

	"github.com/gmestre98/workout-log/backend/internal/domain"
	"google.golang.org/api/googleapi"
)

func TestTransientClassifiesRetryable(t *testing.T) {
	if !transient(&googleapi.Error{Code: 503}) {
		t.Fatal("503 should be transient")
	}
	if !transient(&googleapi.Error{Code: 429}) {
		t.Fatal("429 should be transient")
	}
	if transient(&googleapi.Error{Code: 400}) {
		t.Fatal("400 must not be transient")
	}
	if transient(errors.New("boom")) {
		t.Fatal("non-API error must not be transient")
	}
}

func ex(id, name string, active bool) domain.Exercise {
	return domain.Exercise{ID: id, Name: name, Active: active, Unit: domain.UnitReps, PlannedSets: 2, PlannedAmount: 10}
}

// oneSet returns a log with n sets each completed with the given amount.
func exLog(id string, planned, amount int, sets int) domain.ExerciseLog {
	l := domain.ExerciseLog{ExerciseID: id, PlannedSets: sets, PlannedAmount: planned, Unit: domain.UnitReps}
	for i := 0; i < sets; i++ {
		l.Sets = append(l.Sets, domain.SetEntry{Completed: true, ActualAmount: amount})
	}
	return l
}

func TestActiveExercisesFilters(t *testing.T) {
	got := activeExercises([]domain.Exercise{ex("a", "A", true), ex("b", "B", false), ex("c", "C", true)})
	if len(got) != 2 || got[0].ID != "a" || got[1].ID != "c" {
		t.Fatalf("activeExercises = %+v", got)
	}
}

func TestDailyLogRowsShapeAndBlanks(t *testing.T) {
	active := []domain.Exercise{ex("a", "Pull-ups", true), ex("b", "Squats", true)}
	days := []domain.DayLog{
		{Date: "2026-01-01", Exercises: map[string]domain.ExerciseLog{
			"a": exLog("a", 10, 10, 2), // full
		}},
	}
	rows := dailyLogRows(active, days)
	if len(rows) != 2 {
		t.Fatalf("want header+1 row, got %d", len(rows))
	}
	// Header: Date, Pull-ups, Squats, Day average
	header := rows[0]
	if len(header) != 4 || header[0] != "Date" || header[3] != "Day average" {
		t.Fatalf("header = %+v", header)
	}
	row := rows[1]
	if row[0] != "2026-01-01" {
		t.Fatalf("date cell = %v", row[0])
	}
	if row[1] != 1.0 { // exercise a fully completed
		t.Fatalf("cell a = %v, want 1.0", row[1])
	}
	if row[2] != nil { // exercise b not logged -> blank
		t.Fatalf("cell b = %v, want nil", row[2])
	}
	// Day average counts b as 0: (1 + 0) / 2 = 0.5
	if row[3] != 0.5 {
		t.Fatalf("day average = %v, want 0.5", row[3])
	}
}

func TestMonthlySummaryGroupsAndTotals(t *testing.T) {
	active := []domain.Exercise{ex("a", "A", true)}
	days := []domain.DayLog{
		{Date: "2026-01-05", Exercises: map[string]domain.ExerciseLog{"a": exLog("a", 10, 10, 2)}}, // 100%
		{Date: "2026-01-20", Exercises: map[string]domain.ExerciseLog{}},                            // 0%
		{Date: "2026-02-01", Exercises: map[string]domain.ExerciseLog{"a": exLog("a", 10, 5, 2)}},   // 50%
	}
	rows := monthlySummaryRows(active, days)
	// header + Jan + Feb + All
	if len(rows) != 4 {
		t.Fatalf("want 4 rows, got %d: %+v", len(rows), rows)
	}
	if rows[1][0] != "2026-01" || rows[2][0] != "2026-02" || rows[3][0] != "All" {
		t.Fatalf("month labels = %v %v %v", rows[1][0], rows[2][0], rows[3][0])
	}
	// Jan: 2 days logged, days>0% = 1
	if rows[1][1] != 2 || rows[1][3] != 1 {
		t.Fatalf("jan row = %+v", rows[1])
	}
	// All: 3 days
	if rows[3][1] != 3 {
		t.Fatalf("all row days = %v", rows[3][1])
	}
}

func TestMonthlySummaryEmptyIsHeaderOnly(t *testing.T) {
	rows := monthlySummaryRows(nil, nil)
	if len(rows) != 1 {
		t.Fatalf("empty summary should be header only, got %d", len(rows))
	}
}

func TestRoutineRowsFields(t *testing.T) {
	e := domain.Exercise{
		ID: "a", TimeSlot: "Wake up", Name: "Plank", PlannedSets: 3, PlannedAmount: 30,
		Unit: domain.UnitSeconds, RestSeconds: 60, MuscleGroup: "Core", Equipment: "None",
		PerSide: true, Active: false, Note: "slow",
	}
	rows := routineRows([]domain.Exercise{e})
	if len(rows) != 2 {
		t.Fatalf("want header+1, got %d", len(rows))
	}
	got := rows[1]
	// Time slot, Name, Sets, Amount, Unit, Rest, Muscle, Equip, PerSide, Active, Note
	if got[1] != "Plank" || got[4] != "seconds" || got[8] != "Yes" || got[9] != "No" || got[10] != "slow" {
		t.Fatalf("routine row = %+v", got)
	}
}

func TestVersionRowsCount(t *testing.T) {
	vs := []domain.RoutineVersion{
		{ID: "v1", Note: "first", Status: domain.StatusCurrent, Exercises: []domain.Exercise{ex("a", "A", true)}},
	}
	rows := versionRows(vs)
	if len(rows) != 2 || rows[1][1] != "first" || rows[1][3] != 1 {
		t.Fatalf("version rows = %+v", rows)
	}
}
