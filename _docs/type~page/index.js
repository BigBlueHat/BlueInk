BlueInk.component('page-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: {
        type: "page",
        title: "",
        nav_label: "",
        url: "",
        display_title: true,
        page_items: [[]],
        collection: []
      },
      // intermediate info added to the doc during output
      collection: {
        title: '',
        type: '',
        template_type: 'card'
      },
      collection_area_index: 0,
      collection_item_index: 0
    }
  },
  ready: function() {
    // if we have a current collection
    if (Object.keys(this.current_collection).length > 0) {
      // then we update the intermediary this.collection object
      this.$set('collection', this.current_collection);
    }
  },
  computed: {
    current_collection: {
      get: function() {
        var current_collection = {};
        var areas = this.doc.page_items;
        for (var i = 0; i < areas.length; i++) {
          for (var j = 0; j < areas[i].length; j++) {
            if (undefined !== areas[i][j]._collection) {
              current_collection = areas[i][j]._collection;
              // saving the indexes for use during output
              this.collection_area_index = i;
              this.collection_item_index = j;
            }
          }
        }
        return current_collection;
      },
      set: function(collection) {
        // assumes we've already "gotten" this stuff once (at least)
        var area = this.collection_area_index;
        var item = this.collection_item_index;
        this.doc.page_items[area][item]._collection = this.collection;
      }
    }
  },
  methods: {
    output: function() {
      var output = this.doc;
      output.type = 'page';

      if (this.collection.title !== '') {
        // we have collection data, so...let's output it in the correct place
        if (Object.keys(this.current_collection).length > 0) {
          this.current_collection = this.collection;
        } else {
          // we've got a new collection, so add it to the first areas list
          output.page_items[0].unshift({
            _collection: this.collection
          });
          if (undefined === output.collection) {
            output.collection = [];
          }
        }
      }

      // TODO: add created & updated
      return output;
    }
  }
});
