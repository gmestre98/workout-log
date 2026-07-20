// Package store defines the persistence interface and its implementations.
// The API layer depends only on Store, so handlers can be unit tested against
// the in-memory implementation without touching Firestore.
package store

import (
	"context"
	"errors"

	"github.com/gmestre98/workout-log/backend/internal/domain"
)

// ErrNotFound is returned when a requested entity does not exist.
var ErrNotFound = errors.New("not found")

// Store persists the routine (exercises) and the daily logs.
type Store interface {
	ListExercises(ctx context.Context) ([]domain.Exercise, error)
	GetExercise(ctx context.Context, id string) (domain.Exercise, error)
	CreateExercise(ctx context.Context, e domain.Exercise) (domain.Exercise, error)
	UpdateExercise(ctx context.Context, e domain.Exercise) error
	DeleteExercise(ctx context.Context, id string) error

	// GetDay returns the log for a date. If none exists it returns an empty
	// DayLog for that date and no error.
	GetDay(ctx context.Context, date string) (domain.DayLog, error)
	SaveDay(ctx context.Context, d domain.DayLog) error
	// ListDays returns logs with date in [from, to] inclusive (lexicographic,
	// which is chronological for YYYY-MM-DD).
	ListDays(ctx context.Context, from, to string) ([]domain.DayLog, error)

	// ListRoutineVersions returns saved routine snapshots, newest first.
	ListRoutineVersions(ctx context.Context) ([]domain.RoutineVersion, error)
	GetRoutineVersion(ctx context.Context, id string) (domain.RoutineVersion, error)
	CreateRoutineVersion(ctx context.Context, v domain.RoutineVersion) (domain.RoutineVersion, error)
}
