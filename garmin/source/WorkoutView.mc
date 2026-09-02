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
    hidden var mWorkoutDay;    // rotation-day label logged with the day, e.g. "Day 1 - Push"
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
    hidden var mRestElapsed;   // total rest seconds actually spent this exercise
    hidden var mEntries;       // Array of logged set dictionaries

    hidden var mTimer;
    hidden var mSaving;
    hidden var mSaved;

    function initialize(ex, workoutDay) {
        View.initialize();
        mEx = ex;
        mExId = ex["id"];
        mWorkoutDay = workoutDay;
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
        mRestElapsed = 0;
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
            // No configured rest countdown, but idle time between sets still
            // counts as rest (like the phone), so keep the clock running.
            mState = :ready;
            startTimer();
        }
        WatchUi.requestUpdate();
    }

    // finishRest ends the rest *countdown* but does NOT stop the clock: the phone
    // counts all non-training time as rest, so idle time in :ready keeps accruing
    // rest until the next set starts or the exercise is left. Called both when the
    // countdown reaches zero and when the user presses START to skip it.
    hidden function finishRest() {
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
            mRestElapsed++;
            mRemaining--;
            if (mRemaining <= 0) {
                finishRest();
                return;
            }
        } else if (mState == :ready) {
            // Idle between sets once the workout has started counts as rest.
            if (mEntries.size() > 0) { mRestElapsed++; }
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
        var timeBySource = {};
        if (responseCode == 200 && data != null) {
            if (data["exercises"] != null) { exercises = data["exercises"]; }
            if (data["timeBySource"] != null) { timeBySource = data["timeBySource"]; }
        }
        exercises[mExId] = {
            "exerciseId" => mExId,
            "plannedSets" => mEx["plannedSets"],
            "plannedAmount" => mPlannedAmount,
            "unit" => mUnit,
            "sets" => mEntries
        };

        // Add this exercise's timed work (sum of set durations) and the rest taken
        // during it to the watch's own time bucket, on top of what earlier
        // exercises in this session already contributed.
        var trainingSeconds = 0;
        for (var i = 0; i < mEntries.size(); i++) {
            var s = mEntries[i]["seconds"];
            if (s != null) { trainingSeconds += s; }
        }
        var prevTrain = 0;
        var prevRest = 0;
        var watch = timeBySource["watch"];
        if (watch != null) {
            if (watch["trainingSeconds"] != null) { prevTrain = watch["trainingSeconds"]; }
            if (watch["restSeconds"] != null) { prevRest = watch["restSeconds"]; }
        }
        timeBySource["watch"] = {
            "trainingSeconds" => prevTrain + trainingSeconds,
            "restSeconds" => prevRest + mRestElapsed
        };

        var body = {
            "date" => Config.today(),
            "workoutDay" => mWorkoutDay,
            "exercises" => exercises,
            "timeBySource" => timeBySource
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

        // Header: exercise name, truncated so a long name doesn't run off the
        // round screen.
        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        var name = truncate(dc, mEx["name"], Gfx.FONT_TINY, (dc.getWidth() * 68) / 100);
        dc.drawText(cx, cy - 84, Gfx.FONT_TINY, name, Gfx.TEXT_JUSTIFY_CENTER);

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
        var counterY = cy - 52;
        dc.drawText(cx, counterY, Gfx.FONT_SMALL, counter, Gfx.TEXT_JUSTIFY_CENTER);
        var counterBottom = counterY + dc.getFontHeight(Gfx.FONT_SMALL);

        var maxW = (dc.getWidth() * 86) / 100;

        if (mState == :resting) {
            dc.setColor(Gfx.COLOR_ORANGE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, counterBottom + 2, Gfx.FONT_MEDIUM, WatchUi.loadResource(Rez.Strings.Rest),
                Gfx.TEXT_JUSTIFY_CENTER);
            var restTop = counterBottom + 2 + dc.getFontHeight(Gfx.FONT_MEDIUM) + 2;
            var restBottom = cy + 90;
            var restStr = Fmt.mmss(mRemaining);
            var restFont = fitNumber(dc, restStr, maxW, restBottom - restTop);
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (restTop + restBottom) / 2, restFont, restStr,
                Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
            return;
        }

        // Footer hint (ready) or unit (running).
        var footer;
        if (mState == :ready) {
            footer = WatchUi.loadResource(Rez.Strings.StartHint);
        } else {
            footer = mIsTimed ? "" : Fmt.unitShort(mUnit);
        }
        var footerY = cy + 66;

        // Big value: countdown for timed sets, stopwatch for rep sets. Sized to
        // the band between the set counter and the footer so it never overlaps.
        var big;
        if (mState == :running) {
            big = mIsTimed ? Fmt.mmss(mRemaining) : Fmt.mmss(mElapsed);
        } else {
            big = mIsTimed ? Fmt.mmss(mSetDuration) : mPlannedAmount.toString();
        }
        var bandTop = counterBottom + 4;
        var bandBottom = footer.equals("") ? (cy + 86) : (footerY - 4);
        var bigFont = fitNumber(dc, big, maxW, bandBottom - bandTop);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (bandTop + bandBottom) / 2, bigFont, big,
            Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);

        if (!footer.equals("")) {
            dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, footerY, Gfx.FONT_TINY, footer, Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    hidden function drawCenter(dc, cx, cy, text) {
        dc.drawText(cx, cy, Gfx.FONT_MEDIUM, text,
            Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }

    // fitNumber returns the largest number font whose rendering of `text` fits
    // within both maxWidth and maxHeight, so big values never overflow the round
    // screen or collide with the labels above/below them.
    hidden function fitNumber(dc, text, maxWidth, maxHeight) {
        var fonts = [Gfx.FONT_NUMBER_HOT, Gfx.FONT_NUMBER_MEDIUM, Gfx.FONT_NUMBER_MILD, Gfx.FONT_LARGE, Gfx.FONT_MEDIUM];
        for (var i = 0; i < fonts.size(); i++) {
            if (dc.getTextWidthInPixels(text, fonts[i]) <= maxWidth && dc.getFontHeight(fonts[i]) <= maxHeight) {
                return fonts[i];
            }
        }
        return fonts[fonts.size() - 1];
    }

    // truncate shortens `text` with a trailing "..." until it fits maxWidth.
    hidden function truncate(dc, text, font, maxWidth) {
        if (dc.getTextWidthInPixels(text, font) <= maxWidth) {
            return text;
        }
        var s = text;
        while (s.length() > 1 && dc.getTextWidthInPixels(s + "...", font) > maxWidth) {
            s = s.substring(0, s.length() - 1);
        }
        return s + "...";
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
