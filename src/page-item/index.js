var PouchDB = require('pouchdb');

// TODO: move this to a config lib
var db_name = location.pathname.split('/')[1];
var db_url = location.protocol + '//' + location.hostname
    + (location.port ? ':' + location.port : '') + '/' + db_name + '/';
var db = new PouchDB(db_url);

module.exports = {
  replace: false,
  template: require('./template.html'),
  paramAttributes: ['item-id'],
  attached: function() {
    this.$el.style.position = 'relative';
  },
  methods: {
    edit: function(ev) {
      ev.preventDefault();
      var self = this;
      db.get(self.itemId)
        .then(function(resp) {
          var doc = resp;
          var modal = self.$root.editDoc(doc);
          modal.$on('saved', function() {
            // TODO: reload in place?
            location.reload();
          });
          modal.$on('afterDel', function() {
            // TODO: reload in place?
            location.reload();
          });
        }
      );
    }
  }
}
