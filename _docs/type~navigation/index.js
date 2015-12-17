var blank_doc = {
  title: '',
  type: 'navigation',
  current_url: '',
  show_only: '' // empty or 'children'
};

BlueInk.component('navigation-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: blank_doc
    }
  },
  methods: {
    output: function() {
      this.doc.type = 'navigation';
      // TODO: add created & updated
      return this.doc;
    }
  }
});
