require('insert-css')(require('./semantic-ui/semantic.css'));
require('insert-css')(require('./main.css'));

var Vue = require('vue');
// TODO: kill the global T_T
window.Vue = Vue;
Vue.config.debug = true;
var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-authentication'));
var include = require('jsinclude');
var key = require('keymaster');
var Sortable = require('sortablejs');

var db_name = location.pathname.split('/')[1];
var db_url = location.protocol + '//' + location.hostname
    + (location.port ? ':' + location.port : '') + '/' + db_name + '/';
var db = new PouchDB(db_url);

window.BlueInk = new Vue({
  el: 'body',
  data: {
    user: {},
    page: {},
    types: {}
  },
  watch: {
    user: function() {
      var self = this;
      if (self.user != {} &&
          undefined != self.user.name) {
        self.loadUI();
      }
    }
  },
  events: {
    loggedin: function(userCtx) {
      var self = this;
      self.user = userCtx;
      self.loadUI();
    }
  },
  created: function() {
    var self = this;
    // find page name
    // TODO: seriously? O.o
    var base = document.querySelector('base').getAttribute('href');
    var url = location.href;
    var page_id = url.replace(base, '');
    db.get(page_id)
      .then(function(resp) {
        self.page = resp;
      });

    // load types
    db.query('blueink/type_definitions',
      function(err, resp) {
        resp.rows.forEach(function(row) {
          // load type info
          self.types[row.key] = row.value;
          // and it's component JS (editor and/or viewer)
          include.once(db_url + row.id + '/component.js');
        });
      }
    );

    // check session / load user name
    db.getSession(function (err, resp) {
        if (err) {
          // network error
        } else if (resp.userCtx.name) {
          // response.userCtx.name is the current user
          self.user = resp.userCtx;
        }
    });

    // turn on Sortable for...sorting
    // TODO: explore a better way to find / define page areas in templates
    var areas = document.querySelectorAll('[data-blueink-area-index]');
    for (var i = 0; i < areas.length; i++) {
      Sortable.create(areas[i], {
        group: 'areas',
        onStart: function(e) {
          // loop through the areas...
          for (var i = 0; i < areas.length; i++) {
            // tweak their CSS a bit to make them more findable
            areas[i].classList.add('blueink-drop-spot');
          }
        },
        onEnd: function(e) {
          // loop through the areas...
          for (var i = 0; i < areas.length; i++) {
            // remove drag-time-only class from areas
            areas[i].classList.remove('blueink-drop-spot');
          }
        },
        onAdd: function(e) {
          // get old area index
          var old_area = e.from.dataset.blueinkAreaIndex;
          // get new area index
          var new_area = e.item.parentNode.dataset.blueinkAreaIndex;
          self.moveItem(old_area, e.oldIndex, new_area, e.newIndex);
        },
        onUpdate: function(e) {
          self.sortItem(e.from.dataset.blueinkAreaIndex, e.oldIndex, e.newIndex);
        }
      });
    }
  },
  ready: function() {
    var self = this;

    // listen for document-wide keyboard events
    key('ctrl+shift+l', function() {
      db.getSession(function (err, resp) {
        if (err) {
          // network error
        } else if (!resp.userCtx.name) {
          // reset the user to empty
          // TODO: should trigger UI changes
          self.user = {};
          // open login modal
          var modal = self.$addChild(require('./login-modal'));
          modal.$mount();
          modal.$appendTo(document.body);
        } else{
          // response.userCtx.name is the current user
          self.user = resp.userCtx;

        }
      });
      return false;
    });
  },
  methods: {
    loadUI: function() {
      var self = this;
      var ui = self.$addChild(require('./ui-blueink'));
      ui.user = self.user;
      ui.$mount();
      ui.$appendTo(document.body);
    },
    savePage: function(callback) {
      var self = this;
      db.put(self.page)
        .then(function(resp) {
          // TODO: let the user know this worked
          self.page._rev = resp.rev
          if (callback) {
            // TODO: error callbacks might be good
            callback();
          }
        });
    },
    sortItem: function(area, from, to) {
      var self = this;

      function move(a, from, to) {
        a.splice(to, 0, a.splice(from, 1)[0]);
      }

      move(self.page.page_items[area], from, to);
      self.savePage();
    },
    moveItem: function(old_area, old_index, new_area, new_index) {
      var self = this;
      // get page_item from old location (area, index)
      var page_item = self.page.page_items[old_area][old_index];
      // save it into the new location
      if (undefined == self.page.page_items[new_area]) {
        self.page.page_items[new_area] = [];
      }
      self.page.page_items[new_area].splice(new_index, 0, page_item);
      // remove it from the old one
      self.page.page_items[old_area].splice(old_index, 1);
      // save it
      self.savePage();
    },
    editDoc: function(doc, schema_name) {
      var modal = this.$addChild(require('./make-modal'));
      if (schema_name) {
        // TODO: update this to use _blueink route
        modal.$set('schema_url', '_rewrite/schemas/' + schema_name);
      } else {
        modal.$set('schema_url', '');
      }
      modal.$set('doc', doc);
      modal.$set('active', true);
      modal.$mount();
      modal.$appendTo(this.$el);
      return modal;
    }
  }
});
