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
  } else if (doc.type === 'page' && 'redirect' in doc && doc.redirect !== '') {
    emit(urlParts.concat('', '', 'redirect'), {'url': doc.redirect});
  } else if (doc.type === 'page') {
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
        } else if (typeof doc.page_items[i][n]['_id'] !== 'string'
            && '$ref' in doc.page_items[i][n]['_id']
            && doc.page_items[i][n]['_id']['$ref'] === '#/collection') {
          // check for JSON Reference
          // http://tools.ietf.org/html/draft-pbryan-zyp-json-ref-03#section-3
          // value is a JSON Pointer
          // http://tools.ietf.org/html/rfc6901#section-6

          // if we've got one of these, then `collection` has all the goods
          // TODO: ...lots of work to avoid the `items` list being in the index
          var collection_meta = {
            title: doc.collection.title,
            type: doc.collection.type,
            template_type: doc.collection.template_type
          };
          emit(urlParts.concat('', i, n, '_collection'),
               {"_collection": collection_meta});

          // collections have items; loop 'em!
          doc.collection.items.forEach(function(item, idx) {
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
