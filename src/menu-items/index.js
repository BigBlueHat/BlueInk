var ajax = require('pouchdb/extras/ajax');

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
  computed: {
    published: function() {
      return this.items.filter(function(item) {
        if (item.on_page) {
          return item;
        }
      });
    },
    unpublished: function() {
      return this.items.filter(function(item) {
        if (!item.on_page) {
          return item;
        }
      });
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
      var allowed_type = this.$root.page.collection.type;
      // TODO: support multiple types?
      if (allowed_type !== '' && type !== allowed_type) {
        return false;
      }

      // TODO: expose allowed_type to UI to prevent the button being available

      var item = {
        _id: this.selected
        // TODO: also add date info about when this was added to the page
      };

      // prevent duplicate items in the collection
      for (var i = 0; i < this.$root.page.collection.items.length; i++) {
        if (this.selected === this.$root.page.collection.items[i]._id) {
          // TODO: UI still implies that you can...button just stops working
          return false;
        }
      }

      if (undefined !== this.$root.page.collection.items) {
        this.$root.page.collection.items.push(item);
      } else {
        // add to area 0 as item 0
        this.$root.page.collection.items = [item];
      }
      this.$root.savePage(function() {
        location.reload();
      });
    },
    canHazCollection: function(type) {
      // if it's a collection
      if (undefined !== this.$root.page.collection) {
        var collection_type = this.$root.page.collection.type;
        // with a specified type
        if (undefined !== collection_type && collection_type !== "") {
          return (type === collection_type);
        } else {
          // if no type is specified by the collection, take whatever.
          return true;
        }
      }
    },
    loadPreview: function() {
      var self = this;
      // TODO: a bit "leaky" here to put CSS mods during AJAX data loading...
      this.$el.querySelector('#item-preview').style.left = this.$parent.$el.querySelector('.menu').offsetWidth + this.$el.querySelector('#item-list').offsetWidth + 'px';
      // TODO: implement an actual preview
      ajax({
        url: '_blueink/preview/' + this.selected
      }, function (err, resp) {
        self.preview = resp;
      });
    },
    loadItems: function() {
      var self = this;
      // TODO: a bit "leaky" here to put CSS mods during AJAX data loading...
      this.$el.querySelector('.menu').style.left = this.$parent.$el.querySelector('.menu').offsetWidth + 'px';
      self.$db.query('blueink/by_type?reduce=false&key="' + self.type + '"',
      function(err, response) {
        var items = response.rows;
        // add on_page info to items array
        for (var i = 0; i < items.length; i++) {
          items[i].on_page = Boolean(self.$root.item_ids.indexOf(items[i].id) !== -1);
        }
        self.items = items;
      });
    },
    resetState: function() {
      this.$parent.selected = '';
      this.selected = '';
      this.items = [];
    },
    modalize: function(doc) {
      var self = this;
      var modal = self.$root.editDoc(doc);
      modal.$on('saved', function() {
        self.resetState();
        self.$root.loadTypeCounts();
      });
      modal.$on('afterDel', function() {
        self.resetState();
        self.$root.loadTypeCounts();
      });
    },
    createDoc: function(type) {
      this.modalize({type: type});
    },
    editDoc: function(doc_id) {
      var self = this;
      // unset preview, so we don't see old content post-edit
      self.selected = '';
      self.preview = {};
      self.$db.get(doc_id)
        .then(function(resp) {
          self.modalize(resp);
        }
      );
    }
  },
  components: {
    'item-preview': require('../item-preview')
  }
};
