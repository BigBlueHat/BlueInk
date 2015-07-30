function(doc) {
  var urlParts = doc._id.split('/');

  var emit_meta = function(urlParts, template) {
    emit(urlParts.concat('', '', 'site'), {'_id':'site'});
    emit(urlParts.concat('', '', 'sitemap'), {'_id':'sitemap'});
    // always include the default template doc as a foundation
    emit(urlParts.concat('', '', 'template'), {'_id':'template~default'});
    if (template) {
      emit(urlParts.concat('', '', 'template_override'), {'_id': template});
    }
  };

  if (doc.type === 'redirect' && 'url' in doc) {
    emit(urlParts.concat('', '', 'redirect'), {'url': doc.url});
  }
  else
  if (doc.type === 'page') {
    for (var i in doc.page_items) {
      for (var n in doc.page_items[i]) {
        if ('_collection' in doc.page_items[i][n]) {
          emit(urlParts.concat('', i, n, '_collection'),
               doc.page_items[i][n]);

          doc.collection.forEach(function(item, idx) {
            emit(urlParts.concat('', i, n, 'item', idx), item);
            // emit item id as child URL of the collection page
            emit_meta(urlParts.concat(item._id));
            // emit collection page as the "page"
            emit(urlParts.concat(item._id, '', '_', '_'),
                 {'_id': doc._id});
            // and the actual item as the only item on the page
            emit(urlParts.concat(item._id, '', '0', '0'),
                 {'_id': item._id});
          });
        } else {
          emit(urlParts.concat('', i, n), doc.page_items[i][n]);
        }
      }
    }
    emit(urlParts.concat('', '_', '_'), {'_id': doc._id});
    emit_meta(urlParts, doc.template);
  }
}
