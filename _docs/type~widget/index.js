BlueInk.component('widget-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: {
        title: "",
        content: "",
        type: "widget"
      }
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
