using Toybox.WatchUi;

// ExerciseMenuDelegate handles selection in the exercise picker: it opens the
// workout timer for the chosen exercise. The workout day is carried through so
// the log records which session of the rotation was performed.
class ExerciseMenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var mExercises;
    hidden var mWorkoutDay;

    function initialize(exercises, workoutDay) {
        Menu2InputDelegate.initialize();
        mExercises = exercises;
        mWorkoutDay = workoutDay;
    }

    function onSelect(item) {
        var ex = mExercises[item.getId()];
        var view = new WorkoutView(ex, mWorkoutDay);
        WatchUi.pushView(view, new WorkoutDelegate(view), WatchUi.SLIDE_LEFT);
    }
}
