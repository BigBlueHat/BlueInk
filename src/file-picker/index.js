var include = require('jsinclude');

// TODO: handle missing filepicker.io key...gracefully
var APIKEY = require('../../config.json').services['filepicker.io'].apikey;

module.exports = {
  template: '<button class="ui button" v-on="click: filepick">Pick a File</button>',
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
  ready: function() {
    include.once('//api.filepicker.io/v1/filepicker.js', function() {
      filepicker.setKey(APIKEY);
    });
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
