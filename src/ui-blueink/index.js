var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-authentication'));
var db_name = location.pathname.split('/')[1];
var db_url = location.protocol + '//' + location.hostname
    + (location.port ? ':' + location.port : '') + '/' + db_name + '/';
var db = new PouchDB(db_url);

module.exports = {
  inherit: true,
  replace: true,
  template: require('./template.html'),
  components: {
    'menu-pages': require('../menu-pages'),
    'menu-content': require('../menu-content'),
  },
  methods: {
    logout: function() {
      var self = this;
      document.getElementsByTagName('html')[0].classList.remove('blueinked');
      // TODO: make this data state driven
      db.logout(function (err, response) {
        if (err) {
          // network error
          console.log('error', err);
        } else {
          // no need to hang around if we are logged out
          self.user = {};
          self.$destroy(true);
        }
      });
    }
  }
};
