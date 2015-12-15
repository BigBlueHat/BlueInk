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
        collection: {
          title: '',
          type: '',
          template_type: 'card',
          items: []
        }
      },
      collection_area_index: 0,
      collection_item_index: 0
    }
  },
  ready: function() {
    // if doc.collection is an array, we've got the old style, so upgrade it
    if ('collection' in this.doc
        // got an array
        && undefined !== this.doc.collection.length) {
      var collection_items = this.doc.collection;
      var collection_meta = this.current_collection;

      this.$set('doc.collection', {
        title: collection_meta['title'],
        type: collection_meta['type'],
        template_type: collection_meta['template_type'],
        items: []
      });
      this.$set('doc.collection.items', collection_items);
      console.log('page has collection', JSON.stringify(this.$data));
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
            } else if (typeof areas[i][j]['_id'] === 'object'
                && '$ref' in areas[i][j]._id) {
              current_collection = {
                title: this.doc.collection.title,
                type: this.doc.collection.type,
                template_type: this.doc.collection.template_type
              };
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
        this.doc.page_items[area][item]._id = {
          '$ref': '#/collection'
        };
        delete this.doc.page_items[area][item]._collection;
      }
    }
  },
  methods: {
    output: function() {
      var output = this.doc;
      output.type = 'page';

      if (this.doc.collection.title !== '') {
        // we have collection data, so...let's output it in the correct place
        if (Object.keys(this.current_collection).length > 0) {
          this.current_collection = this.collection;
        } else {
          // we've got a new collection, so add it to the first areas list
          output.page_items[0].unshift({
            _id: {
              '$ref': '#/collection'
            }
          });
        }
      }

      // TODO: add created & updated
      return output;
    }
  }
});
