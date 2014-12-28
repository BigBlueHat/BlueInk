var Vue = require('vue');

module.exports = Vue.extend({
  data: function() {
    return {
      schema_name: '',
      schema: {}
    };
  },
  computed: {
    schemaUrl: function() {
      return '_blueink/schemas/' + this.schema_name;
    }
  },
  watch: {
    schemaUrl: 'fetchSchema'
  },
  replace: true,
  template: require('./template.html'),
  created: function() {
    document.body.style.overflow = 'hidden';
    if (this.schema_name !== '') {
      this.fetchSchema();
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
    }
  },
  components: {
    'vue-schema': require('../vue-schema')
  }
});
