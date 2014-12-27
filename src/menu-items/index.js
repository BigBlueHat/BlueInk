// TODO: componentize
var PouchDB = require('../pouchdb.js');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

var MakeModal = require('../make-modal');

module.exports = {
  replace: true,
  template: require('./template.html'),
  paramAttributes: ['type'],
  data: function() {
    return {
      type: "",
      items: []
    }
  },
  watch: {
    type: function() {
      var self = this;
      db.query('blueink/by_type?reduce=false&key="' + self.type + '"',
      function(err, response) {
        self.items = response.rows;
      });
    }
  },
  methods: {
    openMakeModal: function() {
      var modal = new MakeModal({
        data: {
          schema_name: this.type
        }
      });
      modal.$mount();
      modal.$appendTo('body');
    }
  }
};
