function(head, req) {
  var row;
  provides('html',
    function() {
      send('<ul>');
      while(row = getRow()) {
        if (row.key != 'page') {
          send('<li data-blueink-type="' + row.key + '">'
            + '<a href="items-by-type?key=%22' + row.key + '%22" title="' + row.key + '">'
            + row.key + '</a>'
            + ' <span class="count">' + row.value + '</span></li>');
        }
      }
      send('</ul>');
    }
  );
}
