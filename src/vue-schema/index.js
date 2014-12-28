module.exports = {
  data: function() {
    return {
      schema: {},
      values: {}
    };
  },
  template: require('./template.html'),
  components: {
    'json-schema-property': {
      template: require('./property-template.html'),
      methods: {
        getValue: function() {
          if (this.$parent.$key == undefined) {
            return this.$parent.values[this.$key];
          } else if (this.$parent.$parent.values
              && this.$parent.$parent.values[this.$parent.$key]
              && this.$parent.$parent.values[this.$parent.$key][this.$key]) {
            // TODO: make this recursive
            return this.$parent.$parent.values[this.$parent.$key][this.$key];
          }
        }
      }
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
      return accumulate(json, jsonDOM);
    },
    outputString: function() {
      return JSON.stringify(this.output());
    }
  }
};
