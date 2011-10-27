function(doc) {
  if (doc.type !== 'page') {
    emit(doc._id, doc);
  } else if (doc.type === 'page') {
    for (var i in doc.page_items) {
      for (var id in doc.page_items[i]) {
        if (doc.page_items[i][id].posts) {
          for (var p in doc.page_items[i][id].posts) {
            emit(doc.page_items[i][id].posts[p]._id, {'published_on':doc._id}); 
          }
        } else {
          emit(doc.page_items[i][id]._id, {'published_on':doc._id});
        }
      }
    }
  }
}