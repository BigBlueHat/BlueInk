var Vue = require('vue');
var array_merge_recursive = require('./array_merge_recursive.js');

// TODO: componentize
var PouchDB = require('../pouchdb.js');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

module.exports = Vue.extend({
  data: function() {
    return {
      schema_name: '',
      schema: {},
      doc_id: '',
      values: {}
    };
  },
  computed: {
    schemaUrl: function() {
      return '_blueink/schemas/' + this.schema_name;
    },
    valuesUrl: function() {
      if (this.doc_id !== undefined) {
        return '_blueink/' + this.doc_id;
      } else {
        // if we don't have an existing doc,
        // set a UUID to avoid duplicate doc creation
        this.doc_id = PouchDB.utils.uuid();
      }
    }
  },
  watch: {
    // TODO: move all this stuff to vue-schema; it's not really modal stuff
    schemaUrl: 'fetchSchema',
    valuesUrl: 'fetchValues'
  },
  replace: true,
  template: require('./template.html'),
  created: function() {
    document.body.style.overflow = 'hidden';
    if (this.schema_name !== '') {
      this.fetchSchema();
    }
    if (this.doc_id !== '') {
      this.fetchValues();
    }
  },
  destroyed: function() {
    document.body.style.overflow = 'auto';
  },
  methods: {
    destroy: function() {
      this.$destroy(true);
    },
    save: function() {
      var self = this;
      var doc = array_merge_recursive(this.$.editor.$get('values'), this.$.editor.output());
      doc._id = this.doc_id;
      doc.type = this.schema_name;
      db.post(doc, function (err, resp) {
        if (err) {
          alert('Something went wrong. Please try again.');
          console.log(err);
        } else {
          alert('The ' + doc.type + ' was saved successfully!');
          self.$emit('saved', doc.type);
          self.destroy();
        }
      });
    },
    fetchSchema: function () {
      if (!this.schemaUrl) return false;
      var xhr = new XMLHttpRequest(),
          self = this;
      xhr.open('GET', self.schemaUrl);
      xhr.onload = function () {
        self.schema = JSON.parse(xhr.responseText);
      };
      xhr.send();
    },
    fetchValues: function () {
      if (!this.valuesUrl) return false;
      var xhr = new XMLHttpRequest(),
          self = this;
      xhr.onload = function () {
        var rv = JSON.parse(xhr.responseText);
        if (!rv.error) {
          self.values = rv;
        } else {
          self.values = {
            "_id": self.doc_id,
            "type": self.schema_name
          }
        }
      };
      xhr.open('GET', self.valuesUrl);
      xhr.send();
    }
  },
  components: {
    'vue-schema': require('../vue-schema')
  }
});
