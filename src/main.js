require('insert-css')(require('./main.css'));

var BlueInk = require('vue');
// TODO: in use by arbitrarily loaded type components...can we avoid it?
window.BlueInk = BlueInk;
BlueInk.config.prefix = 'blueink-';
BlueInk.config.debug = true;

var db_name = location.pathname.split('/')[1];
var db_url = location.protocol + '//' + location.hostname
    + (location.port ? ':' + location.port : '') + '/' + db_name + '/';
BlueInk.use(require('./vue-pouchdb'), {name: db_url});

var ajax = require('pouchdb/extras/ajax');
var include = require('jsinclude');
var key = require('keymaster');
var Sortable = require('sortablejs');
var sortables = [];

window.page = page = new BlueInk({
  el: document.body,
  data: {
    db_url: db_url,
    user: {},
    page: {},
    types: {},
    ui: {
      dim: false,
      menu: '',
      modal_count: 0
    }
  },
  computed: {
    loggedIn: function() {
      if (this.user
          && Object.keys(this.user).length > 0
          && undefined != this.user.name) {
        return true;
      } else {
        return false;
      }
    },
    collection_info: function() {
      var collection_info = {};
      // TODO: >_< rather expensive looping -- turn into a $watch + deep watching
      if (undefined !== this.page.page_items) {
        // now that we have page info, dig for a collection
        this.page.page_items.forEach(function(area) {
          area.forEach(function(item) {
            if (undefined !== item._collection
                && Object.keys(item._collection).length > 0) {
              collection_info = item._collection;
            }
          });
        });
      }
      return collection_info;
    },
    item_ids: function() {
      // TODO: ...stop using expensive looping...
      var ids = [];
      if (undefined !== this.page.page_items) {
        this.page.page_items.forEach(function(area) {
          area.forEach(function(item) {
            if ('_id' in item) {
              ids.push(item._id);
            }
          });
        });
        if ('collection' in this.page) {
          var collection_items = [];
          if (undefined !== this.page.collection.length) {
            // we have an old style array-based collection key
            collection_items = this.page.collection;
          } else {
            // we've got (we hope) the new style object-based collection
            collection_items = this.page.collection.items;
          }
          collection_items.forEach(function(item) {
            if ('_id' in item) {
              ids.push(item._id);
            }
          });
        }
      }
      return ids;
    },
    type_options: function() {
      // get the types list, but in Vue.js' special select format
      var options = [];
      var type_names = Object.keys(this.types);
      for (var i = 0; i < type_names.length; i++) {
        options.push({
          text: this.types[type_names[i]].name,
          value: type_names[i]
        });
      }
      return options;
    },
    maxHeight: function() {
      return window.innerHeight * 0.8 + 'px';
    }
  },
  watch: {
    loggedIn: function(yes) {
      if (yes) {
        this.loadUI();
        if (undefined !== this.page._id) {
          this.enableSortables();
        }
      } else {
        this.destroySortables();
      }
    },
    'page._id': function(page_id) {
      // doing this with a `watch` since page._id may get set "late"
      // auto-generated pages don't have ID's
      if (undefined !== page_id && this.loggedIn) {
        this.enableSortables();
      }
    },
    'ui.modal_count': function(v) {
      // TODO: danger: this could remove a site's version of these :( namespace?
      if (v < 1) {
        document.body.classList.remove('dimmed', 'dimmable', 'scrolling');
      } else {
        // hide all menus
        this.ui.menu = '';
        document.body.classList.add('dimmed', 'dimmable', 'scrolling');
      }
    }
  },
  events: {
    loggedin: function(userCtx) {
      var self = this;
      self.user = userCtx;
    },
    refreshTypeCounts: function(type) {
      this.loadTypeCounts(type);
    },
    modalOpened: function() {
      this.ui.modal_count++;
    },
    modalClosed: function() {
      this.ui.modal_count--;
    }
  },
  created: function() {
    var self = this;
    // find page name
    // TODO: ...this really needs rethinking...
    // menu-pages/index.js has something similar using <base href>...hrm...
    var url = location.pathname.split('/');
    if (url.indexOf('_rewrite') > -1) {
      url = url.splice(url.indexOf('_rewrite') + 1);
    }
    var page_url = url.join('/');
    if (page_url === '') {
      // TODO: this will need to change when home page name is configurable
      page_url = 'home';
    }

    // get page information
    self.$db.get(page_url)
      .then(function(resp) {
        self.page = resp;
      }
    );

    // load types
    self.loadTypeList();

    // check session / load user name
    self.$db.getSession(function (err, resp) {
        if (err) {
          // network error
        } else if (resp.userCtx.name) {
          // response.userCtx.name is the current user
          self.user = resp.userCtx;
        }
    });

  },
  ready: function() {
    var self = this;

    // listen for document-wide keyboard events
    key('ctrl+shift+l', function() {
      self.$db.getSession(function (err, resp) {
        if (err) {
          // network error
        } else if (!resp.userCtx.name) {
          // reset the user to empty
          // TODO: should trigger UI changes
          self.user = {};
          // open login modal
          self.addCSS();
          var modal = self.$addChild(require('./login-modal'));
          modal.$mount();
          modal.$appendTo(document.body);
          modal.$on('hook:destroyed', function() {
            if (!self.loggedIn) {
              // TODO: um...do this some place reusable... >_<
              document.getElementsByTagName('html')[0].classList.remove('blueinked');
            }
          });
        } else{
          // response.userCtx.name is the current user
          self.user = resp.userCtx;

        }
      });
      return false;
    });
  },
  methods: {
    addCSS: function() {
      include.css('_blueink/ui/app.css', {prepend: true});
      document.getElementsByTagName('html')[0].classList.add('blueinked');
    },
    loadUI: function() {
      var self = this;
      self.addCSS();
      var ui = self.$addChild(require('./ui-blueink'));
      ui.user = self.user;
      ui.$mount();
      ui.$appendTo(document.body);
    },
    savePage: function(callback) {
      var self = this;
      self.$db.put(self.page)
        .then(function(resp) {
          // TODO: let the user know this worked
          self.page._rev = resp.rev
          if (callback) {
            // TODO: error callbacks might be good
            callback();
          }
        });
    },
    enableSortables: function() {
      var self = this;
      // turn on Sortable for...sorting
      // TODO: explore a better way to find / define page areas in templates
      var areas = document.querySelectorAll('[data-blueink-area-index]');
      for (var i = 0; i < areas.length; i++) {
        sortables.push(Sortable.create(areas[i], {
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
        }));
      }
    },
    destroySortables: function() {
      var sortable = false;
      do {
        sortable = sortables.pop();
        if (sortable) {
          sortable.destroy();
        }
      } while (sortables.length > 0);
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
    removeItem: function(area_idx, item_idx, callback) {
      this.page.page_items[area_idx].splice(item_idx, 1);
      // TODO: if the wrong indexes come in this could wipe out the page items!
      // validate by double checking the item id?
      this.savePage(callback);
    },
    createDoc: function(type) {
      return this.editDoc({type: type});
    },
    editDoc: function(doc, schema_name) {
      // TODO: all this assumes at least doc.type...
      var modal = this.$addChild({
        data: {
          name: doc.type,
          doc: doc,
          active: true,
          types: this.type_options
        }
      }, BlueInk.extend(require('./make-modal')));

      if (doc.type in this.types && 'name' in this.types[doc.type]) {
        modal.$set('name', this.types[doc.type].name);
      }

      var editor = 'json';
      var schema_url = '';
      if (schema_name) {
        // TODO: update this to use _blueink route
        schema_url = '_rewrite/schemas/' + schema_name;
        editor = 'vue-schema';
      }

      if (doc.type in this.types
          && 'components' in this.types[doc.type]
          && 'editor' in this.types[doc.type].components) {
        editor = this.types[doc.type].components.editor;
      }

      // TODO: pretty confident all this smells...
      modal.$set('editor', editor);
      modal.$set('schema_url', schema_url);

      modal.$mount();
      modal.$appendTo(this.$el);
      return modal;
    },
    selectDoc: function(type) {
      var modal = this.$addChild(require('./select-modal'));
      modal.$set('type', type);
      modal.$set('active', true);
      modal.$mount();
      modal.$appendTo(this.$el);
      return modal;
    },
    generateSitemap: function(callback, page_id) {
      var self = this;
      // TODO: construct this URL better...
      var url = location.pathname.split(this.page._id)[0] + '/_blueink/sitemap';
      // get the new sitemap from the _list
      ajax({url: url},
        function(err, new_sitemap) {
          // next, get the current sitemap doc
          self.$db.get('sitemap')
            .then(function(old_sitemap) {
              old_sitemap['urls'] = new_sitemap['urls'];
              return old_sitemap;
            }).then(function(updated_sitemap) {
              return self.$db.put(updated_sitemap);
            }).then(function(resp) {
              console.log('stored?', resp);
              callback(page_id);
            }).catch(console.log.bind(console));
        }
      );
    },
    loadTypeList: function() {
      var self = this;
      self.$db.query('blueink/type_definitions')
        .then(function(resp) {
          var types = {};
          resp.rows.forEach(function(row) {
            // load type info
            types[row.key] = row.value;
            if (!('name' in types[row.key])) {
              types[row.key].name = row.key;
            }
            types[row.key].count = 0;
            // and it's component JS (editor and/or viewer)
            if (Object.keys(types[row.key].components).length > 0) {
              include.once(db_url + row.id + '/component.js');
            }
          });
          self.types = types;
          self.loadTypeCounts();
        })
        .catch(console.log.bind(console)
      );
    },
    loadTypeCounts: function(type) {
      var self = this;
      var view = 'blueink/by_type?group=true';
      if (type) {
        view += '&key="' + type + '"';
      }
      self.$db.query(view)
        .then(function(resp) {
          resp.rows.forEach(function(row) {
            if (row.key in self.types) {
              self.types[row.key].count = row.value;
            }
          });
        })
        .catch(console.log.bind(console)
      );
    }
  },
  components: {
    'file-picker': require('./file-picker'),
    'page-item': require('./page-item')
  }
});
