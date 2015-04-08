module.exports = {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: {}
    }
  },
  methods: {
    output: function() {
      return this.doc;
    }
  }
};
