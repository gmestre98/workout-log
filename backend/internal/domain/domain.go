// Package domain holds the core types shared across the app. It has no
// dependencies on storage or transport so it stays easy to unit test.
package domain

import "time"

// Unit describes how an exercise's amount is measured.
type Unit string

const (
	UnitReps    Unit = "reps"
	UnitSeconds Unit = "seconds"
	UnitMinutes Unit = "minutes"
)

// Valid reports whether u is a known unit.
func (u Unit) Valid() bool {
	switch u {
	case UnitReps, UnitSeconds, UnitMinutes:
		return true
	default:
		return false
	}
}

// Exercise is one row of the routine: e.g. "4 sets of 8 pull-ups" in the
// "Wake up" slot. It is the configurable part of the app.
type Exercise struct {
	// ID is the top-level document ID, and is ALSO stored as a field ("id") so
	// it survives when an Exercise is embedded inside a RoutineVersion snapshot.
	// With firestore:"-" the ID was dropped in snapshots, so restoring/activating
	// a version regenerated new IDs and orphaned historical day logs.
	ID string `json:"id" firestore:"id"`
	// WorkoutDay is the rotation unit this exercise belongs to, e.g. "Day 1 —
	// Push". Each training session performs one workout day, rotating through
	// them. Empty means the exercise predates rotation; callers treat an empty
	// WorkoutDay as the single default day (see DefaultWorkoutDay).
	WorkoutDay string `json:"workoutDay" firestore:"workoutDay"`
	// TimeSlot is the part *within* a workout day, e.g. "Wake up", "Main",
	// "Mobility". It sub-groups a day's exercises; it is NOT a day of its own.
	TimeSlot      string `json:"timeSlot" firestore:"timeSlot"`
	Name          string `json:"name" firestore:"name"`
	PlannedSets   int    `json:"plannedSets" firestore:"plannedSets"`
	PlannedAmount int    `json:"plannedAmount" firestore:"plannedAmount"`
	Unit          Unit   `json:"unit" firestore:"unit"`
	Note          string `json:"note" firestore:"note"`
	RestSeconds   int    `json:"restSeconds" firestore:"restSeconds"`
	MuscleGroup   string `json:"muscleGroup" firestore:"muscleGroup"`
	Equipment     string `json:"equipment" firestore:"equipment"`
	SortOrder     int    `json:"sortOrder" firestore:"sortOrder"`
	Active        bool   `json:"active" firestore:"active"`
	// PerSide marks an exercise done on both sides (e.g. side plank, split
	// squats). When true each planned set is tracked once per side, so a day log
	// holds 2*PlannedSets entries ordered left, right, left, right…
	PerSide bool `json:"perSide" firestore:"perSide"`
	// Travel is an optional stand-in performed instead of this exercise while
	// travelling (e.g. a bodyweight version of a machine lift). It is nil when the
	// exercise has no travel replacement. When travel mode is on for a day, an
	// exercise that has one is displayed, logged and scored as its Travel variant
	// — under the SAME exercise ID, so history stays aligned and completion still
	// scores against the day's exercise list.
	Travel *TravelVariant `json:"travel,omitempty" firestore:"travel,omitempty"`
}

// TravelVariant is the substitute an exercise switches to in travel mode. It
// overrides every field that affects doing, logging and scoring the movement;
// the base exercise's ID, workout day, time slot, trained parts and sort order
// are kept so the swap is invisible to grouping and history.
type TravelVariant struct {
	Name          string `json:"name" firestore:"name"`
	PlannedSets   int    `json:"plannedSets" firestore:"plannedSets"`
	PlannedAmount int    `json:"plannedAmount" firestore:"plannedAmount"`
	Unit          Unit   `json:"unit" firestore:"unit"`
	Note          string `json:"note" firestore:"note"`
	RestSeconds   int    `json:"restSeconds" firestore:"restSeconds"`
	Equipment     string `json:"equipment" firestore:"equipment"`
	PerSide       bool   `json:"perSide" firestore:"perSide"`
}

// DefaultWorkoutDay is the day an exercise belongs to when its WorkoutDay is
// empty (i.e. it predates rotation). Grouping and scoring normalise empty to
// this so old single-routine data reads as one day rather than losing its slot.
const DefaultWorkoutDay = "Day 1"

// DayOf returns the workout day an exercise belongs to, normalising empty to the
// default day so ungrouped/legacy exercises still collect into one day.
func DayOf(e Exercise) string {
	if e.WorkoutDay == "" {
		return DefaultWorkoutDay
	}
	return e.WorkoutDay
}

// SetEntry is the result of a single set on a given day. ActualAmount is what
// was actually done (reps/seconds/minutes); it may be less than planned.
// Seconds is the wall-clock duration of the set when it was timed with the
// workout timer, or 0 when the set was logged without timing.
type SetEntry struct {
	Completed    bool `json:"completed" firestore:"completed"`
	ActualAmount int  `json:"actualAmount" firestore:"actualAmount"`
	Seconds      int  `json:"seconds" firestore:"seconds"`
}

// ExerciseLog is how one exercise went on one day. PlannedSets/PlannedAmount
// are snapshotted at log time so historical completion stays correct even if
// the routine changes later.
type ExerciseLog struct {
	ExerciseID    string     `json:"exerciseId" firestore:"exerciseId"`
	PlannedSets   int        `json:"plannedSets" firestore:"plannedSets"`
	PlannedAmount int        `json:"plannedAmount" firestore:"plannedAmount"`
	Unit          Unit       `json:"unit" firestore:"unit"`
	Sets          []SetEntry `json:"sets" firestore:"sets"`
}

// DayLog is every exercise logged on a single calendar day, keyed by exercise
// ID. Stored as one document per day.
type DayLog struct {
	Date string `json:"date" firestore:"date"` // "YYYY-MM-DD", also the doc ID
	// WorkoutDay is the workout-day label (an exercise TimeSlot) performed on this
	// date, e.g. "Day 1 — Push". It is the source of truth for how the date is
	// shown and scored: when set, only that day's exercises apply (single-workout
	// rotation); when empty the whole routine applies (legacy days logged before
	// rotation existed), so old data keeps rendering and averaging as before.
	WorkoutDay string `json:"workoutDay" firestore:"workoutDay"`
	// Travel records that this day was performed in travel mode, so exercises that
	// have a travel replacement were done as their variant. It is a label for
	// history/export only: completion still scores off each ExerciseLog's own
	// snapshot, which already captured the travel numbers at log time.
	Travel bool `json:"travel" firestore:"travel"`
	// TravelOff holds the IDs of exercises kept on their normal (non-travel)
	// version on this day even though Travel is on — e.g. the one movement the
	// user had the equipment for. Empty/absent means every exercise with a travel
	// replacement used it.
	TravelOff []string               `json:"travelOff,omitempty" firestore:"travelOff,omitempty"`
	Exercises map[string]ExerciseLog `json:"exercises" firestore:"exercises"`
}

// NewDayLog returns an empty, ready-to-use DayLog for date.
func NewDayLog(date string) DayLog {
	return DayLog{Date: date, Exercises: map[string]ExerciseLog{}}
}

// VersionStatus describes where a routine version sits in the user's timeline:
// the one currently in use, a plan for later, or an archived past routine.
type VersionStatus string

const (
	StatusCurrent VersionStatus = "current"
	StatusFuture  VersionStatus = "future"
	StatusPast    VersionStatus = "past"
)

// Valid reports whether s is a known status.
func (s VersionStatus) Valid() bool {
	switch s {
	case StatusCurrent, StatusFuture, StatusPast:
		return true
	default:
		return false
	}
}

// VersionAssignment records that a saved routine version was in effect starting
// on StartDate. Assignments form an effective-dated timeline: the version in
// effect on any date D is the assignment with the greatest StartDate <= D. This
// covers monthly assignments (start on the 1st) and, later, per-day changes
// (start on any day) without gaps or overlaps. StartDate ("YYYY-MM-DD") is the
// document ID, so each boundary date maps to exactly one version.
//
// The schedule is a record/label only: it documents which version applied when
// and does not change which exercises the daily tracking or stats use.
type VersionAssignment struct {
	StartDate string `json:"startDate" firestore:"startDate"`
	VersionID string `json:"versionId" firestore:"versionId"`
}

// RoutineVersion is a saved snapshot of the whole routine at a point in time,
// so past configurations are never lost and can be reviewed or compared. Status
// marks which one is current (in use), planned (future) or archived (past); at
// most one version is current at a time.
type RoutineVersion struct {
	ID        string        `json:"id" firestore:"-"`
	CreatedAt time.Time     `json:"createdAt" firestore:"createdAt"`
	Note      string        `json:"note" firestore:"note"`
	Status    VersionStatus `json:"status" firestore:"status"`
	Exercises []Exercise    `json:"exercises" firestore:"exercises"`
}
