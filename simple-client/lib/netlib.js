// based on xhr2-lib
var isMSIE = function() {
    if (!isMSIE.cache) {
        var re, rv = false;
        if (navigator.appName === 'Microsoft Internet Explorer')
        {
            re  = new RegExp("MSIE ([0-9]{1,}[\.0-9]{0,})");
            if (re.exec(navigator.userAgent))
                rv = parseFloat( RegExp.$1 );
        }
        isMSIE.cache = rv;
    }
    return isMSIE.cache;
};

(function (ns) {
    "use strict";
    var util = {
        mix: function () {
            var ret = {}, i = 0, key;

            if (arguments.length && typeof arguments[0] !== "undefined") {

                for (; i < arguments.length; ++i) { // each option set
                    for (key in arguments[i]) {
                        if (arguments[i].hasOwnProperty(key))
                            ret[key] = arguments[i][key];
                    }
                }
            }

            return ret;
        },

        isObjectNotBlob: function (obj) {
            return typeof obj === "object" &&
                   !util.isTypeOf(obj, "formdata") &&
                   !util.isTypeOf(obj, "file") &&
                   !util.isTypeOf(obj, "blob");
        },


        isTypeOf: function (obj, type) {

            var cts = obj.constructor.toString().toLowerCase();
            type = type.replace(/^\s*|\s*$/, "").toLowerCase();

            return cts.indexOf(type) !== -1;

        },

        serialize: function (data, appendTo) {
            var qs = "";

            if (appendTo && typeof appendTo === "string")
                qs = (appendTo.indexOf("?") === -1) ? "?" : '&';

            appendTo = appendTo || "";

            if (typeof data === "object") {
                for (var key in data) {
                    if (data.hasOwnProperty(key)) {
                        qs += key + "=" + data[key] + "&";
                    }
                }
            }

            return appendTo + qs.substr(0, qs.length - 1); // scrub the last &;
        },
        addHeaders: function (client, resType, headers) {
            var accept, header;

            switch ((resType || "").toLowerCase()) {

                case "json":
                    accept = "application/json, text/javascript, ";
                    break;

                case "xml":
                    accept = "text/xml, application/xml, ";
                    break;

                case "text":
                    accept = "text/plain, ";
                    break;

                default:
                    accept = "text/html, ";

            }

            accept += "*/*;q=0.01";
            client.setRequestHeader("Accept", accept);

            if (typeof headers === "object") { // user defined headers
                for (header in headers) { if (headers.hasOwnProperty(header)) {
                    client.setRequestHeader(header, headers[header]);
                }}
            }
        },

        normalize: function(xhr, settings) {
            var key, tmp, item;

            settings = util.mix({ // default request parameters
                progress: false,
                type: "get",
                dataType: "json",
                async: true,
                username: null,
                password: null,
                timeout: 0,
                withCredentials: false
            }, settings);

            settings.type = settings.type.toLowerCase();

            if (typeof settings.data === "object" &&
                !util.isTypeOf(settings.data, "formdata") &&
                !util.isTypeOf(settings.data, "file") &&
                !util.isTypeOf(settings.data, "blob")) {

                if (settings.type === "get") {
                    settings.url = util.serialize(settings.data, settings.url);
                    settings.data = null;

                } else {
                    tmp = new FormData();

                    for (key in settings.data) {
                        if (settings.data.hasOwnProperty(key)) {
                            item = settings.data[key];

                            tmp.append(
                                key,
                                util.isTypeOf(item, "array") ? item.join() : item
                            );
                        }
                    }
                    settings.data = tmp;
                }
            }
            return settings;
        }

    };

    ns.$xhr = function (opts, callback) {
        var aborted = false;

        var stateChange = function (ev) {
            var resBody;

            // constant XMLHttpRequest.DONE isn't defined in ie8.
            if (client.readyState === (client.DONE || 4)) {
                if (settings.timer) {
                    clearTimeout(settings.timer);
                }

                if ((client.status >= 200 && client.status < 300) || client.status === 304) {

                    if (settings && typeof callback === "function") {

                        if (settings.dataType === "json") {
                            try {
                                resBody = JSON.parse(client.responseText);
                            } catch (e) {
                                resBody = client.responseText;
                            }

                        } else if (settings.dataType === "xml") {
                            resBody = client.responseXML;

                        } else {
                            resBody = client.responseText;
                        }

                        resBody = resBody || {};
                        resBody.status = client.status;
                        callback(undefined, resBody);
                    }

                } else {
                    requestError();
                }
            }
        };
        var requestError = function () {
            var data;

            if (!aborted) {
                try {
                    data = JSON.parse(client.responseText);
                } catch (e) {
                    data = {message: client.responseText};
                }
                data.status = client.status;
                callback.call(this, data);
            }
        };

        var requestTimeout = function () {
            aborted = true;
            client.abort();
            callback.call(this, {
                code: 'timeout',
                message: 'The request timed out.',
                status: 0
            });
        };


        var client = this.client = new XMLHttpRequest(),
            upload = client.upload,
            settings;

        // also affects the xhr client
        settings = this.settings = util.normalize(client, opts);


        if (settings.timeout > 0) {
            settings.timer = setTimeout(function () {
                requestTimeout();
            }, settings.timeout);
        }

        if (typeof settings.progress === "function") {
            upload.callback = settings.progress;

            upload.onprogress = function (ev) {
                if (ev && ev.lengthComputable) {
                    ev.target.callback.call(ev, Math.round(ev.loaded / ev.total) * 100);
                }
            };
        }

        client.open(
            settings.type,
            settings.url,
            settings.async,
            settings.username,
            settings.password
        );

        client.withCredentials = settings.withCredentials;

        util.addHeaders(client, settings.dataType, settings.headers);

        // cache settings for pickup in state change handler
        client.xhr2data = settings;

        client.onreadystatechange = stateChange;
        client.onerror = requestError;

        settings.data = settings.data || settings.json;
        var data;

        data = util.isObjectNotBlob(settings.data) ?
            settings.data && JSON.stringify(settings.data) :
            settings.data;

        if (data) {
            client.setRequestHeader('Content-Type', 'application/json');
        }
        client.send(data);

        return this;
    };
    ns.$xhr.supported = function() {

        var xhr = new XMLHttpRequest();

        return !!window.FileReader && (
            typeof xhr.upload !== "undefined" && (
                // Web worker
                typeof ns.postMessage !== "undefined" ||
                    // window
                    (typeof ns.FormData !== "undefined" && typeof ns.File !== "undefined")
                )
            );
    };

})(window);
