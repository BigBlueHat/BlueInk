var blank_doc = {
  title: "",
  content: "",
  type: "html"
};

BlueInk.component('html-viewer', {
  template: require('./viewer.html'),
  replace: true,
  data: function() {
    return {
      data: blank_doc
    };
  }
});

BlueInk.component('html-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: blank_doc
    }
  },
  methods: {
    output: function() {
      this.doc.type = 'html';
      // TODO: add created & updated
      return this.doc;
    }
  },
  components: {
    'prose-mirror': require('../../src/editor-prose-mirror')
  }
});
