function (sitemap, req) {
  function collectUrls(urls, _just_urls) {
    var just_urls = _just_urls || [];
    for (var i = 0; i < urls.length; i++) {
      if ('body' in urls[i]) {
        just_urls.push(urls[i].body.url);
      }
      if ('children' in urls[i]) {
        collectUrls(urls[i].children, just_urls);
      }
    }
    return just_urls;
  }

  function addToTree(urls, page) {
    // find the parent URL in the sitemap
    var url = page._id;
    // TODO: enforce this shape with validate_doc_update?
    var nav_entry = {
      body: {
        is_collection: page.is_collection || false,
        nav_label: page.nav_label,
        url: url
      },
      children: []
    };
    var parent_url = url.substr(0, url.lastIndexOf('/'));
    if (parent_url) {
      for (var i = 0; i < urls.length; i++) {
        if (parent_url === urls[i].body.url) {
          // TODO: handle hidden from nav... just don't add?
          urls[i].children.push(nav_entry);
        } else if ('children' in urls[i]) {
          addToTree(urls[i].children, page);
        }
      }
    } else {
      urls.push(nav_entry);
    }
    return urls;
  }

  if (!sitemap) {
    return [null,
      {
        code: 404,
        json: {
          error: 'Not Found',
          message: 'Sitemap Not Found'
        }
      }];
  } else {
    // TODO: test media type?
    var page = JSON.parse(req.body);
    // TODO: handle missing `urls` (or non-array `urls`) key?
    var new_sitemap = sitemap;

    var all_urls = collectUrls(sitemap.urls);
    // test that the URL is not yet in the tree
    if (all_urls.indexOf(page._id) === -1) {
      new_sitemap.urls = addToTree(sitemap.urls, page);
      // remove the old _rev to force use of the X-Couch-Update-NewRev header
      delete new_sitemap._rev;
      // return 201 Created + new sitemap
      return [new_sitemap,
        {
          code: 201,
          json: new_sitemap
        }];
    } else {
      // the page is in the tree, so throw an error and don't change anything
      return [null,
        {
          code: 409, // it's a conflict because the data's already there
          json: {
            error: 'URL already in sitemap.'
          }
        }];
    }
  }
}
