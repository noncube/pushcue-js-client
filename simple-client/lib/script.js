$(document).ready(function(){
    if (!window.EJS || !window.pushcue || !pushcue.supported) {
        alert('not supported');
        // TODO: display better error
        return false;
    }

    var views,
        view,
        util,
        api_url = pushcue.url(),
        $main = $('#content');

    util = {
        clear: function() { // clear events
            $main.off('.pushcue');

            $main.html('<p>Loading...</p>');
        },
        render: function(name, data) {
            data = data || {};
            data.api_url = api_url;
            new EJS({element: name}).update('content', data);
        }
    };

    views = {
        login: function(err) {
            util.render('login_tmpl', err);

            $main.on('submit.pushcue', "form", function() {
                var $form = $(this),
                    data = {
                        username: $form.find('[type="text"]').val(),
                        password: $form.find('[type="password"]').val()
                    };
                pushcue.auth(data, function(err) {
                    if (!err) {
                        view('list');
                    } else {
                        view('login',err);
                    }
                });
            });
        },

        request_invitation: function(result) {
            util.render('request_tmpl', result);

            if (!result || !result.success) {
                $main.on('submit.pushcue', "form", function() {
                    var $form = $(this),
                        email = $form.find('[type="text"]').val();
                    pushcue.requestInvitation(email, function(err) {
                        err = err || { success: true };
                        view('request_invitation', err);
                    });
                });
            }
        },

        logout: function() {
            pushcue.deAuth(function() {
                view('login');
            });
        },

        register: function(err){
            util.render('register_tmpl', err);

            $main.on('submit.pushcue', "form", function() {
                var $form = $(this),
                    data = {
                        username: $form.find('.r_user').val(),
                        password: $form.find('.r_pass').val(),
                        email: $form.find('.r_email').val(),
                        invite: $form.find('.r_key').val()
                    };
                pushcue.users.create(data, function(err) {
                    if (!err) {
                        view('login');
                    } else {
                        console.error(err);
                        view('register', err);
                    }
                });
            });
        },

        list: function(page) {
            pushcue.uploads.all(page, function(err, res) {
                if (!err) {
                    util.render('files_tmpl', res);
                    $main.on('click.pushcue', ".files p a", function() {
                        var id = $(this).attr('id').substring(5);
                        view('display_upload', {id: id});
                    });
                }
            });
        },

        display_upload: function(id) {
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
        },

        delete_upload: function(id) {
            pushcue.uploads.del(id, function(err) {
                if (!err) {
                    view('list');
                } else {
                    // todo: better errors, possible 404, 500, or notauthorized
                    console.error(err);
                }
            });
        }
    };

    view = function(name, data) {
        util.clear();
//        TODO: will deal with this later -- window.history.state object in gecko, popstate window event in webkit
//        history.pushState(data, 'Pushcue',
//            window.location.protocol + '//' + document.domain + '#' + name
//        );
        views[name](data);
    };



    // TODO: look into possibly using sessionStorage to save tokens
    view('login');

});
