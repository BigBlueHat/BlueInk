require('insert-css')(require('./index.css'));

// TODO: componentize
var PouchDB = require('../pouchdb.js');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

module.exports = {
  replace: true,
  template: require('./template.html'),
  components: {
    'menu-items': require('../menu-items')
  },
  data: function() {
    return {
      active: false,
      selected: '',
      types: []
    }
  },
  created: function() {
    var self = this;
    db.query('blueink/by_type?group=true',
    function(err, response) {
      self.types = response.rows;
    });
  }
};
