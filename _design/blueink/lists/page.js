function(head, req) {
  var ddoc = this;
  var templates = {};
  var Handlebars = require("lib/handlebars");
  Handlebars.registerHelper('compare', require("lib/handlebars.compare").compare);
  Handlebars.registerHelper('toJSON', function(object) {
    // From: http://zshawnsyed.com/2015/04/30/output-json-in-handlebars/
    return new Handlebars.SafeString(JSON.stringify(object));
  });
  var array_replace_recursive = require("lib/array_replace_recursive").array_replace_recursive;
  var dateToArray = require("lib/dateToArray").dateToArray;
  var row;
  var flatten = require('lib/lodash-flatten');
  var filter = require('lib/lodash-filter');

  // sort of require include_docs
  // TODO: ...should throw a proper error here
  if (!req.query && !req.query.include_docs) {
    send('Please add include_docs to make this thing work');
  }

  // reusable bits
  function populatePartials() {
    var partial_names;
    // if we have partials defined in the templates
    if (undefined !== templates.partials) {
      partial_names = Object.keys(templates.partials);
      for (var i = 0; i < partial_names.length; i++) {
        // tell Handlebars about them
        Handlebars.registerPartial(partial_names[i],
          templates.partials[partial_names[i]]);
      }
    }
  }

  function prepItem(doc, display_settings, index, template_type) {
    // TODO: handle template_type from collection
    template_type = template_type || 'default';
    var template = '';
    if (undefined !== templates.types[doc.type]) {
      if (undefined !== templates.types[doc.type][template_type]) {
        template = templates.types[doc.type][template_type];
      } else {
        template = templates.types[doc.type];
      }
    }
    var obj = {};
    var for_template = doc;
    // TODO: yeah...this is a mess >_<
    obj._blueink = for_template._blueink = display_settings || {};
    obj._blueink.index = for_template._blueink.index = index;
    // TODO: is this a unique case? or will display settings always effect data?
    if (display_settings.display_title === false) {
      delete for_template.title;
    }
    for_template._blueink = {
      base_url: output.site.url,
      page_url: output.url
    };
    // TODO: handle published_date
    obj.item = Handlebars.compile(template)(for_template);
    return obj;
  }

  function extractChildren(urls, find) {
    return flatten(filter(urls.map(function(url) {
      if (url.body.url === find) {
        return url.children;
      } else if (url.children.length > 0) {
        return extractChildren(url.children, find);
      } else {
        return false;
      }
    })));
  }

  var output = {
    url: req.query.startkey.join('/'),
    site: {},
    items:[],
    copyright: 'BigBlueHat'
  };
  var navigation = [];

  // where it all gets put together
  while(row = getRow()) {
    var item = {};
    var key = row.key;
    var value = row.value;
    var doc = row.doc;
    // pull out the "config" part of the key
    // we've already calculated the URL, so we don't need the front (grouping)
    // portion any longer.
    var obj_part = key.slice(key.indexOf("")+1);

    // TODO: handle deleted docs better--output placeholder with info
    if (doc === null) {
      continue;
    }

    switch (obj_part[1]) {
      case 'redirect':
        var url_prefix = '';
        if (req.requested_path[3] === '_rewrite') {
          url_prefix = '/' + req.requested_path.slice(0,4).join('/') + '/';
        }
        start({
          code: 302,
          headers: {
            'Content-Type': 'text/html',
            'Location': url_prefix + value.url
          }
        });
        return '';
        break;
      case 'site':
        // add the site-wide information
        output.site = doc;
        continue;
        break;
      case 'sitemap':
        // add the sitemap
        output.sitemap = doc.urls;
        continue;
        break;
      case 'template':
        // add default template stuff
        output.template = doc._id;
        templates = doc.templates;
        populatePartials();
        continue;
        break;
      case 'template_override':
        // override templates...maybe
        templates = array_replace_recursive(templates, doc.templates);
        populatePartials();
        continue;
        break;
      default:
        break;
    }
    // TODO: display settings too, yo!

    // TODO: fix map/reduce to output "page" key in the style of site, sitemap, etc.
    if (obj_part[0] === "_" && obj_part[1] === "_") {
      if (undefined === doc.display_title
          || doc.display_title === true) {
        output.title = doc.title;
      }
      // everything else...in case templaters need it
      output.page = doc;
    }

    if (obj_part[0] !== "" && obj_part[0] !== "_") {
      // we are into the area/item stuff
      area_idx = Number(obj_part[0]);
      if (undefined !== value._collection) {
        item.collection = value._collection;
        item.posts = [];
      } else {
        item = value;
      }

      if (obj_part[2] === "item") {
        // items live inside collections
        var current_collection = output.items[area_idx].area[output.items[area_idx].area.length-1].collection;
        // which can override templates
        item = prepItem(doc, value, obj_part[3], current_collection.template_type);
        output.items[area_idx].area[output.items[area_idx].area.length-1].posts.push(item);
      } else {
        if (doc.type === 'navigation') {
          item = doc;
        } else if (undefined !== value._id) {
          item = prepItem(doc, value, obj_part[1]);
        } else {
          // we've got a collection item
          item._blueink = {index: obj_part[1]};
        }
        if (undefined === output.items[area_idx]) {
          output.items[area_idx] = {area: [item]};
        } else {
          output.items[area_idx].area.push(item);
        }
      }
    }
  } // end while

  // find navigation items and generate their content
  output.items.forEach(function(area, area_idx) {
    area.area.forEach(function(item, idx) {
      // TODO: this stuff is a tangle of the past, the present, and the future
      if (item.type && item.type === 'navigation') {
        var nav_item = item;
        var navigation = item;
        navigation._blueink = {index: idx};
        navigation.sitemap = {};

        if (nav_item.show_only && nav_item.show_only == 'children') {
          navigation.sitemap = extractChildren(output.sitemap, nav_item.current_url);
        } else {
          navigation.sitemap = output.sitemap;
        }

        output.items[area_idx].area[idx] = {
          _blueink: {
            _id: item._id,
            index: idx,
            base_url: output.site.url,
            page_url: output.url
          },
          item: Handlebars.compile(templates.types['navigation'])(navigation)
        };
      }
    });
  });

  // add host domain data
  output.site.host = req.headers.Host;

  // add current user data
  if (req.userCtx.name !== null) {
    // someone is logged in
    // TODO: (re)think through user object stuff
    output.user = {
      username: req.userCtx.name,
      roles: req.userCtx.roles
    };
  } else {
    // anonymous site visitor
    output.user = false;
  }

  provides('json', function() {
    send(JSON.stringify(output, null, 4));
  });

  provides('html',
    function() {
      start({
        'headers': {
          'Content-Type': 'text/html'
        }
      });
      return Handlebars.compile(templates.page)(output);
    }
  );

}
