$(document).ready(function(){
    if (window.pushcue && pushcue.supported) {
        var pc_simple = {

            events: {
                'login_tmpl': function() {

                }
            },

            render: function(name, data) {
                data = data || {};
                new EJS({element: name}).update('content', data);
                if (this.events[name]) {
                    this.events[name]();
                }
            },

            clear: function() { // clear events
                var $main = $('#content');
                $main.find("*").off('.pushcue');

                $main.html('<p>Loading...</p>');
            }
        };

        pc_simple.render('login_tmpl');

    } else {
        // display error
    }
});
