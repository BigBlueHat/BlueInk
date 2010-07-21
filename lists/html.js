function(head, req) {
	var row;
	provides('html',
		function() {
			send('<ul class="html">');
			while(row = getRow()) {
				if (row.value.doc.type != 'page') {
					send('<li class="aditemview"><a class="showitem" href="/testtest/_design/testing/_show/html/'+row.value._id+'", title="'+row.value.title+'">'+row.value.title+'</a></li>');
				}
			}
			send('</ul>');
		}
	);
}