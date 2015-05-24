var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-authentication'));
var db_name = location.pathname.split('/')[1];
var db_url = location.protocol + '//' + location.hostname
    + (location.port ? ':' + location.port : '') + '/' + db_name + '/';
var db = new PouchDB(db_url);

module.exports = {
  data: function() {
    return {
      ui: {
        pushed_down_by: 0
      },
      user: {}
    };
  },
  watch: {
    'ui.pushed_down_by': function(v) {
      document.body.style.top = v;
    }
  },
  ready: function() {
    this.ui.pushed_down_by = this.$el.clientHeight + 'px';
  },
  replace: true,
  template: require('./template.html'),
  components: {
    'menu-pages': require('../menu-pages'),
    'menu-content': require('../menu-content'),
  },
  methods: {
    logout: function() {
      var self = this;
      // TODO: make this data state driven
      db.logout(function (err, response) {
        if (err) {
          // network error
          console.log('error', err);
        } else {
          // no need to hang around if we are logged out
          self.destroy();
        }
      });
    },
    destroy: function() {
      var self = this;
      self.ui.pushed_down_by = 0;
      // it's not properly destroying...
      // TODO: bug?
      // it works on a fresh page, but not after login + logout clicks
      // ...also works on second click O.o
      self.$destroy(true);
      self.$destroy(true);
    }
  }
};
