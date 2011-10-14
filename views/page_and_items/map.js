function(doc) {
  // TODO: can we put this someplace "global" like a site-wide setting?
  var max_posts = 10,
      urlParts, i, n, post, post_count, posts;

  function sortByPublishedDate(a, b) {
    var ad = new Number(a.published_date.join('')),
        bd = new Number(b.published_date.join(''));
    if (ad < bd) {
      return 1;
    } else {
      return -1;
    }
    return 0;
  }

  if (doc.type == 'page') {
    urlParts = doc.url.split('/');
    for (i in doc.page_items) {
      for (n in doc.page_items[i]) {
        if (doc.page_items[i][n].posts != undefined) {
          post_count = 0;
          posts = [];
          for (post in doc.page_items[i][n].posts) {
            if (post_count == max_posts) {
              break;
            }
            posts.push(doc.page_items[i][n].posts[post]);
            post_count++;
          }
          posts.sort(sortByPublishedDate);
          posts.forEach(function(post) {
            emit(urlParts.concat(i, n, 'post'), post);
          });
          post_count = 0; // in case posts exist in other areas
        } else {
          emit(urlParts.concat(i, n), doc.page_items[i][n]);
        }
      }
    }
    emit(urlParts.concat('_', '_'), {'_id': doc._id});
    if (doc.template) {
      emit(urlParts.concat('', 'template'), {'_id':doc.template});
    }
    emit(urlParts.concat('', 'site'), {'_id':'site'});
    emit(urlParts.concat('', 'sitemap'), {'_id':'sitemap'});
  }
}
