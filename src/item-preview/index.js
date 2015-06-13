module.exports = {
  template: require('./template.html'),
  data: function() {
    doc: {}
  },
  computed: {
    keys: function() {
      var self = this;
      var keys = Object.keys(this.doc);
      keys = keys.filter(function(v) {
        if (v[0] !== '_' && typeof(self.doc[v]) === 'string') {
          return true;
        }
      });
      return keys;
    }
  }
}
