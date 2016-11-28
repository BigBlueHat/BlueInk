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
        hide_page_from_nav: false,
        page_items: [[]],
        collection: {
          title: '',
          type: '',
          template_type: 'card',
          items: []
        },
        image: '',
        redirect: ""
      },
      collection_area_index: 0,
      collection_item_index: 0,
      original_id: '',
      parent_url: '',
      short_name: ''
    }
  },
  ready: function() {
    this.original_id = this.doc._id;

    if ('_id' in this.doc) {
      var parts = this.doc._id.split('/');
      this.short_name = parts.pop();
      this.parent_url = parts.join('/');
    }

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
                && '$ref' in areas[i][j]._id
                && 'collection' in this.doc) {
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
      this.$log();
      var output = this.doc;
      if (this.parent_url) {
        output._id = this.parent_url + '/' + this.short_name;
      } else {
        output._id = this.short_name;
      }

      // if the _id has changed, the page is moving
      if (this.original_id !== output._id) {
        // remove Vue getter/setter stuff
        var old_page = JSON.parse(JSON.stringify(this.doc));
        // set the _id to the old one
        old_page._id = this.original_id;
        // make sure it's still a page
        old_page.type = 'page';
        // store the new _id in `redirect`
        old_page.redirect = output._id;
        this.$db
          .post(old_page)
          .then(function(resp) {
            // output something?
          })
          .catch(console.log.bind(console));

        // remove the _rev from the old page data & store it with the new _id
        delete output._rev;
      }

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

      output.type = 'page';
      return output;
    }
  },
  components: {
    'parent-pages': {
      created: function() {
        var self = this;
        // TODO: >_< uses `page` global...should use _blueink API?
        // TODO: can I use $parent? or $root here more effectively?
        page.$db
          .query('blueink/pages', {reduce: false})
          .then(function(rv) {
            if (rv.total_rows > 0) {
              rv.rows.forEach(function(row) {
                self.options.push({
                  text: row.id,
                  value: row.id
                });
              });
            }
          });
      },
      data: function() {
        return {
          selected: '',
          options: [{
            text: '',
            value: ''
          }]
        };
      }
    }
  }
});
