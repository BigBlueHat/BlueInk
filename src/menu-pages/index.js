require('insert-css')(require('./index.css'));

// TODO: componentize
var PouchDB = require('pouchdb');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

window.PouchDB = PouchDB;

module.exports = {
  replace: true,
  template: require('./template.html'),
  data: function() {
    return {
      current: '',
      pages: []
    }
  },
  created: function() {
    var base = document.getElementsByTagName('base')[0].href;
    this.current = location.toString().replace(base, '');
    this.loadPages();
  },
  methods: {
    loadPages: function() {
      var self = this;
      db.query('blueink/pages?group=true',
        function(err, response) {
          self.pages = [];
          for (var i = 0; i < response.rows.length; i++) {
            self.pages.push({
              url: response.rows[i].key.join('/')
            });
          }
        });
    },
    modalize: function(doc) {
      var self = this;
      var modal = self.$root.editDoc(doc);
      modal.$on('saved', function() {
        self.generateSitemap();
        location.href = this.doc._id;
      });
      modal.$on('afterDel', function() {
        location.href = 'home';
      });
    },
    createDoc: function() {
      this.modalize({type: "page"});
    },
    editDoc: function(doc_id) {
      var self = this;
      db.get(doc_id)
        .then(function(resp) {
          self.modalize(resp);
        }
      );
    },
    generateSitemap: function() {
      // get the new sitemap from the _list
      PouchDB.ajax({
          // TODO: construct this URL better...
          url: '../_list/sitemap/pages?reduce=false'
        },
        function(err, new_sitemap) {
          // next, get the current sitemap doc
          db.get('sitemap')
            .then(function(old_sitemap) {
              old_sitemap['urls'] = new_sitemap['urls'];
              db.put(old_sitemap)
                .then(function(err, resp) { console.log(resp); });
            });
        }
      );
    }
  }
};
