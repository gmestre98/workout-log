using Toybox.WatchUi;
using Toybox.Graphics as Gfx;
using Toybox.Timer;
using Toybox.Attention;
using Toybox.Lang;

// WorkoutView runs one exercise: a set timer (countdown for timed exercises, a
// stopwatch for rep exercises) followed by a rest countdown, repeated for each
// planned set. Completed sets are collected and saved to the backend when the
// exercise is finished or the user backs out.
//
// Controls (fenix 6 Pro buttons):
//   START  begin a set / finish a rep set / skip rest
//   BACK   leave the exercise (saves what was done)
class WorkoutView extends WatchUi.View {

    hidden var mEx;
    hidden var mExId;
    hidden var mUnit;
    hidden var mIsTimed;       // true for seconds/minutes exercises
    hidden var mSetDuration;   // seconds, for timed exercises
    hidden var mPlannedAmount;
    hidden var mRestSeconds;
    hidden var mTotalSets;

    hidden var mState;         // :ready :running :resting :saving :saved :error
    hidden var mSetIndex;      // 0-based index of the current/next set
    hidden var mRemaining;     // countdown seconds (timed set or rest)
    hidden var mElapsed;       // stopwatch seconds (rep set)
    hidden var mEntries;       // Array of logged set dictionaries

    hidden var mTimer;
    hidden var mSaving;
    hidden var mSaved;

    function initialize(ex) {
        View.initialize();
        mEx = ex;
        mExId = ex["id"];
        mUnit = ex["unit"];
        mPlannedAmount = ex["plannedAmount"];
        mRestSeconds = (ex["restSeconds"] == null) ? 0 : ex["restSeconds"];
        mIsTimed = mUnit.equals("seconds") || mUnit.equals("minutes");
        mSetDuration = mUnit.equals("minutes") ? mPlannedAmount * 60 : mPlannedAmount;

        var perSide = (ex["perSide"] == true);
        mTotalSets = ex["plannedSets"] * (perSide ? 2 : 1);

        mState = :ready;
        mSetIndex = 0;
        mRemaining = 0;
        mElapsed = 0;
        mEntries = [];
        mSaving = false;
        mSaved = false;
    }

    function onHide() {
        stopTimer();
        // Persist whatever was completed if we didn't already save.
        if (mEntries.size() > 0 && !mSaved && !mSaving) {
            save();
        }
    }

    // onStart is bound to the START button; behaviour depends on the state.
    function onStart() {
        if (mState == :ready) {
            beginSet();
        } else if (mState == :running) {
            finishSet();
        } else if (mState == :resting) {
            finishRest();
        }
    }

    hidden function beginSet() {
        mState = :running;
        mRemaining = mSetDuration;
        mElapsed = 0;
        startTimer();
        WatchUi.requestUpdate();
    }

    hidden function finishSet() {
        stopTimer();
        var seconds = mIsTimed ? (mSetDuration - mRemaining) : mElapsed;
        if (seconds < 0) { seconds = 0; }
        var actual;
        if (mUnit.equals("minutes")) {
            actual = seconds / 60;
        } else if (mUnit.equals("seconds")) {
            actual = seconds;
        } else {
            actual = mPlannedAmount; // reps: assume the planned count was done
        }
        mEntries.add({
            "completed" => true,
            "actualAmount" => actual,
            "seconds" => seconds
        });
        buzz();
        mSetIndex++;
        if (mSetIndex >= mTotalSets) {
            save();
        } else if (mRestSeconds > 0) {
            mState = :resting;
            mRemaining = mRestSeconds;
            startTimer();
        } else {
            mState = :ready;
        }
        WatchUi.requestUpdate();
    }

    hidden function finishRest() {
        stopTimer();
        buzz();
        mState = :ready;
        WatchUi.requestUpdate();
    }

    function onTick() as Void {
        if (mState == :running) {
            if (mIsTimed) {
                mRemaining--;
                if (mRemaining <= 0) {
                    finishSet();
                    return;
                }
            } else {
                mElapsed++;
            }
        } else if (mState == :resting) {
            mRemaining--;
            if (mRemaining <= 0) {
                finishRest();
                return;
            }
        }
        WatchUi.requestUpdate();
    }

    hidden function startTimer() {
        stopTimer();
        mTimer = new Timer.Timer();
        mTimer.start(method(:onTick), 1000, true);
    }

    hidden function stopTimer() {
        if (mTimer != null) {
            mTimer.stop();
            mTimer = null;
        }
    }

    hidden function buzz() {
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(75, 400)]);
        }
    }

    // --- saving -----------------------------------------------------------

    hidden function save() {
        if (mSaving || mSaved) {
            return;
        }
        mSaving = true;
        mState = :saving;
        WatchUi.requestUpdate();
        Api.getDay(Config.today(), method(:onDayLoaded));
    }

    function onDayLoaded(responseCode, data) {
        var exercises = {};
        if (responseCode == 200 && data != null && data["exercises"] != null) {
            exercises = data["exercises"];
        }
        exercises[mExId] = {
            "exerciseId" => mExId,
            "plannedSets" => mEx["plannedSets"],
            "plannedAmount" => mPlannedAmount,
            "unit" => mUnit,
            "sets" => mEntries
        };
        var body = {
            "date" => Config.today(),
            "exercises" => exercises
        };
        Api.putDay(Config.today(), body, method(:onDaySaved));
    }

    function onDaySaved(responseCode, data) {
        mSaving = false;
        if (responseCode == 200 || responseCode == 201) {
            mSaved = true;
            mState = :saved;
        } else {
            mState = :error;
        }
        WatchUi.requestUpdate();
    }

    // --- drawing ----------------------------------------------------------

    function onUpdate(dc) {
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_BLACK);
        dc.clear();
        var cx = dc.getWidth() / 2;
        var cy = dc.getHeight() / 2;

        // Header: exercise name.
        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - 78, Gfx.FONT_TINY, mEx["name"], Gfx.TEXT_JUSTIFY_CENTER);

        if (mState == :saving) {
            drawCenter(dc, cx, cy, WatchUi.loadResource(Rez.Strings.Saving));
            return;
        }
        if (mState == :saved) {
            drawCenter(dc, cx, cy, WatchUi.loadResource(Rez.Strings.Saved));
            return;
        }
        if (mState == :error) {
            dc.setColor(Gfx.COLOR_RED, Gfx.COLOR_TRANSPARENT);
            drawCenter(dc, cx, cy, WatchUi.loadResource(Rez.Strings.SaveFailed));
            return;
        }

        // Set counter, e.g. "Set 2/4".
        var counter = WatchUi.loadResource(Rez.Strings.Set) + " "
            + (mSetIndex + 1).toString() + "/" + mTotalSets.toString();
        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - 44, Gfx.FONT_SMALL, counter, Gfx.TEXT_JUSTIFY_CENTER);

        if (mState == :resting) {
            dc.setColor(Gfx.COLOR_ORANGE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, cy - 8, Gfx.FONT_MEDIUM, WatchUi.loadResource(Rez.Strings.Rest),
                Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, cy + 34, Gfx.FONT_NUMBER_MEDIUM, Fmt.mmss(mRemaining),
                Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
            return;
        }

        // Big value: countdown for timed sets, stopwatch for rep sets.
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        var big;
        if (mState == :running) {
            big = mIsTimed ? Fmt.mmss(mRemaining) : Fmt.mmss(mElapsed);
        } else {
            // ready: show the target
            big = mIsTimed ? Fmt.mmss(mSetDuration) : mPlannedAmount.toString();
        }
        dc.drawText(cx, cy + 6, Gfx.FONT_NUMBER_HOT, big,
            Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);

        // Footer hint / unit.
        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        var footer;
        if (mState == :ready) {
            footer = WatchUi.loadResource(Rez.Strings.StartHint);
        } else {
            footer = mIsTimed ? "" : Fmt.unitShort(mUnit);
        }
        if (!footer.equals("")) {
            dc.drawText(cx, cy + 60, Gfx.FONT_TINY, footer, Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    hidden function drawCenter(dc, cx, cy, text) {
        dc.drawText(cx, cy, Gfx.FONT_MEDIUM, text,
            Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }
}

// WorkoutDelegate maps the START button to the view's state machine. BACK uses
// the default behaviour (pop the view), which triggers onHide -> save.
class WorkoutDelegate extends WatchUi.BehaviorDelegate {
    hidden var mView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onSelect() {
        mView.onStart();
        return true;
    }
}
