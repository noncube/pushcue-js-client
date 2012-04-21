$(document).ready(function(){
    if (!window.EJS || !window.pushcue || !pushcue.supported) {
        alert('not supported');
        // TODO: display better error
        return false;
    }

    var console = window.console || (function(){
        var nop = function() {};
        return { error: nop, log: nop, trace: nop, warn: nop, debug: nop };
    })();

    var views,
        view,
        util,
        init,

        api_url = pushcue.url(),

        $main = $('#content'),
        $nav = $('#nav'),
        $page = $('.simple');

    init = function() {
        // super-simple nav
        $page.on('click.pushcue','#nav a', function() {
            view($(this).attr('class').substring(3));
        });

        $page.on('click.pushcue','a.signout', function() {
            view('logout');
        });
        $page.on('click.pushcue','#sitelogo', function() {
            view('list');
        });
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
            data.api_url = api_url;
            new EJS({element: name}).update('content', data);
        },

        progress: function(x) {
            $main.find('#file-progress').attr('value',x);
            $main.find('#progress-percentage').text(x.toString() + '%');
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
        }
    };

    views = {
        login: { // also handles registration
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

        request_invitation: {
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
            requireAuth: true,
            fn: function() {
                pushcue.deAuth(function() {
                    util.auth.remove();
                    view('login');
                });
            }
        },

        list: {
            requireAuth: true,
            fn: function(page) {
                util.nav.clear();

                pushcue.uploads.all(page, function(err, res) {
                    if (!err) {
                        util.render('files_tmpl', res);
                        $main.on('click.pushcue', ".files p a", function() {
                            var id = $(this).attr('id').substring(5);
                            view('display_upload', {id: id});
                        });
                        $main.on('submit.pushcue', "form", function() {

                            var $form = $(this),
                                file = $form.find('.file-field')[0].files[0];

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
            fn: function(id) {
                util.nav.set('list', 'Home');

                pushcue.uploads.get(id, function(err, res) {
                    if (!err) {
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

//        TODO: will deal with this later -- window.history.state object in gecko, popstate window event in webkit
//        history.pushState(data, 'Pushcue',
//            window.location.protocol + '//' + document.domain + '#' + name
//        );

        if (views[name].requireAuth && !authenticated) {
            views.login.fn(data);
        } else {
            views[name].fn(data);
        }
        console.log(name + ' rendered.');
    };

    init();

    if (util.auth.load()) {
        view('list');
    } else {
        view('login');
    }

});
