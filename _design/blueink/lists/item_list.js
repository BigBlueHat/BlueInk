function(head, req) {
  var row;

  provides('html',
    function() {
      send('<ul>');
      while(row = getRow()) {
        send('<li data-blueink-type="' + row.key + '">'
          + '<a href="' + row.id + '" title="' + row.value + '">'
          + row.value + '</a></li>');
      }
      send('</ul>');
    }
  );
}
