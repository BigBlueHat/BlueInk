/**
 * Output ["type", "key"] for all top-level keys in a document which has a type
 * field.
 **/
/**
 * Output ["type", "key"] for all top-level keys in a document which has a type
 * field.
 **/
function(doc) {
  if ('type' in doc) {
    var keys = Object.keys(doc);
    keys.forEach(function(key) {
      if (typeof doc[key] !== 'object' && key.substr(0,1) !== '_') {
        if (typeof doc[key] === 'string' && (doc[key] === '' || isNaN(doc[key]))) {
          // output partial string in value position for sorting only
          // TODO: strip HTML before truncating
          emit([doc.type, key, doc[key].substr(0, 5)], doc[key]);
        } else {
          var value = doc[key];
          if (!isNaN(value)) value = Number(value);
          emit([doc.type, key, value], doc[key]);
        }
      }
    });
  }
}
