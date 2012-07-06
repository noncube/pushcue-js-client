/*global $xhr:false */
// client-side requires our custom netlib,
// server-side requires 'request' module
(function() {
    var request,
        pc = {},
        user = {},
        conf = { host: 'api.pushcue.com', port: 80, secure: false, chunksize: 1024*512 /*512 KB*/ },
        nodejs = false;

    if (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined') {
        module.exports = pc;
        request = require('request');
        nodejs = true;
    } else {
        window.pushcue = pc;
        request = function(opts, cb) {
            return new $xhr(opts, cb);
        };
        if (!window.$xhr) {
            console.log('xhr2 lib missing.');
            return;
        }

        pc.supported = true;
        pc.fallback = !$xhr.supported();
    }

    conf.url = function(secure){
        var secure_required = secure || this.secure;
        var url = 'http' + (secure_required ? 's' : '') + '://' + this.host;

        if (secure_required && this.port !== 443) {
            url += ':' + this.port;
        } else if (!secure_required && this.port !== 80) {
            url += ':' + this.port;
        }

        return url;
    };

    pc.url = function() {
        return conf.url.call(conf);
    };

    // Override config if necessary
    pc.use = function(opts) {
        conf.host = opts.host || conf.host;
        conf.port = opts.port || conf.port;
        conf.secure = opts.secure || conf.secure;
        conf.chunksize = opts.chunksize || conf.chunksize;

        if (opts.returnDomain)
            conf.returnDomain = 'http'+ (conf.secure ? 's' : '') + '://' + opts.returnDomain;
    };

    // Pushcue Errors
    //------------------------------------------------------------------------/
    var PushcueError = function (opts) {
        if (opts) {
            this.code = opts.code || "unknown";
            this.message = opts.message || "Unknown error";
            this.data = opts.data;
            if (opts.status)
                this.status = opts.status;
        } else {
            this.code = "unknown";
            this.message = "Unknown error";
        }
    };
    PushcueError.prototype = new Error();
    PushcueError.prototype.constructor = PushcueError;

    var parseErrorResult = function(data, status) {
        var error = new PushcueError();
        error.status = status;

        if (typeof data !== 'object') {
            try {
                error.data = JSON.parse(data);
                error.code = error.data.code || error.code;
                error.message = error.data.message || error.message;
            } catch(e) {
                error.data = data;
            }
        } else {
            error.data = data;
            error.code = data.code || error.code;
            error.message = data.message || error.message;
            error.status = status || error.status;
        }

        return error;
    };

    var requestHandler = function(cb) {
        return function (error, response, body) {
            if (!nodejs) {
                error = error && parseErrorResult(error, error.status);
                return cb(error, response);
            }

            if (response && response.statusCode >= 300) {
                cb(parseErrorResult(response.body, response.statusCode));
            } else {
                if (typeof body !== 'object') {
                    var temp;
                    try {
                        temp = JSON.parse(body);
                        body = temp;
                    } catch(e) {}
                }
                cb(undefined, body);
            }
        };
    };

    // request wrapper
    //------------------------------------------------------------------------/
    var _request = function(opts, cb) {
        var settings = {
            type: opts.method,
            headers: opts.headers || {},
            timeout: opts.timeout || 5000,
            method: opts.method
        };
        if (!nodejs && pc.fallback) {
            settings.url = conf.url() + '/api' + opts.path;
        } else {
            settings.url = conf.url() + opts.path;
        }

        if (opts.data)
            settings.json = opts.data;

        if (opts.progress)
            settings.progress = opts.progress;

        if (opts.auth) {
            if (user['PC-ID'] && user['PC-TOKEN']) {
                settings.headers['PC-ID'] = user['PC-ID'];
                settings.headers['PC-TOKEN'] = user['PC-TOKEN'];

            } else if (opts.auth !== 'maybe') {
                return cb(new PushcueError({
                    code: 'missing_auth',
                    message: 'You must be logged in for this action.'
                }));
            }
        }

        if (opts.file) { // <File> or <Blob> object
            settings.headers['X-File-Name'] = opts.file.name;
            settings.data = opts.file;
        }

        request(settings, requestHandler(cb));
    };

    // recursive chunked upload
    var _chunked_request = function(opts, callback) {
        var baseUrl = conf.url() + opts.path,
            baseSettings = {
                type: 'POST',
                dataType: opts.dataType || 'json',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': opts.file.type,
                    'X-File-Name': opts.file.name
                },
                timeout: 20000
            };

        var cSize = conf.chunksize,
            count = 0,
            finished = false,
            retries = 5 + ((opts.file.size / cSize)/100) | 0, // 5 + (1 per 100 chunks)
            key;


        if (user['PC-ID'] && user['PC-TOKEN']) {
            baseSettings.headers['PC-ID'] = user['PC-ID'];
            baseSettings.headers['PC-TOKEN'] = user['PC-TOKEN'];
        }

        var xhrPart = function (file, start) {
            var totalSize = file.size,
                end = start + cSize,
                last = totalSize - end <= 0;

            count++;

            var chunk = (file.mozSlice) ? file.mozSlice(start, end) :
                (file.webkitSlice) ? file.webkitSlice(start, end) :
                    (file.slice) ? file.slice(start, cSize) :
                        undefined;

            baseSettings.url = baseUrl + '/?start=' + start;

            if (key) baseSettings.url += '&key=' + key;
            if (last) baseSettings.url += '&last=1';

            baseSettings.data = chunk;

            if (opts.progress)
                baseSettings.progress = function() {
                    var percent = (
                        (this.loaded + count * cSize - cSize) * 100 / totalSize
                        ) | 0;
                    opts.progress(percent);
                };

            request(baseSettings, requestHandler(function(error, response) {
                if (error) {
                    count--;
                    if (!finished && retries > 0) {
                        retries--;
                        xhrPart(file, start);
                    } else if (!finished) {
                        callback(error);
                    }
                } else {
                    if (!last) {
                        if (!key)
                            key = response.key;

                        xhrPart(file, end);

                    } else {
                        finished = true;
                        if (opts.progress) opts.progress(100);
                        callback(undefined, response);
                    }
                }
            }));
        };

        xhrPart(opts.file, 0);
    };
    // Main public API
    //------------------------------------------------------------------------/
    pc.isAuthenticated = function () {
        return !!user['PC-TOKEN'];
    };

    pc.getUserAuth = function() {
        return { 'PC-ID': user['PC-ID'], 'PC-TOKEN': user['PC-TOKEN'] };
    };

    pc.setUserAuth = function(auth) {
        user['PC-ID'] = auth['PC-ID'];
        user['PC-TOKEN'] = auth['PC-TOKEN'];
    };

    pc.clearAuth = function() {
        user = {};
    };

    // Authenticate a user to the service.
    // Requires opts.username && opts.password && cb
    pc.auth = function(opts, cb) {
        if (!opts || !opts.username || !opts.password || !cb)
            return cb(new PushcueError({
                code: 'missing_param',
                message: 'Missing username, password, or cb.',
                data: {
                    username: opts && opts.username,
                    password: opts && opts.password,
                    cb: cb ? true : undefined
                }
            }));

        _request({ path: '/login', method: 'POST', data: opts },
            function(err, data) {
                if (!err) {
                    if (data['PC-ID'] && data['PC-TOKEN']) {
                        user = data;
                        user.username = opts.username;

                    } else {
                        err = parseErrorResult(data);
                    }
                }
                cb(err, data);
            }
        );
    };

    // Logout current user (invalidate current api token)
    pc.deAuth = function(cb) {
        if (!cb)
            throw new PushcueError({
                code: 'missing_param',
                message: 'Missing cb.',
                data: {
                    cb: undefined
                }
            });

        _request({ path: '/logout', method: 'post', auth: true }, function(err) {
            if (!err) user = {};
            cb(err);
        });
    };

    pc.requestInvitation = function(email, cb) {
        if (!cb)
            throw new PushcueError({
               code: 'missing_param',
               message: 'Missing cb.',
               data: {
                   cb: undefined
               }
           });

        if (!email)
            return cb(new PushcueError({
                code: 'missing_param',
                message: 'Missing a required parameter.',
                data: {
                    email: email,
                    path: conf.returnDomain
                }
            }));

        _request({ path: '/requests', method: 'post', data: { email: email }}, cb);
    };

    pc.users = {
        // Create new user
        // Requires opts.username && opts.password && opts.email && opts.invite && cb
        create: function(opts, cb) {
            if (!opts || !cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing opts or cb.',
                    data: {
                        opts: opts,
                        cb: cb ? true : undefined
                    }
                });

            if (!opts.username || !opts.password || !opts.email || !opts.invite)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter.',
                    data: {
                        username: opts.username,
                        password: opts.password,
                        email: opts.email,
                        invite: opts.invite,
                        path: opts.path
                    }
                }));

            _request({ path: '/users', method: 'POST', data: opts }, cb);
        },
        subscribe: function(opts, cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing cb.',
                    data: {
                        cb: cb ? true : undefined
                    }
                });

            if (!opts.token && !opts.promo)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter (token or promo).',
                    data: {
                        token: !!opts.token,
                        promo: !!opts.promo
                    }
                }));
            var data = {};
            if (opts.token)
                data.stripeToken = opts.token;

            if (opts.promo)
                data.promo = opts.promo;


            _request({
                 path: '/users/subscribe',
                 method: 'POST',
                 auth: true,
                 data: data
             }, cb);
        },
        update_payment: function(opts, cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing cb.',
                    data: {
                        cb: cb ? true : undefined
                    }
                });

            if (!opts.token)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter (token).',
                    data: {
                        token: !!opts.token
                    }
                }));
            var data = { stripeToken: opts.token };

            _request({
                path: '/users/update-payment',
                method: 'POST',
                auth: true,
                data: data
            }, cb);
        },
        unsubscribe: function(cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing cb.',
                    data: {
                        cb: cb ? true : undefined
                    }
                });

            _request({
                path: '/users/unsubscribe',
                method: 'POST',
                auth: true
            }, cb);
        },
        update: function(opts, cb) {
            if (!opts || !cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing opts or cb.',
                    data: {
                        opts: opts,
                        cb: cb ? true : undefined
                    }
                });

            if (!opts.password)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter.',
                    data: {
                        password: opts.password
                    }
                }));

            _request({
                 path: '/users/' + user['PC-ID'],
                 method: 'PUT',
                 auth: true,
                 data: opts
             }, cb);
        },
        // Get current user
        'get': function(cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing cb.',
                    data: {
                        cb: undefined
                    }
                });

            _request({
                path: '/users/' + user['PC-ID'],
                method: 'GET',
                auth: true
            }, cb);
        },
        // Delete current user
        del: function(cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing cb.',
                    data: {
                        cb: undefined
                    }
                });

            _request({
                path: '/users/' + user.username,
                method: 'DELETE',
                auth: true
            }, cb);
        },
        resetPasswordRequest: function(opts, cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing cb.',
                    data: {
                        cb: undefined
                    }
                });

            if (!opts.email)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter.',
                    data: {
                        email: opts.email
                    }
                }));

            opts.path = conf.returnDomain + opts.path;

            _request({ path: '/users/reset-password-request', method: 'post', data: opts }, cb);
        },
        resetPassword: function(opts, cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing cb.',
                    data: {
                        cb: undefined
                    }
                });

            if (!opts.password || !opts.key || !opts.username)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter.',
                    data: {
                        password: opts.password,
                        key: opts.key,
                        username: opts.username
                    }
                }));

            _request({
                path: '/users/reset-password/' + opts.key,
                method: 'post',
                data: { password: opts.password, username: opts.username }
            }, cb);
        },

        resendActivation: function(opts, cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing cb.',
                    data: {
                        cb: undefined
                    }
                });

            if (!opts.email)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter.',
                    data: {
                        email: opts.email
                    }
                }));

            _request({
                path: '/users/resend-activation/',
                method: 'post',
                data: { email: opts.email, path: conf.returnDomain + opts.path }
            }, cb);
        },

        activate: function(opts, cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing cb.',
                    data: {
                        cb: undefined
                    }
                });

            if (!opts.id || !opts.key)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter.',
                    data: {
                        id: opts.id,
                        key: opts.key
                    }
                }));

            _request({
                path: '/users/' + opts.id + '/activation/',
                method: 'post',
                data: { key: opts.key }
            }, cb);
        }

    };

    pc.uploads = {
        // Get current user's uploads
        all: function(page, cb) {
            page = page || 1;
            if (typeof page === 'function') {
                cb = page;
                page = 1;
            }

            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing page/cb.',
                    data: {
                        page: page,
                        cb: cb ? true : undefined
                    }
                });

            _request({
                path: '/uploads' + '?page=' + page,
                method: 'GET',
                auth: true
            }, cb);
        },

        'get': function(opts, cb) {
            if (!cb || !opts.id)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing id or cb.',
                   data: {
                       id: opts.id,
                       cb: cb ? true : undefined
                   }
               });

            var settings = {
                path: '/uploads/' + opts.id,
                method: 'GET',
                auth: 'maybe'
            };

            if (opts.password) { // support for 3rd party users opening passworded file
                settings.method = 'POST';
                settings.data = {password: opts.password};
            }

            _request(settings, cb);
        },


        create: function(opts, callback) {
            // file needs to be instanceof File
            if (!callback || !opts.file)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing file or callback.',
                   data: {
                       file: !!opts.file,
                       callback: callback ? true : undefined
                   }
               });

            opts.path = '/uploads/async';

            _chunked_request(opts, callback);
        },

        download: function(opts, cb) { // on success, return should be raw file
            if (!cb || !opts.id)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing id, filename, or cb.',
                   data: {
                       id: opts.id,
                       filename: opts.filename,
                       cb: cb ? true : undefined
                   }
               });
            var filename = opts.filename || '';

            var settings = {
                path: '/uploads/' + opts.id + '/download/' + filename,
                method: 'GET',
                auth: 'maybe'
            };

            if (opts.password) { // support for 3rd party users opening passworded file
                settings.method = 'POST';
                settings.data = {password: opts.password};
            }

            _request(settings, cb);
        },

        update: function(opts, cb) {
            if (!cb || !opts.id)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing id or cb.',
                   data: {
                       id: opts.id,
                       cb: cb ? true : undefined
                   }
               });
            if (!opts.password && !opts.email) {
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'New password is required.',
                    data: {
                        password: opts.password,
                        email: opts.email
                    }
                }));
            }

            _request({
                path: '/uploads/' + opts.id,
                method: 'PUT',
                auth: true,
                data: { password: opts.password, email: opts.email }
            }, cb);
        },
        del: function(id, cb) {

            if (!id || !cb)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing id or cb.',
                   data: {
                       id: id,
                       cb: cb ? true : undefined
                   }
               });

            _request({
                path: '/uploads/' + id,
                method: 'DELETE',
                auth: true
            }, cb);
        }
    };
    pc.bins = {
        all: function(cb) {
            if (!cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing page/cb.',
                    data: {
                        cb: cb ? true : undefined
                    }
                });

            _request({
                path: '/bins',
                method: 'GET',
                auth: true
            }, cb);
        },
        'get': function(id, cb) {
            if (!cb || !id)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing id or cb.',
                    data: {
                        id: id,
                        cb: cb ? true : undefined
                    }
                });

            var settings = {
                path: '/bins/' + id,
                method: 'GET',
                auth: 'maybe'
            };

            _request(settings, cb);
        },
        create: function(opts, cb) {
            if (!opts || !cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing opts or cb.',
                    data: {
                        opts: opts,
                        cb: cb ? true : undefined
                    }
                });

            if (!opts.name)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter.',
                    data: {
                        name: opts.name
                    }
                }));

            _request({ path: '/bins', method: 'POST', auth: true, data: opts }, cb);
        },

        update: function(opts, cb) {
            if (!opts || !cb)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing opts or cb.',
                    data: {
                        opts: opts,
                        cb: cb ? true : undefined
                    }
                });

            if (!opts._id)
                return cb(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter.',
                    data: {
                        _id: opts._id
                    }
                }));

            _request({ path: '/bins/' + opts._id, method: 'PUT', auth: true, data: opts }, cb);
        },

        upload: function(opts, callback) {
            // file needs to be instanceof File
            if (!callback)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing callback.'
                });

            if (!opts.file || !opts.bin)
                return callback(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing file or bin id.',
                    data: {
                        file: opts.file,
                        bin: opts.bin
                    }
                }));

            opts.path = '/bins/' + opts.bin + '/async';

            _chunked_request(opts, callback);
        }
    };

}).call(this);
