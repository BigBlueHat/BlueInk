function(head, req) {
  var row;
  var types = Object.keys(this.templates.types);

  provides('html',
    function() {
      send('<ul>');
      while(row = getRow()) {
        if (types.indexOf(row.key) !== -1) {
          send('<li data-blueink-type="' + row.key + '">'
            + '<a href="' + row.id + '" title="' + row.value + '">'
            + row.value + '</a></li>');
        }
      }
      send('</ul>');
    }
  );
}
