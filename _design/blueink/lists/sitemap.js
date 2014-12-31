function(head, req) {
  provides('json',
    function() {
      var row;
      var urls = [];
      var url = {};
      var previous_locations = [];

      /**
       * @param object url
       * @parem string parent_url
       *
       * @return void Adds to the global urls variable
       **/
      var addToTree = function (url, parent_url) {
        var total;
        // we have a top-level element
        if (previous_locations.length === 0) {
          urls.push(url);
          previous_locations.push(urls[urls.length-1]);
        } else if (parent_url !== previous_locations[previous_locations.length-1].body.url) {
          // work our way back to the top of the tree
          previous_locations.pop();
          // tray a branch higher
          addToTree(url, parent_url);
        } else {
          // once we have a match, add it to the tree
          total = previous_locations[previous_locations.length-1].children.push(url);
          previous_locations.push(previous_locations[previous_locations.length-1].children[total-1]);
        }
      }

      while(row = getRow()) {
        url = {
          "body": {
            "url": row.id,
            "nav_label": row.value
          },
          "children": []
        };

        parent_url = row.id.substr(0, row.id.lastIndexOf('/'));
        addToTree(url, parent_url);
      }
      return JSON.stringify({urls: urls});
    }
  );
}
