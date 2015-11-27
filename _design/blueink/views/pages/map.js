function(doc) {
  if (doc.type === 'page') {
    emit(doc._id.split('/'),
         {
           nav_label: doc.nav_label,
           is_collection: ('collection' in doc && doc.collection.length > 0)
         });
  }
}
