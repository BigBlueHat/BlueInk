function(doc, req) {
  var mustache = require("lib/mustache");
  if (doc.type === 'navigation') {
    return 'Sorry, viewing those here is not yet supported.';
  } else if (doc.type in this.templates.types) {
    return mustache.to_html(this.templates.types[doc.type], doc);
  } else {
    // TODO: return something useful...like an error
    return 'Template not found.';
  }
}
