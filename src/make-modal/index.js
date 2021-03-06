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
  created: function() {
    this.$dispatch('modalOpened');
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
      this.$destroy(true);
      this.$dispatch('modalClosed');
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
