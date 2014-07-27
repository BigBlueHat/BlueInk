function(head, req) {
  var row;
  provides('html',
    function() {
      send('<ul>');
      while(row = getRow()) {
        if (row.key != 'page') {
          send('<li data-blueink-type="' + row.key + '">'
            + '<a href="' + row._id + '" title="' + row.value + '">'
            + row.value + '</a></li>');
        }
      }
      send('</ul>');
    }
  );
}
