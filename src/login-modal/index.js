var key = require('keymaster');

var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-authentication'));

// TODO: move this to a config lib
var db_name = location.pathname.split('/')[1];
var db_url = location.protocol + '//' + location.hostname
    + (location.port ? ':' + location.port : '') + '/' + db_name + '/';
var db = new PouchDB(db_url);


module.exports = {
  replace: true,
  template: require('./template.html'),
  data: function() {
    return {
      // TODO: change user to username to avoid confusion with user object
      user: "",
      pass: ""
    };
  },
  created: function() {
    document.body.classList.add('dimmed', 'dimmable', 'scrolling');
  },
  ready: function() {
    var self = this;
    key('esc', function() {
      self.destroy();
    });
    self.$el.querySelector('[name=username]').focus();
  },
  methods: {
    login: function() {
      var self = this;
      // do the login
      db.login(self.user, self.pass).then(function(resp) {
        if (!resp.ok) {
          if (resp.name === 'unauthorized') {
            console.log('resp', resp);
            // name or password incorrect
            alert('blast...wrong login');
          } else {
            console.log('resp', resp);
            // cosmic rays, a meteor, etc.
            alert('...something terrible just happened...maybe...');
          }
        } else {
          // logged in
          db.getSession(function (err, resp) {
              if (err) {
                // network error
              } else if (resp.userCtx.name) {
                // response.userCtx.name is the current user
                self.$dispatch('loggedin', resp.userCtx);
                self.destroy();
              }
          });
        }
      });
    },
    destroy: function() {
      // TODO: danger: this could remove a sites version of these :( namespace?
      document.body.classList.remove('dimmed', 'dimmable', 'scrolling');
      this.$destroy(true);
    }
  }
};
