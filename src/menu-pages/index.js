require('insert-css')(require('./index.css'));

module.exports = {
  replace: true,
  template: require('./template.html'),
  data: {
    pages: []
  }
};
