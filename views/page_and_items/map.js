function(doc) {
	if (doc.type == 'site') {
		emit([null, doc]);
	}
	if (doc.type == 'page') {
		for (var i in doc.page_items) {
			for (var id in doc.page_items[i]) {
				emit([doc.url, i, id], doc.page_items[i][id]);
			}
		}
		delete doc.page_items;
		emit([doc.url], doc);
		if (doc.template) {
			emit([doc.url, '', 'template'], {'_id':doc.template});
		} else {
			emit([doc.url, '', 'template'], {'_id':'site_template'});
		}
	}
}