function(doc, req) {
  var mustache = require("lib/mustache");
  return mustache.to_html(this.templates.types.navigation, {'sitemap':doc.urls}, this.templates.partials);
}