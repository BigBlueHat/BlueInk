function(doc) {
  var id = doc._id.split('~');
  var components = {};
  // id contains type; check it
  if (id.length > 1 && id[0] == 'type') {
    // check for and add known component types
    if ('editor' in doc) {
      components['editor'] = id[1] + '-editor';
    }
    if ('viewer' in doc) {
      components['viewer'] = id[1] + '-viewer';
    }

    emit(id[1], {
      name: doc.name,
      components: components
    });
  }
}
