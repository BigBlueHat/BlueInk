var observableDiff = require('deep-diff').observableDiff;

var default_data = {
  active: false,
  name: 'JSON',
  schema_url: '',
  doc: {},
  editor: 'json'
};

module.exports = {
  data: function() {
    return default_data;
  },
  components: {
    // TODO: make these dynamic...somehow
    'json': require('../json-editor'),
    'vue-schema': require('../vue-schema')
  },
  replace: true,
  template: require('./template.html'),
  computed: {
    name: function() {
      // TODO: this.$root.mess must end!
      if (this.$root.types[this.doc.type].name) {
        return this.$root.types[this.doc.type].name;
      }
    },
    types: function() {
      // get the types list from $root, but in Vue.js' special select format
      var type_names = Object.keys(this.$root.types);
      var options = [];
      for (var i = 0; i < type_names.length; i++) {
        options.push({
          text: this.$root.types[type_names[i]].name,
          value: type_names[i]
        });
      }
      return options;
    }
  },
  watch: {
    schema_url: function() {
      this.editor = 'vue-schema';
    },
    'doc.type': function() {
      if (undefined != this.$root.types[this.doc.type]
          && undefined != this.$root.types[this.doc.type].components.editor) {
        this.editor = this.$root.types[this.doc.type].components.editor;
      } else {
        // default to JSON editor
        this.editor = 'json';
      }
    }
  },
  created: function() {
    document.body.classList.add('dimmed', 'dimmable', 'scrolling');
    // hide all menus
    this.$root.ui.menu = '';
  },
  beforeCompile: function() {
    var self = this;
    var blank_doc = BlueInk.component(this.editor).options.data();

    if (Object.keys(this.doc).length < 2
        && undefined !== this.doc.type) {
      // we have "stub" / initiation doc, so reset to defaults
      this.doc = blank_doc.doc;
    }

    // trigger new keys into Vue.js' observable-ness
    observableDiff(this.doc, blank_doc.doc,
      function(diff) {
        // if we've got a new key addition, trigger an $add
        if (diff.kind === 'N') {
          self.doc.$add(diff.path.join('.'), diff.rhs);
        }
      });
  },
  compiled: function() {
    // connect the editor.doc and modal docs for change watching
    this.$watch('doc', function() {
      this.$.editor.doc = this.doc;
    },
    // watch the entire doc
    true,
    // and triger changes (such as editor component choice) now
    true);
  },
  methods: {
    destroy: function() {
      // TODO: danger: this could remove a sites version of these :( namespace?
      document.body.classList.remove('dimmed', 'dimmable', 'scrolling');
      this.$destroy(true);
    },
    del: function() {
      var self = this;
      self.$db.get(self.doc._id, function(err, doc) {
        if (doc) {
          self.$db.remove(doc, function() {
            alert('The ' + doc.type + ' has been deleted.');
            // TODO: remove preview of removed item
            self.$emit('afterDel');
            self.destroy();
          });
        }
      });
    },
    save: function() {
      var self = this;
      // get doc from editor
      var doc = this.$.editor.output();

      // add/force time data
      // TODO: is this really the best place?
      // TODO: should I keep these under a `meta` or `blueink` key?
      if (!('created' in doc) || isNaN(Date.parse(doc.created))) {
        // we're missing `created` so let's...create it
        doc.created = (new Date()).toISOString();
      }
      // updated is always the latest timestamp
      doc.updated = (new Date()).toISOString();

      // save doc
      self.$db.post(doc, function(err, resp) {
        if (err) {
          // TODO: maybe tell somebody...
          console.log('error: ', err);
        } else {
          // TODO: trigger content reload, etc.
          self.$emit('saved', doc);
          self.destroy();
        }
      });
    }
  },
  filters: {
    encodeURIComponent: function(v) {
      return encodeURIComponent(v);
    }
  }
};
