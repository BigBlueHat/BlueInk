function(doc) {
  if ('type' in doc && ('title' in doc || 'name' in doc)) {
    emit(doc.type, doc.title || doc.name);
  }
}
