using Toybox.Application;
using Toybox.Time;
using Toybox.Time.Gregorian;

// Config reads the user-editable settings (server URL + watch token) that are
// entered from Garmin Connect Mobile, and holds small shared helpers.
module Config {

    function serverUrl() {
        var v = Application.getApp().getProperty("serverUrl");
        if (v == null) {
            return "";
        }
        return v.toString();
    }

    function token() {
        var v = Application.getApp().getProperty("apiToken");
        if (v == null) {
            return "";
        }
        return v.toString();
    }

    // configured is true once both the server URL and a token are set.
    function configured() {
        return serverUrl().length() > 0 && token().length() > 0;
    }

    // base returns the server URL without a trailing slash.
    function base() {
        var u = serverUrl();
        while (u.length() > 0 && u.substring(u.length() - 1, u.length()).equals("/")) {
            u = u.substring(0, u.length() - 1);
        }
        return u;
    }

    // today returns the local date as "YYYY-MM-DD".
    function today() {
        var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return info.year.format("%04d") + "-" + info.month.format("%02d") + "-" + info.day.format("%02d");
    }
}
