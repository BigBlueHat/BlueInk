function(head, req) {
  var ddoc = this,
      templates = {},
      Handlebars = require("lib/handlebars"),
      array_replace_recursive = require("lib/array_replace_recursive").array_replace_recursive,
      dateToArray = require("lib/dateToArray").dateToArray,
      row,
      url;

  if (!req.query && !req.query.include_docs) {
    send('Please add include_docs to make this thing work');
  }

  var page = {items:[],copyright:'BigBlueHat'},
      posts = [],
      navigation = [],
      is_post = false;
  while(row = getRow()) {
    var last = row.key.pop(),
        is_collection = false,
        is_post = false;
    if (last == '_collection') {
      is_collection = true;
      last = row.key.pop();
    } else if (last == 'post') {
      is_post = true;
      last = row.key.pop();
    }
    var secondtolast = row.key.pop();
    // dump the extra dividing ""; it's only there for visual parsing
    var _ = row.key.pop();
    // it's the page
    if (secondtolast == '_' && last == '_') {
      page.url = url = row.key.join('/');
      if (row.doc.display_title !== false) {
        page.title = row.doc.title;
      }
    } else if (secondtolast == '' && last == 'site') {
      page.site = row.doc;
    } else if (secondtolast == '' && last == 'sitemap') {
      page.sitemap = row.doc.urls;
    } else if (secondtolast == '' && last == 'template') {
      page.template = row.doc._id;
      templates = row.doc.templates;
    } else if (secondtolast == '' && last == 'template_override') {
      page.template = row.doc._id;
      templates = array_replace_recursive(templates, row.doc.templates);
    } else {
      var partial_names = Object.keys(templates.partials);
      for (var i = 0; i < partial_names.length; i++) {
        Handlebars.registerPartial(partial_names[i],
          templates.partials[partial_names[i]]);
      }

      // TODO: base template selection off type
      if (!page.items[secondtolast]) {
        page.items[secondtolast] = {'area':[]};
      }
      if (row.doc.type) {
        if (row.doc.type === 'navigation') {
          navigation.push(page.items[secondtolast].area[last] = row);
        } else {
          var doc = row.doc;
          doc.base_url = page.url;
          // display settings
          if (row.value.display_title === false) {
            doc.title = "";
          }
          if (is_collection) {
            // general collection info handling
            if (page.items[secondtolast].area[last] === undefined) {
              page.items[secondtolast].area[last] = {'collection':row.value['_collection'],
                                                    'posts': []};
            }
          } else if (is_post) {
            var post_template = templates.types[row.doc.type][page.items[secondtolast].area[last].collection.template_type] || templates.types[row.doc.type];
            // collection item handling
            page.items[secondtolast].area[last].posts
              .push({'item':Handlebars.compile(post_template)(doc),
                     'published_date': dateToArray(row.value.published_date, 3).join('/')});
          } else {
            // non-post item
            var item_template = templates.types[row.doc.type]['default'] || templates.types[row.doc.type];
            page.items[secondtolast].area[last] = {'item':Handlebars.compile(item_template)(doc)};
          }
        }
      }
      // TODO: fix .first assignment
      if (secondtolast === 0) {
        page.items[secondtolast].classes = ['first'];
      }
    }
    is_post = false;
  } // end while

  // find navigation items and generate their content
  page.items.forEach(function(area, area_idx) {
    area.area.forEach(function(item, idx) {
      if (item.doc && item.doc.type && item.doc.type == 'navigation') {
        var nav_item = item,
            nav = {'sitemap':{}};

        if (nav_item.doc.show_only && nav_item.doc.show_only == 'children') {
          // TODO: this needs to be recursive
          page.sitemap.forEach(function(el) {
            if (el.body.url == nav_item.doc.current_url && el.children) {
              navigation.sitemap = el.children;
            }
          });
        } else {
          navigation.sitemap = page.sitemap;
        }

        page.items[area_idx].area[idx] = {'item':Handlebars.compile(templates.types['navigation'])(navigation)};
      }
    });
  });
  page.site.host = req.headers.Host;
  //page.req = JSON.stringify(req);
  if (req.userCtx.name !== null) {
    // someone is logged in
    // TODO: (re)think through user object stuff
    page.user = {
      username: req.userCtx.name,
      roles: req.userCtx.roles
    };
  } else {
    // anonymous site visitor
    page.user = false;
  }

  provides('json', function() {
    send(JSON.stringify(page));
  });

  provides('html',
    function() {
      start({
        'headers': {
          'Content-Type': 'text/html'
        }
      });
      return Handlebars.compile(templates.page)(page);
    }
  );
}
