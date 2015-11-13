function(head, req) {
  var row;

  provides('html',
    function() {
      send('<ul>');
      while(row = getRow()) {
        var type = row.id.replace('type~', '');
        send('<li data-blueink-type="' + type + '">'
          + '<a href="items-by-type?type=' + type + '">'
          + row.key + '</a>'
          + ' <span class="count">' + row.value + '</span></li>');
      }
      send('</ul>');
    }
  );
}
