function(doc) {
  if (doc.created) {
    emit(doc.created, 1);
  }
};
