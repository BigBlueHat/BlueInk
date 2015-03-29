// TODO: componentize
var PouchDB = require('pouchdb');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

var MakeModal = require('../make-modal');

module.exports = {
  replace: true,
  template: require('./template.html'),
  paramAttributes: ['type'],
  data: function() {
    return {
      type: '',
      items: [],
      selected: ''
    }
  },
  watch: {
    type: function() {
      this.loadItems();
      this.selected = '';
    },
    selected: 'loadPreview'
  },
  methods: {
    addToPage: function() {
      // TODO: don't use a global >_<
      BlueInk.page.page_items[0].unshift({
        _id: this.selected
        // TODO: also add date info about when this was added to the page
      });
      BlueInk.savePage(function() {
        location.reload();
      });
    },
    loadPreview: function() {
      // TODO: implement an actual preview
      PouchDB.ajax({
        url: '_blueink/preview/' + this.selected
      }, function (err, resp) {
        console.log(resp);
      });
    },
    loadItems: function() {
      var self = this;
      db.query('blueink/by_type?reduce=false&key="' + self.type + '"',
      function(err, response) {
        self.items = response.rows;
      });
    },
    openMakeModal: function(doc_id) {
      var self = this;
      var modal = new MakeModal({
        data: {
          schema_name: this.type,
          doc_id: doc_id
        }
      });
      modal.$mount();
      modal.$appendTo('body');
      modal.$on('saved', function(type) {
        self.loadItems();
      });
      modal.$on('afterDel', function() {
        self.loadItems();
      });
    }
  }
};
