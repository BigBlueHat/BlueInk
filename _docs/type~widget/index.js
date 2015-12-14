var blank_doc = {
  title: "",
  content: "",
  type: "widget"
};

BlueInk.component('widget-viewer', {
  template: require('./viewer.html'),
  replace: true,
  data: function() {
    return {
      data: blank_doc
    };
  }
});

BlueInk.component('widget-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: blank_doc
    }
  },
  methods: {
    output: function() {
      this.doc.type = 'widget';
      // TODO: add created & updated
      return this.doc;
    }
  }
});
