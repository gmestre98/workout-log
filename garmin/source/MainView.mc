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
        // drawText does not wrap, so long messages (e.g. the setup prompt) would
        // run off the round screen and clip. Wrap to ~78% of the width and draw
        // the resulting lines centered as a block.
        var font = Gfx.FONT_TINY;
        var lines = wrap(dc, msg, font, (dc.getWidth() * 78) / 100);
        var lineH = dc.getFontHeight(font);
        var startY = dc.getHeight() / 2 - (lines.size() * lineH) / 2 + lineH / 2;
        for (var i = 0; i < lines.size(); i++) {
            dc.drawText(dc.getWidth() / 2, startY + i * lineH, font, lines[i],
                Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
        }
    }

    // wrap greedily splits text into lines that each fit within maxWidth pixels.
    hidden function wrap(dc, text, font, maxWidth) {
        var words = split(text, " ");
        var lines = [];
        var cur = "";
        for (var i = 0; i < words.size(); i++) {
            var w = words[i];
            if (w.length() == 0) {
                continue;
            }
            var candidate = cur.equals("") ? w : cur + " " + w;
            if (dc.getTextWidthInPixels(candidate, font) <= maxWidth || cur.equals("")) {
                cur = candidate;
            } else {
                lines.add(cur);
                cur = w;
            }
        }
        if (!cur.equals("")) {
            lines.add(cur);
        }
        return lines;
    }

    // split breaks a string on a single-character separator (Monkey C has no
    // built-in String.split on this API level).
    hidden function split(text, sep) {
        var out = [];
        var rest = text;
        var idx = rest.find(sep);
        while (idx != null) {
            out.add(rest.substring(0, idx));
            rest = rest.substring(idx + sep.length(), rest.length());
            idx = rest.find(sep);
        }
        out.add(rest);
        return out;
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
