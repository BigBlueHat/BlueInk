require('insert-css')(require('./semantic-ui/semantic.css'));
require('insert-css')(require('./main.css'));

var Vue = require('vue');
Vue.config.debug = true;
var PouchDB = require('./pouchdb.js');

var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);


Vue.component('ui-blueink', {
  data: function() {
    return {
      pages: [],
      content: {
        types: []
      }
    }
  },
  created: function() {
    var self = this;
    db.query('blueink/pages?group=true',
      function(err, response) {
        for (var i = 0; i < response.rows.length; i++) {
          self.pages.push({
            url: response.rows[i].key.join('/')
          });
        }
      });
    db.query('blueink/by_type?group=true',
      function(err, response) {
        self.content.types = response.rows;
      });
  },
  ready: function() {
    document.body.style.top = this.$el.clientHeight + 'px';
  },
  replace: true,
  template: '\
    <ui-blueink class="ui fixed transparent inverted main menu">\
        <menu-pages v-with="pages: pages"></menu-pages>\
        <menu-content v-with="types: content.types"></menu-content>\
    </ui-blueink>',
  components: {
    'menu-pages': require('./menu-pages'),
    'menu-content': require('./menu-content')
  }
});

window.BlueInk = new Vue({
  el: 'body'
});
