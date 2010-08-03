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
				// it's the page
				if (row.key[1] == '_' && row.key[2] == '_') {
					page.title = row.doc.title;
				} else if (row.key[1] == '' && row.key[2] == 'site') {
					page.site = row.doc;
				} else if (row.key[1] == '' && row.key[2] == 'sitemap') {
					page.sitemap = row.doc.urls;
				} else if (row.key[1] == '' && row.key[2] == 'template') {
					templates = array_replace_recursive(ddoc.templates, row.doc.templates);
				} else {
					// TODO: base template selection off type
					if (!page.items[row.key[1]]) page.items[row.key[1]] = {'area':[]};
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
							page.items[row.key[1]].area[row.key[2]] = {'item':mustache.to_html(templates.types[row.doc.type], navigation, templates.partials)};
						} else {
							page.items[row.key[1]].area[row.key[2]] = {'item':mustache.to_html(templates.types[row.doc.type], row.doc)};
						}
					}
					if (row.key[1] == 0) page.items[row.key[1]].classes = ['first'];
				}
			}
			send(mustache.to_html(templates.page, page, templates.partials));
		}
	);
}