var include = require('jsinclude');
var filepicker = require('filepicker-js');

// TODO: handle missing filepicker.io key...gracefully
var APIKEY = require('../../config_ui.json').services['filepicker.io'].apikey;
filepicker.setKey(APIKEY);

module.exports = {
  template: '<button type="button" class="ui button" blueink-on="click: filepick">Pick a File</button>',
  paramAttributes: [
    'mimetype'
  ],
  data: function() {
    return {
      url: '',
      filename: '',
      mimetype: '*/*',
      size: ''
    }
  },
  methods: {
    filepick: function(e) {
      var self = this;
      e.preventDefault();
      filepicker.pick({
        mimetype: self.mimetype
      },
      function(Blob) {
        console.log('blob', Blob);
        self.$set('url', Blob.url);
        self.$set('name', Blob.filename);
      });
    }
  }
};
