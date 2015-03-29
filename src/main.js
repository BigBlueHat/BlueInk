require('insert-css')(require('./semantic-ui/semantic.css'));
require('insert-css')(require('./main.css'));

var Vue = require('vue');
Vue.config.debug = true;
var PouchDB = require('pouchdb');
var Sortable = require('sortablejs');

var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

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
    page: {}
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
    savePage: function() {
      var self = this;
      db.put(self.page)
        .then(function(resp) {
          // TODO: let the user know this worked
          self.page._rev = resp.rev
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
    }
  }
});
