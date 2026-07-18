// Package stats computes completion metrics from the routine and day logs.
// All functions are pure so they are trivial to unit test.
package stats

import "github.com/gmestre98/workout-log/backend/internal/domain"

// ExerciseCompletion returns how much of a single exercise was completed on a
// day, as a fraction in [0, 1]. It is (sum of actual amounts over completed
// sets) / (planned sets * planned amount), capped at 1.
func ExerciseCompletion(log domain.ExerciseLog) float64 {
	planned := log.PlannedSets * log.PlannedAmount
	if planned <= 0 {
		return 0
	}
	done := 0
	for _, s := range log.Sets {
		if s.Completed {
			done += s.ActualAmount
		}
	}
	frac := float64(done) / float64(planned)
	if frac > 1 {
		frac = 1
	}
	if frac < 0 {
		frac = 0
	}
	return frac
}

// DayAverage returns the mean completion across the given routine exercises for
// one day, as a fraction in [0, 1]. Exercises with no log that day count as 0%,
// matching the spreadsheet where an untouched exercise drags the day's average
// down. Returns 0 when there are no exercises.
func DayAverage(exercises []domain.Exercise, day domain.DayLog) float64 {
	if len(exercises) == 0 {
		return 0
	}
	var sum float64
	for _, ex := range exercises {
		if log, ok := day.Exercises[ex.ID]; ok {
			sum += ExerciseCompletion(log)
		}
	}
	return sum / float64(len(exercises))
}

// DayStat is a single day's rolled-up completion.
type DayStat struct {
	Date       string  `json:"date"`
	Completion float64 `json:"completion"` // fraction [0,1]
}

// Summary aggregates a period (e.g. a month) into the same figures tracked in
// the spreadsheet: average completion, days above 0%, and days above 50%.
type Summary struct {
	Days          int       `json:"days"`          // number of days considered
	AvgCompletion float64   `json:"avgCompletion"` // mean of daily completion, [0,1]
	DaysAbove0    int       `json:"daysAbove0"`    // days with any work done
	DaysAbove50   int       `json:"daysAbove50"`   // days averaging over 50%
	PerDay        []DayStat `json:"perDay"`
}

// Summarize computes a Summary over the provided days against the routine.
// The caller chooses which days to include (e.g. every logged day in a month).
func Summarize(exercises []domain.Exercise, days []domain.DayLog) Summary {
	s := Summary{Days: len(days), PerDay: make([]DayStat, 0, len(days))}
	var total float64
	for _, d := range days {
		avg := DayAverage(exercises, d)
		total += avg
		if avg > 0 {
			s.DaysAbove0++
		}
		if avg > 0.5 {
			s.DaysAbove50++
		}
		s.PerDay = append(s.PerDay, DayStat{Date: d.Date, Completion: avg})
	}
	if len(days) > 0 {
		s.AvgCompletion = total / float64(len(days))
	}
	return s
}
