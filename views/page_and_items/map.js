function(doc) {
	if (doc.type == 'page') {
		var urlParts = doc.url.split('/');
		for (var i in doc.page_items) {
			for (var id in doc.page_items[i]) {
				emit(urlParts.concat(i, id), doc.page_items[i][id]);
			}
		}
		emit(urlParts.concat('_', '_'), {'_id': doc._id});
		if (doc.template) {
			emit(urlParts.concat('', 'template'), {'_id':doc.template});
		}
		emit(urlParts.concat('', 'site'), {'_id':'site'});
		emit(urlParts.concat('', 'sitemap'), {'_id':'sitemap'});
	}
}