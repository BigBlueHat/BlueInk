function (doc) {
  var moment = require('views/lib/moment');
  var date = null;
  if ('type' in doc && doc.type !== 'page' && 'created' in doc) {
    emit([doc.type].concat(moment(doc.created).toArray()),
        {'_id': doc._id, 'title': doc.title});
  }
}
