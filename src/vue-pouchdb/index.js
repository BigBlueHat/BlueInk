var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-authentication'));

/**
 * Create a single PouchDB instance on all Vue VM's that have this plugin
 **/
exports.install = function(Vue, options) {
  // compute db_url from location
  Vue.prototype.$db = new PouchDB(options);
};
