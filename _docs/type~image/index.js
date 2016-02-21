var blank_doc = {
  type: 'image',
};

BlueInk.component('image-viewer', {
  template: require('./viewer.html'),
  replace: true,
  data: function() {
    return {
      data: blank_doc
    };
  }
});

BlueInk.component('image-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: blank_doc,
      // storage for Blob from file selection
      file: ''
    }
  },
  computed: {
    src: function() {
      var doc = this.doc;
      if (this.file !== '') {
        // user's picked a file
        return URL.createObjectURL(this.file);
      } else if ('_id' in doc && '_attachments' in doc && 'self' in doc._attachments) {
        // no file picked yet, but we do have an attachment!
        // ...plus cache busting. :-P
        return '_blueink/' + doc._id + '/self' + '?' + Date.now();
      } else {
        return '';
      }
    }
  },
  methods: {
    setFile: function(ev) {
      this.$set('file', ev.target.files[0]);
    },
    output: function() {
      this.doc.type = 'image';
      if (this.src.substr(0,4) === 'blob') {
        // if we have a blog URL, setup the _attachments object
        // TODO: can this live in a computed property?..underscore may kill that
        this.doc._attachments = {
          "self": {
            content_type: this.file.type,
            data: this.file
          }
        }
      }

      // compile attachment from file input
      // store it in the proper place
      return this.doc;
    }
  }
});
