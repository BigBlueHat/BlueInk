var dom = require('traversty');
window.dom = dom;
var PouchDB = require('pouchdb');

// TODO: move this to a config lib
var db_name = location.pathname.split('/')[1];
var db_url = location.protocol + '//' + location.hostname
    + (location.port ? ':' + location.port : '') + '/' + db_name + '/';
var db = new PouchDB(db_url);

module.exports = {
  replace: false,
  template: require('./template.html'),
  paramAttributes: ['data-item-id', 'data-item-index'],
  attached: function() {
    this.$el.style.position = 'relative';
  },
  computed: {
    canBeRemoved: function() {
      // auto-generated pages don't have ID's currently
      return (undefined !== this.$root.page._id);
    }
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
    },
    remove: function(ev) {
      ev.preventDefault();
      var self = this;

      var collection = dom(this.$el).parents('[data-blueink-collection]');
      if (collection.length > 0) {
        // remove from the collection, not the page
        // TODO: check that we indeed do have a collection
        console.log(this.itemIndex);
        console.log('collection', this.$root.page.collection);
        this.$root.page.collection.splice(this.itemIndex, 1);
        console.log('collection', this.$root.page.collection);
        // TODO: index change when you remove items...so all this must be smarter T_T
        this.$root.savePage(function() {
          self.$destroy(true);
        });
      } else {
        // look up area index
        var $area = dom(this.$el).up('[data-blueink-area-index]');
        var area_idx = $area[0].dataset.blueinkAreaIndex;
        // look up item index
        // TODO: and if it's not been set?
        $area.down('[data-item-id]').each(function(el, item_idx) {
          if (self.itemId == el.dataset.itemId) {
            self.$root.removeItem(area_idx, item_idx, function() {
              self.$destroy(true);
            });
          } else {
            // TODO: handle this error...
          }
        });
      }
    }
  }
}
