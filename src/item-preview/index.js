module.exports = {
  template: require('./template.html'),
  replace: true,
  data: function() {
    doc: {}
  },
  computed: {
    hasViewer: function() {
      var types = this.$root.types;
      return (undefined != types[this.doc.type]
          && undefined != types[this.doc.type].components
          && undefined != types[this.doc.type].components.viewer);
    },
    keys: function() {
      var self = this;
      var keys = Object.keys(this.doc);
      keys = keys.filter(function(v) {
        if (v[0] !== '_' && typeof(self.doc[v]) === 'string'
            && v !== 'type') {
          return true;
        }
      });
      return keys;
    }
  }
}
