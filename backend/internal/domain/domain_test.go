package domain

import (
	"reflect"
	"testing"
)

// Exercise.ID must be serialized to Firestore (tag "id"), not dropped ("-").
// When it was "-", exercise IDs vanished inside RoutineVersion snapshots, so
// activating/restoring a version regenerated IDs and orphaned day logs.
func TestExerciseIDPersistsInSnapshots(t *testing.T) {
	f, ok := reflect.TypeOf(Exercise{}).FieldByName("ID")
	if !ok {
		t.Fatal("Exercise has no ID field")
	}
	if tag := f.Tag.Get("firestore"); tag != "id" {
		t.Fatalf("Exercise.ID firestore tag = %q, want \"id\" so IDs persist inside version snapshots", tag)
	}
}
