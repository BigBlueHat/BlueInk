function(doc) {
  if ('type' in doc && 'title' in doc
      && doc.type !== 'page' && doc.type !== 'site') {
    emit(doc.type, doc.title);
  }
}
