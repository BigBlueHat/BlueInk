BlueInk.component('page-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: {
        _id: "",
        type: "page",
        title: "",
        nav_label: "",
        page_items: [[]]
      }
    }
  },
  methods: {
    output: function() {
      this.doc.type = 'page';
      // TODO: add created & updated
      return this.doc;
    }
  }
});
