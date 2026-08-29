using Toybox.WatchUi;

// WorkoutDays builds the "which workout day am I doing" picker from the active
// exercise list. Each exercise carries a workoutDay label (e.g. "Day 1 - Push")
// that groups it into one session of the rotation; an empty label is normalised
// to the default so a legacy single-day routine still works. Matches the
// backend's DefaultWorkoutDay / DayOf.
module WorkoutDays {
    const DEFAULT = "Day 1";

    // of returns the workout-day label an exercise belongs to.
    function of(ex) {
        var d = ex["workoutDay"];
        if (d == null || d.toString().length() == 0) {
            return DEFAULT;
        }
        return d.toString();
    }

    // distinct returns the day labels present in the list, in first-seen order.
    function distinct(exercises) {
        var days = [];
        for (var i = 0; i < exercises.size(); i++) {
            var d = of(exercises[i]);
            var seen = false;
            for (var j = 0; j < days.size(); j++) {
                if (days[j].equals(d)) { seen = true; break; }
            }
            if (!seen) { days.add(d); }
        }
        return days;
    }

    // forDay returns just the exercises belonging to `day`.
    function forDay(exercises, day) {
        var out = [];
        for (var i = 0; i < exercises.size(); i++) {
            if (of(exercises[i]).equals(day)) { out.add(exercises[i]); }
        }
        return out;
    }

    // menu builds the day picker; each item's id is its day label.
    function menu(exercises) {
        var m = new WatchUi.Menu2({:title => WatchUi.loadResource(Rez.Strings.DayTitle)});
        var days = distinct(exercises);
        for (var i = 0; i < days.size(); i++) {
            var d = days[i];
            m.addItem(new WatchUi.MenuItem(d, forDay(exercises, d).size().toString() + " exercises", d, {}));
        }
        return m;
    }

    // exerciseMenu builds the exercise picker for one day (title = day label).
    function exerciseMenu(exercises, day) {
        var m = new WatchUi.Menu2({:title => day});
        for (var i = 0; i < exercises.size(); i++) {
            var ex = exercises[i];
            m.addItem(new WatchUi.MenuItem(ex["name"], Fmt.planned(ex), i, {}));
        }
        return m;
    }
}
