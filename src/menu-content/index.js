require('insert-css')(require('./index.css'));

// TODO: componentize
var PouchDB = require('pouchdb');
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
      types: {} // passed in from ui-blueink
    }
  }
};
