BlueInk.component('html-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: {
        title: "",
        content: ""
      }
    }
  },
  methods: {
    output: function() {
      this.doc.type = 'html';
      // TODO: add created & updated
      return this.doc;
    }
  }
});
