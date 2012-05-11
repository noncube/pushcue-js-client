/*global $xhr:false, pushcue: false, EJS: false, hist: false, Stripe: false */
/**
 * Simple pushcue api javascript client.
 *
 * Uses jQuery, EJS, and pushcue.js
 */
$(document).ready(function(){
    'use strict';
    if (!window.EJS || !window.pushcue || !pushcue.supported) {

        new EJS({element: 'not_supported_tmpl'}).update('content', {});
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

        api_url = pushcue.url(),

        $main = $('#content'),
        $nav = $('#nav'),
        $page = $('.simple');

    init = function() {
        Stripe.setPublishableKey('pk_lsddf2qnxg53Ov3ougpaUL6E8aEMG');

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
        $page.on('click.pushcue','.pro', function() {
            view('pro');
        });
        $page.on('click.pushcue','.tag-link', function() {
            $(this).select(); // select entire link on first click
        });

        // pagination on list view
        $page.on('click.pushcue','a.page', function() {
            var page = $(this).attr('id').substring(1);
            view('list', { page: page });
        });

        hist.hashChange = function(state) {
            if (views[state.view]) view(state.view, state.data);
        };
    };

    util = {
        clear: function(file) { // clear events
            $main.off('.pushcue');

            if (!file) {
                $main.html('<p class="loading">Loading...</p>');
            } else {
                $main.html('<p class="loading">Uploading - ' +
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
                $nav.show();
            },
            add: function(name, displayName)  {
                $nav.append(': <a class="go-'+name + '">' + displayName + '</a> ');
            },
            clear: function() {
                $nav.html('');
                $nav.hide();
            }
        },

        loadUser: function(callback) {
            pushcue.users.get(function(err, result) {
                if (!err) {
                    // keeping this info for use later
                    // (paid features access, showing username, etc)
                    user = result;
                } else {
                    util.auth.remove();
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

        getCurrentUrl: function(name, data) {
            return hist.currentURL(name) + hist.encodeHashData(data);
        }
    };

    views = {
        login: { // also handles registration
            title: "Pushcue > login",
            fn: function(err) {
                util.nav.clear();
                util.render('login_tmpl', err);

                $main.on('submit.pushcue', "form.login", function() {
                    $main.find('.submit-button').attr("disabled", "disabled");
                    var $form = $(this),
                        data = {
                            username: $form.find('[type="text"]').val(),
                            password: $form.find('[type="password"]').val()
                        };
                    // kill invalid login attempts without hitting api
                    if (data.password.length === 0 || data.username.length === 0)
                        return view('login',{ username: data.username });

                    pushcue.auth(data, function(err) {
                        if (!err) {
                            util.auth.save();
                            util.loadUser(function(){
                                view('list');
                            });
                        } else {
                            err.form = 'login';
                            err.username = data.username;
                            view('login',err);
                        }
                    });
                    return false;
                });
                $main.on('submit.pushcue', "form.register", function() {
                    $main.find('.submit-button').attr("disabled", "disabled");
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
                        console.log(err);
                        console.log(err.data);
                        view('login', err);
                    });
                    return false;
                });
                $main.on('click.pushcue', "a.go-key", function() {
                    view('request_invitation');
                });
                $main.on('click.pushcue', "a.forgot", function() {
                    view('forgot_password');
                });
            }
        },
        forgot: {
            title: "Pushcue > reset password",
            onlyID: true,
            fn: function(obj) {
                if (!obj || (!obj.id && !obj.success))
                    return view('login');

                util.render('forgot_tmpl', obj);
                if (!obj.success) {
                    $main.on('submit.pushcue', "form", function() {
                        var $form = $(this),
                            again = $form.find('.again').val(),
                            data = {
                                key: obj.id,
                                username: $form.find('.username').val(),
                                password: $form.find('.password').val()
                            };

                        if (!again || !data.username || !data.password) {
                            obj.message = 'All fields are required.';
                            view('forgot', obj);

                        } else if (again !== data.password) {
                            obj.message = 'Both passwords must match.';
                            view('forgot', obj);

                        } else {
                            $main.find('.submit-button').attr("disabled", "disabled");
                            pushcue.users.resetPassword(data, function(err) {
                                err = err || { success: true };
                                err.id = obj.id;
                                view('forgot', err);
                            });
                        }
                        return false;
                    });
                }
            }
        },
        forgot_password: {
            title: "Pushcue > reset password",
            fn: function(err) {
                util.render('forgot_form_tmpl', err);
                if (!err || !err.success) {
                    $main.on('submit.pushcue', "form", function() {
                        var $form = $(this),
                            data = {
                                email: $form.find('[type="text"]').val(),
                                link: hist.currentURL('forgot') + '/{{key}}'
                            };
                        pushcue.users.resetPasswordRequest(data, function(err) {
                            err = err || { success: true };
                            view('forgot_password', err);
                        });
                        return false;
                    });
                }
            }
        },

        upgrade: {
            title: "Pushcue > upgrade",
            requireAuth: true,
            fn: function(err) {
                util.nav.set('list', 'Home');
                util.render('upgrade_tmpl', err);
                $main.on('submit.pushcue', "form", function() {
                    var cc = {
                        number: $main.find('.card-number').val(),
                        cvc: $main.find('.card-cvc').val(),
                        exp_month: $main.find('.card-expiry-month').val(),
                        exp_year: $main.find('.card-expiry-year').val()
                    };
                    var promo = $main.find('.promo').val();

                    var subscribe = function(data) {
                        pushcue.users.subscribe(data, function(err) {
                            if (err) {
                                view('upgrade', {err: err});
                            } else {
                                user.paid = user.subscribed = true;
                                view('upgrade', {success: true});
                            }
                        });
                    };

                    if (cc.number && cc.cvc && cc.exp_month && cc.exp_year) {
                        $main.find('.submit-button').attr("disabled", "disabled");
                        Stripe.createToken(cc, function(status, response) {
                            if (response.error)
                                return view('upgrade', {err: response.error.message + '.'});

                            // token contains id, last4, and card type
                            util.clear();
                            subscribe({ token: response.id, promo: promo });
                        });

                    } else if (promo.length > 0) {
                        $main.find('.submit-button').attr("disabled", "disabled");
                        subscribe({ promo: promo });
                    }

                    return false;
                });
            }
        },
        change_payment: {
            title: "Pushcue > change payment details",
            requireAuth: true,
            fn: function(err) {
                util.render('change_cc_tmpl', err);
                if (!err || !err.success) {
                    $main.on('submit.pushcue', "form", function() {
                        var cc = {
                            number: $main.find('.card-number').val(),
                            cvc: $main.find('.card-cvc').val(),
                            exp_month: $main.find('.card-expiry-month').val(),
                            exp_year: $main.find('.card-expiry-year').val()
                        };
                        if (cc.number && cc.cvc && cc.exp_month && cc.exp_year) {
                            $main.find('.submit-button').attr("disabled", "disabled");
                            Stripe.createToken(cc, function(status, response) {
                                if (response.error)
                                    return view('change_payment', {err: response.error.message + '.'});

                                util.clear();

                                pushcue.users.update_payment({ token: response.id }, function(err) {
                                    if (err) {
                                        view('change_payment', {err: err});
                                    } else {
                                        view('change_payment', {success: true});
                                    }
                                });
                            });
                        }
                        return false;
                    });
                }
            }
        },
        pro: {
            title: "Pushcue > pro user",
            requireAuth: true,
            fn: function() {
                util.render('pro_tmpl');
                $main.on('click.pushcue', "a.unsubscribe", function() {
                    view('unsubscribe');
                });
                $main.on('click.pushcue', "a.change-cc", function() {
                    view('change_payment');
                });
            }
        },
        unsubscribe: {
            title: "Pushcue > unsubscribe",
            requireAuth: true,
            fn: function(result) {
                util.nav.set('list', 'Home');
                util.nav.add('pro', 'Pro');
                util.render('unsubscribe_tmpl', result);

                if (!result || !result.success) {
                    $main.on('click.pushcue', "a.unsub", function() {
                        util.clear();
                        pushcue.users.unsubscribe(function(err) {
                            err = err || { success: true };
                            user.subscribed = false;
                            view('unsubscribe', err);
                        });
                    });
                }
            }
        },

        settings: {
            title: "Pushcue > settings",
            requireAuth: true,
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
                    $main.on('click.pushcue', ".bins p a", function() {
                        var bin_id = $(this).attr('id').substring(5);
                        view('bin', { id: bin_id });
                    });
                });
            }
        },

        bin: {
            title: "Pushcue > loading bin...",
            onlyID: true,
            fn: function(data) {
                if (pushcue.isAuthenticated()) {
                    util.nav.set('list', 'Home');
                    util.nav.add('bins', 'Bins');
                } else {
                    util.nav.set('login', 'Login or Register');
                }

                pushcue.bins.get(data.id, function(err, result) {
                    if (err) {
                        if (err.status === 404) {
                            return view('not_found');
                        } else {
                            console.log(err);
                            return view('list');
                        }
                    }
                    result.link = util.getCurrentUrl('bin', data);

                    // results from upload
                    if (data.success) {
                        result.success = true;
                    }
                    if (data.err) {
                        result.err = data.err;
                    }
                    if (data.filename) {
                        result.filename = data.filename;
                    }

                    hist.update("Pushcue > bin > " + result.name);
                    util.render('bin_tmpl', result);

                    if (user && user._id === result.creator_id) {
                        if (result.send_emails) {
                            $main.on('click.pushcue', ".stop", function() {
                                util.clear();
                                pushcue.bins.update({ _id: result._id, send_emails: false }, function(err) {
                                    data.err = err;
                                    view('bin', data);
                                });
                            });
                        } else {
                            $main.on('click.pushcue', ".start", function() {
                                util.clear();
                                pushcue.bins.update({ _id: result._id, send_emails: true }, function(err) {
                                    data.err = err;
                                    view('bin', data);
                                });
                            });
                        }
                    }
                    $main.on('submit.pushcue', "form", function() {

                        var $form = $(this),
                            file = $form.find('.file-field')[0].files[0];

                        util.clear(true);

                        pushcue.bins.upload({
                                file: file,
                                bin: data.id,
                                progress: util.progress
                            },
                            function(err) {
                                if (err) console.trace(err);
                                data.filename = file.name;

                                if (err) {
                                    data.err = err;
                                } else {
                                    data.success = true;
                                }
                                view('bin', data);
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
            fn: function(obj) {
                obj = obj || {};
                util.nav.set('bins', 'Bins');

                pushcue.uploads.all(obj.page, function(err, res) {
                    if (!err) {
                        // results from upload
                        if (obj.success) {
                            res.success = true;
                        }
                        if (obj.err) {
                            res.err = obj.err;
                        }
                        if (obj.filename) {
                            res.filename = obj.filename;
                        }
                        util.render('files_tmpl', res);
                        $main.on('click.pushcue', ".files p a.item", function() {
                            var id = $(this).attr('id').substring(5);
                            view('uploads', {id: id});
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
                                        var data = {
                                            page: obj.page,
                                            filename: file.name
                                        };
                                        if (err) {
                                            data.err = err;
                                        } else {
                                            data.success = true;
                                        }

                                        view('list', data);
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
        not_found: {
            title: "Pushcue > not found",
            fn: function() {
                util.render('not_found_tmpl');
            }
        },

        uploads: {
            title: "Pushcue > loading file...",
            onlyID: true,
            fn: function(obj) {
                if (pushcue.isAuthenticated()) {
                    util.nav.set('list', 'Home');
                    util.nav.add('bins', 'Bins');
                } else {
                    util.nav.set('login', 'Login or Register');
                }

                pushcue.uploads.get(obj, function(err, res) {
                    if (!err) {
                        hist.update("Pushcue > file > " + res.name);
                        res.link = util.getCurrentUrl('uploads', obj);
                        util.render('detail_tmpl', res);

                        $main.on('click.pushcue', "div.details p a.delete", function() {
                            view('delete_upload', obj.id);
                        });

                        $main.on('click.pushcue', "div.details p a.password", function() {
                            view('password_upload', { id: obj.id, filename: res.name });
                        });

                        if (obj.password) {
                            // on download, if password is required, must use a post.
                            $main.on('click.pushcue', "div.details p a.download", function() {
                                var $form = $('<form method="post" class="hidden"></form>');
                                $form.attr('action', api_url + '/uploads/'+ obj.id + '/download');
                                $form.append($('<input name="password" value="'+obj.password+'">'));

                                $main.append($form);
                                setTimeout(function(){$form.submit();}, 10);

                                return false;
                            });
                        }

                    } else {
                        if (err.status === 404) {
                            view('not_found');

                        // passworded file, not owner
                        } else if (err.status === 403) {
                            util.render('submit_password_tmpl', { id: obj.id, err: !!obj.password });

                            $main.on('submit.pushcue', "form", function() {
                                var password = $(this).find('.password').val();
                                view('uploads', { id: obj.id, password: password });
                                return false;
                            });

                        } else {
                            console.log(err);
                        }
                        // todo: better errors, possible 500 or notauthorized (ask for password)
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
                        view('list');
                        // todo: better errors, possible 404, 500, or notauthorized
                        console.error(err);
                    }
                });
            }
        },

        password_upload: {
            requireAuth: true,
            append_data: true,
            fn: function(obj) {
                if (!obj || !obj.id) {
                    return view('list');
                }
                util.nav.set('list', 'Home');
                util.render('password_file_tmpl', obj);

                $main.on('click.pushcue', '.return', function() {
                    view('uploads', { id: obj.id });
                });

                $main.on('submit.pushcue', "form", function() {
                    var $form = $(this),
                        password = $form.find('.password').val(),
                        check = $form.find('.check').val();

                    if (check !== password) {
                        obj.err = "Both passwords must match";
                        view('password_upload', obj);
                    } else {
                        pushcue.uploads.update({id: obj.id, password: password}, function(err) {
                            if (err) {
                                obj.err = err.message || err;
                                view('password_upload', obj);
                            } else {
                                delete obj.err;
                                obj.success = true;
                                view('password_upload', obj);
                            }
                        });
                    }
                    return false;
                });
            }
        }
    };

    view = function(name, data) {
        var authenticated = pushcue.isAuthenticated();
        util.clear();

        // Hide/show relevant elements based on login state (using css)
        $page.toggleClass('authenticated', authenticated);
        $page.toggleClass('free', !!(user && !user.subscribed));

        if (views[name].requireAuth && !authenticated) {
            hist.set({ view: 'login' }, views.login.title);
            views.login.fn(data);
            console.log('login rendered (lacked proper auth).');

        } else {
            if (!views[name].skipState) { // some views (logout, delete) just redirect
                if (views[name].onlyID && data.id) {
                    hist.set(
                        { view: name, data: { id: data.id } },
                        views[name].title || "Pushcue",
                        true
                    );
                } else {
                    hist.set(
                        { view: name, data: data },
                        views[name].title || "Pushcue",
                        !!views[name].append_data
                    );
                }
            }
            views[name].fn(data);
            console.log(name + ' rendered.');
        }
    };

    init();
    var authorized = util.auth.load();

    var _initial_continue = function() {
        var initialState = hist.get();

        if (initialState && views[initialState.view]) {
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
