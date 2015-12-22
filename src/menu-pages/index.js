require('insert-css')(require('./index.css'));
var URI = require('urijs');
window.URI = URI;

module.exports = {
  replace: true,
  template: require('./template.html'),
  data: function() {
    return {
      autogen: false,
      parent_url: '',
      current: '',
      pages: []
    }
  },
  created: function() {
    var base = document.getElementsByTagName('base')[0].href;
    // staticly storing these (vs. computed props) to avoid constant recalc
    var page_url = URI().relativeTo(base);
    this.current = page_url.toString() || 'home';
    this.parent_url = page_url.directory().toString();

    this.loadPages();
  },
  computed: {
    autogen: function() {
      // page data loads later, so this needs to be a computed property
      return Boolean(undefined === this.$root.page._id);
    },
    active: {
      get: function() {
        return this.$root.ui.menu === 'pages';
      },
      set: function(v) {
        if (v === true) {
          this.$root.ui.menu = 'pages';
        } else {
          this.$root.ui.menu = '';
        }
      }
    }
  },
  methods: {
    loadPages: function() {
      var self = this;
      self.$db.query('blueink/pages?reduce=false',
        function(err, response) {
          self.pages = [];
          for (var i = 0; i < response.rows.length; i++) {
            var row = response.rows[i];
            self.pages.push({
              url: row.key.join('/'),
              label: row.value.nav_label,
              is_collection: row.value.is_collection
            });
          }
        });
    },
    modalize: function(doc) {
      var self = this;
      var modal = self.$root.editDoc(doc);
      modal.$on('saved', function(saved_doc) {
        self.$root.generateSitemap(function(url) {
          location.href = url;
        }, saved_doc._id);
      });
      modal.$on('afterDel', function() {
        self.$root.generateSitemap(function() {
          location.href = 'home';
        });
      });
    },
    createDoc: function() {
      this.modalize({type: "page"});
    },
    editDoc: function(doc_id) {
      var self = this;
      self.$db.get(doc_id)
        .then(function(resp) {
          self.modalize(resp);
        }
      );
    },
    setActive: function(ev) {
      if (ev.target === this.$el) {
        this.$set('active', !this.active);
      }
    }
  }
};
