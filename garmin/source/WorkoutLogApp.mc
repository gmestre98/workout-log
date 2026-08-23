using Toybox.Application;
using Toybox.WatchUi;

// WorkoutLogApp is the Connect IQ entry point. It opens on a small loading
// screen (MainView) which fetches the active exercises and then switches to the
// exercise picker.
class WorkoutLogApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state) {
    }

    function onStop(state) {
    }

    // getInitialView returns the first screen shown when the app launches.
    function getInitialView() {
        var view = new MainView();
        return [view, new MainDelegate(view)];
    }

    // onSettingsChanged fires when the user edits the server URL / token in
    // Garmin Connect. Nothing to do live; the values are read on next fetch.
    function onSettingsChanged() {
        WatchUi.requestUpdate();
    }
}
