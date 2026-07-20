package store

import (
	"context"
	"errors"
	"sort"

	"cloud.google.com/go/firestore"
	"github.com/gmestre98/workout-log/backend/internal/domain"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	exercisesCollection = "exercises"
	daysCollection      = "days"
	versionsCollection  = "routine_versions"
)

// Firestore is a Store backed by Google Cloud Firestore (native mode).
type Firestore struct {
	client *firestore.Client
}

// NewFirestore builds a Firestore-backed store for the given GCP project.
// databaseID may be "" to use the project's default database.
func NewFirestore(ctx context.Context, projectID, databaseID string) (*Firestore, error) {
	var (
		client *firestore.Client
		err    error
	)
	if databaseID == "" || databaseID == "(default)" {
		client, err = firestore.NewClient(ctx, projectID)
	} else {
		client, err = firestore.NewClientWithDatabase(ctx, projectID, databaseID)
	}
	if err != nil {
		return nil, err
	}
	return &Firestore{client: client}, nil
}

// Close releases the underlying client.
func (f *Firestore) Close() error { return f.client.Close() }

func (f *Firestore) ListExercises(ctx context.Context) ([]domain.Exercise, error) {
	iter := f.client.Collection(exercisesCollection).Documents(ctx)
	defer iter.Stop()
	var out []domain.Exercise
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var e domain.Exercise
		if err := doc.DataTo(&e); err != nil {
			return nil, err
		}
		e.ID = doc.Ref.ID
		out = append(out, e)
	}
	// Sort in Go to avoid needing a composite index for a tiny collection.
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

func (f *Firestore) GetExercise(ctx context.Context, id string) (domain.Exercise, error) {
	doc, err := f.client.Collection(exercisesCollection).Doc(id).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.Exercise{}, ErrNotFound
	}
	if err != nil {
		return domain.Exercise{}, err
	}
	var e domain.Exercise
	if err := doc.DataTo(&e); err != nil {
		return domain.Exercise{}, err
	}
	e.ID = doc.Ref.ID
	return e, nil
}

func (f *Firestore) CreateExercise(ctx context.Context, e domain.Exercise) (domain.Exercise, error) {
	col := f.client.Collection(exercisesCollection)
	var ref *firestore.DocumentRef
	if e.ID != "" {
		ref = col.Doc(e.ID)
	} else {
		ref = col.NewDoc()
		e.ID = ref.ID
	}
	if _, err := ref.Set(ctx, e); err != nil {
		return domain.Exercise{}, err
	}
	return e, nil
}

func (f *Firestore) UpdateExercise(ctx context.Context, e domain.Exercise) error {
	ref := f.client.Collection(exercisesCollection).Doc(e.ID)
	if _, err := ref.Get(ctx); status.Code(err) == codes.NotFound {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	_, err := ref.Set(ctx, e)
	return err
}

func (f *Firestore) DeleteExercise(ctx context.Context, id string) error {
	ref := f.client.Collection(exercisesCollection).Doc(id)
	if _, err := ref.Get(ctx); status.Code(err) == codes.NotFound {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	_, err := ref.Delete(ctx)
	return err
}

func (f *Firestore) GetDay(ctx context.Context, date string) (domain.DayLog, error) {
	doc, err := f.client.Collection(daysCollection).Doc(date).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.NewDayLog(date), nil
	}
	if err != nil {
		return domain.DayLog{}, err
	}
	var d domain.DayLog
	if err := doc.DataTo(&d); err != nil {
		return domain.DayLog{}, err
	}
	d.Date = date
	if d.Exercises == nil {
		d.Exercises = map[string]domain.ExerciseLog{}
	}
	return d, nil
}

func (f *Firestore) SaveDay(ctx context.Context, d domain.DayLog) error {
	_, err := f.client.Collection(daysCollection).Doc(d.Date).Set(ctx, d)
	return err
}

func (f *Firestore) ListDays(ctx context.Context, from, to string) ([]domain.DayLog, error) {
	iter := f.client.Collection(daysCollection).
		Where("date", ">=", from).
		Where("date", "<=", to).
		OrderBy("date", firestore.Asc).
		Documents(ctx)
	defer iter.Stop()
	var out []domain.DayLog
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var d domain.DayLog
		if err := doc.DataTo(&d); err != nil {
			return nil, err
		}
		if d.Exercises == nil {
			d.Exercises = map[string]domain.ExerciseLog{}
		}
		out = append(out, d)
	}
	return out, nil
}

func (f *Firestore) ListRoutineVersions(ctx context.Context) ([]domain.RoutineVersion, error) {
	iter := f.client.Collection(versionsCollection).OrderBy("createdAt", firestore.Desc).Documents(ctx)
	defer iter.Stop()
	var out []domain.RoutineVersion
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var v domain.RoutineVersion
		if err := doc.DataTo(&v); err != nil {
			return nil, err
		}
		v.ID = doc.Ref.ID
		out = append(out, v)
	}
	return out, nil
}

func (f *Firestore) GetRoutineVersion(ctx context.Context, id string) (domain.RoutineVersion, error) {
	doc, err := f.client.Collection(versionsCollection).Doc(id).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.RoutineVersion{}, ErrNotFound
	}
	if err != nil {
		return domain.RoutineVersion{}, err
	}
	var v domain.RoutineVersion
	if err := doc.DataTo(&v); err != nil {
		return domain.RoutineVersion{}, err
	}
	v.ID = doc.Ref.ID
	return v, nil
}

func (f *Firestore) CreateRoutineVersion(ctx context.Context, v domain.RoutineVersion) (domain.RoutineVersion, error) {
	ref := f.client.Collection(versionsCollection).NewDoc()
	v.ID = ref.ID
	if _, err := ref.Set(ctx, v); err != nil {
		return domain.RoutineVersion{}, err
	}
	return v, nil
}
