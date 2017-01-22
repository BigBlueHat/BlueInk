var Sortable = require('sortablejs');

var blank_doc = {
  urls: [
    {
      body: {
        url: '',
        nav_label: '',
        is_collection: false,
        hide_page_from_nav: false
      },
      children: []
    }
  ],
  type: 'sitemap'
};

BlueInk.component('sitemap-viewer', {
  template: require('./viewer.html'),
  replace: true,
  data: function() {
    return {
      data: blank_doc
    };
  },
  components: {
    'sitemap-page': {
      template: require('./sitemap-page.html'),
      replace: true,
      data: function() {
        return {
          body: {
            nav_label: '',
            url: ''
          },
          children: []
        };
      }
    }
  }
});

BlueInk.component('sitemap-editor', {
  template: require('./editor.html'),
  replace: true,
  data: function() {
    return {
      doc: blank_doc
    }
  },
  methods: {
    output: function() {
      this.doc.type = 'sitemap';
      return this.doc;
    }
  },
  directives: {
    sortable: {
      twoWay: true,
      bind: function() {
        var self = this;
        this._sortable = Sortable.create(this.el, {
          onUpdate: function(e) {
            console.log(self.vm.$data);
            var list = self._list;
            list.splice(e.newIndex, 0, list.splice(e.oldIndex, 1)[0]);
            self.set(list);
          }
        });
      },
      update: function(new_value, old_value) {
        // make sure internal state is always the latest set from upstream
        this._list = new_value;
      },
      unbind: function() {
        this._sortable.destroy();
      }
    }
  },
  // TODO: currently same as above...
  components: {
    'sortable-sitemap-page': {
      template: require('./sortable-sitemap-page.html'),
      replace: true,
      data: function() {
        return {
          body: {
            nav_label: '',
            url: ''
          },
          children: []
        };
      },
    }
  }
});
