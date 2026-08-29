using Toybox.WatchUi;

// DayMenuDelegate handles the workout-day picker: once a day is chosen it opens
// that day's exercise list (BACK returns here to pick a different day).
class DayMenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var mExercises;

    function initialize(exercises) {
        Menu2InputDelegate.initialize();
        mExercises = exercises;
    }

    function onSelect(item) {
        var id = item.getId();
        var day = (id == null) ? WorkoutDays.DEFAULT : id.toString();
        var forDay = WorkoutDays.forDay(mExercises, day);
        WatchUi.pushView(
            WorkoutDays.exerciseMenu(forDay, day),
            new ExerciseMenuDelegate(forDay, day),
            WatchUi.SLIDE_LEFT);
    }
}
