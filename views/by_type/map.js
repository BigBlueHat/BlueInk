function(doc) {
  if ('type' in doc && 'title' in doc) {
    emit(doc.type, doc.title);
  }
}
