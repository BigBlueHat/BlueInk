module.exports = {
  data: function() {
    return {
      schema: {}
    };
  },
  template: require('./template.html'),
  components: {
    'json-schema-property': {
      template: require('./property-template.html')
    }
  },
  filters: {
    input_type: function(value) {
      var types = {
          string: 'text',
          integer: 'number'
      }
      return types[value];
    }
  },
  methods: {
    output: function() {
      var jsonDOM = this.$el.querySelectorAll('[data-json]');
      var json = {};
      function accumulate(obj, dom) {
        for (var i = 0; i < dom.length; i++) {
          if (dom[i].dataset['json'] == 'kvp') {
            obj[dom[i].querySelector('label').textContent] = dom[i].querySelector('input').value;
          } else if (dom[i].dataset['json'] == 'object') {
            var legend = dom[i].querySelector('legend').textContent;
            var sub_dom = dom[i].querySelectorAll('[data-json]');
            obj[legend] = accumulate({}, sub_dom);
            i += sub_dom.length;
          }
        }
        return obj;
      }
      return JSON.stringify(accumulate(json, jsonDOM), null, "\t");
    }
  }
};
