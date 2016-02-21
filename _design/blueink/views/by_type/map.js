function(doc) {
  if ('type' in doc) {
    if ('title' in doc || 'name' in doc) {
      emit(doc.type, doc.title || doc.name);
    } else if ('self' in doc._attachments
        && doc._attachments['self'].content_type.substr(0, 6) === 'image/') {
      // image types don't have titles, so generate their src's
      emit(doc.type, '_blueink/' + doc._id + '/self');
    }
  }
}
