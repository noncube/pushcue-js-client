$(document).ready(function(){
    if (!window.EJS || !window.pushcue || !pushcue.supported) {
        alert('not supported');
        // TODO: display better error
        return false;
    }

    var views,
        util,
        $main = $('#content');

    util = {
        clear: function() { // clear events
            $main.off('.pushcue');

            $main.html('<p>Loading...</p>');
        },
        render: function(name, data) {
            data = data || {};
            new EJS({element: name}).update('content', data);
        }
    };

    views = {
        login: function(err) {
            util.clear();
            util.render('login_tmpl', err);

            $main.on('submit.pushcue', "form", function() {
                var $form = $(this),
                    data = {
                        username: $form.find('[type="text"]').val(),
                        password: $form.find('[type="password"]').val()
                    };
                pushcue.auth(data, function(err) {
                    if (!err) {
                        views.list();
                    } else {
                        views.login(err);
                    }
                });

                return false;
            });
        },

        list: function(page) {
            util.clear();
            pushcue.uploads.all(page, function(err, res) {
                if (!err) {
                    util.render('files_tmpl', res);
                    $main.on('click.pushcue', ".files p a", function() {
                        var id = $(this).attr('id').substring(5);
                        views.display_upload({id: id});
                    });
                }
            });
        },

        display_upload: function(id) {
            util.clear();
            pushcue.uploads.get(id, function(err, res) {
                if (!err) {
                    util.render('detail_tmpl', res);
                    console.log(res);
                } else {
                    // todo: better errors, possible 404, 500, or notauthorized (ask for password)
                    console.log(err);
                }
            });
        }
    };

    // TODO: look into possibly using sessionStorage to save tokens
    views.login();

});
