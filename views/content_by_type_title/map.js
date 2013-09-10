function (doc) {
  var moment = require('views/lib/moment');
  if ('type' in doc && doc.type !== 'page' && 'title' in doc) {
    emit([doc.type, doc.title],
        {'_id': doc._id, 'title': doc.title});
  }
}
