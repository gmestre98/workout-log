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
        // The travel toggle flips the shared switch, saves it back so the phone
        // agrees, and rebuilds the list so every exercise's name and planned
        // numbers reflect the change immediately.
        if (item.getId() == :travel) {
            // item is the travel ToggleMenuItem here; isEnabled() is its new
            // (post-toggle) state. Cast so the type checker finds the method.
            Travel.on = (item as WatchUi.ToggleMenuItem).isEnabled();
            Api.putTravel({ "on" => Travel.on, "off" => Travel.off }, method(:onTravelSaved));
            WatchUi.switchToView(
                WorkoutDays.exerciseMenu(mExercises, mWorkoutDay),
                new ExerciseMenuDelegate(mExercises, mWorkoutDay),
                WatchUi.SLIDE_IMMEDIATE);
            return;
        }
        var ex = Travel.apply(mExercises[item.getId()]);
        var view = new WorkoutView(ex, mWorkoutDay);
        WatchUi.pushView(view, new WorkoutDelegate(view), WatchUi.SLIDE_LEFT);
    }

    // onTravelSaved is best-effort: if the save fails the local switch still
    // drives this session; the phone reconciles on its next fetch.
    function onTravelSaved(responseCode, data) {
    }
}
