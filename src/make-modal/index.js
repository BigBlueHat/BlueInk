var Fetchable = require('../fetchable');

module.exports = Fetchable.extend({
  data: function() {
    return {
      schema_name: ''
    };
  },
  computed: {
    apiUrl: function() {
      return '_blueink/schemas/' + this.schema_name;
    }
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
    }
  },
  components: {
    'vue-schema': require('../vue-schema')
  }
});
