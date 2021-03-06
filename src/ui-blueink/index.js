module.exports = {
  inherit: true,
  replace: true,
  template: require('./template.html'),
  components: {
    'menu-pages': require('../menu-pages'),
    'menu-content': require('../menu-content'),
  },
  watch: {
    'ui.menu': function(menu) {
      // no menu set? undim.
      this.$set('ui.dim', Boolean(menu !== ''));
    },
    'ui.dim': function(dimmed) {
      if (!dimmed) {
        this.$set('ui.menu', '');
      }
    }
  },
  methods: {
    logout: function() {
      var self = this;
      document.getElementsByTagName('html')[0].classList.remove('blueinked');
      // TODO: make this data state driven
      self.$db.logout(function (err, response) {
        if (err) {
          // network error
          console.log('error', err);
        } else {
          // no need to hang around if we are logged out
          self.user = {};
          self.$destroy(true);
        }
      });
    }
  }
};
