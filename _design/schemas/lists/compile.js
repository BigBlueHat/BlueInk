function(head, req) {
  var all_schemas = {};
  var other_schema;
  while(row = getRow()) {
    all_schemas[row.key] = row.doc;
  }

  for (var schema in all_schemas) {
    if (all_schemas[schema]['extends']) {
      other_schema = all_schemas[all_schemas[schema]['extends']];
      if (other_schema !== undefined) {
        for (var property in other_schema.properties) {
          // copy other_schema properties into schema
          // TODO: this isn't up to spec...just the simplest implementation
          all_schemas[schema].properties[property] = other_schema.properties[property];
        }
      }
    }
  }

  provides('json', function() {
    if (req.query && req.query.schema) {
      send(JSON.stringify(all_schemas[req.query.schema]));
    } else {
      send(JSON.stringify(all_schemas));
    }
  });
}
