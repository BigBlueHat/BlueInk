function(head, req) {
  provides('json',
    function() {
      var row;
      var urls = [];
      while(row = getRow()) {
        urls.push({
          "body": {
            "url": row.id,
            "nav_label": row.value
          },
          // TODO: properly build children; rather than flat list
          "children": false
        });
      }
      return JSON.stringify({urls: urls});
    }
  );
}
