function(doc) {
  var id = doc._id.split('~');
  var components = {};
  // id contains type; check it
  if (id.length > 1 && id[0] == 'type') {
    // check for and add known component types
    if ('editor' in doc) {
      components['editor'] = id[1] + '-editor';
    }
    if (Object.keys(components).length > 0) {
      emit(id[1], {
        name: doc.name,
        components: components
      });
    }
  }
}
