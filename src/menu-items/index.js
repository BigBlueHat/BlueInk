// TODO: componentize
var PouchDB = require('pouchdb');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

module.exports = {
  replace: true,
  template: require('./template.html'),
  paramAttributes: ['type'],
  data: function() {
    return {
      type: '',
      items: [],
      selected: '',
      preview: {}
    }
  },
  watch: {
    type: function() {
      this.loadItems();
      this.selected = '';
    },
    selected: 'loadPreview'
  },
  methods: {
    addToPage: function() {
      var item = {
        _id: this.selected
        // TODO: also add date info about when this was added to the page
      };

      if (this.$root.page.page_items) {
        this.$root.page.page_items[0].unshift(item);
      } else {
        // add to area 0 as item 0
        this.$root.page.page_items = [[item]];
      }
      this.$root.savePage(function() {
        location.reload();
      });
    },
    addToCollection: function(type) {
      var collection_info = this.$root.collection_info;
      var allowed_type = '';
      if (undefined !== collection_info.type) {
        allowed_type = collection_info.type;
      }
      // TODO: support multiple types?
      if (type !== allowed_type) {
        return false;
      }

      // TODO: expose allowed_type to UI to prevent the button being available

      var item = {
        _id: this.selected
        // TODO: also add date info about when this was added to the page
      };

      if (undefined !== this.$root.page.collection) {
        this.$root.page.collection.push(item);
      } else {
        // add to area 0 as item 0
        this.$root.page.collection = [item];
      }
      this.$root.savePage(function() {
        location.reload();
      });
    },
    canHazCollection: function(type) {
      return (undefined !== this.$root.page.collection
              && undefined !== this.$root.collection_info.type
              && type === this.$root.collection_info.type);
    },
    loadPreview: function() {
      var self = this;
      // TODO: implement an actual preview
      PouchDB.ajax({
        url: '_blueink/preview/' + this.selected
      }, function (err, resp) {
        self.preview = resp;
      });
    },
    loadItems: function() {
      var self = this;
      db.query('blueink/by_type?reduce=false&key="' + self.type + '"',
      function(err, response) {
        self.items = response.rows;
      });
    },
    openMakeModal: function(doc_id, type) {
      var self = this;
      if (doc_id) {
        db.get(doc_id)
          .then(function(resp) {
            var doc = resp;
            var modal = self.$root.editDoc(doc);
            modal.$on('saved', function() {
              self.loadItems();
            });
            modal.$on('afterDel', function() {
              self.loadItems();
            });
          }
        );
      } else {
        var modal = self.$root.editDoc({type: type});
        modal.$on('saved', function() {
          self.loadItems();
        });
      }
    }
  },
  components: {
    'item-preview': require('../item-preview')
  }
};
