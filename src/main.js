require('insert-css')(require('./semantic-ui/semantic.css'));
require('insert-css')(require('./main.css'));

var Vue = require('vue');
Vue.config.debug = true;
var PouchDB = require('./pouchdb.js');

var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);


Vue.component('ui-blueink', {
  ready: function() {
    document.body.style.top = this.$el.clientHeight + 'px';
  },
  replace: true,
  template: '\
    <ui-blueink class="ui fixed transparent inverted main menu">\
        <menu-pages></menu-pages>\
        <menu-content></menu-content>\
    </ui-blueink>',
  components: {
    'menu-pages': require('./menu-pages'),
    'menu-content': require('./menu-content')
  }
});

window.BlueInk = new Vue({
  el: 'body'
});
