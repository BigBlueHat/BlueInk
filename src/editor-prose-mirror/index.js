var ProseMirror = require("prosemirror/dist/edit").ProseMirror
require("prosemirror/dist/menu/menubar") // Load menubar module

module.exports = {
  data: function() {
    return {
      doc: '',
      docFormat: 'html'
    }
  },
  attached: function() {
    var self = this;
    var editor = new ProseMirror({
      menuBar: true,
      place: self.$el,
      doc: self.doc,
      docFormat: self.docFormat
    });
    editor.on('change', function() {
      self.doc = editor.getContent('html');
    });
  }
};
