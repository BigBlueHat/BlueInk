function(doc) {
  var urlParts, i, n, post, posts, collection_key;

  var emit_meta = function(urlParts, template) {
    emit(urlParts.concat('', '', 'site'), {'_id':'site'});
    emit(urlParts.concat('', '', 'sitemap'), {'_id':'sitemap'});
    // always include the default template doc as a foundation
    emit(urlParts.concat('', '', 'template'), {'_id':'template~default'});
    if (template) {
      emit(urlParts.concat('', '', 'template_override'), {'_id': template});
    }
  };

  if (doc.type == 'page') {
    urlParts = doc._id.split('/');
    for (i in doc.page_items) {
      for (n in doc.page_items[i]) {
        if ('_collection' in doc.page_items[i][n]) {
          emit(urlParts.concat('', i, n, '_collection'), doc.page_items[i][n]);
          // TODO: switch this to use JSON Pointer library
          collection_key = doc.page_items[i][n]['_collection']['$ref'].substr(2)
          for (post in doc[collection_key]) {
            emit(urlParts.concat('', i, n, 'post'),
                doc[collection_key][post]);
            // emit post id as child URL of the collection page
            emit_meta(urlParts.concat(doc[collection_key][post]['_id']));
            // emit collection page as the "page"
            emit(urlParts.concat(doc[collection_key][post]['_id'], '', '_', '_'), {'_id': doc._id});
            // and the actual item as the only item on the page
            emit(urlParts.concat(doc[collection_key][post]['_id'], '', '0', '0'),
                {'_id': doc[collection_key][post]['_id']});
          }
        } else {
          emit(urlParts.concat('', i, n), doc.page_items[i][n]);
        }
      }
    }
    emit(urlParts.concat('', '_', '_'), {'_id': doc._id});
    emit_meta(urlParts, doc.template);
  }
}
