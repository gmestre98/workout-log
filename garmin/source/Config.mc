using Toybox.Application;
using Toybox.Time;
using Toybox.Time.Gregorian;

// Config reads the user-editable settings (server URL + watch token) that are
// entered from Garmin Connect Mobile, and holds small shared helpers.
module Config {

    // serverUrl / token prefer the Garmin Connect setting, but fall back to the
    // baked-in values in Secrets.mc. The fallback matters for sideloaded builds:
    // Garmin Connect Mobile can't edit a sideloaded app's settings, and any empty
    // stored value from a previous install would otherwise win over a compiled
    // default. See Secrets.mc.example.
    function serverUrl() {
        var v = Application.getApp().getProperty("serverUrl");
        if (v == null || v.toString().length() == 0) {
            return Secrets.SERVER_URL;
        }
        return v.toString();
    }

    function token() {
        var v = Application.getApp().getProperty("apiToken");
        if (v == null || v.toString().length() == 0) {
            return Secrets.API_TOKEN;
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
