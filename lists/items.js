function(head, req) {
  var row,
      type = ('query' in req && 'startkey' in req.query)
        ? req.query.startkey[0] : 'html';
  provides('html',
    function() {
      send('<ul>');
      while(row = getRow()) {
        if ('doc' in row && 'type' in row.doc && row.doc.type !== 'page') {
          send('<li class="' + type + '">');
          send('<a href="../../_show/item/'+row.value._id+'" title="'+row.value.title+'">');
          send(row.value.title);
          send('</a></li>');
        }
        // TODO: handle non-include_docs & reduce situations
      }
      send('</ul>');
    }
  );
}
