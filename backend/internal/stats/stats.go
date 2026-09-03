// Package stats computes completion metrics from the routine and day logs.
// All functions are pure so they are trivial to unit test.
package stats

import (
	"sort"

	"github.com/gmestre98/workout-log/backend/internal/domain"
)

// ExerciseCompletion returns how much of a single exercise was completed on a
// day, as a fraction in [0, 1]. It is (sum of actual amounts over completed
// sets) / (number of logged sets * planned amount), capped at 1. Basing the
// denominator on the logged set count (rather than PlannedSets) keeps it correct
// for per-side exercises, whose logs hold two entries per planned set, while
// staying identical for every ordinary log where the counts match.
func ExerciseCompletion(log domain.ExerciseLog) float64 {
	planned := len(log.Sets) * log.PlannedAmount
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
//
// When day.WorkoutDay is set the day is a single workout in the rotation, so
// only exercises belonging to that workout day (domain.DayOf == WorkoutDay) are
// averaged — otherwise the other days' exercises would count as 0% and cap the
// score. An empty WorkoutDay (legacy days logged before rotation) averages the
// whole routine as before. If a stamped WorkoutDay matches no current exercise
// (e.g. the day was renamed or its exercises removed), it also falls back to the
// whole routine so the day still scores against something.
func DayAverage(exercises []domain.Exercise, day domain.DayLog) float64 {
	scoped := day.WorkoutDay != "" && anyInDay(exercises, day.WorkoutDay)
	var sum float64
	var n int
	for _, ex := range exercises {
		if scoped && domain.DayOf(ex) != day.WorkoutDay {
			continue
		}
		n++
		if log, ok := day.Exercises[ex.ID]; ok {
			sum += ExerciseCompletion(log)
		}
	}
	if n == 0 {
		return 0
	}
	return sum / float64(n)
}

// anyInDay reports whether any exercise belongs to the given workout day.
func anyInDay(exercises []domain.Exercise, day string) bool {
	for _, ex := range exercises {
		if domain.DayOf(ex) == day {
			return true
		}
	}
	return false
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

// ExercisesForDay resolves which routine a day should be scored against. It
// takes the whole day so it can attribute the day both by date (the version
// schedule) and by the exercises actually logged (overlap matching), which
// matters when the routine was switched mid-period. It lets a summary score each
// day against the routine that actually applied then.
type ExercisesForDay func(day domain.DayLog) []domain.Exercise

// Summarize computes a Summary over the provided days against the routine.
// The caller chooses which days to include (e.g. every logged day in a month).
func Summarize(exercises []domain.Exercise, days []domain.DayLog) Summary {
	return SummarizeWith(func(domain.DayLog) []domain.Exercise { return exercises }, days)
}

// SummarizeWith is like Summarize but scores each day against the routine that
// was in effect on that day, as resolved by forDay. This keeps period stats
// correct across a mid-period routine switch: without it, days logged under the
// old routine would be scored against the new routine's exercises (which have no
// logs on those days and so count as 0%), dragging the whole period down.
func SummarizeWith(forDay ExercisesForDay, days []domain.DayLog) Summary {
	s := Summary{Days: len(days), PerDay: make([]DayStat, 0, len(days))}
	var total float64
	for _, d := range days {
		avg := DayAverage(forDay(d), d)
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

// Routine is a candidate a day can be attributed to and scored against: a set of
// exercises identified by the saved version it came from (VersionID is "" for
// the live-routine fallback, which has no saved version).
type Routine struct {
	VersionID string
	Exercises []domain.Exercise
}

// Jaccard is |a∩b| / |a∪b| over two ID sets, 0 when both are empty. It rewards
// the routine that overlaps a day's exercises most while penalising a routine
// far larger than the day, so a day belongs to the routine it actually fits (not
// a superset of it).
func Jaccard(a, b map[string]bool) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 0
	}
	inter := 0
	for id := range a {
		if b[id] {
			inter++
		}
	}
	union := len(a) + len(b) - inter
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

func exerciseIDs(day domain.DayLog) map[string]bool {
	s := make(map[string]bool, len(day.Exercises))
	for id := range day.Exercises {
		s[id] = true
	}
	return s
}

func idSet(exs []domain.Exercise) map[string]bool {
	s := make(map[string]bool, len(exs))
	for _, e := range exs {
		s[e.ID] = true
	}
	return s
}

// BestMatch returns the index of the routine whose exercises best overlap the
// day's logged exercises (by Jaccard), or -1 when the day has no logs. Order
// routines by preference: ties resolve to the earliest, so pass newest first.
func BestMatch(day domain.DayLog, routines []Routine) int {
	ids := exerciseIDs(day)
	if len(ids) == 0 {
		return -1
	}
	best, bestScore := -1, -1.0
	for i, r := range routines {
		if sc := Jaccard(ids, idSet(r.Exercises)); sc > bestScore {
			best, bestScore = i, sc
		}
	}
	return best
}

// ResolveExercisesForDay builds an ExercisesForDay that attributes each day to a
// routine by, in order: the version schedule (the assignment with the greatest
// StartDate <= the day's date), then — when the schedule does not cover the day
// or points at a version not in routines — the routine whose exercises best
// overlap the day's logged exercises. This second path is what keeps stats
// correct when a routine was switched by activating a new version without
// recording a dated schedule entry: the old-routine days still match the old
// version instead of scoring 0% against the current one.
//
// routines should be ordered by preference (newest first) so match ties resolve
// to the newest routine. fallback is used only when neither path resolves (e.g.
// an empty day, whose score is 0 regardless, or no routines at all).
func ResolveExercisesForDay(routines []Routine, assignments []domain.VersionAssignment, fallback []domain.Exercise) ExercisesForDay {
	idxByVersion := make(map[string]int, len(routines))
	for i, r := range routines {
		if r.VersionID != "" {
			idxByVersion[r.VersionID] = i
		}
	}
	sorted := append([]domain.VersionAssignment(nil), assignments...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].StartDate < sorted[j].StartDate })

	scheduled := func(date string) (int, bool) {
		vid := ""
		for _, a := range sorted {
			if a.StartDate > date {
				break
			}
			vid = a.VersionID // latest assignment on or before the date wins
		}
		if vid == "" {
			return 0, false
		}
		idx, ok := idxByVersion[vid]
		return idx, ok
	}

	return func(day domain.DayLog) []domain.Exercise {
		if idx, ok := scheduled(day.Date); ok {
			return routines[idx].Exercises
		}
		if idx := BestMatch(day, routines); idx >= 0 {
			return routines[idx].Exercises
		}
		return fallback
	}
}
