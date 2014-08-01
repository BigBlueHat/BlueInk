function(doc) {
  if (doc.type === 'page') {
    emit(doc._id.split('/'), doc.nav_label);
  }
}
