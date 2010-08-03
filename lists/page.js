function(head, req) {
	// !code lib/array_replace_recursive.js
	var ddoc = this;
	var templates = ddoc.templates;
	var mustache = require("lib/mustache");
	var row;
	provides('html',
		function() {
			var page = {items:[],copyright:'BigBlueHat'};
			while(row = getRow()) {
				var last = row.key.pop();
				var secondtolast = row.key.pop();
				// it's the page
				if (secondtolast == '_' && last == '_') {
					page.title = row.doc.title;
				} else if (secondtolast == '' && last == 'site') {
					page.site = row.doc;
				} else if (secondtolast == '' && last == 'sitemap') {
					page.sitemap = row.doc.urls;
				} else if (secondtolast == '' && last == 'template') {
					templates = array_replace_recursive(ddoc.templates, row.doc.templates);
				} else {
					// TODO: base template selection off type
					if (!page.items[secondtolast]) page.items[secondtolast] = {'area':[]};
					if (row.doc.type) {
						if (row.doc.type == 'navigation') {
							var navigation = {'sitemap':{}};
							if (row.doc.show_only && row.doc.show_only == 'children') {
								// TODO: this needs to be recursive
								page.sitemap.forEach(function(el) {
									if (el.body.url == row.doc.current_url && el.children) {
										navigation.sitemap = el.children;
									}
								});
							} else {
								navigation.sitemap = page.sitemap;
							}
							page.items[secondtolast].area[last] = {'item':mustache.to_html(templates.types[row.doc.type], navigation, templates.partials)};
						} else {
							page.items[secondtolast].area[last] = {'item':mustache.to_html(templates.types[row.doc.type], row.doc)};
						}
					}
					if (secondtolast == 0) page.items[secondtolast].classes = ['first'];
				}
			}
			send(mustache.to_html(templates.page, page, templates.partials));
		}
	);
}