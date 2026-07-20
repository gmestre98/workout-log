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
	ID            string `json:"id" firestore:"-"` // doc ID, not stored as a field
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
}

// SetEntry is the result of a single set on a given day. ActualAmount is what
// was actually done (reps/seconds/minutes); it may be less than planned.
type SetEntry struct {
	Completed    bool `json:"completed" firestore:"completed"`
	ActualAmount int  `json:"actualAmount" firestore:"actualAmount"`
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
	Date      string                 `json:"date" firestore:"date"` // "YYYY-MM-DD", also the doc ID
	Exercises map[string]ExerciseLog `json:"exercises" firestore:"exercises"`
}

// NewDayLog returns an empty, ready-to-use DayLog for date.
func NewDayLog(date string) DayLog {
	return DayLog{Date: date, Exercises: map[string]ExerciseLog{}}
}

// RoutineVersion is a saved snapshot of the whole routine at a point in time,
// so past configurations are never lost and can be reviewed or compared.
type RoutineVersion struct {
	ID        string     `json:"id" firestore:"-"`
	CreatedAt time.Time  `json:"createdAt" firestore:"createdAt"`
	Note      string     `json:"note" firestore:"note"`
	Exercises []Exercise `json:"exercises" firestore:"exercises"`
}
