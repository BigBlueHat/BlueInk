function(doc) {
  // TODO: can we put this someplace "global" like a site-wide setting?
  var max_posts = 10,
      urlParts, i, n, post, post_count, posts;

  function sortByPublishedDate(a, b) {
    // TODO: enforce published_date as timestamp in validate
    var ad = new Number(a.published_date),
        bd = new Number(b.published_date);
    if (ad < bd) {
      return 1;
    } else {
      return -1;
    }
    return 0;
  }

  if (doc.type == 'page') {
    urlParts = doc._id.split('/');
    for (i in doc.page_items) {
      for (n in doc.page_items[i]) {
        if ('_collection' in doc.page_items[i][n]) {
          emit(urlParts.concat('', i, n, '_collection'), doc.page_items[i][n]);
          post_count = 0;
          // TODO: do we need this? Can we trust the 'posts' array to be pre-sorted?
          // TODO: this is currently only sorting the "max_posts" (the ones displayed)
          // TODO: doc.posts will need cloning to posts before this will work
          //posts.sort(sortByPublishedDate);
          // TODO: switch this to use JSON Pointer library
          for (post in doc[doc.page_items[i][n]['_collection']['$ref'].substr(2)]) {
            emit(urlParts.concat('', i, n, 'post'),
                doc[doc.page_items[i][n]['_collection']['$ref'].substr(2)][post]);
            if (post_count == max_posts) break;
            else post_count++;
          };
          post_count = 0; // in case posts exist in other areas
        } else {
          emit(urlParts.concat('', i, n), doc.page_items[i][n]);
        }
      }
    }
    emit(urlParts.concat('', '_', '_'), {'_id': doc._id});

    emit(urlParts.concat('', '', 'site'), {'_id':'site'});
    emit(urlParts.concat('', '', 'sitemap'), {'_id':'sitemap'});
    // always include the default template doc as a foundation
    emit(urlParts.concat('', '', 'template'), {'_id':'template~default'});
    if (doc.template) {
      emit(urlParts.concat('', '', 'template_override'), {'_id':doc.template});
    }
  }
}
