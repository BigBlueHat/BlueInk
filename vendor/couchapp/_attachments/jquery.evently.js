// $$ inspired by @wycats: http://yehudakatz.com/2009/04/20/evented-programming-with-jquery/
function $$(node) {
  var data = $(node).data("$$");
  if (data) {
    return data;
  } else {
    data = {};
    $(node).data("$$", data);
    return data;
  }
};

(function($) {
  // utility functions used in the implementation
  
  function forIn(obj, fun) {
    var name;
    for (name in obj) {
      if (obj.hasOwnProperty(name)) {
        fun(name, obj[name]);
      }
    }
  };
  $.forIn = forIn;
  function funViaString(fun) {
    if (fun && fun.match && fun.match(/function/)) {
      eval("var f = "+fun);
      if (typeof f == "function") {
        return function() {
          try {
            return f.apply(this, arguments);
          } catch(e) {
            // IF YOU SEE AN ERROR HERE IT HAPPENED WHEN WE TRIED TO RUN YOUR FUNCTION
            // $.log({"message": "Error in evently function.", "error": e, "src" : fun});
            throw(e);
          }
        };
      }
    }
    return fun;
  };
  
  function runIfFun(me, fun, args) {
    // if the field is a function, call it, bound to the widget
    var f = funViaString(fun);
    if (typeof f == "function") {
      return f.apply(me, args);
    } else {
      return fun;
    }
  }

  $.evently = {
    connect : function(source, target, events) {
      events.forEach(function(ev) {
        $(source).bind(ev, function() {
          var args = $.makeArray(arguments);
          // remove the original event to keep from stacking args extra deep
          // it would be nice if jquery had a way to pass the original
          // event to the trigger method.
          args.shift();
          $(target).trigger(ev, args);
          return false;
        });
      });
    },
    paths : [],
    changesDBs : {}
  };
  
  function extractFrom(name, evs) {
    return evs[name];
  };

  function extractEvents(name, ddoc) {
    // extract events from ddoc.evently and ddoc.vendor.*.evently
    var events = [true, {}];
    $.forIn(ddoc.vendor, function(k, v) {
      if (v.evently && v.evently[name]) {
        events.push(v.evently[name]);
      }
    });
    if (ddoc.evently[name]) {events.push(ddoc.evently[name]);}
    return $.extend.apply(null, events);
  }

  $.fn.evently = function(events, app, args) {
    var elem = $(this);
    // store the app on the element for later use
    if (app) {
      $$(elem).app = app;      
    }

    if (typeof events == "string") {
      events = extractEvents(events, app.ddoc);
    }

    $$(elem).evently = events;
    // setup the handlers onto elem
    forIn(events, function(name, h) {
      eventlyHandler(elem, name, h, args);
    });
    
    if (events._init) {
      $.log("ev _init", elem);
      elem.trigger("_init", args);
    }
    
    if (app && events._changes) {
      $("body").bind("evently.changes."+app.db.name, function() {
        // we want to unbind this function when the element is deleted.
        // maybe jquery 1.4.2 has this covered?
        $.log('changes', elem);
        elem.trigger("_changes");        
      });
      followChanges(app);
      elem.trigger("_changes");
    }
  };
  
  // eventlyHandler applies the user's handler (h) to the 
  // elem, bound to trigger based on name.
  function eventlyHandler(elem, name, h, args) {
    if (h.path) {
      elem.pathbinder(name, h.path);
    }
    var f = funViaString(h);
    if (typeof f == "function") {
      elem.bind(name, {args:args}, f); 
    } else if (typeof f == "string") {
      elem.bind(name, {args:args}, function() {
        $(this).trigger(f, arguments);
        return false;
      });
    } else if ($.isArray(h)) { 
      // handle arrays recursively
      for (var i=0; i < h.length; i++) {
        eventlyHandler(elem, name, h[i], args);
      }
    } else {
      // an object is using the evently / mustache template system
      if (h.fun) {
        elem.bind(name, {args:args}, funViaString(h.fun));
      }
      // templates, selectors, etc are intepreted
      // when our named event is triggered.
      elem.bind(name, {args:args}, function() {
        renderElement($(this), h, arguments);
        return false;
      });
    }
  };
  
  $.fn.replace = function(elem) {
    $.log("Replace", this)
    $(this).empty().append(elem);
  };
  
  // todo: ability to call this
  // to render and "prepend/append/etc" a new element to the host element (me)
  // as well as call this in a way that replaces the host elements content
  // this would be easy if there is a simple way to get at the element we just appended
  // (as html) so that we can attache the selectors
  function renderElement(me, h, args, qrun, arun) {
    // if there's a query object we run the query,
    // and then call the data function with the response.
    if (h.async && !arun) {
      runAsync(me, h, args)
    } else if (h.query && !qrun) {
      // $.log("query before renderElement", arguments)
      runQuery(me, h, args)
    } else {
      // $.log("renderElement")
      // $.log(me, h, args, qrun)
      // otherwise we just render the template with the current args
      var selectors = runIfFun(me, h.selectors, args);
      var act = h.render || "replace";
      var app = $$(me).app;
      if (h.mustache) {
        $.log("rendering", h.mustache)
        var newElem = mustachioed(me, h, args);
        me[act](newElem);
      }
      if (selectors) {
        if (act == "replace") {
          var s = me;
        } else {
          var s = newElem;
        }
        forIn(selectors, function(selector, handlers) {
          // $.log("selector", selector);
          // $.log("selected", $(selector, s));
          $(selector, s).evently(handlers, app, args);
          // $.log("applied", selector);
        });
      }
      if (h.after) {
        funViaString(h.after).apply(me, args);
      }
    }    
  };
  
  // todo this should return the new element
  function mustachioed(me, h, args) {
    return $($.mustache(
      runIfFun(me, h.mustache, args),
      runIfFun(me, h.data, args), 
      runIfFun(me, h.partials, args)));
  };
  
  function runAsync(me, h, args) {  
    // the callback is the first argument
    funViaString(h.async).apply(me, [function() {
      renderElement(me, h, 
        $.argsToArray(arguments).concat($.argsToArray(args)), false, true);
    }].concat($.argsToArray(args)));
  };
  
  
  function runQuery(me, h, args) {
    // $.log("runQuery: args", args)
    var app = $$(me).app;
    var qu = runIfFun(me, h.query, args);
    var qType = qu.type;
    var viewName = qu.view;
    var userSuccess = qu.success;
    // $.log("qType", qType)
    
    var q = {};
    forIn(qu, function(k, v) {
      q[k] = v;
    });
    
    if (qType == "newRows") {
      q.success = function(resp) {
        $.log("runQuery newRows success", resp.rows.length, me, resp)
        resp.rows.reverse().forEach(function(row) {
          renderElement(me, h, [row].concat($.argsToArray(args)), true)
        });
        if (userSuccess) userSuccess(resp);
      };
      newRows(me, app, viewName, q);
    } else {
      q.success = function(resp) {
        // $.log("runQuery success", resp)
        renderElement(me, h, [resp].concat($.argsToArray(args)), true);
        userSuccess && userSuccess(resp);
      };
      $.log(app)
      app.view(viewName, q);      
    }
  }
  
  // this is for the items handler
  // var lastViewId, highKey, inFlight;
  // this needs to key per elem
  function newRows(elem, app, view, opts) {
    // $.log("newRows", arguments);
    // on success we'll set the top key
    var thisViewId, successCallback = opts.success, full = false;
    function successFun(resp) {
      // $.log("newRows success", resp)
      $$(elem).inFlight = false;
      var JSONhighKey = JSON.stringify($$(elem).highKey);
      resp.rows = resp.rows.filter(function(r) {
        return JSON.stringify(r.key) != JSONhighKey;
      });
      if (resp.rows.length > 0) {
        if (opts.descending) {
          $$(elem).highKey = resp.rows[0].key;
        } else {
          $$(elem).highKey = resp.rows[resp.rows.length -1].key;
        }
      };
      if (successCallback) {successCallback(resp, full)};
    };
    opts.success = successFun;
    
    if (opts.descending) {
      thisViewId = view + (opts.startkey ? JSON.stringify(opts.startkey) : "");
    } else {
      thisViewId = view + (opts.endkey ? JSON.stringify(opts.endkey) : "");
    }
    // $.log(["thisViewId",thisViewId])
    // for query we'll set keys
    if (thisViewId == $$(elem).lastViewId) {
      // we only want the rows newer than changesKey
      var hk = $$(elem).highKey;
      if (hk !== undefined) {
        if (opts.descending) {
          opts.endkey = hk;
          // opts.inclusive_end = false;
        } else {
          opts.startkey = hk;
        }
      }
      // $.log("add view rows", opts)
      if (!$$(elem).inFlight) {
        $$(elem).inFlight = true;
        app.view(view, opts);
      }
    } else {
      // full refresh
      // $.log("new view stuff")
      full = true;
      $$(elem).lastViewId = thisViewId;
      $$(elem).highKey = undefined;
      $$(elem).inFlight = true;
      app.view(view, opts);
    }
  };
  
  // only start one changes listener per db
  function followChanges(app) {
    var dbName = app.db.name;
    if (!$.evently.changesDBs[dbName]) {
      connectToChanges(app, function() {
        $("body").trigger("evently.changes."+dbName);
      });
      $.evently.changesDBs[dbName] = true;
    }
  }
  
  function connectToChanges(app, fun) {
    function resetHXR(x) {
      x.abort();
      connectToChanges(app, fun);    
    };
    app.db.info({success: function(db_info) {  
      var c_xhr = jQuery.ajaxSettings.xhr();
      c_xhr.open("GET", app.db.uri+"_changes?feed=continuous&since="+db_info.update_seq, true);
      c_xhr.send("");
      // todo use a timeout to prevent rapid triggers
      var t;
      c_xhr.onreadystatechange = function() {
        clearTimeout(t);
        t = setTimeout(fun, 100);
      };
      setTimeout(function() {
        resetHXR(c_xhr);      
      }, 1000 * 60);
    }});
  };
  
})(jQuery);
