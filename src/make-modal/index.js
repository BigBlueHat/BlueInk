var Vue = require('vue');

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
      xhr.open('GET', self.valuesUrl);
      xhr.onload = function () {
        self.values = JSON.parse(xhr.responseText);
      };
      xhr.send();
    }
  },
  components: {
    'vue-schema': require('../vue-schema')
  }
});
