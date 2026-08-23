// Fmt holds small string formatters shared across views. ASCII only, so glyphs
// render on every device font.
module Fmt {

    function unitShort(unit) {
        if (unit.equals("reps")) { return "reps"; }
        if (unit.equals("seconds")) { return "s"; }
        if (unit.equals("minutes")) { return "min"; }
        return unit;
    }

    // planned describes an exercise, e.g. "3x8 reps - Wake up".
    function planned(ex) {
        var line = ex["plannedSets"].toString() + "x" + ex["plannedAmount"].toString()
            + " " + unitShort(ex["unit"]);
        var slot = ex["timeSlot"];
        if (slot != null && slot.length() > 0) {
            line = line + " - " + slot;
        }
        return line;
    }

    // mmss renders a whole number of seconds as m:ss.
    function mmss(total) {
        if (total < 0) { total = 0; }
        var m = total / 60;
        var s = total % 60;
        return m.toString() + ":" + s.format("%02d");
    }
}
