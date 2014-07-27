function(head, req) {
  var row;
  var types = Object.keys(this.templates.types);

  provides('html',
    function() {
      send('<ul>');
      while(row = getRow()) {
        if (types.indexOf(row.key) !== -1) {
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
