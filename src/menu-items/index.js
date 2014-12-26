// TODO: componentize
var PouchDB = require('../pouchdb.js');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

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
  }
};
