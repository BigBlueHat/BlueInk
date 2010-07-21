/*
Shameless port of a shameless port
@defunkt => @janl => @aq
 
See http://github.com/defunkt/mustache for more info.
*/
 
;(function($) {

/*
  Shamless port of http://github.com/defunkt/mustache
  by Jan Lehnardt <jan@apache.org>, Alexander Lang <alex@upstream-berlin.com>,
     Sebastian Cohnen <sebastian.cohnen@googlemail.com>

  Thanks @defunkt for the awesome code.
  
  See http://github.com/defunkt/mustache for more info.
*/

var Mustache = function() {
  var Renderer = function() {};

  Renderer.prototype = {
    otag: "{{",
    ctag: "}}",
    pragmas: {},

    render: function(template, context, partials) {
      // fail fast
      if(template.indexOf(this.otag) == -1) {
        return template;
      }

      template = this.render_pragmas(template);
      var html = this.render_section(template, context, partials);
      return this.render_tags(html, context, partials);
    },

    /*
      Looks for %PRAGMAS
    */
    render_pragmas: function(template) {
      // no pragmas
      if(template.indexOf(this.otag + "%") == -1) {
        return template;
      }

      var that = this;
      var regex = new RegExp(this.otag + "%(.+)" + this.ctag);
      return template.replace(regex, function(match, pragma) {
        that.pragmas[pragma] = true;
        return "";
        // ignore unknown pragmas silently
      });
    },

    /* 
      Tries to find a partial in the global scope and render it
    */
    render_partial: function(name, context, partials) {
      if(typeof(context[name]) != "object") {
        throw({message: "subcontext for '" + name + "' is not an object"});
      }
      if(!partials || !partials[name]) {
        throw({message: "unknown_partial"});
      }
      return this.render(partials[name], context[name], partials);
    },

    /*
      Renders boolean and enumerable sections
    */
    render_section: function(template, context, partials) {
      if(template.indexOf(this.otag + "#") == -1) {
        return template;
      }
      var that = this;
      // CSW - Added "+?" so it finds the tighest bound, not the widest
      var regex = new RegExp(this.otag + "\\#(.+)" + this.ctag +
              "\\s*([\\s\\S]+?)" + this.otag + "\\/\\1" + this.ctag + "\\s*", "mg");

      // for each {{#foo}}{{/foo}} section do...
      return template.replace(regex, function(match, name, content) {
        var value = that.find(name, context);
        if(that.is_array(value)) { // Enumerable, Let's loop!
          return that.map(value, function(row) {
            return that.render(content, that.merge(context,
                    that.create_context(row)), partials);
          }).join('');
        } else if(value) { // boolean section
          return that.render(content, context, partials);
        } else {
          return "";
        }
      });
    },

    /*
      Replace {{foo}} and friends with values from our view
    */
    render_tags: function(template, context, partials) {
      var lines = template.split("\n");

      var new_regex = function() {
        return new RegExp(that.otag + "(=|!|>|\\{|%)?([^\/#]+?)\\1?" +
          that.ctag + "+", "g");
      };

      // tit for tat
      var that = this;

      var regex = new_regex();
      for (var i=0; i < lines.length; i++) {
        lines[i] = lines[i].replace(regex, function (match,operator,name) {
          switch(operator) {
            case "!": // ignore comments
              return match;
            case "=": // set new delimiters, rebuild the replace regexp
              that.set_delimiters(name);
              regex = new_regex();
              // redo the line in order to get tags with the new delimiters 
              // on the same line
              i--;
              return "";
            case ">": // render partial
              return that.render_partial(name, context, partials);
            case "{": // the triple mustache is unescaped
              return that.find(name, context);
              return "";
            default: // escape the value
              return that.escape(that.find(name, context));
          }
        },this);
      };
      return lines.join("\n");
    },

    set_delimiters: function(delimiters) {
      var dels = delimiters.split(" ");
      this.otag = this.escape_regex(dels[0]);
      this.ctag = this.escape_regex(dels[1]);
    },

    escape_regex: function(text) {
      // thank you Simon Willison
      if(!arguments.callee.sRE) {
        var specials = [
          '/', '.', '*', '+', '?', '|',
          '(', ')', '[', ']', '{', '}', '\\'
        ];
        arguments.callee.sRE = new RegExp(
          '(\\' + specials.join('|\\') + ')', 'g'
        );
      }
    return text.replace(arguments.callee.sRE, '\\$1');
    },

    /*
      find `name` in current `context`. That is find me a value 
      from the view object
    */
    find: function(name, context) {
      name = this.trim(name);
      if(typeof context[name] === "function") {
        return context[name].apply(context);
      }
      if(context[name] !== undefined) {
        return context[name];
      }
      // silently ignore unkown variables
      return "";
    },

    // Utility methods

    /*
      Does away with nasty characters
    */
    escape: function(s) {
      return s.toString().replace(/[&"<>\\]/g, function(s) {
        switch(s) {
          case "&": return "&amp;";
          case "\\": return "\\\\";;
          case '"': return '\"';;
          case "<": return "&lt;";
          case ">": return "&gt;";
          default: return s;
        }
      });
    },

    /*
      Merges all properties of object `b` into object `a`.
      `b.property` overwrites a.property`
    */
    merge: function(a, b) {
      var _new = {};
      for(var name in a) {
        if(a.hasOwnProperty(name)) {
          _new[name] = a[name];
        }
      };
      for(var name in b) {
        if(b.hasOwnProperty(name)) {
          _new[name] = b[name];
        }
      };
      return _new;
    },

    // by @langalex, support for arrays of strings
    create_context: function(_context) {
      if(this.is_object(_context)) {
        return _context;
      } else if(this.pragmas["JSTACHE-ENABLE-STRING-ARRAYS"]) {
        return {'.': _context};
      }
    },

    is_object: function(a) {
      return a && typeof a == 'object'
    },

    /*
      Thanks Doug Crockford
      JavaScript — The Good Parts lists an alternative that works better with
      frames. Frames can suck it, we use the simple version.
    */
    is_array: function(a) {
      return (a &&
        typeof a === 'object' &&
        a.constructor === Array);
    },

    /*
      Gets rid of leading and trailing whitespace
    */
    trim: function(s) {
      return s.replace(/^\s*|\s*$/g, '');
    },

    /*
      Why, why, why? Because IE. Cry, cry cry.
    */  
    map: function(array, fn) {
      if (typeof array.map == "function") {
        return array.map(fn)
      } else {
        var r = [];
        var l = array.length;
        for(i=0;i<l;i++) {
          r.push(fn(array[i]));
        }
        return r;
      }
    }
  };

  return({
    name: "mustache.js",
    version: "0.2",

    /*
      Turns a template and view into HTML
    */
    to_html: function(template, view, partials) {
      return new Renderer().render(template, view, partials);
    },
    escape : function(text) {
      return new Renderer().escape(text);
    }
  });
}();

  $.mustache = function(template, view, partials) {
    return Mustache.to_html(template, view, partials);
  };
  $.mustache.escape = function(text) {
    return Mustache.escape(text);
  };

})(jQuery);
