function(doc) {
	if (doc.type == 'page') {
		doc.url = doc.url.split('/');
		for (var i in doc.page_items) {
			for (var id in doc.page_items[i]) {
				emit(doc.url.concat(i, id), doc.page_items[i][id]);
			}
		}
		//delete doc.page_items;
		emit(doc.url.concat('_', '_'), {'_id': doc._id});
		if (doc.template) {
			emit(doc.url.concat('', 'template'), {'_id':doc.template});
		}
		emit(doc.url.concat('', 'site'), {'_id':'site'});
		emit(doc.url.concat('', 'sitemap'), {'_id':'sitemap'});
	}
}