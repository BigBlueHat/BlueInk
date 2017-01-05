function (sitemap, req) {
  function removeFromTree(urls, _url) {
    var url = decodeURIComponent(_url);
    // find URL in sitemap
    for (var i = 0; i < urls.length; i++) {
      if (urls[i]) {
        if ('body' in urls[i] && url === urls[i].body.url) {
          // don't remove whole tree
          if (!('children' in sitemap.urls[i])
              || sitemap.urls[i].children.length === 0) {
            // remove URL from sitemap
            urls.splice(i, 1);
          } else {
            // found the URL, but it has children, so bail.
            return false;
          }
        } else if ('children' in urls[i] && urls[i].children.length > 0) {
          removeFromTree(urls[i].children, url);
        }
      }
    }
    return urls;
  }

  // get URL from query params
  if (!('url' in req.query)) {
    return [null,
      {
        code: 400,
        json: {
          error: 'The `url` query parameter is required'
        }
      }];
  } else {
    var url = req.query.url;
    var new_sitemap = sitemap;
    var new_urls = removeFromTree(sitemap.urls, url);
    if (new_urls === false) {
      // requested URL has children, so bail.
      return [null,
        {
          code: 409,
          json: {
            // TODO: provide query param for remove whole tree's
            error: 'Cannot delete parent because children.'
          }
        }];
    } else {
      new_sitemap.urls = new_urls;
    }
    // remove _rev as it's out of date
    delete new_sitemap._rev;
    // save changed sitemap
    return [new_sitemap,
      {
        code: 200,
        json: new_sitemap
      }];
  }
}
