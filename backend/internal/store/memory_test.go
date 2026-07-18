package store

import (
	"context"
	"testing"

	"github.com/gmestre98/workout-log/backend/internal/domain"
)

func TestExerciseCRUD(t *testing.T) {
	ctx := context.Background()
	m := NewMemory()

	created, err := m.CreateExercise(ctx, domain.Exercise{Name: "Pull-ups", SortOrder: 2})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == "" {
		t.Fatal("expected generated ID")
	}
	// second one with a lower sort order should list first
	_, _ = m.CreateExercise(ctx, domain.Exercise{Name: "Burpees", SortOrder: 1})

	list, err := m.ListExercises(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Name != "Burpees" {
		t.Fatalf("unexpected list order: %+v", list)
	}

	created.Name = "Chin-ups"
	if err := m.UpdateExercise(ctx, created); err != nil {
		t.Fatal(err)
	}
	got, err := m.GetExercise(ctx, created.ID)
	if err != nil || got.Name != "Chin-ups" {
		t.Fatalf("update not applied: %+v err=%v", got, err)
	}

	if err := m.DeleteExercise(ctx, created.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := m.GetExercise(ctx, created.ID); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestUpdateMissingReturnsNotFound(t *testing.T) {
	m := NewMemory()
	if err := m.UpdateExercise(context.Background(), domain.Exercise{ID: "nope"}); err != ErrNotFound {
		t.Fatalf("got %v want ErrNotFound", err)
	}
}

func TestGetDayEmptyDefault(t *testing.T) {
	m := NewMemory()
	d, err := m.GetDay(context.Background(), "2026-07-10")
	if err != nil {
		t.Fatal(err)
	}
	if d.Date != "2026-07-10" || d.Exercises == nil || len(d.Exercises) != 0 {
		t.Fatalf("expected empty day log, got %+v", d)
	}
}

func TestSaveAndListDays(t *testing.T) {
	ctx := context.Background()
	m := NewMemory()
	for _, date := range []string{"2026-07-05", "2026-07-01", "2026-08-01"} {
		if err := m.SaveDay(ctx, domain.NewDayLog(date)); err != nil {
			t.Fatal(err)
		}
	}
	got, err := m.ListDays(ctx, "2026-07-01", "2026-07-31")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 july days, got %d", len(got))
	}
	if got[0].Date != "2026-07-01" || got[1].Date != "2026-07-05" {
		t.Fatalf("expected chronological order, got %+v", got)
	}
}
