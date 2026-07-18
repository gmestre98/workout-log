package stats

import (
	"math"
	"testing"

	"github.com/gmestre98/workout-log/backend/internal/domain"
)

func approx(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestExerciseCompletion(t *testing.T) {
	tests := []struct {
		name string
		log  domain.ExerciseLog
		want float64
	}{
		{
			name: "all sets full",
			log: domain.ExerciseLog{PlannedSets: 4, PlannedAmount: 8, Sets: []domain.SetEntry{
				{Completed: true, ActualAmount: 8}, {Completed: true, ActualAmount: 8},
				{Completed: true, ActualAmount: 8}, {Completed: true, ActualAmount: 8},
			}},
			want: 1.0,
		},
		{
			name: "three sets of six out of four sets of eight",
			log: domain.ExerciseLog{PlannedSets: 4, PlannedAmount: 8, Sets: []domain.SetEntry{
				{Completed: true, ActualAmount: 6}, {Completed: true, ActualAmount: 6},
				{Completed: true, ActualAmount: 6}, {Completed: false, ActualAmount: 0},
			}},
			want: 18.0 / 32.0,
		},
		{
			name: "incomplete set is ignored even with actual amount",
			log: domain.ExerciseLog{PlannedSets: 2, PlannedAmount: 10, Sets: []domain.SetEntry{
				{Completed: true, ActualAmount: 10}, {Completed: false, ActualAmount: 5},
			}},
			want: 0.5,
		},
		{
			name: "overshoot capped at 100%",
			log: domain.ExerciseLog{PlannedSets: 1, PlannedAmount: 10, Sets: []domain.SetEntry{
				{Completed: true, ActualAmount: 15},
			}},
			want: 1.0,
		},
		{
			name: "zero planned is zero",
			log:  domain.ExerciseLog{PlannedSets: 0, PlannedAmount: 0},
			want: 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExerciseCompletion(tt.log); !approx(got, tt.want) {
				t.Fatalf("got %v want %v", got, tt.want)
			}
		})
	}
}

func TestDayAverageCountsMissingAsZero(t *testing.T) {
	exercises := []domain.Exercise{{ID: "a"}, {ID: "b"}}
	day := domain.DayLog{Date: "2026-07-01", Exercises: map[string]domain.ExerciseLog{
		"a": {PlannedSets: 1, PlannedAmount: 10, Sets: []domain.SetEntry{{Completed: true, ActualAmount: 10}}},
		// "b" not logged -> 0%
	}}
	if got := DayAverage(exercises, day); !approx(got, 0.5) {
		t.Fatalf("got %v want 0.5", got)
	}
}

func TestDayAverageEmptyRoutine(t *testing.T) {
	if got := DayAverage(nil, domain.NewDayLog("2026-07-01")); got != 0 {
		t.Fatalf("got %v want 0", got)
	}
}

func TestSummarize(t *testing.T) {
	exercises := []domain.Exercise{{ID: "a"}, {ID: "b"}}
	full := domain.ExerciseLog{PlannedSets: 1, PlannedAmount: 10, Sets: []domain.SetEntry{{Completed: true, ActualAmount: 10}}}
	days := []domain.DayLog{
		{Date: "d1", Exercises: map[string]domain.ExerciseLog{"a": full, "b": full}}, // 100%
		{Date: "d2", Exercises: map[string]domain.ExerciseLog{"a": full}},             // 50%
		{Date: "d3", Exercises: map[string]domain.ExerciseLog{}},                      // 0%
	}
	s := Summarize(exercises, days)
	if s.Days != 3 {
		t.Fatalf("days: got %d want 3", s.Days)
	}
	if s.DaysAbove0 != 2 {
		t.Fatalf("daysAbove0: got %d want 2", s.DaysAbove0)
	}
	if s.DaysAbove50 != 1 { // only 100% day is strictly above 50%
		t.Fatalf("daysAbove50: got %d want 1", s.DaysAbove50)
	}
	if !approx(s.AvgCompletion, (1.0+0.5+0.0)/3.0) {
		t.Fatalf("avg: got %v", s.AvgCompletion)
	}
	if len(s.PerDay) != 3 {
		t.Fatalf("perDay len: got %d want 3", len(s.PerDay))
	}
}
