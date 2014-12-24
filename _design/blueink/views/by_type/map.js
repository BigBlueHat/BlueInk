function(doc) {
  if ('type' in doc && ('title' in doc || 'name' in doc)
      && doc.type !== 'page' && doc.type !== 'site'
      && doc.type !== 'template') {
    emit(doc.type, doc.title);
  }
}
