var blank_doc = {
  name: "",
  templates: {
    page: "",
    partials: {},
    types: {}
  },
  type: "template"
};

BlueInk.filter('toStrings', function(arr) {
  return arr.filter(function(item) {
    return (typeof item.$value === 'string');
  });
});

BlueInk.filter('toObjects', function(arr) {
  var rv = arr.filter(function(item) {
    return (item.$value.constructor === Object);
  });
  console.log('objects?', rv);
  return rv;
});

BlueInk.component('template-viewer', {
  template: require('./viewer.html'),
  replace: true,
  data: function() {
    return {
      data: blank_doc
    };
  }
});

BlueInk.component('template-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: blank_doc
    }
  },
  methods: {
    output: function() {
      this.doc.type = 'template';
      // TODO: add created & updated
      return this.doc;
    },
    isString: function(v) {
      return typeof(v) === 'string';
    },
    isObject: function(v) {
      console.log('isObject?', typeof(v), v);
      return typeof(v) === 'object';
    }
  }
});
