'use strict';

var fs = require('fs');

var browserify = require('browserify');
var glob = require('glob');
var gulp = require('gulp');
var partialify = require('partialify');
var push = require('couch-push');
var rename = require('gulp-rename');
var runSequence = require('run-sequence');
var source = require('vinyl-source-stream');
var rework = require('gulp-rework');

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

gulp.task('rework', function() {
  // TODO: call `gulp build` in `src/semantic/` first
  return gulp.src('src/semantic/dist/semantic.css')
    .pipe(rework(function (style) {
      var walk = require('rework-walk');
      walk(style, function(rule, node) {
        if (!rule.selectors) return rule;
        rule.selectors = rule.selectors.map(function(selector) {
          if (selector[0] === '.') {
            return selector.replace(/\.ui/g, '.blueink-ui');
          } else {
            // for reset / tag-named stuff
            if (selector.substr(0,4) !== 'html'
                && selector.substr(0,4) !== 'body'
                && selector[0] !== '*') {
              return '.blueink-ui ' + selector;
            } else if ((selector.substr(0,4) !== 'html'
                && selector.substr(0,4) !== 'body')
                || selector[0] === '*') {
              return selector;
            }
          }
        });

        // remove html & body specific reset styles
        // to avoid overriding template styles excessively
        if (undefined === rule.selectors[0]) {
          rule.selectors = [];
          rule.declarations = [];
        }
      });
    }, {sourcemap: true}))
    .pipe(rename('app.css'))
    .pipe(gulp.dest('_design/blueink/_attachments/ui/'));
});

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
