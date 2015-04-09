require('insert-css')(require('./semantic-ui/semantic.css'));
require('insert-css')(require('./main.css'));

var Vue = require('vue');
// TODO: kill the global T_T
window.Vue = Vue;
Vue.config.debug = true;
var PouchDB = require('pouchdb');
var include = require('jsinclude');
var Sortable = require('sortablejs');

var db_name = location.pathname.split('/')[1];
var db_url = location.protocol + '//' + location.hostname
    + (location.port ? ':' + location.port : '') + '/' + db_name + '/';
var db = new PouchDB(db_url);

Vue.component('ui-blueink', {
  ready: function() {
    document.body.style.top = this.$el.clientHeight + 'px';
  },
  replace: true,
  template: '\
    <ui-blueink class="ui fixed transparent inverted main menu">\
        <menu-pages></menu-pages>\
        <menu-content></menu-content>\
    </ui-blueink>',
  components: {
    'menu-pages': require('./menu-pages'),
    'menu-content': require('./menu-content')
  }
});

window.BlueInk = new Vue({
  el: 'body',
  data: {
    page: {},
    types: {}
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

    // turn on Sortable for...sorting
    // TODO: explore a better way to find / define page areas in templates
    var areas = document.querySelectorAll('[data-blueink-area-index]');
    for (var i = 0; i < areas.length; i++) {
      Sortable.create(areas[i], {
        group: 'areas',
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
  methods: {
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
