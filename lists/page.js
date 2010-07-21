function(head, req) {
	// !code lib/array_replace_recursive.js
	var ddoc = this;
	var mustache = require("lib/mustache");
	var row;
	provides('html',
		function() {
			var page = {items:["","","",""],copyright:'BigBlueHat'};
			while(row = getRow()) {
				// it's the page
				if (row.key.length == 1) {
					page.title = row.doc.title;
					send(mustache.to_html(ddoc.templates.page.header, page));
				} else if (row.key[1] == '' && row.key[2] == 'template') {
					ddoc.templates = array_replace_recursive(ddoc.templates, row.doc.templates);
				} else {
					// TODO: base template selection off type
					page.items[row.key[1]] += '<div class="item">';
					page.items[row.key[1]] += mustache.to_html(ddoc.templates.html, row.doc);
					page.items[row.key[1]] += '</div>';
				}
			}
			page.items.forEach(function(column, index) {
				if (column != "") {
					send('<div class="yui-u col'+index+(index == 0 ? ' first':'')+'">'+column+'</div>');
				}
			});
			send(mustache.to_html(ddoc.templates.page.footer, page));
		}
	);
}