function(doc) {
  var doc_id = doc._id.split('|');
  if (doc_id[0] === 'schema') {
    emit(doc_id[1], 1);
  }
}
