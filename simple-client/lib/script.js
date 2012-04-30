/*global $xhr:false, pushcue: false, EJS: false, History: false, Stripe: false */
/**
 * Simple pushcue api javascript client.
 *
 * Uses jQuery, History.js, EJS, and pushcue.js
 */
$(document).ready(function(){
    'use strict';
    if (!window.EJS || !window.pushcue || !pushcue.supported) {
        // TODO: display better error
        return false;
    }

    var console = window.console || (function(){
        var nop = function() {};
        return { error: nop, log: nop, trace: nop, warn: nop, debug: nop };
    }());

    var views,
        view,
        util,
        init,

        user,

        state_split = '&',

        current_view,

        api_url = pushcue.url(),

        $main = $('#content'),
        $nav = $('#nav'),
        $page = $('.simple');

    init = function() {
        Stripe.setPublishableKey('pk_T5fCdEmbKfnojUJK5TnplmET3As5D');

        // super-simple nav
        $page.on('click.pushcue','#nav a', function() {
            view($(this).attr('class').substring(3));
        });

        $page.on('click.pushcue','a.signout', function() {
            view('logout');
        });
        $page.on('click.pushcue','a.settings', function() {
            view('settings');
        });
        $page.on('click.pushcue','a.upgrade', function() {
            view('upgrade');
        });
        $page.on('click.pushcue','#sitelogo', function() {
            view('list');
        });

        // pagination on list view
        $page.on('click.pushcue','a.page', function() {
            var page = $(this).attr('id').substring(1);
            view('list', page);
        });

        window.addEventListener("hashchange", function() {
            var new_view = History.getHash().split(state_split)[0];

            if (new_view !== current_view) {
                var state = util.state.parseHash();

                if (state.valid) {
                    view(state.view, state.data);
                }
            }
        }, false);

    };

    util = {
        clear: function(file) { // clear events
            $main.off('.pushcue');

            if (!file) {
                $main.html('<p>Loading...</p>');
            } else {
                $main.html('<p>Uploading - ' +
                    '<progress id="file-progress" max="100" value="0"></progress>' +
                    '<span id="progress-percentage">0%</span></p>');
            }
        },
        render: function(name, data) {
            data = data || {};
            data.user = user;
            data.api_url = api_url;
            new EJS({element: name}).update('content', data);
        },

        progress: function(x) {
            $main.find('#file-progress').attr('value',x);
            $main.find('#progress-percentage').text(x.toString() + '%');
        },

        setTitle: function(title) {
            try {
                document.getElementsByTagName('title')[0].innerHTML =
                    title.replace('<','&lt;').replace('>','&gt;').replace(' & ',' &amp; ');
            }
            catch ( Exception ) { }
            document.title = title;
        },

        nav: {
            set: function(name, displayName)  {
                $nav.html('<a class="go-'+name + '">' + displayName + '</a> ');
            },
            add: function(name, displayName)  {
                $nav.append(': <a class="go-'+name + '">' + displayName + '</a> ');
            },
            clear: function() {
                $nav.html('');
            }
        },

        loadUser: function(callback) {
            pushcue.users.get(function(err, result) {
                if (!err) {
                    // keeping this info for use later
                    // (paid features access, showing username, etc)
                    user = result;
                } else {
                    console.log(err);
                }
                if (callback) {
                    callback();
                }
            });
        },

        auth: {
            save: function() {
                sessionStorage.pushcue = JSON.stringify(pushcue.getUserAuth());
            },
            load: function() {
                var auth = sessionStorage.pushcue;
                if (auth) {
                    pushcue.setUserAuth(JSON.parse(auth));
                }
                return !!auth;
            },
            remove: function() {
                delete sessionStorage.pushcue;
            }
        },

        state: {
            get: function() {
                return History.getState();
            },

            load_initial: function() {

                var view, state, valid,
                    hash = History.getHash();

                if (hash.length > 0) { // try state object first

                    var current_state = util.state.get();
                    if (current_state.data && current_state.data.view) {
                        view = current_state.data.view;
                        state = current_state.data.data;
                        if (views[view]) valid = true;

                    } else {
                        return util.state.parseHash();
                    }
                }
                return { data: state, view: view, valid: valid };
            },

            parseHash: function() { // try to parse hash
                var view, state, valid,
                    hash = History.getHash();

                if (hash.length > 0) {

                    var key, hashObj = hash.split(state_split);

                    view = hashObj[0];

                    for (var i=1; i < hashObj.length; i++) {
                        if (!state) state = {};
                        key = hashObj[i].split('=')[0];
                        state[key] = hashObj[i].split('=')[1];
                    }

                }
                if (views[view]) valid = true;
                return { data: state, view: view, valid: valid };
            },

            set: function(data, title, append_data) {
                var url = util.state.get().url.split('#')[0] + '#' + data.view;
                current_view = data.view;

                if (append_data) {
                    for (var key in data.data) {
                        if (data.data.hasOwnProperty(key)) {
                            url += state_split + key + '=' + data.data[key];
                        }
                    }
                }
                History.pushState(data, title, url);
                util.setTitle(title); // doesn't trigger on hash change normally
            },

            update: function(data, title) {
                var state = util.state.get();

                if (data) state.data = data;
                if (title) state.title = title;

                state.url = state.url.split('#')[0] + '#' + History.getHash();

                History.replaceState(state.data, state.title, state.url);
                util.setTitle(title); // doesn't trigger on hash change normally
            }
        }
    };

    views = {
        login: { // also handles registration
            title: "Pushcue > login",
            fn: function(err) {
                util.nav.clear();
                util.render('login_tmpl', err);

                $main.on('submit.pushcue', "form.login", function() {
                    var $form = $(this),
                        data = {
                            username: $form.find('[type="text"]').val(),
                            password: $form.find('[type="password"]').val()
                        };
                    pushcue.auth(data, function(err) {
                        if (!err) {
                            util.auth.save();
                            view('list');
                            util.loadUser();
                        } else {
                            err.form = 'login';
                            view('login',err);
                        }
                    });
                    return false;
                });
                $main.on('submit.pushcue', "form.register", function() {
                    var $form = $(this),
                        data = {
                            username: $form.find('.r_user').val(),
                            password: $form.find('.r_pass').val(),
                            email: $form.find('.r_email').val(),
                            invite: $form.find('.r_key').val()
                        };
                    pushcue.users.create(data, function(err) {
                        if (err)
                            err.form = 'register';
                        err = err || {success: true};
                        view('login', err);
                    });
                    return false;
                });
                $main.on('click.pushcue', "a.go-key", function() {
                    view('request_invitation');
                });
            }
        },

        upgrade: {
            title: "Pushcue > upgrade",
            fn: function(err) {
                util.nav.set('list', 'Home');
                util.render('upgrade_tmpl', err);
                $main.on('submit.pushcue', "form", function() {
                    $main.find('.submit-button').attr("disabled", "disabled");

                    Stripe.createToken({
                        number: $main.find('.card-number').val(),
                        cvc: $main.find('.card-cvc').val(),
                        exp_month: $main.find('.card-expiry-month').val(),
                        exp_year: $main.find('.card-expiry-year').val()
                    }, function(status, response) {
                        if (response.error) {
                            view('upgrade', {err: response.error.message});
                        } else {
                            // token contains id, last4, and card type
                            var token = response.id;
                            pushcue.users.subscribe(token, function(err) {
                                if (err) {
                                    view('upgrade', {err: err});
                                } else {
                                    view('upgrade', {success: true});
                                    user.paid = true;
                                }
                            });
                        }
                    });

                    return false;
                });
            }
        },

        settings: {
            title: "Pushcue > settings",
            fn: function(err) {
                util.nav.set('list', 'Home');
                util.render('settings_tmpl', err);

                $main.on('submit.pushcue', "form", function() {
                    var $form = $(this),
                        pass = $form.find('.pass').val(),
                        pass_check = $form.find('.pass2').val();

                    if (pass !== pass_check) {
                        view('settings', {err: "Both passwords must match."});

                    } else {
                        pushcue.users.update({ password: pass }, function(err) {
                            if (!err) {
                                view('settings', { success: "Password changed." });
                            } else {
                                view('settings', {err: err.message });
                            }
                        });
                    }
                    return false;
                });
            }
        },

        request_invitation: {
            title: "Pushcue > request an invitation",
            fn: function(result) {
                util.nav.set('login', 'Login or Register');
                util.render('request_tmpl', result);

                if (!result || !result.success) {
                    $main.on('submit.pushcue', "form", function() {
                        var $form = $(this),
                            email = $form.find('[type="text"]').val();
                        pushcue.requestInvitation(email, function(err) {
                            err = err || { success: true };
                            view('request_invitation', err);
                        });
                        return false;
                    });
                }
            }
        },

        logout: {
            skipState: true,
            requireAuth: true,
            fn: function() {
                pushcue.deAuth(function() {
                    util.auth.remove();
                    view('login');
                });
            }
        },

        bins: {
            title: "Pushcue > my bins",
            requireAuth: true,
            fn: function() {
                util.nav.set('list', 'Home');

                pushcue.bins.all(function(err, bins) {
                    if (err) {
                        pushcue.clearAuth();
                        return view('login');
                    }

                    util.render('bins_tmpl', bins);
                    $main.on('click.pushcue', ".new-bin", function() {
                        view('create_bin');
                    });
                });
            }
        },

        get_bin: {
            title: "Pushcue > loading bin...",
            requireAuth: 'maybe',
            fn: function(data) {
                util.nav.set('login', 'Login');

                pushcue.bins.get(data.id, function(err, result) {
                    if (err) {
                        return view('login');
                    }

                    util.render('bin_tmpl', result);
                    $main.on('submit.pushcue', "form", function() {

                        var $form = $(this),
                            file = $form.find('.file-field')[0].files[0];

                        util.clear(true);

                        pushcue.bins.upload({
                                file: file,
                                progress: util.progress
                            },
                            function(err) {
                                if (err) console.trace(err);
                                view('get_bin', data);
                            }
                        );
                        return false;
                    });
                });
            }
        },

        create_bin: {
            title: "Pushcue > create a new bin",
            requireAuth: true,
            fn: function(err) {
                util.nav.set('list', 'Home');
                util.nav.add('bins', 'Bins');
                util.render('bin_create_tmpl', err);

                $main.on('submit.pushcue', "form", function() {
                    var $form = $(this),
                        name = $form.find('[type="text"]').val();
                    pushcue.bins.create({name: name}, function(err) {
                        if (err) {
                            view('create_bin', err);
                        } else {
                            view('bins');
                        }
                    });
                    return false;
                });
            }
        },

        list: {
            title: "Pushcue > my files",
            requireAuth: true,
            fn: function(page) {
                util.nav.set('bins', 'Bins');

                pushcue.uploads.all(page, function(err, res) {
                    if (!err) {
                        util.render('files_tmpl', res);
                        $main.on('click.pushcue', ".files p a.item", function() {
                            var id = $(this).attr('id').substring(5);
                            view('display_upload', {id: id});
                        });
                        $main.on('submit.pushcue', "form", function() {

                            var $form = $(this),
                                file = $form.find('.file-field')[0].files[0];

                            if (file) {
                                util.clear(true);

                                pushcue.uploads.create({
                                        file: file,
                                        progress: util.progress
                                    },
                                    function(err) {
                                        if (err) console.trace(err);
                                        view('list');
                                    }
                                );
                            }
                            return false;
                        });
                    } else {
                        // their stored auth no longer valid; clear creds and show login
                        pushcue.clearAuth();
                        view('login');
                    }
                });
            }
        },

        display_upload: {
            title: "Pushcue > loading file...",
            append_data: true,
            fn: function(id) {
                util.nav.set('list', 'Home');

                pushcue.uploads.get(id, function(err, res) {
                    if (!err) {
                        util.state.update(false, "Pushcue > file > " + res.name);

                        util.render('detail_tmpl', res);
                        $main.on('click.pushcue', "div.details p a.delete", function() {
                            var id = $main.find('.detail').attr('id').substring(7);
                            view('delete_upload', id);
                        });
                    } else {
                        // todo: better errors, possible 404, 500, or notauthorized (ask for password)
                        console.error(err);
                    }
                });
            }
        },

        delete_upload: {
            skipState: true,
            requireAuth: true,
            fn: function(id) {
                pushcue.uploads.del(id, function(err) {
                    if (!err) {
                        view('list');
                    } else {
                        // todo: better errors, possible 404, 500, or notauthorized
                        console.error(err);
                    }
                });
            }
        }
    };

    view = function(name, data) {
        var authenticated = pushcue.isAuthenticated();
        util.clear();


        // Hide/show relevant elements based on login state (using css)
        $page.toggleClass('authenticated', authenticated);
        $page.toggleClass('free', user && !user.paid);

        if (views[name].requireAuth && !authenticated) {
            util.state.set({ view: 'login' }, views.login.title);
            views.login.fn(data);
            console.log('login rendered (lacked proper auth).');

        } else {
            if (!views[name].skipState) { // some views (logout, delete) just redirect
                util.state.set(
                    { view: name, data: data },
                    views[name].title || "Pushcue",
                    !!views[name].append_data
                );
            }
            views[name].fn(data);
            console.log(name + ' rendered.');
        }
    };

    init();
    var authorized = util.auth.load();

    var _initial_continue = function() {
        var initialState = util.state.load_initial();

        if (initialState.valid) {
            view(initialState.view, initialState.data);

        } else {
            view('list');
        }
    };

    if (authorized) {
        util.loadUser(_initial_continue);
    } else {
        _initial_continue();
    }



});
