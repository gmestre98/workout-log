using Toybox.WatchUi;
using Toybox.Graphics as Gfx;
using Toybox.System;
using Toybox.Lang;

// MainView is the launch screen. It shows a short status message while the
// exercise list is fetched, then switches to the exercise picker.
class MainView extends WatchUi.View {

    hidden var mStatus;   // :setup, :loading, :error, :empty
    hidden var mFetched;  // guard so we fetch only once per show

    function initialize() {
        View.initialize();
        mStatus = :loading;
        mFetched = false;
    }

    function onShow() {
        if (mFetched) {
            return;
        }
        fetch();
    }

    // retry re-runs the fetch (bound to START on the status screen).
    function retry() {
        fetch();
    }

    hidden function fetch() {
        mFetched = true;
        if (!Config.configured()) {
            mStatus = :setup;
            WatchUi.requestUpdate();
            return;
        }
        mStatus = :loading;
        WatchUi.requestUpdate();
        Api.getExercises(method(:onExercises));
    }

    // onExercises receives the exercise list; on success it builds and shows the
    // picker menu (replacing this view so BACK from the menu exits the app).
    function onExercises(responseCode, data) {
        if (responseCode != 200 || !(data instanceof Toybox.Lang.Array)) {
            mStatus = :error;
            WatchUi.requestUpdate();
            return;
        }
        var active = [];
        for (var i = 0; i < data.size(); i++) {
            var ex = data[i];
            if (ex["active"] == true) {
                active.add(ex);
            }
        }
        if (active.size() == 0) {
            mStatus = :empty;
            WatchUi.requestUpdate();
            return;
        }
        var menu = new WatchUi.Menu2({:title => WatchUi.loadResource(Rez.Strings.ExercisesTitle)});
        for (var i = 0; i < active.size(); i++) {
            var ex = active[i];
            menu.addItem(new WatchUi.MenuItem(
                ex["name"],
                Fmt.planned(ex),
                i,
                {}
            ));
        }
        WatchUi.switchToView(menu, new ExerciseMenuDelegate(active), WatchUi.SLIDE_UP);
    }

    function onUpdate(dc) {
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_BLACK);
        dc.clear();
        var msg;
        if (mStatus == :setup) {
            msg = WatchUi.loadResource(Rez.Strings.Setup);
        } else if (mStatus == :error) {
            msg = WatchUi.loadResource(Rez.Strings.LoadFailed);
        } else if (mStatus == :empty) {
            msg = WatchUi.loadResource(Rez.Strings.NoExercises);
        } else {
            msg = WatchUi.loadResource(Rez.Strings.Loading);
        }
        dc.drawText(dc.getWidth() / 2, dc.getHeight() / 2, Gfx.FONT_SMALL, msg,
            Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }
}

// MainDelegate lets a manual retry happen: pressing START on the status screen
// re-runs the fetch (useful after fixing settings or connectivity).
class MainDelegate extends WatchUi.BehaviorDelegate {
    hidden var mView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        mView = view;
    }

    function onSelect() {
        mView.retry();
        return true;
    }
}
