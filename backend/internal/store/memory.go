package store

import (
	"context"
	"sort"
	"strconv"
	"sync"

	"github.com/gmestre98/workout-log/backend/internal/domain"
)

// Memory is an in-memory Store. It is safe for concurrent use and is used by
// unit tests and by local development (WORKOUT_STORE=memory).
type Memory struct {
	mu          sync.RWMutex
	exercises   map[string]domain.Exercise
	days        map[string]domain.DayLog
	versions    []domain.RoutineVersion
	assignments map[string]domain.VersionAssignment // keyed by StartDate
	settings    map[string]string                   // small server-side KV
	seq         int
}

// NewMemory returns an empty in-memory store.
func NewMemory() *Memory {
	return &Memory{
		exercises:   map[string]domain.Exercise{},
		days:        map[string]domain.DayLog{},
		assignments: map[string]domain.VersionAssignment{},
		settings:    map[string]string{},
	}
}

func (m *Memory) nextID() string {
	m.seq++
	return "ex-" + strconv.Itoa(m.seq)
}

func (m *Memory) ListExercises(_ context.Context) ([]domain.Exercise, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]domain.Exercise, 0, len(m.exercises))
	for _, e := range m.exercises {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

func (m *Memory) GetExercise(_ context.Context, id string) (domain.Exercise, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	e, ok := m.exercises[id]
	if !ok {
		return domain.Exercise{}, ErrNotFound
	}
	return e, nil
}

func (m *Memory) CreateExercise(_ context.Context, e domain.Exercise) (domain.Exercise, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e.ID == "" {
		e.ID = m.nextID()
	}
	m.exercises[e.ID] = e
	return e, nil
}

func (m *Memory) UpdateExercise(_ context.Context, e domain.Exercise) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.exercises[e.ID]; !ok {
		return ErrNotFound
	}
	m.exercises[e.ID] = e
	return nil
}

func (m *Memory) DeleteExercise(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.exercises[id]; !ok {
		return ErrNotFound
	}
	delete(m.exercises, id)
	return nil
}

func (m *Memory) ReplaceExercises(_ context.Context, exs []domain.Exercise) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.exercises = make(map[string]domain.Exercise, len(exs))
	for _, e := range exs {
		if e.ID == "" {
			e.ID = m.nextID()
		}
		m.exercises[e.ID] = e
	}
	return nil
}

func (m *Memory) GetDay(_ context.Context, date string) (domain.DayLog, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	d, ok := m.days[date]
	if !ok {
		return domain.NewDayLog(date), nil
	}
	return d, nil
}

func (m *Memory) SaveDay(_ context.Context, d domain.DayLog) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.days[d.Date] = d
	return nil
}

func (m *Memory) ListDays(_ context.Context, from, to string) ([]domain.DayLog, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]domain.DayLog, 0)
	for date, d := range m.days {
		if date >= from && date <= to {
			out = append(out, d)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out, nil
}

func (m *Memory) ListRoutineVersions(_ context.Context) ([]domain.RoutineVersion, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]domain.RoutineVersion, len(m.versions))
	copy(out, m.versions)
	// newest first
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

func (m *Memory) GetRoutineVersion(_ context.Context, id string) (domain.RoutineVersion, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, v := range m.versions {
		if v.ID == id {
			return v, nil
		}
	}
	return domain.RoutineVersion{}, ErrNotFound
}

func (m *Memory) CreateRoutineVersion(_ context.Context, v domain.RoutineVersion) (domain.RoutineVersion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if v.ID == "" {
		m.seq++
		v.ID = "ver-" + strconv.Itoa(m.seq)
	}
	m.versions = append(m.versions, v)
	return v, nil
}

func (m *Memory) DeleteRoutineVersion(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, v := range m.versions {
		if v.ID == id {
			m.versions = append(m.versions[:i], m.versions[i+1:]...)
			return nil
		}
	}
	return ErrNotFound
}

func (m *Memory) SetRoutineVersionStatus(_ context.Context, id string, status domain.VersionStatus) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	idx := -1
	for i := range m.versions {
		if m.versions[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return ErrNotFound
	}
	// Enforce a single current version: demote any other current to past.
	if status == domain.StatusCurrent {
		for i := range m.versions {
			if i != idx && m.versions[i].Status == domain.StatusCurrent {
				m.versions[i].Status = domain.StatusPast
			}
		}
	}
	m.versions[idx].Status = status
	return nil
}

func (m *Memory) UpdateRoutineVersionNote(_ context.Context, id, note string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := range m.versions {
		if m.versions[i].ID == id {
			m.versions[i].Note = note
			return nil
		}
	}
	return ErrNotFound
}

func (m *Memory) ListVersionAssignments(_ context.Context) ([]domain.VersionAssignment, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]domain.VersionAssignment, 0, len(m.assignments))
	for _, a := range m.assignments {
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartDate < out[j].StartDate })
	return out, nil
}

func (m *Memory) SetVersionAssignment(_ context.Context, a domain.VersionAssignment) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.assignments[a.StartDate] = a
	return nil
}

func (m *Memory) DeleteVersionAssignment(_ context.Context, startDate string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.assignments[startDate]; !ok {
		return ErrNotFound
	}
	delete(m.assignments, startDate)
	return nil
}

func (m *Memory) GetSetting(_ context.Context, key string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.settings[key]
	if !ok {
		return "", ErrNotFound
	}
	return v, nil
}

func (m *Memory) SetSetting(_ context.Context, key, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.settings[key] = value
	return nil
}
