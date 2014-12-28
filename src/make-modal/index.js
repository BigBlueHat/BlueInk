var Vue = require('vue');

module.exports = Vue.extend({
  data: function() {
    return {
      schema_name: '',
      items: []
    };
  },
  computed: {
    apiUrl: function() {
      return '_blueink/schemas/' + this.schema_name;
    }
  },
  watch: {
    apiUrl: 'fetchData'
  },
  replace: true,
  template: require('./template.html'),
  created: function() {
    document.body.style.overflow = 'hidden';
    if (this.schema_name !== '') {
      this.fetchData();
    }
  },
  destroyed: function() {
    document.body.style.overflow = 'auto';
  },
  methods: {
    destroy: function() {
      this.$destroy(true);
    },
    fetchData: function () {
      if (!this.apiUrl) return false;
      var xhr = new XMLHttpRequest(),
          self = this;
      xhr.open('GET', self.apiUrl);
      xhr.onload = function () {
        self.items = JSON.parse(xhr.responseText);
      };
      xhr.send();
    }
  },
  components: {
    'vue-schema': require('../vue-schema')
  }
});
