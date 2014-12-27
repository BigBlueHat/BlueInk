var Vue = require('vue');

module.exports = Vue.extend({
  data: function() {
    return {
      items: []
    };
  },
  methods: {
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
  watch: {
    apiUrl: 'fetchData'
  }
});
