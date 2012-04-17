// Client-side JS Pushcue API library
//
// Requires xhr2lib
// https://github.com/p-m-p/xhr2-lib
(function(main){ if(window.$xhr && $xhr.supported()){
    var pc = { supported: true }, // Public API
        user = {}; // hold user auth


    // Configuration (private)
    //------------------------------------------------------------------------/
    var conf = { host: 'localhost', port: 8000, secure: false };

    conf.url = function(secure_required){
        return 'http' + ( (secure_required || this.secure) ? 's' : '') +
                '://' + this.host + ':' + this.port;
    };
    pc.url = function() {
        return conf.url.call(conf);
    };

    // Override config if necessary
    pc.use = function(opts) {
        conf.host = opts.host || conf.host;
        conf.port = opts.port || conf.port;
        conf.secure = opts.secure || conf.secure;
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
            error.code = error.data.code || error.code;
            error.message = error.data.message || error.message;
            error.status = error.status || error.data.status;
        }

        return error;
    };

    // $xhr response callback wrappers
    //------------------------------------------------------------------------/
    var success_handler = function(callback) { // <this> is the xhr
        return function(data) {
            data.status = this.status;
            callback(undefined, data);
        };
    };
    var error_handler = function(callback) { // <this> is the xhr
        return function(statusText, status) {
            callback(parseErrorResult(this.responseText, status));
        };
    };

    // $xhr wrapper
    //------------------------------------------------------------------------/
    var _request = function(opts, callback) {
        var settings = {
            url: conf.url() + opts.path,
            type: opts.method,
            dataType: opts.dataType || 'json',
            headers: opts.headers || {},
            timeout: opts.timeout || 3000,
            success: success_handler(callback),
            error: error_handler(callback)
        };

        if (opts.data)
            settings.data = opts.data;

        if (opts.progress)
            settings.progress = opts.progress;

        if (opts.auth) {
            if (user['PC-ID'] && user['PC-TOKEN']) {
                settings.headers['PC-ID'] = user['PC-ID'];
                settings.headers['PC-TOKEN'] = user['PC-TOKEN'];

            } else if (opts.auth !== 'maybe') {
                return callback(new PushcueError({
                    code: 'missing_auth',
                    message: 'You must be logged in for this action.'
                }));
            }
        }

        if (opts.file) { // <File> or <Blob> object
            settings.headers['X-File-Name'] = opts.file.name;
            settings.data = opts.file;
        }

        $xhr.ajax(settings);
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

    // Authenticate a user to the service.
    // Requires opts.username && opts.password && callback
    pc.auth = function(opts, callback) {
        if (!opts || !opts.username || !opts.password || !callback)
            return callback(new PushcueError({
                code: 'missing_param',
                message: 'Missing username, password, or callback.',
                data: {
                    username: opts && opts.username,
                    password: opts && opts.password,
                    callback: callback ? true : undefined
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
                callback(err);
            }
        );
    };

    // Logout current user (invalidate current api token)
    pc.deAuth = function(callback) {
        if (!callback)
            throw new PushcueError({
                code: 'missing_param',
                message: 'Missing callback.',
                data: {
                    callback: undefined
                }
            });

        _request({ path: '/logout', method: 'post', auth: true }, function(err) {
            if (!err) user = {};
            callback(err);
        });
    };

    pc.requestInvitation = function(email, callback) {
        if (!callback)
            throw new PushcueError({
               code: 'missing_param',
               message: 'Missing callback.',
               data: {
                   callback: undefined
               }
           });

        if (!email)
            return callback(new PushcueError({
                code: 'missing_param',
                message: 'Missing a required parameter.',
                data: {
                    email: email
                }
            }));

        _request({ path: '/requests', method: 'post' }, callback());
    };

    pc.users = {
        // Create new user
        // Requires opts.username && opts.password && opts.email && opts.invite && callback
        create: function(opts, callback) {
            if (!opts || !callback)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing opts or callback.',
                    data: {
                        opts: opts,
                        callback: callback ? true : undefined
                    }
                });

            if (!opts.username || !opts.password || !opts.email || !opts.invite)
                return callback(new PushcueError({
                    code: 'missing_param',
                    message: 'Missing a required parameter.',
                    data: {
                        username: opts.username,
                        password: opts.password,
                        email: opts.email,
                        invite: opts.invite
                    }
                }));

            _request({ path: '/users', method: 'POST', data: opts }, callback);
        },
        update: function(opts, callback) {
            //TODO
        },
        // Get current user
        'get': function(callback) {
            if (!callback)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing callback.',
                    data: {
                        callback: undefined
                    }
                });

            _request({
                path: '/users/' + user.username,
                method: 'GET',
                auth: true
            }, callback);
        },
        // Delete current user
        del: function(callback) {
            if (!callback)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing callback.',
                    data: {
                        callback: undefined
                    }
                });

            _request({
                path: '/users/' + user.username,
                method: 'DELETE',
                auth: true
            }, callback);
        }
    };

    pc.uploads = {
        // Get current user's uploads
        all: function(page, callback) {
            page = page || 1;
            if (typeof page === 'function') {
                callback = page;
                page = 1;
            }

            if (!callback)
                throw new PushcueError({
                    code: 'missing_param',
                    message: 'Missing page/callback.',
                    data: {
                        page: page,
                        callback: callback ? true : undefined
                    }
                });

            _request({
                path: '/uploads',
                method: 'GET',
                auth: true
            }, callback);
        },

        create: function(file, callback) {
            if (!callback || !file)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing file or callback.',
                   data: {
                       file: !!file,
                       callback: callback ? true : undefined
                   }
               });

            // file needs to be instanceof File

            _request({
                path: '/uploads',
                method: 'POST',
                auth: true,
                file: file
            }, callback);
        },

        'get': function(opts, callback) {
            if (!callback || !opts.id)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing id or callback.',
                   data: {
                       id: opts.id,
                       callback: callback ? true : undefined
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

            _request(settings, callback);
        },

        download: function(opts, callback) { // on success, return should be raw file
            if (!callback || !opts.id)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing id, filename, or callback.',
                   data: {
                       id: opts.id,
                       filename: opts.filename,
                       callback: callback ? true : undefined
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

            _request(settings, callback);
        },

        update: function(opts, callback) {
            if (!callback || !opts.id)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing id or callback.',
                   data: {
                       id: opts.id,
                       callback: callback ? true : undefined
                   }
               });

            if (!opts.password) {
                return callback(new PushcueError({
                    code: 'missing_param',
                    message: 'New password is required.',
                    data: {password: opts.password}
                }));
            }

            _request({
                path: '/uploads/' + opts.id,
                method: 'PUT',
                auth: true,
                data: { password: opts.password }
            }, callback);
        },
        del: function(id, callback) {

            if (!id || !callback)
                throw new PushcueError({
                   code: 'missing_param',
                   message: 'Missing id or callback.',
                   data: {
                       id: id,
                       callback: callback ? true : undefined
                   }
               });

            _request({
                path: '/uploads/' + id,
                method: 'DELETE',
                auth: true
            }, callback);
        }
    };

    main.pushcue = pc;

} else {main.pushcue={};}})(window);
