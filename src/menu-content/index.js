require('insert-css')(require('./index.css'));

module.exports = {
  replace: true,
  template: require('./template.html'),
  components: {
    'menu-items': require('../menu-items')
  },
  data: function() {
    return {
      selected: '',
      types: {} // passed in from ui-blueink
    }
  },
  computed: {
    active: {
      get: function() {
        return this.$root.ui.menu === 'content';
      },
      set: function(v) {
        if (v === true) {
          return this.$root.ui.menu = 'content';
        } else {
          return this.$root.ui.menu = '';
        }
      }
    }
  },
  methods: {
    setActive: function(ev) {
      if (ev.target === this.$el) {
        this.$set('active', !this.active);
      }
    }
  }
};
