using Toybox.Lang;

// Travel holds the shared travel-mode setting fetched from the backend and
// applies it to exercises. Travel mode is a global trip switch: while it's on,
// every exercise that has a travel replacement is performed, logged and scored
// as its variant — under the SAME exercise id, so history stays aligned. The
// state lives server-side (GET/PUT /api/travel), so the phone app and the watch
// share one trip switch instead of each keeping its own. Mirrors the frontend's
// travel.ts + applyTravel.
module Travel {
    // on is the global switch; off holds ids kept on their normal version even
    // while it's on (the movements the user brought equipment for). loaded is
    // false until the setting has been read, so a failed fetch can be told apart
    // from a genuine "off" and the day's own stamp is preserved instead.
    var on = false;
    var off = [];
    var loaded = false;

    // set records the state fetched from the backend.
    function set(isOn, offIds) {
        on = isOn;
        off = (offIds instanceof Lang.Array) ? offIds : [];
        loaded = true;
    }

    // clear resets to "unknown/off" when the setting could not be read.
    function clear() {
        on = false;
        off = [];
        loaded = false;
    }

    // isOff reports whether the exercise id is kept on its normal version.
    function isOff(id) {
        for (var i = 0; i < off.size(); i++) {
            if (off[i].equals(id)) { return true; }
        }
        return false;
    }

    // hasVariant reports whether ex has a usable travel replacement.
    function hasVariant(ex) {
        var t = ex["travel"];
        return t != null && t["name"] != null;
    }

    // anyVariant reports whether any exercise in the list has a travel version,
    // so the toggle is only offered when it would do something.
    function anyVariant(exercises) {
        for (var i = 0; i < exercises.size(); i++) {
            if (hasVariant(exercises[i])) { return true; }
        }
        return false;
    }

    // apply returns the exercise as it should be performed: when travel mode is
    // on, the exercise has a variant, and it is not individually opted out, its
    // movement-defining fields are swapped for the variant's. Identity/grouping
    // fields (id, workoutDay, timeSlot, sortOrder, active) are kept, so the swap
    // is invisible to grouping, logging and scoring. Otherwise ex is returned
    // unchanged.
    function apply(ex) {
        if (!on || !hasVariant(ex) || isOff(ex["id"])) {
            return ex;
        }
        var t = ex["travel"];
        var out = {};
        var keys = ex.keys();
        for (var i = 0; i < keys.size(); i++) {
            out[keys[i]] = ex[keys[i]];
        }
        out["name"] = t["name"];
        out["plannedSets"] = t["plannedSets"];
        out["plannedAmount"] = t["plannedAmount"];
        out["unit"] = t["unit"];
        out["note"] = t["note"];
        out["restSeconds"] = t["restSeconds"];
        out["perSide"] = t["perSide"];
        out["equipment"] = t["equipment"];
        return out;
    }
}
