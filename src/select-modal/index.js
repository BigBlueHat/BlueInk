module.exports = {
  replace: true,
  template: require('./template.html'),
  data: function() {
    return {
      type: '',
      items: [],
      // the item currently picked
      active: '',
      // the one selected at time of save()
      selected: ''
    };
  },
  watch: {
    type: function() {
      this.loadItems();
      this.active = '';
      this.selected = '';
    }
  },
  methods: {
    save: function() {
      this.selected = this.active;
      this.$destroy(true);
    },
    destroy: function() {
      this.$destroy(true);
    },
    activate: function(item) {
      // set the id
      this.active = item.id;
    },
    loadItems: function() {
      var self = this;
      // TODO: eventually add include_docs to do any doc type--or make it configurable...mabye
      var view_url = 'blueink/by_type?reduce=false&key="' + self.type + '"';

      self.$db
        .query(view_url)
        .then(function(resp) {
          self.items = resp.rows;
        })
        .catch(console.log.bind(console)
      );
    },
    resetState: function() {
      this.active = '';
      this.selected = '';
      this.items = [];
    }
  }
};
