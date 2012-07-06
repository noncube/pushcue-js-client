(function(window){
    var state_split = '&';

    var history = window.history,
        states = [],
        current_view;

    var util = {
        getLastState: function() {
            return JSON.parse(JSON.stringify(states[states.length-1]));
        },
        setTitle: function(title) {
            try {
                document.getElementsByTagName('title')[0].innerHTML =
                    title.replace('<','&lt;').replace('>','&gt;').replace(' & ',' &amp; ');
            }
            catch ( Exception ) { }
            document.title = title;
        }
    };

    var hist = window.hist = {
        currentURL: function(view) {
            return window.location.href.split('#!/')[0] + (view ? '#!/' + view : '');
        },

        get: function() {
            var tmp = document.location.hash, hash;
            if (tmp){
                while (true) {
                    hash = window.decodeURI(tmp);
                    if ( hash === tmp ) break;
                    tmp = hash;
                }
                return hist.parseHash(hash.substring(3)); //remove '#!/'
            } else {
                return false;
            }
        },
        set: function(data, title, append_data) {
            var url = hist.currentURL(data.view);

            if (append_data)
                url += hist.encodeHashData(data.data);

            current_view = data.view;
            history.pushState({},title,url);
            states.push({data: data, title: title, url: url});


            util.setTitle(title);
        },

        update: function(title) {
            var state = util.getLastState();

            history.replaceState({},title,state.url);
            util.setTitle(title);
        },


        encodeHashData: function(data) {
            var result = '', first = true;
            if (data && data.id) result += '/' + data.id;
            for (var key in data) {
                if (data.hasOwnProperty(key) && key !== 'id' && data[key] !== undefined) {
                    if (first) {
                        result += '?';
                        first = false;
                    }
                    result += state_split + key + '=' + data[key];
                }
            }
            return result;
        },

        parseHash: function(hash) {
            var view, state;

            if (hash.length > 0) {

                var key, hashObj, tmp;

                hashObj = hash.split('?');

                tmp = hashObj[0].split('/');

                if (tmp.length > 1) {
                    view = tmp[0];
                    state = { id: tmp[1] };
                } else {
                    view = hashObj[0];
                }

                if (hashObj[1]) {
                    hashObj = hashObj[1].split(state_split);

                    for (var i=0; i < hashObj.length; i++) {
                        if (!state) state = {};
                        key = hashObj[i].split('=')[0];
                        state[key] = hashObj[i].split('=')[1];
                    }
                }
            }
            return { data: state, view: view };
        }
    };

    window.addEventListener("hashchange", function() {
        var state = hist.get();
        if (state.view !== current_view && hist.hashChange)
            hist.hashChange(state);
    }, false);


})(window);
