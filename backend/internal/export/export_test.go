package export

import (
	"errors"
	"testing"
	"time"

	"github.com/gmestre98/workout-log/backend/internal/domain"
	"google.golang.org/api/googleapi"
)

func ex(id, name string) domain.Exercise {
	return domain.Exercise{ID: id, Name: name, Active: true, Unit: domain.UnitReps, PlannedSets: 2, PlannedAmount: 10}
}

// fullLog returns a fully-completed log (100%) for an exercise with `sets` sets.
func fullLog(id string, sets int) domain.ExerciseLog {
	l := domain.ExerciseLog{ExerciseID: id, PlannedSets: sets, PlannedAmount: 10, Unit: domain.UnitReps}
	for i := 0; i < sets; i++ {
		l.Sets = append(l.Sets, domain.SetEntry{Completed: true, ActualAmount: 10})
	}
	return l
}

func day(date string, ids ...string) domain.DayLog {
	d := domain.NewDayLog(date)
	for _, id := range ids {
		d.Exercises[id] = fullLog(id, 2)
	}
	return d
}

func TestJaccard(t *testing.T) {
	a := map[string]bool{"x": true, "y": true, "z": true}
	if got := jaccard(a, map[string]bool{"x": true, "y": true, "z": true}); got != 1.0 {
		t.Fatalf("identical sets = %v, want 1", got)
	}
	if got := jaccard(a, map[string]bool{"x": true, "y": true, "z": true, "w": true}); got != 0.75 {
		t.Fatalf("subset-of-superset = %v, want 0.75", got)
	}
	if got := jaccard(map[string]bool{}, map[string]bool{}); got != 0 {
		t.Fatalf("empty = %v, want 0", got)
	}
}

// A day is attributed to the routine it best fits, even when a newer routine is
// a superset of the old one's exercises.
func TestAttributeByLoggedExercises(t *testing.T) {
	old := domain.RoutineVersion{
		CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Note: "Old", Status: domain.StatusPast,
		Exercises: []domain.Exercise{ex("a", "A"), ex("b", "B"), ex("c", "C")},
	}
	neu := domain.RoutineVersion{
		CreatedAt: time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC), Note: "New", Status: domain.StatusCurrent,
		Exercises: []domain.Exercise{ex("a", "A"), ex("b", "B"), ex("c", "C"), ex("g", "G")},
	}
	routines := buildRoutines(Data{Versions: []domain.RoutineVersion{old, neu}})
	// Newest first: index 0 = New, index 1 = Old.
	if !routines[0].current || routines[0].name != "New" {
		t.Fatalf("routines[0] = %+v, want current New", routines[0])
	}

	if got := attribute(day("2026-01-05", "a", "b", "c"), routines); got != 1 {
		t.Fatalf("old-style day attributed to index %d, want 1 (Old)", got)
	}
	if got := attribute(day("2026-06-05", "a", "b", "c", "g"), routines); got != 0 {
		t.Fatalf("new-style day attributed to index %d, want 0 (New)", got)
	}
	if got := attribute(domain.NewDayLog("2026-06-06"), routines); got != -1 {
		t.Fatalf("empty day attributed to %d, want -1", got)
	}
}

func TestBuildRoutinesFallbackToCurrent(t *testing.T) {
	routines := buildRoutines(Data{Exercises: []domain.Exercise{ex("a", "A")}})
	if len(routines) != 1 || routines[0].name != "Current" || !routines[0].current {
		t.Fatalf("fallback routines = %+v", routines)
	}
}

// The bug fix: an old day scores against its own routine, not 0% against the
// current one.
func TestSummaryScoresOldDaysCorrectly(t *testing.T) {
	old := domain.RoutineVersion{
		CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Note: "Old", Status: domain.StatusPast,
		Exercises: []domain.Exercise{ex("a", "A"), ex("b", "B")},
	}
	neu := domain.RoutineVersion{
		CreatedAt: time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC), Note: "New", Status: domain.StatusCurrent,
		Exercises: []domain.Exercise{ex("x", "X"), ex("y", "Y")},
	}
	d := Data{
		Versions: []domain.RoutineVersion{old, neu},
		Days:     []domain.DayLog{day("2026-01-10", "a", "b")}, // fully done on the OLD routine
	}
	routines := buildRoutines(d)
	attr := map[string]int{"2026-01-10": attribute(d.Days[0], routines)}
	g := summaryGrid(d, routines, attr)
	// rows: header, Jan row, All row. Jan avg completion is column index 2.
	if len(g.rows) != 3 {
		t.Fatalf("summary rows = %d, want 3", len(g.rows))
	}
	if g.rows[1][0] != "January 2026" || g.rows[1][2] != 1.0 {
		t.Fatalf("Jan row = %+v, want avg 1.0", g.rows[1])
	}
}

func TestRoutineGridMonthlyTables(t *testing.T) {
	r := routine{name: "R", active: []domain.Exercise{ex("a", "A"), ex("b", "B")}, ids: map[string]bool{"a": true, "b": true}}
	days := []domain.DayLog{
		day("2026-01-05", "a", "b"),
		day("2026-02-05", "a"),
	}
	g := routineGrid(r, days)

	months, headers := 0, 0
	for _, row := range g.rows {
		if len(row) == 1 {
			if s, _ := row[0].(string); s == "January 2026" || s == "February 2026" {
				months++
			}
		}
		if len(row) > 0 {
			if s, _ := row[0].(string); s == "Date" {
				headers++
			}
		}
	}
	if months != 2 {
		t.Fatalf("month titles = %d, want 2", months)
	}
	if headers != 2 {
		t.Fatalf("header rows = %d, want 2 (one per month)", headers)
	}
	// Ensure a colour-scale format was emitted for the data blocks.
	var scales int
	for _, f := range g.fmts {
		if f.kind == fmtColorScale {
			scales++
		}
	}
	if scales != 2 {
		t.Fatalf("colour-scale ranges = %d, want 2", scales)
	}
}

func TestRoutineGridEmptyStillHasHeader(t *testing.T) {
	r := routine{name: "R", active: []domain.Exercise{ex("a", "A")}, ids: map[string]bool{"a": true}}
	g := routineGrid(r, nil)
	if len(g.rows) != 1 || g.rows[0][0] != "Date" {
		t.Fatalf("empty routine grid = %+v, want a single header row", g.rows)
	}
}

func TestSanitizeAndDedupeTitles(t *testing.T) {
	if got := sanitizeTitle("Legs / Push [A]"); got != "Legs   Push  A" {
		t.Fatalf("sanitizeTitle = %q", got)
	}
	if got := sanitizeTitle("   "); got != "Sheet" {
		t.Fatalf("blank title = %q, want Sheet", got)
	}
	grids := []cellGrid{{title: "Push"}, {title: "Push"}, {title: "Push"}}
	dedupeTitles(grids)
	if grids[0].title != "Push" || grids[1].title != "Push (2)" || grids[2].title != "Push (3)" {
		t.Fatalf("dedupe = %q, %q, %q", grids[0].title, grids[1].title, grids[2].title)
	}
}

func TestMonthLabel(t *testing.T) {
	if got := monthLabel("2026-01"); got != "January 2026" {
		t.Fatalf("monthLabel = %q", got)
	}
	if got := monthLabel("weird"); got != "weird" {
		t.Fatalf("monthLabel fallback = %q", got)
	}
}

func TestRoutineConfigGridFields(t *testing.T) {
	e := domain.Exercise{
		ID: "a", TimeSlot: "Wake up", Name: "Plank", PlannedSets: 3, PlannedAmount: 30,
		Unit: domain.UnitSeconds, RestSeconds: 60, MuscleGroup: "Core", Equipment: "None",
		PerSide: true, Active: false, Note: "slow",
	}
	g := routineConfigGrid([]domain.Exercise{e})
	got := g.rows[1]
	if got[1] != "Plank" || got[4] != "seconds" || got[8] != "Yes" || got[9] != "No" || got[10] != "slow" {
		t.Fatalf("routine config row = %+v", got)
	}
	if got[11] != "" {
		t.Fatalf("travel column should be empty for a plain exercise, got %v", got[11])
	}
}

func TestRoutineConfigGridTravelColumn(t *testing.T) {
	e := domain.Exercise{
		ID: "a", TimeSlot: "Main", Name: "Pull-ups", PlannedSets: 4, PlannedAmount: 8, Unit: domain.UnitReps, Active: true,
		Travel: &domain.TravelVariant{Name: "Backpack rows", PlannedSets: 3, PlannedAmount: 15, Unit: domain.UnitReps},
	}
	g := routineConfigGrid([]domain.Exercise{e})
	if got := g.rows[1][11]; got != "Backpack rows (3×15 reps)" {
		t.Fatalf("travel column = %v", got)
	}
}

func TestBuildGridsShape(t *testing.T) {
	d := Data{
		Exercises: []domain.Exercise{ex("x", "X")},
		Versions: []domain.RoutineVersion{{
			CreatedAt: time.Now(), Note: "Cur", Status: domain.StatusCurrent,
			Exercises: []domain.Exercise{ex("x", "X")},
		}},
		Days: []domain.DayLog{day("2026-03-01", "x")},
	}
	grids := buildGrids(d)
	// Summary + 1 routine + Routine + Versions
	if len(grids) != 4 {
		t.Fatalf("grids = %d, want 4: %v", len(grids), titles(grids))
	}
	// The routine tab is titled by the month-year span of its days, not the note.
	if grids[0].title != "Summary" || grids[1].title != "March 2026" {
		t.Fatalf("grid titles = %v", titles(grids))
	}
}

func TestMonthSpanLabel(t *testing.T) {
	cases := []struct{ lo, hi, want string }{
		{"2026-05-03", "2026-05-28", "May 2026"},
		{"2026-05-03", "2026-07-20", "May–Jul 2026"},
		{"2025-11-10", "2026-02-05", "Nov 2025 – Feb 2026"},
		{"bad", "2026-02-05", "bad"},
	}
	for _, c := range cases {
		if got := monthSpanLabel(c.lo, c.hi); got != c.want {
			t.Fatalf("monthSpanLabel(%q,%q) = %q, want %q", c.lo, c.hi, got, c.want)
		}
	}
}

// Days are filed to the version the schedule says was in effect on their date —
// not to whichever routine's exercises they happen to overlap. This is the fix
// for a routine's tab showing days from other months.
func TestScheduleAttributionByDate(t *testing.T) {
	// Two versions sharing the SAME exercises, so exercise-matching alone can't
	// tell them apart; only the schedule (by date) can.
	may := domain.RoutineVersion{
		ID: "vMay", CreatedAt: time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC),
		Note: "may-july routine", Status: domain.StatusPast,
		Exercises: []domain.Exercise{ex("a", "A"), ex("b", "B")},
	}
	aug := domain.RoutineVersion{
		ID: "vAug", CreatedAt: time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC),
		Note: "august routine", Status: domain.StatusCurrent,
		Exercises: []domain.Exercise{ex("a", "A"), ex("b", "B")},
	}
	d := Data{
		Versions: []domain.RoutineVersion{may, aug},
		Assignments: []domain.VersionAssignment{
			{StartDate: "2026-05-01", VersionID: "vMay"},
			{StartDate: "2026-08-01", VersionID: "vAug"},
		},
		Days: []domain.DayLog{
			day("2026-06-15", "a", "b"), // May-routine period
			day("2026-08-10", "a", "b"), // Aug-routine period
		},
		Generated: time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC),
	}
	grids := buildGrids(d)
	// Summary + two routine tabs (chronological) + Routine + Versions.
	if len(grids) != 5 {
		t.Fatalf("grids = %d, want 5: %v", len(grids), titles(grids))
	}
	if grids[1].title != "May–Jul 2026" || grids[2].title != "August 2026" {
		t.Fatalf("routine tab titles = %v, want May–Jul 2026 then August 2026", titles(grids))
	}
	// The August day belongs to the Aug tab, not the May–Jul tab, regardless of
	// exercise overlap.
	if hasDateRow(grids[1], "2026-08-10") {
		t.Fatal("August day bled into the May–Jul routine tab")
	}
	if !hasDateRow(grids[2], "2026-08-10") {
		t.Fatal("August day missing from the August routine tab")
	}
}

// hasDateRow reports whether a routine grid has a data row for the given date.
func hasDateRow(g cellGrid, date string) bool {
	for _, row := range g.rows {
		if len(row) > 0 && row[0] == date {
			return true
		}
	}
	return false
}

// A routine's tab fills in every calendar day it was active per the schedule,
// so rest / no-activity days appear (blank, 0%) — not only the days logged.
func TestScheduleFillsNoActivityDays(t *testing.T) {
	v := domain.RoutineVersion{
		ID: "v1", CreatedAt: time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC),
		Note: "r", Status: domain.StatusPast,
		Exercises: []domain.Exercise{ex("a", "A")},
	}
	// Active June only (next assignment starts July 1). One workout logged.
	d := Data{
		Versions: []domain.RoutineVersion{v},
		Assignments: []domain.VersionAssignment{
			{StartDate: "2026-06-01", VersionID: "v1"},
			{StartDate: "2026-07-01", VersionID: "vNext"},
		},
		Days:      []domain.DayLog{day("2026-06-15", "a")},
		Generated: time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC),
	}
	grids := buildGrids(d)
	// grids[1] is the routine tab: title row + header + 30 June days + blank.
	tab := grids[1]
	if tab.title != "June 2026" {
		t.Fatalf("tab title = %q, want June 2026", tab.title)
	}
	var dataRows, filled15 int
	for _, row := range tab.rows {
		if len(row) < 2 {
			continue // month title or blank separator
		}
		if s, _ := row[0].(string); s == "Date" {
			continue // header
		}
		dataRows++
		if row[0] == "2026-06-15" {
			filled15++
		}
	}
	if dataRows != 30 {
		t.Fatalf("June data rows = %d, want 30 (every calendar day)", dataRows)
	}
	if filled15 != 1 {
		t.Fatalf("logged day 2026-06-15 present %d times, want 1", filled15)
	}
}

func titles(grids []cellGrid) []string {
	out := make([]string, len(grids))
	for i, g := range grids {
		out[i] = g.title
	}
	return out
}

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
