using Toybox.WatchUi;

// ExerciseMenuDelegate handles selection in the exercise picker: it opens the
// workout timer for the chosen exercise.
class ExerciseMenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var mExercises;

    function initialize(exercises) {
        Menu2InputDelegate.initialize();
        mExercises = exercises;
    }

    function onSelect(item) {
        var ex = mExercises[item.getId()];
        var view = new WorkoutView(ex);
        WatchUi.pushView(view, new WorkoutDelegate(view), WatchUi.SLIDE_LEFT);
    }
}
