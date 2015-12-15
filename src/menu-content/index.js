require('insert-css')(require('./index.css'));

module.exports = {
  replace: true,
  template: require('./template.html'),
  components: {
    'menu-items': require('../menu-items')
  },
  data: function() {
    return {
      active: false,
      selected: '',
      types: {} // passed in from ui-blueink
    }
  }
};
