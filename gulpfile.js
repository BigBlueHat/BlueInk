'use strict';

var fs = require('fs');

var browserify = require('browserify');
var glob = require('glob');
var gulp = require('gulp');
var partialify = require('partialify');
var push = require('couch-push');
var runSequence = require('run-sequence');
var source = require('vinyl-source-stream');

var argv = require('yargs').argv;
var config = require('./config.json');
var couch_url;
if (argv.url) {
  couch_url = argv.url;
} else if (config.env && config.env['default'] && config.env['default'].db) {
  couch_url = config.env['default'].db;
} else {
  // TODO: make this hault
  console.log('You must supply the URL to your CouchDB instance (via --url or config.json');
}

gulp.task('blueink', function() {
  var b = browserify({
    entries: './src/main.js',
    debug: true,
    transform: [partialify]
  });

  return b.bundle()
    .pipe(source('bundle.js'))
    .pipe(gulp.dest('./_design/blueink/_attachments/'));
});

gulp.task('docs', function() {
  glob('_docs/*', function(err, matches) {
    if (err) throw err;

    matches.forEach(function(doc) {
      var type = doc.split('~')[0];
      if (type === '_docs/type' && fs.existsSync(doc + '/index.js')) {
        // we have a type definition, build its component
        browserify({
          entries: './' + doc + '/index.js',
          debug: true,
          transform: [partialify]
        })
        .bundle()
        .pipe(source('component.js'))
        .pipe(gulp.dest('./' + doc + '/_attachments/'));
      }

      push(couch_url, doc,
        function(err, resp) {
          if (err) {
            console.log(doc);
            console.log(JSON.stringify(err));
            console.log(JSON.stringify(resp));
            throw err;
          }
        });
    });
  });
});

gulp.task('apps', function() {
  glob('_design/*', function(err, matches) {
    if (err) throw err;
    matches.forEach(function(ddoc) {
      push(couch_url, ddoc,
        function(err, resp) {
          if (err) throw JSON.stringify(err);
          console.log(resp);
        });
    });
  });
});

gulp.task('default', function() {
  runSequence('blueink', ['apps', 'docs']);
});
