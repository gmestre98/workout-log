using Toybox.Communications;

// Api wraps the three backend calls the watch needs, each authenticating with
// the watch token as a Bearer header. Callbacks have the standard
// makeWebRequest signature: function(responseCode, data).
module Api {

    function authHeaders() {
        return {
            "Authorization" => "Bearer " + Config.token()
        };
    }

    // getExercises fetches the full exercise list (the caller filters to active).
    function getExercises(cb) {
        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => authHeaders(),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Communications.makeWebRequest(Config.base() + "/api/exercises", null, options, cb);
    }

    // getDay fetches the DayLog for date ("YYYY-MM-DD").
    function getDay(date, cb) {
        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => authHeaders(),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Communications.makeWebRequest(Config.base() + "/api/days/" + date, null, options, cb);
    }

    // putDay saves the whole DayLog for date.
    function putDay(date, body, cb) {
        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_PUT,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + Config.token()
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Communications.makeWebRequest(Config.base() + "/api/days/" + date, body, options, cb);
    }
}
