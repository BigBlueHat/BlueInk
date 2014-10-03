require('insert-css')(require('./main.css'));

var Vue = require('vue');
var PouchDB = require('pouchdb');

var db = new PouchDB('http://localhost:5984/blueink');


Vue.component('ui-blueink', {
  data: {
    content: {
      types: []
    }
  },
  created: function() {
    var self = this;
    db.query('blueink/by_type?group=true',
      function(err, response) {
        self.content.types = response.rows;
      });
  },
  template: '\
    <menu-pages></menu-pages>\
    <menu-content v-with="types: content.types"></menu-content>',
  components: {
    'menu-pages': require('./menu-pages'),
    'menu-content': require('./menu-content')
  }
});

window.BlueInk = new Vue({
  el: 'body'
});
