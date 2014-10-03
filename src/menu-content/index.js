require('insert-css')(require('./index.css'));

module.exports = {
  template: require('./template.html'),
  data: {
    hidden: true,
    types: []
  },
  methods: {
    toggleMenu: function() {
      this.hidden = !this.hidden;
    }
  }
};
