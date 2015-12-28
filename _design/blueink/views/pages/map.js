function(doc) {
  if (doc.type === 'page') {

    var is_collection = false;
    if ('collection' in doc) {
      if (doc.collection.length > 0) {
        // old collection style
        is_collection = true;
      } else if ('items' in doc.collection
          && doc.collection.items.length > 0) {
        // new collection style
        is_collection = true;
      }
    }

    emit(doc._id.split('/'), {
      is_collection: is_collection,
      nav_label: doc.nav_label,
      redirect: doc.redirect
    });
  }
}
