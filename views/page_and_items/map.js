function(doc) {
	if (doc.type == 'page') {
		for (var i in doc.page_items) {
			for (var id in doc.page_items[i]) {
				emit([doc.url, i, id], doc.page_items[i][id]);
			}
		}
		delete doc.page_items;
		emit([doc.url, '_', '_'], {'_id': doc._id});
		if (doc.template) {
			emit([doc.url, '', 'template'], {'_id':doc.template});
		}
		emit([doc.url, '', 'site'], {'_id':'site'});
		emit([doc.url, '', 'sitemap'], {'_id':'sitemap'});
	}
}