(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var inserted = {};

module.exports = function (css) {
    if (inserted[css]) return;
    inserted[css] = true;
    
    var elem = document.createElement('style');
    elem.setAttribute('type', 'text/css');

    if ('textContent' in elem) {
      elem.textContent = css;
    } else {
      elem.styleSheet.cssText = css;
    }
    
    var head = document.getElementsByTagName('head')[0];
    head.appendChild(elem);
};

},{}],2:[function(require,module,exports){
"use strict";

var utils = require('./utils');
var merge = require('./merge');
var errors = require('./deps/errors');
var EventEmitter = require('events').EventEmitter;
var upsert = require('./deps/upsert');
var Changes = require('./changes');
var Promise = utils.Promise;

/*
 * A generic pouch adapter
 */

// returns first element of arr satisfying callback predicate
function arrayFirst(arr, callback) {
  for (var i = 0; i < arr.length; i++) {
    if (callback(arr[i], i) === true) {
      return arr[i];
    }
  }
  return false;
}

// Wrapper for functions that call the bulkdocs api with a single doc,
// if the first result is an error, return an error
function yankError(callback) {
  return function (err, results) {
    if (err || results[0].error) {
      callback(err || results[0]);
    } else {
      callback(null, results[0]);
    }
  };
}

// for every node in a revision tree computes its distance from the closest
// leaf
function computeHeight(revs) {
  var height = {};
  var edges = [];
  merge.traverseRevTree(revs, function (isLeaf, pos, id, prnt) {
    var rev = pos + "-" + id;
    if (isLeaf) {
      height[rev] = 0;
    }
    if (prnt !== undefined) {
      edges.push({from: prnt, to: rev});
    }
    return rev;
  });

  edges.reverse();
  edges.forEach(function (edge) {
    if (height[edge.from] === undefined) {
      height[edge.from] = 1 + height[edge.to];
    } else {
      height[edge.from] = Math.min(height[edge.from], 1 + height[edge.to]);
    }
  });
  return height;
}

function allDocsKeysQuery(api, opts, callback) {
  var keys =  ('limit' in opts) ?
      opts.keys.slice(opts.skip, opts.limit + opts.skip) :
      (opts.skip > 0) ? opts.keys.slice(opts.skip) : opts.keys;
  if (opts.descending) {
    keys.reverse();
  }
  if (!keys.length) {
    return api._allDocs({limit: 0}, callback);
  }
  var finalResults = {
    offset: opts.skip
  };
  return Promise.all(keys.map(function (key, i) {
    var subOpts = utils.extend(true, {key: key, deleted: 'ok'}, opts);
    ['limit', 'skip', 'keys'].forEach(function (optKey) {
      delete subOpts[optKey];
    });
    return new Promise(function (resolve, reject) {
      api._allDocs(subOpts, function (err, res) {
        if (err) {
          return reject(err);
        }
        finalResults.total_rows = res.total_rows;
        resolve(res.rows[0] || {key: key, error: 'not_found'});
      });
    });
  })).then(function (results) {
    finalResults.rows = results;
    return finalResults;
  });
}

utils.inherits(AbstractPouchDB, EventEmitter);
module.exports = AbstractPouchDB;

function AbstractPouchDB() {
  var self = this;
  EventEmitter.call(this);
  self.autoCompact = function (callback) {
    // http doesn't have auto-compaction
    if (!self.auto_compaction || self.type() === 'http') {
      return callback;
    }
    return function (err, res) {
      if (err) {
        callback(err);
      } else {
        var count = res.length;
        var decCount = function () {
          count--;
          if (!count) {
            callback(null, res);
          }
        };
        if (!res.length) {
          return callback(null, res);
        }
        res.forEach(function (doc) {
          if (doc.ok && doc.id) { // if no id, then it was a local doc
            // TODO: we need better error handling
            self.compactDocument(doc.id, 1, decCount);
          } else {
            decCount();
          }
        });
      }
    };
  };

  var listeners = 0, changes;
  var eventNames = ['change', 'delete', 'create', 'update'];
  this.on('newListener', function (eventName) {
    if (~eventNames.indexOf(eventName)) {
      if (listeners) {
        listeners++;
        return;
      } else {
        listeners++;
      }
    } else {
      return;
    }
    var lastChange = 0;
    changes = this.changes({
      conflicts: true,
      include_docs: true,
      continuous: true,
      since: 'now',
      onChange: function (change) {
        if (change.seq <= lastChange) {
          return;
        }
        lastChange = change.seq;
        self.emit('change', change);
        if (change.doc._deleted) {
          self.emit('delete', change);
        } else if (change.doc._rev.split('-')[0] === '1') {
          self.emit('create', change);
        } else {
          self.emit('update', change);
        }
      }
    });
  });
  this.on('removeListener', function (eventName) {
    if (~eventNames.indexOf(eventName)) {
      listeners--;
      if (listeners) {
        return;
      }
    } else {
      return;
    }
    changes.cancel();
  });
}

AbstractPouchDB.prototype.post =
  utils.adapterFun('post', function (doc, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    return callback(errors.NOT_AN_OBJECT);
  }
  this.bulkDocs({docs: [doc]}, opts,
      this.autoCompact(yankError(callback)));
});

AbstractPouchDB.prototype.put =
  utils.adapterFun('put', utils.getArguments(function (args) {
  var temp, temptype, opts, callback;
  var doc = args.shift();
  var id = '_id' in doc;
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    callback = args.pop();
    return callback(errors.NOT_AN_OBJECT);
  }
  doc = utils.clone(doc);
  while (true) {
    temp = args.shift();
    temptype = typeof temp;
    if (temptype === "string" && !id) {
      doc._id = temp;
      id = true;
    } else if (temptype === "string" && id && !('_rev' in doc)) {
      doc._rev = temp;
    } else if (temptype === "object") {
      opts = temp;
    } else if (temptype === "function") {
      callback = temp;
    }
    if (!args.length) {
      break;
    }
  }
  opts = opts || {};
  var error = utils.invalidIdError(doc._id);
  if (error) {
    return callback(error);
  }
  if (utils.isLocalId(doc._id) && typeof this._putLocal === 'function') {
    if (doc._deleted) {
      return this._removeLocal(doc, callback);
    } else {
      return this._putLocal(doc, callback);
    }
  }
  this.bulkDocs({docs: [doc]}, opts,
      this.autoCompact(yankError(callback)));
}));

AbstractPouchDB.prototype.putAttachment =
  utils.adapterFun('putAttachment', function (docId, attachmentId, rev,
                                              blob, type, callback) {
  var api = this;
  if (typeof type === 'function') {
    callback = type;
    type = blob;
    blob = rev;
    rev = null;
  }
  if (typeof type === 'undefined') {
    type = blob;
    blob = rev;
    rev = null;
  }

  function createAttachment(doc) {
    doc._attachments = doc._attachments || {};
    doc._attachments[attachmentId] = {
      content_type: type,
      data: blob
    };
    return api.put(doc);
  }

  return api.get(docId).then(function (doc) {
    if (doc._rev !== rev) {
      throw errors.REV_CONFLICT;
    }

    return createAttachment(doc);
  }, function (err) {
     // create new doc
    if (err.error === errors.MISSING_DOC.error) {
      return createAttachment({_id: docId});
    } else {
      throw err;
    }
  });
});

AbstractPouchDB.prototype.removeAttachment =
  utils.adapterFun('removeAttachment', function (docId, attachmentId, rev,
                                                 callback) {
  var self = this;
  self.get(docId, function (err, obj) {
    if (err) {
      callback(err);
      return;
    }
    if (obj._rev !== rev) {
      callback(errors.REV_CONFLICT);
      return;
    }
    if (!obj._attachments) {
      return callback();
    }
    delete obj._attachments[attachmentId];
    if (Object.keys(obj._attachments).length === 0) {
      delete obj._attachments;
    }
    self.put(obj, callback);
  });
});

AbstractPouchDB.prototype.remove =
  utils.adapterFun('remove', function (docOrId, optsOrRev, opts, callback) {
  var doc;
  if (typeof optsOrRev === 'string') {
    // id, rev, opts, callback style
    doc = {
      _id: docOrId,
      _rev: optsOrRev
    };
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
  } else {
    // doc, opts, callback style
    doc = docOrId;
    if (typeof optsOrRev === 'function') {
      callback = optsOrRev;
      opts = {};
    } else {
      callback = opts;
      opts = optsOrRev;
    }
  }
  opts = utils.clone(opts || {});
  opts.was_delete = true;
  var newDoc = {_id: doc._id, _rev: (doc._rev || opts.rev)};
  newDoc._deleted = true;
  if (utils.isLocalId(newDoc._id) && typeof this._removeLocal === 'function') {
    return this._removeLocal(doc, callback);
  }
  this.bulkDocs({docs: [newDoc]}, opts, yankError(callback));
});

AbstractPouchDB.prototype.revsDiff =
  utils.adapterFun('revsDiff', function (req, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = utils.clone(opts);
  var ids = Object.keys(req);

  if (!ids.length) {
    return callback(null, {});
  }

  var count = 0;
  var missing = new utils.Map();

  function addToMissing(id, revId) {
    if (!missing.has(id)) {
      missing.set(id, {missing: []});
    }
    missing.get(id).missing.push(revId);
  }

  function processDoc(id, rev_tree) {
    // Is this fast enough? Maybe we should switch to a set simulated by a map
    var missingForId = req[id].slice(0);
    merge.traverseRevTree(rev_tree, function (isLeaf, pos, revHash, ctx,
      opts) {
        var rev = pos + '-' + revHash;
        var idx = missingForId.indexOf(rev);
        if (idx === -1) {
          return;
        }

        missingForId.splice(idx, 1);
        if (opts.status !== 'available') {
          addToMissing(id, rev);
        }
      });

    // Traversing the tree is synchronous, so now `missingForId` contains
    // revisions that were not found in the tree
    missingForId.forEach(function (rev) {
      addToMissing(id, rev);
    });
  }

  ids.map(function (id) {
    this._getRevisionTree(id, function (err, rev_tree) {
      if (err && err.status === 404 && err.message === 'missing') {
        missing.set(id, {missing: req[id]});
      } else if (err) {
        return callback(err);
      } else {
        processDoc(id, rev_tree);
      }

      if (++count === ids.length) {
        // convert LazyMap to object
        var missingObj = {};
        missing.forEach(function (value, key) {
          missingObj[key] = value;
        });
        return callback(null, missingObj);
      }
    });
  }, this);
});

// compact one document and fire callback
// by compacting we mean removing all revisions which
// are further from the leaf in revision tree than max_height
AbstractPouchDB.prototype.compactDocument =
  utils.adapterFun('compactDocument', function (docId, max_height, callback) {
  var self = this;
  this._getRevisionTree(docId, function (err, rev_tree) {
    if (err) {
      return callback(err);
    }
    var height = computeHeight(rev_tree);
    var candidates = [];
    var revs = [];
    Object.keys(height).forEach(function (rev) {
      if (height[rev] > max_height) {
        candidates.push(rev);
      }
    });

    merge.traverseRevTree(rev_tree, function (isLeaf, pos, revHash, ctx, opts) {
      var rev = pos + '-' + revHash;
      if (opts.status === 'available' && candidates.indexOf(rev) !== -1) {
        opts.status = 'missing';
        revs.push(rev);
      }
    });
    self._doCompaction(docId, rev_tree, revs, callback);
  });
});

// compact the whole database using single document
// compaction
AbstractPouchDB.prototype.compact =
  utils.adapterFun('compact', function (opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  var self = this;

  opts = utils.clone(opts || {});

  self.get('_local/compaction')["catch"](function () {
    return false;
  }).then(function (doc) {
    if (typeof self._compact === 'function') {
      if (doc && doc.last_seq) {
        opts.last_seq = doc.last_seq;
      }
      return self._compact(opts, callback);
    }

  });
});
AbstractPouchDB.prototype._compact = function (opts, callback) {
  var done = false;
  var started = 0;
  var copts = {
    returnDocs: false
  };
  var self = this;
  var lastSeq;
  function finish() {
    self.get('_local/compaction')["catch"](function () {
      return false;
    }).then(function (doc) {
      doc = doc || {_id: '_local/compaction'};
      doc.last_seq = lastSeq;
      return self.put(doc);
    }).then(function () {
      callback();
    }, callback);
  }
  if (opts.last_seq) {
    copts.since = opts.last_seq;
  }
  function afterCompact() {
    started--;
    if (!started && done) {
      finish();
    }
  }
  function onChange(row) {
    started++;
    self.compactDocument(row.id, 0).then(afterCompact, callback);
  }
  self.changes(copts).on('change', onChange).on('complete', function (resp) {
    done = true;
    lastSeq = resp.last_seq;
    if (!started) {
      finish();
    }
  }).on('error', callback);
};
/* Begin api wrappers. Specific functionality to storage belongs in the 
   _[method] */
AbstractPouchDB.prototype.get =
  utils.adapterFun('get', function (id, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  if (typeof id !== 'string') {
    return callback(errors.INVALID_ID);
  }
  if (utils.isLocalId(id) && typeof this._getLocal === 'function') {
    return this._getLocal(id, callback);
  }
  var leaves = [], self = this;
  function finishOpenRevs() {
    var result = [];
    var count = leaves.length;
    if (!count) {
      return callback(null, result);
    }
    // order with open_revs is unspecified
    leaves.forEach(function (leaf) {
      self.get(id,
               {rev: leaf, revs: opts.revs, attachments: opts.attachments},
               function (err, doc) {
        if (!err) {
          result.push({ok: doc});
        } else {
          result.push({missing: leaf});
        }
        count--;
        if (!count) {
          callback(null, result);
        }
      });
    });
  }

  if (opts.open_revs) {
    if (opts.open_revs === "all") {
      this._getRevisionTree(id, function (err, rev_tree) {
        if (err) {
          // if there's no such document we should treat this
          // situation the same way as if revision tree was empty
          rev_tree = [];
        }
        leaves = merge.collectLeaves(rev_tree).map(function (leaf) {
          return leaf.rev;
        });
        finishOpenRevs();
      });
    } else {
      if (Array.isArray(opts.open_revs)) {
        leaves = opts.open_revs;
        for (var i = 0; i < leaves.length; i++) {
          var l = leaves[i];
          // looks like it's the only thing couchdb checks
          if (!(typeof(l) === "string" && /^\d+-/.test(l))) {
            return callback(errors.error(errors.BAD_REQUEST,
              "Invalid rev format"));
          }
        }
        finishOpenRevs();
      } else {
        return callback(errors.error(errors.UNKNOWN_ERROR,
          'function_clause'));
      }
    }
    return; // open_revs does not like other options
  }

  return this._get(id, opts, function (err, result) {
    opts = utils.clone(opts);
    if (err) {
      return callback(err);
    }

    var doc = result.doc;
    if (!doc) {
      // a smoke test for something being very wrong
      return callback(new Error('no doc!'));
    }
    var metadata = result.metadata;
    var ctx = result.ctx;

    if (opts.conflicts) {
      var conflicts = merge.collectConflicts(metadata);
      if (conflicts.length) {
        doc._conflicts = conflicts;
      }
    }

    if (opts.revs || opts.revs_info) {
      var paths = merge.rootToLeaf(metadata.rev_tree);
      var path = arrayFirst(paths, function (arr) {
        return arr.ids.map(function (x) { return x.id; })
          .indexOf(doc._rev.split('-')[1]) !== -1;
      });

      var indexOfRev = path.ids.map(function (x) {return x.id; })
        .indexOf(doc._rev.split('-')[1]) + 1;
      var howMany = path.ids.length - indexOfRev;
      path.ids.splice(indexOfRev, howMany);
      path.ids.reverse();

      if (opts.revs) {
        doc._revisions = {
          start: (path.pos + path.ids.length) - 1,
          ids: path.ids.map(function (rev) {
            return rev.id;
          })
        };
      }
      if (opts.revs_info) {
        var pos =  path.pos + path.ids.length;
        doc._revs_info = path.ids.map(function (rev) {
          pos--;
          return {
            rev: pos + '-' + rev.id,
            status: rev.opts.status
          };
        });
      }
    }

    if (opts.local_seq) {
      doc._local_seq = result.metadata.seq;
    }

    if (opts.attachments && doc._attachments) {
      var attachments = doc._attachments;
      var count = Object.keys(attachments).length;
      if (count === 0) {
        return callback(null, doc);
      }
      Object.keys(attachments).forEach(function (key) {
        this._getAttachment(attachments[key],
                            {encode: true, ctx: ctx}, function (err, data) {
          var att = doc._attachments[key];
          att.data = data;
          delete att.stub;
          if (!--count) {
            callback(null, doc);
          }
        });
      }, self);
    } else {
      if (doc._attachments) {
        for (var key in doc._attachments) {
          if (doc._attachments.hasOwnProperty(key)) {
            doc._attachments[key].stub = true;
          }
        }
      }
      callback(null, doc);
    }
  });
});

AbstractPouchDB.prototype.getAttachment =
  utils.adapterFun('getAttachment', function (docId, attachmentId, opts,
                                              callback) {
  var self = this;
  if (opts instanceof Function) {
    callback = opts;
    opts = {};
  }
  opts = utils.clone(opts);
  this._get(docId, opts, function (err, res) {
    if (err) {
      return callback(err);
    }
    if (res.doc._attachments && res.doc._attachments[attachmentId]) {
      opts.ctx = res.ctx;
      self._getAttachment(res.doc._attachments[attachmentId], opts, callback);
    } else {
      return callback(errors.MISSING_DOC);
    }
  });
});

AbstractPouchDB.prototype.allDocs =
  utils.adapterFun('allDocs', function (opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = utils.clone(opts);
  opts.skip = typeof opts.skip !== 'undefined' ? opts.skip : 0;
  if ('keys' in opts) {
    if (!Array.isArray(opts.keys)) {
      return callback(new TypeError('options.keys must be an array'));
    }
    var incompatibleOpt =
      ['startkey', 'endkey', 'key'].filter(function (incompatibleOpt) {
      return incompatibleOpt in opts;
    })[0];
    if (incompatibleOpt) {
      callback(errors.error(errors.QUERY_PARSE_ERROR,
        'Query parameter `' + incompatibleOpt +
        '` is not compatible with multi-get'
      ));
      return;
    }
    if (this.type() !== 'http') {
      return allDocsKeysQuery(this, opts, callback);
    }
  }

  return this._allDocs(opts, callback);
});

AbstractPouchDB.prototype.changes = function (opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return new Changes(this, opts, callback);
};

AbstractPouchDB.prototype.close =
  utils.adapterFun('close', function (callback) {
  this._closed = true;
  return this._close(callback);
});

AbstractPouchDB.prototype.info = utils.adapterFun('info', function (callback) {
  var self = this;
  this._info(function (err, info) {
    if (err) {
      return callback(err);
    }
    // assume we know better than the adapter, unless it informs us
    info.db_name = info.db_name || self._db_name;
    info.auto_compaction = !!(self._auto_compaction && self.type() !== 'http');
    callback(null, info);
  });
});

AbstractPouchDB.prototype.id = utils.adapterFun('id', function (callback) {
  return this._id(callback);
});

AbstractPouchDB.prototype.type = function () {
  return (typeof this._type === 'function') ? this._type() : this.adapter;
};

AbstractPouchDB.prototype.bulkDocs =
  utils.adapterFun('bulkDocs', function (req, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }

  opts = utils.clone(opts);

  if (Array.isArray(req)) {
    req = {
      docs: req
    };
  }

  if (!req || !req.docs || !Array.isArray(req.docs)) {
    return callback(errors.MISSING_BULK_DOCS);
  }

  for (var i = 0; i < req.docs.length; ++i) {
    if (typeof req.docs[i] !== 'object' || Array.isArray(req.docs[i])) {
      return callback(errors.NOT_AN_OBJECT);
    }
  }

  req = utils.clone(req);
  if (!('new_edits' in opts)) {
    if ('new_edits' in req) {
      opts.new_edits = req.new_edits;
    } else {
      opts.new_edits = true;
    }
  }

  return this._bulkDocs(req, opts, this.autoCompact(callback));
});

AbstractPouchDB.prototype.registerDependentDatabase =
  utils.adapterFun('registerDependentDatabase', function (dependentDb,
                                                          callback) {
  var depDB = new this.constructor(dependentDb, {adapter: this._adapter});
  function diffFun(doc) {
    doc.dependentDbs = doc.dependentDbs || {};
    if (doc.dependentDbs[dependentDb]) {
      return false; // no update required
    }
    doc.dependentDbs[dependentDb] = true;
    return doc;
  }
  upsert(this, '_local/_pouch_dependentDbs', diffFun, function (err) {
    if (err) {
      return callback(err);
    }
    return callback(null, {db: depDB});
  });
});

},{"./changes":7,"./deps/errors":12,"./deps/upsert":14,"./merge":19,"./utils":24,"events":94}],3:[function(require,module,exports){
(function (process){
"use strict";

var CHANGES_BATCH_SIZE = 25;

var utils = require('../utils');
var errors = require('../deps/errors');
// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
function parseUri(str) {
  var o = parseUri.options;
  var m = o.parser[o.strictMode ? "strict" : "loose"].exec(str);
  var uri = {};
  var i = 14;

  while (i--) {
    uri[o.key[i]] = m[i] || "";
  }

  uri[o.q.name] = {};
  uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
    if ($1) {
      uri[o.q.name][$1] = $2;
    }
  });

  return uri;
}

function encodeDocId(id) {
  if (/^_(design|local)/.test(id)) {
    return id;
  }
  return encodeURIComponent(id);
}

function preprocessAttachments(doc) {
  if (!doc._attachments || !Object.keys(doc._attachments)) {
    return utils.Promise.resolve();
  }

  return utils.Promise.all(Object.keys(doc._attachments).map(function (key) {
    var attachment = doc._attachments[key];
    if (attachment.data && typeof attachment.data !== 'string') {
      if (typeof process === undefined || process.browser) {
        return new utils.Promise(function (resolve) {
          var reader = new FileReader();
          reader.onloadend = function (e) {
            attachment.data = utils.btoa(
              utils.arrayBufferToBinaryString(e.target.result));
            resolve();
          };
          reader.readAsArrayBuffer(attachment.data);
        });
      } else {
        attachment.data = attachment.data.toString('base64');
      }
    }
  }));
}

parseUri.options = {
  strictMode: false,
  key: ["source", "protocol", "authority", "userInfo", "user", "password",
        "host", "port", "relative", "path", "directory", "file", "query",
        "anchor"],
  q:   {
    name:   "queryKey",
    parser: /(?:^|&)([^&=]*)=?([^&]*)/g
  },
  parser: {
    /* jshint maxlen: false */
    strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
    loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
  }
};

// Get all the information you possibly can about the URI given by name and
// return it as a suitable object.
function getHost(name, opts) {
  // If the given name contains "http:"
  if (/http(s?):/.test(name)) {
    // Prase the URI into all its little bits
    var uri = parseUri(name);

    // Store the fact that it is a remote URI
    uri.remote = true;

    // Store the user and password as a separate auth object
    if (uri.user || uri.password) {
      uri.auth = {username: uri.user, password: uri.password};
    }

    // Split the path part of the URI into parts using '/' as the delimiter
    // after removing any leading '/' and any trailing '/'
    var parts = uri.path.replace(/(^\/|\/$)/g, '').split('/');

    // Store the first part as the database name and remove it from the parts
    // array
    uri.db = parts.pop();

    // Restore the path by joining all the remaining parts (all the parts
    // except for the database name) with '/'s
    uri.path = parts.join('/');
    opts = opts || {};
    opts = utils.clone(opts);
    uri.headers = opts.headers || {};

    if (opts.auth || uri.auth) {
      var nAuth = opts.auth || uri.auth;
      var token = utils.btoa(nAuth.username + ':' + nAuth.password);
      uri.headers.Authorization = 'Basic ' + token;
    }

    if (opts.headers) {
      uri.headers = opts.headers;
    }

    return uri;
  }

  // If the given name does not contain 'http:' then return a very basic object
  // with no host, the current path, the given name as the database name and no
  // username/password
  return {host: '', path: '/', db: name, auth: false};
}

// Generate a URL with the host data given by opts and the given path
function genDBUrl(opts, path) {
  return genUrl(opts, opts.db + '/' + path);
}

// Generate a URL with the host data given by opts and the given path
function genUrl(opts, path) {
  if (opts.remote) {
    // If the host already has a path, then we need to have a path delimiter
    // Otherwise, the path delimiter is the empty string
    var pathDel = !opts.path ? '' : '/';

    // If the host already has a path, then we need to have a path delimiter
    // Otherwise, the path delimiter is the empty string
    return opts.protocol + '://' + opts.host + ':' + opts.port + '/' +
           opts.path + pathDel + path;
  }

  return '/' + path;
}
// Implements the PouchDB API for dealing with CouchDB instances over HTTP
function HttpPouch(opts, callback) {
  // The functions that will be publicly available for HttpPouch
  var api = this;
  api.getHost = opts.getHost ? opts.getHost : getHost;

  // Parse the URI given by opts.name into an easy-to-use object
  var host = api.getHost(opts.name, opts);

  // Generate the database URL based on the host
  var dbUrl = genDBUrl(host, '');

  api.getUrl = function () {return dbUrl; };
  api.getHeaders = function () {return utils.clone(host.headers); };

  var ajaxOpts = opts.ajax || {};
  opts = utils.clone(opts);
  function ajax(options, callback) {
    return utils.ajax(utils.extend({}, ajaxOpts, options), callback);
  }

  // Create a new CouchDB database based on the given opts
  var createDB = function () {
    ajax({headers: host.headers, method: 'PUT', url: dbUrl},
         function (err, ret) {
      // If we get an "Unauthorized" error
      if (err && err.status === 401) {
        // Test if the database already exists
        ajax({headers: host.headers, method: 'HEAD', url: dbUrl},
             function (err, ret) {
          // If there is still an error
          if (err) {
            // Give the error to the callback to deal with
            callback(err);
          } else {
            // Continue as if there had been no errors
            callback(null, api);
          }
        });
        // If there were no errros or if the only error is "Precondition Failed"
        // (note: "Precondition Failed" occurs when we try to create a database
        // that already exists)
      } else if (!err || err.status === 412) {
        // Continue as if there had been no errors
        callback(null, api);
      } else {
        callback(err);
      }
    });
  };
  if (!opts.skipSetup) {
    ajax({headers: host.headers, method: 'GET', url: dbUrl},
         function (err, ret) {
      //check if the db exists
      if (err) {
        if (err.status === 404) {
          //if it doesn't, create it
          createDB();
        } else {
          callback(err);
        }
      } else {
        //go do stuff with the db
        callback(null, api);
      }
    });
  }

  api.type = function () {
    return 'http';
  };

  api.id = utils.adapterFun('id', function (callback) {
    ajax({
      headers: host.headers,
      method: 'GET',
      url: genUrl(host, '')
    }, function (err, result) {
      var uuid = (result && result.uuid) ?
        result.uuid + host.db : genDBUrl(host, '');
      callback(null, uuid);
    });
  });

  api.request = utils.adapterFun('request', function (options, callback) {
    options.headers = host.headers;
    options.url = genDBUrl(host, options.url);
    ajax(options, callback);
  });

  // Sends a POST request to the host calling the couchdb _compact function
  //    version: The version of CouchDB it is running
  api.compact = utils.adapterFun('compact', function (opts, callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    ajax({
      headers: host.headers,
      url: genDBUrl(host, '_compact'),
      method: 'POST'
    }, function () {
      function ping() {
        api.info(function (err, res) {
          if (!res.compact_running) {
            callback();
          } else {
            setTimeout(ping, opts.interval || 200);
          }
        });
      }
      // Ping the http if it's finished compaction
      if (typeof callback === "function") {
        ping();
      }
    });
  });

  // Calls GET on the host, which gets back a JSON string containing
  //    couchdb: A welcome string
  //    version: The version of CouchDB it is running
  api._info = function (callback) {
    ajax({
      headers: host.headers,
      method: 'GET',
      url: genDBUrl(host, '')
    }, function (err, res) {
      if (err) {
        callback(err);
      } else {
        res.host = genDBUrl(host, '');
        callback(null, res);
      }
    });
  };

  // Get the document with the given id from the database given by host.
  // The id could be solely the _id in the database, or it may be a
  // _design/ID or _local/ID path
  api.get = utils.adapterFun('get', function (id, opts, callback) {
    // If no options were given, set the callback to the second parameter
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    if (opts.auto_encode === undefined) {
      opts.auto_encode = true;
    }

    // List of parameters to add to the GET request
    var params = [];

    // If it exists, add the opts.revs value to the list of parameters.
    // If revs=true then the resulting JSON will include a field
    // _revisions containing an array of the revision IDs.
    if (opts.revs) {
      params.push('revs=true');
    }

    // If it exists, add the opts.revs_info value to the list of parameters.
    // If revs_info=true then the resulting JSON will include the field
    // _revs_info containing an array of objects in which each object
    // representing an available revision.
    if (opts.revs_info) {
      params.push('revs_info=true');
    }

    if (opts.local_seq) {
      params.push('local_seq=true');
    }
    // If it exists, add the opts.open_revs value to the list of parameters.
    // If open_revs=all then the resulting JSON will include all the leaf
    // revisions. If open_revs=["rev1", "rev2",...] then the resulting JSON
    // will contain an array of objects containing data of all revisions
    if (opts.open_revs) {
      if (opts.open_revs !== "all") {
        opts.open_revs = JSON.stringify(opts.open_revs);
      }
      params.push('open_revs=' + opts.open_revs);
    }

    // If it exists, add the opts.attachments value to the list of parameters.
    // If attachments=true the resulting JSON will include the base64-encoded
    // contents in the "data" property of each attachment.
    if (opts.attachments) {
      params.push('attachments=true');
    }

    // If it exists, add the opts.rev value to the list of parameters.
    // If rev is given a revision number then get the specified revision.
    if (opts.rev) {
      params.push('rev=' + opts.rev);
    }

    // If it exists, add the opts.conflicts value to the list of parameters.
    // If conflicts=true then the resulting JSON will include the field
    // _conflicts containing all the conflicting revisions.
    if (opts.conflicts) {
      params.push('conflicts=' + opts.conflicts);
    }

    // Format the list of parameters into a valid URI query string
    params = params.join('&');
    params = params === '' ? '' : '?' + params;

    if (opts.auto_encode) {
      id = encodeDocId(id);
    }

    // Set the options for the ajax call
    var options = {
      headers: host.headers,
      method: 'GET',
      url: genDBUrl(host, id + params)
    };

    // If the given id contains at least one '/' and the part before the '/'
    // is NOT "_design" and is NOT "_local"
    // OR
    // If the given id contains at least two '/' and the part before the first
    // '/' is "_design".
    // TODO This second condition seems strange since if parts[0] === '_design'
    // then we already know that parts[0] !== '_local'.
    var parts = id.split('/');
    if ((parts.length > 1 && parts[0] !== '_design' && parts[0] !== '_local') ||
        (parts.length > 2 && parts[0] === '_design' && parts[0] !== '_local')) {
      // Binary is expected back from the server
      options.binary = true;
    }

    // Get the document
    ajax(options, function (err, doc, xhr) {
      // If the document does not exist, send an error to the callback
      if (err) {
        return callback(err);
      }

      // Send the document to the callback
      callback(null, doc, xhr);
    });
  });

  // Delete the document given by doc from the database given by host.
  api.remove = utils.adapterFun('remove', function (docOrId, optsOrRev, opts, callback) {
    var doc;
    if (typeof optsOrRev === 'string') {
      // id, rev, opts, callback style
      doc = {
        _id: docOrId,
        _rev: optsOrRev
      };
      if (typeof opts === 'function') {
        callback = opts;
        opts = {};
      }
    } else {
      // doc, opts, callback style
      doc = docOrId;
      if (typeof optsOrRev === 'function') {
        callback = optsOrRev;
        opts = {};
      } else {
        callback = opts;
        opts = optsOrRev;
      }
    }

    var rev = (doc._rev || opts.rev);

    // Delete the document
    ajax({
      headers: host.headers,
      method: 'DELETE',
      url: genDBUrl(host, encodeDocId(doc._id)) + '?rev=' + rev
    }, callback);
  });

  // Get the attachment
  api.getAttachment =
    utils.adapterFun('getAttachment', function (docId, attachmentId, opts,
                                                callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    if (opts.auto_encode === undefined) {
      opts.auto_encode = true;
    }
    if (opts.auto_encode) {
      docId = encodeDocId(docId);
    }
    opts.auto_encode = false;
    api.get(docId + '/' + attachmentId, opts, callback);
  });

  // Remove the attachment given by the id and rev
  api.removeAttachment =
    utils.adapterFun('removeAttachment', function (docId, attachmentId, rev,
                                                   callback) {
    ajax({
      headers: host.headers,
      method: 'DELETE',
      url: genDBUrl(host, encodeDocId(docId) + '/' + attachmentId) + '?rev=' +
           rev
    }, callback);
  });

  // Add the attachment given by blob and its contentType property
  // to the document with the given id, the revision given by rev, and
  // add it to the database given by host.
  api.putAttachment =
    utils.adapterFun('putAttachment', function (docId, attachmentId, rev, blob,
                                                type, callback) {
    if (typeof type === 'function') {
      callback = type;
      type = blob;
      blob = rev;
      rev = null;
    }
    if (typeof type === 'undefined') {
      type = blob;
      blob = rev;
      rev = null;
    }
    var id = encodeDocId(docId) + '/' + attachmentId;
    var url = genDBUrl(host, id);
    if (rev) {
      url += '?rev=' + rev;
    }

    var opts = {
      headers: utils.clone(host.headers),
      method: 'PUT',
      url: url,
      processData: false,
      body: blob,
      timeout: 60000
    };
    opts.headers['Content-Type'] = type;
    // Add the attachment
    ajax(opts, callback);
  });

  // Add the document given by doc (in JSON string format) to the database
  // given by host. This fails if the doc has no _id field.
  api.put = utils.adapterFun('put', utils.getArguments(function (args) {
    var temp, temptype, opts;
    var doc = args.shift();
    var id = '_id' in doc;
    var callback = args.pop();
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      return callback(errors.NOT_AN_OBJECT);
    }

    doc = utils.clone(doc);

    preprocessAttachments(doc).then(function () {
      while (true) {
        temp = args.shift();
        temptype = typeof temp;
        if (temptype === "string" && !id) {
          doc._id = temp;
          id = true;
        } else if (temptype === "string" && id && !('_rev' in doc)) {
          doc._rev = temp;
        } else if (temptype === "object") {
          opts = utils.clone(temp);
        }
        if (!args.length) {
          break;
        }
      }
      opts = opts || {};
      var error = utils.invalidIdError(doc._id);
      if (error) {
        throw error;
      }

      // List of parameter to add to the PUT request
      var params = [];

      // If it exists, add the opts.new_edits value to the list of parameters.
      // If new_edits = false then the database will NOT assign this document a
      // new revision number
      if (opts && typeof opts.new_edits !== 'undefined') {
        params.push('new_edits=' + opts.new_edits);
      }

      // Format the list of parameters into a valid URI query string
      params = params.join('&');
      if (params !== '') {
        params = '?' + params;
      }

      // Add the document
      ajax({
        headers: host.headers,
        method: 'PUT',
        url: genDBUrl(host, encodeDocId(doc._id)) + params,
        body: doc
      }, function (err, res) {
        if (err) {
          return callback(err);
        }
        res.ok = true;
        callback(null, res);
      });
    })["catch"](callback);

  }));

  // Add the document given by doc (in JSON string format) to the database
  // given by host. This does not assume that doc is a new document 
  // (i.e. does not have a _id or a _rev field.)
  api.post = utils.adapterFun('post', function (doc, opts, callback) {
    // If no options were given, set the callback to be the second parameter
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    if (typeof doc !== 'object') {
      return callback(errors.NOT_AN_OBJECT);
    }
    if (! ("_id" in doc)) {
      doc._id = utils.uuid();
    }
    api.put(doc, opts, function (err, res) {
      if (err) {
        return callback(err);
      }
      res.ok = true;
      callback(null, res);
    });
  });

  // Update/create multiple documents given by req in the database
  // given by host.
  api._bulkDocs = function (req, opts, callback) {
    // If opts.new_edits exists add it to the document data to be
    // send to the database.
    // If new_edits=false then it prevents the database from creating
    // new revision numbers for the documents. Instead it just uses
    // the old ones. This is used in database replication.
    if (typeof opts.new_edits !== 'undefined') {
      req.new_edits = opts.new_edits;
    }

    utils.Promise.all(req.docs.map(preprocessAttachments)).then(function () {
      // Update/create the documents
      ajax({
        headers: host.headers,
        method: 'POST',
        url: genDBUrl(host, '_bulk_docs'),
        body: req
      }, function (err, results) {
        if (err) {
          return callback(err);
        }
        results.forEach(function (result) {
          result.ok = true; // smooths out cloudant not adding this
        });
        callback(null, results);
      });
    })["catch"](callback);
  };

  // Get a listing of the documents in the database given
  // by host and ordered by increasing id.
  api.allDocs = utils.adapterFun('allDocs', function (opts, callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    // List of parameters to add to the GET request
    var params = [];
    var body;
    var method = 'GET';

    // TODO I don't see conflicts as a valid parameter for a
    // _all_docs request 
    // (see http://wiki.apache.org/couchdb/HTTP_Document_API#all_docs)
    if (opts.conflicts) {
      params.push('conflicts=true');
    }

    // If opts.descending is truthy add it to params
    if (opts.descending) {
      params.push('descending=true');
    }

    // If opts.include_docs exists, add the include_docs value to the
    // list of parameters.
    // If include_docs=true then include the associated document with each
    // result.
    if (opts.include_docs) {
      params.push('include_docs=true');
    }

    if (opts.key) {
      params.push('key=' + encodeURIComponent(JSON.stringify(opts.key)));
    }

    // If opts.startkey exists, add the startkey value to the list of
    // parameters.
    // If startkey is given then the returned list of documents will
    // start with the document whose id is startkey.
    if (opts.startkey) {
      params.push('startkey=' +
        encodeURIComponent(JSON.stringify(opts.startkey)));
    }

    // If opts.endkey exists, add the endkey value to the list of parameters.
    // If endkey is given then the returned list of docuemnts will
    // end with the document whose id is endkey.
    if (opts.endkey) {
      params.push('endkey=' + encodeURIComponent(JSON.stringify(opts.endkey)));
    }

    if (typeof opts.inclusive_end !== 'undefined') {
      params.push('inclusive_end=' + !!opts.inclusive_end);
    }

    // If opts.limit exists, add the limit value to the parameter list.
    if (typeof opts.limit !== 'undefined') {
      params.push('limit=' + opts.limit);
    }

    if (typeof opts.skip !== 'undefined') {
      params.push('skip=' + opts.skip);
    }

    // Format the list of parameters into a valid URI query string
    params = params.join('&');
    if (params !== '') {
      params = '?' + params;
    }

    if (typeof opts.keys !== 'undefined') {

      var MAX_URL_LENGTH = 2000;
      // according to http://stackoverflow.com/a/417184/680742,
      // the de factor URL length limit is 2000 characters

      var keysAsString =
        'keys=' + encodeURIComponent(JSON.stringify(opts.keys));
      if (keysAsString.length + params.length + 1 <= MAX_URL_LENGTH) {
        // If the keys are short enough, do a GET. we do this to work around
        // Safari not understanding 304s on POSTs (see issue #1239)
        params += (params.indexOf('?') !== -1 ? '&' : '?') + keysAsString;
      } else {
        // If keys are too long, issue a POST request to circumvent GET
        // query string limits
        // see http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options
        method = 'POST';
        body = JSON.stringify({keys: opts.keys});
      }
    }

    // Get the document listing
    ajax({
      headers: host.headers,
      method: method,
      url: genDBUrl(host, '_all_docs' + params),
      body: body
    }, callback);
  });

  // Get a list of changes made to documents in the database given by host.
  // TODO According to the README, there should be two other methods here,
  // api.changes.addListener and api.changes.removeListener.
  api._changes = function (opts) {
    // We internally page the results of a changes request, this means
    // if there is a large set of changes to be returned we can start
    // processing them quicker instead of waiting on the entire
    // set of changes to return and attempting to process them at once
    var batchSize = 'batch_size' in opts ? opts.batch_size : CHANGES_BATCH_SIZE;

    opts = utils.clone(opts);
    opts.timeout = opts.timeout || 30 * 1000;

    // We give a 5 second buffer for CouchDB changes to respond with
    // an ok timeout
    var params = { timeout: opts.timeout - (5 * 1000) };
    var limit = (typeof opts.limit !== 'undefined') ? opts.limit : false;
    if (limit === 0) {
      limit = 1;
    }
    var returnDocs;
    if ('returnDocs' in opts) {
      returnDocs = opts.returnDocs;
    } else {
      returnDocs = true;
    }
    //
    var leftToFetch = limit;

    if (opts.style) {
      params.style = opts.style;
    }

    if (opts.include_docs || opts.filter && typeof opts.filter === 'function') {
      params.include_docs = true;
    }

    if (opts.continuous) {
      params.feed = 'longpoll';
    }

    if (opts.conflicts) {
      params.conflicts = true;
    }

    if (opts.descending) {
      params.descending = true;
    }

    if (opts.filter && typeof opts.filter === 'string') {
      params.filter = opts.filter;
      if (opts.filter === '_view' &&
          opts.view &&
          typeof opts.view === 'string') {
        params.view = opts.view;
      }
    }

    // If opts.query_params exists, pass it through to the changes request.
    // These parameters may be used by the filter on the source database.
    if (opts.query_params && typeof opts.query_params === 'object') {
      for (var param_name in opts.query_params) {
        if (opts.query_params.hasOwnProperty(param_name)) {
          params[param_name] = opts.query_params[param_name];
        }
      }
    }

    var xhr;
    var lastFetchedSeq;

    // Get all the changes starting wtih the one immediately after the
    // sequence number given by since.
    var fetch = function (since, callback) {
      if (opts.aborted) {
        return;
      }
      params.since = since;
      if (opts.descending) {
        if (limit) {
          params.limit = leftToFetch;
        }
      } else {
        params.limit = (!limit || leftToFetch > batchSize) ?
          batchSize : leftToFetch;
      }

      var paramStr = '?' + Object.keys(params).map(function (k) {
        return k + '=' + params[k];
      }).join('&');

      // Set the options for the ajax call
      var xhrOpts = {
        headers: host.headers,
        method: 'GET',
        url: genDBUrl(host, '_changes' + paramStr),
        // _changes can take a long time to generate, especially when filtered
        timeout: opts.timeout
      };
      lastFetchedSeq = since;

      if (opts.aborted) {
        return;
      }

      // Get the changes
      xhr = ajax(xhrOpts, callback);
    };

    // If opts.since exists, get all the changes from the sequence
    // number given by opts.since. Otherwise, get all the changes
    // from the sequence number 0.
    var fetchTimeout = 10;
    var fetchRetryCount = 0;

    var results = {results: []};

    var fetched = function (err, res) {
      if (opts.aborted) {
        return;
      }
      var raw_results_length = 0;
      // If the result of the ajax call (res) contains changes (res.results)
      if (res && res.results) {
        raw_results_length = res.results.length;
        results.last_seq = res.last_seq;
        // For each change
        var req = {};
        req.query = opts.query_params;
        res.results = res.results.filter(function (c) {
          leftToFetch--;
          var ret = utils.filterChange(opts)(c);
          if (ret) {
            if (returnDocs) {
              results.results.push(c);
            }
            utils.call(opts.onChange, c);
          }
          return ret;
        });
      } else if (err) {
        // In case of an error, stop listening for changes and call
        // opts.complete
        opts.aborted = true;
        utils.call(opts.complete, err);
        return;
      }

      // The changes feed may have timed out with no results
      // if so reuse last update sequence
      if (res && res.last_seq) {
        lastFetchedSeq = res.last_seq;
      }

      var finished = (limit && leftToFetch <= 0) ||
        (res && raw_results_length < batchSize) ||
        (opts.descending);

      if ((opts.continuous && !(limit && leftToFetch <= 0)) || !finished) {
        // Increase retry delay exponentially as long as errors persist
        if (err) {
          fetchRetryCount += 1;
        } else {
          fetchRetryCount = 0;
        }
        var timeoutMultiplier = 1 << fetchRetryCount;
        var retryWait = fetchTimeout * timeoutMultiplier;
        var maximumWait = opts.maximumWait || 30000;

        if (retryWait > maximumWait) {
          utils.call(opts.complete, err || errors.UNKNOWN_ERROR);
          return;
        }

        // Queue a call to fetch again with the newest sequence number
        setTimeout(function () { fetch(lastFetchedSeq, fetched); }, retryWait);
      } else {
        // We're done, call the callback
        utils.call(opts.complete, null, results);
      }
    };

    fetch(opts.since || 0, fetched);

    // Return a method to cancel this method from processing any more
    return {
      cancel: function () {
        opts.aborted = true;
        if (xhr) {
          xhr.abort();
        }
      }
    };
  };

  // Given a set of document/revision IDs (given by req), tets the subset of
  // those that do NOT correspond to revisions stored in the database.
  // See http://wiki.apache.org/couchdb/HttpPostRevsDiff
  api.revsDiff = utils.adapterFun('revsDiff', function (req, opts, callback) {
    // If no options were given, set the callback to be the second parameter
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    // Get the missing document/revision IDs
    ajax({
      headers: host.headers,
      method: 'POST',
      url: genDBUrl(host, '_revs_diff'),
      body: JSON.stringify(req)
    }, callback);
  });

  api._close = function (callback) {
    callback();
  };

  api.destroy = utils.adapterFun('destroy', function (callback) {
    ajax({
      url: genDBUrl(host, ''),
      method: 'DELETE',
      headers: host.headers
    }, function (err, resp) {
      if (err) {
        api.emit('error', err);
        callback(err);
      } else {
        api.emit('destroyed');
        callback(null, resp);
      }
    });
  });
}

// Delete the HttpPouch specified by the given name.
HttpPouch.destroy = utils.toPromise(function (name, opts, callback) {
  var host = getHost(name, opts);
  opts = opts || {};
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = utils.clone(opts);
  opts.headers = host.headers;
  opts.method = 'DELETE';
  opts.url = genDBUrl(host, '');
  var ajaxOpts = opts.ajax || {};
  opts = utils.extend({}, opts, ajaxOpts);
  utils.ajax(opts, callback);
});

// HttpPouch is a valid adapter.
HttpPouch.valid = function () {
  return true;
};

module.exports = HttpPouch;

}).call(this,require("q+64fw"))
},{"../deps/errors":12,"../utils":24,"q+64fw":95}],4:[function(require,module,exports){
(function (process,global){
'use strict';

var utils = require('../utils');
var merge = require('../merge');
var errors = require('../deps/errors');
var vuvuzela = require('vuvuzela');

var cachedDBs = {};
var taskQueue = {
  running: false,
  queue: []
};

function tryCode(fun, that, args) {
  try {
    fun.apply(that, args);
  } catch (err) { // shouldn't happen
    if (window.PouchDB) {
      window.PouchDB.emit('error', err);
    }
  }
}

function applyNext() {
  if (taskQueue.running || !taskQueue.queue.length) {
    return;
  }
  taskQueue.running = true;
  var item = taskQueue.queue.shift();
  item.action(function (err, res) {
    tryCode(item.callback, this, [err, res]);
    taskQueue.running = false;
    process.nextTick(applyNext);
  });
}

function idbError(callback) {
  return function (event) {
    var message = (event.target && event.target.error &&
      event.target.error.name) || event.target;
    callback(errors.error(errors.IDB_ERROR, message, event.type));
  };
}

function isModernIdb() {
  // check for outdated implementations of IDB
  // that rely on the setVersion method instead of onupgradeneeded (issue #1207)

  // cache based on appVersion, in case the browser is updated
  var cacheKey = "_pouch__checkModernIdb_" +
    (global.navigator && global.navigator.appVersion);
  var cached = utils.hasLocalStorage() && global.localStorage[cacheKey];
  if (cached) {
    return JSON.parse(cached);
  }

  var dbName = '_pouch__checkModernIdb';
  var result = global.indexedDB.open(dbName, 1).onupgradeneeded === null;

  if (global.indexedDB.deleteDatabase) {
    global.indexedDB.deleteDatabase(dbName); // db no longer needed
  }
  if (utils.hasLocalStorage()) {
    global.localStorage[cacheKey] = JSON.stringify(result); // cache
  }
  return result;
}

// Unfortunately, the metadata has to be stringified
// when it is put into the database, because otherwise
// IndexedDB can throw errors for deeply-nested objects.
// Originally we just used JSON.parse/JSON.stringify; now
// we use this custom vuvuzela library that avoids recursion.
// If we could do it all over again, we'd probably use a
// format for the revision trees other than JSON.
function encodeMetadata(metadata, winningRev, deleted) {
  var storedObject = {data: vuvuzela.stringify(metadata)};
  storedObject.winningRev = winningRev;
  storedObject.deletedOrLocal = deleted ? '1' : '0';
  storedObject.id = metadata.id;
  return storedObject;
}

function decodeMetadata(storedObject) {
  if (!storedObject) {
    return null;
  }
  if (!storedObject.data) {
    // old format, when we didn't store it stringified
    return storedObject;
  }
  var metadata = vuvuzela.parse(storedObject.data);
  metadata.winningRev = storedObject.winningRev;
  metadata.deletedOrLocal = storedObject.deletedOrLocal === '1';
  return metadata;
}

function IdbPouch(opts, callback) {
  var api = this;

  taskQueue.queue.push({
    action: function (thisCallback) {
      init(api, opts, thisCallback);
    },
    callback: callback
  });
  applyNext();
}

function init(api, opts, callback) {

  // IndexedDB requires a versioned database structure, so we use the
  // version here to manage migrations.
  var ADAPTER_VERSION = 3;

  // The object stores created for each database
  // DOC_STORE stores the document meta data, its revision history and state
  // Keyed by document id
  var DOC_STORE = 'document-store';
  // BY_SEQ_STORE stores a particular version of a document, keyed by its
  // sequence id
  var BY_SEQ_STORE = 'by-sequence';
  // Where we store attachments
  var ATTACH_STORE = 'attach-store';
  // Where we store database-wide meta data in a single record
  // keyed by id: META_STORE
  var META_STORE = 'meta-store';
  // Where we store local documents
  var LOCAL_STORE = 'local-store';
  // Where we detect blob support
  var DETECT_BLOB_SUPPORT_STORE = 'detect-blob-support';

  var name = opts.name;

  var blobSupport = null;
  var instanceId = null;
  var idStored = false;
  var idb = null;
  var docCount = -1;

  function createSchema(db) {
    db.createObjectStore(DOC_STORE, {keyPath : 'id'})
      .createIndex('seq', 'seq', {unique: true});
    db.createObjectStore(BY_SEQ_STORE, {autoIncrement: true})
      .createIndex('_doc_id_rev', '_doc_id_rev', {unique: true});
    db.createObjectStore(ATTACH_STORE, {keyPath: 'digest'});
    db.createObjectStore(META_STORE, {keyPath: 'id', autoIncrement: false});
    db.createObjectStore(DETECT_BLOB_SUPPORT_STORE);
  }

  // migration to version 2
  // unfortunately "deletedOrLocal" is a misnomer now that we no longer
  // store local docs in the main doc-store, but whaddyagonnado
  function addDeletedOrLocalIndex(e, callback) {
    var transaction = e.currentTarget.transaction;
    var docStore = transaction.objectStore(DOC_STORE);
    docStore.createIndex('deletedOrLocal', 'deletedOrLocal', {unique : false});

    docStore.openCursor().onsuccess = function (event) {
      var cursor = event.target.result;
      if (cursor) {
        var metadata = cursor.value;
        var deleted = utils.isDeleted(metadata);
        metadata.deletedOrLocal = deleted ? "1" : "0";
        docStore.put(metadata);
        cursor["continue"]();
      } else {
        callback(transaction);
      }
    };
  }

  // migrations to get to version 3

  function createLocalStoreSchema(db) {
    db.createObjectStore(LOCAL_STORE, {keyPath: '_id'})
      .createIndex('_doc_id_rev', '_doc_id_rev', {unique: true});
  }

  function migrateLocalStore(e, tx) {
    tx = tx || e.currentTarget.transaction;
    var localStore = tx.objectStore(LOCAL_STORE);
    var docStore = tx.objectStore(DOC_STORE);
    var seqStore = tx.objectStore(BY_SEQ_STORE);

    var cursor = docStore.openCursor();
    cursor.onsuccess = function (event) {
      var cursor = event.target.result;
      if (cursor) {
        var metadata = cursor.value;
        var docId = metadata.id;
        var local = utils.isLocalId(docId);
        var rev = merge.winningRev(metadata);
        if (local) {
          var docIdRev = docId + "::" + rev;
          // remove all seq entries
          // associated with this docId
          var start = docId + "::";
          var end = docId + "::~";
          var index = seqStore.index('_doc_id_rev');
          var range = global.IDBKeyRange.bound(start, end, false, false);
          var seqCursor = index.openCursor(range);
          seqCursor.onsuccess = function (e) {
            seqCursor = e.target.result;
            if (!seqCursor) {
              // done
              docStore["delete"](cursor.primaryKey);
              cursor["continue"]();
            } else {
              var data = seqCursor.value;
              if (data._doc_id_rev === docIdRev) {
                localStore.put(data);
              }
              seqStore["delete"](seqCursor.primaryKey);
              seqCursor["continue"]();
            }
          };
        } else {
          cursor["continue"]();
        }
      }
    };
  }

  api.type = function () {
    return 'idb';
  };

  api._id = utils.toPromise(function (callback) {
    callback(null, instanceId);
  });

  api._bulkDocs = function idb_bulkDocs(req, opts, callback) {
    var newEdits = opts.new_edits;
    var userDocs = req.docs;
    // Parse the docs, give them a sequence number for the result
    var docInfos = userDocs.map(function (doc, i) {
      if (doc._id && utils.isLocalId(doc._id)) {
        return doc;
      }
      var newDoc = utils.parseDoc(doc, newEdits);
      newDoc._bulk_seq = i;
      return newDoc;
    });

    var docInfoErrors = docInfos.filter(function (docInfo) {
      return docInfo.error;
    });
    if (docInfoErrors.length) {
      return callback(docInfoErrors[0]);
    }

    var results = new Array(docInfos.length);
    var fetchedDocs = new utils.Map();
    var updateSeq = 0;
    var numDocsWritten = 0;

    function writeMetaData(e) {
      var meta = e.target.result;
      meta.updateSeq = (meta.updateSeq || 0) + updateSeq;
      txn.objectStore(META_STORE).put(meta);
    }

    function checkDoneWritingDocs() {
      if (++numDocsWritten === docInfos.length) {
        txn.objectStore(META_STORE).get(META_STORE).onsuccess = writeMetaData;
      }
    }

    function processDocs() {
      if (!docInfos.length) {
        return;
      }

      var idsToDocs = new utils.Map();

      docInfos.forEach(function (currentDoc, resultsIdx) {
        if (currentDoc._id && utils.isLocalId(currentDoc._id)) {
          api[currentDoc._deleted ? '_removeLocal' : '_putLocal'](
              currentDoc, {ctx: txn}, function (err, resp) {
            if (err) {
              results[resultsIdx] = err;
            } else {
              results[resultsIdx] = {};
            }
            checkDoneWritingDocs();
          });
          return;
        }

        var id = currentDoc.metadata.id;
        if (idsToDocs.has(id)) {
          idsToDocs.get(id).push([currentDoc, resultsIdx]);
        } else {
          idsToDocs.set(id, [[currentDoc, resultsIdx]]);
        }
      });

      // in the case of new_edits, the user can provide multiple docs
      // with the same id. these need to be processed sequentially
      idsToDocs.forEach(function (docs, id) {
        var numDone = 0;

        function docWritten() {
          checkDoneWritingDocs();
          if (++numDone < docs.length) {
            nextDoc();
          }
        }
        function nextDoc() {
          var value = docs[numDone];
          var currentDoc = value[0];
          var resultsIdx = value[1];

          if (fetchedDocs.has(id)) {
            updateDoc(fetchedDocs.get(id), currentDoc, resultsIdx, docWritten);
          } else {
            insertDoc(currentDoc, resultsIdx, docWritten);
          }
        }
        nextDoc();
      });
    }

    function fetchExistingDocs(callback) {
      if (!docInfos.length) {
        return callback();
      }

      var numFetched = 0;

      function checkDone() {
        if (++numFetched === docInfos.length) {
          callback();
        }
      }

      docInfos.forEach(function (docInfo) {
        if (docInfo._id && utils.isLocalId(docInfo._id)) {
          return checkDone(); // skip local docs
        }
        var id = docInfo.metadata.id;
        var req = txn.objectStore(DOC_STORE).get(id);
        req.onsuccess = function process_docRead(event) {
          var metadata = decodeMetadata(event.target.result);
          if (metadata) {
            fetchedDocs.set(id, metadata);
          }
          checkDone();
        };
      });
    }

    function complete() {
      var aresults = results.map(function (result) {
        if (result._bulk_seq) {
          delete result._bulk_seq;
        } else if (!Object.keys(result).length) {
          return {
            ok: true
          };
        }
        if (result.error) {
          return result;
        }

        var metadata = result.metadata;
        var rev = merge.winningRev(metadata);

        return {
          ok: true,
          id: metadata.id,
          rev: rev
        };
      });
      IdbPouch.Changes.notify(name);
      docCount = -1; // invalidate
      callback(null, aresults);
    }

    function preprocessAttachment(att, finish) {
      if (att.stub) {
        return finish();
      }
      if (typeof att.data === 'string') {
        var data;
        try {
          data = atob(att.data);
        } catch (e) {
          var err = errors.error(errors.BAD_ARG,
                                "Attachments need to be base64 encoded");
          return callback(err);
        }
        if (blobSupport) {
          var type = att.content_type;
          data = utils.fixBinary(data);
          att.data = utils.createBlob([data], {type: type});
        }
        utils.MD5(data).then(function (result) {
          att.digest = 'md5-' + result;
          finish();
        });
        return;
      }
      var reader = new FileReader();
      reader.onloadend = function (e) {
        var binary = utils.arrayBufferToBinaryString(this.result || '');
        if (!blobSupport) {
          att.data = btoa(binary);
        }
        utils.MD5(binary).then(function (result) {
          att.digest = 'md5-' + result;
          finish();
        });
      };
      reader.readAsArrayBuffer(att.data);
    }

    function preprocessAttachments(callback) {
      if (!docInfos.length) {
        return callback();
      }

      var docv = 0;
      docInfos.forEach(function (docInfo) {
        var attachments = docInfo.data && docInfo.data._attachments ?
          Object.keys(docInfo.data._attachments) : [];

        if (!attachments.length) {
          return done();
        }

        var recv = 0;
        function attachmentProcessed() {
          recv++;
          if (recv === attachments.length) {
            done();
          }
        }

        for (var key in docInfo.data._attachments) {
          if (docInfo.data._attachments.hasOwnProperty(key)) {
            preprocessAttachment(docInfo.data._attachments[key],
                                 attachmentProcessed);
          }
        }
      });

      function done() {
        docv++;
        if (docInfos.length === docv) {
          callback();
        }
      }
    }

    function writeDoc(docInfo, winningRev, deleted, callback, resultsIdx) {
      var err = null;
      var recv = 0;
      docInfo.data._id = docInfo.metadata.id;
      docInfo.data._rev = docInfo.metadata.rev;

      if (deleted) {
        docInfo.data._deleted = true;
      }

      var attachments = docInfo.data._attachments ?
        Object.keys(docInfo.data._attachments) : [];

      function collectResults(attachmentErr) {
        if (!err) {
          if (attachmentErr) {
            err = attachmentErr;
            callback(err);
          } else if (recv === attachments.length) {
            finish();
          }
        }
      }

      function attachmentSaved(err) {
        recv++;
        collectResults(err);
      }

      for (var key in docInfo.data._attachments) {
        if (!docInfo.data._attachments[key].stub) {
          var data = docInfo.data._attachments[key].data;
          delete docInfo.data._attachments[key].data;
          var digest = docInfo.data._attachments[key].digest;
          saveAttachment(docInfo, digest, data, attachmentSaved);
        } else {
          recv++;
          collectResults();
        }
      }

      function finish() {
        updateSeq++;
        docInfo.data._doc_id_rev = docInfo.data._id + "::" + docInfo.data._rev;
        var seqStore = txn.objectStore(BY_SEQ_STORE);
        var index = seqStore.index('_doc_id_rev');

        function afterPut(e) {
          var metadata = docInfo.metadata;
          metadata.seq = e.target.result;
          // Current _rev is calculated from _rev_tree on read
          delete metadata.rev;
          var metadataToStore = encodeMetadata(metadata, winningRev, deleted);
          var metaDataReq = txn.objectStore(DOC_STORE).put(metadataToStore);
          metaDataReq.onsuccess = function () {
            delete metadata.deletedOrLocal;
            delete metadata.winningRev;
            results[resultsIdx] = docInfo;
            fetchedDocs.set(docInfo.metadata.id, docInfo.metadata);
            utils.call(callback);
          };
        }

        var putReq = seqStore.put(docInfo.data);

        putReq.onsuccess = afterPut;
        putReq.onerror = function (e) {
          // ConstraintError, need to update, not put (see #1638 for details)
          e.preventDefault(); // avoid transaction abort
          e.stopPropagation(); // avoid transaction onerror
          var getKeyReq = index.getKey(docInfo.data._doc_id_rev);
          getKeyReq.onsuccess = function (e) {
            var putReq = seqStore.put(docInfo.data, e.target.result);
            updateSeq--; // discount, since it's an update, not a new seq
            putReq.onsuccess = afterPut;
          };
        };
      }

      if (!attachments.length) {
        finish();
      }
    }

    function updateDoc(oldDoc, docInfo, resultsIdx, callback) {
      var merged =
        merge.merge(oldDoc.rev_tree, docInfo.metadata.rev_tree[0], 1000);
      var wasPreviouslyDeleted = utils.isDeleted(oldDoc);
      var deleted = utils.isDeleted(docInfo.metadata);
      var inConflict = (wasPreviouslyDeleted && deleted && newEdits) ||
        (!wasPreviouslyDeleted && newEdits && merged.conflicts !== 'new_leaf');

      if (inConflict) {
        results[resultsIdx] = makeErr(errors.REV_CONFLICT, docInfo._bulk_seq);
        return callback();
      }

      docInfo.metadata.rev_tree = merged.tree;

      // recalculate
      var winningRev = merge.winningRev(docInfo.metadata);
      deleted = utils.isDeleted(docInfo.metadata, winningRev);

      writeDoc(docInfo, winningRev, deleted, callback, resultsIdx);
    }

    function insertDoc(docInfo, resultsIdx, callback) {
      var winningRev = merge.winningRev(docInfo.metadata);
      var deleted = utils.isDeleted(docInfo.metadata, winningRev);
      // Cant insert new deleted documents
      if ('was_delete' in opts && deleted) {
        results[resultsIdx] = errors.MISSING_DOC;
        return callback();
      }

      writeDoc(docInfo, winningRev, deleted, callback, resultsIdx);
    }

    // Insert sequence number into the error so we can sort later
    function makeErr(err, seq) {
      err._bulk_seq = seq;
      return err;
    }

    function saveAttachment(docInfo, digest, data, callback) {
      var objectStore = txn.objectStore(ATTACH_STORE);
      objectStore.get(digest).onsuccess = function (e) {
        var originalRefs = e.target.result && e.target.result.refs || {};
        var ref = [docInfo.metadata.id, docInfo.metadata.rev].join('@');
        var newAtt = {
          digest: digest,
          body: data,
          refs: originalRefs
        };
        newAtt.refs[ref] = true;
        objectStore.put(newAtt).onsuccess = function (e) {
          utils.call(callback);
        };
      };
    }

    var txn;
    preprocessAttachments(function () {
      var stores = [DOC_STORE, BY_SEQ_STORE, ATTACH_STORE, META_STORE,
        LOCAL_STORE];
      txn = idb.transaction(stores, 'readwrite');
      txn.onerror = idbError(callback);
      txn.ontimeout = idbError(callback);
      txn.oncomplete = complete;

      fetchExistingDocs(processDocs);
    });
  };

  // First we look up the metadata in the ids database, then we fetch the
  // current revision(s) from the by sequence store
  api._get = function idb_get(id, opts, callback) {
    var doc;
    var metadata;
    var err;
    var txn;
    opts = utils.clone(opts);
    if (opts.ctx) {
      txn = opts.ctx;
    } else {
      txn =
        idb.transaction([DOC_STORE, BY_SEQ_STORE, ATTACH_STORE], 'readonly');
    }

    function finish() {
      callback(err, {doc: doc, metadata: metadata, ctx: txn});
    }

    txn.objectStore(DOC_STORE).get(id).onsuccess = function (e) {
      metadata = decodeMetadata(e.target.result);
      // we can determine the result here if:
      // 1. there is no such document
      // 2. the document is deleted and we don't ask about specific rev
      // When we ask with opts.rev we expect the answer to be either
      // doc (possibly with _deleted=true) or missing error
      if (!metadata) {
        err = errors.MISSING_DOC;
        return finish();
      }
      if (utils.isDeleted(metadata) && !opts.rev) {
        err = errors.error(errors.MISSING_DOC, "deleted");
        return finish();
      }
      var objectStore = txn.objectStore(BY_SEQ_STORE);

      // metadata.winningRev was added later, so older DBs might not have it
      var rev = opts.rev || metadata.winningRev || merge.winningRev(metadata);
      var key = metadata.id + '::' + rev;

      objectStore.index('_doc_id_rev').get(key).onsuccess = function (e) {
        doc = e.target.result;
        if (doc && doc._doc_id_rev) {
          delete(doc._doc_id_rev);
        }
        if (!doc) {
          err = errors.MISSING_DOC;
          return finish();
        }
        finish();
      };
    };
  };

  api._getAttachment = function (attachment, opts, callback) {
    var txn;
    opts = utils.clone(opts);
    if (opts.ctx) {
      txn = opts.ctx;
    } else {
      txn =
        idb.transaction([DOC_STORE, BY_SEQ_STORE, ATTACH_STORE], 'readonly');
    }
    var digest = attachment.digest;
    var type = attachment.content_type;

    txn.objectStore(ATTACH_STORE).get(digest).onsuccess = function (e) {
      var data = e.target.result.body;
      if (opts.encode) {
        if (!data) {
          callback(null, '');
        } else if (typeof data !== 'string') { // we have blob support
          var reader = new FileReader();
          reader.onloadend = function (e) {
            var binary = utils.arrayBufferToBinaryString(this.result || '');
            callback(null, btoa(binary));
          };
          reader.readAsArrayBuffer(data);
        } else { // no blob support
          callback(null, data);
        }
      } else {
        if (!data) {
          callback(null, utils.createBlob([''], {type: type}));
        } else if (typeof data !== 'string') { // we have blob support
          callback(null, data);
        } else { // no blob support
          data = utils.fixBinary(atob(data));
          callback(null, utils.createBlob([data], {type: type}));
        }
      }
    };
  };

  function allDocsQuery(totalRows, opts, callback) {
    var start = 'startkey' in opts ? opts.startkey : false;
    var end = 'endkey' in opts ? opts.endkey : false;
    var key = 'key' in opts ? opts.key : false;
    var skip = opts.skip || 0;
    var limit = typeof opts.limit === 'number' ? opts.limit : -1;
    var inclusiveEnd = opts.inclusive_end !== false;
    var descending = 'descending' in opts && opts.descending ? 'prev' : null;

    var manualDescEnd = false;
    if (descending && start && end) {
      // unfortunately IDB has a quirk where IDBKeyRange.bound is invalid if the
      // start is less than the end, even in descending mode.  Best bet
      // is just to handle it manually in that case.
      manualDescEnd = end;
      end = false;
    }

    var keyRange = null;
    try {
      if (start && end) {
        keyRange = global.IDBKeyRange.bound(start, end, false, !inclusiveEnd);
      } else if (start) {
        if (descending) {
          keyRange = global.IDBKeyRange.upperBound(start);
        } else {
          keyRange = global.IDBKeyRange.lowerBound(start);
        }
      } else if (end) {
        if (descending) {
          keyRange = global.IDBKeyRange.lowerBound(end, !inclusiveEnd);
        } else {
          keyRange = global.IDBKeyRange.upperBound(end, !inclusiveEnd);
        }
      } else if (key) {
        keyRange = global.IDBKeyRange.only(key);
      }
    } catch (e) {
      if (e.name === "DataError" && e.code === 0) {
        // data error, start is less than end
        return callback(null, {
          total_rows : totalRows,
          offset : opts.skip,
          rows : []
        });
      } else {
        return callback(errors.error(errors.IDB_ERROR, e.name, e.message));
      }
    }

    var transaction = idb.transaction([DOC_STORE, BY_SEQ_STORE], 'readonly');
    transaction.oncomplete = function () {
      callback(null, {
        total_rows: totalRows,
        offset: opts.skip,
        rows: results
      });
    };

    var oStore = transaction.objectStore(DOC_STORE);
    var oCursor = descending ? oStore.openCursor(keyRange, descending)
      : oStore.openCursor(keyRange);
    var results = [];
    oCursor.onsuccess = function (e) {
      if (!e.target.result) {
        return;
      }
      var cursor = e.target.result;
      var metadata = decodeMetadata(cursor.value);
      // metadata.winningRev added later, some dbs might be missing it
      var winningRev = metadata.winningRev || merge.winningRev(metadata);

      function allDocsInner(metadata, data) {
        var doc = {
          id: metadata.id,
          key: metadata.id,
          value: {
            rev: winningRev
          }
        };
        if (opts.include_docs) {
          doc.doc = data;
          doc.doc._rev = winningRev;
          if (doc.doc._doc_id_rev) {
            delete(doc.doc._doc_id_rev);
          }
          if (opts.conflicts) {
            doc.doc._conflicts = merge.collectConflicts(metadata);
          }
          for (var att in doc.doc._attachments) {
            if (doc.doc._attachments.hasOwnProperty(att)) {
              doc.doc._attachments[att].stub = true;
            }
          }
        }
        var deleted = utils.isDeleted(metadata, winningRev);
        if (opts.deleted === 'ok') {
          // deleted docs are okay with keys_requests
          if (deleted) {
            doc.value.deleted = true;
            doc.doc = null;
          }
          results.push(doc);
        } else if (!deleted && skip-- <= 0) {
          if (manualDescEnd) {
            if (inclusiveEnd && doc.key < manualDescEnd) {
              return;
            } else if (!inclusiveEnd && doc.key <= manualDescEnd) {
              return;
            }
          }
          results.push(doc);
          if (--limit === 0) {
            return;
          }
        }
        cursor["continue"]();
      }

      if (!opts.include_docs) {
        allDocsInner(metadata);
      } else {
        var index = transaction.objectStore(BY_SEQ_STORE).index('_doc_id_rev');
        var key = metadata.id + "::" + winningRev;
        index.get(key).onsuccess = function (event) {
          allDocsInner(decodeMetadata(cursor.value), event.target.result);
        };
      }
    };
  }

  function countDocs(callback) {
    if (docCount !== -1) {
      return callback(null, docCount);
    }

    var count;
    var txn = idb.transaction([DOC_STORE], 'readonly');
    var index = txn.objectStore(DOC_STORE).index('deletedOrLocal');
    index.count(global.IDBKeyRange.only("0")).onsuccess = function (e) {
      count = e.target.result;
    };
    txn.onerror = idbError(callback);
    txn.oncomplete = function () {
      docCount = count;
      callback(null, docCount);
    };
  }

  api._allDocs = function idb_allDocs(opts, callback) {

    // first count the total_rows
    countDocs(function (err, totalRows) {
      if (err) {
        return callback(err);
      }
      if (opts.limit === 0) {
        return callback(null, {
          total_rows : totalRows,
          offset : opts.skip,
          rows : []
        });
      }
      allDocsQuery(totalRows, opts, callback);
    });
  };

  api._info = function idb_info(callback) {

    countDocs(function (err, count) {
      if (err) {
        return callback(err);
      }
      if (idb === null) {
        var error = new Error('db isn\'t open');
        error.id = 'idbNull';
        return callback(error);
      }
      var updateSeq = 0;
      var txn = idb.transaction([META_STORE], 'readonly');

      txn.objectStore(META_STORE).get(META_STORE).onsuccess = function (e) {
        updateSeq = e.target.result && e.target.result.updateSeq || 0;
      };

      txn.oncomplete = function () {
        callback(null, {
          doc_count: count,
          update_seq: updateSeq
        });
      };
    });
  };

  api._changes = function (opts) {
    opts = utils.clone(opts);

    if (opts.continuous) {
      var id = name + ':' + utils.uuid();
      IdbPouch.Changes.addListener(name, id, api, opts);
      IdbPouch.Changes.notify(name);
      return {
        cancel: function () {
          IdbPouch.Changes.removeListener(name, id);
        }
      };
    }

    var descending = opts.descending ? 'prev' : null;
    var lastSeq = 0;

    // Ignore the `since` parameter when `descending` is true
    opts.since = opts.since && !descending ? opts.since : 0;

    var limit = 'limit' in opts ? opts.limit : -1;
    if (limit === 0) {
      limit = 1; // per CouchDB _changes spec
    }
    var returnDocs;
    if ('returnDocs' in opts) {
      returnDocs = opts.returnDocs;
    } else {
      returnDocs = true;
    }

    var results = [];
    var numResults = 0;
    var filter = utils.filterChange(opts);

    var txn;

    function fetchChanges() {
      txn = idb.transaction([DOC_STORE, BY_SEQ_STORE], 'readonly');
      txn.oncomplete = onTxnComplete;

      var req;

      if (descending) {
        req = txn.objectStore(BY_SEQ_STORE)
            .openCursor(global.IDBKeyRange.lowerBound(opts.since, true),
                        descending);
      } else {
        req = txn.objectStore(BY_SEQ_STORE)
            .openCursor(global.IDBKeyRange.lowerBound(opts.since, true));
      }

      req.onsuccess = onsuccess;
      req.onerror = onerror;
    }

    fetchChanges();

    function onsuccess(event) {
      var cursor = event.target.result;

      if (!cursor) {
        return;
      }

      var doc = cursor.value;

      if (opts.doc_ids && opts.doc_ids.indexOf(doc._id) === -1) {
        return cursor["continue"]();
      }

      var index = txn.objectStore(DOC_STORE);
      index.get(doc._id).onsuccess = function (event) {
        var metadata = decodeMetadata(event.target.result);

        if (lastSeq < metadata.seq) {
          lastSeq = metadata.seq;
        }
        // metadata.winningRev was only added later
        var winningRev = metadata.winningRev || merge.winningRev(metadata);
        if (doc._rev !== winningRev) {
          return cursor["continue"]();
        }

        delete doc['_doc_id_rev'];

        var change = opts.processChange(doc, metadata, opts);
        change.seq = cursor.key;
        if (filter(change)) {
          numResults++;
          if (returnDocs) {
            results.push(change);
          }
          opts.onChange(change);
        }
        if (numResults !== limit) {
          cursor["continue"]();
        }
      };
    }

    function onTxnComplete() {
      if (!opts.continuous) {
        opts.complete(null, {
          results: results,
          last_seq: lastSeq
        });
      }
    }
  };

  api._close = function (callback) {
    if (idb === null) {
      return callback(errors.NOT_OPEN);
    }

    // https://developer.mozilla.org/en-US/docs/IndexedDB/IDBDatabase#close
    // "Returns immediately and closes the connection in a separate thread..."
    idb.close();
    delete cachedDBs[name];
    idb = null;
    callback();
  };

  api._getRevisionTree = function (docId, callback) {
    var txn = idb.transaction([DOC_STORE], 'readonly');
    var req = txn.objectStore(DOC_STORE).get(docId);
    req.onsuccess = function (event) {
      var doc = decodeMetadata(event.target.result);
      if (!doc) {
        callback(errors.MISSING_DOC);
      } else {
        callback(null, doc.rev_tree);
      }
    };
  };

  // This function removes revisions of document docId
  // which are listed in revs and sets this document
  // revision to to rev_tree
  api._doCompaction = function (docId, rev_tree, revs, callback) {
    var txn = idb.transaction([DOC_STORE, BY_SEQ_STORE], 'readwrite');

    var index = txn.objectStore(DOC_STORE);
    index.get(docId).onsuccess = function (event) {
      var metadata = decodeMetadata(event.target.result);
      metadata.rev_tree = rev_tree;

      var count = revs.length;
      revs.forEach(function (rev) {
        var index = txn.objectStore(BY_SEQ_STORE).index('_doc_id_rev');
        var key = docId + "::" + rev;
        index.getKey(key).onsuccess = function (e) {
          var seq = e.target.result;
          if (!seq) {
            return;
          }
          txn.objectStore(BY_SEQ_STORE)["delete"](seq);

          count--;
          if (!count) {
            // winningRev is not guaranteed to be there, since it's
            // not formally migrated. deletedOrLocal is a
            // now-unfortunate name that really just means "deleted"
            var winningRev = metadata.winningRev ||
              merge.winningRev(metadata);
            var deleted = metadata.deletedOrLocal;
            txn.objectStore(DOC_STORE).put(
              encodeMetadata(metadata, winningRev, deleted));
          }
        };
      });
    };
    txn.oncomplete = function () {
      utils.call(callback);
    };
  };


  api._getLocal = function (id, callback) {
    var tx = idb.transaction([LOCAL_STORE], 'readonly');
    var req = tx.objectStore(LOCAL_STORE).get(id);

    req.onerror = idbError(callback);
    req.onsuccess = function (e) {
      var doc = e.target.result;
      if (!doc) {
        callback(errors.MISSING_DOC);
      } else {
        delete doc['_doc_id_rev'];
        callback(null, doc);
      }
    };
  };

  api._putLocal = function (doc, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    delete doc._revisions; // ignore this, trust the rev
    var oldRev = doc._rev;
    var id = doc._id;
    if (!oldRev) {
      doc._rev = '0-1';
    } else {
      doc._rev = '0-' + (parseInt(oldRev.split('-')[1], 10) + 1);
    }
    doc._doc_id_rev = id + '::' + doc._rev;

    var tx = opts.ctx;
    var ret;
    if (!tx) {
      tx = idb.transaction([LOCAL_STORE], 'readwrite');
      tx.onerror = idbError(callback);
      tx.oncomplete = function () {
        if (ret) {
          callback(null, ret);
        }
      };
    }

    var oStore = tx.objectStore(LOCAL_STORE);
    var req;
    if (oldRev) {
      var index = oStore.index('_doc_id_rev');
      var docIdRev = id + '::' + oldRev;
      req = index.get(docIdRev);
      req.onsuccess = function (e) {
        if (!e.target.result) {
          callback(errors.REV_CONFLICT);
        } else { // update
          var req = oStore.put(doc);
          req.onsuccess = function () {
            ret = {ok: true, id: doc._id, rev: doc._rev};
            if (opts.ctx) { // retuthis.immediately
              callback(null, ret);
            }
          };
        }
      };
    } else { // new doc
      req = oStore.get(id);
      req.onsuccess = function (e) {
        if (e.target.result) { // already exists
          callback(errors.REV_CONFLICT);
        } else { // insert
          var req = oStore.put(doc);
          req.onsuccess = function () {
            ret = {ok: true, id: doc._id, rev: doc._rev};
            if (opts.ctx) { // return immediately
              callback(null, ret);
            }
          };
        }
      };
    }
  };

  api._removeLocal = function (doc, callback) {
    var tx = idb.transaction([LOCAL_STORE], 'readwrite');
    var ret;
    tx.oncomplete = function () {
      if (ret) {
        callback(null, ret);
      }
    };
    var docIdRev = doc._id + '::' + doc._rev;
    var oStore = tx.objectStore(LOCAL_STORE);
    var index = oStore.index('_doc_id_rev');
    var req = index.get(docIdRev);

    req.onerror = idbError(callback);
    req.onsuccess = function (e) {
      var doc = e.target.result;
      if (!doc) {
        callback(errors.MISSING_DOC);
      } else {
        var req = index.getKey(docIdRev);
        req.onsuccess = function (e) {
          var key = e.target.result;
          oStore["delete"](key);
          ret = {ok: true, id: doc._id, rev: '0-0'};
        };
      }
    };
  };

  var cached = cachedDBs[name];

  if (cached) {
    idb = cached.idb;
    blobSupport = cached.blobSupport;
    instanceId = cached.instanceId;
    idStored = cached.idStored;
    process.nextTick(function () {
      callback(null, api);
    });
    return;
  }

  var req = global.indexedDB.open(name, ADAPTER_VERSION);

  if (!('openReqList' in IdbPouch)) {
    IdbPouch.openReqList = {};
  }
  IdbPouch.openReqList[name] = req;

  req.onupgradeneeded = function (e) {
    var db = e.target.result;
    if (e.oldVersion < 1) {
      // initial schema
      createSchema(db);
    }
    if (e.oldVersion < 3) {
      createLocalStoreSchema(db);
      if (e.oldVersion < 2) {
        // version 2 adds the deletedOrLocal index
        addDeletedOrLocalIndex(e, function (transaction) {
          migrateLocalStore(e, transaction);
        });
      } else {
        migrateLocalStore(e);
      }
    }
  };

  req.onsuccess = function (e) {

    idb = e.target.result;

    idb.onversionchange = function () {
      idb.close();
      delete cachedDBs[name];
    };
    idb.onabort = function () {
      idb.close();
      delete cachedDBs[name];
    };

    var txn = idb.transaction([META_STORE, DETECT_BLOB_SUPPORT_STORE],
      'readwrite');

    var req = txn.objectStore(META_STORE).get(META_STORE);

    req.onsuccess = function (e) {

      var checkSetupComplete = function () {
        if (blobSupport === null || !idStored) {
          return;
        } else {
          cachedDBs[name] = {
            idb: idb,
            blobSupport: blobSupport,
            instanceId: instanceId,
            idStored: idStored,
            loaded: true
          };
          callback(null, api);
        }
      };

      var meta = e.target.result || {id: META_STORE};
      if (name  + '_id' in meta) {
        instanceId = meta[name + '_id'];
        idStored = true;
        checkSetupComplete();
      } else {
        instanceId = utils.uuid();
        meta[name + '_id'] = instanceId;
        txn.objectStore(META_STORE).put(meta).onsuccess = function () {
          idStored = true;
          checkSetupComplete();
        };
      }

      // Detect blob support. Chrome didn't support it until version 38.
      // in version 37 they had a broken version where PNGs (and possibly
      // other binary types) aren't stored correctly.
      try {
        var blob = utils.createBlob([''], {type: 'image/png'});
        txn.objectStore(DETECT_BLOB_SUPPORT_STORE).put(blob, 'key');
        txn.oncomplete = function () {
          // have to do it in a separate transaction, else the correct
          // content type is always returned
          txn = idb.transaction([META_STORE, DETECT_BLOB_SUPPORT_STORE],
            'readwrite');
          var getBlobReq = txn.objectStore(
            DETECT_BLOB_SUPPORT_STORE).get('key');
          getBlobReq.onsuccess = function (e) {
            var storedBlob = e.target.result;
            var url = URL.createObjectURL(storedBlob);
            utils.ajax({
              url: url,
              cache: true,
              binary: true
            }, function (err, res) {
              if (err && err.status === 405) {
                // firefox won't let us do that. but firefox doesn't
                // have the blob type bug that Chrome does, so that's ok
                blobSupport = true;
              } else {
                blobSupport = !!(res && res.type === 'image/png');
              }
              checkSetupComplete();
            });
          };
        };
      } catch (err) {
        blobSupport = false;
        checkSetupComplete();
      }
    };
  };

  req.onerror = idbError(callback);

}

IdbPouch.valid = function () {
  // Issue #2533, we finally gave up on doing bug
  // detection instead of browser sniffing. Safari brought us
  // to our knees.
  var isSafari = typeof openDatabase !== 'undefined' &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome/.test(navigator.userAgent);
  return !isSafari && global.indexedDB && isModernIdb();
};

function destroy(name, opts, callback) {
  if (!('openReqList' in IdbPouch)) {
    IdbPouch.openReqList = {};
  }
  IdbPouch.Changes.removeAllListeners(name);

  //Close open request for "name" database to fix ie delay.
  if (IdbPouch.openReqList[name] && IdbPouch.openReqList[name].result) {
    IdbPouch.openReqList[name].result.close();
  }
  var req = global.indexedDB.deleteDatabase(name);

  req.onsuccess = function () {
    //Remove open request from the list.
    if (IdbPouch.openReqList[name]) {
      IdbPouch.openReqList[name] = null;
    }
    if (utils.hasLocalStorage() && (name in global.localStorage)) {
      delete global.localStorage[name];
    }
    delete cachedDBs[name];
    callback(null, { 'ok': true });
  };

  req.onerror = idbError(callback);
}

IdbPouch.destroy = utils.toPromise(function (name, opts, callback) {
  taskQueue.queue.push({
    action: function (thisCallback) {
      destroy(name, opts, thisCallback);
    },
    callback: callback
  });
  applyNext();
});

IdbPouch.Changes = new utils.Changes();

module.exports = IdbPouch;

}).call(this,require("q+64fw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../deps/errors":12,"../merge":19,"../utils":24,"q+64fw":95,"vuvuzela":56}],5:[function(require,module,exports){
module.exports = ['idb', 'websql'];
},{}],6:[function(require,module,exports){
(function (global){
'use strict';

var utils = require('../utils');
var merge = require('../merge');
var errors = require('../deps/errors');
var vuvuzela = require('vuvuzela');
function quote(str) {
  return "'" + str + "'";
}

var cachedDatabases = {};

var openDB = utils.getArguments(function (args) {
  if (typeof global !== 'undefined') {
    if (global.navigator && global.navigator.sqlitePlugin &&
        global.navigator.sqlitePlugin.openDatabase) {
      return navigator.sqlitePlugin.openDatabase
        .apply(navigator.sqlitePlugin, args);
    } else if (global.sqlitePlugin && global.sqlitePlugin.openDatabase) {
      return global.sqlitePlugin.openDatabase
        .apply(global.sqlitePlugin, args);
    } else {
      var db = cachedDatabases[args[0]];
      if (!db) {
        db = cachedDatabases[args[0]] =
          global.openDatabase.apply(global, args);
      }
      return db;
    }
  }
});

var POUCH_VERSION = 1;
var ADAPTER_VERSION = 4; // used to manage migrations

// The object stores created for each database
// DOC_STORE stores the document meta data, its revision history and state
var DOC_STORE = quote('document-store');
// BY_SEQ_STORE stores a particular version of a document, keyed by its
// sequence id
var BY_SEQ_STORE = quote('by-sequence');
// Where we store attachments
var ATTACH_STORE = quote('attach-store');
var LOCAL_STORE = quote('local-store');
var META_STORE = quote('metadata-store');

// these indexes cover the ground for most allDocs queries
var BY_SEQ_STORE_DELETED_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS \'by-seq-deleted-idx\' ON ' +
  BY_SEQ_STORE + ' (seq, deleted)';
var BY_SEQ_STORE_DOC_ID_REV_INDEX_SQL =
  'CREATE UNIQUE INDEX IF NOT EXISTS \'by-seq-doc-id-rev\' ON ' +
    BY_SEQ_STORE + ' (doc_id, rev)';
var DOC_STORE_WINNINGSEQ_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS \'doc-winningseq-idx\' ON ' +
  DOC_STORE + ' (winningseq)';

var DOC_STORE_AND_BY_SEQ_JOINER = BY_SEQ_STORE +
  '.seq = ' + DOC_STORE + '.winningseq';

var SELECT_DOCS = BY_SEQ_STORE + '.seq AS seq, ' +
  BY_SEQ_STORE + '.deleted AS deleted, ' +
  BY_SEQ_STORE + '.json AS data, ' +
  BY_SEQ_STORE + '.rev AS rev, ' +
  DOC_STORE + '.json AS metadata';

function select(selector, table, joiner, where, orderBy) {
  return 'SELECT ' + selector + ' FROM ' +
    (typeof table === 'string' ? table : table.join(' JOIN ')) +
    (joiner ? (' ON ' + joiner) : '') +
    (where ? (' WHERE ' +
      (typeof where === 'string' ? where : where.join(' AND '))) : '') +
    (orderBy ? (' ORDER BY ' + orderBy) : '');
}

function unknownError(callback) {
  return function (event) {
    // event may actually be a SQLError object, so report is as such
    var errorNameMatch = event && event.constructor.toString()
      .match(/function ([^\(]+)/);
    var errorName = (errorNameMatch && errorNameMatch[1]) || event.type;
    var errorReason = event.target || event.message;
    callback(errors.error(errors.WSQ_ERROR, errorReason, errorName));
  };
}
function decodeUtf8(str) {
  return decodeURIComponent(window.escape(str));
}
function parseHexString(str, encoding) {
  var result = '';
  var charWidth = encoding === 'UTF-8' ? 2 : 4;
  for (var i = 0, len = str.length; i < len; i += charWidth) {
    var substring = str.substring(i, i + charWidth);
    if (charWidth === 4) { // UTF-16, twiddle the bits
      substring = substring.substring(2, 4) + substring.substring(0, 2);
    }
    result += String.fromCharCode(parseInt(substring, 16));
  }
  result = encoding === 'UTF-8' ? decodeUtf8(result) : result;
  return result;
}

function stringifyDoc(doc) {
  // don't bother storing the id/rev. it uses lots of space,
  // in persistent map/reduce especially
  delete doc._id;
  delete doc._rev;
  return JSON.stringify(doc);
}

function unstringifyDoc(doc, id, rev) {
  doc = JSON.parse(doc);
  doc._id = id;
  doc._rev = rev;
  return doc;
}

function getSize(opts) {
  if ('size' in opts) {
    // triggers immediate popup in iOS, fixes #2347
    // e.g. 5000001 asks for 5 MB, 10000001 asks for 10 MB,
    return opts.size * 1000000;
  }
  // In iOS, doesn't matter as long as it's <= 5000000.
  // Except that if you request too much, our tests fail
  // because of the native "do you accept?" popup.
  // In Android <=4.3, this value is actually used as an
  // honest-to-god ceiling for data, so we need to
  // set it to a decently high number.
  var isAndroid = /Android/.test(window.navigator.userAgent);
  return isAndroid ? 5000000 : 1;
}

function WebSqlPouch(opts, callback) {
  var api = this;
  var instanceId = null;
  var name = opts.name;
  var size = getSize(opts);
  var idRequests = [];
  var docCount = -1; // cache sqlite count(*) for performance
  var encoding;

  var db = openDB(name, POUCH_VERSION, name, size);
  if (!db) {
    return callback(errors.UNKNOWN_ERROR);
  } else if (typeof db.readTransaction !== 'function') {
    // doesn't exist in sqlite plugin
    db.readTransaction = db.transaction;
  }

  function dbCreated() {
    // note the db name in case the browser upgrades to idb
    if (utils.hasLocalStorage()) {
      global.localStorage['_pouch__websqldb_' + name] = true;
    }
    callback(null, api);
  }

  // In this migration, we added the 'deleted' and 'local' columns to the
  // by-seq and doc store tables.
  // To preserve existing user data, we re-process all the existing JSON
  // and add these values.
  // Called migration2 because it corresponds to adapter version (db_version) #2
  function runMigration2(tx, callback) {
    // index used for the join in the allDocs query
    tx.executeSql(DOC_STORE_WINNINGSEQ_INDEX_SQL);

    tx.executeSql('ALTER TABLE ' + BY_SEQ_STORE +
      ' ADD COLUMN deleted TINYINT(1) DEFAULT 0', [], function () {
      tx.executeSql(BY_SEQ_STORE_DELETED_INDEX_SQL);
      tx.executeSql('ALTER TABLE ' + DOC_STORE +
        ' ADD COLUMN local TINYINT(1) DEFAULT 0', [], function () {
        tx.executeSql('CREATE INDEX IF NOT EXISTS \'doc-store-local-idx\' ON ' +
          DOC_STORE + ' (local, id)');

        var sql = 'SELECT ' + DOC_STORE + '.winningseq AS seq, ' + DOC_STORE +
          '.json AS metadata FROM ' + BY_SEQ_STORE + ' JOIN ' + DOC_STORE +
          ' ON ' + BY_SEQ_STORE + '.seq = ' + DOC_STORE + '.winningseq';

        tx.executeSql(sql, [], function (tx, result) {

          var deleted = [];
          var local = [];

          for (var i = 0; i < result.rows.length; i++) {
            var item = result.rows.item(i);
            var seq = item.seq;
            var metadata = JSON.parse(item.metadata);
            if (utils.isDeleted(metadata)) {
              deleted.push(seq);
            }
            if (utils.isLocalId(metadata.id)) {
              local.push(metadata.id);
            }
          }
          tx.executeSql('UPDATE ' + DOC_STORE + 'SET local = 1 WHERE id IN (' +
            local.map(function () {
            return '?';
          }).join(',') + ')', local, function () {
            tx.executeSql('UPDATE ' + BY_SEQ_STORE +
              ' SET deleted = 1 WHERE seq IN (' + deleted.map(function () {
              return '?';
            }).join(',') + ')', deleted, callback);
          });
        });
      });
    });
  }

  // in this migration, we make all the local docs unversioned
  function runMigration3(tx, callback) {
    var local = 'CREATE TABLE IF NOT EXISTS ' + LOCAL_STORE +
      ' (id UNIQUE, rev, json)';
    tx.executeSql(local, [], function () {
      var sql = 'SELECT ' + DOC_STORE + '.id AS id, ' +
        BY_SEQ_STORE + '.json AS data ' +
        'FROM ' + BY_SEQ_STORE + ' JOIN ' +
        DOC_STORE + ' ON ' + BY_SEQ_STORE + '.seq = ' +
        DOC_STORE + '.winningseq WHERE local = 1';
      tx.executeSql(sql, [], function (tx, res) {
        var rows = [];
        for (var i = 0; i < res.rows.length; i++) {
          rows.push(res.rows.item(i));
        }
        function doNext() {
          if (!rows.length) {
            return callback();
          }
          var row = rows.shift();
          var rev = JSON.parse(row.data)._rev;
          tx.executeSql('INSERT INTO ' + LOCAL_STORE +
              ' (id, rev, json) VALUES (?,?,?)',
              [row.id, rev, row.data], function (tx) {
            tx.executeSql('DELETE FROM ' + DOC_STORE + ' WHERE id=?',
                [row.id], function (tx) {
              tx.executeSql('DELETE FROM ' + BY_SEQ_STORE + ' WHERE seq=?',
                  [row.seq], function () {
                doNext();
              });
            });
          });
        }
        doNext();
      });
    });
  }

  // in this migration, we remove doc_id_rev and just use rev
  function runMigration4(tx, callback) {

    function updateRows(rows, encoding) {
      function doNext() {
        if (!rows.length) {
          return callback();
        }
        var row = rows.shift();
        var doc_id_rev = parseHexString(row.hex, encoding);
        var idx = doc_id_rev.lastIndexOf('::');
        var doc_id = doc_id_rev.substring(0, idx);
        var rev = doc_id_rev.substring(idx + 2);
        var sql = 'UPDATE ' + BY_SEQ_STORE +
          ' SET doc_id=?, rev=? WHERE doc_id_rev=?';
        tx.executeSql(sql, [doc_id, rev, doc_id_rev], function () {
          doNext();
        });
      }
      doNext();
    }

    var sql = 'ALTER TABLE ' + BY_SEQ_STORE + ' ADD COLUMN doc_id';
    tx.executeSql(sql, [], function (tx) {
      var sql = 'ALTER TABLE ' + BY_SEQ_STORE + ' ADD COLUMN rev';
      tx.executeSql(sql, [], function (tx) {
        tx.executeSql(BY_SEQ_STORE_DOC_ID_REV_INDEX_SQL, [], function (tx) {
          var sql = 'SELECT hex(doc_id_rev) as hex FROM ' + BY_SEQ_STORE;
          tx.executeSql(sql, [], function (tx, res) {
            var rows = [];
            for (var i = 0; i < res.rows.length; i++) {
              rows.push(res.rows.item(i));
            }
            // it sucks, but we fetch the encoding twice
            tx.executeSql(
                'SELECT dbid, hex(dbid) AS hexId FROM ' + META_STORE, [],
              function (tx, result) {
                var id = result.rows.item(0).dbid;
                var hexId = result.rows.item(0).hexId;
                var encoding = (hexId.length === id.length * 2) ?
                  'UTF-8' : 'UTF-16';
                updateRows(rows, encoding);
              }
            );
          });
        });
      });
    });
  }

  function onGetInstanceId(tx) {
    while (idRequests.length > 0) {
      var idCallback = idRequests.pop();
      idCallback(null, instanceId);
    }
    checkDbEncoding(tx);
  }

  function checkDbEncoding(tx) {
    // check db encoding - utf-8 (chrome, opera) or utf-16 (safari)?
    tx.executeSql('SELECT dbid, hex(dbid) AS hexId FROM ' + META_STORE, [],
      function (tx, result) {
        var id = result.rows.item(0).dbid;
        var hexId = result.rows.item(0).hexId;
        encoding = (hexId.length === id.length * 2) ? 'UTF-8' : 'UTF-16';
      }
    );
  }

  function onGetVersion(tx, dbVersion) {
    if (dbVersion === 0) {
      // initial schema

      var meta = 'CREATE TABLE IF NOT EXISTS ' + META_STORE +
        ' (update_seq INTEGER, dbid, db_version INTEGER)';
      var attach = 'CREATE TABLE IF NOT EXISTS ' + ATTACH_STORE +
        ' (digest, json, body BLOB)';
      var doc = 'CREATE TABLE IF NOT EXISTS ' + DOC_STORE +
        ' (id unique, json, winningseq)';
      var seq = 'CREATE TABLE IF NOT EXISTS ' + BY_SEQ_STORE +
        ' (seq INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, ' +
        'json, deleted TINYINT(1), doc_id, rev)';
      var local = 'CREATE TABLE IF NOT EXISTS ' + LOCAL_STORE +
        ' (id UNIQUE, rev, json)';

      // creates
      tx.executeSql(attach);
      tx.executeSql(local);
      tx.executeSql(doc, [], function () {
        tx.executeSql(DOC_STORE_WINNINGSEQ_INDEX_SQL);
        tx.executeSql(seq, [], function () {
          tx.executeSql(BY_SEQ_STORE_DELETED_INDEX_SQL);
          tx.executeSql(BY_SEQ_STORE_DOC_ID_REV_INDEX_SQL);
          tx.executeSql(meta, [], function () {
            // mark the update_seq, db version, and new dbid
            var initSeq = 'INSERT INTO ' + META_STORE +
              ' (update_seq, db_version, dbid) VALUES (?, ?, ?)';
            instanceId = utils.uuid();
            var initSeqArgs = [0, ADAPTER_VERSION, instanceId];
            tx.executeSql(initSeq, initSeqArgs, function (tx) {
              onGetInstanceId(tx);
            });
          });
        });
      });
    } else { // version > 0

      var setupDone = function () {
        var migrated = dbVersion < ADAPTER_VERSION;
        if (migrated) {
          // update the db version within this transaction
          tx.executeSql('UPDATE ' + META_STORE + ' SET db_version = ' +
            ADAPTER_VERSION);
        }
        // notify db.id() callers
        var sql = 'SELECT dbid FROM ' + META_STORE;
        tx.executeSql(sql, [], function (tx, result) {
          instanceId = result.rows.item(0).dbid;
          onGetInstanceId(tx);
        });
      };

      // would love to use promises here, but then websql
      // ends the transaction early
      switch (dbVersion) {
        case 1:
          runMigration2(tx, function () {
            runMigration3(tx, function () {
              runMigration4(tx, setupDone);
            });
          });
          break;
        case 2:
          runMigration3(tx, function () {
            runMigration4(tx, setupDone);
          });
          break;
        case 3:
          runMigration4(tx, setupDone);
          break;
        default:
          setupDone();
          break;
      }
    }
  }

  function setup() {

    db.transaction(function (tx) {
      // first get the version
      tx.executeSql('SELECT sql FROM sqlite_master WHERE tbl_name = ' +
                    META_STORE, [], function (tx, result) {
        if (!result.rows.length) {
          // database hasn't even been created yet (version 0)
          onGetVersion(tx, 0);
        } else if (!/db_version/.test(result.rows.item(0).sql)) {
          // table was created, but without the new db_version column,
          // so add it.
          tx.executeSql('ALTER TABLE ' + META_STORE +
            ' ADD COLUMN db_version INTEGER', [], function () {
            // before version 2, this column didn't even exist
            onGetVersion(tx, 1);
          });
        } else { // column exists, we can safely get it
          tx.executeSql('SELECT db_version FROM ' + META_STORE, [],
            function (tx, result) {
            var dbVersion = result.rows.item(0).db_version;
            onGetVersion(tx, dbVersion);
          });
        }
      });
    }, unknownError(callback), dbCreated);
  }

  if (utils.isCordova() && typeof global !== 'undefined') {
    //to wait until custom api is made in pouch.adapters before doing setup
    global.addEventListener(name + '_pouch', function cordova_init() {
      global.removeEventListener(name + '_pouch', cordova_init, false);
      setup();
    }, false);
  } else {
    setup();
  }

  api.type = function () {
    return 'websql';
  };

  api._id = utils.toPromise(function (callback) {
    callback(null, instanceId);
  });

  api._info = function (callback) {
    db.readTransaction(function (tx) {
      countDocs(tx, function (docCount) {
        var sql = 'SELECT update_seq FROM ' + META_STORE;
        tx.executeSql(sql, [], function (tx, result) {
          var updateSeq = result.rows.item(0).update_seq;
          callback(null, {
            doc_count: docCount,
            update_seq: updateSeq
          });
        });
      });
    }, unknownError(callback));
  };

  api._bulkDocs = function (req, opts, callback) {

    var newEdits = opts.new_edits;
    var userDocs = req.docs;

    // Parse the docs, give them a sequence number for the result
    var docInfos = userDocs.map(function (doc, i) {
      if (doc._id && utils.isLocalId(doc._id)) {
        return doc;
      }
      var newDoc = utils.parseDoc(doc, newEdits);
      newDoc._bulk_seq = i;
      return newDoc;
    });

    var docInfoErrors = docInfos.filter(function (docInfo) {
      return docInfo.error;
    });
    if (docInfoErrors.length) {
      return callback(docInfoErrors[0]);
    }

    var tx;
    var results = new Array(docInfos.length);
    var updateSeq = 0;
    var fetchedDocs = new utils.Map();
    var numDocsWritten = 0;

    function complete() {
      var aresults = results.map(function (result) {
        if (result._bulk_seq) {
          delete result._bulk_seq;
        } else if (!Object.keys(result).length) {
          return {
            ok: true
          };
        }
        if (result.error) {
          return result;
        }

        var metadata = result.metadata;
        var rev = merge.winningRev(metadata);

        return {
          ok: true,
          id: metadata.id,
          rev: rev
        };
      });
      WebSqlPouch.Changes.notify(name);

      var updateseq = 'SELECT update_seq FROM ' + META_STORE;
      tx.executeSql(updateseq, [], function (tx, result) {
        var update_seq = result.rows.item(0).update_seq + updateSeq;
        var sql = 'UPDATE ' + META_STORE + ' SET update_seq=?';
        tx.executeSql(sql, [update_seq], function () {
          callback(null, aresults);
        });
      });
    }

    function preprocessAttachment(att, finish) {
      if (att.stub) {
        return finish();
      }
      if (typeof att.data === 'string') {
        try {
          att.data = atob(att.data);
        } catch (e) {
          var err = errors.error(errors.BAD_ARG,
                                "Attachments need to be base64 encoded");
          return callback(err);
        }
        var data = utils.fixBinary(att.data);
        att.data = utils.createBlob([data], {type: att.content_type});
      }
      var reader = new FileReader();
      reader.onloadend = function (e) {
        var binary = utils.arrayBufferToBinaryString(this.result);
        att.data = binary;
        utils.MD5(binary).then(function (result) {
          att.digest = 'md5-' + result;
          finish();
        });
      };
      reader.readAsArrayBuffer(att.data);
    }

    function preprocessAttachments(callback) {
      if (!docInfos.length) {
        return callback();
      }

      var docv = 0;

      docInfos.forEach(function (docInfo) {
        var attachments = docInfo.data && docInfo.data._attachments ?
          Object.keys(docInfo.data._attachments) : [];
        var recv = 0;

        if (!attachments.length) {
          return done();
        }

        function processedAttachment() {
          recv++;
          if (recv === attachments.length) {
            done();
          }
        }

        for (var key in docInfo.data._attachments) {
          if (docInfo.data._attachments.hasOwnProperty(key)) {
            preprocessAttachment(docInfo.data._attachments[key],
                                 processedAttachment);
          }
        }
      });

      function done() {
        docv++;
        if (docInfos.length === docv) {
          callback();
        }
      }
    }

    function writeDoc(docInfo, winningRev, deleted, callback, isUpdate,
                      resultsIdx) {

      function finish() {
        updateSeq++;
        var data = docInfo.data;
        var deletedInt = deleted ? 1 : 0;

        var id = data._id;
        var rev = data._rev;
        var json = stringifyDoc(data);
        var sql = 'INSERT INTO ' + BY_SEQ_STORE +
          ' (doc_id, rev, json, deleted) VALUES (?, ?, ?, ?);';
        var sqlArgs = [id, rev, json, deletedInt];

        tx.executeSql(sql, sqlArgs, function (tx, result) {
          dataWritten(tx, result.insertId);
        }, function () {
          // constraint error, recover by updating instead (see #1638)
          var fetchSql = select('seq', BY_SEQ_STORE, null,
            'doc_id=? AND rev=?');
          tx.executeSql(fetchSql, [id, rev], function (tx, res) {
            var seq = res.rows.item(0).seq;
            var sql = 'UPDATE ' + BY_SEQ_STORE +
              ' SET json=?, deleted=? WHERE doc_id=? AND rev=?;';
            var sqlArgs = [json, deletedInt, id, rev];
            tx.executeSql(sql, sqlArgs, function (tx) {
              updateSeq--; // discount, since it's an update, not a new seq
              dataWritten(tx, seq);
            });
          });
          return false; // ack that we've handled the error
        });
      }

      function collectResults(attachmentErr) {
        if (!err) {
          if (attachmentErr) {
            err = attachmentErr;
            callback(err);
          } else if (recv === attachments.length) {
            finish();
          }
        }
      }

      var err = null;
      var recv = 0;

      docInfo.data._id = docInfo.metadata.id;
      docInfo.data._rev = docInfo.metadata.rev;

      if (deleted) {
        docInfo.data._deleted = true;
      }

      var attachments = docInfo.data._attachments ?
        Object.keys(docInfo.data._attachments) : [];

      function attachmentSaved(err) {
        recv++;
        collectResults(err);
      }

      for (var key in docInfo.data._attachments) {
        if (!docInfo.data._attachments[key].stub) {
          var data = docInfo.data._attachments[key].data;
          delete docInfo.data._attachments[key].data;
          var digest = docInfo.data._attachments[key].digest;
          saveAttachment(docInfo, digest, data, attachmentSaved);
        } else {
          recv++;
          collectResults();
        }
      }

      if (!attachments.length) {
        finish();
      }

      function dataWritten(tx, seq) {
        docInfo.metadata.seq = seq;
        delete docInfo.metadata.rev;

        var sql = isUpdate ?
          'UPDATE ' + DOC_STORE +
          ' SET json=?, winningseq=(SELECT seq FROM ' + BY_SEQ_STORE +
          ' WHERE doc_id=' + DOC_STORE + '.id AND rev=?) WHERE id=?'
          : 'INSERT INTO ' + DOC_STORE +
          ' (id, winningseq, json) VALUES (?, ?, ?);';
        var metadataStr = vuvuzela.stringify(docInfo.metadata);
        var id = docInfo.metadata.id;
        var params = isUpdate ?
          [metadataStr, winningRev, id] :
          [id, seq, metadataStr];
        tx.executeSql(sql, params, function () {
          results[resultsIdx] = docInfo;
          fetchedDocs.set(id, docInfo.metadata);
          callback();
        });
      }
    }

    function updateDoc(oldDoc, docInfo, resultsIdx, callback) {
      var merged =
        merge.merge(oldDoc.rev_tree, docInfo.metadata.rev_tree[0], 1000);
      var deleted = utils.isDeleted(docInfo.metadata);
      var oldDocDeleted = utils.isDeleted(oldDoc);
      var inConflict = (oldDocDeleted && deleted && newEdits) ||
        (!oldDocDeleted && newEdits && merged.conflicts !== 'new_leaf');
      if (inConflict) {
        results[resultsIdx] = makeErr(errors.REV_CONFLICT, docInfo._bulk_seq);
        return callback();
      }

      docInfo.metadata.rev_tree = merged.tree;

      // recalculate
      var winningRev = merge.winningRev(docInfo.metadata);
      deleted = utils.isDeleted(docInfo.metadata, winningRev);

      writeDoc(docInfo, winningRev, deleted, callback, true, resultsIdx);
    }

    function insertDoc(docInfo, resultsIdx, callback) {
      // Cant insert new deleted documents
      var winningRev = merge.winningRev(docInfo.metadata);
      var deleted = utils.isDeleted(docInfo.metadata, winningRev);
      if ('was_delete' in opts && deleted) {
        results[resultsIdx] = errors.MISSING_DOC;
        return callback();
      }
      writeDoc(docInfo, winningRev, deleted, callback, false, resultsIdx);
    }

    function checkDoneWritingDocs() {
      if (++numDocsWritten === docInfos.length) {
        complete();
      }
    }

    function processDocs() {
      if (!docInfos.length) {
        return complete();
      }

      var idsToDocs = new utils.Map();

      docInfos.forEach(function (currentDoc, resultsIdx) {

        if (currentDoc._id && utils.isLocalId(currentDoc._id)) {
          api[currentDoc._deleted ? '_removeLocal' : '_putLocal'](
              currentDoc, {ctx: tx}, function (err, resp) {
            if (err) {
              results[resultsIdx] = err;
            } else {
              results[resultsIdx] = {};
            }
            checkDoneWritingDocs();
          });
          return;
        }

        var id = currentDoc.metadata.id;
        if (idsToDocs.has(id)) {
          idsToDocs.get(id).push([currentDoc, resultsIdx]);
        } else {
          idsToDocs.set(id, [[currentDoc, resultsIdx]]);
        }
      });

      // in the case of new_edits, the user can provide multiple docs
      // with the same id. these need to be processed sequentially
      idsToDocs.forEach(function (docs, id) {
        var numDone = 0;

        function docWritten() {
          checkDoneWritingDocs();
          if (++numDone < docs.length) {
            nextDoc();
          }
        }
        function nextDoc() {
          var value = docs[numDone];
          var currentDoc = value[0];
          var resultsIdx = value[1];

          if (fetchedDocs.has(id)) {
            updateDoc(fetchedDocs.get(id), currentDoc, resultsIdx, docWritten);
          } else {
            insertDoc(currentDoc, resultsIdx, docWritten);
          }
        }
        nextDoc();
      });
    }

    function fetchExistingDocs(callback) {
      if (!docInfos.length) {
        return callback();
      }

      var numFetched = 0;

      function checkDone() {
        if (++numFetched === docInfos.length) {
          callback();
        }
      }

      docInfos.forEach(function (docInfo) {
        if (docInfo._id && utils.isLocalId(docInfo._id)) {
          return checkDone(); // skip local docs
        }
        var id = docInfo.metadata.id;
        tx.executeSql('SELECT json FROM ' + DOC_STORE +
          ' WHERE id = ?', [id], function (tx, result) {
          if (result.rows.length) {
            var metadata = vuvuzela.parse(result.rows.item(0).json);
            fetchedDocs.set(id, metadata);
          }
          checkDone();
        });
      });
    }

    // Insert sequence number into the error so we can sort later
    function makeErr(err, seq) {
      err._bulk_seq = seq;
      return err;
    }

    function saveAttachment(docInfo, digest, data, callback) {
      var ref = [docInfo.metadata.id, docInfo.metadata.rev].join('@');
      var newAtt = {digest: digest};
      var sql = 'SELECT digest, json FROM ' + ATTACH_STORE + ' WHERE digest=?';
      tx.executeSql(sql, [digest], function (tx, result) {
        if (!result.rows.length) {
          newAtt.refs = {};
          newAtt.refs[ref] = true;
          sql = 'INSERT INTO ' + ATTACH_STORE +
                '(digest, json, body) VALUES (?, ?, ?)';
          tx.executeSql(sql, [digest, JSON.stringify(newAtt), data],
            function () {
            callback();
          });
        } else {
          newAtt.refs = JSON.parse(result.rows.item(0).json).refs;
          sql = 'UPDATE ' + ATTACH_STORE + ' SET json=?, body=? WHERE digest=?';
          tx.executeSql(sql, [JSON.stringify(newAtt), data, digest],
            function () {
            callback();
          });
        }
      });
    }

    preprocessAttachments(function () {
      db.transaction(function (txn) {
        tx = txn;
        fetchExistingDocs(processDocs);
      }, unknownError(callback), function () {
        docCount = -1;
      });
    });
  };

  api._get = function (id, opts, callback) {
    opts = utils.clone(opts);
    var doc;
    var metadata;
    var err;
    if (!opts.ctx) {
      db.readTransaction(function (txn) {
        opts.ctx = txn;
        api._get(id, opts, callback);
      });
      return;
    }
    var tx = opts.ctx;

    function finish() {
      callback(err, {doc: doc, metadata: metadata, ctx: tx});
    }

    var sql;
    var sqlArgs;
    if (opts.rev) {
      sql = select(
        SELECT_DOCS,
        [DOC_STORE, BY_SEQ_STORE],
        DOC_STORE + '.id=' + BY_SEQ_STORE + '.doc_id',
        [BY_SEQ_STORE + '.doc_id=?', BY_SEQ_STORE + '.rev=?']);
      sqlArgs = [id, opts.rev];
    } else {
      sql = select(
        SELECT_DOCS,
        [DOC_STORE, BY_SEQ_STORE],
        DOC_STORE_AND_BY_SEQ_JOINER,
        DOC_STORE + '.id=?');
      sqlArgs = [id];
    }
    tx.executeSql(sql, sqlArgs, function (a, results) {
      if (!results.rows.length) {
        err = errors.MISSING_DOC;
        return finish();
      }
      var item = results.rows.item(0);
      metadata = vuvuzela.parse(item.metadata);
      if (item.deleted && !opts.rev) {
        err = errors.error(errors.MISSING_DOC, 'deleted');
        return finish();
      }
      doc = unstringifyDoc(item.data, metadata.id, item.rev);
      finish();
    });
  };

  function countDocs(tx, callback) {

    if (docCount !== -1) {
      return callback(docCount);
    }

    // count the total rows
    var sql = select(
      'COUNT(' + DOC_STORE + '.id) AS \'num\'',
      [DOC_STORE, BY_SEQ_STORE],
      DOC_STORE_AND_BY_SEQ_JOINER,
      BY_SEQ_STORE + '.deleted=0');

    tx.executeSql(sql, [], function (tx, result) {
      docCount = result.rows.item(0).num;
      callback(docCount);
    });
  }

  api._allDocs = function (opts, callback) {
    var results = [];
    var totalRows;

    var start = 'startkey' in opts ? opts.startkey : false;
    var end = 'endkey' in opts ? opts.endkey : false;
    var key = 'key' in opts ? opts.key : false;
    var descending = 'descending' in opts ? opts.descending : false;
    var limit = 'limit' in opts ? opts.limit : -1;
    var offset = 'skip' in opts ? opts.skip : 0;
    var inclusiveEnd = opts.inclusive_end !== false;

    var sqlArgs = [];
    var criteria = [];

    if (key !== false) {
      criteria.push(DOC_STORE + '.id = ?');
      sqlArgs.push(key);
    } else if (start !== false || end !== false) {
      if (start !== false) {
        criteria.push(DOC_STORE + '.id ' + (descending ? '<=' : '>=') + ' ?');
        sqlArgs.push(start);
      }
      if (end !== false) {
        var comparator = descending ? '>' : '<';
        if (inclusiveEnd) {
          comparator += '=';
        }
        criteria.push(DOC_STORE + '.id ' + comparator + ' ?');
        sqlArgs.push(end);
      }
      if (key !== false) {
        criteria.push(DOC_STORE + '.id = ?');
        sqlArgs.push(key);
      }
    }

    if (opts.deleted !== 'ok') {
      // report deleted if keys are specified
      criteria.push(BY_SEQ_STORE + '.deleted = 0');
    }

    db.readTransaction(function (tx) {

      // first count up the total rows
      countDocs(tx, function (count) {
        totalRows = count;

        if (limit === 0) {
          return;
        }

        // then actually fetch the documents
        var sql = select(
          SELECT_DOCS,
          [DOC_STORE, BY_SEQ_STORE],
          DOC_STORE_AND_BY_SEQ_JOINER,
          criteria,
          DOC_STORE + '.id ' + (descending ? 'DESC' : 'ASC')
          );
        sql += ' LIMIT ' + limit + ' OFFSET ' + offset;

        tx.executeSql(sql, sqlArgs, function (tx, result) {
          for (var i = 0, l = result.rows.length; i < l; i++) {
            var item = result.rows.item(i);
            var metadata = vuvuzela.parse(item.metadata);
            var data = unstringifyDoc(item.data, metadata.id, item.rev);
            var winningRev = data._rev;
            var doc = {
              id: metadata.id,
              key: metadata.id,
              value: {rev: winningRev}
            };
            if (opts.include_docs) {
              doc.doc = data;
              doc.doc._rev = winningRev;
              if (opts.conflicts) {
                doc.doc._conflicts = merge.collectConflicts(metadata);
              }
              for (var att in doc.doc._attachments) {
                if (doc.doc._attachments.hasOwnProperty(att)) {
                  doc.doc._attachments[att].stub = true;
                }
              }
            }
            if (item.deleted) {
              if (opts.deleted === 'ok') {
                doc.value.deleted = true;
                doc.doc = null;
              } else {
                continue;
              }
            }
            results.push(doc);
          }
        });
      });
    }, unknownError(callback), function () {
      callback(null, {
        total_rows: totalRows,
        offset: opts.skip,
        rows: results
      });
    });
  };

  api._changes = function (opts) {
    opts = utils.clone(opts);

    if (opts.continuous) {
      var id = name + ':' + utils.uuid();
      WebSqlPouch.Changes.addListener(name, id, api, opts);
      WebSqlPouch.Changes.notify(name);
      return {
        cancel: function () {
          WebSqlPouch.Changes.removeListener(name, id);
        }
      };
    }

    var descending = opts.descending;

    // Ignore the `since` parameter when `descending` is true
    opts.since = opts.since && !descending ? opts.since : 0;

    var limit = 'limit' in opts ? opts.limit : -1;
    if (limit === 0) {
      limit = 1; // per CouchDB _changes spec
    }

    var returnDocs;
    if ('returnDocs' in opts) {
      returnDocs = opts.returnDocs;
    } else {
      returnDocs = true;
    }
    var results = [];
    var numResults = 0;
    function fetchChanges() {

      var criteria = [
        DOC_STORE + '.winningseq > ' + opts.since
      ];
      var sqlArgs = [];
      if (opts.doc_ids) {
        criteria.push(DOC_STORE + '.id IN (' + opts.doc_ids.map(function () {
          return '?';
        }).join(',') + ')');
        sqlArgs = opts.doc_ids;
      }

      var sql = select(SELECT_DOCS, [DOC_STORE, BY_SEQ_STORE],
        DOC_STORE_AND_BY_SEQ_JOINER, criteria,
        DOC_STORE + '.winningseq ' + (descending ? 'DESC' : 'ASC'));

      var filter = utils.filterChange(opts);
      if (!opts.view && !opts.filter) {
        // we can just limit in the query
        sql += ' LIMIT ' + limit;
      }

      db.readTransaction(function (tx) {
        tx.executeSql(sql, sqlArgs, function (tx, result) {
          var lastSeq = 0;
          for (var i = 0, l = result.rows.length; i < l; i++) {
            var res = result.rows.item(i);
            var metadata = vuvuzela.parse(res.metadata);
            if (lastSeq < res.seq) {
              lastSeq = res.seq;
            }
            var doc = unstringifyDoc(res.data, metadata.id, res.rev);
            var change = opts.processChange(doc, metadata, opts);
            change.seq = res.seq;
            if (filter(change)) {
              numResults++;
              if (returnDocs) {
                results.push(change);
              }
              opts.onChange(change);
            }
            if (numResults === limit) {
              break;
            }
          }
          if (!opts.continuous) {
            opts.complete(null, {
              results: results,
              last_seq: lastSeq
            });
          }
        });
      });
    }

    fetchChanges();
  };

  api._close = function (callback) {
    //WebSQL databases do not need to be closed
    callback();
  };

  api._getAttachment = function (attachment, opts, callback) {
    var res;
    var tx = opts.ctx;
    var digest = attachment.digest;
    var type = attachment.content_type;
    var sql = 'SELECT hex(body) as body FROM ' + ATTACH_STORE +
              ' WHERE digest=?';
    tx.executeSql(sql, [digest], function (tx, result) {
      // sqlite normally stores data as utf8, so even the hex() function
      // "encodes" the binary data in utf8/16 before returning it. yet hex()
      // is the only way to get the full data, so we do this.
      var data = parseHexString(result.rows.item(0).body, encoding);
      if (opts.encode) {
        res = btoa(data);
      } else {
        data = utils.fixBinary(data);
        res = utils.createBlob([data], {type: type});
      }
      callback(null, res);
    });
  };

  api._getRevisionTree = function (docId, callback) {
    db.readTransaction(function (tx) {
      var sql = 'SELECT json AS metadata FROM ' + DOC_STORE + ' WHERE id = ?';
      tx.executeSql(sql, [docId], function (tx, result) {
        if (!result.rows.length) {
          callback(errors.MISSING_DOC);
        } else {
          var data = vuvuzela.parse(result.rows.item(0).metadata);
          callback(null, data.rev_tree);
        }
      });
    });
  };

  api._doCompaction = function (docId, rev_tree, revs, callback) {
    if (!revs.length) {
      return callback();
    }
    db.transaction(function (tx) {
      var sql = 'SELECT json AS metadata FROM ' + DOC_STORE + ' WHERE id = ?';
      tx.executeSql(sql, [docId], function (tx, result) {
        if (!result.rows.length) {
          return utils.call(callback);
        }
        var metadata = vuvuzela.parse(result.rows.item(0).metadata);
        metadata.rev_tree = rev_tree;

        var numDone = 0;
        revs.forEach(function (rev) {
          var sql = 'DELETE FROM ' + BY_SEQ_STORE + ' WHERE doc_id=? AND rev=?';
          tx.executeSql(sql, [docId, rev], function (tx) {
            if (++numDone === revs.length) {
              var sql = 'UPDATE ' + DOC_STORE + ' SET json = ? WHERE id = ?';
              tx.executeSql(sql, [vuvuzela.stringify(metadata), docId],
                function () {
                callback();
              });
            }
          });
        });
      });
    });
  };

  api._getLocal = function (id, callback) {
    db.readTransaction(function (tx) {
      var sql = 'SELECT json, rev FROM ' + LOCAL_STORE + ' WHERE id=?';
      tx.executeSql(sql, [id], function (tx, res) {
        if (res.rows.length) {
          var item = res.rows.item(0);
          var doc = unstringifyDoc(item.json, id, item.rev);
          callback(null, doc);
        } else {
          callback(errors.MISSING_DOC);
        }
      });
    });
  };

  api._putLocal = function (doc, opts, callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    delete doc._revisions; // ignore this, trust the rev
    var oldRev = doc._rev;
    var id = doc._id;
    var newRev;
    if (!oldRev) {
      newRev = doc._rev = '0-1';
    } else {
      newRev = doc._rev = '0-' + (parseInt(oldRev.split('-')[1], 10) + 1);
    }
    var json = stringifyDoc(doc);

    var ret;
    function putLocal(tx) {
      var sql;
      var values;
      if (oldRev) {
        sql = 'UPDATE ' + LOCAL_STORE + ' SET rev=?, json=? ' +
          'WHERE id=? AND rev=?';
        values = [newRev, json, id, oldRev];
      } else {
        sql = 'INSERT INTO ' + LOCAL_STORE + ' (id, rev, json) VALUES (?,?,?)';
        values = [id, newRev, json];
      }
      tx.executeSql(sql, values, function (tx, res) {
        if (res.rowsAffected) {
          ret = {ok: true, id: id, rev: newRev};
          if (opts.ctx) { // return immediately
            callback(null, ret);
          }
        } else {
          callback(errors.REV_CONFLICT);
        }
      }, function () {
        callback(errors.REV_CONFLICT);
        return false; // ack that we handled the error
      });
    }

    if (opts.ctx) {
      putLocal(opts.ctx);
    } else {
      db.transaction(function (tx) {
        putLocal(tx);
      }, unknownError(callback), function () {
        if (ret) {
          callback(null, ret);
        }
      });
    }
  };

  api._removeLocal = function (doc, callback) {
    var ret;
    db.transaction(function (tx) {
      var sql = 'DELETE FROM ' + LOCAL_STORE + ' WHERE id=? AND rev=?';
      var params = [doc._id, doc._rev];
      tx.executeSql(sql, params, function (tx, res) {
        if (!res.rowsAffected) {
          return callback(errors.REV_CONFLICT);
        }
        ret = {ok: true, id: doc._id, rev: '0-0'};
      });
    }, unknownError(callback), function () {
      callback(null, ret);
    });
  };
}

WebSqlPouch.valid = function () {
  if (typeof global !== 'undefined') {
    if (global.navigator &&
        global.navigator.sqlitePlugin &&
        global.navigator.sqlitePlugin.openDatabase) {
      return true;
    } else if (global.sqlitePlugin && global.sqlitePlugin.openDatabase) {
      return true;
    } else if (global.openDatabase) {
      return true;
    }
  }
  return false;
};

WebSqlPouch.destroy = utils.toPromise(function (name, opts, callback) {
  WebSqlPouch.Changes.removeAllListeners(name);
  var size = getSize(opts);
  var db = openDB(name, POUCH_VERSION, name, size);
  db.transaction(function (tx) {
    var stores = [DOC_STORE, BY_SEQ_STORE, ATTACH_STORE, META_STORE,
      LOCAL_STORE];
    stores.forEach(function (store) {
      tx.executeSql('DROP TABLE IF EXISTS ' + store, []);
    });
  }, unknownError(callback), function () {
    if (utils.hasLocalStorage()) {
      delete global.localStorage['_pouch__websqldb_' + name];
      delete global.localStorage[name];
    }
    callback(null, {'ok': true});
  });
});

WebSqlPouch.Changes = new utils.Changes();

module.exports = WebSqlPouch;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../deps/errors":12,"../merge":19,"../utils":24,"vuvuzela":56}],7:[function(require,module,exports){
'use strict';
var utils = require('./utils');
var merge = require('./merge');
var errors = require('./deps/errors');
var EE = require('events').EventEmitter;
var evalFilter = require('./evalFilter');
var evalView = require('./evalView');
module.exports = Changes;
utils.inherits(Changes, EE);

function Changes(db, opts, callback) {
  EE.call(this);
  var self = this;
  this.db = db;
  opts = opts ? utils.clone(opts) : {};
  var oldComplete = callback || opts.complete || function () {};
  var complete = opts.complete = utils.once(function (err, resp) {
    if (err) {
      self.emit('error', err);
    } else {
      self.emit('complete', resp);
    }
    self.removeAllListeners();
    db.removeListener('destroyed', onDestroy);
  });
  if (oldComplete) {
    self.on('complete', function (resp) {
      oldComplete(null, resp);
    });
    self.on('error', function (err) {
      oldComplete(err);
    });
  }
  var oldOnChange = opts.onChange;
  if (oldOnChange) {
    self.on('change', oldOnChange);
  }
  function onDestroy() {
    self.cancel();
  }
  db.once('destroyed', onDestroy);

  opts.onChange = function (change) {
    if (opts.isCancelled) {
      return;
    }
    self.emit('change', change);
    if (self.startSeq && self.startSeq <= change.seq) {
      self.emit('uptodate');
      self.startSeq = false;
    }
    if (change.deleted) {
      self.emit('delete', change);
    } else if (change.changes.length === 1 &&
      change.changes[0].rev.slice(0, 2) === '1-') {
      self.emit('create', change);
    } else {
      self.emit('update', change);
    }
  };

  var promise = new utils.Promise(function (fulfill, reject) {
    opts.complete = function (err, res) {
      if (err) {
        reject(err);
      } else {
        fulfill(res);
      }
    };
  });
  self.once('cancel', function () {
    if (oldOnChange) {
      self.removeListener('change', oldOnChange);
    }
    opts.complete(null, {status: 'cancelled'});
  });
  this.then = promise.then.bind(promise);
  this['catch'] = promise['catch'].bind(promise);
  this.then(function (result) {
    complete(null, result);
  }, complete);



  if (!db.taskqueue.isReady) {
    db.taskqueue.addTask(function () {
      if (self.isCancelled) {
        self.emit('cancel');
      } else {
        self.doChanges(opts);
      }
    });
  } else {
    self.doChanges(opts);
  }
}
Changes.prototype.cancel = function () {
  this.isCancelled = true;
  if (this.db.taskqueue.isReady) {
    this.emit('cancel');
  }
};
function processChange(doc, metadata, opts) {
  var changeList = [{rev: doc._rev}];
  if (opts.style === 'all_docs') {
    changeList = merge.collectLeaves(metadata.rev_tree)
    .map(function (x) { return {rev: x.rev}; });
  }
  var change = {
    id: metadata.id,
    changes: changeList,
    doc: doc
  };

  if (utils.isDeleted(metadata, doc._rev)) {
    change.deleted = true;
  }
  if (opts.conflicts) {
    change.doc._conflicts = merge.collectConflicts(metadata);
    if (!change.doc._conflicts.length) {
      delete change.doc._conflicts;
    }
  }
  return change;
}

Changes.prototype.doChanges = function (opts) {
  var self = this;
  var callback = opts.complete;

  opts = utils.clone(opts);
  if ('live' in opts && !('continuous' in opts)) {
    opts.continuous = opts.live;
  }
  opts.processChange = processChange;

  if (opts.since === 'latest') {
    opts.since = 'now';
  }
  if (!opts.since) {
    opts.since = 0;
  }
  if (opts.since === 'now') {
    this.db.info().then(function (info) {
      if (self.isCancelled) {
        callback(null, {status: 'cancelled'});
        return;
      }
      opts.since = info.update_seq  - 1;
      self.doChanges(opts);
    }, callback);
    return;
  }

  if (opts.continuous && opts.since !== 'now') {
    this.db.info().then(function (info) {
      self.startSeq = info.update_seq - 1;
    }, function (err) {
      if (err.id === 'idbNull') {
        //db closed before this returned
        //thats ok
        return;
      }
      throw err;
    });
  }

  if (this.db.type() !== 'http' &&
    opts.filter && typeof opts.filter === 'string') {
    return this.filterChanges(opts);
  }

  if (!('descending' in opts)) {
    opts.descending = false;
  }

  // 0 and 1 should return 1 document
  opts.limit = opts.limit === 0 ? 1 : opts.limit;
  opts.complete = callback;
  var newPromise = this.db._changes(opts);
  if (newPromise && typeof newPromise.cancel === 'function') {
    var cancel = self.cancel;
    self.cancel = utils.getArguments(function (args) {
      newPromise.cancel();
      cancel.apply(this, args);
    });
  }
};

Changes.prototype.filterChanges = function (opts) {
  var self = this;
  var callback = opts.complete;
  if (opts.filter === '_view') {
    if (!opts.view || typeof opts.view !== 'string') {
      var err = new  Error('`view` filter parameter is not provided.');
      err.status = errors.BAD_REQUEST.status;
      err.name = errors.BAD_REQUEST.name;
      err.error = true;
      callback(err);
      return;
    }
    // fetch a view from a design doc, make it behave like a filter
    var viewName = opts.view.split('/');
    this.db.get('_design/' + viewName[0], function (err, ddoc) {
      if (self.isCancelled) {
        callback(null, {status: 'cancelled'});
        return;
      }
      if (err) {
        callback(err);
        return;
      }
      if (ddoc && ddoc.views && ddoc.views[viewName[1]]) {
        
        var filter = evalView(ddoc.views[viewName[1]].map);
        opts.filter = filter;
        self.doChanges(opts);
        return;
      }
      var msg = ddoc.views ? 'missing json key: ' + viewName[1] :
        'missing json key: views';
      if (!err) {
        err = new  Error(msg);
        err.status = errors.MISSING_DOC.status;
        err.name = errors.MISSING_DOC.name;
        err.error = true;
      }
      callback(err);
      return;
    });
  } else {
    // fetch a filter from a design doc
    var filterName = opts.filter.split('/');
    this.db.get('_design/' + filterName[0], function (err, ddoc) {
      if (self.isCancelled) {
        callback(null, {status: 'cancelled'});
        return;
      }
      if (err) {
        callback(err);
        return;
      }
      if (ddoc && ddoc.filters && ddoc.filters[filterName[1]]) {
        var filter = evalFilter(ddoc.filters[filterName[1]]);
        opts.filter = filter;
        self.doChanges(opts);
        return;
      } else {
        var msg = (ddoc && ddoc.filters) ? 'missing json key: ' + filterName[1]
          : 'missing json key: filters';
        if (!err) {
          err = new  Error(msg);
          err.status = errors.MISSING_DOC.status;
          err.name = errors.MISSING_DOC.name;
          err.error = true;
        }
        callback(err);
        return;
      }
    });
  }
};
},{"./deps/errors":12,"./evalFilter":16,"./evalView":17,"./merge":19,"./utils":24,"events":94}],8:[function(require,module,exports){
(function (global){
/*globals cordova */
"use strict";

var Adapter = require('./adapter');
var utils = require('./utils');
var TaskQueue = require('./taskqueue');
var Promise = utils.Promise;

function defaultCallback(err) {
  if (err && global.debug) {
    console.error(err);
  }
}

utils.inherits(PouchDB, Adapter);
function PouchDB(name, opts, callback) {

  if (!(this instanceof PouchDB)) {
    return new PouchDB(name, opts, callback);
  }
  var self = this;
  if (typeof opts === 'function' || typeof opts === 'undefined') {
    callback = opts;
    opts = {};
  }

  if (name && typeof name === 'object') {
    opts = name;
    name = undefined;
  }
  if (typeof callback === 'undefined') {
    callback = defaultCallback;
  }
  opts = opts || {};
  var oldCB = callback;
  self.auto_compaction = opts.auto_compaction;
  self.prefix = PouchDB.prefix;
  Adapter.call(self);
  self.taskqueue = new TaskQueue();
  var promise = new Promise(function (fulfill, reject) {
    callback = function (err, resp) {
      if (err) {
        return reject(err);
      }
      delete resp.then;
      fulfill(resp);
    };
  
    opts = utils.clone(opts);
    var originalName = opts.name || name;
    var backend, error;
    (function () {
      try {

        if (typeof originalName !== 'string') {
          error = new Error('Missing/invalid DB name');
          error.code = 400;
          throw error;
        }

        backend = PouchDB.parseAdapter(originalName, opts);
        
        opts.originalName = originalName;
        opts.name = backend.name;
        if (opts.prefix && backend.adapter !== 'http' &&
            backend.adapter !== 'https') {
          opts.name = opts.prefix + opts.name;
        }
        opts.adapter = opts.adapter || backend.adapter;
        self._adapter = opts.adapter;
        self._db_name = originalName;
        if (!PouchDB.adapters[opts.adapter]) {
          error = new Error('Adapter is missing');
          error.code = 404;
          throw error;
        }

        if (!PouchDB.adapters[opts.adapter].valid()) {
          error = new Error('Invalid Adapter');
          error.code = 404;
          throw error;
        }
      } catch (err) {
        self.taskqueue.fail(err);
        self.changes = utils.toPromise(function (opts) {
          if (opts.complete) {
            opts.complete(err);
          }
        });
      }
    }());
    if (error) {
      return reject(error); // constructor error, see above
    }
    self.adapter = opts.adapter;

    // needs access to PouchDB;
    self.replicate = {};

    self.replicate.from = function (url, opts, callback) {
      return self.constructor.replicate(url, self, opts, callback);
    };

    self.replicate.to = function (url, opts, callback) {
      return self.constructor.replicate(self, url, opts, callback);
    };

    self.sync = function (dbName, opts, callback) {
      return self.constructor.sync(self, dbName, opts, callback);
    };

    self.replicate.sync = self.sync;

    self.destroy = utils.adapterFun('destroy', function (callback) {
      var self = this;
      self.info(function (err, info) {
        if (err) {
          return callback(err);
        }
        self.constructor.destroy(info.db_name, callback);
      });
    });

    PouchDB.adapters[opts.adapter].call(self, opts, function (err, db) {
      if (err) {
        if (callback) {
          self.taskqueue.fail(err);
          callback(err);
        }
        return;
      }
      function destructionListener(event) {
        if (event === 'destroyed') {
          self.emit('destroyed');
          PouchDB.removeListener(originalName, destructionListener);
        }
      }
      PouchDB.on(originalName, destructionListener);
      self.emit('created', self);
      PouchDB.emit('created', opts.originalName);
      self.taskqueue.ready(self);
      callback(null, self);
      
    });
    if (opts.skipSetup) {
      self.taskqueue.ready(self);
    }

    if (utils.isCordova()) {
      //to inform websql adapter that we can use api
      cordova.fireWindowEvent(opts.name + "_pouch", {});
    }
  });
  promise.then(function (resp) {
    oldCB(null, resp);
  }, oldCB);
  self.then = promise.then.bind(promise);
  self["catch"] = promise["catch"].bind(promise);

}

module.exports = PouchDB;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./adapter":2,"./taskqueue":23,"./utils":24}],9:[function(require,module,exports){
"use strict";

var createBlob = require('./blob.js');
var errors = require('./errors');
var utils = require("../utils");
var hasUpload;

function ajax(options, adapterCallback) {

  var requestCompleted = false;
  var callback = utils.getArguments(function (args) {
    if (requestCompleted) {
      return;
    }
    adapterCallback.apply(this, args);
    requestCompleted = true;
  });

  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = utils.clone(options);

  var defaultOptions = {
    method : "GET",
    headers: {},
    json: true,
    processData: true,
    timeout: 10000,
    cache: false
  };

  options = utils.extend(true, defaultOptions, options);

  // cache-buster, specifically designed to work around IE's aggressive caching
  // see http://www.dashbay.com/2011/05/internet-explorer-caches-ajax/
  if (options.method === 'GET' && !options.cache) {
    var hasArgs = options.url.indexOf('?') !== -1;
    options.url += (hasArgs ? '&' : '?') + '_nonce=' + utils.uuid(16);
  }

  function onSuccess(obj, resp, cb) {
    if (!options.binary && !options.json && options.processData &&
      typeof obj !== 'string') {
      obj = JSON.stringify(obj);
    } else if (!options.binary && options.json && typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch (e) {
        // Probably a malformed JSON from server
        return cb(e);
      }
    }
    if (Array.isArray(obj)) {
      obj = obj.map(function (v) {
        var obj;
        if (v.ok) {
          return v;
        } else if (v.error && v.error === 'conflict') {
          obj = errors.REV_CONFLICT;
          obj.id = v.id;
          return obj;
        } else if (v.error && v.error === 'forbidden') {
          obj = errors.FORBIDDEN;
          obj.id = v.id;
          obj.reason = v.reason;
          return obj;
        } else if (v.missing) {
          obj = errors.MISSING_DOC;
          obj.missing = v.missing;
          return obj;
        } else {
          return v;
        }
      });
    }
    cb(null, obj, resp);
  }

  function onError(err, cb) {
    var errParsed, errObj, errType, key;
    try {
      errParsed = JSON.parse(err.responseText);
      //would prefer not to have a try/catch clause
      for (key in errors) {
        if (errors.hasOwnProperty(key) &&
            errors[key].name === errParsed.error) {
          errType = errors[key];
          break;
        }
      }
      if (!errType) {
        errType = errors.UNKNOWN_ERROR;
        if (err.status) {
          errType.status = err.status;
        }
        if (err.statusText) {
          err.name = err.statusText;
        }
      }
      errObj = errors.error(errType, errParsed.reason);
    } catch (e) {
      for (var key in errors) {
        if (errors.hasOwnProperty(key) && errors[key].status === err.status) {
          errType = errors[key];
          break;
        }
      }
      if (!errType) {
        errType = errors.UNKNOWN_ERROR;
        if (err.status) {
          errType.status = err.status;
        }
        if (err.statusText) {
          err.name = err.statusText;
        }
      }
      errObj = errors.error(errType);
    }
    if (err.withCredentials && err.status === 0) {
      // apparently this is what we get when the method
      // is reported as not allowed by CORS. so fudge it
      errObj.status = 405;
      errObj.statusText = "Method Not Allowed";
    }
    cb(errObj);
  }

  var timer;
  var xhr;
  if (options.xhr) {
    xhr = new options.xhr();
  } else {
    xhr = new XMLHttpRequest();
  }
  xhr.open(options.method, options.url);
  xhr.withCredentials = true;

  if (options.json) {
    options.headers.Accept = 'application/json';
    options.headers['Content-Type'] = options.headers['Content-Type'] ||
      'application/json';
    if (options.body &&
        options.processData &&
        typeof options.body !== "string") {
      options.body = JSON.stringify(options.body);
    }
  }

  if (options.binary) {
    xhr.responseType = 'arraybuffer';
  }

  var createCookie = function (name, value, days) {
    var expires = "";
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toGMTString();
    }
    document.cookie = name + "=" + value + expires + "; path=/";
  };

  for (var key in options.headers) {
    if (key === 'Cookie') {
      var cookie = options.headers[key].split('=');
      createCookie(cookie[0], cookie[1], 10);
    } else {
      xhr.setRequestHeader(key, options.headers[key]);
    }
  }

  if (!("body" in options)) {
    options.body = null;
  }

  var abortReq = function () {
    if (requestCompleted) {
      return;
    }
    xhr.abort();
    onError(xhr, callback);
  };

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4 || requestCompleted) {
      return;
    }
    clearTimeout(timer);
    if (xhr.status >= 200 && xhr.status < 300) {
      var data;
      if (options.binary) {
        data = createBlob([xhr.response || ''], {
          type: xhr.getResponseHeader('Content-Type')
        });
      } else {
        data = xhr.responseText;
      }
      onSuccess(data, xhr, callback);
    } else {
      onError(xhr, callback);
    }
  };

  if (options.timeout > 0) {
    timer = setTimeout(abortReq, options.timeout);
    xhr.onprogress = function () {
      clearTimeout(timer);
      timer = setTimeout(abortReq, options.timeout);
    };
    if (typeof hasUpload === 'undefined') {
      // IE throws an error if you try to access it directly
      hasUpload = Object.keys(xhr).indexOf('upload') !== -1;
    }
    if (hasUpload) { // does not exist in ie9
      xhr.upload.onprogress = xhr.onprogress;
    }
  }
  if (options.body && (options.body instanceof Blob)) {
    var reader = new FileReader();
    reader.onloadend = function (e) {

      var binary = "";
      var bytes = new Uint8Array(this.result);
      var length = bytes.byteLength;

      for (var i = 0; i < length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      binary = utils.fixBinary(binary);
      xhr.send(binary);
    };
    reader.readAsArrayBuffer(options.body);
  } else {
    xhr.send(options.body);
  }
  return {abort: abortReq};
}

module.exports = ajax;

},{"../utils":24,"./blob.js":10,"./errors":12}],10:[function(require,module,exports){
(function (global){
"use strict";

//Abstracts constructing a Blob object, so it also works in older
//browsers that don't support the native Blob constructor. (i.e.
//old QtWebKit versions, at least).
function createBlob(parts, properties) {
  parts = parts || [];
  properties = properties || {};
  try {
    return new Blob(parts, properties);
  } catch (e) {
    if (e.name !== "TypeError") {
      throw e;
    }
    var BlobBuilder = global.BlobBuilder ||
                      global.MSBlobBuilder ||
                      global.MozBlobBuilder ||
                      global.WebKitBlobBuilder;
    var builder = new BlobBuilder();
    for (var i = 0; i < parts.length; i += 1) {
      builder.append(parts[i]);
    }
    return builder.getBlob(properties.type);
  }
}

module.exports = createBlob;


}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],11:[function(require,module,exports){
'use strict';
exports.Map = LazyMap; // TODO: use ES6 map
exports.Set = LazySet; // TODO: use ES6 set
// based on https://github.com/montagejs/collections
function LazyMap() {
  this.store = {};
}
LazyMap.prototype.mangle = function (key) {
  if (typeof key !== "string") {
    throw new TypeError("key must be a string but Got " + key);
  }
  return '$' + key;
};
LazyMap.prototype.unmangle = function (key) {
  return key.substring(1);
};
LazyMap.prototype.get = function (key) {
  var mangled = this.mangle(key);
  if (mangled in this.store) {
    return this.store[mangled];
  } else {
    return void 0;
  }
};
LazyMap.prototype.set = function (key, value) {
  var mangled = this.mangle(key);
  this.store[mangled] = value;
  return true;
};
LazyMap.prototype.has = function (key) {
  var mangled = this.mangle(key);
  return mangled in this.store;
};
LazyMap.prototype["delete"] = function (key) {
  var mangled = this.mangle(key);
  if (mangled in this.store) {
    delete this.store[mangled];
    return true;
  }
  return false;
};
LazyMap.prototype.forEach = function (cb) {
  var self = this;
  var keys = Object.keys(self.store);
  keys.forEach(function (key) {
    var value = self.store[key];
    key = self.unmangle(key);
    cb(value, key);
  });
};

function LazySet() {
  this.store = new LazyMap();
}
LazySet.prototype.add = function (key) {
  return this.store.set(key, true);
};
LazySet.prototype.has = function (key) {
  return this.store.has(key);
};
LazySet.prototype["delete"] = function (key) {
  return this.store["delete"](key);
};
},{}],12:[function(require,module,exports){
"use strict";

function PouchError(opts) {
  this.status = opts.status;
  this.name = opts.error;
  this.message = opts.reason;
  this.error = true;
}

PouchError.prototype__proto__ = Error.prototype;

PouchError.prototype.toString = function () {
  return JSON.stringify({
    status: this.status,
    name: this.name,
    message: this.message
  });
};

exports.UNAUTHORIZED = new PouchError({
  status: 401,
  error: 'unauthorized',
  reason: "Name or password is incorrect."
});
exports.MISSING_BULK_DOCS = new PouchError({
  status: 400,
  error: 'bad_request',
  reason: "Missing JSON list of 'docs'"
});
exports.MISSING_DOC = new PouchError({
  status: 404,
  error: 'not_found',
  reason: 'missing'
});
exports.REV_CONFLICT = new PouchError({
  status: 409,
  error: 'conflict',
  reason: 'Document update conflict'
});
exports.INVALID_ID = new PouchError({
  status: 400,
  error: 'invalid_id',
  reason: '_id field must contain a string'
});
exports.MISSING_ID = new PouchError({
  status: 412,
  error: 'missing_id',
  reason: '_id is required for puts'
});
exports.RESERVED_ID = new PouchError({
  status: 400,
  error: 'bad_request',
  reason: 'Only reserved document ids may start with underscore.'
});
exports.NOT_OPEN = new PouchError({
  status: 412,
  error: 'precondition_failed',
  reason: 'Database not open'
});
exports.UNKNOWN_ERROR = new PouchError({
  status: 500,
  error: 'unknown_error',
  reason: 'Database encountered an unknown error'
});
exports.BAD_ARG = new PouchError({
  status: 500,
  error: 'badarg',
  reason: 'Some query argument is invalid'
});
exports.INVALID_REQUEST = new PouchError({
  status: 400,
  error: 'invalid_request',
  reason: 'Request was invalid'
});
exports.QUERY_PARSE_ERROR = new PouchError({
  status: 400,
  error: 'query_parse_error',
  reason: 'Some query parameter is invalid'
});
exports.DOC_VALIDATION = new PouchError({
  status: 500,
  error: 'doc_validation',
  reason: 'Bad special document member'
});
exports.BAD_REQUEST = new PouchError({
  status: 400,
  error: 'bad_request',
  reason: 'Something wrong with the request'
});
exports.NOT_AN_OBJECT = new PouchError({
  status: 400,
  error: 'bad_request',
  reason: 'Document must be a JSON object'
});
exports.DB_MISSING = new PouchError({
  status: 404,
  error: 'not_found',
  reason: 'Database not found'
});
exports.IDB_ERROR = new PouchError({
  status: 500,
  error: 'indexed_db_went_bad',
  reason: 'unknown'
});
exports.WSQ_ERROR = new PouchError({
  status: 500,
  error: 'web_sql_went_bad',
  reason: 'unknown'
});
exports.LDB_ERROR = new PouchError({
  status: 500,
  error: 'levelDB_went_went_bad',
  reason: 'unknown'
});
exports.FORBIDDEN = new PouchError({
  status: 403,
  error: 'forbidden',
  reason: 'Forbidden by design doc validate_doc_update function'
});
exports.error = function (error, reason, name) {
  function CustomPouchError(msg) {
    this.message = reason;
    if (name) {
      this.name = name;
    }
  }
  CustomPouchError.prototype = error;
  return new CustomPouchError(reason);
};

},{}],13:[function(require,module,exports){
(function (process,global){
'use strict';

var crypto = require('crypto');
var Md5 = require('spark-md5');
var setImmediateShim = global.setImmediate || global.setTimeout;

function sliceShim(arrayBuffer, begin, end) {
  if (typeof arrayBuffer.slice === 'function') {
    if (!begin) {
      return arrayBuffer.slice();
    } else if (!end) {
      return arrayBuffer.slice(begin);
    } else {
      return arrayBuffer.slice(begin, end);
    }
  }
  //
  // shim for IE courtesy of http://stackoverflow.com/a/21440217
  //

  //If `begin`/`end` is unspecified, Chrome assumes 0, so we do the same
  //Chrome also converts the values to integers via flooring
  begin = Math.floor(begin || 0);
  end = Math.floor(end || 0);

  var len = arrayBuffer.byteLength;

  //If either `begin` or `end` is negative, it refers to an
  //index from the end of the array, as opposed to from the beginning.
  //The range specified by the `begin` and `end` values is clamped to the
  //valid index range for the current array.
  begin = begin < 0 ? Math.max(begin + len, 0) : Math.min(len, begin);
  end = end < 0 ? Math.max(end + len, 0) : Math.min(len, end);

  //If the computed length of the new ArrayBuffer would be negative, it
  //is clamped to zero.
  if (end - begin <= 0) {
    return new ArrayBuffer(0);
  }

  var result = new ArrayBuffer(end - begin);
  var resultBytes = new Uint8Array(result);
  var sourceBytes = new Uint8Array(arrayBuffer, begin, end - begin);

  resultBytes.set(sourceBytes);

  return result;
}

// convert a 64-bit int to a binary string
function intToString(int) {
  var bytes = [
    (int & 0xff),
    ((int >>> 8) & 0xff),
    ((int >>> 16) & 0xff),
    ((int >>> 24) & 0xff)
  ];
  return bytes.map(function (byte) {
    return String.fromCharCode(byte);
  }).join('');
}

// convert an array of 64-bit ints into
// a base64-encoded string
function rawToBase64(raw) {
  var res = '';
  for (var i = 0; i < raw.length; i++) {
    res += intToString(raw[i]);
  }
  return global.btoa(res);
}

module.exports = function (data, callback) {
  if (!process.browser) {
    var base64 = crypto.createHash('md5').update(data).digest('base64');
    callback(null, base64);
    return;
  }
  var inputIsString = typeof data === 'string';
  var len = inputIsString ? data.length : data.byteLength;
  var chunkSize = Math.min(524288, len);
  var chunks = Math.ceil(len / chunkSize);
  var currentChunk = 0;
  var buffer = inputIsString ? new Md5() : new Md5.ArrayBuffer();

  function append(buffer, data, start, end) {
    if (inputIsString) {
      buffer.appendBinary(data.substring(start, end));
    } else {
      buffer.append(sliceShim(data, start, end));
    }
  }

  function loadNextChunk() {
    var start = currentChunk * chunkSize;
    var end = start + chunkSize;
    if ((start + chunkSize) >= data.size) {
      end = data.size;
    }
    currentChunk++;
    if (currentChunk < chunks) {
      append(buffer, data, start, end);
      setImmediateShim(loadNextChunk);
    } else {
      append(buffer, data, start, end);
      var raw = buffer.end(true);
      var base64 = rawToBase64(raw);
      callback(null, base64);
      buffer.destroy();
    }
  }
  loadNextChunk();
};

}).call(this,require("q+64fw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"crypto":93,"q+64fw":95,"spark-md5":55}],14:[function(require,module,exports){
'use strict';
var Promise = require('../utils').Promise;

// this is essentially the "update sugar" function from daleharvey/pouchdb#1388
// the diffFun tells us what delta to apply to the doc.  it either returns
// the doc, or false if it doesn't need to do an update after all
function upsert(db, docId, diffFun) {
  return new Promise(function (fulfill, reject) {
    if (docId && typeof docId === 'object') {
      docId = docId._id;
    }
    if (typeof docId !== 'string') {
      return reject(new Error('doc id is required'));
    }

    db.get(docId, function (err, doc) {
      if (err) {
        if (err.status !== 404) {
          return reject(err);
        }
        return fulfill(tryAndPut(db, diffFun({_id : docId}), diffFun));
      }
      var newDoc = diffFun(doc);
      if (!newDoc) {
        return fulfill(doc);
      }
      fulfill(tryAndPut(db, newDoc, diffFun));
    });
  });
}

function tryAndPut(db, doc, diffFun) {
  return db.put(doc)["catch"](function (err) {
    if (err.status !== 409) {
      throw err;
    }
    return upsert(db, doc, diffFun);
  });
}

module.exports = function (db, docId, diffFun, cb) {
  if (typeof cb === 'function') {
    upsert(db, docId, diffFun).then(function (resp) {
      cb(null, resp);
    }, cb);
  } else {
    return upsert(db, docId, diffFun);
  }
};

},{"../utils":24}],15:[function(require,module,exports){
"use strict";

// BEGIN Math.uuid.js

/*!
Math.uuid.js (v1.4)
http://www.broofa.com
mailto:robert@broofa.com

Copyright (c) 2010 Robert Kieffer
Dual licensed under the MIT and GPL licenses.
*/

/*
 * Generate a random uuid.
 *
 * USAGE: Math.uuid(length, radix)
 *   length - the desired number of characters
 *   radix  - the number of allowable values for each character.
 *
 * EXAMPLES:
 *   // No arguments  - returns RFC4122, version 4 ID
 *   >>> Math.uuid()
 *   "92329D39-6F5C-4520-ABFC-AAB64544E172"
 *
 *   // One argument - returns ID of the specified length
 *   >>> Math.uuid(15)     // 15 character ID (default base=62)
 *   "VcydxgltxrVZSTV"
 *
 *   // Two arguments - returns ID of the specified length, and radix. 
 *   // (Radix must be <= 62)
 *   >>> Math.uuid(8, 2)  // 8 character ID (base=2)
 *   "01001010"
 *   >>> Math.uuid(8, 10) // 8 character ID (base=10)
 *   "47473046"
 *   >>> Math.uuid(8, 16) // 8 character ID (base=16)
 *   "098F4D35"
 */
var chars = (
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz'
).split('');
function getValue(radix) {
  return 0 | Math.random() * radix;
}
function uuid(len, radix) {
  radix = radix || chars.length;
  var out = '';
  var i = -1;

  if (len) {
    // Compact form
    while (++i < len) {
      out += chars[getValue(radix)];
    }
    return out;
  }
    // rfc4122, version 4 form
    // Fill in random data.  At i==19 set the high bits of clock sequence as
    // per rfc4122, sec. 4.1.5
  while (++i < 36) {
    switch (i) {
      case 8:
      case 13:
      case 18:
      case 23:
        out += '-';
        break;
      case 19:
        out += chars[(getValue(16) & 0x3) | 0x8];
        break;
      default:
        out += chars[getValue(16)];
    }
  }

  return out;
}



module.exports = uuid;


},{}],16:[function(require,module,exports){
'use strict';

module.exports = evalFilter;
function evalFilter(input) {
  /*jshint evil: true */
  return eval([
    '(function () { return ',
    input,
    ' })()'
  ].join(''));
}
},{}],17:[function(require,module,exports){
'use strict';

module.exports = evalView;
function evalView(input) {
  /*jshint evil: true */
  return eval([
    '(function () {',
    '  return function (doc) {',
    '    var emitted = false;',
    '    var emit = function (a, b) {',
    '      emitted = true;',
    '    };',
    '    var view = ' + input + ';',
    '    view(doc);',
    '    if (emitted) {',
    '      return true;',
    '    }',
    '  }',
    '})()'
  ].join('\n'));
}
},{}],18:[function(require,module,exports){
(function (process){
"use strict";

var PouchDB = require('./setup');

module.exports = PouchDB;

PouchDB.ajax = require('./deps/ajax');
PouchDB.extend = require('pouchdb-extend');
PouchDB.utils = require('./utils');
PouchDB.Errors = require('./deps/errors');
PouchDB.replicate = require('./replicate').replicate;
PouchDB.sync = require('./sync');
PouchDB.version = require('./version');
var httpAdapter = require('./adapters/http');
PouchDB.adapter('http', httpAdapter);
PouchDB.adapter('https', httpAdapter);

PouchDB.adapter('idb', require('./adapters/idb'));
PouchDB.adapter('websql', require('./adapters/websql'));
PouchDB.plugin(require('pouchdb-mapreduce'));

if (!process.browser) {
  var ldbAdapter = require('./adapters/leveldb');
  PouchDB.adapter('ldb', ldbAdapter);
  PouchDB.adapter('leveldb', ldbAdapter);
}

}).call(this,require("q+64fw"))
},{"./adapters/http":3,"./adapters/idb":4,"./adapters/leveldb":93,"./adapters/websql":6,"./deps/ajax":9,"./deps/errors":12,"./replicate":20,"./setup":21,"./sync":22,"./utils":24,"./version":25,"pouchdb-extend":46,"pouchdb-mapreduce":49,"q+64fw":95}],19:[function(require,module,exports){
'use strict';
var extend = require('pouchdb-extend');


// for a better overview of what this is doing, read:
// https://github.com/apache/couchdb/blob/master/src/couchdb/couch_key_tree.erl
//
// But for a quick intro, CouchDB uses a revision tree to store a documents
// history, A -> B -> C, when a document has conflicts, that is a branch in the
// tree, A -> (B1 | B2 -> C), We store these as a nested array in the format
//
// KeyTree = [Path ... ]
// Path = {pos: position_from_root, ids: Tree}
// Tree = [Key, Opts, [Tree, ...]], in particular single node: [Key, []]

// Turn a path as a flat array into a tree with a single branch
function pathToTree(path) {
  var doc = path.shift();
  var root = [doc.id, doc.opts, []];
  var leaf = root;
  var nleaf;

  while (path.length) {
    doc = path.shift();
    nleaf = [doc.id, doc.opts, []];
    leaf[2].push(nleaf);
    leaf = nleaf;
  }
  return root;
}

// Merge two trees together
// The roots of tree1 and tree2 must be the same revision
function mergeTree(in_tree1, in_tree2) {
  var queue = [{tree1: in_tree1, tree2: in_tree2}];
  var conflicts = false;
  while (queue.length > 0) {
    var item = queue.pop();
    var tree1 = item.tree1;
    var tree2 = item.tree2;

    if (tree1[1].status || tree2[1].status) {
      tree1[1].status =
        (tree1[1].status ===  'available' ||
         tree2[1].status === 'available') ? 'available' : 'missing';
    }

    for (var i = 0; i < tree2[2].length; i++) {
      if (!tree1[2][0]) {
        conflicts = 'new_leaf';
        tree1[2][0] = tree2[2][i];
        continue;
      }

      var merged = false;
      for (var j = 0; j < tree1[2].length; j++) {
        if (tree1[2][j][0] === tree2[2][i][0]) {
          queue.push({tree1: tree1[2][j], tree2: tree2[2][i]});
          merged = true;
        }
      }
      if (!merged) {
        conflicts = 'new_branch';
        tree1[2].push(tree2[2][i]);
        tree1[2].sort();
      }
    }
  }
  return {conflicts: conflicts, tree: in_tree1};
}

function doMerge(tree, path, dontExpand) {
  var restree = [];
  var conflicts = false;
  var merged = false;
  var res;

  if (!tree.length) {
    return {tree: [path], conflicts: 'new_leaf'};
  }

  tree.forEach(function (branch) {
    if (branch.pos === path.pos && branch.ids[0] === path.ids[0]) {
      // Paths start at the same position and have the same root, so they need
      // merged
      res = mergeTree(branch.ids, path.ids);
      restree.push({pos: branch.pos, ids: res.tree});
      conflicts = conflicts || res.conflicts;
      merged = true;
    } else if (dontExpand !== true) {
      // The paths start at a different position, take the earliest path and
      // traverse up until it as at the same point from root as the path we
      // want to merge.  If the keys match we return the longer path with the
      // other merged After stemming we dont want to expand the trees

      var t1 = branch.pos < path.pos ? branch : path;
      var t2 = branch.pos < path.pos ? path : branch;
      var diff = t2.pos - t1.pos;

      var candidateParents = [];

      var trees = [];
      trees.push({ids: t1.ids, diff: diff, parent: null, parentIdx: null});
      while (trees.length > 0) {
        var item = trees.pop();
        if (item.diff === 0) {
          if (item.ids[0] === t2.ids[0]) {
            candidateParents.push(item);
          }
          continue;
        }
        if (!item.ids) {
          continue;
        }
        /*jshint loopfunc:true */
        item.ids[2].forEach(function (el, idx) {
          trees.push(
            {ids: el, diff: item.diff - 1, parent: item.ids, parentIdx: idx});
        });
      }

      var el = candidateParents[0];

      if (!el) {
        restree.push(branch);
      } else {
        res = mergeTree(el.ids, t2.ids);
        el.parent[2][el.parentIdx] = res.tree;
        restree.push({pos: t1.pos, ids: t1.ids});
        conflicts = conflicts || res.conflicts;
        merged = true;
      }
    } else {
      restree.push(branch);
    }
  });

  // We didnt find
  if (!merged) {
    restree.push(path);
  }

  restree.sort(function (a, b) {
    return a.pos - b.pos;
  });

  return {
    tree: restree,
    conflicts: conflicts || 'internal_node'
  };
}

// To ensure we dont grow the revision tree infinitely, we stem old revisions
function stem(tree, depth) {
  // First we break out the tree into a complete list of root to leaf paths,
  // we cut off the start of the path and generate a new set of flat trees
  var stemmedPaths = PouchMerge.rootToLeaf(tree).map(function (path) {
    var stemmed = path.ids.slice(-depth);
    return {
      pos: path.pos + (path.ids.length - stemmed.length),
      ids: pathToTree(stemmed)
    };
  });
  // Then we remerge all those flat trees together, ensuring that we dont
  // connect trees that would go beyond the depth limit
  return stemmedPaths.reduce(function (prev, current, i, arr) {
    return doMerge(prev, current, true).tree;
  }, [stemmedPaths.shift()]);
}

var PouchMerge = {};

PouchMerge.merge = function (tree, path, depth) {
  // Ugh, nicer way to not modify arguments in place?
  tree = extend(true, [], tree);
  path = extend(true, {}, path);
  var newTree = doMerge(tree, path);
  return {
    tree: stem(newTree.tree, depth),
    conflicts: newTree.conflicts
  };
};

// We fetch all leafs of the revision tree, and sort them based on tree length
// and whether they were deleted, undeleted documents with the longest revision
// tree (most edits) win
// The final sort algorithm is slightly documented in a sidebar here:
// http://guide.couchdb.org/draft/conflicts.html
PouchMerge.winningRev = function (metadata) {
  var leafs = [];
  PouchMerge.traverseRevTree(metadata.rev_tree,
                              function (isLeaf, pos, id, something, opts) {
    if (isLeaf) {
      leafs.push({pos: pos, id: id, deleted: !!opts.deleted});
    }
  });
  leafs.sort(function (a, b) {
    if (a.deleted !== b.deleted) {
      return a.deleted > b.deleted ? 1 : -1;
    }
    if (a.pos !== b.pos) {
      return b.pos - a.pos;
    }
    return a.id < b.id ? 1 : -1;
  });

  return leafs[0].pos + '-' + leafs[0].id;
};

// Pretty much all below can be combined into a higher order function to
// traverse revisions
// The return value from the callback will be passed as context to all
// children of that node
PouchMerge.traverseRevTree = function (revs, callback) {
  var toVisit = revs.slice();

  var node;
  while ((node = toVisit.pop())) {
    var pos = node.pos;
    var tree = node.ids;
    var branches = tree[2];
    var newCtx =
      callback(branches.length === 0, pos, tree[0], node.ctx, tree[1]);
    for (var i = 0, len = branches.length; i < len; i++) {
      toVisit.push({pos: pos + 1, ids: branches[i], ctx: newCtx});
    }
  }
};

PouchMerge.collectLeaves = function (revs) {
  var leaves = [];
  PouchMerge.traverseRevTree(revs, function (isLeaf, pos, id, acc, opts) {
    if (isLeaf) {
      leaves.unshift({rev: pos + "-" + id, pos: pos, opts: opts});
    }
  });
  leaves.sort(function (a, b) {
    return b.pos - a.pos;
  });
  leaves.map(function (leaf) { delete leaf.pos; });
  return leaves;
};

// returns revs of all conflicts that is leaves such that
// 1. are not deleted and
// 2. are different than winning revision
PouchMerge.collectConflicts = function (metadata) {
  var win = PouchMerge.winningRev(metadata);
  var leaves = PouchMerge.collectLeaves(metadata.rev_tree);
  var conflicts = [];
  leaves.forEach(function (leaf) {
    if (leaf.rev !== win && !leaf.opts.deleted) {
      conflicts.push(leaf.rev);
    }
  });
  return conflicts;
};

PouchMerge.rootToLeaf = function (tree) {
  var paths = [];
  PouchMerge.traverseRevTree(tree, function (isLeaf, pos, id, history, opts) {
    history = history ? history.slice(0) : [];
    history.push({id: id, opts: opts});
    if (isLeaf) {
      var rootPos = pos + 1 - history.length;
      paths.unshift({pos: rootPos, ids: history});
    }
    return history;
  });
  return paths;
};


module.exports = PouchMerge;

},{"pouchdb-extend":46}],20:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var EE = require('events').EventEmitter;

var MAX_SIMULTANEOUS_REVS = 50;

// We create a basic promise so the caller can cancel the replication possibly
// before we have actually started listening to changes etc
utils.inherits(Replication, EE);
function Replication(opts) {
  EE.call(this);
  this.cancelled = false;
  var self = this;
  var promise = new utils.Promise(function (fulfill, reject) {
    self.once('complete', fulfill);
    self.once('error', reject);
  });
  self.then = function (resolve, reject) {
    return promise.then(resolve, reject);
  };
  self["catch"] = function (reject) {
    return promise["catch"](reject);
  };
  // As we allow error handling via "error" event as well,
  // put a stub in here so that rejecting never throws UnhandledError.
  self["catch"](function (err) {});
}

Replication.prototype.cancel = function () {
  this.cancelled = true;
  this.emit('cancel');
};

Replication.prototype.ready = function (src, target) {
  var self = this;
  function onDestroy() {
    self.cancel();
  }
  src.once('destroyed', onDestroy);
  target.once('destroyed', onDestroy);
  function cleanup() {
    src.removeListener('destroyed', onDestroy);
    target.removeListener('destroyed', onDestroy);
  }
  this.then(cleanup, cleanup);
};


// TODO: check CouchDB's replication id generation
// Generate a unique id particular to this replication
function genReplicationId(src, target, opts) {
  var filterFun = opts.filter ? opts.filter.toString() : '';
  return src.id().then(function (src_id) {
    return target.id().then(function (target_id) {
      var queryData = src_id + target_id + filterFun +
        JSON.stringify(opts.query_params) + opts.doc_ids;
      return utils.MD5(queryData).then(function (md5) {
        // can't use straight-up md5 alphabet, because
        // the char '/' is interpreted as being for attachments,
        // and + is also not url-safe
        md5 = md5.replace(/\//g, '.').replace(/\+/g, '_');
        return '_local/' + md5;
      });
    });
  });
}


function updateCheckpoint(db, id, checkpoint, returnValue) {
    return db.get(id)["catch"](function (err) {
      if (err.status === 404) {
        return {_id: id};
      }
      throw err;
    }).then(function (doc) {
      if (returnValue.cancelled) {
        return;
      }
      doc.last_seq = checkpoint;
      return db.put(doc);
    });
  }

function Checkpointer(src, target, id, returnValue) {
  this.src = src;
  this.target = target;
  this.id = id;
  this.returnValue = returnValue;
}

Checkpointer.prototype.writeCheckpoint = function (checkpoint) {
  var self = this;
  return this.updateTarget(checkpoint).then(function () {
    return self.updateSource(checkpoint);
  });
};
Checkpointer.prototype.updateTarget = function (checkpoint) {
  return updateCheckpoint(this.target, this.id, checkpoint, this.returnValue);
};
Checkpointer.prototype.updateSource = function (checkpoint) {
  var self = this;
  if (this.readOnlySource) {
    return utils.Promise.resolve(true);
  }
  return updateCheckpoint(this.src, this.id, checkpoint, this.returnValue)[
    "catch"](function (err) {
    var isForbidden = typeof err.status === 'number' &&
      Math.floor(err.status / 100) === 4;
    if (isForbidden) {
      self.readOnlySource = true;
      return true;
    }
    throw err;
  });
};
Checkpointer.prototype.getCheckpoint = function () {
  var self = this;
  return self.target.get(self.id).then(function (targetDoc) {
    return self.src.get(self.id).then(function (sourceDoc) {
      if (targetDoc.last_seq === sourceDoc.last_seq) {
        return sourceDoc.last_seq;
      }
      return 0;
    }, function (err) {
      if (err.status === 404 && targetDoc.last_seq) {
        return self.src.put({
          _id: self.id,
          last_seq: 0
        }).then(function () {
          return 0;
        }, function (err) {
          if (err.status === 401) {
            self.readOnlySource = true;
            return targetDoc.last_seq;
          }
          return 0;
        });
      }
      throw err;
    });
  })["catch"](function (err) {
    if (err.status !== 404) {
      throw err;
    }
    return 0;
  });
};
function replicate(repId, src, target, opts, returnValue) {
  var batches = [];               // list of batches to be processed
  var currentBatch;               // the batch currently being processed
  var pendingBatch = {
    seq: 0,
    changes: [],
    docs: []
  }; // next batch, not yet ready to be processed
  var writingCheckpoint = false;  // true while checkpoint is being written
  var changesCompleted = false;   // true when all changes received
  var replicationCompleted = false; // true when replication has completed
  var last_seq = 0;
  var continuous = opts.continuous || opts.live || false;
  var batch_size = opts.batch_size || 100;
  var batches_limit = opts.batches_limit || 10;
  var changesPending = false;     // true while src.changes is running
  var doc_ids = opts.doc_ids;
  var checkpointer = new Checkpointer(src, target, repId, returnValue);
  var result = {
    ok: true,
    start_time: new Date(),
    docs_read: 0,
    docs_written: 0,
    doc_write_failures: 0,
    errors: []
  };
  var changesOpts = {};
  returnValue.ready(src, target);


  function writeDocs() {
    if (currentBatch.docs.length === 0) {
      return;
    }
    var docs = currentBatch.docs;
    return target.bulkDocs({
      docs: docs
    }, {
      new_edits: false
    }).then(function (res) {
      if (returnValue.cancelled) {
        completeReplication();
        throw new Error('cancelled');
      }
      var errors = [];
      res.forEach(function (res) {
        if (res.error) {
          result.doc_write_failures++;
          var error = new Error(res.reason || res.message || 'Unknown reason');
          error.name = res.name || res.error;
          errors.push(error);
        }
      });
      result.errors = result.errors.concat(errors);
      result.docs_written += currentBatch.docs.length - errors.length;
      var non403s = errors.filter(function (error) {
        return error.name !== 'unauthorized' && error.name !== 'forbidden';
      });
      if (non403s.length > 0) {
        var error = new Error('bulkDocs error');
        error.other_errors = errors;
        abortReplication('target.bulkDocs failed to write docs', error);
        throw new Error('bulkWrite partial failure');
      }
    }, function (err) {
      result.doc_write_failures += docs.length;
      throw err;
    });
  }


  function getNextDoc() {
    var diffs = currentBatch.diffs;
    var id = Object.keys(diffs)[0];
    var allMissing = diffs[id].missing;
    // avoid url too long error by batching
    var missingBatches = [];
    for (var i = 0; i < allMissing.length; i += MAX_SIMULTANEOUS_REVS) {
      missingBatches.push(allMissing.slice(i, Math.min(allMissing.length,
        i + MAX_SIMULTANEOUS_REVS)));
    }

    return utils.Promise.all(missingBatches.map(function (missing) {
      return src.get(id, {revs: true, open_revs: missing, attachments: true})
        .then(function (docs) {
          docs.forEach(function (doc) {
            if (returnValue.cancelled) {
              return completeReplication();
            }
            if (doc.ok) {
              result.docs_read++;
              currentBatch.pendingRevs++;
              currentBatch.docs.push(doc.ok);
              delete diffs[doc.ok._id];
            }
          });
        });
    }));
  }

  function getAllDocs() {
    if (Object.keys(currentBatch.diffs).length > 0) {
      return getNextDoc().then(getAllDocs);
    } else {
      return utils.Promise.resolve();
    }
  }


  function getRevisionOneDocs() {
    // filter out the generation 1 docs and get them
    // leaving the non-generation one docs to be got otherwise
    var ids = Object.keys(currentBatch.diffs).filter(function (id) {
      var missing = currentBatch.diffs[id].missing;
      return missing.length === 1 && missing[0].slice(0, 2) === '1-';
    });
    return src.allDocs({
      keys: ids,
      include_docs: true
    }).then(function (res) {
      if (returnValue.cancelled) {
        completeReplication();
        throw (new Error('cancelled'));
      }
      res.rows.forEach(function (row) {
        if (row.doc && !row.deleted &&
          row.value.rev.slice(0, 2) === '1-' && (
            !row.doc._attachments ||
            Object.keys(row.doc._attachments).length === 0
          )
        ) {
          result.docs_read++;
          currentBatch.pendingRevs++;
          currentBatch.docs.push(row.doc);
          delete currentBatch.diffs[row.id];
        }
      });
    });
  }


  function getDocs() {
    return getRevisionOneDocs().then(getAllDocs);
  }


  function finishBatch() {
    writingCheckpoint = true;
    return checkpointer.writeCheckpoint(
      currentBatch.seq
    ).then(function (res) {
      writingCheckpoint = false;
      if (returnValue.cancelled) {
        completeReplication();
        throw new Error('cancelled');
      }
      result.last_seq = last_seq = currentBatch.seq;
      returnValue.emit('change', utils.clone(result));
      currentBatch = undefined;
      getChanges();
    })["catch"](function (err) {
      writingCheckpoint = false;
      abortReplication('writeCheckpoint completed with error', err);
      throw err;
    });
  }


  function getDiffs() {
    var diff = {};
    currentBatch.changes.forEach(function (change) {
      diff[change.id] = change.changes.map(function (x) {
        return x.rev;
      });
    });
    return target.revsDiff(diff).then(function (diffs) {
      if (returnValue.cancelled) {
        completeReplication();
        throw new Error('cancelled');
      }
      // currentBatch.diffs elements are deleted as the documents are written
      currentBatch.diffs = diffs;
      currentBatch.pendingRevs = 0;
    });
  }


  function startNextBatch() {
    if (returnValue.cancelled || currentBatch) {
      return;
    }
    if (batches.length === 0) {
      processPendingBatch(true);
      return;
    }
    currentBatch = batches.shift();
    getDiffs()
    .then(getDocs)
    .then(writeDocs)
    .then(finishBatch)
    .then(startNextBatch)[
    "catch"](function (err) {
      abortReplication('batch processing terminated with error', err);
    });
  }


  function processPendingBatch(immediate) {
    if (pendingBatch.changes.length === 0) {
      if (batches.length === 0 && !currentBatch) {
        if ((continuous && changesOpts.live) || changesCompleted) {
          returnValue.emit('uptodate', utils.clone(result));
        }
        if (changesCompleted) {
          completeReplication();
        }
      }
      return;
    }
    if (
      immediate ||
      changesCompleted ||
      pendingBatch.changes.length >= batch_size
    ) {
      batches.push(pendingBatch);
      pendingBatch = {
        seq: 0,
        changes: [],
        docs: []
      };
      startNextBatch();
    }
  }


  function abortReplication(reason, err) {
    if (replicationCompleted) {
      return;
    }
    result.ok = false;
    result.status = 'aborted';
    result.errors.push(err);
    batches = [];
    pendingBatch = {
      seq: 0,
      changes: [],
      docs: []
    };
    completeReplication();
  }


  function completeReplication() {
    if (replicationCompleted) {
      return;
    }
    if (returnValue.cancelled) {
      result.status = 'cancelled';
      if (writingCheckpoint) {
        return;
      }
    }
    result.status = result.status || 'complete';
    result.end_time = new Date();
    result.last_seq = last_seq;
    replicationCompleted = returnValue.cancelled = true;
    var non403s = result.errors.filter(function (error) {
      return error.name !== 'unauthorized' && error.name !== 'forbidden';
    });
    if (non403s.length > 0) {
      var error = result.errors.pop();
      if (result.errors.length > 0) {
        error.other_errors = result.errors;
      }
      error.result = result;
      returnValue.emit('error', error);
    } else {
      returnValue.emit('complete', result);
    }
    returnValue.removeAllListeners();
  }


  function onChange(change) {
    if (returnValue.cancelled) {
      return completeReplication();
    }
    if (
      pendingBatch.changes.length === 0 &&
      batches.length === 0 &&
      !currentBatch
    ) {
      returnValue.emit('outofdate', utils.clone(result));
    }
    pendingBatch.seq = change.seq;
    pendingBatch.changes.push(change);
    processPendingBatch(batches.length === 0);
  }


  function onChangesComplete(changes) {
    changesPending = false;
    if (returnValue.cancelled) {
      return completeReplication();
    }
    if (changesOpts.since < changes.last_seq) {
      changesOpts.since = changes.last_seq;
      getChanges();
    } else {
      if (continuous) {
        changesOpts.live = true;
        getChanges();
      } else {
        changesCompleted = true;
      }
    }
    processPendingBatch(true);
  }


  function onChangesError(err) {
    changesPending = false;
    if (returnValue.cancelled) {
      return completeReplication();
    }
    abortReplication('changes rejected', err);
  }


  function getChanges() {
    if (!(
      !changesPending &&
      !changesCompleted &&
      batches.length < batches_limit
    )) {
      return;
    }
    changesPending = true;
    function abortChanges() {
      changes.cancel();
    }
    function removeListener() {
      returnValue.removeListener('cancel', abortChanges);
    }
    returnValue.once('cancel', abortChanges);
    var changes = src.changes(changesOpts)
    .on('change', onChange);
    changes.then(removeListener, removeListener);
    changes.then(onChangesComplete)[
    "catch"](onChangesError);
  }


  function startChanges() {
    checkpointer.getCheckpoint().then(function (checkpoint) {
      last_seq = checkpoint;
      changesOpts = {
        since: last_seq,
        limit: batch_size,
        batch_size: batch_size,
        style: 'all_docs',
        doc_ids: doc_ids,
        returnDocs: false
      };
      if (opts.filter) {
        changesOpts.filter = opts.filter;
      }
      if (opts.query_params) {
        changesOpts.query_params = opts.query_params;
      }
      getChanges();
    })["catch"](function (err) {
      abortReplication('getCheckpoint rejected with ', err);
    });
  }


  returnValue.once('cancel', completeReplication);

  if (typeof opts.onChange === 'function') {
    returnValue.on('change', opts.onChange);
  }

  if (typeof opts.complete === 'function') {
    returnValue.once('error', opts.complete);
    returnValue.once('complete', function (result) {
      opts.complete(null, result);
    });
  }

  if (typeof opts.since === 'undefined') {
    startChanges();
  } else {
    writingCheckpoint = true;
    checkpointer.writeCheckpoint(opts.since).then(function (res) {
      writingCheckpoint = false;
      if (returnValue.cancelled) {
        completeReplication();
        return;
      }
      last_seq = opts.since;
      startChanges();
    })["catch"](function (err) {
      writingCheckpoint = false;
      abortReplication('writeCheckpoint completed with error', err);
      throw err;
    });
  }
}

exports.toPouch = toPouch;
function toPouch(db, opts) {
  var PouchConstructor = opts.PouchConstructor;
  if (typeof db === 'string') {
    return new PouchConstructor(db);
  } else if (db.then) {
    return db;
  } else {
    return utils.Promise.resolve(db);
  }
}


exports.replicate = replicateWrapper;
function replicateWrapper(src, target, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  if (typeof opts === 'undefined') {
    opts = {};
  }
  if (!opts.complete) {
    opts.complete = callback || function () {};
  }
  opts = utils.clone(opts);
  opts.continuous = opts.continuous || opts.live;
  /*jshint validthis:true */
  opts.PouchConstructor = opts.PouchConstructor || this;
  var replicateRet = new Replication(opts);
  toPouch(src, opts).then(function (src) {
    return toPouch(target, opts).then(function (target) {
      return genReplicationId(src, target, opts).then(function (repId) {
        replicate(repId, src, target, opts, replicateRet);
      });
    });
  })["catch"](function (err) {
    replicateRet.emit('error', err);
    opts.complete(err);
  });
  return replicateRet;
}

},{"./utils":24,"events":94}],21:[function(require,module,exports){
(function (global){
"use strict";

var PouchDB = require("./constructor");
var utils = require('./utils');
var Promise = utils.Promise;
var EventEmitter = require('events').EventEmitter;
PouchDB.adapters = {};
PouchDB.preferredAdapters = require('./adapters/preferredAdapters.js');

PouchDB.prefix = '_pouch_';

var eventEmitter = new EventEmitter();

var eventEmitterMethods = [
  'on',
  'addListener',
  'emit',
  'listeners',
  'once',
  'removeAllListeners',
  'removeListener',
  'setMaxListeners'
];

eventEmitterMethods.forEach(function (method) {
  PouchDB[method] = eventEmitter[method].bind(eventEmitter);
});
PouchDB.setMaxListeners(0);
PouchDB.parseAdapter = function (name, opts) {
  var match = name.match(/([a-z\-]*):\/\/(.*)/);
  var adapter, adapterName;
  if (match) {
    // the http adapter expects the fully qualified name
    name = /http(s?)/.test(match[1]) ? match[1] + '://' + match[2] : match[2];
    adapter = match[1];
    if (!PouchDB.adapters[adapter].valid()) {
      throw 'Invalid adapter';
    }
    return {name: name, adapter: match[1]};
  }

  // check for browsers that have been upgraded from websql-only to websql+idb
  var skipIdb = 'idb' in PouchDB.adapters && 'websql' in PouchDB.adapters &&
    utils.hasLocalStorage() &&
    global.localStorage['_pouch__websqldb_' + PouchDB.prefix + name];

  if (typeof opts !== 'undefined' && opts.db) {
    adapterName = 'leveldb';
  } else {
    for (var i = 0; i < PouchDB.preferredAdapters.length; ++i) {
      adapterName = PouchDB.preferredAdapters[i];
      if (adapterName in PouchDB.adapters) {
        if (skipIdb && adapterName === 'idb') {
          continue; // keep using websql to avoid user data loss
        }
        break;
      }
    }
  }

  adapter = PouchDB.adapters[adapterName];
  if (adapterName && adapter) {
    var use_prefix = 'use_prefix' in adapter ? adapter.use_prefix : true;

    return {
      name: use_prefix ? PouchDB.prefix + name : name,
      adapter: adapterName
    };
  }

  throw 'No valid adapter found';
};

PouchDB.destroy = utils.toPromise(function (name, opts, callback) {
  if (typeof opts === 'function' || typeof opts === 'undefined') {
    callback = opts;
    opts = {};
  }

  if (name && typeof name === 'object') {
    opts = name;
    name = undefined;
  }

  var backend = PouchDB.parseAdapter(opts.name || name, opts);
  var dbName = backend.name;
  var adapter = PouchDB.adapters[backend.adapter];
  var usePrefix = 'use_prefix' in adapter ? adapter.use_prefix : true;
  var baseName = usePrefix ?
    dbName.replace(new RegExp('^' + PouchDB.prefix), '') : dbName;
  var fullName = (backend.adapter === 'http' || backend.adapter === 'https' ?
      '' : (opts.prefix || '')) + dbName;
  function destroyDb() {
    // call destroy method of the particular adaptor
    adapter.destroy(fullName, opts, function (err, resp) {
      if (err) {
        callback(err);
      } else {
        PouchDB.emit('destroyed', name);
        //so we don't have to sift through all dbnames
        PouchDB.emit(name, 'destroyed');
        callback(null, resp || { 'ok': true });
      }
    });
  }

  var createOpts = utils.extend(true, {}, opts, {adapter : backend.adapter});
  new PouchDB(baseName, createOpts, function (err, db) {
    if (err) {
      return callback(err);
    }
    db.get('_local/_pouch_dependentDbs', function (err, localDoc) {
      if (err) {
        if (err.status !== 404) {
          return callback(err);
        } else { // no dependencies
          return destroyDb();
        }
      }
      var dependentDbs = localDoc.dependentDbs;
      var deletedMap = Object.keys(dependentDbs).map(function (name) {
        var trueName = usePrefix ?
          name.replace(new RegExp('^' + PouchDB.prefix), '') : name;
        var subOpts = utils.extend(true, opts, {adapter: backend.adapter});
        return PouchDB.destroy(trueName, subOpts);
      });
      Promise.all(deletedMap).then(destroyDb, function (error) {
        callback(error);
      });
    });
  });
});

PouchDB.allDbs = utils.toPromise(function (callback) {
  var err = new Error('allDbs method removed');
  err.stats = '400';
  callback(err);
});
PouchDB.adapter = function (id, obj) {
  if (obj.valid()) {
    PouchDB.adapters[id] = obj;
  }
};

PouchDB.plugin = function (obj) {
  Object.keys(obj).forEach(function (id) {
    PouchDB.prototype[id] = obj[id];
  });
};

PouchDB.defaults = function (defaultOpts) {
  function PouchAlt(name, opts, callback) {
    if (typeof opts === 'function' || typeof opts === 'undefined') {
      callback = opts;
      opts = {};
    }
    if (name && typeof name === 'object') {
      opts = name;
      name = undefined;
    }

    opts = utils.extend(true, {}, defaultOpts, opts);
    PouchDB.call(this, name, opts, callback);
  }

  utils.inherits(PouchAlt, PouchDB);

  PouchAlt.destroy = utils.toPromise(function (name, opts, callback) {
    if (typeof opts === 'function' || typeof opts === 'undefined') {
      callback = opts;
      opts = {};
    }

    if (name && typeof name === 'object') {
      opts = name;
      name = undefined;
    }
    opts = utils.extend(true, {}, defaultOpts, opts);
    return PouchDB.destroy(name, opts, callback);
  });

  eventEmitterMethods.forEach(function (method) {
    PouchAlt[method] = eventEmitter[method].bind(eventEmitter);
  });
  PouchAlt.setMaxListeners(0);

  PouchAlt.preferredAdapters = PouchDB.preferredAdapters.slice();
  Object.keys(PouchDB).forEach(function (key) {
    if (!(key in PouchAlt)) {
      PouchAlt[key] = PouchDB[key];
    }
  });

  return PouchAlt;
};

module.exports = PouchDB;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./adapters/preferredAdapters.js":5,"./constructor":8,"./utils":24,"events":94}],22:[function(require,module,exports){
'use strict';
var utils = require('./utils');
var replication = require('./replicate');
var replicate = replication.replicate;
var EE = require('events').EventEmitter;

utils.inherits(Sync, EE);
module.exports = sync;
function sync(src, target, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  if (typeof opts === 'undefined') {
    opts = {};
  }
  opts = utils.clone(opts);
  /*jshint validthis:true */
  opts.PouchConstructor = opts.PouchConstructor || this;
  src = replication.toPouch(src, opts);
  target = replication.toPouch(target, opts);
  return new Sync(src, target, opts, callback);
}
function Sync(src, target, opts, callback) {
  var self = this;
  this.canceled = false;
  
  var onChange, complete;
  if ('onChange' in opts) {
    onChange = opts.onChange;
    delete opts.onChange;
  }
  if (typeof callback === 'function' && !opts.complete) {
    complete = callback;
  } else if ('complete' in opts) {
    complete = opts.complete;
    delete opts.complete;
  }

  this.push = replicate(src, target, opts);

  this.pull = replicate(target, src, opts);
  var emittedCancel = false;
  function onCancel(data) {
    if (!emittedCancel) {
      emittedCancel = true;
      self.emit('cancel', data);
    }
  }

  function pullChange(change) {
    self.emit('change', {
      direction: 'pull',
      change: change
    });
  }
  function pushChange(change) {
    self.emit('change', {
      direction: 'push',
      change: change
    });
  }
  var listeners = {};

  var removed = {};
  function removeAll(type) { // type is 'push' or 'pull'
    return function (event, func) {
      var isChange = event === 'change' &&
        (func === pullChange || func === pushChange);
      var isCancel = event === 'cancel' && func === onCancel;
      var isOtherEvent = event in listeners && func === listeners[event];

      if (isChange || isCancel || isOtherEvent) {
        if (!(event in removed)) {
          removed[event] = {};
        }
        removed[event][type] = true;
        if (Object.keys(removed[event]).length === 2) {
          // both push and pull have asked to be removed
          self.removeAllListeners(event);
        }
      }
    };
  }

  this.on('newListener', function (event) {
    if (event === 'change') {
      self.pull.on('change', pullChange);
      self.push.on('change', pushChange);
    } else if (event === 'cancel') {
      self.pull.on('cancel', onCancel);
      self.push.on('cancel', onCancel);
    } else if (event !== 'error' &&
      event !== 'removeListener' &&
      event !== 'complete' && !(event in listeners)) {
      listeners[event] = function (e) {
        self.emit(event, e);
      };
      self.pull.on(event, listeners[event]);
      self.push.on(event, listeners[event]);
    }
  });

  this.on('removeListener', function (event) {
    if (event === 'change') {
      self.pull.removeListener('change', pullChange);
      self.push.removeListener('change', pushChange);
    } else if (event === 'cancel') {
      self.pull.removeListener('cancel', onCancel);
      self.push.removeListener('cancel', onCancel);
    } else if (event in listeners) {
      if (typeof listeners[event] === 'function') {
        self.pull.removeListener(event, listeners[event]);
        self.push.removeListener(event, listeners[event]);
        delete listeners[event];
      }
    }
  });

  this.pull.on('removeListener', removeAll('pull'));
  this.push.on('removeListener', removeAll('push'));

  var promise = utils.Promise.all([
    this.push,
    this.pull
  ]).then(function (resp) {
    var out = {
      push: resp[0],
      pull: resp[1]
    };
    self.emit('complete', out);
    if (complete) {
      complete(null, out);
    }
    self.removeAllListeners();
    return out;
  }, function (err) {
    self.cancel();
    self.emit('error', err);
    if (complete) {
      complete(err);
    }
    self.removeAllListeners();
    throw err;
  });

  this.then = function (success, err) {
    return promise.then(success, err);
  };

  this["catch"] = function (err) {
    return promise["catch"](err);
  };
}

Sync.prototype.cancel = function () {
  if (!this.canceled) {
    this.canceled = true;
    this.push.cancel();
    this.pull.cancel();
  }
};

},{"./replicate":20,"./utils":24,"events":94}],23:[function(require,module,exports){
'use strict';

module.exports = TaskQueue;

function TaskQueue() {
  this.isReady = false;
  this.failed = false;
  this.queue = [];
}

TaskQueue.prototype.execute = function () {
  var d, func;
  if (this.failed) {
    while ((d = this.queue.shift())) {
      if (typeof d === 'function') {
        d(this.failed);
        continue;
      }
      func = d.parameters[d.parameters.length - 1];
      if (typeof func === 'function') {
        func(this.failed);
      } else if (d.name === 'changes' && typeof func.complete === 'function') {
        func.complete(this.failed);
      }
    }
  } else if (this.isReady) {
    while ((d = this.queue.shift())) {

      if (typeof d === 'function') {
        d();
      } else {
        d.task = this.db[d.name].apply(this.db, d.parameters);
      }
    }
  }
};

TaskQueue.prototype.fail = function (err) {
  this.failed = err;
  this.execute();
};

TaskQueue.prototype.ready = function (db) {
  if (this.failed) {
    return false;
  } else if (arguments.length === 0) {
    return this.isReady;
  }
  this.isReady = db ? true: false;
  this.db = db;
  this.execute();
};

TaskQueue.prototype.addTask = function (name, parameters) {
  if (typeof name === 'function') {
    this.queue.push(name);
    if (this.failed) {
      this.execute();
    }
  } else {
    var task = { name: name, parameters: parameters };
    this.queue.push(task);
    if (this.failed) {
      this.execute();
    }
    return task;
  }
};

},{}],24:[function(require,module,exports){
(function (process,global){
/*jshint strict: false */
/*global chrome */
var merge = require('./merge');
exports.extend = require('pouchdb-extend');
exports.ajax = require('./deps/ajax');
exports.createBlob = require('./deps/blob');
exports.uuid = require('./deps/uuid');
exports.getArguments = require('argsarray');
var buffer = require('./deps/buffer');
var errors = require('./deps/errors');
var EventEmitter = require('events').EventEmitter;
var collections = require('./deps/collections');
exports.Map = collections.Map;
exports.Set = collections.Set;

if (typeof global.Promise === 'function') {
  exports.Promise = global.Promise;
} else {
  exports.Promise = require('bluebird');
}
var Promise = exports.Promise;

function toObject(array) {
  var obj = {};
  array.forEach(function (item) { obj[item] = true; });
  return obj;
}
// List of top level reserved words for doc
var reservedWords = toObject([
  '_id',
  '_rev',
  '_attachments',
  '_deleted',
  '_revisions',
  '_revs_info',
  '_conflicts',
  '_deleted_conflicts',
  '_local_seq',
  '_rev_tree',
  //replication documents
  '_replication_id',
  '_replication_state',
  '_replication_state_time',
  '_replication_state_reason',
  '_replication_stats'
]);

// List of reserved words that should end up the document
var dataWords = toObject([
  '_attachments',
  //replication documents
  '_replication_id',
  '_replication_state',
  '_replication_state_time',
  '_replication_state_reason',
  '_replication_stats'
]);

exports.clone = function (obj) {
  return exports.extend(true, {}, obj);
};
exports.inherits = require('inherits');
// Determine id an ID is valid
//   - invalid IDs begin with an underescore that does not begin '_design' or
//     '_local'
//   - any other string value is a valid id
// Returns the specific error object for each case
exports.invalidIdError = function (id) {
  var err;
  if (!id) {
    err = new TypeError(errors.MISSING_ID.message);
    err.status = 412;
  } else if (typeof id !== 'string') {
    err = new TypeError(errors.INVALID_ID.message);
    err.status = 400;
  } else if (/^_/.test(id) && !(/^_(design|local)/).test(id)) {
    err = new TypeError(errors.RESERVED_ID.message);
    err.status = 400;
  }
  if (err) {
    throw err;
  }
};

function isChromeApp() {
  return (typeof chrome !== "undefined" &&
          typeof chrome.storage !== "undefined" &&
          typeof chrome.storage.local !== "undefined");
}

// Pretty dumb name for a function, just wraps callback calls so we dont
// to if (callback) callback() everywhere
exports.call = exports.getArguments(function (args) {
  if (!args.length) {
    return;
  }
  var fun = args.shift();
  if (typeof fun === 'function') {
    fun.apply(this, args);
  }
});

exports.isLocalId = function (id) {
  return (/^_local/).test(id);
};

// check if a specific revision of a doc has been deleted
//  - metadata: the metadata object from the doc store
//  - rev: (optional) the revision to check. defaults to winning revision
exports.isDeleted = function (metadata, rev) {
  if (!rev) {
    rev = merge.winningRev(metadata);
  }
  var dashIndex = rev.indexOf('-');
  if (dashIndex !== -1) {
    rev = rev.substring(dashIndex + 1);
  }
  var deleted = false;
  merge.traverseRevTree(metadata.rev_tree,
  function (isLeaf, pos, id, acc, opts) {
    if (id === rev) {
      deleted = !!opts.deleted;
    }
  });

  return deleted;
};

exports.filterChange = function (opts) {
  return function (change) {
    var req = {};
    var hasFilter = opts.filter && typeof opts.filter === 'function';

    req.query = opts.query_params;
    if (opts.filter && hasFilter && !opts.filter.call(this, change.doc, req)) {
      return false;
    }
    if (opts.doc_ids && opts.doc_ids.indexOf(change.id) === -1) {
      return false;
    }
    if (!opts.include_docs) {
      delete change.doc;
    } else {
      for (var att in change.doc._attachments) {
        if (change.doc._attachments.hasOwnProperty(att)) {
          change.doc._attachments[att].stub = true;
        }
      }
    }
    return true;
  };
};

// Preprocess documents, parse their revisions, assign an id and a
// revision for new writes that are missing them, etc
exports.parseDoc = function (doc, newEdits) {
  var nRevNum;
  var newRevId;
  var revInfo;
  var error;
  var opts = {status: 'available'};
  if (doc._deleted) {
    opts.deleted = true;
  }

  if (newEdits) {
    if (!doc._id) {
      doc._id = exports.uuid();
    }
    newRevId = exports.uuid(32, 16).toLowerCase();
    if (doc._rev) {
      revInfo = /^(\d+)-(.+)$/.exec(doc._rev);
      if (!revInfo) {
        var err = new TypeError("invalid value for property '_rev'");
        err.status = 400;
      }
      doc._rev_tree = [{
        pos: parseInt(revInfo[1], 10),
        ids: [revInfo[2], {status: 'missing'}, [[newRevId, opts, []]]]
      }];
      nRevNum = parseInt(revInfo[1], 10) + 1;
    } else {
      doc._rev_tree = [{
        pos: 1,
        ids : [newRevId, opts, []]
      }];
      nRevNum = 1;
    }
  } else {
    if (doc._revisions) {
      doc._rev_tree = [{
        pos: doc._revisions.start - doc._revisions.ids.length + 1,
        ids: doc._revisions.ids.reduce(function (acc, x) {
          if (acc === null) {
            return [x, opts, []];
          } else {
            return [x, {status: 'missing'}, [acc]];
          }
        }, null)
      }];
      nRevNum = doc._revisions.start;
      newRevId = doc._revisions.ids[0];
    }
    if (!doc._rev_tree) {
      revInfo = /^(\d+)-(.+)$/.exec(doc._rev);
      if (!revInfo) {
        error = new TypeError(errors.BAD_ARG.message);
        error.status = errors.BAD_ARG.status;
        throw error;
      }
      nRevNum = parseInt(revInfo[1], 10);
      newRevId = revInfo[2];
      doc._rev_tree = [{
        pos: parseInt(revInfo[1], 10),
        ids: [revInfo[2], opts, []]
      }];
    }
  }

  exports.invalidIdError(doc._id);

  doc._rev = [nRevNum, newRevId].join('-');

  var result = {metadata : {}, data : {}};
  for (var key in doc) {
    if (doc.hasOwnProperty(key)) {
      var specialKey = key[0] === '_';
      if (specialKey && !reservedWords[key]) {
        error = new Error(errors.DOC_VALIDATION.message + ': ' + key);
        error.status = errors.DOC_VALIDATION.status;
        throw error;
      } else if (specialKey && !dataWords[key]) {
        result.metadata[key.slice(1)] = doc[key];
      } else {
        result.data[key] = doc[key];
      }
    }
  }
  return result;
};

exports.isCordova = function () {
  return (typeof cordova !== "undefined" ||
          typeof PhoneGap !== "undefined" ||
          typeof phonegap !== "undefined");
};

exports.hasLocalStorage = function () {
  if (isChromeApp()) {
    return false;
  }
  try {
    return global.localStorage;
  } catch (e) {
    return false;
  }
};
exports.Changes = Changes;
exports.inherits(Changes, EventEmitter);
function Changes() {
  if (!(this instanceof Changes)) {
    return new Changes();
  }
  var self = this;
  EventEmitter.call(this);
  this.isChrome = isChromeApp();
  this.listeners = {};
  this.hasLocal = false;
  if (!this.isChrome) {
    this.hasLocal = exports.hasLocalStorage();
  }
  if (this.isChrome) {
    chrome.storage.onChanged.addListener(function (e) {
      // make sure it's event addressed to us
      if (e.db_name != null) {
        //object only has oldValue, newValue members
        self.emit(e.dbName.newValue);
      }
    });
  } else if (this.hasLocal) {
    if (global.addEventListener) {
      global.addEventListener("storage", function (e) {
        self.emit(e.key);
      });
    } else {
      global.attachEvent("storage", function (e) {
        self.emit(e.key);
      });
    }
  }

}
Changes.prototype.addListener = function (dbName, id, db, opts) {
  if (this.listeners[id]) {
    return;
  }
  function eventFunction() {
    db.changes({
      include_docs: opts.include_docs,
      conflicts: opts.conflicts,
      continuous: false,
      descending: false,
      filter: opts.filter,
      view: opts.view,
      since: opts.since,
      query_params: opts.query_params,
      onChange: function (c) {
        if (c.seq > opts.since && !opts.cancelled) {
          opts.since = c.seq;
          exports.call(opts.onChange, c);
        }
      }
    });
  }
  this.listeners[id] = eventFunction;
  this.on(dbName, eventFunction);
};

Changes.prototype.removeListener = function (dbName, id) {
  if (!(id in this.listeners)) {
    return;
  }
  EventEmitter.prototype.removeListener.call(this, dbName,
    this.listeners[id]);
};


Changes.prototype.notifyLocalWindows = function (dbName) {
  //do a useless change on a storage thing
  //in order to get other windows's listeners to activate
  if (this.isChrome) {
    chrome.storage.local.set({dbName: dbName});
  } else if (this.hasLocal) {
    localStorage[dbName] = (localStorage[dbName] === "a") ? "b" : "a";
  }
};

Changes.prototype.notify = function (dbName) {
  this.emit(dbName);
  this.notifyLocalWindows(dbName);
};

if (!process.browser || !('atob' in global)) {
  exports.atob = function (str) {
    var base64 = new buffer(str, 'base64');
    // Node.js will just skip the characters it can't encode instead of
    // throwing and exception
    if (base64.toString('base64') !== str) {
      throw ("Cannot base64 encode full string");
    }
    return base64.toString('binary');
  };
} else {
  exports.atob = function (str) {
    return atob(str);
  };
}

if (!process.browser || !('btoa' in global)) {
  exports.btoa = function (str) {
    return new buffer(str, 'binary').toString('base64');
  };
} else {
  exports.btoa = function (str) {
    return btoa(str);
  };
}

// From http://stackoverflow.com/questions/14967647/ (continues on next line)
// encode-decode-image-with-base64-breaks-image (2013-04-21)
exports.fixBinary = function (bin) {
  if (!process.browser) {
    // don't need to do this in Node
    return bin;
  }

  var length = bin.length;
  var buf = new ArrayBuffer(length);
  var arr = new Uint8Array(buf);
  for (var i = 0; i < length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return buf;
};

exports.once = function (fun) {
  var called = false;
  return exports.getArguments(function (args) {
    if (called) {
      if (typeof console.trace === 'function') {
        console.trace();
      }
      throw new Error('once called  more than once');
    } else {
      called = true;
      fun.apply(this, args);
    }
  });
};

exports.toPromise = function (func) {
  //create the function we will be returning
  return exports.getArguments(function (args) {
    var self = this;
    var tempCB =
      (typeof args[args.length - 1] === 'function') ? args.pop() : false;
    // if the last argument is a function, assume its a callback
    var usedCB;
    if (tempCB) {
      // if it was a callback, create a new callback which calls it,
      // but do so async so we don't trap any errors
      usedCB = function (err, resp) {
        process.nextTick(function () {
          tempCB(err, resp);
        });
      };
    }
    var promise = new Promise(function (fulfill, reject) {
      var resp;
      try {
        var callback = exports.once(function (err, mesg) {
          if (err) {
            reject(err);
          } else {
            fulfill(mesg);
          }
        });
        // create a callback for this invocation
        // apply the function in the orig context
        args.push(callback);
        resp = func.apply(self, args);
        if (resp && typeof resp.then === 'function') {
          fulfill(resp);
        }
      } catch (e) {
        reject(e);
      }
    });
    // if there is a callback, call it back
    if (usedCB) {
      promise.then(function (result) {
        usedCB(null, result);
      }, usedCB);
    }
    promise.cancel = function () {
      return this;
    };
    return promise;
  });
};

exports.adapterFun = function (name, callback) {
  return exports.toPromise(exports.getArguments(function (args) {
    if (this._closed) {
      return Promise.reject(new Error('database is closed'));
    }
    var self = this;
    if (!this.taskqueue.isReady) {
      return new exports.Promise(function (fulfill, reject) {
        self.taskqueue.addTask(function (failed) {
          if (failed) {
            reject(failed);
          } else {
            fulfill(self[name].apply(self, args));
          }
        });
      });
    }
    return callback.apply(this, args);
  }));
};
//Can't find original post, but this is close
//http://stackoverflow.com/questions/6965107/ (continues on next line)
//converting-between-strings-and-arraybuffers
exports.arrayBufferToBinaryString = function (buffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var length = bytes.byteLength;
  for (var i = 0; i < length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
};

exports.cancellableFun = function (fun, self, opts) {

  opts = opts ? exports.clone(true, {}, opts) : {};

  var emitter = new EventEmitter();
  var oldComplete = opts.complete || function () { };
  var complete = opts.complete = exports.once(function (err, resp) {
    if (err) {
      oldComplete(err);
    } else {
      emitter.emit('end', resp);
      oldComplete(null, resp);
    }
    emitter.removeAllListeners();
  });
  var oldOnChange = opts.onChange || function () {};
  var lastChange = 0;
  self.on('destroyed', function () {
    emitter.removeAllListeners();
  });
  opts.onChange = function (change) {
    oldOnChange(change);
    if (change.seq <= lastChange) {
      return;
    }
    lastChange = change.seq;
    emitter.emit('change', change);
    if (change.deleted) {
      emitter.emit('delete', change);
    } else if (change.changes.length === 1 &&
      change.changes[0].rev.slice(0, 1) === '1-') {
      emitter.emit('create', change);
    } else {
      emitter.emit('update', change);
    }
  };
  var promise = new Promise(function (fulfill, reject) {
    opts.complete = function (err, res) {
      if (err) {
        reject(err);
      } else {
        fulfill(res);
      }
    };
  });

  promise.then(function (result) {
    complete(null, result);
  }, complete);

  // this needs to be overwridden by caller, dont fire complete until
  // the task is ready
  promise.cancel = function () {
    promise.isCancelled = true;
    if (self.taskqueue.isReady) {
      opts.complete(null, {status: 'cancelled'});
    }
  };

  if (!self.taskqueue.isReady) {
    self.taskqueue.addTask(function () {
      if (promise.isCancelled) {
        opts.complete(null, {status: 'cancelled'});
      } else {
        fun(self, opts, promise);
      }
    });
  } else {
    fun(self, opts, promise);
  }
  promise.on = emitter.on.bind(emitter);
  promise.once = emitter.once.bind(emitter);
  promise.addListener = emitter.addListener.bind(emitter);
  promise.removeListener = emitter.removeListener.bind(emitter);
  promise.removeAllListeners = emitter.removeAllListeners.bind(emitter);
  promise.setMaxListeners = emitter.setMaxListeners.bind(emitter);
  promise.listeners = emitter.listeners.bind(emitter);
  promise.emit = emitter.emit.bind(emitter);
  return promise;
};

exports.MD5 = exports.toPromise(require('./deps/md5'));

}).call(this,require("q+64fw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./deps/ajax":9,"./deps/blob":10,"./deps/buffer":93,"./deps/collections":11,"./deps/errors":12,"./deps/md5":13,"./deps/uuid":15,"./merge":19,"argsarray":26,"bluebird":31,"events":94,"inherits":27,"pouchdb-extend":46,"q+64fw":95}],25:[function(require,module,exports){
module.exports = "3.0.6";

},{}],26:[function(require,module,exports){
'use strict';

module.exports = argsArray;

function argsArray(fun) {
  return function () {
    var len = arguments.length;
    if (len) {
      var args = [];
      var i = -1;
      while (++i < len) {
        args[i] = arguments[i];
      }
      return fun.call(this, args);
    } else {
      return fun.call(this, []);
    }
  };
}
},{}],27:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],28:[function(require,module,exports){
'use strict';

module.exports = INTERNAL;

function INTERNAL() {}
},{}],29:[function(require,module,exports){
'use strict';
var Promise = require('./promise');
var reject = require('./reject');
var resolve = require('./resolve');
var INTERNAL = require('./INTERNAL');
var handlers = require('./handlers');
module.exports = all;
function all(iterable) {
  if (Object.prototype.toString.call(iterable) !== '[object Array]') {
    return reject(new TypeError('must be an array'));
  }

  var len = iterable.length;
  var called = false;
  if (!len) {
    return resolve([]);
  }

  var values = new Array(len);
  var resolved = 0;
  var i = -1;
  var promise = new Promise(INTERNAL);
  
  while (++i < len) {
    allResolver(iterable[i], i);
  }
  return promise;
  function allResolver(value, i) {
    resolve(value).then(resolveFromAll, function (error) {
      if (!called) {
        called = true;
        handlers.reject(promise, error);
      }
    });
    function resolveFromAll(outValue) {
      values[i] = outValue;
      if (++resolved === len & !called) {
        called = true;
        handlers.resolve(promise, values);
      }
    }
  }
}
},{"./INTERNAL":28,"./handlers":30,"./promise":32,"./reject":35,"./resolve":36}],30:[function(require,module,exports){
'use strict';
var tryCatch = require('./tryCatch');
var resolveThenable = require('./resolveThenable');
var states = require('./states');

exports.resolve = function (self, value) {
  var result = tryCatch(getThen, value);
  if (result.status === 'error') {
    return exports.reject(self, result.value);
  }
  var thenable = result.value;

  if (thenable) {
    resolveThenable.safely(self, thenable);
  } else {
    self.state = states.FULFILLED;
    self.outcome = value;
    var i = -1;
    var len = self.queue.length;
    while (++i < len) {
      self.queue[i].callFulfilled(value);
    }
  }
  return self;
};
exports.reject = function (self, error) {
  self.state = states.REJECTED;
  self.outcome = error;
  var i = -1;
  var len = self.queue.length;
  while (++i < len) {
    self.queue[i].callRejected(error);
  }
  return self;
};

function getThen(obj) {
  // Make sure we only access the accessor once as required by the spec
  var then = obj && obj.then;
  if (obj && typeof obj === 'object' && typeof then === 'function') {
    return function appyThen() {
      then.apply(obj, arguments);
    };
  }
}
},{"./resolveThenable":37,"./states":38,"./tryCatch":39}],31:[function(require,module,exports){
module.exports = exports = require('./promise');

exports.resolve = require('./resolve');
exports.reject = require('./reject');
exports.all = require('./all');
exports.race = require('./race');
},{"./all":29,"./promise":32,"./race":34,"./reject":35,"./resolve":36}],32:[function(require,module,exports){
'use strict';

var unwrap = require('./unwrap');
var INTERNAL = require('./INTERNAL');
var resolveThenable = require('./resolveThenable');
var states = require('./states');
var QueueItem = require('./queueItem');

module.exports = Promise;
function Promise(resolver) {
  if (!(this instanceof Promise)) {
    return new Promise(resolver);
  }
  if (typeof resolver !== 'function') {
    throw new TypeError('reslover must be a function');
  }
  this.state = states.PENDING;
  this.queue = [];
  this.outcome = void 0;
  if (resolver !== INTERNAL) {
    resolveThenable.safely(this, resolver);
  }
}

Promise.prototype['catch'] = function (onRejected) {
  return this.then(null, onRejected);
};
Promise.prototype.then = function (onFulfilled, onRejected) {
  if (typeof onFulfilled !== 'function' && this.state === states.FULFILLED ||
    typeof onRejected !== 'function' && this.state === states.REJECTED) {
    return this;
  }
  var promise = new Promise(INTERNAL);

  
  if (this.state !== states.PENDING) {
    var resolver = this.state === states.FULFILLED ? onFulfilled: onRejected;
    unwrap(promise, resolver, this.outcome);
  } else {
    this.queue.push(new QueueItem(promise, onFulfilled, onRejected));
  }

  return promise;
};

},{"./INTERNAL":28,"./queueItem":33,"./resolveThenable":37,"./states":38,"./unwrap":40}],33:[function(require,module,exports){
'use strict';
var handlers = require('./handlers');
var unwrap = require('./unwrap');

module.exports = QueueItem;
function QueueItem(promise, onFulfilled, onRejected) {
  this.promise = promise;
  if (typeof onFulfilled === 'function') {
    this.onFulfilled = onFulfilled;
    this.callFulfilled = this.otherCallFulfilled;
  }
  if (typeof onRejected === 'function') {
    this.onRejected = onRejected;
    this.callRejected = this.otherCallRejected;
  }
}
QueueItem.prototype.callFulfilled = function (value) {
  handlers.resolve(this.promise, value);
};
QueueItem.prototype.otherCallFulfilled = function (value) {
  unwrap(this.promise, this.onFulfilled, value);
};
QueueItem.prototype.callRejected = function (value) {
  handlers.reject(this.promise, value);
};
QueueItem.prototype.otherCallRejected = function (value) {
  unwrap(this.promise, this.onRejected, value);
};
},{"./handlers":30,"./unwrap":40}],34:[function(require,module,exports){
'use strict';
var Promise = require('./promise');
var reject = require('./reject');
var resolve = require('./resolve');
var INTERNAL = require('./INTERNAL');
var handlers = require('./handlers');
module.exports = race;
function race(iterable) {
  if (Object.prototype.toString.call(iterable) !== '[object Array]') {
    return reject(new TypeError('must be an array'));
  }

  var len = iterable.length;
  var called = false;
  if (!len) {
    return resolve([]);
  }

  var resolved = 0;
  var i = -1;
  var promise = new Promise(INTERNAL);
  
  while (++i < len) {
    resolver(iterable[i]);
  }
  return promise;
  function resolver(value) {
    resolve(value).then(function (response) {
      if (!called) {
        called = true;
        handlers.resolve(promise, response);
      }
    }, function (error) {
      if (!called) {
        called = true;
        handlers.reject(promise, error);
      }
    });
  }
}
},{"./INTERNAL":28,"./handlers":30,"./promise":32,"./reject":35,"./resolve":36}],35:[function(require,module,exports){
'use strict';

var Promise = require('./promise');
var INTERNAL = require('./INTERNAL');
var handlers = require('./handlers');
module.exports = reject;

function reject(reason) {
	var promise = new Promise(INTERNAL);
	return handlers.reject(promise, reason);
}
},{"./INTERNAL":28,"./handlers":30,"./promise":32}],36:[function(require,module,exports){
'use strict';

var Promise = require('./promise');
var INTERNAL = require('./INTERNAL');
var handlers = require('./handlers');
module.exports = resolve;

var FALSE = handlers.resolve(new Promise(INTERNAL), false);
var NULL = handlers.resolve(new Promise(INTERNAL), null);
var UNDEFINED = handlers.resolve(new Promise(INTERNAL), void 0);
var ZERO = handlers.resolve(new Promise(INTERNAL), 0);
var EMPTYSTRING = handlers.resolve(new Promise(INTERNAL), '');

function resolve(value) {
  if (value) {
    if (value instanceof Promise) {
      return value;
    }
    return handlers.resolve(new Promise(INTERNAL), value);
  }
  var valueType = typeof value;
  switch (valueType) {
    case 'boolean':
      return FALSE;
    case 'undefined':
      return UNDEFINED;
    case 'object':
      return NULL;
    case 'number':
      return ZERO;
    case 'string':
      return EMPTYSTRING;
  }
}
},{"./INTERNAL":28,"./handlers":30,"./promise":32}],37:[function(require,module,exports){
'use strict';
var handlers = require('./handlers');
var tryCatch = require('./tryCatch');
function safelyResolveThenable(self, thenable) {
  // Either fulfill, reject or reject with error
  var called = false;
  function onError(value) {
    if (called) {
      return;
    }
    called = true;
    handlers.reject(self, value);
  }

  function onSuccess(value) {
    if (called) {
      return;
    }
    called = true;
    handlers.resolve(self, value);
  }

  function tryToUnwrap() {
    thenable(onSuccess, onError);
  }
  
  var result = tryCatch(tryToUnwrap);
  if (result.status === 'error') {
    onError(result.value);
  }
}
exports.safely = safelyResolveThenable;
},{"./handlers":30,"./tryCatch":39}],38:[function(require,module,exports){
// Lazy man's symbols for states

exports.REJECTED = ['REJECTED'];
exports.FULFILLED = ['FULFILLED'];
exports.PENDING = ['PENDING'];
},{}],39:[function(require,module,exports){
'use strict';

module.exports = tryCatch;

function tryCatch(func, value) {
  var out = {};
  try {
    out.value = func(value);
    out.status = 'success';
  } catch (e) {
    out.status = 'error';
    out.value = e;
  }
  return out;
}
},{}],40:[function(require,module,exports){
'use strict';

var immediate = require('immediate');
var handlers = require('./handlers');
module.exports = unwrap;

function unwrap(promise, func, value) {
  immediate(function () {
    var returnValue;
    try {
      returnValue = func(value);
    } catch (e) {
      return handlers.reject(promise, e);
    }
    if (returnValue === promise) {
      handlers.reject(promise, new TypeError('Cannot resolve promise with itself'));
    } else {
      handlers.resolve(promise, returnValue);
    }
  });
}
},{"./handlers":30,"immediate":41}],41:[function(require,module,exports){
'use strict';
var types = [
  require('./nextTick'),
  require('./mutation.js'),
  require('./messageChannel'),
  require('./stateChange'),
  require('./timeout')
];
var draining;
var queue = [];
//named nextTick for less confusing stack traces
function nextTick() {
  draining = true;
  var i, oldQueue;
  var len = queue.length;
  while (len) {
    oldQueue = queue;
    queue = [];
    i = -1;
    while (++i < len) {
      oldQueue[i]();
    }
    len = queue.length;
  }
  draining = false;
}
var scheduleDrain;
var i = -1;
var len = types.length;
while (++ i < len) {
  if (types[i] && types[i].test && types[i].test()) {
    scheduleDrain = types[i].install(nextTick);
    break;
  }
}
module.exports = immediate;
function immediate(task) {
  if (queue.push(task) === 1 && !draining) {
    scheduleDrain();
  }
}
},{"./messageChannel":42,"./mutation.js":43,"./nextTick":93,"./stateChange":44,"./timeout":45}],42:[function(require,module,exports){
(function (global){
'use strict';

exports.test = function () {
  if (global.setImmediate) {
    // we can only get here in IE10
    // which doesn't handel postMessage well
    return false;
  }
  return typeof global.MessageChannel !== 'undefined';
};

exports.install = function (func) {
  var channel = new global.MessageChannel();
  channel.port1.onmessage = func;
  return function () {
    channel.port2.postMessage(0);
  };
};
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],43:[function(require,module,exports){
(function (global){
'use strict';
//based off rsvp https://github.com/tildeio/rsvp.js
//license https://github.com/tildeio/rsvp.js/blob/master/LICENSE
//https://github.com/tildeio/rsvp.js/blob/master/lib/rsvp/asap.js

var Mutation = global.MutationObserver || global.WebKitMutationObserver;

exports.test = function () {
  return Mutation;
};

exports.install = function (handle) {
  var called = 0;
  var observer = new Mutation(handle);
  var element = global.document.createTextNode('');
  observer.observe(element, {
    characterData: true
  });
  return function () {
    element.data = (called = ++called % 2);
  };
};
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],44:[function(require,module,exports){
(function (global){
'use strict';

exports.test = function () {
  return 'document' in global && 'onreadystatechange' in global.document.createElement('script');
};

exports.install = function (handle) {
  return function () {

    // Create a <script> element; its readystatechange event will be fired asynchronously once it is inserted
    // into the document. Do so, thus queuing up the task. Remember to clean up once it's been called.
    var scriptEl = global.document.createElement('script');
    scriptEl.onreadystatechange = function () {
      handle();

      scriptEl.onreadystatechange = null;
      scriptEl.parentNode.removeChild(scriptEl);
      scriptEl = null;
    };
    global.document.documentElement.appendChild(scriptEl);

    return handle;
  };
};
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],45:[function(require,module,exports){
'use strict';
exports.test = function () {
  return true;
};

exports.install = function (t) {
  return function () {
    setTimeout(t, 0);
  };
};
},{}],46:[function(require,module,exports){
"use strict";

// Extends method
// (taken from http://code.jquery.com/jquery-1.9.0.js)
// Populate the class2type map
var class2type = {};

var types = [
  "Boolean", "Number", "String", "Function", "Array",
  "Date", "RegExp", "Object", "Error"
];
for (var i = 0; i < types.length; i++) {
  var typename = types[i];
  class2type["[object " + typename + "]"] = typename.toLowerCase();
}

var core_toString = class2type.toString;
var core_hasOwn = class2type.hasOwnProperty;

function type(obj) {
  if (obj === null) {
    return String(obj);
  }
  return typeof obj === "object" || typeof obj === "function" ?
    class2type[core_toString.call(obj)] || "object" :
    typeof obj;
}

function isWindow(obj) {
  return obj !== null && obj === obj.window;
}

function isPlainObject(obj) {
  // Must be an Object.
  // Because of IE, we also have to check the presence of
  // the constructor property.
  // Make sure that DOM nodes and window objects don't pass through, as well
  if (!obj || type(obj) !== "object" || obj.nodeType || isWindow(obj)) {
    return false;
  }

  try {
    // Not own constructor property must be Object
    if (obj.constructor &&
      !core_hasOwn.call(obj, "constructor") &&
      !core_hasOwn.call(obj.constructor.prototype, "isPrototypeOf")) {
      return false;
    }
  } catch ( e ) {
    // IE8,9 Will throw exceptions on certain host objects #9897
    return false;
  }

  // Own properties are enumerated firstly, so to speed up,
  // if last one is own, then all properties are own.
  var key;
  for (key in obj) {}

  return key === undefined || core_hasOwn.call(obj, key);
}


function isFunction(obj) {
  return type(obj) === "function";
}

var isArray = Array.isArray || function (obj) {
  return type(obj) === "array";
};

function extend() {
  // originally extend() was recursive, but this ended up giving us
  // "call stack exceeded", so it's been unrolled to use a literal stack
  // (see https://github.com/pouchdb/pouchdb/issues/2543)
  var stack = [];
  var i = -1;
  var len = arguments.length;
  var args = new Array(len);
  while (++i < len) {
    args[i] = arguments[i];
  }
  var container = {};
  stack.push({args: args, result: {container: container, key: 'key'}});
  var next;
  while ((next = stack.pop())) {
    extendInner(stack, next.args, next.result);
  }
  return container.key;
}

function extendInner(stack, args, result) {
  var options, name, src, copy, copyIsArray, clone,
    target = args[0] || {},
    i = 1,
    length = args.length,
    deep = false,
    numericStringRegex = /\d+/,
    optionsIsArray;

  // Handle a deep copy situation
  if (typeof target === "boolean") {
    deep = target;
    target = args[1] || {};
    // skip the boolean and the target
    i = 2;
  }

  // Handle case when target is a string or something (possible in deep copy)
  if (typeof target !== "object" && !isFunction(target)) {
    target = {};
  }

  // extend jQuery itself if only one argument is passed
  if (length === i) {
    /* jshint validthis: true */
    target = this;
    --i;
  }

  for (; i < length; i++) {
    // Only deal with non-null/undefined values
    if ((options = args[i]) != null) {
      optionsIsArray = isArray(options);
      // Extend the base object
      for (name in options) {
        //if (options.hasOwnProperty(name)) {
        if (!(name in Object.prototype)) {
          if (optionsIsArray && !numericStringRegex.test(name)) {
            continue;
          }

          src = target[name];
          copy = options[name];

          // Prevent never-ending loop
          if (target === copy) {
            continue;
          }

          // Recurse if we're merging plain objects or arrays
          if (deep && copy && (isPlainObject(copy) ||
              (copyIsArray = isArray(copy)))) {
            if (copyIsArray) {
              copyIsArray = false;
              clone = src && isArray(src) ? src : [];

            } else {
              clone = src && isPlainObject(src) ? src : {};
            }

            // Never move original objects, clone them
            stack.push({
              args: [deep, clone, copy],
              result: {
                container: target,
                key: name
              }
            });

          // Don't bring in undefined values
          } else if (copy !== undefined) {
            if (!(isArray(options) && isFunction(copy))) {
              target[name] = copy;
            }
          }
        }
      }
    }
  }

  // "Return" the modified object by setting the key
  // on the given container
  result.container[result.key] = target;
}


module.exports = extend;



},{}],47:[function(require,module,exports){
'use strict';

var upsert = require('./upsert');
var utils = require('./utils');
var Promise = utils.Promise;

module.exports = function (opts) {
  var sourceDB = opts.db;
  var viewName = opts.viewName;
  var mapFun = opts.map;
  var reduceFun = opts.reduce;
  var temporary = opts.temporary;

  // the "undefined" part is for backwards compatibility
  var viewSignature = mapFun.toString() + (reduceFun && reduceFun.toString()) +
    'undefined';

  if (!temporary && sourceDB._cachedViews) {
    var cachedView = sourceDB._cachedViews[viewSignature];
    if (cachedView) {
      return Promise.resolve(cachedView);
    }
  }

  return sourceDB.info().then(function (info) {

    var depDbName = info.db_name + '-mrview-' +
      (temporary ? 'temp' : utils.MD5(viewSignature));

    // save the view name in the source PouchDB so it can be cleaned up if necessary
    // (e.g. when the _design doc is deleted, remove all associated view data)
    function diffFunction(doc) {
      doc.views = doc.views || {};
      var fullViewName = viewName;
      if (fullViewName.indexOf('/') === -1) {
        fullViewName = viewName + '/' + viewName;
      }
      var depDbs = doc.views[fullViewName] = doc.views[fullViewName] || {};
      /* istanbul ignore if */
      if (depDbs[depDbName]) {
        return; // no update necessary
      }
      depDbs[depDbName] = true;
      return doc;
    }
    return upsert(sourceDB, '_local/mrviews', diffFunction).then(function () {
      return sourceDB.registerDependentDatabase(depDbName).then(function (res) {
        var db = res.db;
        db.auto_compaction = true;
        var view = {
          name: depDbName,
          db: db, 
          sourceDB: sourceDB,
          adapter: sourceDB.adapter,
          mapFun: mapFun,
          reduceFun: reduceFun
        };
        return view.db.get('_local/lastSeq')["catch"](function (err) {
          /* istanbul ignore if */
          if (err.status !== 404) {
            throw err;
          }
        }).then(function (lastSeqDoc) {
          view.seq = lastSeqDoc ? lastSeqDoc.seq : 0;
          if (!temporary) {
            sourceDB._cachedViews = sourceDB._cachedViews || {};
            sourceDB._cachedViews[viewSignature] = view;
            view.db.on('destroyed', function () {
              delete sourceDB._cachedViews[viewSignature];
            });
          }
          return view;
        });
      });
    });
  });
};

},{"./upsert":53,"./utils":54}],48:[function(require,module,exports){
'use strict';

module.exports = function (func, emit, sum, log, isArray, toJSON) {
  /*jshint evil:true,unused:false */
  return eval("'use strict'; (" + func.replace(/;\s*$/, "") + ");");
};

},{}],49:[function(require,module,exports){
(function (process){
'use strict';

var pouchCollate = require('pouchdb-collate');
var TaskQueue = require('./taskqueue');
var collate = pouchCollate.collate;
var toIndexableString = pouchCollate.toIndexableString;
var normalizeKey = pouchCollate.normalizeKey;
var createView = require('./create-view');
var evalFunc = require('./evalfunc');
var log; 
/* istanbul ignore else */
if ((typeof console !== 'undefined') && (typeof console.log === 'function')) {
  log = Function.prototype.bind.call(console.log, console);
} else {
  log = function () {};
}
var utils = require('./utils');
var Promise = utils.Promise;
var mainQueue = new TaskQueue();
var tempViewQueue = new TaskQueue();
var CHANGES_BATCH_SIZE = 50;

function parseViewName(name) {
  // can be either 'ddocname/viewname' or just 'viewname'
  // (where the ddoc name is the same)
  return name.indexOf('/') === -1 ? [name, name] : name.split('/');
}

function tryCode(db, fun, args) {
  // emit an event if there was an error thrown by a map/reduce function.
  // putting try/catches in a single function also avoids deoptimizations.
  try {
    return {
      output : fun.apply(null, args)
    };
  } catch (e) {
    db.emit('error', e);
    return {error : e};
  }
}

function sortByKeyThenValue(x, y) {
  var keyCompare = collate(x.key, y.key);
  return keyCompare !== 0 ? keyCompare : collate(x.value, y.value);
}

function sliceResults(results, limit, skip) {
  skip = skip || 0;
  if (typeof limit === 'number') {
    return results.slice(skip, limit + skip);
  } else if (skip > 0) {
    return results.slice(skip);
  }
  return results;
}

function createBuiltInError(name) {
  var error = new Error('builtin ' + name +
    ' function requires map values to be numbers' +
    ' or number arrays');
  error.name = 'invalid_value';
  error.status = 500;
  return error;
}

function sum(values) {
  var result = 0;
  for (var i = 0, len = values.length; i < len; i++) {
    var num = values[i];
    if (typeof num !== 'number') {
      if (Array.isArray(num)) {
        // lists of numbers are also allowed, sum them separately
        result = typeof result === 'number' ? [result] : result;
        for (var j = 0, jLen = num.length; j < jLen; j++) {
          var jNum = num[j];
          if (typeof jNum !== 'number') {
            throw createBuiltInError('_sum');
          } else if (typeof result[j] === 'undefined') {
            result.push(jNum);
          } else {
            result[j] += jNum;
          }
        }
      } else { // not array/number
        throw createBuiltInError('_sum');
      }
    } else if (typeof result === 'number') {
      result += num;
    } else { // add number to array
      result[0] += num;
    }
  }
  return result;
}

var builtInReduce = {
  _sum: function (keys, values) {
    return sum(values);
  },

  _count: function (keys, values) {
    return values.length;
  },

  _stats: function (keys, values) {
    // no need to implement rereduce=true, because Pouch
    // will never call it
    function sumsqr(values) {
      var _sumsqr = 0;
      for (var i = 0, len = values.length; i < len; i++) {
        var num = values[i];
        _sumsqr += (num * num);
      }
      return _sumsqr;
    }
    return {
      sum     : sum(values),
      min     : Math.min.apply(null, values),
      max     : Math.max.apply(null, values),
      count   : values.length,
      sumsqr : sumsqr(values)
    };
  }
};

function addHttpParam(paramName, opts, params, asJson) {
  // add an http param from opts to params, optionally json-encoded
  var val = opts[paramName];
  if (typeof val !== 'undefined') {
    if (asJson) {
      val = encodeURIComponent(JSON.stringify(val));
    }
    params.push(paramName + '=' + val);
  }
}

function checkQueryParseError(options, fun) {
  var startkeyName = options.descending ? 'endkey' : 'startkey';
  var endkeyName = options.descending ? 'startkey' : 'endkey';

  if (typeof options[startkeyName] !== 'undefined' &&
    typeof options[endkeyName] !== 'undefined' &&
    collate(options[startkeyName], options[endkeyName]) > 0) {
    throw new QueryParseError('No rows can match your key range, reverse your ' +
        'start_key and end_key or set {descending : true}');
  } else if (fun.reduce && options.reduce !== false) {
    if (options.include_docs) {
      throw new QueryParseError('{include_docs:true} is invalid for reduce');
    } else if (options.keys && options.keys.length > 1 &&
        !options.group && !options.group_level) {
      throw new QueryParseError('Multi-key fetches for reduce views must use {group: true}');
    }
  }
  if (options.group_level) {
    if (typeof options.group_level !== 'number') {
      throw new QueryParseError('Invalid value for integer: "' + options.group_level + '"');
    }
    if (options.group_level < 0) {
      throw new QueryParseError('Invalid value for positive integer: ' +
        '"' + options.group_level + '"');
    }
  }
}

function httpQuery(db, fun, opts) {
  // List of parameters to add to the PUT request
  var params = [];
  var body;
  var method = 'GET';

  // If opts.reduce exists and is defined, then add it to the list
  // of parameters.
  // If reduce=false then the results are that of only the map function
  // not the final result of map and reduce.
  addHttpParam('reduce', opts, params);
  addHttpParam('include_docs', opts, params);
  addHttpParam('limit', opts, params);
  addHttpParam('descending', opts, params);
  addHttpParam('group', opts, params);
  addHttpParam('group_level', opts, params);
  addHttpParam('skip', opts, params);
  addHttpParam('stale', opts, params);
  addHttpParam('startkey', opts, params, true);
  addHttpParam('endkey', opts, params, true);
  addHttpParam('inclusive_end', opts, params);
  addHttpParam('key', opts, params, true);

  // Format the list of parameters into a valid URI query string
  params = params.join('&');
  params = params === '' ? '' : '?' + params;

  // If keys are supplied, issue a POST request to circumvent GET query string limits
  // see http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options
  if (typeof opts.keys !== 'undefined') {
    var MAX_URL_LENGTH = 2000;
    // according to http://stackoverflow.com/a/417184/680742,
    // the de facto URL length limit is 2000 characters

    var keysAsString =
      'keys=' + encodeURIComponent(JSON.stringify(opts.keys));
    if (keysAsString.length + params.length + 1 <= MAX_URL_LENGTH) {
      // If the keys are short enough, do a GET. we do this to work around
      // Safari not understanding 304s on POSTs (see pouchdb/pouchdb#1239)
      params += (params[0] === '?' ? '&' : '?') + keysAsString;
    } else {
      method = 'POST';
      if (typeof fun === 'string') {
        body = JSON.stringify({keys: opts.keys});
      } else { // fun is {map : mapfun}, so append to this
        fun.keys = opts.keys;
      }
    }
  }

  // We are referencing a query defined in the design doc
  if (typeof fun === 'string') {
    var parts = parseViewName(fun);
    return db.request({
      method: method,
      url: '_design/' + parts[0] + '/_view/' + parts[1] + params,
      body: body
    });
  }

  // We are using a temporary view, terrible for performance but good for testing
  body = body || {};
  Object.keys(fun).forEach(function (key) {
    if (Array.isArray(fun[key])) {
      body[key] = fun[key];
    } else {
      body[key] = fun[key].toString();
    }
  });
  return db.request({
    method: 'POST',
    url: '_temp_view' + params,
    body: body
  });
}

function defaultsTo(value) {
  return function (reason) {
    /* istanbul ignore else */
    if (reason.status === 404) {
      return value;
    } else {
      throw reason;
    }
  };
}

// returns a promise for a list of docs to update, based on the input docId.
// we update the metaDoc first (i.e. the doc that points from the sourceDB
// document Id to the ids of the documents in the mrview database), then
// the key/value docs.  that way, if lightning strikes the user's computer
// in the middle of an update, we don't write any docs that we wouldn't
// be able to find later using the metaDoc.
function getDocsToPersist(docId, view, docIdsToEmits) {
  var metaDocId = '_local/doc_' + docId;
  return view.db.get(metaDocId)[
    "catch"](defaultsTo({_id: metaDocId, keys: []}))
    .then(function (metaDoc) {
      return Promise.resolve().then(function () {
        if (metaDoc.keys.length) {
          return view.db.allDocs({
            keys: metaDoc.keys,
            include_docs: true
          });
        }
        return {rows: []}; // no keys, no need for a lookup
      }).then(function (res) {
        var kvDocs = res.rows.map(function (row) {
          return row.doc;
        }).filter(function (row) {
          return row;
        });

        var indexableKeysToKeyValues = docIdsToEmits[docId];
        var oldKeysMap = {};
        kvDocs.forEach(function (kvDoc) {
          oldKeysMap[kvDoc._id] = true;
          kvDoc._deleted = !indexableKeysToKeyValues[kvDoc._id];
          if (!kvDoc._deleted) {
            var keyValue = indexableKeysToKeyValues[kvDoc._id];
            if ('value' in keyValue) {
              kvDoc.value = keyValue.value;
            }
          }
        });

        var newKeys = Object.keys(indexableKeysToKeyValues);
        newKeys.forEach(function (key) {
          if (!oldKeysMap[key]) {
            // new doc
            var kvDoc = {
              _id: key
            };
            var keyValue = indexableKeysToKeyValues[key];
            if ('value' in keyValue) {
              kvDoc.value = keyValue.value;
            }
            kvDocs.push(kvDoc);
          }
        });
        metaDoc.keys = utils.uniq(newKeys.concat(metaDoc.keys));
        kvDocs.splice(0, 0, metaDoc);

        return kvDocs;
      });
    });
}

// updates all emitted key/value docs and metaDocs in the mrview database
// for the given batch of documents from the source database
function saveKeyValues(view, docIdsToEmits, seq) {
  var seqDocId = '_local/lastSeq';
  return view.db.get(seqDocId)[
  "catch"](defaultsTo({_id: seqDocId, seq: 0}))
  .then(function (lastSeqDoc) {
    var docIds = Object.keys(docIdsToEmits);
    return Promise.all(docIds.map(function (docId) {
        return getDocsToPersist(docId, view, docIdsToEmits);
      })).then(function (listOfDocsToPersist) {
        var docsToPersist = [];
        listOfDocsToPersist.forEach(function (docList) {
          docsToPersist = docsToPersist.concat(docList);
        });

        // update the seq doc last, so that if a meteor strikes the user's
        // computer in the middle of an update, we can apply the idempotent
        // batch update operation again
        lastSeqDoc.seq = seq;
        docsToPersist.push(lastSeqDoc);

        return view.db.bulkDocs({docs : docsToPersist});
      });
  });
}

var updateView = utils.sequentialize(mainQueue, function (view) {
  // bind the emit function once
  var mapResults;
  var doc;

  function emit(key, value) {
    var output = { id: doc._id, key: normalizeKey(key) };
    // Don't explicitly store the value unless it's defined and non-null.
    // This saves on storage space, because often people don't use it.
    if (typeof value !== 'undefined' && value !== null) {
      output.value = normalizeKey(value);
    }
    mapResults.push(output);
  }

  var mapFun;
  // for temp_views one can use emit(doc, emit), see #38
  if (typeof view.mapFun === "function" && view.mapFun.length === 2) {
    var origMap = view.mapFun;
    mapFun = function (doc) {
      return origMap(doc, emit);
    };
  } else {
    mapFun = evalFunc(view.mapFun.toString(), emit, sum, log, Array.isArray, JSON.parse);
  }

  var currentSeq = view.seq || 0;

  function processChange(docIdsToEmits, seq) {
    return function () {
      return saveKeyValues(view, docIdsToEmits, seq);
    };
  }
  var queue = new TaskQueue();
  // TODO(neojski): https://github.com/daleharvey/pouchdb/issues/1521

  return new Promise(function (resolve, reject) {

    function complete() {
      queue.finish().then(function () {
        view.seq = currentSeq;
        resolve();
      });
    }

    function processNextBatch() {
      view.sourceDB.changes({
        conflicts: true,
        include_docs: true,
        since : currentSeq,
        limit : CHANGES_BATCH_SIZE
      }).on('complete', function (response) {
        var results = response.results;
        if (!results.length) {
          return complete();
        }
        var docIdsToEmits = {};
        for (var i = 0, l = results.length; i < l; i++) {
          var change = results[i];
          if (change.doc._id[0] !== '_') {
            mapResults = [];
            doc = change.doc;

            if (!doc._deleted) {
              tryCode(view.sourceDB, mapFun, [doc]);
            }
            mapResults.sort(sortByKeyThenValue);

            var indexableKeysToKeyValues = {};
            var lastKey;
            for (var j = 0, jl = mapResults.length; j < jl; j++) {
              var obj = mapResults[j];
              var complexKey = [obj.key, obj.id];
              if (obj.key === lastKey) {
                complexKey.push(j); // dup key+id, so make it unique
              }
              var indexableKey = toIndexableString(complexKey);
              indexableKeysToKeyValues[indexableKey] = obj;
              lastKey = obj.key;
            }
            docIdsToEmits[change.doc._id] = indexableKeysToKeyValues;
          }
          currentSeq = change.seq;
        }
        queue.add(processChange(docIdsToEmits, currentSeq));
        if (results.length < CHANGES_BATCH_SIZE) {
          return complete();
        }
        return processNextBatch();
      }).on('error', onError);
      /* istanbul ignore next */
      function onError(err) {
        reject(err);
      }
    }
    processNextBatch();
  });
});

function reduceView(view, results, options) {
  if (options.group_level === 0) {
    delete options.group_level;
  }

  var shouldGroup = options.group || options.group_level;

  var reduceFun;
  if (builtInReduce[view.reduceFun]) {
    reduceFun = builtInReduce[view.reduceFun];
  } else {
    reduceFun = evalFunc(
      view.reduceFun.toString(), null, sum, log, Array.isArray, JSON.parse);
  }

  var groups = [];
  var lvl = options.group_level;
  results.forEach(function (e) {
    var last = groups[groups.length - 1];
    var key = shouldGroup ? e.key : null;

    // only set group_level for array keys
    if (shouldGroup && Array.isArray(key) && typeof lvl === 'number') {
      key = key.length > lvl ? key.slice(0, lvl) : key;
    }

    if (last && collate(last.key[0][0], key) === 0) {
      last.key.push([key, e.id]);
      last.value.push(e.value);
      return;
    }
    groups.push({key: [
      [key, e.id]
    ], value: [e.value]});
  });
  for (var i = 0, len = groups.length; i < len; i++) {
    var e = groups[i];
    var reduceTry = tryCode(view.sourceDB, reduceFun, [e.key, e.value, false]);
    // CouchDB typically just sets the value to null if reduce errors out
    e.value = reduceTry.error ? null : reduceTry.output;
    e.key = e.key[0][0];
  }
  // no total_rows/offset when reducing
  return {rows: sliceResults(groups, options.limit, options.skip)};
}

var queryView = utils.sequentialize(mainQueue, function (view, opts) {
  var totalRows;
  var shouldReduce = view.reduceFun && opts.reduce !== false;
  var skip = opts.skip || 0;
  if (typeof opts.keys !== 'undefined' && !opts.keys.length) {
    // equivalent query
    opts.limit = 0;
    delete opts.keys;
  }

  function fetchFromView(viewOpts) {
    viewOpts.include_docs = true;
    return view.db.allDocs(viewOpts).then(function (res) {
      totalRows = res.total_rows;
      return res.rows.map(function (result) {

        // implicit migration - in older versions of PouchDB,
        // we explicitly stored the doc as {id: ..., key: ..., value: ...}
        // this is tested in a migration test
        /* istanbul ignore next */
        if ('value' in result.doc && typeof result.doc.value === 'object' &&
            result.doc.value !== null) {
          var keys = Object.keys(result.doc.value).sort();
          // this detection method is not perfect, but it's unlikely the user
          // emitted a value which was an object with these 3 exact keys
          var expectedKeys = ['id', 'key', 'value'];
          if (!(keys < expectedKeys || keys > expectedKeys)) {
            return result.doc.value;
          }
        }

        var parsedKeyAndDocId = pouchCollate.parseIndexableString(result.doc._id);
        return {
          key: parsedKeyAndDocId[0],
          id: parsedKeyAndDocId[1],
          value: ('value' in result.doc ? result.doc.value : null)
        };
      });
    });
  }

  function onMapResultsReady(results) {
    var res;
    if (shouldReduce) {
      res = reduceView(view, results, opts);
    } else {
      res = {
        total_rows: totalRows,
        offset: skip,
        rows: results
      };
    }
    if (opts.include_docs) {
      var getDocsPromises = results.map(function (row) {
        var val = row.value;
        var docId = (val && typeof val === 'object' && val._id) || row.id;
        return view.sourceDB.get(docId).then(function (joinedDoc) {
          row.doc = joinedDoc;
        }, function () {
          // document error = don't join
        });
      });
      return Promise.all(getDocsPromises).then(function () {
        return res;
      });
    } else {
      return res;
    }
  }

  var flatten = function (array) {
    return array.reduce(function (prev, cur) {
      return prev.concat(cur);
    });
  };

  if (typeof opts.keys !== 'undefined') {
    var keys = opts.keys;
    var fetchPromises = keys.map(function (key) {
      var viewOpts = {
        startkey : toIndexableString([key]),
        endkey   : toIndexableString([key, {}])
      };
      return fetchFromView(viewOpts);
    });
    return Promise.all(fetchPromises).then(flatten).then(onMapResultsReady);
  } else { // normal query, no 'keys'
    var viewOpts = {
      descending : opts.descending
    };
    if (typeof opts.startkey !== 'undefined') {
      viewOpts.startkey = opts.descending ?
        toIndexableString([opts.startkey, {}]) :
        toIndexableString([opts.startkey]);
    }
    if (typeof opts.endkey !== 'undefined') {
      var inclusiveEnd = opts.inclusive_end !== false;
      if (opts.descending) {
        inclusiveEnd = !inclusiveEnd;
      }

      viewOpts.endkey = toIndexableString(inclusiveEnd ? [opts.endkey, {}] : [opts.endkey]);
    }
    if (typeof opts.key !== 'undefined') {
      var keyStart = toIndexableString([opts.key]);
      var keyEnd = toIndexableString([opts.key, {}]);
      if (viewOpts.descending) {
        viewOpts.endkey = keyStart;
        viewOpts.startkey = keyEnd;
      } else {
        viewOpts.startkey = keyStart;
        viewOpts.endkey = keyEnd;
      }
    }
    if (!shouldReduce) {
      if (typeof opts.limit === 'number') {
        viewOpts.limit = opts.limit;
      }
      viewOpts.skip = skip;
    }
    return fetchFromView(viewOpts).then(onMapResultsReady);
  }
});

function httpViewCleanup(db) {
  return db.request({
    method: 'POST',
    url: '_view_cleanup'
  });
}

var localViewCleanup = utils.sequentialize(mainQueue, function (db) {
  return db.get('_local/mrviews').then(function (metaDoc) {
    var docsToViews = {};
    Object.keys(metaDoc.views).forEach(function (fullViewName) {
      var parts = parseViewName(fullViewName);
      var designDocName = '_design/' + parts[0];
      var viewName = parts[1];
      docsToViews[designDocName] = docsToViews[designDocName] || {};
      docsToViews[designDocName][viewName] = true;
    });
    var opts = {
      keys : Object.keys(docsToViews),
      include_docs : true
    };
    return db.allDocs(opts).then(function (res) {
      var viewsToStatus = {};
      res.rows.forEach(function (row) {
        var ddocName = row.key.substring(8);
        Object.keys(docsToViews[row.key]).forEach(function (viewName) {
          var fullViewName = ddocName + '/' + viewName;
          /* istanbul ignore if */
          if (!metaDoc.views[fullViewName]) {
            // new format, without slashes, to support PouchDB 2.2.0
            // migration test in pouchdb's browser.migration.js verifies this
            fullViewName = viewName;
          }
          var viewDBNames = Object.keys(metaDoc.views[fullViewName]);
          // design doc deleted, or view function nonexistent
          var statusIsGood = row.doc && row.doc.views && row.doc.views[viewName];
          viewDBNames.forEach(function (viewDBName) {
            viewsToStatus[viewDBName] = viewsToStatus[viewDBName] || statusIsGood;
          });
        });
      });
      var dbsToDelete = Object.keys(viewsToStatus).filter(function (viewDBName) {
        return !viewsToStatus[viewDBName];
      });
      var destroyPromises = dbsToDelete.map(function (viewDBName) {
        return db.constructor.destroy(viewDBName, {adapter : db.adapter});
      });
      return Promise.all(destroyPromises).then(function () {
        return {ok: true};
      });
    });
  }, defaultsTo({ok: true}));
});

exports.viewCleanup = utils.callbackify(function () {
  var db = this;
  if (db.type() === 'http') {
    return httpViewCleanup(db);
  }
  return localViewCleanup(db);
});

function queryPromised(db, fun, opts) {
  if (db.type() === 'http') {
    return httpQuery(db, fun, opts);
  }

  if (typeof fun !== 'string') {
    // temp_view
    checkQueryParseError(opts, fun);

    var createViewOpts = {
      db : db,
      viewName : 'temp_view/temp_view',
      map : fun.map,
      reduce : fun.reduce,
      temporary : true
    };
    tempViewQueue.add(function () {
      return createView(createViewOpts).then(function (view) {
        function cleanup() {
          return view.db.destroy();
        }
        return utils.fin(updateView(view).then(function () {
          return queryView(view, opts);
        }), cleanup);
      });
    });
    return tempViewQueue.finish();
  } else {
    // persistent view
    var fullViewName = fun;
    var parts = parseViewName(fullViewName);
    var designDocName = parts[0];
    var viewName = parts[1];
    return db.get('_design/' + designDocName).then(function (doc) {
      var fun = doc.views && doc.views[viewName];

      if (!fun || typeof fun.map !== 'string') {
        throw new NotFoundError('ddoc ' + designDocName + ' has no view named ' +
          viewName);
      }
      checkQueryParseError(opts, fun);

      var createViewOpts = {
        db : db,
        viewName : fullViewName,
        map : fun.map,
        reduce : fun.reduce
      };
      return createView(createViewOpts).then(function (view) {
        if (opts.stale === 'ok' || opts.stale === 'update_after') {
          if (opts.stale === 'update_after') {
            process.nextTick(function () {
              updateView(view);
            });
          }
          return queryView(view, opts);
        } else { // stale not ok
          return updateView(view).then(function () {
            return queryView(view, opts);
          });
        }
      });
    });
  }
}

exports.query = function (fun, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = utils.extend(true, {}, opts);

  if (typeof fun === 'function') {
    fun = {map : fun};
  }

  var db = this;
  var promise = Promise.resolve().then(function () {
    return queryPromised(db, fun, opts);
  });
  utils.promisedCallback(promise, callback);
  return promise;
};

function QueryParseError(message) {
  this.status = 400;
  this.name = 'query_parse_error';
  this.message = message;
  this.error = true;
  try {
    Error.captureStackTrace(this, QueryParseError);
  } catch (e) {}
}

utils.inherits(QueryParseError, Error);

function NotFoundError(message) {
  this.status = 404;
  this.name = 'not_found';
  this.message = message;
  this.error = true;
  try {
    Error.captureStackTrace(this, NotFoundError);
  } catch (e) {}
}

utils.inherits(NotFoundError, Error);

}).call(this,require("q+64fw"))
},{"./create-view":47,"./evalfunc":48,"./taskqueue":52,"./utils":54,"pouchdb-collate":50,"q+64fw":95}],50:[function(require,module,exports){
'use strict';

var MIN_MAGNITUDE = -324; // verified by -Number.MIN_VALUE
var MAGNITUDE_DIGITS = 3; // ditto
var SEP = ''; // set to '_' for easier debugging 

var utils = require('./utils');

exports.collate = function (a, b) {

  if (a === b) {
    return 0;
  }

  a = exports.normalizeKey(a);
  b = exports.normalizeKey(b);

  var ai = collationIndex(a);
  var bi = collationIndex(b);
  if ((ai - bi) !== 0) {
    return ai - bi;
  }
  if (a === null) {
    return 0;
  }
  switch (typeof a) {
    case 'number':
      return a - b;
    case 'boolean':
      return a === b ? 0 : (a < b ? -1 : 1);
    case 'string':
      return stringCollate(a, b);
  }
  return Array.isArray(a) ? arrayCollate(a, b) : objectCollate(a, b);
};

// couch considers null/NaN/Infinity/-Infinity === undefined,
// for the purposes of mapreduce indexes. also, dates get stringified.
exports.normalizeKey = function (key) {
  switch (typeof key) {
    case 'undefined':
      return null;
    case 'number':
      if (key === Infinity || key === -Infinity || isNaN(key)) {
        return null;
      }
      return key;
    case 'object':
      var origKey = key;
      if (Array.isArray(key)) {
        var len = key.length;
        key = new Array(len);
        for (var i = 0; i < len; i++) {
          key[i] = exports.normalizeKey(origKey[i]);
        }
      } else if (key instanceof Date) {
        return key.toJSON();
      } else if (key !== null) { // generic object
        key = {};
        for (var k in origKey) {
          if (origKey.hasOwnProperty(k)) {
            var val = origKey[k];
            if (typeof val !== 'undefined') {
              key[k] = exports.normalizeKey(val);
            }
          }
        }
      }
  }
  return key;
};

function indexify(key) {
  if (key !== null) {
    switch (typeof key) {
      case 'boolean':
        return key ? 1 : 0;
      case 'number':
        return numToIndexableString(key);
      case 'string':
        // We've to be sure that key does not contain \u0000
        // Do order-preserving replacements:
        // 0 -> 1, 1
        // 1 -> 1, 2
        // 2 -> 2, 2
        return key
          .replace(/\u0002/g, '\u0002\u0002')
          .replace(/\u0001/g, '\u0001\u0002')
          .replace(/\u0000/g, '\u0001\u0001');
      case 'object':
        var isArray = Array.isArray(key);
        var arr = isArray ? key : Object.keys(key);
        var i = -1;
        var len = arr.length;
        var result = '';
        if (isArray) {
          while (++i < len) {
            result += exports.toIndexableString(arr[i]);
          }
        } else {
          while (++i < len) {
            var objKey = arr[i];
            result += exports.toIndexableString(objKey) +
                exports.toIndexableString(key[objKey]);
          }
        }
        return result;
    }
  }
  return '';
}

// convert the given key to a string that would be appropriate
// for lexical sorting, e.g. within a database, where the
// sorting is the same given by the collate() function.
exports.toIndexableString = function (key) {
  var zero = '\u0000';
  key = exports.normalizeKey(key);
  return collationIndex(key) + SEP + indexify(key) + zero;
};

function parseNumber(str, i) {
  var originalIdx = i;
  var num;
  var zero = str[i] === '1';
  if (zero) {
    num = 0;
    i++;
  } else {
    var neg = str[i] === '0';
    i++;
    var numAsString = '';
    var magAsString = str.substring(i, i + MAGNITUDE_DIGITS);
    var magnitude = parseInt(magAsString, 10) + MIN_MAGNITUDE;
    if (neg) {
      magnitude = -magnitude;
    }
    i += MAGNITUDE_DIGITS;
    while (true) {
      var ch = str[i];
      if (ch === '\u0000') {
        break;
      } else {
        numAsString += ch;
      }
      i++;
    }
    numAsString = numAsString.split('.');
    if (numAsString.length === 1) {
      num = parseInt(numAsString, 10);
    } else {
      num = parseFloat(numAsString[0] + '.' + numAsString[1]);
    }
    if (neg) {
      num = num - 10;
    }
    if (magnitude !== 0) {
      // parseFloat is more reliable than pow due to rounding errors
      // e.g. Number.MAX_VALUE would return Infinity if we did
      // num * Math.pow(10, magnitude);
      num = parseFloat(num + 'e' + magnitude);
    }
  }
  return {num: num, length : i - originalIdx};
}

// move up the stack while parsing
// this function moved outside of parseIndexableString for performance
function pop(stack, metaStack) {
  var obj = stack.pop();

  if (metaStack.length) {
    var lastMetaElement = metaStack[metaStack.length - 1];
    if (obj === lastMetaElement.element) {
      // popping a meta-element, e.g. an object whose value is another object
      metaStack.pop();
      lastMetaElement = metaStack[metaStack.length - 1];
    }
    var element = lastMetaElement.element;
    var lastElementIndex = lastMetaElement.index;
    if (Array.isArray(element)) {
      element.push(obj);
    } else if (lastElementIndex === stack.length - 2) { // obj with key+value
      var key = stack.pop();
      element[key] = obj;
    } else {
      stack.push(obj); // obj with key only
    }
  }
}

exports.parseIndexableString = function (str) {
  var stack = [];
  var metaStack = []; // stack for arrays and objects
  var i = 0;

  while (true) {
    var collationIndex = str[i++];
    if (collationIndex === '\u0000') {
      if (stack.length === 1) {
        return stack.pop();
      } else {
        pop(stack, metaStack);
        continue;
      }
    }
    switch (collationIndex) {
      case '1':
        stack.push(null);
        break;
      case '2':
        stack.push(str[i] === '1');
        i++;
        break;
      case '3':
        var parsedNum = parseNumber(str, i);
        stack.push(parsedNum.num);
        i += parsedNum.length;
        break;
      case '4':
        var parsedStr = '';
        while (true) {
          var ch = str[i];
          if (ch === '\u0000') {
            break;
          }
          parsedStr += ch;
          i++;
        }
        // perform the reverse of the order-preserving replacement
        // algorithm (see above)
        parsedStr = parsedStr.replace(/\u0001\u0001/g, '\u0000')
          .replace(/\u0001\u0002/g, '\u0001')
          .replace(/\u0002\u0002/g, '\u0002');
        stack.push(parsedStr);
        break;
      case '5':
        var arrayElement = { element: [], index: stack.length };
        stack.push(arrayElement.element);
        metaStack.push(arrayElement);
        break;
      case '6':
        var objElement = { element: {}, index: stack.length };
        stack.push(objElement.element);
        metaStack.push(objElement);
        break;
      default:
        throw new Error(
          'bad collationIndex or unexpectedly reached end of input: ' + collationIndex);
    }
  }
};

function arrayCollate(a, b) {
  var len = Math.min(a.length, b.length);
  for (var i = 0; i < len; i++) {
    var sort = exports.collate(a[i], b[i]);
    if (sort !== 0) {
      return sort;
    }
  }
  return (a.length === b.length) ? 0 :
    (a.length > b.length) ? 1 : -1;
}
function stringCollate(a, b) {
  // See: https://github.com/daleharvey/pouchdb/issues/40
  // This is incompatible with the CouchDB implementation, but its the
  // best we can do for now
  return (a === b) ? 0 : ((a > b) ? 1 : -1);
}
function objectCollate(a, b) {
  var ak = Object.keys(a), bk = Object.keys(b);
  var len = Math.min(ak.length, bk.length);
  for (var i = 0; i < len; i++) {
    // First sort the keys
    var sort = exports.collate(ak[i], bk[i]);
    if (sort !== 0) {
      return sort;
    }
    // if the keys are equal sort the values
    sort = exports.collate(a[ak[i]], b[bk[i]]);
    if (sort !== 0) {
      return sort;
    }

  }
  return (ak.length === bk.length) ? 0 :
    (ak.length > bk.length) ? 1 : -1;
}
// The collation is defined by erlangs ordered terms
// the atoms null, true, false come first, then numbers, strings,
// arrays, then objects
// null/undefined/NaN/Infinity/-Infinity are all considered null
function collationIndex(x) {
  var id = ['boolean', 'number', 'string', 'object'];
  var idx = id.indexOf(typeof x);
  //false if -1 otherwise true, but fast!!!!1
  if (~idx) {
    if (x === null) {
      return 1;
    }
    if (Array.isArray(x)) {
      return 5;
    }
    return idx < 3 ? (idx + 2) : (idx + 3);
  }
  if (Array.isArray(x)) {
    return 5;
  }
}

// conversion:
// x yyy zz...zz
// x = 0 for negative, 1 for 0, 2 for positive
// y = exponent (for negative numbers negated) moved so that it's >= 0
// z = mantisse
function numToIndexableString(num) {

  if (num === 0) {
    return '1';
  }

  // convert number to exponential format for easier and
  // more succinct string sorting
  var expFormat = num.toExponential().split(/e\+?/);
  var magnitude = parseInt(expFormat[1], 10);

  var neg = num < 0;

  var result = neg ? '0' : '2';

  // first sort by magnitude
  // it's easier if all magnitudes are positive
  var magForComparison = ((neg ? -magnitude : magnitude) - MIN_MAGNITUDE);
  var magString = utils.padLeft((magForComparison).toString(), '0', MAGNITUDE_DIGITS);

  result += SEP + magString;

  // then sort by the factor
  var factor = Math.abs(parseFloat(expFormat[0])); // [1..10)
  if (neg) { // for negative reverse ordering
    factor = 10 - factor;
  }

  var factorStr = factor.toFixed(20);

  // strip zeros from the end
  factorStr = factorStr.replace(/\.?0+$/, '');

  result += SEP + factorStr;

  return result;
}

},{"./utils":51}],51:[function(require,module,exports){
'use strict';

function pad(str, padWith, upToLength) {
  var padding = '';
  var targetLength = upToLength - str.length;
  while (padding.length < targetLength) {
    padding += padWith;
  }
  return padding;
}

exports.padLeft = function (str, padWith, upToLength) {
  var padding = pad(str, padWith, upToLength);
  return padding + str;
};

exports.padRight = function (str, padWith, upToLength) {
  var padding = pad(str, padWith, upToLength);
  return str + padding;
};

exports.stringLexCompare = function (a, b) {

  var aLen = a.length;
  var bLen = b.length;

  var i;
  for (i = 0; i < aLen; i++) {
    if (i === bLen) {
      // b is shorter substring of a
      return 1;
    }
    var aChar = a.charAt(i);
    var bChar = b.charAt(i);
    if (aChar !== bChar) {
      return aChar < bChar ? -1 : 1;
    }
  }

  if (aLen < bLen) {
    // a is shorter substring of b
    return -1;
  }

  return 0;
};

/*
 * returns the decimal form for the given integer, i.e. writes
 * out all the digits (in base-10) instead of using scientific notation
 */
exports.intToDecimalForm = function (int) {

  var isNeg = int < 0;
  var result = '';

  do {
    var remainder = isNeg ? -Math.ceil(int % 10) : Math.floor(int % 10);

    result = remainder + result;
    int = isNeg ? Math.ceil(int / 10) : Math.floor(int / 10);
  } while (int);


  if (isNeg && result !== '0') {
    result = '-' + result;
  }

  return result;
};
},{}],52:[function(require,module,exports){
'use strict';
/*
 * Simple task queue to sequentialize actions. Assumes callbacks will eventually fire (once).
 */

var Promise = require('./utils').Promise;

function TaskQueue() {
  this.promise = new Promise(function (fulfill) {fulfill(); });
}
TaskQueue.prototype.add = function (promiseFactory) {
  this.promise = this.promise["catch"](function () {
    // just recover
  }).then(function () {
    return promiseFactory();
  });
  return this.promise;
};
TaskQueue.prototype.finish = function () {
  return this.promise;
};

module.exports = TaskQueue;

},{"./utils":54}],53:[function(require,module,exports){
'use strict';
var Promise = require('./utils').Promise;

// this is essentially the "update sugar" function from daleharvey/pouchdb#1388
// the diffFun tells us what delta to apply to the doc.  it either returns
// the doc, or false if it doesn't need to do an update after all
function upsert(db, docId, diffFun) {
  return new Promise(function (fulfill, reject) {
    if (docId && typeof docId === 'object') {
      docId = docId._id;
    }
    if (typeof docId !== 'string') {
      return reject(new Error('doc id is required'));
    }

    db.get(docId, function (err, doc) {
      if (err) {
        if (err.status !== 404) {
          return reject(err);
        }
        return fulfill(tryAndPut(db, diffFun({_id : docId}), diffFun));
      }
      var newDoc = diffFun(doc);
      if (!newDoc) {
        return fulfill(doc);
      }
      fulfill(tryAndPut(db, newDoc, diffFun));
    });
  });
}

function tryAndPut(db, doc, diffFun) {
  return db.put(doc)["catch"](function (err) {
    if (err.status !== 409) {
      throw err;
    }
    return upsert(db, doc, diffFun);
  });
}

module.exports = upsert;

},{"./utils":54}],54:[function(require,module,exports){
(function (process,global){
'use strict';
/* istanbul ignore if */
if (typeof global.Promise === 'function') {
  exports.Promise = global.Promise;
} else {
  exports.Promise = require('lie');
}
// uniquify a list, similar to underscore's _.uniq
exports.uniq = function (arr) {
  var map = {};
  arr.forEach(function (element) {
    map[element] = true;
  });
  return Object.keys(map);
};

exports.inherits = require('inherits');
exports.extend = require('pouchdb-extend');
var argsarray = require('argsarray');

exports.promisedCallback = function (promise, callback) {
  if (callback) {
    promise.then(function (res) {
      process.nextTick(function () {
        callback(null, res);
      });
    }, function (reason) {
      process.nextTick(function () {
        callback(reason);
      });
    });
  }
  return promise;
};

exports.callbackify = function (fun) {
  return argsarray(function (args) {
    var cb = args.pop();
    var promise = fun.apply(this, args);
    if (typeof cb === 'function') {
      exports.promisedCallback(promise, cb);
    }
    return promise;
  });
};

// Promise finally util similar to Q.finally
exports.fin = function (promise, cb) {
  return promise.then(function (res) {
    var promise2 = cb();
    if (typeof promise2.then === 'function') {
      return promise2.then(function () {
        return res;
      });
    }
    return res;
  }, function (reason) {
    var promise2 = cb();
    if (typeof promise2.then === 'function') {
      return promise2.then(function () {
        throw reason;
      });
    }
    throw reason;
  });
};

exports.sequentialize = function (queue, promiseFactory) {
  return function () {
    var args = arguments;
    var that = this;
    return queue.add(function () {
      return promiseFactory.apply(that, args);
    });
  };
};

var crypto = require('crypto');
var Md5 = require('spark-md5');

exports.MD5 = function (string) {
  /* istanbul ignore else */
  if (!process.browser) {
    return crypto.createHash('md5').update(string).digest('hex');
  } else {
    return Md5.hash(string);
  }
};
}).call(this,require("q+64fw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"argsarray":26,"crypto":93,"inherits":27,"lie":31,"pouchdb-extend":46,"q+64fw":95,"spark-md5":55}],55:[function(require,module,exports){
/*jshint bitwise:false*/
/*global unescape*/

(function (factory) {
    if (typeof exports === 'object') {
        // Node/CommonJS
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else {
        // Browser globals (with support for web workers)
        var glob;
        try {
            glob = window;
        } catch (e) {
            glob = self;
        }

        glob.SparkMD5 = factory();
    }
}(function (undefined) {

    'use strict';

    ////////////////////////////////////////////////////////////////////////////

    /*
     * Fastest md5 implementation around (JKM md5)
     * Credits: Joseph Myers
     *
     * @see http://www.myersdaily.org/joseph/javascript/md5-text.html
     * @see http://jsperf.com/md5-shootout/7
     */

    /* this function is much faster,
      so if possible we use it. Some IEs
      are the only ones I know of that
      need the idiotic second function,
      generated by an if clause.  */
    var add32 = function (a, b) {
        return (a + b) & 0xFFFFFFFF;
    },

    cmn = function (q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
    },

    ff = function (a, b, c, d, x, s, t) {
        return cmn((b & c) | ((~b) & d), a, b, x, s, t);
    },

    gg = function (a, b, c, d, x, s, t) {
        return cmn((b & d) | (c & (~d)), a, b, x, s, t);
    },

    hh = function (a, b, c, d, x, s, t) {
        return cmn(b ^ c ^ d, a, b, x, s, t);
    },

    ii = function (a, b, c, d, x, s, t) {
        return cmn(c ^ (b | (~d)), a, b, x, s, t);
    },

    md5cycle = function (x, k) {
        var a = x[0],
            b = x[1],
            c = x[2],
            d = x[3];

        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);

        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);

        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);

        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);

        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
    },

    /* there needs to be support for Unicode here,
       * unless we pretend that we can redefine the MD-5
       * algorithm for multi-byte characters (perhaps
       * by adding every four 16-bit characters and
       * shortening the sum to 32 bits). Otherwise
       * I suggest performing MD-5 as if every character
       * was two bytes--e.g., 0040 0025 = @%--but then
       * how will an ordinary MD-5 sum be matched?
       * There is no way to standardize text to something
       * like UTF-8 before transformation; speed cost is
       * utterly prohibitive. The JavaScript standard
       * itself needs to look at this: it should start
       * providing access to strings as preformed UTF-8
       * 8-bit unsigned value arrays.
       */
    md5blk = function (s) {
        var md5blks = [],
            i; /* Andy King said do it this way. */

        for (i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
    },

    md5blk_array = function (a) {
        var md5blks = [],
            i; /* Andy King said do it this way. */

        for (i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = a[i] + (a[i + 1] << 8) + (a[i + 2] << 16) + (a[i + 3] << 24);
        }
        return md5blks;
    },

    md51 = function (s) {
        var n = s.length,
            state = [1732584193, -271733879, -1732584194, 271733878],
            i,
            length,
            tail,
            tmp,
            lo,
            hi;

        for (i = 64; i <= n; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        length = s.length;
        tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < length; i += 1) {
            tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        }
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i += 1) {
                tail[i] = 0;
            }
        }

        // Beware that the final length might not fit in 32 bits so we take care of that
        tmp = n * 8;
        tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
        lo = parseInt(tmp[2], 16);
        hi = parseInt(tmp[1], 16) || 0;

        tail[14] = lo;
        tail[15] = hi;

        md5cycle(state, tail);
        return state;
    },

    md51_array = function (a) {
        var n = a.length,
            state = [1732584193, -271733879, -1732584194, 271733878],
            i,
            length,
            tail,
            tmp,
            lo,
            hi;

        for (i = 64; i <= n; i += 64) {
            md5cycle(state, md5blk_array(a.subarray(i - 64, i)));
        }

        // Not sure if it is a bug, however IE10 will always produce a sub array of length 1
        // containing the last element of the parent array if the sub array specified starts
        // beyond the length of the parent array - weird.
        // https://connect.microsoft.com/IE/feedback/details/771452/typed-array-subarray-issue
        a = (i - 64) < n ? a.subarray(i - 64) : new Uint8Array(0);

        length = a.length;
        tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < length; i += 1) {
            tail[i >> 2] |= a[i] << ((i % 4) << 3);
        }

        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i += 1) {
                tail[i] = 0;
            }
        }

        // Beware that the final length might not fit in 32 bits so we take care of that
        tmp = n * 8;
        tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
        lo = parseInt(tmp[2], 16);
        hi = parseInt(tmp[1], 16) || 0;

        tail[14] = lo;
        tail[15] = hi;

        md5cycle(state, tail);

        return state;
    },

    hex_chr = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'],

    rhex = function (n) {
        var s = '',
            j;
        for (j = 0; j < 4; j += 1) {
            s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
        }
        return s;
    },

    hex = function (x) {
        var i;
        for (i = 0; i < x.length; i += 1) {
            x[i] = rhex(x[i]);
        }
        return x.join('');
    },

    md5 = function (s) {
        return hex(md51(s));
    },



    ////////////////////////////////////////////////////////////////////////////

    /**
     * SparkMD5 OOP implementation.
     *
     * Use this class to perform an incremental md5, otherwise use the
     * static methods instead.
     */
    SparkMD5 = function () {
        // call reset to init the instance
        this.reset();
    };


    // In some cases the fast add32 function cannot be used..
    if (md5('hello') !== '5d41402abc4b2a76b9719d911017c592') {
        add32 = function (x, y) {
            var lsw = (x & 0xFFFF) + (y & 0xFFFF),
                msw = (x >> 16) + (y >> 16) + (lsw >> 16);
            return (msw << 16) | (lsw & 0xFFFF);
        };
    }


    /**
     * Appends a string.
     * A conversion will be applied if an utf8 string is detected.
     *
     * @param {String} str The string to be appended
     *
     * @return {SparkMD5} The instance itself
     */
    SparkMD5.prototype.append = function (str) {
        // converts the string to utf8 bytes if necessary
        if (/[\u0080-\uFFFF]/.test(str)) {
            str = unescape(encodeURIComponent(str));
        }

        // then append as binary
        this.appendBinary(str);

        return this;
    };

    /**
     * Appends a binary string.
     *
     * @param {String} contents The binary string to be appended
     *
     * @return {SparkMD5} The instance itself
     */
    SparkMD5.prototype.appendBinary = function (contents) {
        this._buff += contents;
        this._length += contents.length;

        var length = this._buff.length,
            i;

        for (i = 64; i <= length; i += 64) {
            md5cycle(this._state, md5blk(this._buff.substring(i - 64, i)));
        }

        this._buff = this._buff.substr(i - 64);

        return this;
    };

    /**
     * Finishes the incremental computation, reseting the internal state and
     * returning the result.
     * Use the raw parameter to obtain the raw result instead of the hex one.
     *
     * @param {Boolean} raw True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.prototype.end = function (raw) {
        var buff = this._buff,
            length = buff.length,
            i,
            tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            ret;

        for (i = 0; i < length; i += 1) {
            tail[i >> 2] |= buff.charCodeAt(i) << ((i % 4) << 3);
        }

        this._finish(tail, length);
        ret = !!raw ? this._state : hex(this._state);

        this.reset();

        return ret;
    };

    /**
     * Finish the final calculation based on the tail.
     *
     * @param {Array}  tail   The tail (will be modified)
     * @param {Number} length The length of the remaining buffer
     */
    SparkMD5.prototype._finish = function (tail, length) {
        var i = length,
            tmp,
            lo,
            hi;

        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(this._state, tail);
            for (i = 0; i < 16; i += 1) {
                tail[i] = 0;
            }
        }

        // Do the final computation based on the tail and length
        // Beware that the final length may not fit in 32 bits so we take care of that
        tmp = this._length * 8;
        tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
        lo = parseInt(tmp[2], 16);
        hi = parseInt(tmp[1], 16) || 0;

        tail[14] = lo;
        tail[15] = hi;
        md5cycle(this._state, tail);
    };

    /**
     * Resets the internal state of the computation.
     *
     * @return {SparkMD5} The instance itself
     */
    SparkMD5.prototype.reset = function () {
        this._buff = "";
        this._length = 0;
        this._state = [1732584193, -271733879, -1732584194, 271733878];

        return this;
    };

    /**
     * Releases memory used by the incremental buffer and other aditional
     * resources. If you plan to use the instance again, use reset instead.
     */
    SparkMD5.prototype.destroy = function () {
        delete this._state;
        delete this._buff;
        delete this._length;
    };


    /**
     * Performs the md5 hash on a string.
     * A conversion will be applied if utf8 string is detected.
     *
     * @param {String}  str The string
     * @param {Boolean} raw True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.hash = function (str, raw) {
        // converts the string to utf8 bytes if necessary
        if (/[\u0080-\uFFFF]/.test(str)) {
            str = unescape(encodeURIComponent(str));
        }

        var hash = md51(str);

        return !!raw ? hash : hex(hash);
    };

    /**
     * Performs the md5 hash on a binary string.
     *
     * @param {String}  content The binary string
     * @param {Boolean} raw     True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.hashBinary = function (content, raw) {
        var hash = md51(content);

        return !!raw ? hash : hex(hash);
    };

    /**
     * SparkMD5 OOP implementation for array buffers.
     *
     * Use this class to perform an incremental md5 ONLY for array buffers.
     */
    SparkMD5.ArrayBuffer = function () {
        // call reset to init the instance
        this.reset();
    };

    ////////////////////////////////////////////////////////////////////////////

    /**
     * Appends an array buffer.
     *
     * @param {ArrayBuffer} arr The array to be appended
     *
     * @return {SparkMD5.ArrayBuffer} The instance itself
     */
    SparkMD5.ArrayBuffer.prototype.append = function (arr) {
        // TODO: we could avoid the concatenation here but the algorithm would be more complex
        //       if you find yourself needing extra performance, please make a PR.
        var buff = this._concatArrayBuffer(this._buff, arr),
            length = buff.length,
            i;

        this._length += arr.byteLength;

        for (i = 64; i <= length; i += 64) {
            md5cycle(this._state, md5blk_array(buff.subarray(i - 64, i)));
        }

        // Avoids IE10 weirdness (documented above)
        this._buff = (i - 64) < length ? buff.subarray(i - 64) : new Uint8Array(0);

        return this;
    };

    /**
     * Finishes the incremental computation, reseting the internal state and
     * returning the result.
     * Use the raw parameter to obtain the raw result instead of the hex one.
     *
     * @param {Boolean} raw True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.ArrayBuffer.prototype.end = function (raw) {
        var buff = this._buff,
            length = buff.length,
            tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            i,
            ret;

        for (i = 0; i < length; i += 1) {
            tail[i >> 2] |= buff[i] << ((i % 4) << 3);
        }

        this._finish(tail, length);
        ret = !!raw ? this._state : hex(this._state);

        this.reset();

        return ret;
    };

    SparkMD5.ArrayBuffer.prototype._finish = SparkMD5.prototype._finish;

    /**
     * Resets the internal state of the computation.
     *
     * @return {SparkMD5.ArrayBuffer} The instance itself
     */
    SparkMD5.ArrayBuffer.prototype.reset = function () {
        this._buff = new Uint8Array(0);
        this._length = 0;
        this._state = [1732584193, -271733879, -1732584194, 271733878];

        return this;
    };

    /**
     * Releases memory used by the incremental buffer and other aditional
     * resources. If you plan to use the instance again, use reset instead.
     */
    SparkMD5.ArrayBuffer.prototype.destroy = SparkMD5.prototype.destroy;

    /**
     * Concats two array buffers, returning a new one.
     *
     * @param  {ArrayBuffer} first  The first array buffer
     * @param  {ArrayBuffer} second The second array buffer
     *
     * @return {ArrayBuffer} The new array buffer
     */
    SparkMD5.ArrayBuffer.prototype._concatArrayBuffer = function (first, second) {
        var firstLength = first.length,
            result = new Uint8Array(firstLength + second.byteLength);

        result.set(first);
        result.set(new Uint8Array(second), firstLength);

        return result;
    };

    /**
     * Performs the md5 hash on an array buffer.
     *
     * @param {ArrayBuffer} arr The array buffer
     * @param {Boolean}     raw True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.ArrayBuffer.hash = function (arr, raw) {
        var hash = md51_array(new Uint8Array(arr));

        return !!raw ? hash : hex(hash);
    };

    return SparkMD5;
}));

},{}],56:[function(require,module,exports){
'use strict';

/**
 * Stringify/parse functions that don't operate
 * recursively, so they avoid call stack exceeded
 * errors.
 */
exports.stringify = function stringify(input) {
  var queue = [];
  queue.push({obj: input});

  var res = '';
  var next, obj, prefix, val, i, arrayPrefix, keys, k, key, value, objPrefix;
  while ((next = queue.pop())) {
    obj = next.obj;
    prefix = next.prefix || '';
    val = next.val || '';
    res += prefix;
    if (val) {
      res += val;
    } else if (typeof obj !== 'object') {
      res += typeof obj === 'undefined' ? null : JSON.stringify(obj);
    } else if (obj === null) {
      res += 'null';
    } else if (Array.isArray(obj)) {
      queue.push({val: ']'});
      for (i = obj.length - 1; i >= 0; i--) {
        arrayPrefix = i === 0 ? '' : ',';
        queue.push({obj: obj[i], prefix: arrayPrefix});
      }
      queue.push({val: '['});
    } else { // object
      keys = [];
      for (k in obj) {
        if (obj.hasOwnProperty(k)) {
          keys.push(k);
        }
      }
      queue.push({val: '}'});
      for (i = keys.length - 1; i >= 0; i--) {
        key = keys[i];
        value = obj[key];
        objPrefix = (i > 0 ? ',' : '');
        objPrefix += JSON.stringify(key) + ':';
        queue.push({obj: value, prefix: objPrefix});
      }
      queue.push({val: '{'});
    }
  }
  return res;
};

// Convenience function for the parse function.
// This pop function is basically copied from
// pouchCollate.parseIndexableString
function pop(obj, stack, metaStack) {
  var lastMetaElement = metaStack[metaStack.length - 1];
  if (obj === lastMetaElement.element) {
    // popping a meta-element, e.g. an object whose value is another object
    metaStack.pop();
    lastMetaElement = metaStack[metaStack.length - 1];
  }
  var element = lastMetaElement.element;
  var lastElementIndex = lastMetaElement.index;
  if (Array.isArray(element)) {
    element.push(obj);
  } else if (lastElementIndex === stack.length - 2) { // obj with key+value
    var key = stack.pop();
    element[key] = obj;
  } else {
    stack.push(obj); // obj with key only
  }
}

exports.parse = function (str) {
  var stack = [];
  var metaStack = []; // stack for arrays and objects
  var i = 0;
  var collationIndex,parsedNum,numChar;
  var parsedString,lastCh,numConsecutiveSlashes,ch;
  var arrayElement, objElement;
  while (true) {
    collationIndex = str[i++];
    if (collationIndex === '}' ||
        collationIndex === ']' ||
        typeof collationIndex === 'undefined') {
      if (stack.length === 1) {
        return stack.pop();
      } else {
        pop(stack.pop(), stack, metaStack);
        continue;
      }
    }
    switch (collationIndex) {
      case ' ':
      case '\t':
      case '\n':
      case ':':
      case ',':
        break;
      case 'n':
        i += 3; // 'ull'
        pop(null, stack, metaStack);
        break;
      case 't':
        i += 3; // 'rue'
        pop(true, stack, metaStack);
        break;
      case 'f':
        i += 4; // 'alse'
        pop(false, stack, metaStack);
        break;
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
      case '-':
        parsedNum = '';
        i--;
        while (true) {
          numChar = str[i++];
          if (/[\d\.\-e\+]/.test(numChar)) {
            parsedNum += numChar;
          } else {
            i--;
            break;
          }
        }
        pop(parseFloat(parsedNum), stack, metaStack);
        break;
      case '"':
        parsedString = '';
        lastCh = void 0;
        numConsecutiveSlashes = 0;
        while (true) {
          ch = str[i++];
          if (ch !== '"' || (lastCh === '\\' &&
              numConsecutiveSlashes % 2 === 1)) {
            parsedString += ch;
            lastCh = ch;
            if (lastCh === '\\') {
              numConsecutiveSlashes++;
            } else {
              numConsecutiveSlashes = 0;
            }
          } else {
            break;
          }
        }
        pop(JSON.parse('"' + parsedString + '"'), stack, metaStack);
        break;
      case '[':
        arrayElement = { element: [], index: stack.length };
        stack.push(arrayElement.element);
        metaStack.push(arrayElement);
        break;
      case '{':
        objElement = { element: {}, index: stack.length };
        stack.push(objElement.element);
        metaStack.push(objElement);
        break;
      default:
        throw new Error(
          'unexpectedly reached end of input: ' + collationIndex);
    }
  }
};

},{}],57:[function(require,module,exports){
var utils = require('./utils')

function Batcher () {
    this.reset()
}

var BatcherProto = Batcher.prototype

BatcherProto.push = function (job) {
    if (!job.id || !this.has[job.id]) {
        this.queue.push(job)
        this.has[job.id] = job
        if (!this.waiting) {
            this.waiting = true
            utils.nextTick(utils.bind(this.flush, this))
        }
    } else if (job.override) {
        var oldJob = this.has[job.id]
        oldJob.cancelled = true
        this.queue.push(job)
        this.has[job.id] = job
    }
}

BatcherProto.flush = function () {
    // before flush hook
    if (this._preFlush) this._preFlush()
    // do not cache length because more jobs might be pushed
    // as we execute existing jobs
    for (var i = 0; i < this.queue.length; i++) {
        var job = this.queue[i]
        if (!job.cancelled) {
            job.execute()
        }
    }
    this.reset()
}

BatcherProto.reset = function () {
    this.has = utils.hash()
    this.queue = []
    this.waiting = false
}

module.exports = Batcher
},{"./utils":82}],58:[function(require,module,exports){
var Batcher        = require('./batcher'),
    bindingBatcher = new Batcher(),
    bindingId      = 1

/**
 *  Binding class.
 *
 *  each property on the viewmodel has one corresponding Binding object
 *  which has multiple directive instances on the DOM
 *  and multiple computed property dependents
 */
function Binding (compiler, key, isExp, isFn) {
    this.id = bindingId++
    this.value = undefined
    this.isExp = !!isExp
    this.isFn = isFn
    this.root = !this.isExp && key.indexOf('.') === -1
    this.compiler = compiler
    this.key = key
    this.dirs = []
    this.subs = []
    this.deps = []
    this.unbound = false
}

var BindingProto = Binding.prototype

/**
 *  Update value and queue instance updates.
 */
BindingProto.update = function (value) {
    if (!this.isComputed || this.isFn) {
        this.value = value
    }
    if (this.dirs.length || this.subs.length) {
        var self = this
        bindingBatcher.push({
            id: this.id,
            execute: function () {
                if (!self.unbound) {
                    self._update()
                }
            }
        })
    }
}

/**
 *  Actually update the directives.
 */
BindingProto._update = function () {
    var i = this.dirs.length,
        value = this.val()
    while (i--) {
        this.dirs[i].$update(value)
    }
    this.pub()
}

/**
 *  Return the valuated value regardless
 *  of whether it is computed or not
 */
BindingProto.val = function () {
    return this.isComputed && !this.isFn
        ? this.value.$get()
        : this.value
}

/**
 *  Notify computed properties that depend on this binding
 *  to update themselves
 */
BindingProto.pub = function () {
    var i = this.subs.length
    while (i--) {
        this.subs[i].update()
    }
}

/**
 *  Unbind the binding, remove itself from all of its dependencies
 */
BindingProto.unbind = function () {
    // Indicate this has been unbound.
    // It's possible this binding will be in
    // the batcher's flush queue when its owner
    // compiler has already been destroyed.
    this.unbound = true
    var i = this.dirs.length
    while (i--) {
        this.dirs[i].$unbind()
    }
    i = this.deps.length
    var subs
    while (i--) {
        subs = this.deps[i].subs
        var j = subs.indexOf(this)
        if (j > -1) subs.splice(j, 1)
    }
}

module.exports = Binding
},{"./batcher":57}],59:[function(require,module,exports){
var Emitter     = require('./emitter'),
    Observer    = require('./observer'),
    config      = require('./config'),
    utils       = require('./utils'),
    Binding     = require('./binding'),
    Directive   = require('./directive'),
    TextParser  = require('./text-parser'),
    DepsParser  = require('./deps-parser'),
    ExpParser   = require('./exp-parser'),
    ViewModel,
    
    // cache methods
    slice       = [].slice,
    extend      = utils.extend,
    hasOwn      = ({}).hasOwnProperty,
    def         = Object.defineProperty,

    // hooks to register
    hooks = [
        'created', 'ready',
        'beforeDestroy', 'afterDestroy',
        'attached', 'detached'
    ],

    // list of priority directives
    // that needs to be checked in specific order
    priorityDirectives = [
        'if',
        'repeat',
        'view',
        'component'
    ]

/**
 *  The DOM compiler
 *  scans a DOM node and compile bindings for a ViewModel
 */
function Compiler (vm, options) {

    var compiler = this,
        key, i

    // default state
    compiler.init       = true
    compiler.destroyed  = false

    // process and extend options
    options = compiler.options = options || {}
    utils.processOptions(options)

    // copy compiler options
    extend(compiler, options.compilerOptions)
    // repeat indicates this is a v-repeat instance
    compiler.repeat   = compiler.repeat || false
    // expCache will be shared between v-repeat instances
    compiler.expCache = compiler.expCache || {}

    // initialize element
    var el = compiler.el = compiler.setupElement(options)
    utils.log('\nnew VM instance: ' + el.tagName + '\n')

    // set other compiler properties
    compiler.vm       = el.vue_vm = vm
    compiler.bindings = utils.hash()
    compiler.dirs     = []
    compiler.deferred = []
    compiler.computed = []
    compiler.children = []
    compiler.emitter  = new Emitter(vm)

    // VM ---------------------------------------------------------------------

    // set VM properties
    vm.$         = {}
    vm.$el       = el
    vm.$options  = options
    vm.$compiler = compiler
    vm.$event    = null

    // set parent & root
    var parentVM = options.parent
    if (parentVM) {
        compiler.parent = parentVM.$compiler
        parentVM.$compiler.children.push(compiler)
        vm.$parent = parentVM
        // inherit lazy option
        if (!('lazy' in options)) {
            options.lazy = compiler.parent.options.lazy
        }
    }
    vm.$root = getRoot(compiler).vm

    // DATA -------------------------------------------------------------------

    // setup observer
    // this is necesarry for all hooks and data observation events
    compiler.setupObserver()

    // create bindings for computed properties
    if (options.methods) {
        for (key in options.methods) {
            compiler.createBinding(key)
        }
    }

    // create bindings for methods
    if (options.computed) {
        for (key in options.computed) {
            compiler.createBinding(key)
        }
    }

    // initialize data
    var data = compiler.data = options.data || {},
        defaultData = options.defaultData
    if (defaultData) {
        for (key in defaultData) {
            if (!hasOwn.call(data, key)) {
                data[key] = defaultData[key]
            }
        }
    }

    // copy paramAttributes
    var params = options.paramAttributes
    if (params) {
        i = params.length
        while (i--) {
            data[params[i]] = utils.checkNumber(
                compiler.eval(
                    el.getAttribute(params[i])
                )
            )
        }
    }

    // copy data properties to vm
    // so user can access them in the created hook
    extend(vm, data)
    vm.$data = data

    // beforeCompile hook
    compiler.execHook('created')

    // the user might have swapped the data ...
    data = compiler.data = vm.$data

    // user might also set some properties on the vm
    // in which case we should copy back to $data
    var vmProp
    for (key in vm) {
        vmProp = vm[key]
        if (
            key.charAt(0) !== '$' &&
            data[key] !== vmProp &&
            typeof vmProp !== 'function'
        ) {
            data[key] = vmProp
        }
    }

    // now we can observe the data.
    // this will convert data properties to getter/setters
    // and emit the first batch of set events, which will
    // in turn create the corresponding bindings.
    compiler.observeData(data)

    // COMPILE ----------------------------------------------------------------

    // before compiling, resolve content insertion points
    if (options.template) {
        this.resolveContent()
    }

    // now parse the DOM and bind directives.
    // During this stage, we will also create bindings for
    // encountered keypaths that don't have a binding yet.
    compiler.compile(el, true)

    // Any directive that creates child VMs are deferred
    // so that when they are compiled, all bindings on the
    // parent VM have been created.
    i = compiler.deferred.length
    while (i--) {
        compiler.bindDirective(compiler.deferred[i])
    }
    compiler.deferred = null

    // extract dependencies for computed properties.
    // this will evaluated all collected computed bindings
    // and collect get events that are emitted.
    if (this.computed.length) {
        DepsParser.parse(this.computed)
    }

    // done!
    compiler.init = false

    // post compile / ready hook
    compiler.execHook('ready')
}

var CompilerProto = Compiler.prototype

/**
 *  Initialize the VM/Compiler's element.
 *  Fill it in with the template if necessary.
 */
CompilerProto.setupElement = function (options) {
    // create the node first
    var el = typeof options.el === 'string'
        ? document.querySelector(options.el)
        : options.el || document.createElement(options.tagName || 'div')

    var template = options.template,
        child, replacer, i, attr, attrs

    if (template) {
        // collect anything already in there
        if (el.hasChildNodes()) {
            this.rawContent = document.createElement('div')
            /* jshint boss: true */
            while (child = el.firstChild) {
                this.rawContent.appendChild(child)
            }
        }
        // replace option: use the first node in
        // the template directly
        if (options.replace && template.firstChild === template.lastChild) {
            replacer = template.firstChild.cloneNode(true)
            if (el.parentNode) {
                el.parentNode.insertBefore(replacer, el)
                el.parentNode.removeChild(el)
            }
            // copy over attributes
            if (el.hasAttributes()) {
                i = el.attributes.length
                while (i--) {
                    attr = el.attributes[i]
                    replacer.setAttribute(attr.name, attr.value)
                }
            }
            // replace
            el = replacer
        } else {
            el.appendChild(template.cloneNode(true))
        }

    }

    // apply element options
    if (options.id) el.id = options.id
    if (options.className) el.className = options.className
    attrs = options.attributes
    if (attrs) {
        for (attr in attrs) {
            el.setAttribute(attr, attrs[attr])
        }
    }

    return el
}

/**
 *  Deal with <content> insertion points
 *  per the Web Components spec
 */
CompilerProto.resolveContent = function () {

    var outlets = slice.call(this.el.getElementsByTagName('content')),
        raw = this.rawContent,
        outlet, select, i, j, main

    i = outlets.length
    if (i) {
        // first pass, collect corresponding content
        // for each outlet.
        while (i--) {
            outlet = outlets[i]
            if (raw) {
                select = outlet.getAttribute('select')
                if (select) { // select content
                    outlet.content =
                        slice.call(raw.querySelectorAll(select))
                } else { // default content
                    main = outlet
                }
            } else { // fallback content
                outlet.content =
                    slice.call(outlet.childNodes)
            }
        }
        // second pass, actually insert the contents
        for (i = 0, j = outlets.length; i < j; i++) {
            outlet = outlets[i]
            if (outlet === main) continue
            insert(outlet, outlet.content)
        }
        // finally insert the main content
        if (raw && main) {
            insert(main, slice.call(raw.childNodes))
        }
    }

    function insert (outlet, contents) {
        var parent = outlet.parentNode,
            i = 0, j = contents.length
        for (; i < j; i++) {
            parent.insertBefore(contents[i], outlet)
        }
        parent.removeChild(outlet)
    }

    this.rawContent = null
}

/**
 *  Setup observer.
 *  The observer listens for get/set/mutate events on all VM
 *  values/objects and trigger corresponding binding updates.
 *  It also listens for lifecycle hooks.
 */
CompilerProto.setupObserver = function () {

    var compiler = this,
        bindings = compiler.bindings,
        options  = compiler.options,
        observer = compiler.observer = new Emitter(compiler.vm)

    // a hash to hold event proxies for each root level key
    // so they can be referenced and removed later
    observer.proxies = {}

    // add own listeners which trigger binding updates
    observer
        .on('get', onGet)
        .on('set', onSet)
        .on('mutate', onSet)

    // register hooks
    var i = hooks.length, j, hook, fns
    while (i--) {
        hook = hooks[i]
        fns = options[hook]
        if (Array.isArray(fns)) {
            j = fns.length
            // since hooks were merged with child at head,
            // we loop reversely.
            while (j--) {
                registerHook(hook, fns[j])
            }
        } else if (fns) {
            registerHook(hook, fns)
        }
    }

    // broadcast attached/detached hooks
    observer
        .on('hook:attached', function () {
            broadcast(1)
        })
        .on('hook:detached', function () {
            broadcast(0)
        })

    function onGet (key) {
        check(key)
        DepsParser.catcher.emit('get', bindings[key])
    }

    function onSet (key, val, mutation) {
        observer.emit('change:' + key, val, mutation)
        check(key)
        bindings[key].update(val)
    }

    function registerHook (hook, fn) {
        observer.on('hook:' + hook, function () {
            fn.call(compiler.vm)
        })
    }

    function broadcast (event) {
        var children = compiler.children
        if (children) {
            var child, i = children.length
            while (i--) {
                child = children[i]
                if (child.el.parentNode) {
                    event = 'hook:' + (event ? 'attached' : 'detached')
                    child.observer.emit(event)
                    child.emitter.emit(event)
                }
            }
        }
    }

    function check (key) {
        if (!bindings[key]) {
            compiler.createBinding(key)
        }
    }
}

CompilerProto.observeData = function (data) {

    var compiler = this,
        observer = compiler.observer

    // recursively observe nested properties
    Observer.observe(data, '', observer)

    // also create binding for top level $data
    // so it can be used in templates too
    var $dataBinding = compiler.bindings['$data'] = new Binding(compiler, '$data')
    $dataBinding.update(data)

    // allow $data to be swapped
    def(compiler.vm, '$data', {
        get: function () {
            compiler.observer.emit('get', '$data')
            return compiler.data
        },
        set: function (newData) {
            var oldData = compiler.data
            Observer.unobserve(oldData, '', observer)
            compiler.data = newData
            Observer.copyPaths(newData, oldData)
            Observer.observe(newData, '', observer)
            update()
        }
    })

    // emit $data change on all changes
    observer
        .on('set', onSet)
        .on('mutate', onSet)

    function onSet (key) {
        if (key !== '$data') update()
    }

    function update () {
        $dataBinding.update(compiler.data)
        observer.emit('change:$data', compiler.data)
    }
}

/**
 *  Compile a DOM node (recursive)
 */
CompilerProto.compile = function (node, root) {
    var nodeType = node.nodeType
    if (nodeType === 1 && node.tagName !== 'SCRIPT') { // a normal node
        this.compileElement(node, root)
    } else if (nodeType === 3 && config.interpolate) {
        this.compileTextNode(node)
    }
}

/**
 *  Check for a priority directive
 *  If it is present and valid, return true to skip the rest
 */
CompilerProto.checkPriorityDir = function (dirname, node, root) {
    var expression, directive, Ctor
    if (
        dirname === 'component' &&
        root !== true &&
        (Ctor = this.resolveComponent(node, undefined, true))
    ) {
        directive = this.parseDirective(dirname, '', node)
        directive.Ctor = Ctor
    } else {
        expression = utils.attr(node, dirname)
        directive = expression && this.parseDirective(dirname, expression, node)
    }
    if (directive) {
        if (root === true) {
            utils.warn(
                'Directive v-' + dirname + ' cannot be used on an already instantiated ' +
                'VM\'s root node. Use it from the parent\'s template instead.'
            )
            return
        }
        this.deferred.push(directive)
        return true
    }
}

/**
 *  Compile normal directives on a node
 */
CompilerProto.compileElement = function (node, root) {

    // textarea is pretty annoying
    // because its value creates childNodes which
    // we don't want to compile.
    if (node.tagName === 'TEXTAREA' && node.value) {
        node.value = this.eval(node.value)
    }

    // only compile if this element has attributes
    // or its tagName contains a hyphen (which means it could
    // potentially be a custom element)
    if (node.hasAttributes() || node.tagName.indexOf('-') > -1) {

        // skip anything with v-pre
        if (utils.attr(node, 'pre') !== null) {
            return
        }

        var i, l, j, k

        // check priority directives.
        // if any of them are present, it will take over the node with a childVM
        // so we can skip the rest
        for (i = 0, l = priorityDirectives.length; i < l; i++) {
            if (this.checkPriorityDir(priorityDirectives[i], node, root)) {
                return
            }
        }

        // check transition & animation properties
        node.vue_trans  = utils.attr(node, 'transition')
        node.vue_anim   = utils.attr(node, 'animation')
        node.vue_effect = this.eval(utils.attr(node, 'effect'))

        var prefix = config.prefix + '-',
            params = this.options.paramAttributes,
            attr, attrname, isDirective, exp, directives, directive, dirname

        // v-with has special priority among the rest
        // it needs to pull in the value from the parent before
        // computed properties are evaluated, because at this stage
        // the computed properties have not set up their dependencies yet.
        if (root) {
            var withExp = utils.attr(node, 'with')
            if (withExp) {
                directives = this.parseDirective('with', withExp, node, true)
                for (j = 0, k = directives.length; j < k; j++) {
                    this.bindDirective(directives[j], this.parent)
                }
            }
        }

        var attrs = slice.call(node.attributes)
        for (i = 0, l = attrs.length; i < l; i++) {

            attr = attrs[i]
            attrname = attr.name
            isDirective = false

            if (attrname.indexOf(prefix) === 0) {
                // a directive - split, parse and bind it.
                isDirective = true
                dirname = attrname.slice(prefix.length)
                // build with multiple: true
                directives = this.parseDirective(dirname, attr.value, node, true)
                // loop through clauses (separated by ",")
                // inside each attribute
                for (j = 0, k = directives.length; j < k; j++) {
                    this.bindDirective(directives[j])
                }
            } else if (config.interpolate) {
                // non directive attribute, check interpolation tags
                exp = TextParser.parseAttr(attr.value)
                if (exp) {
                    directive = this.parseDirective('attr', exp, node)
                    directive.arg = attrname
                    if (params && params.indexOf(attrname) > -1) {
                        // a param attribute... we should use the parent binding
                        // to avoid circular updates like size={{size}}
                        this.bindDirective(directive, this.parent)
                    } else {
                        this.bindDirective(directive)
                    }
                }
            }

            if (isDirective && dirname !== 'cloak') {
                node.removeAttribute(attrname)
            }
        }

    }

    // recursively compile childNodes
    if (node.hasChildNodes()) {
        slice.call(node.childNodes).forEach(this.compile, this)
    }
}

/**
 *  Compile a text node
 */
CompilerProto.compileTextNode = function (node) {

    var tokens = TextParser.parse(node.nodeValue)
    if (!tokens) return
    var el, token, directive

    for (var i = 0, l = tokens.length; i < l; i++) {

        token = tokens[i]
        directive = null

        if (token.key) { // a binding
            if (token.key.charAt(0) === '>') { // a partial
                el = document.createComment('ref')
                directive = this.parseDirective('partial', token.key.slice(1), el)
            } else {
                if (!token.html) { // text binding
                    el = document.createTextNode('')
                    directive = this.parseDirective('text', token.key, el)
                } else { // html binding
                    el = document.createComment(config.prefix + '-html')
                    directive = this.parseDirective('html', token.key, el)
                }
            }
        } else { // a plain string
            el = document.createTextNode(token)
        }

        // insert node
        node.parentNode.insertBefore(el, node)
        // bind directive
        this.bindDirective(directive)

    }
    node.parentNode.removeChild(node)
}

/**
 *  Parse a directive name/value pair into one or more
 *  directive instances
 */
CompilerProto.parseDirective = function (name, value, el, multiple) {
    var compiler = this,
        definition = compiler.getOption('directives', name)
    if (definition) {
        // parse into AST-like objects
        var asts = Directive.parse(value)
        return multiple
            ? asts.map(build)
            : build(asts[0])
    }
    function build (ast) {
        return new Directive(name, ast, definition, compiler, el)
    }
}

/**
 *  Add a directive instance to the correct binding & viewmodel
 */
CompilerProto.bindDirective = function (directive, bindingOwner) {

    if (!directive) return

    // keep track of it so we can unbind() later
    this.dirs.push(directive)

    // for empty or literal directives, simply call its bind()
    // and we're done.
    if (directive.isEmpty || directive.isLiteral) {
        if (directive.bind) directive.bind()
        return
    }

    // otherwise, we got more work to do...
    var binding,
        compiler = bindingOwner || this,
        key      = directive.key

    if (directive.isExp) {
        // expression bindings are always created on current compiler
        binding = compiler.createBinding(key, directive)
    } else {
        // recursively locate which compiler owns the binding
        while (compiler) {
            if (compiler.hasKey(key)) {
                break
            } else {
                compiler = compiler.parent
            }
        }
        compiler = compiler || this
        binding = compiler.bindings[key] || compiler.createBinding(key)
    }
    binding.dirs.push(directive)
    directive.binding = binding

    var value = binding.val()
    // invoke bind hook if exists
    if (directive.bind) {
        directive.bind(value)
    }
    // set initial value
    directive.$update(value, true)
}

/**
 *  Create binding and attach getter/setter for a key to the viewmodel object
 */
CompilerProto.createBinding = function (key, directive) {

    utils.log('  created binding: ' + key)

    var compiler = this,
        methods  = compiler.options.methods,
        isExp    = directive && directive.isExp,
        isFn     = (directive && directive.isFn) || (methods && methods[key]),
        bindings = compiler.bindings,
        computed = compiler.options.computed,
        binding  = new Binding(compiler, key, isExp, isFn)

    if (isExp) {
        // expression bindings are anonymous
        compiler.defineExp(key, binding, directive)
    } else if (isFn) {
        bindings[key] = binding
        compiler.defineVmProp(key, binding, methods[key])
    } else {
        bindings[key] = binding
        if (binding.root) {
            // this is a root level binding. we need to define getter/setters for it.
            if (computed && computed[key]) {
                // computed property
                compiler.defineComputed(key, binding, computed[key])
            } else if (key.charAt(0) !== '$') {
                // normal property
                compiler.defineDataProp(key, binding)
            } else {
                // properties that start with $ are meta properties
                // they should be kept on the vm but not in the data object.
                compiler.defineVmProp(key, binding, compiler.data[key])
                delete compiler.data[key]
            }
        } else if (computed && computed[utils.baseKey(key)]) {
            // nested path on computed property
            compiler.defineExp(key, binding)
        } else {
            // ensure path in data so that computed properties that
            // access the path don't throw an error and can collect
            // dependencies
            Observer.ensurePath(compiler.data, key)
            var parentKey = key.slice(0, key.lastIndexOf('.'))
            if (!bindings[parentKey]) {
                // this is a nested value binding, but the binding for its parent
                // has not been created yet. We better create that one too.
                compiler.createBinding(parentKey)
            }
        }
    }
    return binding
}

/**
 *  Define the getter/setter to proxy a root-level
 *  data property on the VM
 */
CompilerProto.defineDataProp = function (key, binding) {
    var compiler = this,
        data     = compiler.data,
        ob       = data.__emitter__

    // make sure the key is present in data
    // so it can be observed
    if (!(hasOwn.call(data, key))) {
        data[key] = undefined
    }

    // if the data object is already observed, but the key
    // is not observed, we need to add it to the observed keys.
    if (ob && !(hasOwn.call(ob.values, key))) {
        Observer.convertKey(data, key)
    }

    binding.value = data[key]

    def(compiler.vm, key, {
        get: function () {
            return compiler.data[key]
        },
        set: function (val) {
            compiler.data[key] = val
        }
    })
}

/**
 *  Define a vm property, e.g. $index, $key, or mixin methods
 *  which are bindable but only accessible on the VM,
 *  not in the data.
 */
CompilerProto.defineVmProp = function (key, binding, value) {
    var ob = this.observer
    binding.value = value
    def(this.vm, key, {
        get: function () {
            if (Observer.shouldGet) ob.emit('get', key)
            return binding.value
        },
        set: function (val) {
            ob.emit('set', key, val)
        }
    })
}

/**
 *  Define an expression binding, which is essentially
 *  an anonymous computed property
 */
CompilerProto.defineExp = function (key, binding, directive) {
    var computedKey = directive && directive.computedKey,
        exp         = computedKey ? directive.expression : key,
        getter      = this.expCache[exp]
    if (!getter) {
        getter = this.expCache[exp] = ExpParser.parse(computedKey || key, this)
    }
    if (getter) {
        this.markComputed(binding, getter)
    }
}

/**
 *  Define a computed property on the VM
 */
CompilerProto.defineComputed = function (key, binding, value) {
    this.markComputed(binding, value)
    def(this.vm, key, {
        get: binding.value.$get,
        set: binding.value.$set
    })
}

/**
 *  Process a computed property binding
 *  so its getter/setter are bound to proper context
 */
CompilerProto.markComputed = function (binding, value) {
    binding.isComputed = true
    // bind the accessors to the vm
    if (binding.isFn) {
        binding.value = value
    } else {
        if (typeof value === 'function') {
            value = { $get: value }
        }
        binding.value = {
            $get: utils.bind(value.$get, this.vm),
            $set: value.$set
                ? utils.bind(value.$set, this.vm)
                : undefined
        }
    }
    // keep track for dep parsing later
    this.computed.push(binding)
}

/**
 *  Retrive an option from the compiler
 */
CompilerProto.getOption = function (type, id, silent) {
    var opts = this.options,
        parent = this.parent,
        globalAssets = config.globalAssets,
        res = (opts[type] && opts[type][id]) || (
            parent
                ? parent.getOption(type, id, silent)
                : globalAssets[type] && globalAssets[type][id]
        )
    if (!res && !silent && typeof id === 'string') {
        utils.warn('Unknown ' + type.slice(0, -1) + ': ' + id)
    }
    return res
}

/**
 *  Emit lifecycle events to trigger hooks
 */
CompilerProto.execHook = function (event) {
    event = 'hook:' + event
    this.observer.emit(event)
    this.emitter.emit(event)
}

/**
 *  Check if a compiler's data contains a keypath
 */
CompilerProto.hasKey = function (key) {
    var baseKey = utils.baseKey(key)
    return hasOwn.call(this.data, baseKey) ||
        hasOwn.call(this.vm, baseKey)
}

/**
 *  Do a one-time eval of a string that potentially
 *  includes bindings. It accepts additional raw data
 *  because we need to dynamically resolve v-component
 *  before a childVM is even compiled...
 */
CompilerProto.eval = function (exp, data) {
    var parsed = TextParser.parseAttr(exp)
    return parsed
        ? ExpParser.eval(parsed, this, data)
        : exp
}

/**
 *  Resolve a Component constructor for an element
 *  with the data to be used
 */
CompilerProto.resolveComponent = function (node, data, test) {

    // late require to avoid circular deps
    ViewModel = ViewModel || require('./viewmodel')

    var exp     = utils.attr(node, 'component'),
        tagName = node.tagName,
        id      = this.eval(exp, data),
        tagId   = (tagName.indexOf('-') > 0 && tagName.toLowerCase()),
        Ctor    = this.getOption('components', id || tagId, true)

    if (id && !Ctor) {
        utils.warn('Unknown component: ' + id)
    }

    return test
        ? exp === ''
            ? ViewModel
            : Ctor
        : Ctor || ViewModel
}

/**
 *  Unbind and remove element
 */
CompilerProto.destroy = function (noRemove) {

    // avoid being called more than once
    // this is irreversible!
    if (this.destroyed) return

    var compiler = this,
        i, j, key, dir, dirs, binding,
        vm          = compiler.vm,
        el          = compiler.el,
        directives  = compiler.dirs,
        computed    = compiler.computed,
        bindings    = compiler.bindings,
        children    = compiler.children,
        parent      = compiler.parent

    compiler.execHook('beforeDestroy')

    // unobserve data
    Observer.unobserve(compiler.data, '', compiler.observer)

    // destroy all children
    // do not remove their elements since the parent
    // may have transitions and the children may not
    i = children.length
    while (i--) {
        children[i].destroy(true)
    }

    // unbind all direcitves
    i = directives.length
    while (i--) {
        dir = directives[i]
        // if this directive is an instance of an external binding
        // e.g. a directive that refers to a variable on the parent VM
        // we need to remove it from that binding's directives
        // * empty and literal bindings do not have binding.
        if (dir.binding && dir.binding.compiler !== compiler) {
            dirs = dir.binding.dirs
            if (dirs) {
                j = dirs.indexOf(dir)
                if (j > -1) dirs.splice(j, 1)
            }
        }
        dir.$unbind()
    }

    // unbind all computed, anonymous bindings
    i = computed.length
    while (i--) {
        computed[i].unbind()
    }

    // unbind all keypath bindings
    for (key in bindings) {
        binding = bindings[key]
        if (binding) {
            binding.unbind()
        }
    }

    // remove self from parent
    if (parent) {
        j = parent.children.indexOf(compiler)
        if (j > -1) parent.children.splice(j, 1)
    }

    // finally remove dom element
    if (!noRemove) {
        if (el === document.body) {
            el.innerHTML = ''
        } else {
            vm.$remove()
        }
    }
    el.vue_vm = null

    compiler.destroyed = true
    // emit destroy hook
    compiler.execHook('afterDestroy')

    // finally, unregister all listeners
    compiler.observer.off()
    compiler.emitter.off()
}

// Helpers --------------------------------------------------------------------

/**
 *  shorthand for getting root compiler
 */
function getRoot (compiler) {
    while (compiler.parent) {
        compiler = compiler.parent
    }
    return compiler
}

module.exports = Compiler
},{"./binding":58,"./config":60,"./deps-parser":61,"./directive":62,"./emitter":73,"./exp-parser":74,"./observer":78,"./text-parser":80,"./utils":82,"./viewmodel":83}],60:[function(require,module,exports){
var TextParser = require('./text-parser')

module.exports = {
    prefix         : 'v',
    debug          : false,
    silent         : false,
    enterClass     : 'v-enter',
    leaveClass     : 'v-leave',
    interpolate    : true
}

Object.defineProperty(module.exports, 'delimiters', {
    get: function () {
        return TextParser.delimiters
    },
    set: function (delimiters) {
        TextParser.setDelimiters(delimiters)
    }
})
},{"./text-parser":80}],61:[function(require,module,exports){
var Emitter  = require('./emitter'),
    utils    = require('./utils'),
    Observer = require('./observer'),
    catcher  = new Emitter()

/**
 *  Auto-extract the dependencies of a computed property
 *  by recording the getters triggered when evaluating it.
 */
function catchDeps (binding) {
    if (binding.isFn) return
    utils.log('\n- ' + binding.key)
    var got = utils.hash()
    binding.deps = []
    catcher.on('get', function (dep) {
        var has = got[dep.key]
        if (
            // avoid duplicate bindings
            (has && has.compiler === dep.compiler) ||
            // avoid repeated items as dependency
            // only when the binding is from self or the parent chain
            (dep.compiler.repeat && !isParentOf(dep.compiler, binding.compiler))
        ) {
            return
        }
        got[dep.key] = dep
        utils.log('  - ' + dep.key)
        binding.deps.push(dep)
        dep.subs.push(binding)
    })
    binding.value.$get()
    catcher.off('get')
}

/**
 *  Test if A is a parent of or equals B
 */
function isParentOf (a, b) {
    while (b) {
        if (a === b) {
            return true
        }
        b = b.parent
    }
}

module.exports = {

    /**
     *  the observer that catches events triggered by getters
     */
    catcher: catcher,

    /**
     *  parse a list of computed property bindings
     */
    parse: function (bindings) {
        utils.log('\nparsing dependencies...')
        Observer.shouldGet = true
        bindings.forEach(catchDeps)
        Observer.shouldGet = false
        utils.log('\ndone.')
    }
    
}
},{"./emitter":73,"./observer":78,"./utils":82}],62:[function(require,module,exports){
var dirId           = 1,
    ARG_RE          = /^[\w\$-]+$/,
    FILTER_TOKEN_RE = /[^\s'"]+|'[^']+'|"[^"]+"/g,
    NESTING_RE      = /^\$(parent|root)\./,
    SINGLE_VAR_RE   = /^[\w\.$]+$/,
    QUOTE_RE        = /"/g,
    TextParser      = require('./text-parser')

/**
 *  Directive class
 *  represents a single directive instance in the DOM
 */
function Directive (name, ast, definition, compiler, el) {

    this.id             = dirId++
    this.name           = name
    this.compiler       = compiler
    this.vm             = compiler.vm
    this.el             = el
    this.computeFilters = false
    this.key            = ast.key
    this.arg            = ast.arg
    this.expression     = ast.expression

    var isEmpty = this.expression === ''

    // mix in properties from the directive definition
    if (typeof definition === 'function') {
        this[isEmpty ? 'bind' : 'update'] = definition
    } else {
        for (var prop in definition) {
            this[prop] = definition[prop]
        }
    }

    // empty expression, we're done.
    if (isEmpty || this.isEmpty) {
        this.isEmpty = true
        return
    }

    if (TextParser.Regex.test(this.key)) {
        this.key = compiler.eval(this.key)
        if (this.isLiteral) {
            this.expression = this.key
        }
    }

    var filters = ast.filters,
        filter, fn, i, l, computed
    if (filters) {
        this.filters = []
        for (i = 0, l = filters.length; i < l; i++) {
            filter = filters[i]
            fn = this.compiler.getOption('filters', filter.name)
            if (fn) {
                filter.apply = fn
                this.filters.push(filter)
                if (fn.computed) {
                    computed = true
                }
            }
        }
    }

    if (!this.filters || !this.filters.length) {
        this.filters = null
    }

    if (computed) {
        this.computedKey = Directive.inlineFilters(this.key, this.filters)
        this.filters = null
    }

    this.isExp =
        computed ||
        !SINGLE_VAR_RE.test(this.key) ||
        NESTING_RE.test(this.key)

}

var DirProto = Directive.prototype

/**
 *  called when a new value is set 
 *  for computed properties, this will only be called once
 *  during initialization.
 */
DirProto.$update = function (value, init) {
    if (this.$lock) return
    if (init || value !== this.value || (value && typeof value === 'object')) {
        this.value = value
        if (this.update) {
            this.update(
                this.filters && !this.computeFilters
                    ? this.$applyFilters(value)
                    : value,
                init
            )
        }
    }
}

/**
 *  pipe the value through filters
 */
DirProto.$applyFilters = function (value) {
    var filtered = value, filter
    for (var i = 0, l = this.filters.length; i < l; i++) {
        filter = this.filters[i]
        filtered = filter.apply.apply(this.vm, [filtered].concat(filter.args))
    }
    return filtered
}

/**
 *  Unbind diretive
 */
DirProto.$unbind = function () {
    // this can be called before the el is even assigned...
    if (!this.el || !this.vm) return
    if (this.unbind) this.unbind()
    this.vm = this.el = this.binding = this.compiler = null
}

// Exposed static methods -----------------------------------------------------

/**
 *  Parse a directive string into an Array of
 *  AST-like objects representing directives
 */
Directive.parse = function (str) {

    var inSingle = false,
        inDouble = false,
        curly    = 0,
        square   = 0,
        paren    = 0,
        begin    = 0,
        argIndex = 0,
        dirs     = [],
        dir      = {},
        lastFilterIndex = 0,
        arg

    for (var c, i = 0, l = str.length; i < l; i++) {
        c = str.charAt(i)
        if (inSingle) {
            // check single quote
            if (c === "'") inSingle = !inSingle
        } else if (inDouble) {
            // check double quote
            if (c === '"') inDouble = !inDouble
        } else if (c === ',' && !paren && !curly && !square) {
            // reached the end of a directive
            pushDir()
            // reset & skip the comma
            dir = {}
            begin = argIndex = lastFilterIndex = i + 1
        } else if (c === ':' && !dir.key && !dir.arg) {
            // argument
            arg = str.slice(begin, i).trim()
            if (ARG_RE.test(arg)) {
                argIndex = i + 1
                dir.arg = arg
            }
        } else if (c === '|' && str.charAt(i + 1) !== '|' && str.charAt(i - 1) !== '|') {
            if (dir.key === undefined) {
                // first filter, end of key
                lastFilterIndex = i + 1
                dir.key = str.slice(argIndex, i).trim()
            } else {
                // already has filter
                pushFilter()
            }
        } else if (c === '"') {
            inDouble = true
        } else if (c === "'") {
            inSingle = true
        } else if (c === '(') {
            paren++
        } else if (c === ')') {
            paren--
        } else if (c === '[') {
            square++
        } else if (c === ']') {
            square--
        } else if (c === '{') {
            curly++
        } else if (c === '}') {
            curly--
        }
    }
    if (i === 0 || begin !== i) {
        pushDir()
    }

    function pushDir () {
        dir.expression = str.slice(begin, i).trim()
        if (dir.key === undefined) {
            dir.key = str.slice(argIndex, i).trim()
        } else if (lastFilterIndex !== begin) {
            pushFilter()
        }
        if (i === 0 || dir.key) {
            dirs.push(dir)
        }
    }

    function pushFilter () {
        var exp = str.slice(lastFilterIndex, i).trim(),
            filter
        if (exp) {
            filter = {}
            var tokens = exp.match(FILTER_TOKEN_RE)
            filter.name = tokens[0]
            filter.args = tokens.length > 1 ? tokens.slice(1) : null
        }
        if (filter) {
            (dir.filters = dir.filters || []).push(filter)
        }
        lastFilterIndex = i + 1
    }

    return dirs
}

/**
 *  Inline computed filters so they become part
 *  of the expression
 */
Directive.inlineFilters = function (key, filters) {
    var args, filter
    for (var i = 0, l = filters.length; i < l; i++) {
        filter = filters[i]
        args = filter.args
            ? ',"' + filter.args.map(escapeQuote).join('","') + '"'
            : ''
        key = 'this.$compiler.getOption("filters", "' +
                filter.name +
            '").call(this,' +
                key + args +
            ')'
    }
    return key
}

/**
 *  Convert double quotes to single quotes
 *  so they don't mess up the generated function body
 */
function escapeQuote (v) {
    return v.indexOf('"') > -1
        ? v.replace(QUOTE_RE, '\'')
        : v
}

module.exports = Directive
},{"./text-parser":80}],63:[function(require,module,exports){
var utils = require('../utils'),
    slice = [].slice

/**
 *  Binding for innerHTML
 */
module.exports = {

    bind: function () {
        // a comment node means this is a binding for
        // {{{ inline unescaped html }}}
        if (this.el.nodeType === 8) {
            // hold nodes
            this.nodes = []
        }
    },

    update: function (value) {
        value = utils.guard(value)
        if (this.nodes) {
            this.swap(value)
        } else {
            this.el.innerHTML = value
        }
    },

    swap: function (value) {
        var parent = this.el.parentNode,
            nodes  = this.nodes,
            i      = nodes.length
        // remove old nodes
        while (i--) {
            parent.removeChild(nodes[i])
        }
        // convert new value to a fragment
        var frag = utils.toFragment(value)
        // save a reference to these nodes so we can remove later
        this.nodes = slice.call(frag.childNodes)
        parent.insertBefore(frag, this.el)
    }
}
},{"../utils":82}],64:[function(require,module,exports){
var utils    = require('../utils')

/**
 *  Manages a conditional child VM
 */
module.exports = {

    bind: function () {
        
        this.parent = this.el.parentNode
        this.ref    = document.createComment('vue-if')
        this.Ctor   = this.compiler.resolveComponent(this.el)

        // insert ref
        this.parent.insertBefore(this.ref, this.el)
        this.parent.removeChild(this.el)

        if (utils.attr(this.el, 'view')) {
            utils.warn(
                'Conflict: v-if cannot be used together with v-view. ' +
                'Just set v-view\'s binding value to empty string to empty it.'
            )
        }
        if (utils.attr(this.el, 'repeat')) {
            utils.warn(
                'Conflict: v-if cannot be used together with v-repeat. ' +
                'Use `v-show` or the `filterBy` filter instead.'
            )
        }
    },

    update: function (value) {

        if (!value) {
            this.unbind()
        } else if (!this.childVM) {
            this.childVM = new this.Ctor({
                el: this.el.cloneNode(true),
                parent: this.vm
            })
            if (this.compiler.init) {
                this.parent.insertBefore(this.childVM.$el, this.ref)
            } else {
                this.childVM.$before(this.ref)
            }
        }
        
    },

    unbind: function () {
        if (this.childVM) {
            this.childVM.$destroy()
            this.childVM = null
        }
    }
}
},{"../utils":82}],65:[function(require,module,exports){
var utils      = require('../utils'),
    config     = require('../config'),
    transition = require('../transition'),
    directives = module.exports = utils.hash()

/**
 *  Nest and manage a Child VM
 */
directives.component = {
    isLiteral: true,
    bind: function () {
        if (!this.el.vue_vm) {
            this.childVM = new this.Ctor({
                el: this.el,
                parent: this.vm
            })
        }
    },
    unbind: function () {
        if (this.childVM) {
            this.childVM.$destroy()
        }
    }
}

/**
 *  Binding HTML attributes
 */
directives.attr = {
    bind: function () {
        var params = this.vm.$options.paramAttributes
        this.isParam = params && params.indexOf(this.arg) > -1
    },
    update: function (value) {
        if (value || value === 0) {
            this.el.setAttribute(this.arg, value)
        } else {
            this.el.removeAttribute(this.arg)
        }
        if (this.isParam) {
            this.vm[this.arg] = utils.checkNumber(value)
        }
    }
}

/**
 *  Binding textContent
 */
directives.text = {
    bind: function () {
        this.attr = this.el.nodeType === 3
            ? 'nodeValue'
            : 'textContent'
    },
    update: function (value) {
        this.el[this.attr] = utils.guard(value)
    }
}

/**
 *  Binding CSS display property
 */
directives.show = function (value) {
    var el = this.el,
        target = value ? '' : 'none',
        change = function () {
            el.style.display = target
        }
    transition(el, value ? 1 : -1, change, this.compiler)
}

/**
 *  Binding CSS classes
 */
directives['class'] = function (value) {
    if (this.arg) {
        utils[value ? 'addClass' : 'removeClass'](this.el, this.arg)
    } else {
        if (this.lastVal) {
            utils.removeClass(this.el, this.lastVal)
        }
        if (value) {
            utils.addClass(this.el, value)
            this.lastVal = value
        }
    }
}

/**
 *  Only removed after the owner VM is ready
 */
directives.cloak = {
    isEmpty: true,
    bind: function () {
        var el = this.el
        this.compiler.observer.once('hook:ready', function () {
            el.removeAttribute(config.prefix + '-cloak')
        })
    }
}

/**
 *  Store a reference to self in parent VM's $
 */
directives.ref = {
    isLiteral: true,
    bind: function () {
        var id = this.expression
        if (id) {
            this.vm.$parent.$[id] = this.vm
        }
    },
    unbind: function () {
        var id = this.expression
        if (id) {
            delete this.vm.$parent.$[id]
        }
    }
}

directives.on      = require('./on')
directives.repeat  = require('./repeat')
directives.model   = require('./model')
directives['if']   = require('./if')
directives['with'] = require('./with')
directives.html    = require('./html')
directives.style   = require('./style')
directives.partial = require('./partial')
directives.view    = require('./view')
},{"../config":60,"../transition":81,"../utils":82,"./html":63,"./if":64,"./model":66,"./on":67,"./partial":68,"./repeat":69,"./style":70,"./view":71,"./with":72}],66:[function(require,module,exports){
var utils = require('../utils'),
    isIE9 = navigator.userAgent.indexOf('MSIE 9.0') > 0,
    filter = [].filter

/**
 *  Returns an array of values from a multiple select
 */
function getMultipleSelectOptions (select) {
    return filter
        .call(select.options, function (option) {
            return option.selected
        })
        .map(function (option) {
            return option.value || option.text
        })
}

/**
 *  Two-way binding for form input elements
 */
module.exports = {

    bind: function () {

        var self = this,
            el   = self.el,
            type = el.type,
            tag  = el.tagName

        self.lock = false
        self.ownerVM = self.binding.compiler.vm

        // determine what event to listen to
        self.event =
            (self.compiler.options.lazy ||
            tag === 'SELECT' ||
            type === 'checkbox' || type === 'radio')
                ? 'change'
                : 'input'

        // determine the attribute to change when updating
        self.attr = type === 'checkbox'
            ? 'checked'
            : (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')
                ? 'value'
                : 'innerHTML'

        // select[multiple] support
        if(tag === 'SELECT' && el.hasAttribute('multiple')) {
            this.multi = true
        }

        var compositionLock = false
        self.cLock = function () {
            compositionLock = true
        }
        self.cUnlock = function () {
            compositionLock = false
        }
        el.addEventListener('compositionstart', this.cLock)
        el.addEventListener('compositionend', this.cUnlock)

        // attach listener
        self.set = self.filters
            ? function () {
                if (compositionLock) return
                // if this directive has filters
                // we need to let the vm.$set trigger
                // update() so filters are applied.
                // therefore we have to record cursor position
                // so that after vm.$set changes the input
                // value we can put the cursor back at where it is
                var cursorPos
                try { cursorPos = el.selectionStart } catch (e) {}

                self._set()

                // since updates are async
                // we need to reset cursor position async too
                utils.nextTick(function () {
                    if (cursorPos !== undefined) {
                        el.setSelectionRange(cursorPos, cursorPos)
                    }
                })
            }
            : function () {
                if (compositionLock) return
                // no filters, don't let it trigger update()
                self.lock = true

                self._set()

                utils.nextTick(function () {
                    self.lock = false
                })
            }
        el.addEventListener(self.event, self.set)

        // fix shit for IE9
        // since it doesn't fire input on backspace / del / cut
        if (isIE9) {
            self.onCut = function () {
                // cut event fires before the value actually changes
                utils.nextTick(function () {
                    self.set()
                })
            }
            self.onDel = function (e) {
                if (e.keyCode === 46 || e.keyCode === 8) {
                    self.set()
                }
            }
            el.addEventListener('cut', self.onCut)
            el.addEventListener('keyup', self.onDel)
        }
    },

    _set: function () {
        this.ownerVM.$set(
            this.key, this.multi
                ? getMultipleSelectOptions(this.el)
                : this.el[this.attr]
        )
    },

    update: function (value, init) {
        /* jshint eqeqeq: false */
        // sync back inline value if initial data is undefined
        if (init && value === undefined) {
            return this._set()
        }
        if (this.lock) return
        var el = this.el
        if (el.tagName === 'SELECT') { // select dropdown
            el.selectedIndex = -1
            if(this.multi && Array.isArray(value)) {
                value.forEach(this.updateSelect, this)
            } else {
                this.updateSelect(value)
            }
        } else if (el.type === 'radio') { // radio button
            el.checked = value == el.value
        } else if (el.type === 'checkbox') { // checkbox
            el.checked = !!value
        } else {
            el[this.attr] = utils.guard(value)
        }
    },

    updateSelect: function (value) {
        /* jshint eqeqeq: false */
        // setting <select>'s value in IE9 doesn't work
        // we have to manually loop through the options
        var options = this.el.options,
            i = options.length
        while (i--) {
            if (options[i].value == value) {
                options[i].selected = true
                break
            }
        }
    },

    unbind: function () {
        var el = this.el
        el.removeEventListener(this.event, this.set)
        el.removeEventListener('compositionstart', this.cLock)
        el.removeEventListener('compositionend', this.cUnlock)
        if (isIE9) {
            el.removeEventListener('cut', this.onCut)
            el.removeEventListener('keyup', this.onDel)
        }
    }
}
},{"../utils":82}],67:[function(require,module,exports){
var utils    = require('../utils')

/**
 *  Binding for event listeners
 */
module.exports = {

    isFn: true,

    bind: function () {
        this.context = this.binding.isExp
            ? this.vm
            : this.binding.compiler.vm
        if (this.el.tagName === 'IFRAME' && this.arg !== 'load') {
            var self = this
            this.iframeBind = function () {
                self.el.contentWindow.addEventListener(self.arg, self.handler)
            }
            this.el.addEventListener('load', this.iframeBind)
        }
    },

    update: function (handler) {
        if (typeof handler !== 'function') {
            utils.warn('Directive "v-on:' + this.expression + '" expects a method.')
            return
        }
        this.reset()
        var vm = this.vm,
            context = this.context
        this.handler = function (e) {
            e.targetVM = vm
            context.$event = e
            var res = handler.call(context, e)
            context.$event = null
            return res
        }
        if (this.iframeBind) {
            this.iframeBind()
        } else {
            this.el.addEventListener(this.arg, this.handler)
        }
    },

    reset: function () {
        var el = this.iframeBind
            ? this.el.contentWindow
            : this.el
        if (this.handler) {
            el.removeEventListener(this.arg, this.handler)
        }
    },

    unbind: function () {
        this.reset()
        this.el.removeEventListener('load', this.iframeBind)
    }
}
},{"../utils":82}],68:[function(require,module,exports){
var utils = require('../utils')

/**
 *  Binding for partials
 */
module.exports = {

    isLiteral: true,

    bind: function () {

        var id = this.expression
        if (!id) return

        var el       = this.el,
            compiler = this.compiler,
            partial  = compiler.getOption('partials', id)

        if (!partial) {
            if (id === 'yield') {
                utils.warn('{{>yield}} syntax has been deprecated. Use <content> tag instead.')
            }
            return
        }

        partial = partial.cloneNode(true)

        // comment ref node means inline partial
        if (el.nodeType === 8) {

            // keep a ref for the partial's content nodes
            var nodes = [].slice.call(partial.childNodes),
                parent = el.parentNode
            parent.insertBefore(partial, el)
            parent.removeChild(el)
            // compile partial after appending, because its children's parentNode
            // will change from the fragment to the correct parentNode.
            // This could affect directives that need access to its element's parentNode.
            nodes.forEach(compiler.compile, compiler)

        } else {

            // just set innerHTML...
            el.innerHTML = ''
            el.appendChild(partial)

        }
    }

}
},{"../utils":82}],69:[function(require,module,exports){
var utils      = require('../utils'),
    config     = require('../config')

/**
 *  Binding that manages VMs based on an Array
 */
module.exports = {

    bind: function () {

        this.identifier = '$r' + this.id

        // a hash to cache the same expressions on repeated instances
        // so they don't have to be compiled for every single instance
        this.expCache = utils.hash()

        var el   = this.el,
            ctn  = this.container = el.parentNode

        // extract child Id, if any
        this.childId = this.compiler.eval(utils.attr(el, 'ref'))

        // create a comment node as a reference node for DOM insertions
        this.ref = document.createComment(config.prefix + '-repeat-' + this.key)
        ctn.insertBefore(this.ref, el)
        ctn.removeChild(el)

        this.collection = null
        this.vms = null

    },

    update: function (collection) {

        if (!Array.isArray(collection)) {
            if (utils.isObject(collection)) {
                collection = utils.objectToArray(collection)
            } else {
                utils.warn('v-repeat only accepts Array or Object values.')
            }
        }

        // keep reference of old data and VMs
        // so we can reuse them if possible
        this.oldVMs = this.vms
        this.oldCollection = this.collection
        collection = this.collection = collection || []

        var isObject = collection[0] && utils.isObject(collection[0])
        this.vms = this.oldCollection
            ? this.diff(collection, isObject)
            : this.init(collection, isObject)

        if (this.childId) {
            this.vm.$[this.childId] = this.vms
        }

    },

    init: function (collection, isObject) {
        var vm, vms = []
        for (var i = 0, l = collection.length; i < l; i++) {
            vm = this.build(collection[i], i, isObject)
            vms.push(vm)
            if (this.compiler.init) {
                this.container.insertBefore(vm.$el, this.ref)
            } else {
                vm.$before(this.ref)
            }
        }
        return vms
    },

    /**
     *  Diff the new array with the old
     *  and determine the minimum amount of DOM manipulations.
     */
    diff: function (newCollection, isObject) {

        var i, l, item, vm,
            oldIndex,
            targetNext,
            currentNext,
            nextEl,
            ctn    = this.container,
            oldVMs = this.oldVMs,
            vms    = []

        vms.length = newCollection.length

        // first pass, collect new reused and new created
        for (i = 0, l = newCollection.length; i < l; i++) {
            item = newCollection[i]
            if (isObject) {
                item.$index = i
                if (item.__emitter__ && item.__emitter__[this.identifier]) {
                    // this piece of data is being reused.
                    // record its final position in reused vms
                    item.$reused = true
                } else {
                    vms[i] = this.build(item, i, isObject)
                }
            } else {
                // we can't attach an identifier to primitive values
                // so have to do an indexOf...
                oldIndex = indexOf(oldVMs, item)
                if (oldIndex > -1) {
                    // record the position on the existing vm
                    oldVMs[oldIndex].$reused = true
                    oldVMs[oldIndex].$data.$index = i
                } else {
                    vms[i] = this.build(item, i, isObject)
                }
            }
        }

        // second pass, collect old reused and destroy unused
        for (i = 0, l = oldVMs.length; i < l; i++) {
            vm = oldVMs[i]
            item = this.arg
                ? vm.$data[this.arg]
                : vm.$data
            if (item.$reused) {
                vm.$reused = true
                delete item.$reused
            }
            if (vm.$reused) {
                // update the index to latest
                vm.$index = item.$index
                // the item could have had a new key
                if (item.$key && item.$key !== vm.$key) {
                    vm.$key = item.$key
                }
                vms[vm.$index] = vm
            } else {
                // this one can be destroyed.
                if (item.__emitter__) {
                    delete item.__emitter__[this.identifier]
                }
                vm.$destroy()
            }
        }

        // final pass, move/insert DOM elements
        i = vms.length
        while (i--) {
            vm = vms[i]
            item = vm.$data
            targetNext = vms[i + 1]
            if (vm.$reused) {
                nextEl = vm.$el.nextSibling
                // destroyed VMs' element might still be in the DOM
                // due to transitions
                while (!nextEl.vue_vm && nextEl !== this.ref) {
                    nextEl = nextEl.nextSibling
                }
                currentNext = nextEl.vue_vm
                if (currentNext !== targetNext) {
                    if (!targetNext) {
                        ctn.insertBefore(vm.$el, this.ref)
                    } else {
                        nextEl = targetNext.$el
                        // new VMs' element might not be in the DOM yet
                        // due to transitions
                        while (!nextEl.parentNode) {
                            targetNext = vms[nextEl.vue_vm.$index + 1]
                            nextEl = targetNext
                                ? targetNext.$el
                                : this.ref
                        }
                        ctn.insertBefore(vm.$el, nextEl)
                    }
                }
                delete vm.$reused
                delete item.$index
                delete item.$key
            } else { // a new vm
                vm.$before(targetNext ? targetNext.$el : this.ref)
            }
        }

        return vms
    },

    build: function (data, index, isObject) {

        // wrap non-object values
        var raw, alias,
            wrap = !isObject || this.arg
        if (wrap) {
            raw = data
            alias = this.arg || '$value'
            data = {}
            data[alias] = raw
        }
        data.$index = index

        var el = this.el.cloneNode(true),
            Ctor = this.compiler.resolveComponent(el, data),
            vm = new Ctor({
                el: el,
                data: data,
                parent: this.vm,
                compilerOptions: {
                    repeat: true,
                    expCache: this.expCache
                }
            })

        if (isObject) {
            // attach an ienumerable identifier to the raw data
            (raw || data).__emitter__[this.identifier] = true
        }

        return vm

    },

    unbind: function () {
        if (this.childId) {
            delete this.vm.$[this.childId]
        }
        if (this.vms) {
            var i = this.vms.length
            while (i--) {
                this.vms[i].$destroy()
            }
        }
    }
}

// Helpers --------------------------------------------------------------------

/**
 *  Find an object or a wrapped data object
 *  from an Array
 */
function indexOf (vms, obj) {
    for (var vm, i = 0, l = vms.length; i < l; i++) {
        vm = vms[i]
        if (!vm.$reused && vm.$value === obj) {
            return i
        }
    }
    return -1
}
},{"../config":60,"../utils":82}],70:[function(require,module,exports){
var prefixes = ['-webkit-', '-moz-', '-ms-']

/**
 *  Binding for CSS styles
 */
module.exports = {

    bind: function () {
        var prop = this.arg
        if (!prop) return
        if (prop.charAt(0) === '$') {
            // properties that start with $ will be auto-prefixed
            prop = prop.slice(1)
            this.prefixed = true
        }
        this.prop = prop
    },

    update: function (value) {
        var prop = this.prop,
            isImportant
        /* jshint eqeqeq: true */
        // cast possible numbers/booleans into strings
        if (value != null) value += ''
        if (prop) {
            if (value) {
                isImportant = value.slice(-10) === '!important'
                    ? 'important'
                    : ''
                if (isImportant) {
                    value = value.slice(0, -10).trim()
                }
            }
            this.el.style.setProperty(prop, value, isImportant)
            if (this.prefixed) {
                var i = prefixes.length
                while (i--) {
                    this.el.style.setProperty(prefixes[i] + prop, value, isImportant)
                }
            }
        } else {
            this.el.style.cssText = value
        }
    }

}
},{}],71:[function(require,module,exports){
/**
 *  Manages a conditional child VM using the
 *  binding's value as the component ID.
 */
module.exports = {

    bind: function () {

        // track position in DOM with a ref node
        var el       = this.raw = this.el,
            parent   = el.parentNode,
            ref      = this.ref = document.createComment('v-view')
        parent.insertBefore(ref, el)
        parent.removeChild(el)

        // cache original content
        /* jshint boss: true */
        var node,
            frag = this.inner = document.createElement('div')
        while (node = el.firstChild) {
            frag.appendChild(node)
        }

    },

    update: function(value) {

        this.unbind()

        var Ctor  = this.compiler.getOption('components', value)
        if (!Ctor) return

        this.childVM = new Ctor({
            el: this.raw.cloneNode(true),
            parent: this.vm,
            compilerOptions: {
                rawContent: this.inner.cloneNode(true)
            }
        })

        this.el = this.childVM.$el
        if (this.compiler.init) {
            this.ref.parentNode.insertBefore(this.el, this.ref)
        } else {
            this.childVM.$before(this.ref)
        }

    },

    unbind: function() {
        if (this.childVM) {
            this.childVM.$destroy()
        }
    }

}
},{}],72:[function(require,module,exports){
var utils = require('../utils')

/**
 *  Binding for inheriting data from parent VMs.
 */
module.exports = {

    bind: function () {

        var self      = this,
            childKey  = self.arg,
            parentKey = self.key,
            compiler  = self.compiler,
            owner     = self.binding.compiler

        if (compiler === owner) {
            this.alone = true
            return
        }

        if (childKey) {
            if (!compiler.bindings[childKey]) {
                compiler.createBinding(childKey)
            }
            // sync changes on child back to parent
            compiler.observer.on('change:' + childKey, function (val) {
                if (compiler.init) return
                if (!self.lock) {
                    self.lock = true
                    utils.nextTick(function () {
                        self.lock = false
                    })
                }
                owner.vm.$set(parentKey, val)
            })
        }
    },

    update: function (value) {
        // sync from parent
        if (!this.alone && !this.lock) {
            if (this.arg) {
                this.vm.$set(this.arg, value)
            } else if (this.vm.$data !== value) {
                this.vm.$data = value
            }
        }
    }

}
},{"../utils":82}],73:[function(require,module,exports){
var slice = [].slice

function Emitter (ctx) {
    this._ctx = ctx || this
}

var EmitterProto = Emitter.prototype

EmitterProto.on = function (event, fn) {
    this._cbs = this._cbs || {}
    ;(this._cbs[event] = this._cbs[event] || [])
        .push(fn)
    return this
}

EmitterProto.once = function (event, fn) {
    var self = this
    this._cbs = this._cbs || {}

    function on () {
        self.off(event, on)
        fn.apply(this, arguments)
    }

    on.fn = fn
    this.on(event, on)
    return this
}

EmitterProto.off = function (event, fn) {
    this._cbs = this._cbs || {}

    // all
    if (!arguments.length) {
        this._cbs = {}
        return this
    }

    // specific event
    var callbacks = this._cbs[event]
    if (!callbacks) return this

    // remove all handlers
    if (arguments.length === 1) {
        delete this._cbs[event]
        return this
    }

    // remove specific handler
    var cb
    for (var i = 0; i < callbacks.length; i++) {
        cb = callbacks[i]
        if (cb === fn || cb.fn === fn) {
            callbacks.splice(i, 1)
            break
        }
    }
    return this
}

/**
 *  The internal, faster emit with fixed amount of arguments
 *  using Function.call
 */
EmitterProto.emit = function (event, a, b, c) {
    this._cbs = this._cbs || {}
    var callbacks = this._cbs[event]

    if (callbacks) {
        callbacks = callbacks.slice(0)
        for (var i = 0, len = callbacks.length; i < len; i++) {
            callbacks[i].call(this._ctx, a, b, c)
        }
    }

    return this
}

/**
 *  The external emit using Function.apply
 */
EmitterProto.applyEmit = function (event) {
    this._cbs = this._cbs || {}
    var callbacks = this._cbs[event], args

    if (callbacks) {
        callbacks = callbacks.slice(0)
        args = slice.call(arguments, 1)
        for (var i = 0, len = callbacks.length; i < len; i++) {
            callbacks[i].apply(this._ctx, args)
        }
    }

    return this
}

module.exports = Emitter
},{}],74:[function(require,module,exports){
var utils           = require('./utils'),
    STR_SAVE_RE     = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,
    STR_RESTORE_RE  = /"(\d+)"/g,
    NEWLINE_RE      = /\n/g,
    CTOR_RE         = new RegExp('constructor'.split('').join('[\'"+, ]*')),
    UNICODE_RE      = /\\u\d\d\d\d/

// Variable extraction scooped from https://github.com/RubyLouvre/avalon

var KEYWORDS =
        // keywords
        'break,case,catch,continue,debugger,default,delete,do,else,false' +
        ',finally,for,function,if,in,instanceof,new,null,return,switch,this' +
        ',throw,true,try,typeof,var,void,while,with,undefined' +
        // reserved
        ',abstract,boolean,byte,char,class,const,double,enum,export,extends' +
        ',final,float,goto,implements,import,int,interface,long,native' +
        ',package,private,protected,public,short,static,super,synchronized' +
        ',throws,transient,volatile' +
        // ECMA 5 - use strict
        ',arguments,let,yield' +
        // allow using Math in expressions
        ',Math',
        
    KEYWORDS_RE = new RegExp(["\\b" + KEYWORDS.replace(/,/g, '\\b|\\b') + "\\b"].join('|'), 'g'),
    REMOVE_RE   = /\/\*(?:.|\n)*?\*\/|\/\/[^\n]*\n|\/\/[^\n]*$|'[^']*'|"[^"]*"|[\s\t\n]*\.[\s\t\n]*[$\w\.]+|[\{,]\s*[\w\$_]+\s*:/g,
    SPLIT_RE    = /[^\w$]+/g,
    NUMBER_RE   = /\b\d[^,]*/g,
    BOUNDARY_RE = /^,+|,+$/g

/**
 *  Strip top level variable names from a snippet of JS expression
 */
function getVariables (code) {
    code = code
        .replace(REMOVE_RE, '')
        .replace(SPLIT_RE, ',')
        .replace(KEYWORDS_RE, '')
        .replace(NUMBER_RE, '')
        .replace(BOUNDARY_RE, '')
    return code
        ? code.split(/,+/)
        : []
}

/**
 *  A given path could potentially exist not on the
 *  current compiler, but up in the parent chain somewhere.
 *  This function generates an access relationship string
 *  that can be used in the getter function by walking up
 *  the parent chain to check for key existence.
 *
 *  It stops at top parent if no vm in the chain has the
 *  key. It then creates any missing bindings on the
 *  final resolved vm.
 */
function traceScope (path, compiler, data) {
    var rel  = '',
        dist = 0,
        self = compiler

    if (data && utils.get(data, path) !== undefined) {
        // hack: temporarily attached data
        return '$temp.'
    }

    while (compiler) {
        if (compiler.hasKey(path)) {
            break
        } else {
            compiler = compiler.parent
            dist++
        }
    }
    if (compiler) {
        while (dist--) {
            rel += '$parent.'
        }
        if (!compiler.bindings[path] && path.charAt(0) !== '$') {
            compiler.createBinding(path)
        }
    } else {
        self.createBinding(path)
    }
    return rel
}

/**
 *  Create a function from a string...
 *  this looks like evil magic but since all variables are limited
 *  to the VM's data it's actually properly sandboxed
 */
function makeGetter (exp, raw) {
    var fn
    try {
        fn = new Function(exp)
    } catch (e) {
        utils.warn('Error parsing expression: ' + raw)
    }
    return fn
}

/**
 *  Escape a leading dollar sign for regex construction
 */
function escapeDollar (v) {
    return v.charAt(0) === '$'
        ? '\\' + v
        : v
}

/**
 *  Parse and return an anonymous computed property getter function
 *  from an arbitrary expression, together with a list of paths to be
 *  created as bindings.
 */
exports.parse = function (exp, compiler, data) {
    // unicode and 'constructor' are not allowed for XSS security.
    if (UNICODE_RE.test(exp) || CTOR_RE.test(exp)) {
        utils.warn('Unsafe expression: ' + exp)
        return
    }
    // extract variable names
    var vars = getVariables(exp)
    if (!vars.length) {
        return makeGetter('return ' + exp, exp)
    }
    vars = utils.unique(vars)

    var accessors = '',
        has       = utils.hash(),
        strings   = [],
        // construct a regex to extract all valid variable paths
        // ones that begin with "$" are particularly tricky
        // because we can't use \b for them
        pathRE = new RegExp(
            "[^$\\w\\.](" +
            vars.map(escapeDollar).join('|') +
            ")[$\\w\\.]*\\b", 'g'
        ),
        body = (' ' + exp)
            .replace(STR_SAVE_RE, saveStrings)
            .replace(pathRE, replacePath)
            .replace(STR_RESTORE_RE, restoreStrings)

    body = accessors + 'return ' + body

    function saveStrings (str) {
        var i = strings.length
        // escape newlines in strings so the expression
        // can be correctly evaluated
        strings[i] = str.replace(NEWLINE_RE, '\\n')
        return '"' + i + '"'
    }

    function replacePath (path) {
        // keep track of the first char
        var c = path.charAt(0)
        path = path.slice(1)
        var val = 'this.' + traceScope(path, compiler, data) + path
        if (!has[path]) {
            accessors += val + ';'
            has[path] = 1
        }
        // don't forget to put that first char back
        return c + val
    }

    function restoreStrings (str, i) {
        return strings[i]
    }

    return makeGetter(body, exp)
}

/**
 *  Evaluate an expression in the context of a compiler.
 *  Accepts additional data.
 */
exports.eval = function (exp, compiler, data) {
    var getter = exports.parse(exp, compiler, data), res
    if (getter) {
        // hack: temporarily attach the additional data so
        // it can be accessed in the getter
        compiler.vm.$temp = data
        res = getter.call(compiler.vm)
        delete compiler.vm.$temp
    }
    return res
}
},{"./utils":82}],75:[function(require,module,exports){
var utils    = require('./utils'),
    get      = utils.get,
    slice    = [].slice,
    QUOTE_RE = /^'.*'$/,
    filters  = module.exports = utils.hash()

/**
 *  'abc' => 'Abc'
 */
filters.capitalize = function (value) {
    if (!value && value !== 0) return ''
    value = value.toString()
    return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 *  'abc' => 'ABC'
 */
filters.uppercase = function (value) {
    return (value || value === 0)
        ? value.toString().toUpperCase()
        : ''
}

/**
 *  'AbC' => 'abc'
 */
filters.lowercase = function (value) {
    return (value || value === 0)
        ? value.toString().toLowerCase()
        : ''
}

/**
 *  12345 => $12,345.00
 */
filters.currency = function (value, sign) {
    value = parseFloat(value)
    if (!value && value !== 0) return ''
    sign = sign || '$'
    var s = Math.floor(value).toString(),
        i = s.length % 3,
        h = i > 0 ? (s.slice(0, i) + (s.length > 3 ? ',' : '')) : '',
        f = '.' + value.toFixed(2).slice(-2)
    return sign + h + s.slice(i).replace(/(\d{3})(?=\d)/g, '$1,') + f
}

/**
 *  args: an array of strings corresponding to
 *  the single, double, triple ... forms of the word to
 *  be pluralized. When the number to be pluralized
 *  exceeds the length of the args, it will use the last
 *  entry in the array.
 *
 *  e.g. ['single', 'double', 'triple', 'multiple']
 */
filters.pluralize = function (value) {
    var args = slice.call(arguments, 1)
    return args.length > 1
        ? (args[value - 1] || args[args.length - 1])
        : (args[value - 1] || args[0] + 's')
}

/**
 *  A special filter that takes a handler function,
 *  wraps it so it only gets triggered on specific keypresses.
 *
 *  v-on only
 */

var keyCodes = {
    enter    : 13,
    tab      : 9,
    'delete' : 46,
    up       : 38,
    left     : 37,
    right    : 39,
    down     : 40,
    esc      : 27
}

filters.key = function (handler, key) {
    if (!handler) return
    var code = keyCodes[key]
    if (!code) {
        code = parseInt(key, 10)
    }
    return function (e) {
        if (e.keyCode === code) {
            return handler.call(this, e)
        }
    }
}

/**
 *  Filter filter for v-repeat
 */
filters.filterBy = function (arr, searchKey, delimiter, dataKey) {

    // allow optional `in` delimiter
    // because why not
    if (delimiter && delimiter !== 'in') {
        dataKey = delimiter
    }

    // get the search string
    var search = stripQuotes(searchKey) || this.$get(searchKey)
    if (!search) return arr
    search = search.toLowerCase()

    // get the optional dataKey
    dataKey = dataKey && (stripQuotes(dataKey) || this.$get(dataKey))

    // convert object to array
    if (!Array.isArray(arr)) {
        arr = utils.objectToArray(arr)
    }

    return arr.filter(function (item) {
        return dataKey
            ? contains(get(item, dataKey), search)
            : contains(item, search)
    })

}

filters.filterBy.computed = true

/**
 *  Sort fitler for v-repeat
 */
filters.orderBy = function (arr, sortKey, reverseKey) {

    var key = stripQuotes(sortKey) || this.$get(sortKey)
    if (!key) return arr

    // convert object to array
    if (!Array.isArray(arr)) {
        arr = utils.objectToArray(arr)
    }

    var order = 1
    if (reverseKey) {
        if (reverseKey === '-1') {
            order = -1
        } else if (reverseKey.charAt(0) === '!') {
            reverseKey = reverseKey.slice(1)
            order = this.$get(reverseKey) ? 1 : -1
        } else {
            order = this.$get(reverseKey) ? -1 : 1
        }
    }

    // sort on a copy to avoid mutating original array
    return arr.slice().sort(function (a, b) {
        a = get(a, key)
        b = get(b, key)
        return a === b ? 0 : a > b ? order : -order
    })

}

filters.orderBy.computed = true

// Array filter helpers -------------------------------------------------------

/**
 *  String contain helper
 */
function contains (val, search) {
    /* jshint eqeqeq: false */
    if (utils.isObject(val)) {
        for (var key in val) {
            if (contains(val[key], search)) {
                return true
            }
        }
    } else if (val != null) {
        return val.toString().toLowerCase().indexOf(search) > -1
    }
}

/**
 *  Test whether a string is in quotes,
 *  if yes return stripped string
 */
function stripQuotes (str) {
    if (QUOTE_RE.test(str)) {
        return str.slice(1, -1)
    }
}
},{"./utils":82}],76:[function(require,module,exports){
// string -> DOM conversion
// wrappers originally from jQuery, scooped from component/domify
var map = {
    legend   : [1, '<fieldset>', '</fieldset>'],
    tr       : [2, '<table><tbody>', '</tbody></table>'],
    col      : [2, '<table><tbody></tbody><colgroup>', '</colgroup></table>'],
    _default : [0, '', '']
}

map.td =
map.th = [3, '<table><tbody><tr>', '</tr></tbody></table>']

map.option =
map.optgroup = [1, '<select multiple="multiple">', '</select>']

map.thead =
map.tbody =
map.colgroup =
map.caption =
map.tfoot = [1, '<table>', '</table>']

map.text =
map.circle =
map.ellipse =
map.line =
map.path =
map.polygon =
map.polyline =
map.rect = [1, '<svg xmlns="http://www.w3.org/2000/svg" version="1.1">','</svg>']

var TAG_RE = /<([\w:]+)/

module.exports = function (templateString) {
    var frag = document.createDocumentFragment(),
        m = TAG_RE.exec(templateString)
    // text only
    if (!m) {
        frag.appendChild(document.createTextNode(templateString))
        return frag
    }

    var tag = m[1],
        wrap = map[tag] || map._default,
        depth = wrap[0],
        prefix = wrap[1],
        suffix = wrap[2],
        node = document.createElement('div')

    node.innerHTML = prefix + templateString.trim() + suffix
    while (depth--) node = node.lastChild

    // one element
    if (node.firstChild === node.lastChild) {
        frag.appendChild(node.firstChild)
        return frag
    }

    // multiple nodes, return a fragment
    var child
    /* jshint boss: true */
    while (child = node.firstChild) {
        if (node.nodeType === 1) {
            frag.appendChild(child)
        }
    }
    return frag
}
},{}],77:[function(require,module,exports){
var config      = require('./config'),
    ViewModel   = require('./viewmodel'),
    utils       = require('./utils'),
    makeHash    = utils.hash,
    assetTypes  = ['directive', 'filter', 'partial', 'effect', 'component'],
    // Internal modules that are exposed for plugins
    pluginAPI   = {
        utils: utils,
        config: config,
        transition: require('./transition'),
        observer: require('./observer')
    }

ViewModel.options = config.globalAssets = {
    directives  : require('./directives'),
    filters     : require('./filters'),
    partials    : makeHash(),
    effects     : makeHash(),
    components  : makeHash()
}

/**
 *  Expose asset registration methods
 */
assetTypes.forEach(function (type) {
    ViewModel[type] = function (id, value) {
        var hash = this.options[type + 's']
        if (!hash) {
            hash = this.options[type + 's'] = makeHash()
        }
        if (!value) return hash[id]
        if (type === 'partial') {
            value = utils.parseTemplateOption(value)
        } else if (type === 'component') {
            value = utils.toConstructor(value)
        } else if (type === 'filter') {
            utils.checkFilter(value)
        }
        hash[id] = value
        return this
    }
})

/**
 *  Set config options
 */
ViewModel.config = function (opts, val) {
    if (typeof opts === 'string') {
        if (val === undefined) {
            return config[opts]
        } else {
            config[opts] = val
        }
    } else {
        utils.extend(config, opts)
    }
    return this
}

/**
 *  Expose an interface for plugins
 */
ViewModel.use = function (plugin) {
    if (typeof plugin === 'string') {
        try {
            plugin = require(plugin)
        } catch (e) {
            utils.warn('Cannot find plugin: ' + plugin)
            return
        }
    }

    // additional parameters
    var args = [].slice.call(arguments, 1)
    args.unshift(this)

    if (typeof plugin.install === 'function') {
        plugin.install.apply(plugin, args)
    } else {
        plugin.apply(null, args)
    }
    return this
}

/**
 *  Expose internal modules for plugins
 */
ViewModel.require = function (module) {
    return pluginAPI[module]
}

ViewModel.extend = extend
ViewModel.nextTick = utils.nextTick

/**
 *  Expose the main ViewModel class
 *  and add extend method
 */
function extend (options) {

    var ParentVM = this

    // extend data options need to be copied
    // on instantiation
    if (options.data) {
        options.defaultData = options.data
        delete options.data
    }

    // inherit options
    // but only when the super class is not the native Vue.
    if (ParentVM !== ViewModel) {
        options = inheritOptions(options, ParentVM.options, true)
    }
    utils.processOptions(options)

    var ExtendedVM = function (opts, asParent) {
        if (!asParent) {
            opts = inheritOptions(opts, options, true)
        }
        ParentVM.call(this, opts, true)
    }

    // inherit prototype props
    var proto = ExtendedVM.prototype = Object.create(ParentVM.prototype)
    utils.defProtected(proto, 'constructor', ExtendedVM)

    // allow extended VM to be further extended
    ExtendedVM.extend  = extend
    ExtendedVM.super   = ParentVM
    ExtendedVM.options = options

    // allow extended VM to add its own assets
    assetTypes.forEach(function (type) {
        ExtendedVM[type] = ViewModel[type]
    })

    // allow extended VM to use plugins
    ExtendedVM.use     = ViewModel.use
    ExtendedVM.require = ViewModel.require

    return ExtendedVM
}

/**
 *  Inherit options
 *
 *  For options such as `data`, `vms`, `directives`, 'partials',
 *  they should be further extended. However extending should only
 *  be done at top level.
 *  
 *  `proto` is an exception because it's handled directly on the
 *  prototype.
 *
 *  `el` is an exception because it's not allowed as an
 *  extension option, but only as an instance option.
 */
function inheritOptions (child, parent, topLevel) {
    child = child || {}
    if (!parent) return child
    for (var key in parent) {
        if (key === 'el') continue
        var val = child[key],
            parentVal = parent[key]
        if (topLevel && typeof val === 'function' && parentVal) {
            // merge hook functions into an array
            child[key] = [val]
            if (Array.isArray(parentVal)) {
                child[key] = child[key].concat(parentVal)
            } else {
                child[key].push(parentVal)
            }
        } else if (
            topLevel &&
            (utils.isTrueObject(val) || utils.isTrueObject(parentVal))
            && !(parentVal instanceof ViewModel)
        ) {
            // merge toplevel object options
            child[key] = inheritOptions(val, parentVal)
        } else if (val === undefined) {
            // inherit if child doesn't override
            child[key] = parentVal
        }
    }
    return child
}

module.exports = ViewModel
},{"./config":60,"./directives":65,"./filters":75,"./observer":78,"./transition":81,"./utils":82,"./viewmodel":83}],78:[function(require,module,exports){
/* jshint proto:true */

var Emitter  = require('./emitter'),
    utils    = require('./utils'),
    // cache methods
    def      = utils.defProtected,
    isObject = utils.isObject,
    isArray  = Array.isArray,
    hasOwn   = ({}).hasOwnProperty,
    oDef     = Object.defineProperty,
    slice    = [].slice,
    // fix for IE + __proto__ problem
    // define methods as inenumerable if __proto__ is present,
    // otherwise enumerable so we can loop through and manually
    // attach to array instances
    hasProto = ({}).__proto__

// Array Mutation Handlers & Augmentations ------------------------------------

// The proxy prototype to replace the __proto__ of
// an observed array
var ArrayProxy = Object.create(Array.prototype)

// intercept mutation methods
;[
    'push',
    'pop',
    'shift',
    'unshift',
    'splice',
    'sort',
    'reverse'
].forEach(watchMutation)

// Augment the ArrayProxy with convenience methods
def(ArrayProxy, '$set', function (index, data) {
    return this.splice(index, 1, data)[0]
}, !hasProto)

def(ArrayProxy, '$remove', function (index) {
    if (typeof index !== 'number') {
        index = this.indexOf(index)
    }
    if (index > -1) {
        return this.splice(index, 1)[0]
    }
}, !hasProto)

/**
 *  Intercep a mutation event so we can emit the mutation info.
 *  we also analyze what elements are added/removed and link/unlink
 *  them with the parent Array.
 */
function watchMutation (method) {
    def(ArrayProxy, method, function () {

        var args = slice.call(arguments),
            result = Array.prototype[method].apply(this, args),
            inserted, removed

        // determine new / removed elements
        if (method === 'push' || method === 'unshift') {
            inserted = args
        } else if (method === 'pop' || method === 'shift') {
            removed = [result]
        } else if (method === 'splice') {
            inserted = args.slice(2)
            removed = result
        }
        
        // link & unlink
        linkArrayElements(this, inserted)
        unlinkArrayElements(this, removed)

        // emit the mutation event
        this.__emitter__.emit('mutate', '', this, {
            method   : method,
            args     : args,
            result   : result,
            inserted : inserted,
            removed  : removed
        })

        return result
        
    }, !hasProto)
}

/**
 *  Link new elements to an Array, so when they change
 *  and emit events, the owner Array can be notified.
 */
function linkArrayElements (arr, items) {
    if (items) {
        var i = items.length, item, owners
        while (i--) {
            item = items[i]
            if (isWatchable(item)) {
                // if object is not converted for observing
                // convert it...
                if (!item.__emitter__) {
                    convert(item)
                    watch(item)
                }
                owners = item.__emitter__.owners
                if (owners.indexOf(arr) < 0) {
                    owners.push(arr)
                }
            }
        }
    }
}

/**
 *  Unlink removed elements from the ex-owner Array.
 */
function unlinkArrayElements (arr, items) {
    if (items) {
        var i = items.length, item
        while (i--) {
            item = items[i]
            if (item && item.__emitter__) {
                var owners = item.__emitter__.owners
                if (owners) owners.splice(owners.indexOf(arr))
            }
        }
    }
}

// Object add/delete key augmentation -----------------------------------------

var ObjProxy = Object.create(Object.prototype)

def(ObjProxy, '$add', function (key, val) {
    if (hasOwn.call(this, key)) return
    this[key] = val
    convertKey(this, key, true)
}, !hasProto)

def(ObjProxy, '$delete', function (key) {
    if (!(hasOwn.call(this, key))) return
    // trigger set events
    this[key] = undefined
    delete this[key]
    this.__emitter__.emit('delete', key)
}, !hasProto)

// Watch Helpers --------------------------------------------------------------

/**
 *  Check if a value is watchable
 */
function isWatchable (obj) {
    return typeof obj === 'object' && obj && !obj.$compiler
}

/**
 *  Convert an Object/Array to give it a change emitter.
 */
function convert (obj) {
    if (obj.__emitter__) return true
    var emitter = new Emitter()
    def(obj, '__emitter__', emitter)
    emitter
        .on('set', function (key, val, propagate) {
            if (propagate) propagateChange(obj)
        })
        .on('mutate', function () {
            propagateChange(obj)
        })
    emitter.values = utils.hash()
    emitter.owners = []
    return false
}

/**
 *  Propagate an array element's change to its owner arrays
 */
function propagateChange (obj) {
    var owners = obj.__emitter__.owners,
        i = owners.length
    while (i--) {
        owners[i].__emitter__.emit('set', '', '', true)
    }
}

/**
 *  Watch target based on its type
 */
function watch (obj) {
    if (isArray(obj)) {
        watchArray(obj)
    } else {
        watchObject(obj)
    }
}

/**
 *  Augment target objects with modified
 *  methods
 */
function augment (target, src) {
    if (hasProto) {
        target.__proto__ = src
    } else {
        for (var key in src) {
            def(target, key, src[key])
        }
    }
}

/**
 *  Watch an Object, recursive.
 */
function watchObject (obj) {
    augment(obj, ObjProxy)
    for (var key in obj) {
        convertKey(obj, key)
    }
}

/**
 *  Watch an Array, overload mutation methods
 *  and add augmentations by intercepting the prototype chain
 */
function watchArray (arr) {
    augment(arr, ArrayProxy)
    linkArrayElements(arr, arr)
}

/**
 *  Define accessors for a property on an Object
 *  so it emits get/set events.
 *  Then watch the value itself.
 */
function convertKey (obj, key, propagate) {
    var keyPrefix = key.charAt(0)
    if (keyPrefix === '$' || keyPrefix === '_') {
        return
    }
    // emit set on bind
    // this means when an object is observed it will emit
    // a first batch of set events.
    var emitter = obj.__emitter__,
        values  = emitter.values

    init(obj[key], propagate)

    oDef(obj, key, {
        enumerable: true,
        configurable: true,
        get: function () {
            var value = values[key]
            // only emit get on tip values
            if (pub.shouldGet) {
                emitter.emit('get', key)
            }
            return value
        },
        set: function (newVal) {
            var oldVal = values[key]
            unobserve(oldVal, key, emitter)
            copyPaths(newVal, oldVal)
            // an immediate property should notify its parent
            // to emit set for itself too
            init(newVal, true)
        }
    })

    function init (val, propagate) {
        values[key] = val
        emitter.emit('set', key, val, propagate)
        if (isArray(val)) {
            emitter.emit('set', key + '.length', val.length, propagate)
        }
        observe(val, key, emitter)
    }
}

/**
 *  When a value that is already converted is
 *  observed again by another observer, we can skip
 *  the watch conversion and simply emit set event for
 *  all of its properties.
 */
function emitSet (obj) {
    var emitter = obj && obj.__emitter__
    if (!emitter) return
    if (isArray(obj)) {
        emitter.emit('set', 'length', obj.length)
    } else {
        var key, val
        for (key in obj) {
            val = obj[key]
            emitter.emit('set', key, val)
            emitSet(val)
        }
    }
}

/**
 *  Make sure all the paths in an old object exists
 *  in a new object.
 *  So when an object changes, all missing keys will
 *  emit a set event with undefined value.
 */
function copyPaths (newObj, oldObj) {
    if (!isObject(newObj) || !isObject(oldObj)) {
        return
    }
    var path, oldVal, newVal
    for (path in oldObj) {
        if (!(hasOwn.call(newObj, path))) {
            oldVal = oldObj[path]
            if (isArray(oldVal)) {
                newObj[path] = []
            } else if (isObject(oldVal)) {
                newVal = newObj[path] = {}
                copyPaths(newVal, oldVal)
            } else {
                newObj[path] = undefined
            }
        }
    }
}

/**
 *  walk along a path and make sure it can be accessed
 *  and enumerated in that object
 */
function ensurePath (obj, key) {
    var path = key.split('.'), sec
    for (var i = 0, d = path.length - 1; i < d; i++) {
        sec = path[i]
        if (!obj[sec]) {
            obj[sec] = {}
            if (obj.__emitter__) convertKey(obj, sec)
        }
        obj = obj[sec]
    }
    if (isObject(obj)) {
        sec = path[i]
        if (!(hasOwn.call(obj, sec))) {
            obj[sec] = undefined
            if (obj.__emitter__) convertKey(obj, sec)
        }
    }
}

// Main API Methods -----------------------------------------------------------

/**
 *  Observe an object with a given path,
 *  and proxy get/set/mutate events to the provided observer.
 */
function observe (obj, rawPath, observer) {

    if (!isWatchable(obj)) return

    var path = rawPath ? rawPath + '.' : '',
        alreadyConverted = convert(obj),
        emitter = obj.__emitter__

    // setup proxy listeners on the parent observer.
    // we need to keep reference to them so that they
    // can be removed when the object is un-observed.
    observer.proxies = observer.proxies || {}
    var proxies = observer.proxies[path] = {
        get: function (key) {
            observer.emit('get', path + key)
        },
        set: function (key, val, propagate) {
            if (key) observer.emit('set', path + key, val)
            // also notify observer that the object itself changed
            // but only do so when it's a immediate property. this
            // avoids duplicate event firing.
            if (rawPath && propagate) {
                observer.emit('set', rawPath, obj, true)
            }
        },
        mutate: function (key, val, mutation) {
            // if the Array is a root value
            // the key will be null
            var fixedPath = key ? path + key : rawPath
            observer.emit('mutate', fixedPath, val, mutation)
            // also emit set for Array's length when it mutates
            var m = mutation.method
            if (m !== 'sort' && m !== 'reverse') {
                observer.emit('set', fixedPath + '.length', val.length)
            }
        }
    }

    // attach the listeners to the child observer.
    // now all the events will propagate upwards.
    emitter
        .on('get', proxies.get)
        .on('set', proxies.set)
        .on('mutate', proxies.mutate)

    if (alreadyConverted) {
        // for objects that have already been converted,
        // emit set events for everything inside
        emitSet(obj)
    } else {
        watch(obj)
    }
}

/**
 *  Cancel observation, turn off the listeners.
 */
function unobserve (obj, path, observer) {

    if (!obj || !obj.__emitter__) return

    path = path ? path + '.' : ''
    var proxies = observer.proxies[path]
    if (!proxies) return

    // turn off listeners
    obj.__emitter__
        .off('get', proxies.get)
        .off('set', proxies.set)
        .off('mutate', proxies.mutate)

    // remove reference
    observer.proxies[path] = null
}

// Expose API -----------------------------------------------------------------

var pub = module.exports = {

    // whether to emit get events
    // only enabled during dependency parsing
    shouldGet   : false,

    observe     : observe,
    unobserve   : unobserve,
    ensurePath  : ensurePath,
    copyPaths   : copyPaths,
    watch       : watch,
    convert     : convert,
    convertKey  : convertKey
}
},{"./emitter":73,"./utils":82}],79:[function(require,module,exports){
var toFragment = require('./fragment');

/**
 * Parses a template string or node and normalizes it into a
 * a node that can be used as a partial of a template option
 *
 * Possible values include
 * id selector: '#some-template-id'
 * template string: '<div><span>my template</span></div>'
 * DocumentFragment object
 * Node object of type Template
 */
module.exports = function(template) {
    var templateNode;

    if (template instanceof window.DocumentFragment) {
        // if the template is already a document fragment -- do nothing
        return template
    }

    if (typeof template === 'string') {
        // template by ID
        if (template.charAt(0) === '#') {
            templateNode = document.getElementById(template.slice(1))
            if (!templateNode) return
        } else {
            return toFragment(template)
        }
    } else if (template.nodeType) {
        templateNode = template
    } else {
        return
    }

    // if its a template tag and the browser supports it,
    // its content is already a document fragment!
    if (templateNode.tagName === 'TEMPLATE' && templateNode.content) {
        return templateNode.content
    }

    if (templateNode.tagName === 'SCRIPT') {
        return toFragment(templateNode.innerHTML)
    }

    return toFragment(templateNode.outerHTML);
}

},{"./fragment":76}],80:[function(require,module,exports){
var openChar        = '{',
    endChar         = '}',
    ESCAPE_RE       = /[-.*+?^${}()|[\]\/\\]/g,
    // lazy require
    Directive

exports.Regex = buildInterpolationRegex()

function buildInterpolationRegex () {
    var open = escapeRegex(openChar),
        end  = escapeRegex(endChar)
    return new RegExp(open + open + open + '?(.+?)' + end + '?' + end + end)
}

function escapeRegex (str) {
    return str.replace(ESCAPE_RE, '\\$&')
}

function setDelimiters (delimiters) {
    openChar = delimiters[0]
    endChar = delimiters[1]
    exports.delimiters = delimiters
    exports.Regex = buildInterpolationRegex()
}

/** 
 *  Parse a piece of text, return an array of tokens
 *  token types:
 *  1. plain string
 *  2. object with key = binding key
 *  3. object with key & html = true
 */
function parse (text) {
    if (!exports.Regex.test(text)) return null
    var m, i, token, match, tokens = []
    /* jshint boss: true */
    while (m = text.match(exports.Regex)) {
        i = m.index
        if (i > 0) tokens.push(text.slice(0, i))
        token = { key: m[1].trim() }
        match = m[0]
        token.html =
            match.charAt(2) === openChar &&
            match.charAt(match.length - 3) === endChar
        tokens.push(token)
        text = text.slice(i + m[0].length)
    }
    if (text.length) tokens.push(text)
    return tokens
}

/**
 *  Parse an attribute value with possible interpolation tags
 *  return a Directive-friendly expression
 *
 *  e.g.  a {{b}} c  =>  "a " + b + " c"
 */
function parseAttr (attr) {
    Directive = Directive || require('./directive')
    var tokens = parse(attr)
    if (!tokens) return null
    if (tokens.length === 1) return tokens[0].key
    var res = [], token
    for (var i = 0, l = tokens.length; i < l; i++) {
        token = tokens[i]
        res.push(
            token.key
                ? inlineFilters(token.key)
                : ('"' + token + '"')
        )
    }
    return res.join('+')
}

/**
 *  Inlines any possible filters in a binding
 *  so that we can combine everything into a huge expression
 */
function inlineFilters (key) {
    if (key.indexOf('|') > -1) {
        var dirs = Directive.parse(key),
            dir = dirs && dirs[0]
        if (dir && dir.filters) {
            key = Directive.inlineFilters(
                dir.key,
                dir.filters
            )
        }
    }
    return '(' + key + ')'
}

exports.parse         = parse
exports.parseAttr     = parseAttr
exports.setDelimiters = setDelimiters
exports.delimiters    = [openChar, endChar]
},{"./directive":62}],81:[function(require,module,exports){
var endEvents  = sniffEndEvents(),
    config     = require('./config'),
    // batch enter animations so we only force the layout once
    Batcher    = require('./batcher'),
    batcher    = new Batcher(),
    // cache timer functions
    setTO      = window.setTimeout,
    clearTO    = window.clearTimeout,
    // exit codes for testing
    codes = {
        CSS_E     : 1,
        CSS_L     : 2,
        JS_E      : 3,
        JS_L      : 4,
        CSS_SKIP  : -1,
        JS_SKIP   : -2,
        JS_SKIP_E : -3,
        JS_SKIP_L : -4,
        INIT      : -5,
        SKIP      : -6
    }

// force layout before triggering transitions/animations
batcher._preFlush = function () {
    /* jshint unused: false */
    var f = document.body.offsetHeight
}

/**
 *  stage:
 *    1 = enter
 *    2 = leave
 */
var transition = module.exports = function (el, stage, cb, compiler) {

    var changeState = function () {
        cb()
        compiler.execHook(stage > 0 ? 'attached' : 'detached')
    }

    if (compiler.init) {
        changeState()
        return codes.INIT
    }

    var hasTransition = el.vue_trans === '',
        hasAnimation  = el.vue_anim === '',
        effectId      = el.vue_effect

    if (effectId) {
        return applyTransitionFunctions(
            el,
            stage,
            changeState,
            effectId,
            compiler
        )
    } else if (hasTransition || hasAnimation) {
        return applyTransitionClass(
            el,
            stage,
            changeState,
            hasAnimation
        )
    } else {
        changeState()
        return codes.SKIP
    }

}

/**
 *  Togggle a CSS class to trigger transition
 */
function applyTransitionClass (el, stage, changeState, hasAnimation) {

    if (!endEvents.trans) {
        changeState()
        return codes.CSS_SKIP
    }

    // if the browser supports transition,
    // it must have classList...
    var onEnd,
        classList        = el.classList,
        existingCallback = el.vue_trans_cb,
        enterClass       = config.enterClass,
        leaveClass       = config.leaveClass,
        endEvent         = hasAnimation ? endEvents.anim : endEvents.trans

    // cancel unfinished callbacks and jobs
    if (existingCallback) {
        el.removeEventListener(endEvent, existingCallback)
        classList.remove(enterClass)
        classList.remove(leaveClass)
        el.vue_trans_cb = null
    }

    if (stage > 0) { // enter

        // set to enter state before appending
        classList.add(enterClass)
        // append
        changeState()
        // trigger transition
        if (!hasAnimation) {
            batcher.push({
                execute: function () {
                    classList.remove(enterClass)
                }
            })
        } else {
            onEnd = function (e) {
                if (e.target === el) {
                    el.removeEventListener(endEvent, onEnd)
                    el.vue_trans_cb = null
                    classList.remove(enterClass)
                }
            }
            el.addEventListener(endEvent, onEnd)
            el.vue_trans_cb = onEnd
        }
        return codes.CSS_E

    } else { // leave

        if (el.offsetWidth || el.offsetHeight) {
            // trigger hide transition
            classList.add(leaveClass)
            onEnd = function (e) {
                if (e.target === el) {
                    el.removeEventListener(endEvent, onEnd)
                    el.vue_trans_cb = null
                    // actually remove node here
                    changeState()
                    classList.remove(leaveClass)
                }
            }
            // attach transition end listener
            el.addEventListener(endEvent, onEnd)
            el.vue_trans_cb = onEnd
        } else {
            // directly remove invisible elements
            changeState()
        }
        return codes.CSS_L
        
    }

}

function applyTransitionFunctions (el, stage, changeState, effectId, compiler) {

    var funcs = compiler.getOption('effects', effectId)
    if (!funcs) {
        changeState()
        return codes.JS_SKIP
    }

    var enter = funcs.enter,
        leave = funcs.leave,
        timeouts = el.vue_timeouts

    // clear previous timeouts
    if (timeouts) {
        var i = timeouts.length
        while (i--) {
            clearTO(timeouts[i])
        }
    }

    timeouts = el.vue_timeouts = []
    function timeout (cb, delay) {
        var id = setTO(function () {
            cb()
            timeouts.splice(timeouts.indexOf(id), 1)
            if (!timeouts.length) {
                el.vue_timeouts = null
            }
        }, delay)
        timeouts.push(id)
    }

    if (stage > 0) { // enter
        if (typeof enter !== 'function') {
            changeState()
            return codes.JS_SKIP_E
        }
        enter(el, changeState, timeout)
        return codes.JS_E
    } else { // leave
        if (typeof leave !== 'function') {
            changeState()
            return codes.JS_SKIP_L
        }
        leave(el, changeState, timeout)
        return codes.JS_L
    }

}

/**
 *  Sniff proper transition end event name
 */
function sniffEndEvents () {
    var el = document.createElement('vue'),
        defaultEvent = 'transitionend',
        events = {
            'webkitTransition' : 'webkitTransitionEnd',
            'transition'       : defaultEvent,
            'mozTransition'    : defaultEvent
        },
        ret = {}
    for (var name in events) {
        if (el.style[name] !== undefined) {
            ret.trans = events[name]
            break
        }
    }
    ret.anim = el.style.animation === ''
        ? 'animationend'
        : 'webkitAnimationEnd'
    return ret
}

// Expose some stuff for testing purposes
transition.codes = codes
transition.sniff = sniffEndEvents
},{"./batcher":57,"./config":60}],82:[function(require,module,exports){
var config       = require('./config'),
    toString     = ({}).toString,
    win          = window,
    console      = win.console,
    def          = Object.defineProperty,
    OBJECT       = 'object',
    THIS_RE      = /[^\w]this[^\w]/,
    BRACKET_RE_S = /\['([^']+)'\]/g,
    BRACKET_RE_D = /\["([^"]+)"\]/g,
    hasClassList = 'classList' in document.documentElement,
    ViewModel // late def

var defer =
    win.requestAnimationFrame ||
    win.webkitRequestAnimationFrame ||
    win.setTimeout

/**
 *  Normalize keypath with possible brackets into dot notations
 */
function normalizeKeypath (key) {
    return key.indexOf('[') < 0
        ? key
        : key.replace(BRACKET_RE_S, '.$1')
             .replace(BRACKET_RE_D, '.$1')
}

var utils = module.exports = {

    /**
     *  Convert a string template to a dom fragment
     */
    toFragment: require('./fragment'),

    /**
     *  Parse the various types of template options
     */
    parseTemplateOption: require('./template-parser.js'),

    /**
     *  get a value from an object keypath
     */
    get: function (obj, key) {
        /* jshint eqeqeq: false */
        key = normalizeKeypath(key)
        if (key.indexOf('.') < 0) {
            return obj[key]
        }
        var path = key.split('.'),
            d = -1, l = path.length
        while (++d < l && obj != null) {
            obj = obj[path[d]]
        }
        return obj
    },

    /**
     *  set a value to an object keypath
     */
    set: function (obj, key, val) {
        /* jshint eqeqeq: false */
        key = normalizeKeypath(key)
        if (key.indexOf('.') < 0) {
            obj[key] = val
            return
        }
        var path = key.split('.'),
            d = -1, l = path.length - 1
        while (++d < l) {
            if (obj[path[d]] == null) {
                obj[path[d]] = {}
            }
            obj = obj[path[d]]
        }
        obj[path[d]] = val
    },

    /**
     *  return the base segment of a keypath
     */
    baseKey: function (key) {
        return key.indexOf('.') > 0
            ? key.split('.')[0]
            : key
    },

    /**
     *  Create a prototype-less object
     *  which is a better hash/map
     */
    hash: function () {
        return Object.create(null)
    },

    /**
     *  get an attribute and remove it.
     */
    attr: function (el, type) {
        var attr = config.prefix + '-' + type,
            val = el.getAttribute(attr)
        if (val !== null) {
            el.removeAttribute(attr)
        }
        return val
    },

    /**
     *  Define an ienumerable property
     *  This avoids it being included in JSON.stringify
     *  or for...in loops.
     */
    defProtected: function (obj, key, val, enumerable, writable) {
        def(obj, key, {
            value        : val,
            enumerable   : enumerable,
            writable     : writable,
            configurable : true
        })
    },

    /**
     *  A less bullet-proof but more efficient type check
     *  than Object.prototype.toString
     */
    isObject: function (obj) {
        return typeof obj === OBJECT && obj && !Array.isArray(obj)
    },

    /**
     *  A more accurate but less efficient type check
     */
    isTrueObject: function (obj) {
        return toString.call(obj) === '[object Object]'
    },

    /**
     *  Most simple bind
     *  enough for the usecase and fast than native bind()
     */
    bind: function (fn, ctx) {
        return function (arg) {
            return fn.call(ctx, arg)
        }
    },

    /**
     *  Make sure null and undefined output empty string
     */
    guard: function (value) {
        /* jshint eqeqeq: false, eqnull: true */
        return value == null
            ? ''
            : (typeof value == 'object')
                ? JSON.stringify(value)
                : value
    },

    /**
     *  When setting value on the VM, parse possible numbers
     */
    checkNumber: function (value) {
        return (isNaN(value) || value === null || typeof value === 'boolean')
            ? value
            : Number(value)
    },

    /**
     *  simple extend
     */
    extend: function (obj, ext) {
        for (var key in ext) {
            if (obj[key] !== ext[key]) {
                obj[key] = ext[key]
            }
        }
        return obj
    },

    /**
     *  filter an array with duplicates into uniques
     */
    unique: function (arr) {
        var hash = utils.hash(),
            i = arr.length,
            key, res = []
        while (i--) {
            key = arr[i]
            if (hash[key]) continue
            hash[key] = 1
            res.push(key)
        }
        return res
    },

    /**
     *  Convert the object to a ViewModel constructor
     *  if it is not already one
     */
    toConstructor: function (obj) {
        ViewModel = ViewModel || require('./viewmodel')
        return utils.isObject(obj)
            ? ViewModel.extend(obj)
            : typeof obj === 'function'
                ? obj
                : null
    },

    /**
     *  Check if a filter function contains references to `this`
     *  If yes, mark it as a computed filter.
     */
    checkFilter: function (filter) {
        if (THIS_RE.test(filter.toString())) {
            filter.computed = true
        }
    },

    /**
     *  convert certain option values to the desired format.
     */
    processOptions: function (options) {
        var components = options.components,
            partials   = options.partials,
            template   = options.template,
            filters    = options.filters,
            key
        if (components) {
            for (key in components) {
                components[key] = utils.toConstructor(components[key])
            }
        }
        if (partials) {
            for (key in partials) {
                partials[key] = utils.parseTemplateOption(partials[key])
            }
        }
        if (filters) {
            for (key in filters) {
                utils.checkFilter(filters[key])
            }
        }
        if (template) {
            options.template = utils.parseTemplateOption(template)
        }
    },

    /**
     *  used to defer batch updates
     */
    nextTick: function (cb) {
        defer(cb, 0)
    },

    /**
     *  add class for IE9
     *  uses classList if available
     */
    addClass: function (el, cls) {
        if (hasClassList) {
            el.classList.add(cls)
        } else {
            var cur = ' ' + el.className + ' '
            if (cur.indexOf(' ' + cls + ' ') < 0) {
                el.className = (cur + cls).trim()
            }
        }
    },

    /**
     *  remove class for IE9
     */
    removeClass: function (el, cls) {
        if (hasClassList) {
            el.classList.remove(cls)
        } else {
            var cur = ' ' + el.className + ' ',
                tar = ' ' + cls + ' '
            while (cur.indexOf(tar) >= 0) {
                cur = cur.replace(tar, ' ')
            }
            el.className = cur.trim()
        }
    },

    /**
     *  Convert an object to Array
     *  used in v-repeat and array filters
     */
    objectToArray: function (obj) {
        var res = [], val, data
        for (var key in obj) {
            val = obj[key]
            data = utils.isObject(val)
                ? val
                : { $value: val }
            data.$key = key
            res.push(data)
        }
        return res
    }
}

enableDebug()
function enableDebug () {
    /**
     *  log for debugging
     */
    utils.log = function (msg) {
        if (config.debug && console) {
            console.log(msg)
        }
    }
    
    /**
     *  warnings, traces by default
     *  can be suppressed by `silent` option.
     */
    utils.warn = function (msg) {
        if (!config.silent && console) {
            console.warn(msg)
            if (config.debug && console.trace) {
                console.trace()
            }
        }
    }
}
},{"./config":60,"./fragment":76,"./template-parser.js":79,"./viewmodel":83}],83:[function(require,module,exports){
var Compiler   = require('./compiler'),
    utils      = require('./utils'),
    transition = require('./transition'),
    Batcher    = require('./batcher'),
    slice      = [].slice,
    def        = utils.defProtected,
    nextTick   = utils.nextTick,

    // batch $watch callbacks
    watcherBatcher = new Batcher(),
    watcherId      = 1

/**
 *  ViewModel exposed to the user that holds data,
 *  computed properties, event handlers
 *  and a few reserved methods
 */
function ViewModel (options) {
    // compile if options passed, if false return. options are passed directly to compiler
    if (options === false) return
    new Compiler(this, options)
}

// All VM prototype methods are inenumerable
// so it can be stringified/looped through as raw data
var VMProto = ViewModel.prototype

/**
 *  init allows config compilation after instantiation:
 *    var a = new Vue(false)
 *    a.init(config)
 */
def(VMProto, '$init', function (options) {
    new Compiler(this, options)
})

/**
 *  Convenience function to get a value from
 *  a keypath
 */
def(VMProto, '$get', function (key) {
    var val = utils.get(this, key)
    return val === undefined && this.$parent
        ? this.$parent.$get(key)
        : val
})

/**
 *  Convenience function to set an actual nested value
 *  from a flat key string. Used in directives.
 */
def(VMProto, '$set', function (key, value) {
    utils.set(this, key, value)
})

/**
 *  watch a key on the viewmodel for changes
 *  fire callback with new value
 */
def(VMProto, '$watch', function (key, callback) {
    // save a unique id for each watcher
    var id = watcherId++,
        self = this
    function on () {
        var args = slice.call(arguments)
        watcherBatcher.push({
            id: id,
            override: true,
            execute: function () {
                callback.apply(self, args)
            }
        })
    }
    callback._fn = on
    self.$compiler.observer.on('change:' + key, on)
})

/**
 *  unwatch a key
 */
def(VMProto, '$unwatch', function (key, callback) {
    // workaround here
    // since the emitter module checks callback existence
    // by checking the length of arguments
    var args = ['change:' + key],
        ob = this.$compiler.observer
    if (callback) args.push(callback._fn)
    ob.off.apply(ob, args)
})

/**
 *  unbind everything, remove everything
 */
def(VMProto, '$destroy', function (noRemove) {
    this.$compiler.destroy(noRemove)
})

/**
 *  broadcast an event to all child VMs recursively.
 */
def(VMProto, '$broadcast', function () {
    var children = this.$compiler.children,
        i = children.length,
        child
    while (i--) {
        child = children[i]
        child.emitter.applyEmit.apply(child.emitter, arguments)
        child.vm.$broadcast.apply(child.vm, arguments)
    }
})

/**
 *  emit an event that propagates all the way up to parent VMs.
 */
def(VMProto, '$dispatch', function () {
    var compiler = this.$compiler,
        emitter = compiler.emitter,
        parent = compiler.parent
    emitter.applyEmit.apply(emitter, arguments)
    if (parent) {
        parent.vm.$dispatch.apply(parent.vm, arguments)
    }
})

/**
 *  delegate on/off/once to the compiler's emitter
 */
;['emit', 'on', 'off', 'once'].forEach(function (method) {
    // internal emit has fixed number of arguments.
    // exposed emit uses the external version
    // with fn.apply.
    var realMethod = method === 'emit'
        ? 'applyEmit'
        : method
    def(VMProto, '$' + method, function () {
        var emitter = this.$compiler.emitter
        emitter[realMethod].apply(emitter, arguments)
    })
})

// DOM convenience methods

def(VMProto, '$appendTo', function (target, cb) {
    target = query(target)
    var el = this.$el
    transition(el, 1, function () {
        target.appendChild(el)
        if (cb) nextTick(cb)
    }, this.$compiler)
})

def(VMProto, '$remove', function (cb) {
    var el = this.$el
    transition(el, -1, function () {
        if (el.parentNode) {
            el.parentNode.removeChild(el)
        }
        if (cb) nextTick(cb)
    }, this.$compiler)
})

def(VMProto, '$before', function (target, cb) {
    target = query(target)
    var el = this.$el
    transition(el, 1, function () {
        target.parentNode.insertBefore(el, target)
        if (cb) nextTick(cb)
    }, this.$compiler)
})

def(VMProto, '$after', function (target, cb) {
    target = query(target)
    var el = this.$el
    transition(el, 1, function () {
        if (target.nextSibling) {
            target.parentNode.insertBefore(el, target.nextSibling)
        } else {
            target.parentNode.appendChild(el)
        }
        if (cb) nextTick(cb)
    }, this.$compiler)
})

function query (el) {
    return typeof el === 'string'
        ? document.querySelector(el)
        : el
}

module.exports = ViewModel

},{"./batcher":57,"./compiler":59,"./transition":81,"./utils":82}],84:[function(require,module,exports){
module.exports = 'body {\n  position: relative;\n}\nui-blueink {\n  top: 0;\n  right: 0;\n  left: 0;\n  text-align: left;\n}\n';
},{}],85:[function(require,module,exports){
require('insert-css')(require('./semantic-ui/css/semantic.css'));
require('insert-css')(require('./main.css'));

var Vue = require('vue');
var PouchDB = require('pouchdb');

var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/blueink');


Vue.component('ui-blueink', {
  data: {
    pages: [],
    content: {
      types: []
    }
  },
  created: function() {
    var self = this;
    db.query('blueink/pages?group=true',
      function(err, response) {
        for (var i = 0; i < response.rows.length; i++) {
          self.pages.push({
            url: response.rows[i].key.join('/')
          });
        }
      });
    db.query('blueink/by_type?group=true',
      function(err, response) {
        self.content.types = response.rows;
      });
  },
  ready: function() {
    document.body.style.top = this.$el.clientHeight + 'px';
  },
  replace: true,
  template: '\
    <ui-blueink class="ui fixed transparent inverted main menu">\
        <menu-pages v-with="pages: pages"></menu-pages>\
        <menu-content v-with="types: content.types"></menu-content>\
    </ui-blueink>',
  components: {
    'menu-pages': require('./menu-pages'),
    'menu-content': require('./menu-content')
  }
});

window.BlueInk = new Vue({
  el: 'body'
});

},{"./main.css":84,"./menu-content":87,"./menu-pages":90,"./semantic-ui/css/semantic.css":92,"insert-css":1,"pouchdb":18,"vue":77}],86:[function(require,module,exports){
module.exports = 'menu-content .item .label {\n  display:none;\n}\n\nmenu-content .item:hover .label {\n  display:block;\n}\n';
},{}],87:[function(require,module,exports){
require('insert-css')(require('./index.css'));

module.exports = {
  replace: true,
  template: require('./template.html'),
  data: {
    types: []
  }
};

},{"./index.css":86,"./template.html":88,"insert-css":1}],88:[function(require,module,exports){
module.exports = '<menu-content class="section ui dropdown simple link item">\n  <h4>Content</h4>\n  <ul class="menu">\n    <li class="item" v-repeat="types">{{key}}\n      <span class="ui small bottom right attached label">{{value}}</span>\n      <ul class="menu">\n        <li class="item">\n          ...content item list will go here...\n        </li>\n      </ul>\n    </li>\n  </ul>\n</menu-content>\n';
},{}],89:[function(require,module,exports){
module.exports = 'menu-pages > nav > h4 {\n  padding: 1em;\n}\n\nmenu-pages > nav > .hide {\n  display: none;\n}\n';
},{}],90:[function(require,module,exports){
require('insert-css')(require('./index.css'));

module.exports = {
  replace: true,
  template: require('./template.html'),
  data: {
    pages: []
  }
};

},{"./index.css":89,"./template.html":91,"insert-css":1}],91:[function(require,module,exports){
module.exports = '<menu-pages class="section ui dropdown simple link item">\n  <h4>Pages</h4>\n  <ul class="menu">\n    <li class="item" v-repeat="pages">\n      <a href="{{url}}">{{url}}</a>\n    </li>\n  </ul>\n</menu-pages>\n';
},{}],92:[function(require,module,exports){
module.exports = '/*\n * # Semantic - Breadcrumb\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n           Breadcrumb\n*******************************/\n.ui.breadcrumb {\n  margin: 1em 0em;\n  display: inline-block;\n  vertical-align: middle;\n}\n.ui.breadcrumb:first-child {\n  margin-top: 0em;\n}\n.ui.breadcrumb:last-child {\n  margin-bottom: 0em;\n}\n/*******************************\n          Content\n*******************************/\n.ui.breadcrumb .divider {\n  display: inline-block;\n  opacity: 0.5;\n  margin: 0em 0.15em 0em;\n  font-size: 1em;\n  color: rgba(0, 0, 0, 0.3);\n}\n.ui.breadcrumb a.section {\n  cursor: pointer;\n}\n.ui.breadcrumb .section {\n  display: inline-block;\n  margin: 0em;\n  padding: 0em;\n}\n/* Loose Coupling */\n.ui.breadcrumb.segment {\n  display: inline-block;\n  padding: 0.5em 1em;\n}\n/*******************************\n            States\n*******************************/\n.ui.breadcrumb .active.section {\n  font-weight: bold;\n}\n/*******************************\n           Variations\n*******************************/\n.ui.small.breadcrumb {\n  font-size: 0.75em;\n}\n.ui.large.breadcrumb {\n  font-size: 1.1em;\n}\n.ui.huge.breadcrumb {\n  font-size: 1.3em;\n}\n\n/*\n * # Semantic - Form\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n           Standard\n*******************************/\n/*--------------------\n        Form\n---------------------*/\n.ui.form {\n  position: relative;\n  max-width: 100%;\n}\n.ui.form :first-child {\n  margin-top: 0em;\n}\n.ui.form :last-child {\n  margin-bottom: 0em;\n}\n/*--------------------\n        Content\n---------------------*/\n.ui.form > p {\n  margin: 1em 0;\n}\n/*--------------------\n        Field\n---------------------*/\n.ui.form .field {\n  clear: both;\n  margin: 0em 0em 1em;\n}\n/*--------------------\n        Labels\n---------------------*/\n.ui.form .field > label {\n  margin: 0em 0em 0.3em;\n  display: block;\n  color: #555555;\n  font-size: 0.875em;\n}\n/*--------------------\n    Standard Inputs\n---------------------*/\n.ui.form textarea,\n.ui.form input[type="text"],\n.ui.form input[type="email"],\n.ui.form input[type="date"],\n.ui.form input[type="password"],\n.ui.form input[type="number"],\n.ui.form input[type="url"],\n.ui.form input[type="tel"],\n.ui.form .ui.input {\n  width: 100%;\n}\n.ui.form textarea,\n.ui.form input[type="text"],\n.ui.form input[type="email"],\n.ui.form input[type="date"],\n.ui.form input[type="password"],\n.ui.form input[type="number"],\n.ui.form input[type="url"],\n.ui.form input[type="tel"] {\n  margin: 0em;\n  padding: 0.65em 1em;\n  font-size: 1em;\n  background-color: #FFFFFF;\n  border: 1px solid rgba(0, 0, 0, 0.15);\n  outline: none;\n  color: rgba(0, 0, 0, 0.7);\n  border-radius: 0.3125em;\n  -webkit-transition: background-color 0.3s ease-out, -webkit-box-shadow 0.2s ease, border-color 0.2s ease;\n  -moz-transition: background-color 0.3s ease-out, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.3s ease-out, box-shadow 0.2s ease, border-color 0.2s ease;\n  -webkit-box-shadow: 0em 0em 0em 0em rgba(0, 0, 0, 0.3) inset;\n  box-shadow: 0em 0em 0em 0em rgba(0, 0, 0, 0.3) inset;\n  -webkit-appearance: none;\n  -webkit-tap-highlight-color: rgba(255, 255, 255, 0);\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.textarea,\n.ui.form textarea {\n  line-height: 1.33;\n  min-height: 8em;\n  height: 12em;\n  max-height: 24em;\n  resize: vertical;\n}\n.ui.form textarea,\n.ui.form input[type="checkbox"] {\n  vertical-align: top;\n}\n/*--------------------\n       Dividers\n---------------------*/\n.ui.form .divider {\n  clear: both;\n  margin: 1em 0em;\n}\n/*--------------------\n   Types of Messages\n---------------------*/\n.ui.form .info.message,\n.ui.form .warning.message,\n.ui.form .error.message {\n  display: none;\n}\n/* Assumptions */\n.ui.form .message:first-child {\n  margin-top: 0px;\n}\n/*--------------------\n   Validation Prompt\n---------------------*/\n.ui.form .field .prompt.label {\n  white-space: nowrap;\n}\n.ui.form .inline.field .prompt {\n  margin-top: 0em;\n  margin-left: 1em;\n}\n.ui.form .inline.field .prompt:before {\n  margin-top: -0.3em;\n  bottom: auto;\n  right: auto;\n  top: 50%;\n  left: 0em;\n}\n/*******************************\n            States\n*******************************/\n/*--------------------\n        Focus\n---------------------*/\n.ui.form input[type="text"]:focus,\n.ui.form input[type="email"]:focus,\n.ui.form input[type="date"]:focus,\n.ui.form input[type="password"]:focus,\n.ui.form input[type="number"]:focus,\n.ui.form input[type="url"]:focus,\n.ui.form input[type="tel"]:focus,\n.ui.form textarea:focus {\n  color: rgba(0, 0, 0, 0.85);\n  border-color: rgba(0, 0, 0, 0.2);\n  border-bottom-left-radius: 0;\n  border-top-left-radius: 0;\n  -webkit-appearance: none;\n  -webkit-box-shadow: 0.3em 0em 0em 0em rgba(0, 0, 0, 0.2) inset;\n  box-shadow: 0.3em 0em 0em 0em rgba(0, 0, 0, 0.2) inset;\n}\n/*--------------------\n        Error\n---------------------*/\n/* On Form */\n.ui.form.warning .warning.message {\n  display: block;\n}\n/*--------------------\n        Warning\n---------------------*/\n/* On Form */\n.ui.form.error .error.message {\n  display: block;\n}\n/* On Field(s) */\n.ui.form .fields.error .field label,\n.ui.form .field.error label,\n.ui.form .fields.error .field .input,\n.ui.form .field.error .input {\n  color: #D95C5C;\n}\n.ui.form .fields.error .field .corner.label,\n.ui.form .field.error .corner.label {\n  border-color: #D95C5C;\n  color: #FFFFFF;\n}\n.ui.form .fields.error .field textarea,\n.ui.form .fields.error .field input[type="text"],\n.ui.form .fields.error .field input[type="email"],\n.ui.form .fields.error .field input[type="date"],\n.ui.form .fields.error .field input[type="password"],\n.ui.form .fields.error .field input[type="number"],\n.ui.form .fields.error .field input[type="url"],\n.ui.form .fields.error .field input[type="tel"],\n.ui.form .field.error textarea,\n.ui.form .field.error input[type="text"],\n.ui.form .field.error input[type="email"],\n.ui.form .field.error input[type="date"],\n.ui.form .field.error input[type="password"],\n.ui.form .field.error input[type="number"],\n.ui.form .field.error input[type="url"],\n.ui.form .field.error input[type="tel"] {\n  background-color: #FFFAFA;\n  border-color: #E7BEBE;\n  border-left: none;\n  color: #D95C5C;\n  padding-left: 1.2em;\n  border-bottom-left-radius: 0;\n  border-top-left-radius: 0;\n  -webkit-box-shadow: 0.3em 0em 0em 0em #D95C5C inset;\n  box-shadow: 0.3em 0em 0em 0em #D95C5C inset;\n}\n.ui.form .field.error textarea:focus,\n.ui.form .field.error input[type="text"]:focus,\n.ui.form .field.error input[type="email"]:focus,\n.ui.form .field.error input[type="date"]:focus,\n.ui.form .field.error input[type="password"]:focus,\n.ui.form .field.error input[type="number"]:focus,\n.ui.form .field.error input[type="url"]:focus,\n.ui.form .field.error input[type="tel"]:focus {\n  border-color: #ff5050;\n  color: #ff5050;\n  -webkit-appearance: none;\n  -webkit-box-shadow: 0.3em 0em 0em 0em #FF5050 inset;\n  box-shadow: 0.3em 0em 0em 0em #FF5050 inset;\n}\n/*----------------------------\n  Dropdown Selection Warning\n-----------------------------*/\n.ui.form .fields.error .field .ui.dropdown,\n.ui.form .fields.error .field .ui.dropdown .item,\n.ui.form .field.error .ui.dropdown,\n.ui.form .field.error .ui.dropdown .item {\n  background-color: #FFFAFA;\n  color: #D95C5C;\n}\n.ui.form .fields.error .field .ui.dropdown,\n.ui.form .field.error .ui.dropdown {\n  -webkit-box-shadow: 0px 0px 0px 1px #E7BEBE !important;\n  box-shadow: 0px 0px 0px 1px #E7BEBE !important;\n}\n.ui.form .fields.error .field .ui.dropdown:hover,\n.ui.form .field.error .ui.dropdown:hover {\n  -webkit-box-shadow: 0px 0px 0px 1px #E7BEBE !important;\n  box-shadow: 0px 0px 0px 1px #E7BEBE !important;\n}\n.ui.form .fields.error .field .ui.dropdown:hover .menu,\n.ui.form .field.error .ui.dropdown:hover .menu {\n  -webkit-box-shadow: 0px 1px 0px 1px #E7BEBE;\n  box-shadow: 0px 1px 0px 1px #E7BEBE;\n}\n.ui.form .fields.error .field .ui.selection.dropdown .menu .item:hover,\n.ui.form .field.error .ui.selection.dropdown .menu .item:hover {\n  background-color: #FFF2F2;\n}\n/* Currently Active Item */\n.ui.form .fields.error .field .ui.dropdown .menu .active.item,\n.ui.form .field.error .ui.dropdown .menu .active.item {\n  background-color: #FDCFCF !important;\n}\n/*--------------------\n  Empty (Placeholder)\n---------------------*/\n/* browsers require these rules separate */\n.ui.form ::-webkit-input-placeholder {\n  color: #AAAAAA;\n}\n.ui.form ::-moz-placeholder {\n  color: #AAAAAA;\n}\n.ui.form :focus::-webkit-input-placeholder {\n  color: #999999;\n}\n.ui.form :focus::-moz-placeholder {\n  color: #999999;\n}\n/* Error Placeholder */\n.ui.form .error ::-webkit-input-placeholder {\n  color: rgba(255, 80, 80, 0.4);\n}\n.ui.form .error ::-moz-placeholder {\n  color: rgba(255, 80, 80, 0.4);\n}\n.ui.form .error :focus::-webkit-input-placeholder {\n  color: rgba(255, 80, 80, 0.7);\n}\n.ui.form .error :focus::-moz-placeholder {\n  color: rgba(255, 80, 80, 0.7);\n}\n/*--------------------\n       Disabled\n---------------------*/\n.ui.form .field :disabled,\n.ui.form .field.disabled {\n  opacity: 0.5;\n}\n.ui.form .field.disabled label {\n  opacity: 0.5;\n}\n.ui.form .field.disabled :disabled {\n  opacity: 1;\n}\n/*--------------------\n     Loading State\n---------------------*/\n/* On Form */\n.ui.form.loading {\n  position: relative;\n}\n.ui.form.loading:after {\n  position: absolute;\n  top: 0%;\n  left: 0%;\n  content: \'\';\n  width: 100%;\n  height: 100%;\n  background: rgba(255, 255, 255, 0.8) url(../images/loader-large.gif) no-repeat 50% 50%;\n  visibility: visible;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------------\n      Fluid Width\n---------------------*/\n.ui.form.fluid {\n  width: 100%;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n/*--------------------------\n  Input w/ attached Button\n---------------------------*/\n.ui.form input.attached {\n  width: auto;\n}\n/*--------------------\n      Date Input\n---------------------*/\n.ui.form .date.field > label {\n  position: relative;\n}\n.ui.form .date.field > label:after {\n  position: absolute;\n  top: 2em;\n  right: 0.5em;\n  font-family: \'Icons\';\n  content: \'\f133\';\n  font-size: 1.2em;\n  font-weight: normal;\n  color: #CCCCCC;\n}\n/*--------------------\n    Inverted Colors\n---------------------*/\n.ui.inverted.form label {\n  color: #FFFFFF;\n}\n.ui.inverted.form .field.error textarea,\n.ui.inverted.form .field.error input[type="text"],\n.ui.inverted.form .field.error input[type="email"],\n.ui.inverted.form .field.error input[type="date"],\n.ui.inverted.form .field.error input[type="password"],\n.ui.inverted.form .field.error input[type="number"],\n.ui.inverted.form .field.error input[type="url"],\n.ui.inverted.form .field.error input[type="tel"] {\n  background-color: #FFCCCC;\n}\n.ui.inverted.form .ui.checkbox label {\n  color: rgba(255, 255, 255, 0.8);\n}\n.ui.inverted.form .ui.checkbox label:hover,\n.ui.inverted.form .ui.checkbox .box:hover {\n  color: #FFFFFF;\n}\n/*--------------------\n     Field Groups\n---------------------*/\n/* Grouped Vertically */\n.ui.form .grouped.fields {\n  margin: 0em 0em 1em;\n}\n.ui.form .grouped.fields .field {\n  display: block;\n  float: none;\n  margin: 0.5em 0em;\n  padding: 0em;\n}\n/*--------------------\n          Fields\n---------------------*/\n/* Split fields */\n.ui.form .fields {\n  clear: both;\n}\n.ui.form .fields:after {\n  content: \' \';\n  display: block;\n  clear: both;\n  visibility: hidden;\n  line-height: 0;\n  height: 0;\n}\n.ui.form .fields > .field {\n  clear: none;\n  float: left;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.form .fields > .field:first-child {\n  border-left: none;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/* Other Combinations */\n.ui.form .two.fields > .fields,\n.ui.form .two.fields > .field {\n  width: 50%;\n  padding-left: 1%;\n  padding-right: 1%;\n}\n.ui.form .three.fields > .fields,\n.ui.form .three.fields > .field {\n  width: 33.333%;\n  padding-left: 1%;\n  padding-right: 1%;\n}\n.ui.form .four.fields > .fields,\n.ui.form .four.fields > .field {\n  width: 25%;\n  padding-left: 1%;\n  padding-right: 1%;\n}\n.ui.form .five.fields > .fields,\n.ui.form .five.fields > .field {\n  width: 20%;\n  padding-left: 1%;\n  padding-right: 1%;\n}\n.ui.form .fields .field:first-child {\n  padding-left: 0%;\n}\n.ui.form .fields .field:last-child {\n  padding-right: 0%;\n}\n/* Fields grid support */\n.ui.form .fields .wide.field {\n  width: 6.25%;\n  padding-left: 1%;\n  padding-right: 1%;\n}\n.ui.form .fields .wide.field:first-child {\n  padding-left: 0%;\n}\n.ui.form .fields .wide.field:last-child {\n  padding-right: 0%;\n}\n.ui.form .fields > .one.wide.field {\n  width: 6.25%;\n}\n.ui.form .fields > .two.wide.field {\n  width: 12.5%;\n}\n.ui.form .fields > .three.wide.field {\n  width: 18.75%;\n}\n.ui.form .fields > .four.wide.field {\n  width: 25%;\n}\n.ui.form .fields > .five.wide.field {\n  width: 31.25%;\n}\n.ui.form .fields > .six.wide.field {\n  width: 37.5%;\n}\n.ui.form .fields > .seven.wide.field {\n  width: 43.75%;\n}\n.ui.form .fields > .eight.wide.field {\n  width: 50%;\n}\n.ui.form .fields > .nine.wide.field {\n  width: 56.25%;\n}\n.ui.form .fields > .ten.wide.field {\n  width: 62.5%;\n}\n.ui.form .fields > .eleven.wide.field {\n  width: 68.75%;\n}\n.ui.form .fields > .twelve.wide.field {\n  width: 75%;\n}\n.ui.form .fields > .thirteen.wide.field {\n  width: 81.25%;\n}\n.ui.form .fields > .fourteen.wide.field {\n  width: 87.5%;\n}\n.ui.form .fields > .fifteen.wide.field {\n  width: 93.75%;\n}\n.ui.form .fields > .sixteen.wide.field {\n  width: 100%;\n}\n/* Swap to full width on mobile */\n@media only screen and (max-width: 767px) {\n  .ui.form .two.fields > .fields,\n  .ui.form .two.fields > .field,\n  .ui.form .three.fields > .fields,\n  .ui.form .three.fields > .field,\n  .ui.form .four.fields > .fields,\n  .ui.form .four.fields > .field,\n  .ui.form .five.fields > .fields,\n  .ui.form .five.fields > .field,\n  .ui.form .fields > .two.wide.field,\n  .ui.form .fields > .three.wide.field,\n  .ui.form .fields > .four.wide.field,\n  .ui.form .fields > .five.wide.field,\n  .ui.form .fields > .six.wide.field,\n  .ui.form .fields > .seven.wide.field,\n  .ui.form .fields > .eight.wide.field,\n  .ui.form .fields > .nine.wide.field,\n  .ui.form .fields > .ten.wide.field,\n  .ui.form .fields > .eleven.wide.field,\n  .ui.form .fields > .twelve.wide.field,\n  .ui.form .fields > .thirteen.wide.field,\n  .ui.form .fields > .fourteen.wide.field,\n  .ui.form .fields > .fifteen.wide.field,\n  .ui.form .fields > .sixteen.wide.field {\n    width: 100%;\n    padding-left: 0%;\n    padding-right: 0%;\n  }\n}\n/*--------------------\n    Inline Fields\n---------------------*/\n.ui.form .inline.fields .field {\n  min-height: 1.3em;\n  margin-right: 0.5em;\n}\n.ui.form .inline.fields .field > label,\n.ui.form .inline.fields .field > p,\n.ui.form .inline.fields .field > .ui.input,\n.ui.form .inline.fields .field > input,\n.ui.form .inline.field > label,\n.ui.form .inline.field > p,\n.ui.form .inline.field > .ui.input,\n.ui.form .inline.field > input {\n  display: inline-block;\n  width: auto;\n  margin-top: 0em;\n  margin-bottom: 0em;\n  vertical-align: middle;\n}\n.ui.form .inline.fields .field > :first-child,\n.ui.form .inline.field > :first-child {\n  margin: 0em 0.5em 0em 0em;\n}\n.ui.form .inline.fields .field > :only-child,\n.ui.form .inline.field > :only-child {\n  margin: 0em;\n}\n/*--------------------\n        Sizes\n---------------------*/\n/* Standard */\n.ui.small.form {\n  font-size: 0.875em;\n}\n.ui.small.form textarea,\n.ui.small.form input[type="text"],\n.ui.small.form input[type="email"],\n.ui.small.form input[type="date"],\n.ui.small.form input[type="password"],\n.ui.small.form input[type="number"],\n.ui.small.form input[type="url"],\n.ui.small.form input[type="tel"],\n.ui.small.form label {\n  font-size: 1em;\n}\n/* Large */\n.ui.large.form {\n  font-size: 1.125em;\n}\n\n/*\n * # Semantic - Grid\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Grid\n*******************************/\n.ui.grid {\n  display: block;\n  text-align: left;\n  font-size: 0em;\n  margin: 0% -1.5%;\n  padding: 0%;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box;\n}\nbody > .ui.grid {\n  margin-left: 0% !important;\n  margin-right: 0% !important;\n}\n.ui.grid:after,\n.ui.row:after {\n  content: ".";\n  display: block;\n  height: 0;\n  clear: both;\n  visibility: hidden;\n}\n/*-------------------\n       Columns\n--------------------*/\n/* Standard 16 column */\n.ui.grid > .column,\n.ui.grid > .row > .column {\n  display: inline-block;\n  text-align: left;\n  font-size: 1rem;\n  width: 6.25%;\n  padding-left: 1.5%;\n  padding-right: 1.5%;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box;\n  vertical-align: top;\n}\n/* Vertical padding when no rows */\n.ui.grid > .column {\n  margin-top: 1rem;\n  margin-bottom: 1rem;\n}\n/*-------------------\n        Rows\n--------------------*/\n.ui.grid > .row {\n  display: block;\n  width: 100% !important;\n  margin-top: 1.5%;\n  padding: 1rem 0% 0%;\n  font-size: 0rem;\n}\n.ui.grid > .row:first-child {\n  padding-top: 0rem;\n  margin-top: 0rem;\n}\n/*-------------------\n      Content\n--------------------*/\n.ui.grid > .row > img,\n.ui.grid > .row > .column > img {\n  max-width: 100%;\n}\n.ui.grid .column > .ui.segment:only-child {\n  margin: 0em;\n}\n/*******************************\n           Variations\n*******************************/\n/*-----------------------\n  Page Grid (Responsive)\n-------------------------*/\n.ui.page.grid {\n  min-width: 320px;\n  margin-left: 0%;\n  margin-right: 0%;\n}\n@media only screen and (max-width: 991px) {\n  .ui.page.grid {\n    padding: 0% 4%;\n  }\n}\n@media only screen and (min-width: 992px) {\n  .ui.page.grid {\n    padding: 0% 8%;\n  }\n}\n@media only screen and (min-width: 1500px) {\n  .ui.page.grid {\n    padding: 0% 13%;\n  }\n}\n@media only screen and (min-width: 1750px) {\n  .ui.page.grid {\n    padding: 0% 18%;\n  }\n}\n@media only screen and (min-width: 2000px) {\n  .ui.page.grid {\n    padding: 0% 23%;\n  }\n}\n/*-------------------\n    Column Width\n--------------------*/\n/* Sizing Combinations */\n.ui.grid > .row > .one.wide.column,\n.ui.grid > .column.row > .one.wide.column,\n.ui.grid > .one.wide.column,\n.ui.column.grid > .one.wide.column {\n  width: 6.25%;\n}\n.ui.grid > .row > .two.wide.column,\n.ui.grid > .column.row > .two.wide.column,\n.ui.grid > .two.wide.column,\n.ui.column.grid > .two.wide.column {\n  width: 12.5%;\n}\n.ui.grid > .row > .three.wide.column,\n.ui.grid > .column.row > .three.wide.column,\n.ui.grid > .three.wide.column,\n.ui.column.grid > .three.wide.column {\n  width: 18.75%;\n}\n.ui.grid > .row > .four.wide.column,\n.ui.grid > .column.row > .four.wide.column,\n.ui.grid > .four.wide.column,\n.ui.column.grid > .four.wide.column {\n  width: 25%;\n}\n.ui.grid > .row > .five.wide.column,\n.ui.grid > .column.row > .five.wide.column,\n.ui.grid > .five.wide.column,\n.ui.column.grid > .five.wide.column {\n  width: 31.25%;\n}\n.ui.grid > .row > .six.wide.column,\n.ui.grid > .column.row > .six.wide.column,\n.ui.grid > .six.wide.column,\n.ui.column.grid > .six.wide.column {\n  width: 37.5%;\n}\n.ui.grid > .row > .seven.wide.column,\n.ui.grid > .column.row > .seven.wide.column,\n.ui.grid > .seven.wide.column,\n.ui.column.grid > .seven.wide.column {\n  width: 43.75%;\n}\n.ui.grid > .row > .eight.wide.column,\n.ui.grid > .column.row > .eight.wide.column,\n.ui.grid > .eight.wide.column,\n.ui.column.grid > .eight.wide.column {\n  width: 50%;\n}\n.ui.grid > .row > .nine.wide.column,\n.ui.grid > .column.row > .nine.wide.column,\n.ui.grid > .nine.wide.column,\n.ui.column.grid > .nine.wide.column {\n  width: 56.25%;\n}\n.ui.grid > .row > .ten.wide.column,\n.ui.grid > .column.row > .ten.wide.column,\n.ui.grid > .ten.wide.column,\n.ui.column.grid > .ten.wide.column {\n  width: 62.5%;\n}\n.ui.grid > .row > .eleven.wide.column,\n.ui.grid > .column.row > .eleven.wide.column,\n.ui.grid > .eleven.wide.column,\n.ui.column.grid > .eleven.wide.column {\n  width: 68.75%;\n}\n.ui.grid > .row > .twelve.wide.column,\n.ui.grid > .column.row > .twelve.wide.column,\n.ui.grid > .twelve.wide.column,\n.ui.column.grid > .twelve.wide.column {\n  width: 75%;\n}\n.ui.grid > .row > .thirteen.wide.column,\n.ui.grid > .column.row > .thirteen.wide.column,\n.ui.grid > .thirteen.wide.column,\n.ui.column.grid > .thirteen.wide.column {\n  width: 81.25%;\n}\n.ui.grid > .row > .fourteen.wide.column,\n.ui.grid > .column.row > .fourteen.wide.column,\n.ui.grid > .fourteen.wide.column,\n.ui.column.grid > .fourteen.wide.column {\n  width: 87.5%;\n}\n.ui.grid > .row > .fifteen.wide.column,\n.ui.grid > .column.row > .fifteen.wide.column,\n.ui.grid > .fifteen.wide.column,\n.ui.column.grid > .fifteen.wide.column {\n  width: 93.75%;\n}\n.ui.grid > .row > .sixteen.wide.column,\n.ui.grid > .column.row > .sixteen.wide.column,\n.ui.grid > .sixteen.wide.column,\n.ui.column.grid > .sixteen.wide.column {\n  width: 100%;\n}\n/*-------------------\n     Column Count\n--------------------*/\n/* Assume full width with one column */\n.ui.one.column.grid > .row > .column,\n.ui.one.column.grid > .column,\n.ui.grid > .one.column.row > .column {\n  width: 100%;\n}\n.ui.two.column.grid > .row > .column,\n.ui.two.column.grid > .column,\n.ui.grid > .two.column.row > .column {\n  width: 50%;\n}\n.ui.three.column.grid > .row > .column,\n.ui.three.column.grid > .column,\n.ui.grid > .three.column.row > .column {\n  width: 33.3333%;\n}\n.ui.four.column.grid > .row > .column,\n.ui.four.column.grid > .column,\n.ui.grid > .four.column.row > .column {\n  width: 25%;\n}\n.ui.five.column.grid > .row > .column,\n.ui.five.column.grid > .column,\n.ui.grid > .five.column.row > .column {\n  width: 20%;\n}\n.ui.six.column.grid > .row > .column,\n.ui.six.column.grid > .column,\n.ui.grid > .six.column.row > .column {\n  width: 16.66667%;\n}\n.ui.seven.column.grid > .row > .column,\n.ui.seven.column.grid > .column,\n.ui.grid > .seven.column.row > .column {\n  width: 14.2857%;\n}\n.ui.eight.column.grid > .row > .column,\n.ui.eight.column.grid > .column,\n.ui.grid > .eight.column.row > .column {\n  width: 12.5%;\n}\n.ui.nine.column.grid > .row > .column,\n.ui.nine.column.grid > .column,\n.ui.grid > .nine.column.row > .column {\n  width: 11.1111%;\n}\n.ui.ten.column.grid > .row > .column,\n.ui.ten.column.grid > .column,\n.ui.grid > .ten.column.row > .column {\n  width: 10%;\n}\n.ui.eleven.column.grid > .row > .column,\n.ui.eleven.column.grid > .column,\n.ui.grid > .eleven.column.row > .column {\n  width: 9.0909%;\n}\n.ui.twelve.column.grid > .row > .column,\n.ui.twelve.column.grid > .column,\n.ui.grid > .twelve.column.row > .column {\n  width: 8.3333%;\n}\n.ui.thirteen.column.grid > .row > .column,\n.ui.thirteen.column.grid > .column,\n.ui.grid > .thirteen.column.row > .column {\n  width: 7.6923%;\n}\n.ui.fourteen.column.grid > .row > .column,\n.ui.fourteen.column.grid > .column,\n.ui.grid > .fourteen.column.row > .column {\n  width: 7.1428%;\n}\n.ui.fifteen.column.grid > .row > .column,\n.ui.fifteen.column.grid > .column,\n.ui.grid > .fifteen.column.row > .column {\n  width: 6.6666%;\n}\n.ui.sixteen.column.grid > .row > .column,\n.ui.sixteen.column.grid > .column,\n.ui.grid > .sixteen.column.row > .column {\n  width: 6.25%;\n}\n/* Assume full width with one column */\n.ui.grid > .column:only-child,\n.ui.grid > .row > .column:only-child {\n  width: 100%;\n}\n/*----------------------\n        Relaxed\n-----------------------*/\n.ui.relaxed.grid {\n  margin: 0% -2.5%;\n}\n.ui.relaxed.grid > .column,\n.ui.relaxed.grid > .row > .column {\n  padding-left: 2.5%;\n  padding-right: 2.5%;\n}\n/*----------------------\n       "Floated"\n-----------------------*/\n.ui.grid .left.floated.column {\n  float: left;\n}\n.ui.grid .right.floated.column {\n  float: right;\n}\n/*----------------------\n        Divided\n-----------------------*/\n.ui.divided.grid,\n.ui.divided.grid > .row {\n  display: table;\n  width: 100%;\n  margin-left: 0% !important;\n  margin-right: 0% !important;\n}\n.ui.divided.grid > .column:not(.row),\n.ui.divided.grid > .row > .column {\n  display: table-cell;\n  -webkit-box-shadow: -1px 0px 0px 0px rgba(0, 0, 0, 0.1), -2px 0px 0px 0px rgba(255, 255, 255, 0.8);\n  box-shadow: -1px 0px 0px 0px rgba(0, 0, 0, 0.1), -2px 0px 0px 0px rgba(255, 255, 255, 0.8);\n}\n.ui.divided.grid > .column.row {\n  display: table;\n}\n.ui.divided.grid > .column:first-child,\n.ui.divided.grid > .row > .column:first-child {\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/* Vertically Divided */\n.ui.vertically.divided.grid > .row {\n  -webkit-box-shadow: 0px -1px 0px 0px rgba(0, 0, 0, 0.1), 0px -2px 0px 0px rgba(255, 255, 255, 0.8) !important;\n  box-shadow: 0px -1px 0px 0px rgba(0, 0, 0, 0.1), 0px -2px 0px 0px rgba(255, 255, 255, 0.8) !important;\n}\n.ui.vertically.divided.grid > .row > .column,\n.ui.vertically.divided.grid > .column:not(.row),\n.ui.vertically.divided.grid > .row:first-child {\n  -webkit-box-shadow: none !important;\n  box-shadow: none !important;\n}\n/*----------------------\n         Celled\n-----------------------*/\n.ui.celled.grid {\n  display: table;\n  width: 100%;\n  margin-left: 0% !important;\n  margin-right: 0% !important;\n  -webkit-box-shadow: 0px 0px 0px 1px #DFDFDF;\n  box-shadow: 0px 0px 0px 1px #DFDFDF;\n}\n.ui.celled.grid > .row,\n.ui.celled.grid > .column.row,\n.ui.celled.grid > .column.row:first-child {\n  display: table;\n  width: 100%;\n  margin-top: 0em;\n  padding-top: 0em;\n  -webkit-box-shadow: 0px -1px 0px 0px #dfdfdf;\n  box-shadow: 0px -1px 0px 0px #dfdfdf;\n}\n.ui.celled.grid > .column:not(.row),\n.ui.celled.grid > .row > .column {\n  display: table-cell;\n  padding: 0.75em;\n  -webkit-box-shadow: -1px 0px 0px 0px #dfdfdf;\n  box-shadow: -1px 0px 0px 0px #dfdfdf;\n}\n.ui.celled.grid > .column:first-child,\n.ui.celled.grid > .row > .column:first-child {\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.celled.page.grid {\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*----------------------\n  Horizontally Centered\n-----------------------*/\n/* Vertical Centered */\n.ui.left.aligned.grid,\n.ui.left.aligned.grid > .row > .column,\n.ui.left.aligned.grid > .column,\n.ui.grid .left.aligned.column,\n.ui.grid > .left.aligned.row > .column {\n  text-align: left;\n}\n.ui.center.aligned.grid,\n.ui.center.aligned.grid > .row > .column,\n.ui.center.aligned.grid > .column,\n.ui.grid .center.aligned.column,\n.ui.grid > .center.aligned.row > .column {\n  text-align: center;\n}\n.ui.right.aligned.grid,\n.ui.right.aligned.grid > .row > .column,\n.ui.right.aligned.grid > .column,\n.ui.grid .right.aligned.column,\n.ui.grid > .right.aligned.row > .column {\n  text-align: right;\n}\n.ui.justified.grid,\n.ui.justified.grid > .row > .column,\n.ui.justified.grid > .column,\n.ui.grid .justified.column,\n.ui.grid > .justified.row > .column {\n  text-align: justify;\n  -webkit-hyphens: auto;\n  -moz-hyphens: auto;\n  -ms-hyphens: auto;\n  hyphens: auto;\n}\n/*----------------------\n  Vertically Centered\n-----------------------*/\n/* Vertical Centered */\n.ui.top.aligned.grid,\n.ui.top.aligned.grid > .row > .column,\n.ui.top.aligned.grid > .column,\n.ui.grid .top.aligned.column,\n.ui.grid > .top.aligned.row > .column {\n  vertical-align: top;\n}\n.ui.middle.aligned.grid,\n.ui.middle.aligned.grid > .row > .column,\n.ui.middle.aligned.grid > .column,\n.ui.grid .middle.aligned.column,\n.ui.grid > .middle.aligned.row > .column {\n  vertical-align: middle;\n}\n.ui.bottom.aligned.grid,\n.ui.bottom.aligned.grid > .row > .column,\n.ui.bottom.aligned.grid > .column,\n.ui.grid .bottom.aligned.column,\n.ui.grid > .bottom.aligned.row > .column {\n  vertical-align: bottom;\n}\n/*----------------------\n  Equal Height Columns\n-----------------------*/\n.ui.grid > .equal.height.row {\n  display: table;\n  width: 100%;\n}\n.ui.grid > .equal.height.row > .column {\n  display: table-cell;\n}\n/*----------------------\n     Only (Device)\n-----------------------*/\n/* Mobile Only */\n@media only screen and (max-width: 767px) {\n  .ui.mobile.only.grid,\n  .ui.grid > .mobile.only.row {\n    display: block !important;\n  }\n  .ui.grid > .row > .mobile.only.column {\n    display: inline-block !important;\n  }\n  .ui.divided.mobile.only.grid,\n  .ui.celled.mobile.only.grid,\n  .ui.divided.mobile.only.grid .row,\n  .ui.celled.mobile.only.grid .row,\n  .ui.divided.grid .mobile.only.row,\n  .ui.celled.grid .mobile.only.row,\n  .ui.grid .mobile.only.equal.height.row,\n  .ui.mobile.only.grid .equal.height.row {\n    display: table !important;\n  }\n  .ui.divided.grid > .row > .mobile.only.column,\n  .ui.celled.grid > .row > .mobile.only.column,\n  .ui.divided.mobile.only.grid > .row > .column,\n  .ui.celled.mobile.only.grid > .row > .column,\n  .ui.divided.mobile.only.grid > .column,\n  .ui.celled.mobile.only.grid > .column {\n    display: table-cell !important;\n  }\n}\n@media only screen and (min-width: 768px) {\n  .ui.mobile.only.grid,\n  .ui.grid > .mobile.only.row,\n  .ui.grid > .mobile.only.column,\n  .ui.grid > .row > .mobile.only.column {\n    display: none;\n  }\n}\n/* Tablet Only */\n@media only screen and (min-width: 768px) and (max-width: 991px) {\n  .ui.tablet.only.grid,\n  .ui.grid > .tablet.only.row {\n    display: block !important;\n  }\n  .ui.grid > .row > .tablet.only.column {\n    display: inline-block !important;\n  }\n  .ui.divided.tablet.only.grid,\n  .ui.celled.tablet.only.grid,\n  .ui.divided.tablet.only.grid .row,\n  .ui.celled.tablet.only.grid .row,\n  .ui.divided.grid .tablet.only.row,\n  .ui.celled.grid .tablet.only.row,\n  .ui.grid .tablet.only.equal.height.row,\n  .ui.tablet.only.grid .equal.height.row {\n    display: table !important;\n  }\n  .ui.divided.grid > .row > .tablet.only.column,\n  .ui.celled.grid > .row > .tablet.only.column,\n  .ui.divided.tablet.only.grid > .row > .column,\n  .ui.celled.tablet.only.grid > .row > .column,\n  .ui.divided.tablet.only.grid > .column,\n  .ui.celled.tablet.only.grid > .column {\n    display: table-cell !important;\n  }\n}\n@media only screen and (max-width: 767px), (min-width: 992px) {\n  .ui.tablet.only.grid,\n  .ui.grid > .tablet.only.row,\n  .ui.grid > .tablet.only.column,\n  .ui.grid > .row > .tablet.only.column {\n    display: none;\n  }\n}\n/* Computer Only */\n@media only screen and (min-width: 992px) {\n  .ui.computer.only.grid,\n  .ui.grid > .computer.only.row {\n    display: block !important;\n  }\n  .ui.grid > .row > .computer.only.column {\n    display: inline-block !important;\n  }\n  .ui.divided.computer.only.grid,\n  .ui.celled.computer.only.grid,\n  .ui.divided.computer.only.grid .row,\n  .ui.celled.computer.only.grid .row,\n  .ui.divided.grid .computer.only.row,\n  .ui.celled.grid .computer.only.row,\n  .ui.grid .computer.only.equal.height.row,\n  .ui.computer.only.grid .equal.height.row {\n    display: table !important;\n  }\n  .ui.divided.grid > .row > .computer.only.column,\n  .ui.celled.grid > .row > .computer.only.column,\n  .ui.divided.computer.only.grid > .row > .column,\n  .ui.celled.computer.only.grid > .row > .column,\n  .ui.divided.computer.only.grid > .column,\n  .ui.celled.computer.only.grid > .column {\n    display: table-cell !important;\n  }\n}\n@media only screen and (max-width: 991px) {\n  .ui.computer.only.grid,\n  .ui.grid > .computer.only.row,\n  .ui.grid > .computer.only.column,\n  .ui.grid > .row > .computer.only.column {\n    display: none;\n  }\n}\n/*-------------------\n      Doubling\n--------------------*/\n/* Mobily Only */\n@media only screen and (max-width: 767px) {\n  .ui.two.column.doubling.grid > .row > .column,\n  .ui.two.column.doubling.grid > .column,\n  .ui.grid > .two.column.doubling.row > .column {\n    width: 100%;\n  }\n  .ui.three.column.doubling.grid > .row > .column,\n  .ui.three.column.doubling.grid > .column,\n  .ui.grid > .three.column.doubling.row > .column {\n    width: 100%;\n  }\n  .ui.four.column.doubling.grid > .row > .column,\n  .ui.four.column.doubling.grid > .column,\n  .ui.grid > .four.column.doubling.row > .column {\n    width: 100%;\n  }\n  .ui.five.column.doubling.grid > .row > .column,\n  .ui.five.column.doubling.grid > .column,\n  .ui.grid > .five.column.doubling.row > .column {\n    width: 100%;\n  }\n  .ui.six.column.doubling.grid > .row > .column,\n  .ui.six.column.doubling.grid > .column,\n  .ui.grid > .six.column.doubling.row > .column {\n    width: 50%;\n  }\n  .ui.seven.column.doubling.grid > .row > .column,\n  .ui.seven.column.doubling.grid > .column,\n  .ui.grid > .seven.column.doubling.row > .column {\n    width: 50%;\n  }\n  .ui.eight.column.doubling.grid > .row > .column,\n  .ui.eight.column.doubling.grid > .column,\n  .ui.grid > .eight.column.doubling.row > .column {\n    width: 50%;\n  }\n  .ui.nine.column.doubling.grid > .row > .column,\n  .ui.nine.column.doubling.grid > .column,\n  .ui.grid > .nine.column.doubling.row > .column {\n    width: 50%;\n  }\n  .ui.ten.column.doubling.grid > .row > .column,\n  .ui.ten.column.doubling.grid > .column,\n  .ui.grid > .ten.column.doubling.row > .column {\n    width: 50%;\n  }\n  .ui.twelve.column.doubling.grid > .row > .column,\n  .ui.twelve.column.doubling.grid > .column,\n  .ui.grid > .twelve.column.doubling.row > .column {\n    width: 33.3333333333333%;\n  }\n  .ui.fourteen.column.doubling.grid > .row > .column,\n  .ui.fourteen.column.doubling.grid > .column,\n  .ui.grid > .fourteen.column.doubling.row > .column {\n    width: 33.3333333333333%;\n  }\n  .ui.sixteen.column.doubling.grid > .row > .column,\n  .ui.sixteen.column.doubling.grid > .column,\n  .ui.grid > .sixteen.column.doubling.row > .column {\n    width: 25%;\n  }\n}\n/* Tablet Only */\n@media only screen and (min-width: 768px) and (max-width: 991px) {\n  .ui.two.column.doubling.grid > .row > .column,\n  .ui.two.column.doubling.grid > .column,\n  .ui.grid > .two.column.doubling.row > .column {\n    width: 100%;\n  }\n  .ui.three.column.doubling.grid > .row > .column,\n  .ui.three.column.doubling.grid > .column,\n  .ui.grid > .three.column.doubling.row > .column {\n    width: 50%;\n  }\n  .ui.four.column.doubling.grid > .row > .column,\n  .ui.four.column.doubling.grid > .column,\n  .ui.grid > .four.column.doubling.row > .column {\n    width: 50%;\n  }\n  .ui.five.column.doubling.grid > .row > .column,\n  .ui.five.column.doubling.grid > .column,\n  .ui.grid > .five.column.doubling.row > .column {\n    width: 33.3333333%;\n  }\n  .ui.six.column.doubling.grid > .row > .column,\n  .ui.six.column.doubling.grid > .column,\n  .ui.grid > .six.column.doubling.row > .column {\n    width: 33.3333333%;\n  }\n  .ui.eight.column.doubling.grid > .row > .column,\n  .ui.eight.column.doubling.grid > .column,\n  .ui.grid > .eight.column.doubling.row > .column {\n    width: 33.3333333%;\n  }\n  .ui.eight.column.doubling.grid > .row > .column,\n  .ui.eight.column.doubling.grid > .column,\n  .ui.grid > .eight.column.doubling.row > .column {\n    width: 25%;\n  }\n  .ui.nine.column.doubling.grid > .row > .column,\n  .ui.nine.column.doubling.grid > .column,\n  .ui.grid > .nine.column.doubling.row > .column {\n    width: 25%;\n  }\n  .ui.ten.column.doubling.grid > .row > .column,\n  .ui.ten.column.doubling.grid > .column,\n  .ui.grid > .ten.column.doubling.row > .column {\n    width: 20%;\n  }\n  .ui.twelve.column.doubling.grid > .row > .column,\n  .ui.twelve.column.doubling.grid > .column,\n  .ui.grid > .twelve.column.doubling.row > .column {\n    width: 16.6666666%;\n  }\n  .ui.fourteen.column.doubling.grid > .row > .column,\n  .ui.fourteen.column.doubling.grid > .column,\n  .ui.grid > .fourteen.column.doubling.row > .column {\n    width: 14.28571428571429%;\n  }\n  .ui.sixteen.column.doubling.grid > .row > .column,\n  .ui.sixteen.column.doubling.grid > .column,\n  .ui.grid > .sixteen.column.doubling.row > .column {\n    width: 12.5%;\n  }\n}\n/*-------------------\n      Stackable\n--------------------*/\n@media only screen and (max-width: 767px) {\n  .ui.stackable.grid {\n    display: block !important;\n    padding: 0em;\n    margin: 0em;\n  }\n  .ui.stackable.grid > .row > .column,\n  .ui.stackable.grid > .column {\n    display: block !important;\n    width: auto !important;\n    margin: 1em 0em 0em !important;\n    padding: 1em 0em 0em !important;\n    -webkit-box-shadow: none !important;\n    box-shadow: none !important;\n  }\n  .ui.stackable.divided.grid .column,\n  .ui.stackable.celled.grid .column {\n    border-top: 1px dotted rgba(0, 0, 0, 0.1);\n  }\n  .ui.stackable.grid > .row:first-child > .column:first-child,\n  .ui.stackable.grid > .column:first-child {\n    margin-top: 0em !important;\n    padding-top: 0em !important;\n  }\n  .ui.stackable.divided.grid > .row:first-child > .column:first-child,\n  .ui.stackable.celled.grid > .row:first-child > .column:first-child,\n  .ui.stackable.divided.grid > .column:first-child,\n  .ui.stackable.celled.grid > .column:first-child {\n    border-top: none !important;\n  }\n  .ui.stackable.page.grid > .row > .column,\n  .ui.stackable.page.grid > .column {\n    padding-left: 1em !important;\n    padding-right: 1em !important;\n  }\n  /* Remove pointers from vertical menus */\n  .ui.stackable.grid .vertical.pointing.menu .item:after {\n    display: none;\n  }\n}\n\n/*\n * # Semantic - Menu\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Standard\n*******************************/\n/*--------------\n      Menu\n---------------*/\n.ui.menu {\n  margin: 1rem 0rem;\n  background-color: #FFFFFF;\n  font-size: 0px;\n  font-weight: normal;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  border-radius: 0.1875rem;\n}\n.ui.menu:first-child {\n  margin-top: 0rem;\n}\n.ui.menu:last-child {\n  margin-bottom: 0rem;\n}\n.ui.menu:after {\n  content: ".";\n  display: block;\n  height: 0;\n  clear: both;\n  visibility: hidden;\n}\n.ui.menu > .item:first-child {\n  border-radius: 0.1875em 0px 0px 0.1875em;\n}\n.ui.menu > .item:last-child {\n  border-radius: 0px 0.1875em 0.1875em 0px;\n}\n.ui.menu .item {\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);\n  vertical-align: middle;\n  line-height: 1;\n  text-decoration: none;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  -webkit-transition: opacity 0.2s ease, background 0.2s ease, -webkit-box-shadow 0.2s ease;\n  -moz-transition: opacity 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;\n  transition: opacity 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;\n}\n/*--------------\n    Colors\n---------------*/\n/* Text Color */\n.ui.menu .item,\n.ui.menu .item > a:not(.button) {\n  color: rgba(0, 0, 0, 0.75);\n}\n.ui.menu .item .item,\n.ui.menu .item .item > a:not(.button) {\n  color: rgba(30, 30, 30, 0.7);\n}\n.ui.menu .item .item .item,\n.ui.menu .item .item .item > a:not(.button) {\n  color: rgba(30, 30, 30, 0.6);\n}\n.ui.menu .dropdown .menu .item,\n.ui.menu .dropdown .menu .item a:not(.button) {\n  color: rgba(0, 0, 0, 0.75);\n}\n/* Hover */\n.ui.menu .item .menu a.item:hover,\n.ui.menu .item .menu .link.item:hover {\n  color: rgba(0, 0, 0, 0.85);\n}\n.ui.menu .dropdown .menu .item a:not(.button):hover {\n  color: rgba(0, 0, 0, 0.85);\n}\n/* Active */\n.ui.menu .active.item,\n.ui.menu .active.item a:not(.button) {\n  color: rgba(0, 0, 0, 0.85);\n  border-radius: 0px;\n}\n/*--------------\n      Items\n---------------*/\n.ui.menu .item {\n  position: relative;\n  display: inline-block;\n  padding: 0.83em 0.95em;\n  border-top: 0em solid rgba(0, 0, 0, 0);\n  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);\n  -moz-user-select: -moz-none;\n  -khtml-user-select: none;\n  -webkit-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n}\n.ui.menu .menu {\n  margin: 0em;\n}\n.ui.menu .item.left,\n.ui.menu .menu.left {\n  float: left;\n}\n.ui.menu .item.right,\n.ui.menu .menu.right {\n  float: right;\n}\n/*--------------\n    Borders\n---------------*/\n.ui.menu .item:before {\n  position: absolute;\n  content: \'\';\n  top: 0%;\n  left: 0px;\n  width: 1px;\n  height: 100%;\n  background-image: -webkit-gradient(linear, left top, left bottom, from(rgba(0, 0, 0, 0.05)), color-stop(50%, rgba(0, 0, 0, 0.1)), to(rgba(0, 0, 0, 0.05)));\n  background-image: -webkit-linear-gradient(rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.1) 50%, rgba(0, 0, 0, 0.05) 100%);\n  background-image: -moz-linear-gradient(rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.1) 50%, rgba(0, 0, 0, 0.05) 100%);\n  background-image: linear-gradient(rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.1) 50%, rgba(0, 0, 0, 0.05) 100%);\n}\n.ui.menu > .menu:not(.right):first-child > .item:first-child:before,\n.ui.menu .item:first-child:before {\n  display: none;\n}\n.ui.menu .menu.right .item:before,\n.ui.menu .item.right:before {\n  right: auto;\n  left: 0px;\n}\n/*--------------\n  Text Content\n---------------*/\n.ui.menu .text.item > *,\n.ui.menu .item > p:only-child {\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n  line-height: 1.3;\n  color: rgba(0, 0, 0, 0.6);\n}\n.ui.menu .item > p:first-child {\n  margin-top: 0px;\n}\n.ui.menu .item > p:last-child {\n  margin-bottom: 0px;\n}\n/*--------------\n     Button\n---------------*/\n.ui.menu:not(.vertical) .item > .button {\n  position: relative;\n  top: -0.05em;\n  margin: -0.55em 0;\n  padding-bottom: 0.55em;\n  padding-top: 0.55em;\n  font-size: 0.875em;\n}\n/*--------------\n     Inputs\n---------------*/\n.ui.menu:not(.vertical) .item > .input {\n  margin-top: -0.85em;\n  margin-bottom: -0.85em;\n  padding-top: 0.3em;\n  padding-bottom: 0.3em;\n  width: 100%;\n  vertical-align: top;\n}\n.ui.menu .item > .input input {\n  padding-top: 0.35em;\n  padding-bottom: 0.35em;\n}\n.ui.vertical.menu .item > .input input {\n  margin: 0em;\n  padding-top: 0.63em;\n  padding-bottom: 0.63em;\n}\n/* Action Input */\n.ui.menu:not(.vertical) .item > .button.labeled > .icon {\n  padding-top: 0.6em;\n}\n.ui.menu:not(.vertical) .item .action.input > .button {\n  font-size: 0.8em;\n  padding: 0.55em 0.8em;\n}\n/* Resizes */\n.ui.small.menu:not(.vertical) .item > .input input {\n  padding-top: 0.4em;\n  padding-bottom: 0.4em;\n}\n.ui.large.menu:not(.vertical) .item > .input input {\n  top: -0.125em;\n  padding-bottom: 0.6em;\n  padding-top: 0.6em;\n}\n.ui.large.menu:not(.vertical) .item .action.input > .button {\n  font-size: 0.8em;\n  padding: 0.9em;\n}\n.ui.large.menu:not(.vertical) .item .action.input > .button > .icon {\n  padding-top: 0.8em;\n}\n/*--------------\n     Header\n---------------*/\n.ui.menu .header.item {\n  background-color: rgba(0, 0, 0, 0.04);\n  margin: 0em;\n}\n.ui.vertical.menu .header.item {\n  font-weight: bold;\n}\n/*--------------\n    Dropdowns\n---------------*/\n.ui.menu .dropdown .menu .item .icon {\n  float: none;\n  margin: 0em 0.75em 0em 0em;\n}\n.ui.menu .dropdown.item .menu {\n  left: 1px;\n  margin: 0px;\n  min-width: -webkit-calc(99%);\n  min-width: -moz-calc(99%);\n  min-width: calc(99%);\n  -webkit-box-shadow: 0 1px 1px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0 1px 1px 1px rgba(0, 0, 0, 0.1);\n}\n.ui.secondary.menu .dropdown.item .menu {\n  left: 0px;\n  min-width: 100%;\n}\n.ui.menu .pointing.dropdown.item .menu {\n  margin-top: 0.75em;\n}\n.ui.menu .simple.dropdown.item .menu {\n  margin: 0px !important;\n}\n.ui.menu .dropdown.item .menu .item {\n  width: 100%;\n  color: rgba(0, 0, 0, 0.75);\n}\n.ui.menu .dropdown.item .menu .active.item {\n  -webkit-box-shadow: none !important;\n  box-shadow: none !important;\n}\n.ui.menu .ui.dropdown .menu .item:before {\n  display: none;\n}\n/*--------------\n     Labels\n---------------*/\n.ui.menu .item > .label {\n  background-color: rgba(0, 0, 0, 0.35);\n  color: #FFFFFF;\n  margin: -0.15em 0em -0.15em 0.5em;\n  padding: 0.3em 0.8em;\n  vertical-align: baseline;\n}\n.ui.menu .item > .floating.label {\n  padding: 0.3em 0.8em;\n}\n/*--------------\n      Images\n---------------*/\n.ui.menu .item > img:only-child {\n  display: block;\n  max-width: 100%;\n  margin: 0em auto;\n}\n/*******************************\n             States\n*******************************/\n/*--------------\n      Hover\n---------------*/\n.ui.link.menu .item:hover,\n.ui.menu .link.item:hover,\n.ui.menu a.item:hover,\n.ui.menu .ui.dropdown .menu .item:hover {\n  cursor: pointer;\n  background-color: rgba(0, 0, 0, 0.02);\n}\n.ui.menu .ui.dropdown.item.active {\n  background-color: rgba(0, 0, 0, 0.02);\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  -moz-border-bottom-right-radius: 0em;\n  border-bottom-right-radius: 0em;\n  -moz-border-bottom-left-radius: 0em;\n  border-bottom-left-radius: 0em;\n}\n/*--------------\n      Down\n---------------*/\n.ui.link.menu .item:active,\n.ui.menu .link.item:active,\n.ui.menu a.item:active,\n.ui.menu .ui.dropdown .menu .item:active {\n  background-color: rgba(0, 0, 0, 0.05);\n}\n/*--------------\n     Active\n---------------*/\n.ui.menu .active.item {\n  background-color: rgba(0, 0, 0, 0.01);\n  color: rgba(0, 0, 0, 0.95);\n  -webkit-box-shadow: 0em 0.2em 0em inset;\n  box-shadow: 0em 0.2em 0em inset;\n}\n.ui.vertical.menu .active.item {\n  border-radius: 0em;\n  -webkit-box-shadow: 0.2em 0em 0em inset;\n  box-shadow: 0.2em 0em 0em inset;\n}\n.ui.vertical.menu > .active.item:first-child {\n  border-radius: 0em 0.1875em 0em 0em;\n}\n.ui.vertical.menu > .active.item:last-child {\n  border-radius: 0em 0em 0.1875em 0em;\n}\n.ui.vertical.menu > .active.item:only-child {\n  border-radius: 0em 0.1875em 0.1875em 0em;\n}\n.ui.vertical.menu .active.item .menu .active.item {\n  border-left: none;\n}\n.ui.vertical.menu .active.item .menu .active.item {\n  padding-left: 1.5rem;\n}\n.ui.vertical.menu .item .menu .active.item {\n  background-color: rgba(0, 0, 0, 0.03);\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*--------------\n     Disabled\n---------------*/\n.ui.menu .item.disabled,\n.ui.menu .item.disabled:hover {\n  cursor: default;\n  color: rgba(0, 0, 0, 0.2);\n  background-color: transparent !important;\n}\n/*--------------------\n     Loading\n---------------------*/\n/* On Form */\n.ui.menu.loading {\n  position: relative;\n}\n.ui.menu.loading:after {\n  position: absolute;\n  top: 0%;\n  left: 0%;\n  content: \'\';\n  width: 100%;\n  height: 100%;\n  background: rgba(255, 255, 255, 0.8) url(../images/loader-large.gif) no-repeat 50% 50%;\n  visibility: visible;\n}\n/*******************************\n             Types\n*******************************/\n/*--------------\n    Vertical\n---------------*/\n.ui.vertical.menu .item {\n  display: block;\n  height: auto !important;\n  border-top: none;\n  border-left: 0em solid rgba(0, 0, 0, 0);\n  border-right: none;\n}\n.ui.vertical.menu > .item:first-child {\n  border-radius: 0.1875em 0.1875em 0px 0px;\n}\n.ui.vertical.menu > .item:last-child {\n  border-radius: 0px 0px 0.1875em 0.1875em;\n}\n.ui.vertical.menu .item > .label {\n  float: right;\n  text-align: center;\n}\n.ui.vertical.menu .item > i.icon {\n  float: right;\n  width: 1.22em;\n  margin: 0em 0em 0em 0.5em;\n}\n.ui.vertical.menu .item > .label + i.icon {\n  float: none;\n  margin: 0em 0.25em 0em 0em;\n}\n/*--- Border ---*/\n.ui.vertical.menu .item:before {\n  position: absolute;\n  content: \'\';\n  top: 0%;\n  left: 0px;\n  width: 100%;\n  height: 1px;\n  background-image: -webkit-linear-gradient(left, rgba(0, 0, 0, 0.03) 0%, rgba(0, 0, 0, 0.1) 1.5em, rgba(0, 0, 0, 0.03) 100%);\n  background-image: -moz-linear-gradient(left, rgba(0, 0, 0, 0.03) 0%, rgba(0, 0, 0, 0.1) 1.5em, rgba(0, 0, 0, 0.03) 100%);\n  background-image: -webkit-gradient(linear, left top, right top, from(rgba(0, 0, 0, 0.03)), color-stop(1.5em, rgba(0, 0, 0, 0.1)), to(rgba(0, 0, 0, 0.03)));\n  background-image: linear-gradient(to right, rgba(0, 0, 0, 0.03) 0%, rgba(0, 0, 0, 0.1) 1.5em, rgba(0, 0, 0, 0.03) 100%);\n}\n.ui.vertical.menu .item:first-child:before {\n  background-image: none !important;\n}\n/*--- Dropdown ---*/\n.ui.vertical.menu .dropdown.item > i {\n  float: right;\n  content: "\f0da";\n}\n.ui.vertical.menu .dropdown.item .menu {\n  top: 0% !important;\n  left: 100%;\n  margin: 0px 0px 0px 1px;\n  -webkit-box-shadow: 0 0px 1px 1px #DDDDDD;\n  box-shadow: 0 0px 1px 1px #DDDDDD;\n}\n.ui.vertical.menu .dropdown.item.active {\n  border-top-right-radius: 0em;\n  border-bottom-right-radius: 0em;\n}\n.ui.vertical.menu .dropdown.item .menu .item {\n  font-size: 1rem;\n}\n.ui.vertical.menu .dropdown.item .menu .item i.icon {\n  margin-right: 0em;\n}\n.ui.vertical.menu .dropdown.item.active {\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*--- Sub Menu ---*/\n.ui.vertical.menu .item > .menu {\n  margin: 0.5em -0.95em 0em;\n}\n.ui.vertical.menu .item > .menu > .item {\n  padding: 0.5rem 1.5rem;\n  font-size: 0.875em;\n}\n.ui.vertical.menu .item > .menu > .item:before {\n  display: none;\n}\n/*--------------\n     Tiered\n---------------*/\n.ui.tiered.menu > .sub.menu > .item {\n  color: rgba(0, 0, 0, 0.4);\n}\n.ui.tiered.menu > .menu > .item:hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.tiered.menu .item.active {\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.tiered.menu > .menu .item.active:after {\n  position: absolute;\n  content: \'\';\n  margin-top: -1px;\n  top: 100%;\n  left: 0px;\n  width: 100%;\n  height: 2px;\n  background-color: #FBFBFB;\n}\n.ui.tiered.menu .sub.menu {\n  background-color: rgba(0, 0, 0, 0.01);\n  border-radius: 0em;\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  color: #FFFFFF;\n}\n.ui.tiered.menu .sub.menu .item {\n  font-size: 0.875rem;\n}\n.ui.tiered.menu .sub.menu .item:before {\n  background-image: none;\n}\n.ui.tiered.menu .sub.menu .active.item {\n  padding-top: 0.83em;\n  background-color: transparent;\n  border-radius: 0 0 0 0;\n  border-top: medium none;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  color: rgba(0, 0, 0, 0.7) !important;\n}\n.ui.tiered.menu .sub.menu .active.item:after {\n  display: none;\n}\n/* Inverted */\n.ui.inverted.tiered.menu > .menu > .item {\n  color: rgba(255, 255, 255, 0.5);\n}\n.ui.inverted.tiered.menu .sub.menu {\n  background-color: rgba(0, 0, 0, 0.2);\n}\n.ui.inverted.tiered.menu .sub.menu .item {\n  color: rgba(255, 255, 255, 0.6);\n}\n.ui.inverted.tiered.menu > .menu > .item:hover {\n  color: rgba(255, 255, 255, 0.9);\n}\n.ui.inverted.tiered.menu .active.item:after {\n  display: none;\n}\n.ui.inverted.tiered.menu > .sub.menu > .active.item,\n.ui.inverted.tiered.menu > .menu > .active.item {\n  color: #ffffff !important;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/* Tiered pointing */\n.ui.pointing.tiered.menu > .menu > .item:after {\n  display: none;\n}\n.ui.pointing.tiered.menu > .sub.menu > .item:after {\n  display: block;\n}\n/*--------------\n     Tabular\n---------------*/\n.ui.tabular.menu {\n  background-color: transparent;\n  border-bottom: 1px solid #DCDDDE;\n  border-radius: 0em;\n  -webkit-box-shadow: none !important;\n  box-shadow: none !important;\n}\n.ui.tabular.menu .item {\n  background-color: transparent;\n  border-left: 1px solid transparent;\n  border-right: 1px solid transparent;\n  border-top: 1px solid transparent;\n  padding-left: 1.4em;\n  padding-right: 1.4em;\n  color: rgba(0, 0, 0, 0.6);\n}\n.ui.tabular.menu .item:before {\n  display: none;\n}\n/* Hover */\n.ui.tabular.menu .item:hover {\n  background-color: transparent;\n  color: rgba(0, 0, 0, 0.8);\n}\n/* Active */\n.ui.tabular.menu .active.item {\n  position: relative;\n  background-color: #FFFFFF;\n  color: rgba(0, 0, 0, 0.8);\n  border-color: #DCDDDE;\n  font-weight: bold;\n  margin-bottom: -1px;\n  border-bottom: 1px solid #FFFFFF;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  border-radius: 5px 5px 0 0;\n}\n/* Coupling with segment for attachment */\n.ui.attached.tabular.menu {\n  position: relative;\n  z-index: 2;\n}\n.ui.tabular.menu ~ .bottom.attached.segment {\n  margin: 1px 0px 0px 1px;\n}\n/*--------------\n   Pagination\n---------------*/\n.ui.pagination.menu {\n  margin: 0em;\n  display: inline-block;\n  vertical-align: middle;\n}\n.ui.pagination.menu .item {\n  min-width: 3em;\n  text-align: center;\n}\n.ui.pagination.menu .icon.item i.icon {\n  vertical-align: top;\n}\n.ui.pagination.menu.floated {\n  display: block;\n}\n/* active */\n.ui.pagination.menu .active.item {\n  border-top: none;\n  padding-top: 0.83em;\n  background-color: rgba(0, 0, 0, 0.05);\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*--------------\n   Secondary\n---------------*/\n.ui.secondary.menu {\n  background-color: transparent;\n  border-radius: 0px;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.secondary.menu > .menu > .item,\n.ui.secondary.menu > .item {\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  border: none;\n  height: auto !important;\n  margin: 0em 0.25em;\n  padding: 0.5em 1em;\n  border-radius: 0.3125em;\n}\n.ui.secondary.menu > .menu > .item:before,\n.ui.secondary.menu > .item:before {\n  display: none !important;\n}\n.ui.secondary.menu .item > .input input {\n  background-color: transparent;\n  border: none;\n}\n.ui.secondary.menu .link.item,\n.ui.secondary.menu a.item {\n  opacity: 0.8;\n  -webkit-transition: none;\n  -moz-transition: none;\n  transition: none;\n}\n.ui.secondary.menu .header.item {\n  border-right: 0.1em solid rgba(0, 0, 0, 0.1);\n  background-color: transparent;\n  border-radius: 0em;\n}\n/* hover */\n.ui.secondary.menu .link.item:hover,\n.ui.secondary.menu a.item:hover {\n  opacity: 1;\n}\n/* active */\n.ui.secondary.menu > .menu > .active.item,\n.ui.secondary.menu > .active.item {\n  background-color: rgba(0, 0, 0, 0.08);\n  opacity: 1;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.secondary.vertical.menu > .active.item {\n  border-radius: 0.3125em;\n}\n/* inverted */\n.ui.secondary.inverted.menu .link.item,\n.ui.secondary.inverted.menu a.item {\n  color: rgba(255, 255, 255, 0.5);\n}\n.ui.secondary.inverted.menu .link.item:hover,\n.ui.secondary.inverted.menu a.item:hover {\n  color: rgba(255, 255, 255, 0.9);\n}\n.ui.secondary.inverted.menu .active.item {\n  background-color: rgba(255, 255, 255, 0.1);\n}\n/* disable variations */\n.ui.secondary.item.menu > .item {\n  margin: 0em;\n}\n.ui.secondary.attached.menu {\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*---------------------\n   Secondary Pointing\n-----------------------*/\n.ui.secondary.pointing.menu {\n  border-bottom: 3px solid rgba(0, 0, 0, 0.1);\n}\n.ui.secondary.pointing.menu > .menu > .item,\n.ui.secondary.pointing.menu > .item {\n  margin: 0em 0em -3px;\n  padding: 0.6em 0.95em;\n  border-bottom: 3px solid rgba(0, 0, 0, 0);\n  border-radius: 0em;\n  -webkit-transition: color 0.2s\n  ;\n  -moz-transition: color 0.2s\n  ;\n  transition: color 0.2s\n  ;\n}\n/* Item Types */\n.ui.secondary.pointing.menu .header.item {\n  margin-bottom: -3px;\n  background-color: transparent !important;\n  border-right-width: 0px !important;\n  font-weight: bold !important;\n  color: rgba(0, 0, 0, 0.8) !important;\n}\n.ui.secondary.pointing.menu .text.item {\n  -webkit-box-shadow: none !important;\n  box-shadow: none !important;\n}\n.ui.secondary.pointing.menu > .menu > .item:after,\n.ui.secondary.pointing.menu > .item:after {\n  display: none;\n}\n/* Hover */\n.ui.secondary.pointing.menu > .menu > .link.item:hover,\n.ui.secondary.pointing.menu > .link.item:hover,\n.ui.secondary.pointing.menu > .menu > a.item:hover,\n.ui.secondary.pointing.menu > a.item:hover {\n  background-color: transparent;\n  color: rgba(0, 0, 0, 0.7);\n}\n/* Down */\n.ui.secondary.pointing.menu > .menu > .link.item:active,\n.ui.secondary.pointing.menu > .link.item:active,\n.ui.secondary.pointing.menu > .menu > a.item:active,\n.ui.secondary.pointing.menu > a.item:active {\n  background-color: transparent;\n  border-color: rgba(0, 0, 0, 0.2);\n}\n/* Active */\n.ui.secondary.pointing.menu > .menu > .item.active,\n.ui.secondary.pointing.menu > .item.active {\n  background-color: transparent;\n  border-color: rgba(0, 0, 0, 0.4);\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*---------------------\n   Secondary Vertical\n-----------------------*/\n.ui.secondary.vertical.pointing.menu {\n  border: none;\n  border-right: 3px solid rgba(0, 0, 0, 0.1);\n}\n.ui.secondary.vertical.menu > .item {\n  border: none;\n  margin: 0em 0em 0.3em;\n  padding: 0.6em 0.8em;\n  border-radius: 0.1875em;\n}\n.ui.secondary.vertical.menu > .header.item {\n  border-radius: 0em;\n}\n.ui.secondary.vertical.pointing.menu > .item {\n  margin: 0em -3px 0em 0em;\n  border-bottom: none;\n  border-right: 3px solid transparent;\n  border-radius: 0em;\n}\n/* Hover */\n.ui.secondary.vertical.pointing.menu > .item:hover {\n  background-color: transparent;\n  color: rgba(0, 0, 0, 0.7);\n}\n/* Down */\n.ui.secondary.vertical.pointing.menu > .item:active {\n  background-color: transparent;\n  border-color: rgba(0, 0, 0, 0.2);\n}\n/* Active */\n.ui.secondary.vertical.pointing.menu > .item.active {\n  background-color: transparent;\n  border-color: rgba(0, 0, 0, 0.4);\n  color: rgba(0, 0, 0, 0.85);\n}\n/*--------------\n    Inverted\n---------------*/\n.ui.secondary.inverted.menu {\n  background-color: transparent;\n}\n.ui.secondary.inverted.pointing.menu {\n  border-bottom: 3px solid rgba(255, 255, 255, 0.1);\n}\n.ui.secondary.inverted.pointing.menu > .item {\n  color: rgba(255, 255, 255, 0.7);\n}\n.ui.secondary.inverted.pointing.menu > .header.item {\n  color: #FFFFFF !important;\n}\n/* Hover */\n.ui.secondary.inverted.pointing.menu > .menu > .item:hover,\n.ui.secondary.inverted.pointing.menu > .item:hover {\n  color: rgba(255, 255, 255, 0.85);\n}\n/* Down */\n.ui.secondary.inverted.pointing.menu > .menu > .item:active,\n.ui.secondary.inverted.pointing.menu > .item:active {\n  border-color: rgba(255, 255, 255, 0.4);\n}\n/* Active */\n.ui.secondary.inverted.pointing.menu > .menu > .item.active,\n.ui.secondary.inverted.pointing.menu > .item.active {\n  border-color: rgba(255, 255, 255, 0.8);\n  color: #ffffff;\n}\n/*---------------------\n   Inverted Vertical\n----------------------*/\n.ui.secondary.inverted.vertical.pointing.menu {\n  border-right: 3px solid rgba(255, 255, 255, 0.1);\n  border-bottom: none;\n}\n/*--------------\n    Text Menu\n---------------*/\n.ui.text.menu {\n  background-color: transparent;\n  margin: 1rem -1rem;\n  border-radius: 0px;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.text.menu > .item {\n  opacity: 0.8;\n  margin: 0em 1em;\n  padding: 0em;\n  height: auto !important;\n  border-radius: 0px;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  -webkit-transition: opacity 0.2s ease\n  ;\n  -moz-transition: opacity 0.2s ease\n  ;\n  transition: opacity 0.2s ease\n  ;\n}\n.ui.text.menu > .item:before {\n  display: none !important;\n}\n.ui.text.menu .header.item {\n  background-color: transparent;\n  opacity: 1;\n  color: rgba(50, 50, 50, 0.8);\n  font-size: 0.875rem;\n  padding: 0em;\n  text-transform: uppercase;\n  font-weight: bold;\n}\n/*--- fluid text ---*/\n.ui.text.item.menu .item {\n  margin: 0em;\n}\n/*--- vertical text ---*/\n.ui.vertical.text.menu {\n  margin: 1rem 0em;\n}\n.ui.vertical.text.menu:first-child {\n  margin-top: 0rem;\n}\n.ui.vertical.text.menu:last-child {\n  margin-bottom: 0rem;\n}\n.ui.vertical.text.menu .item {\n  float: left;\n  clear: left;\n  margin: 0.5em 0em;\n}\n.ui.vertical.text.menu .item > i.icon {\n  float: none;\n  margin: 0em 0.83em 0em 0em;\n}\n.ui.vertical.text.menu .header.item {\n  margin: 0.8em 0em;\n}\n/*--- hover ---*/\n.ui.text.menu .item:hover {\n  opacity: 1;\n  background-color: transparent;\n}\n/*--- active ---*/\n.ui.text.menu .active.item {\n  background-color: transparent;\n  padding: 0em;\n  border: none;\n  opacity: 1;\n  font-weight: bold;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/* disable variations */\n.ui.text.pointing.menu .active.item:after {\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.text.attached.menu {\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.inverted.text.menu,\n.ui.inverted.text.menu .item,\n.ui.inverted.text.menu .item:hover,\n.ui.inverted.text.menu .item.active {\n  background-color: transparent;\n}\n/*--------------\n    Icon Only\n---------------*/\n.ui.icon.menu,\n.ui.vertical.icon.menu {\n  width: auto;\n  display: inline-block;\n  height: auto;\n}\n.ui.icon.menu > .item {\n  height: auto;\n  text-align: center;\n  color: rgba(60, 60, 60, 0.7);\n}\n.ui.icon.menu > .item > .icon {\n  display: block;\n  float: none !important;\n  opacity: 1;\n  margin: 0em auto !important;\n}\n.ui.icon.menu .icon:before {\n  opacity: 1;\n}\n/* Item Icon Only */\n.ui.menu .icon.item .icon {\n  margin: 0em;\n}\n.ui.vertical.icon.menu {\n  float: none;\n}\n/*--- inverted ---*/\n.ui.inverted.icon.menu .item {\n  color: rgba(255, 255, 255, 0.8);\n}\n.ui.inverted.icon.menu .icon {\n  color: #ffffff;\n}\n/*--------------\n   Labeled Icon\n---------------*/\n.ui.labeled.icon.menu {\n  text-align: center;\n}\n.ui.labeled.icon.menu > .item > .icon {\n  display: block;\n  font-size: 1.5em !important;\n  margin: 0em auto 0.3em !important;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------\n    Colors\n---------------*/\n/*--- Light Colors  ---*/\n.ui.menu .green.active.item,\n.ui.green.menu .active.item {\n  border-color: #A1CF64 !important;\n  color: #A1CF64 !important;\n}\n.ui.menu .red.active.item,\n.ui.red.menu .active.item {\n  border-color: #D95C5C !important;\n  color: #D95C5C !important;\n}\n.ui.menu .blue.active.item,\n.ui.blue.menu .active.item {\n  border-color: #6ECFF5 !important;\n  color: #6ECFF5 !important;\n}\n.ui.menu .purple.active.item,\n.ui.purple.menu .active.item {\n  border-color: #564F8A !important;\n  color: #564F8A !important;\n}\n.ui.menu .orange.active.item,\n.ui.orange.menu .active.item {\n  border-color: #F05940 !important;\n  color: #F05940 !important;\n}\n.ui.menu .teal.active.item,\n.ui.teal.menu .active.item {\n  border-color: #00B5AD !important;\n  color: #00B5AD !important;\n}\n/*--------------\n    Inverted\n---------------*/\n.ui.inverted.menu {\n  background-color: #333333;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.inverted.menu .header.item {\n  margin: 0em;\n  background-color: rgba(0, 0, 0, 0.3);\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.inverted.menu .item,\n.ui.inverted.menu .item > a {\n  color: #FFFFFF;\n}\n.ui.inverted.menu .item .item,\n.ui.inverted.menu .item .item > a {\n  color: rgba(255, 255, 255, 0.8);\n}\n.ui.inverted.menu .dropdown .menu .item,\n.ui.inverted.menu .dropdown .menu .item a {\n  color: rgba(0, 0, 0, 0.75) !important;\n}\n.ui.inverted.menu .item.disabled,\n.ui.inverted.menu .item.disabled:hover {\n  color: rgba(255, 255, 255, 0.2);\n}\n/*--- Border ---*/\n.ui.inverted.menu .item:before {\n  background-image: -webkit-linear-gradient(rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n  background-image: -moz-linear-gradient(rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n  background-image: -webkit-gradient(linear, left top, left bottom, from(rgba(255, 255, 255, 0.03)), color-stop(50%, rgba(255, 255, 255, 0.1)), to(rgba(255, 255, 255, 0.03)));\n  background-image: linear-gradient(rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n}\n.ui.vertical.inverted.menu .item:before {\n  background-image: -webkit-linear-gradient(left, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n  background-image: -moz-linear-gradient(left, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n  background-image: -webkit-gradient(linear, left top, right top, from(rgba(255, 255, 255, 0.03)), color-stop(50%, rgba(255, 255, 255, 0.1)), to(rgba(255, 255, 255, 0.03)));\n  background-image: linear-gradient(to right, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n}\n/*--- Hover ---*/\n.ui.link.inverted.menu .item:hover,\n.ui.inverted.menu .link.item:hover,\n.ui.inverted.menu a.item:hover,\n.ui.inverted.menu .dropdown.item:hover {\n  background-color: rgba(255, 255, 255, 0.1);\n}\n.ui.inverted.menu a.item:hover,\n.ui.inverted.menu .item > a:hover,\n.ui.inverted.menu .item .menu a.item:hover,\n.ui.inverted.menu .item .menu .link.item:hover {\n  color: #ffffff;\n}\n/*--- Down ---*/\n.ui.inverted.menu a.item:active,\n.ui.inverted.menu .dropdown.item:active,\n.ui.inverted.menu .link.item:active,\n.ui.inverted.menu a.item:active {\n  background-color: rgba(255, 255, 255, 0.15);\n}\n/*--- Active ---*/\n.ui.inverted.menu .active.item {\n  -webkit-box-shadow: none !important;\n  box-shadow: none !important;\n  background-color: rgba(255, 255, 255, 0.2);\n}\n.ui.inverted.menu .active.item,\n.ui.inverted.menu .active.item a {\n  color: #ffffff !important;\n}\n.ui.inverted.vertical.menu .item .menu .active.item {\n  background-color: rgba(255, 255, 255, 0.2);\n  color: #ffffff;\n}\n/*--- Pointers ---*/\n.ui.inverted.pointing.menu .active.item:after {\n  background-color: #5B5B5B;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.inverted.pointing.menu .active.item:hover:after {\n  background-color: #4A4A4A;\n}\n/*--------------\n    Selection\n---------------*/\n.ui.selection.menu > .item {\n  color: rgba(0, 0, 0, 0.4);\n}\n.ui.selection.menu > .item:hover {\n  color: rgba(0, 0, 0, 0.6);\n}\n.ui.selection.menu > .item.active {\n  color: rgba(0, 0, 0, 0.85);\n}\n.ui.inverted.selection.menu > .item {\n  color: rgba(255, 255, 255, 0.4);\n}\n.ui.inverted.selection.menu > .item:hover {\n  color: rgba(255, 255, 255, 0.9);\n}\n.ui.inverted.selection.menu > .item.active {\n  color: #FFFFFF;\n}\n/*--------------\n     Floated\n---------------*/\n.ui.floated.menu {\n  float: left;\n  margin: 0rem 0.5rem 0rem 0rem;\n}\n.ui.right.floated.menu {\n  float: right;\n  margin: 0rem 0rem 0rem 0.5rem;\n}\n/*--------------\n Inverted Colors\n---------------*/\n/*--- Light Colors  ---*/\n.ui.grey.menu {\n  background-color: #F0F0F0;\n}\n/*--- Inverted Colors  ---*/\n.ui.inverted.green.menu {\n  background-color: #A1CF64;\n}\n.ui.inverted.green.pointing.menu .active.item:after {\n  background-color: #A1CF64;\n}\n.ui.inverted.red.menu {\n  background-color: #D95C5C;\n}\n.ui.inverted.red.pointing.menu .active.item:after {\n  background-color: #F16883;\n}\n.ui.inverted.blue.menu {\n  background-color: #6ECFF5;\n}\n.ui.inverted.blue.pointing.menu .active.item:after {\n  background-color: #6ECFF5;\n}\n.ui.inverted.purple.menu {\n  background-color: #564F8A;\n}\n.ui.inverted.purple.pointing.menu .active.item:after {\n  background-color: #564F8A;\n}\n.ui.inverted.orange.menu {\n  background-color: #F05940;\n}\n.ui.inverted.orange.pointing.menu .active.item:after {\n  background-color: #F05940;\n}\n.ui.inverted.teal.menu {\n  background-color: #00B5AD;\n}\n.ui.inverted.teal.pointing.menu .active.item:after {\n  background-color: #00B5AD;\n}\n/*--------------\n     Fitted\n---------------*/\n.ui.fitted.menu .item,\n.ui.fitted.menu .item .menu .item,\n.ui.menu .fitted.item {\n  padding: 0em;\n}\n.ui.horizontally.fitted.menu .item,\n.ui.horizontally.fitted.menu .item .menu .item,\n.ui.menu .horizontally.fitted.item {\n  padding-top: 0.83em;\n  padding-bottom: 0.83em;\n}\n.ui.vertically.fitted.menu .item,\n.ui.vertically.fitted.menu .item .menu .item,\n.ui.menu .vertically.fitted.item {\n  padding-left: 0.95em;\n  padding-right: 0.95em;\n}\n/*--------------\n   Borderless\n---------------*/\n.ui.borderless.menu .item:before,\n.ui.borderless.menu .item .menu .item:before,\n.ui.menu .borderless.item:before {\n  background-image: none;\n}\n/*-------------------\n       Compact\n--------------------*/\n.ui.compact.menu {\n  display: inline-block;\n  margin: 0em;\n  vertical-align: middle;\n}\n.ui.compact.vertical.menu {\n  width: auto !important;\n}\n.ui.compact.vertical.menu .item:last-child::before {\n  display: block;\n}\n/*-------------------\n        Fluid\n--------------------*/\n.ui.menu.fluid,\n.ui.vertical.menu.fluid {\n  display: block;\n  width: 100% !important;\n}\n/*-------------------\n      Evenly Sized\n--------------------*/\n.ui.item.menu,\n.ui.item.menu .item {\n  width: 100%;\n  padding-left: 0px !important;\n  padding-right: 0px !important;\n  text-align: center;\n}\n.ui.menu.two.item .item {\n  width: 50%;\n}\n.ui.menu.three.item .item {\n  width: 33.333%;\n}\n.ui.menu.four.item .item {\n  width: 25%;\n}\n.ui.menu.five.item .item {\n  width: 20%;\n}\n.ui.menu.six.item .item {\n  width: 16.666%;\n}\n.ui.menu.seven.item .item {\n  width: 14.285%;\n}\n.ui.menu.eight.item .item {\n  width: 12.500%;\n}\n.ui.menu.nine.item .item {\n  width: 11.11%;\n}\n.ui.menu.ten.item .item {\n  width: 10.0%;\n}\n.ui.menu.eleven.item .item {\n  width: 9.09%;\n}\n.ui.menu.twelve.item .item {\n  width: 8.333%;\n}\n/*--------------\n     Fixed\n---------------*/\n.ui.menu.fixed {\n  position: fixed;\n  z-index: 999;\n  margin: 0em;\n  border: none;\n  width: 100%;\n}\n.ui.menu.fixed,\n.ui.menu.fixed .item:first-child,\n.ui.menu.fixed .item:last-child {\n  border-radius: 0px !important;\n}\n.ui.menu.fixed.top {\n  top: 0px;\n  left: 0px;\n  right: auto;\n  bottom: auto;\n}\n.ui.menu.fixed.right {\n  top: 0px;\n  right: 0px;\n  left: auto;\n  bottom: auto;\n  width: auto;\n  height: 100%;\n}\n.ui.menu.fixed.bottom {\n  bottom: 0px;\n  left: 0px;\n  top: auto;\n  right: auto;\n}\n.ui.menu.fixed.left {\n  top: 0px;\n  left: 0px;\n  right: auto;\n  bottom: auto;\n  width: auto;\n  height: 100%;\n}\n/* Coupling with Grid */\n.ui.fixed.menu + .ui.grid {\n  padding-top: 2.75rem;\n}\n/*-------------------\n       Pointing\n--------------------*/\n.ui.pointing.menu .active.item:after {\n  position: absolute;\n  bottom: -0.3em;\n  left: 50%;\n  content: "";\n  margin-left: -0.3em;\n  width: 0.6em;\n  height: 0.6em;\n  border: none;\n  border-bottom: 1px solid rgba(0, 0, 0, 0.1);\n  border-right: 1px solid rgba(0, 0, 0, 0.1);\n  background-image: none;\n  -webkit-transform: rotate(45deg);\n  -moz-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n  z-index: 2;\n  -webkit-transition: background 0.2s ease\n  ;\n  -moz-transition: background 0.2s ease\n  ;\n  transition: background 0.2s ease\n  ;\n}\n/* Don\'t double up pointers */\n.ui.pointing.menu .active.item .menu .active.item:after {\n  display: none;\n}\n.ui.vertical.pointing.menu .active.item:after {\n  position: absolute;\n  top: 50%;\n  margin-top: -0.3em;\n  right: -0.4em;\n  bottom: auto;\n  left: auto;\n  border: none;\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  border-right: 1px solid rgba(0, 0, 0, 0.1);\n}\n/* Colors */\n.ui.pointing.menu .active.item:after {\n  background-color: #FCFCFC;\n}\n.ui.pointing.menu .active.item:hover:after {\n  background-color: #FAFAFA;\n}\n.ui.vertical.pointing.menu .menu .active.item:after {\n  background-color: #F4F4F4;\n}\n.ui.pointing.menu a.active.item:active:after {\n  background-color: #F0F0F0;\n}\n/*--------------\n    Attached\n---------------*/\n.ui.menu.attached {\n  margin: 0rem;\n  border-radius: 0px;\n  /* avoid rgba multiplying */\n  -webkit-box-shadow: 0px 0px 0px 1px #DDDDDD;\n  box-shadow: 0px 0px 0px 1px #DDDDDD;\n}\n.ui.top.attached.menu {\n  border-radius: 0.1875em 0.1875em 0px 0px;\n}\n.ui.menu.bottom.attached {\n  border-radius: 0px 0px 0.1875em 0.1875em;\n}\n/*--------------\n     Sizes\n---------------*/\n.ui.small.menu .item {\n  font-size: 0.875rem;\n}\n.ui.small.vertical.menu {\n  width: 13rem;\n}\n.ui.menu .item {\n  font-size: 1rem;\n}\n.ui.vertical.menu {\n  width: 15rem;\n}\n.ui.large.menu .item {\n  font-size: 1.125rem;\n}\n.ui.large.menu .item .item {\n  font-size: 0.875rem;\n}\n.ui.large.menu .dropdown .item {\n  font-size: 1rem;\n}\n.ui.large.vertical.menu {\n  width: 18rem;\n}\n\n/*\n * # Semantic - Message\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Message\n*******************************/\n.ui.message {\n  position: relative;\n  min-height: 18px;\n  margin: 1em 0em;\n  height: auto;\n  background-color: #EFEFEF;\n  padding: 1em;\n  line-height: 1.33;\n  color: rgba(0, 0, 0, 0.6);\n  -webkit-transition: opacity 0.1s ease, color 0.1s ease, background 0.1s ease, -webkit-box-shadow 0.1s ease;\n  -moz-transition: opacity 0.1s ease, color 0.1s ease, background 0.1s ease, box-shadow 0.1s ease;\n  transition: opacity 0.1s ease, color 0.1s ease, background 0.1s ease, box-shadow 0.1s ease;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  border-radius: 0.325em 0.325em 0.325em 0.325em;\n}\n.ui.message:first-child {\n  margin-top: 0em;\n}\n.ui.message:last-child {\n  margin-bottom: 0em;\n}\n/*--------------\n     Content\n---------------*/\n/* block with headers */\n.ui.message .header {\n  margin: 0em;\n  font-size: 1.33em;\n  font-weight: bold;\n}\n/* block with paragraphs */\n.ui.message p {\n  opacity: 0.85;\n  margin: 1em 0em;\n}\n.ui.message p:first-child {\n  margin-top: 0em;\n}\n.ui.message p:last-child {\n  margin-bottom: 0em;\n}\n.ui.message .header + p {\n  margin-top: 0.3em;\n}\n.ui.message > :first-child {\n  margin-top: 0em;\n}\n.ui.message > :last-child {\n  margin-bottom: 0em;\n}\n/* block with child list */\n.ui.message ul.list {\n  opacity: 0.85;\n  list-style-position: inside;\n  margin: 0.2em 0em;\n  padding: 0em;\n}\n.ui.message ul.list li {\n  position: relative;\n  list-style-type: none;\n  margin: 0em 0em 0.3em 1em;\n  padding: 0em;\n}\n.ui.message ul.list li:before {\n  position: absolute;\n  content: \'\2022\';\n  top: -0.05em;\n  left: -0.8em;\n  height: 100%;\n  vertical-align: baseline;\n  opacity: 0.5;\n}\n.ui.message ul.list li:first-child {\n  margin-top: 0em;\n}\n/* dismissable block */\n.ui.message > .close.icon {\n  cursor: pointer;\n  position: absolute;\n  right: 0em;\n  top: 0em;\n  width: 2.5em;\n  height: 2.5em;\n  opacity: 0.7;\n  padding: 0.75em 0em 0em 0.75em;\n  z-index: 2;\n  -webkit-transition: opacity 0.1s linear\n  ;\n  -moz-transition: opacity 0.1s linear\n  ;\n  transition: opacity 0.1s linear\n  ;\n  z-index: 10;\n}\n.ui.message > .close.icon:hover {\n  opacity: 1;\n}\n/*******************************\n            States\n*******************************/\n.ui.message.visible {\n  display: block !important;\n}\n.ui.icon.message.animating,\n.ui.icon.message.visible {\n  display: table !important;\n}\n.ui.message.hidden {\n  display: none !important;\n}\n/*******************************\n            Variations\n*******************************/\n/*--------------\n    Compact\n---------------*/\n.ui.compact.message {\n  display: inline-block;\n}\n/*--------------\n    Attached\n---------------*/\n.ui.attached.message {\n  margin-left: -1px;\n  margin-right: -1px;\n  margin-bottom: -1px;\n  border-radius: 0.325em 0.325em 0em 0em;\n  -webkit-box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.1) inset;\n}\n.ui.attached + .ui.attached.message:not(.top):not(.bottom) {\n  margin-top: -1px;\n  border-radius: 0em;\n}\n.ui.bottom.attached.message {\n  margin-top: -1px;\n  border-radius: 0em 0em 0.325em 0.325em;\n}\n.ui.bottom.attached.message:not(:last-child) {\n  margin-bottom: 1em;\n}\n.ui.attached.icon.message {\n  display: block;\n  width: auto;\n}\n/*--------------\n      Icon\n---------------*/\n.ui.icon.message {\n  display: table;\n  width: 100%;\n}\n.ui.icon.message > .icon:not(.close) {\n  display: table-cell;\n  vertical-align: middle;\n  font-size: 3.8em;\n  opacity: 0.5;\n}\n.ui.icon.message > .icon + .content {\n  padding-left: 1em;\n}\n.ui.icon.message > .content {\n  display: table-cell;\n  vertical-align: middle;\n}\n/*--------------\n    Inverted\n---------------*/\n.ui.inverted.message {\n  background-color: rgba(255, 255, 255, 0.05);\n  color: rgba(255, 255, 255, 0.95);\n}\n/*--------------\n    Floating\n---------------*/\n.ui.floating.message {\n  -webkit-box-shadow: 0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 0px 0px 1px rgba(0, 0, 0, 0.05) inset;\n  box-shadow: 0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 0px 0px 1px rgba(0, 0, 0, 0.05) inset;\n}\n/*--------------\n     Colors\n---------------*/\n.ui.black.message {\n  background-color: #333333;\n  color: rgba(255, 255, 255, 0.95);\n}\n/*--------------\n     Types\n---------------*/\n.ui.blue.message,\n.ui.info.message {\n  background-color: #E6F4F9;\n  color: #4D8796;\n}\n/* Green Text Block */\n.ui.green.message {\n  background-color: #DEFCD5;\n  color: #52A954;\n}\n/* Yellow Text Block */\n.ui.yellow.message,\n.ui.warning.message {\n  background-color: #F6F3D5;\n  color: #96904D;\n}\n/* Red Text Block */\n.ui.red.message {\n  background-color: #F1D7D7;\n  color: #A95252;\n}\n/* Success Text Block */\n.ui.success.message,\n.ui.positive.message {\n  background-color: #DEFCD5;\n  color: #52A954;\n}\n/* Error Text Block */\n.ui.error.message,\n.ui.negative.message {\n  background-color: #F1D7D7;\n  color: #A95252;\n}\n/*--------------\n     Sizes\n---------------*/\n.ui.small.message {\n  font-size: 0.875em;\n}\n.ui.message {\n  font-size: 1em;\n}\n.ui.large.message {\n  font-size: 1.125em;\n}\n.ui.huge.message {\n  font-size: 1.5em;\n}\n.ui.massive.message {\n  font-size: 2em;\n}\n\n/*\n * # Semantic - Table\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n             Table\n*******************************/\n/* Prototype */\n.ui.table {\n  width: 100%;\n  border-collapse: collapse;\n}\n/* Table Content */\n.ui.table th,\n.ui.table tr,\n.ui.table td {\n  border-collapse: collapse;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  -webkit-transition: all 0.1s ease-out;\n  -moz-transition: all 0.1s ease-out;\n  transition: all 0.1s ease-out;\n}\n/* Headers */\n.ui.table thead {\n  border-bottom: 1px solid rgba(0, 0, 0, 0.03);\n}\n.ui.table tfoot th {\n  background-color: rgba(0, 0, 0, 0.03);\n}\n.ui.table th {\n  cursor: auto;\n  background-color: rgba(0, 0, 0, 0.05);\n  text-align: left;\n  color: rgba(0, 0, 0, 0.8);\n  padding: 0.5em 0.7em;\n  vertical-align: middle;\n}\n.ui.table thead th:first-child {\n  border-radius: 5px 0px 0px 0px;\n}\n.ui.table thead th:last-child {\n  border-radius: 0px 5px 0px 0px;\n}\n.ui.table tfoot th:first-child {\n  border-radius: 0px 0px 0px 5px;\n}\n.ui.table tfoot th:last-child {\n  border-radius: 0px 0px 5px 0px;\n}\n.ui.table tfoot th:only-child {\n  border-radius: 0px 0px 5px 5px;\n}\n/* Table Cells */\n.ui.table td {\n  padding: 0.40em 0.7em;\n  vertical-align: middle;\n}\n/* Footer */\n.ui.table tfoot {\n  border-top: 1px solid rgba(0, 0, 0, 0.03);\n}\n.ui.table tfoot th {\n  font-weight: normal;\n  font-style: italic;\n}\n/* Table Striping */\n.ui.table tbody tr:nth-child(2n) {\n  background-color: rgba(0, 0, 50, 0.02);\n}\n/* Icons */\n.ui.table > .icon {\n  vertical-align: baseline;\n}\n.ui.table > .icon:only-child {\n  margin: 0em;\n}\n/* Table Segment */\n.ui.table.segment:after {\n  display: none;\n}\n.ui.table.segment.stacked:after {\n  display: block;\n}\n/* Responsive */\n@media only screen and (max-width: 768px) {\n  .ui.table {\n    display: block;\n    padding: 0em;\n  }\n  .ui.table thead,\n  .ui.table tfoot {\n    display: none;\n  }\n  .ui.table tbody {\n    display: block;\n  }\n  .ui.table tr {\n    display: block;\n  }\n  .ui.table tr > td {\n    width: 100% !important;\n    display: block;\n    border: none !important;\n    padding: 0.25em 0.75em;\n    -webkit-box-shadow: 0px 1px 0px 0px rgba(0, 0, 0, 0.05) !important;\n    box-shadow: 0px 1px 0px 0px rgba(0, 0, 0, 0.05) !important;\n  }\n  .ui.table td:first-child {\n    font-weight: bold;\n    padding-top: 1em;\n  }\n  .ui.table td:last-child {\n    -webkit-box-shadow: 0px -1px 0px 0px rgba(0, 0, 0, 0.1) inset !important;\n    box-shadow: 0px -1px 0px 0px rgba(0, 0, 0, 0.1) inset !important;\n    padding-bottom: 1em;\n  }\n  /* Clear BG Colors */\n  .ui.table tr > td.warning,\n  .ui.table tr > td.error,\n  .ui.table tr > td.active,\n  .ui.table tr > td.positive,\n  .ui.table tr > td.negative {\n    background-color: transparent !important;\n  }\n}\n/*******************************\n             States\n*******************************/\n/*--------------\n      Hover\n---------------*/\n/* Sortable */\n.ui.sortable.table th.disabled:hover {\n  cursor: auto;\n  text-align: left;\n  font-weight: bold;\n  color: #333333;\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.sortable.table thead th:hover {\n  background-color: rgba(0, 0, 0, 0.13);\n  color: rgba(0, 0, 0, 0.8);\n}\n/* Inverted Sortable */\n.ui.inverted.sortable.table thead th:hover {\n  background-color: rgba(255, 255, 255, 0.13);\n  color: #ffffff;\n}\n/*--------------\n    Positive\n---------------*/\n.ui.table tr.positive,\n.ui.table td.positive {\n  -webkit-box-shadow: 2px 0px 0px #119000 inset;\n  box-shadow: 2px 0px 0px #119000 inset;\n}\n.ui.table tr.positive td,\n.ui.table td.positive {\n  background-color: #F2F8F0 !important;\n  color: #119000 !important;\n}\n.ui.celled.table tr.positive:hover td,\n.ui.celled.table tr:hover td.positive,\n.ui.table tr.positive:hover td,\n.ui.table td:hover.positive,\n.ui.table th:hover.positive {\n  background-color: #ECF5E9 !important;\n  color: #119000 !important;\n}\n/*--------------\n     Negative\n---------------*/\n.ui.table tr.negative,\n.ui.table td.negative {\n  -webkit-box-shadow: 2px 0px 0px #CD2929 inset;\n  box-shadow: 2px 0px 0px #CD2929 inset;\n}\n.ui.table tr.negative td,\n.ui.table td.negative {\n  background-color: #F9F4F4;\n  color: #CD2929 !important;\n}\n.ui.celled.table tr.negative:hover td,\n.ui.celled.table tr:hover td.negative,\n.ui.table tr.negative:hover td,\n.ui.table td:hover.negative,\n.ui.table th:hover.negative {\n  background-color: #F2E8E8;\n  color: #CD2929;\n}\n/*--------------\n      Error\n---------------*/\n.ui.table tr.error,\n.ui.table td.error {\n  -webkit-box-shadow: 2px 0px 0px #CD2929 inset;\n  box-shadow: 2px 0px 0px #CD2929 inset;\n}\n.ui.table tr.error td,\n.ui.table td.error,\n.ui.table th.error {\n  background-color: #F9F4F4;\n  color: #CD2929;\n}\n.ui.celled.table tr.error:hover td,\n.ui.celled.table tr:hover td.error,\n.ui.table tr.error:hover td,\n.ui.table td:hover.error,\n.ui.table th:hover.error {\n  background-color: #F2E8E8;\n  color: #CD2929;\n}\n/*--------------\n     Warning\n---------------*/\n.ui.table tr.warning,\n.ui.table td.warning {\n  -webkit-box-shadow: 2px 0px 0px #7D6C00 inset;\n  box-shadow: 2px 0px 0px #7D6C00 inset;\n}\n.ui.table tr.warning td,\n.ui.table td.warning,\n.ui.table th.warning {\n  background-color: #FBF6E9;\n  color: #7D6C00;\n}\n.ui.celled.table tr.warning:hover td,\n.ui.celled.table tr:hover td.warning,\n.ui.table tr.warning:hover td,\n.ui.table td:hover.warning,\n.ui.table th:hover.warning {\n  background-color: #F3EDDC;\n  color: #7D6C00;\n}\n/*--------------\n     Active\n---------------*/\n.ui.table tr.active,\n.ui.table td.active {\n  -webkit-box-shadow: 2px 0px 0px rgba(50, 50, 50, 0.9) inset;\n  box-shadow: 2px 0px 0px rgba(50, 50, 50, 0.9) inset;\n}\n.ui.table tr.active td,\n.ui.table tr td.active {\n  background-color: #E0E0E0;\n  color: rgba(50, 50, 50, 0.9);\n  /* border-color: rgba(0, 0, 0, 0.15) !important; */\n}\n/*--------------\n     Disabled\n---------------*/\n.ui.table tr.disabled td,\n.ui.table tr td.disabled,\n.ui.table tr.disabled:hover td,\n.ui.table tr:hover td.disabled {\n  color: rgba(150, 150, 150, 0.3);\n}\n/*******************************\n          Variations\n*******************************/\n/*--------------\n  Column Count\n---------------*/\n.ui.two.column.table td {\n  width: 50%;\n}\n.ui.three.column.table td {\n  width: 33.3333%;\n}\n.ui.four.column.table td {\n  width: 25%;\n}\n.ui.five.column.table td {\n  width: 20%;\n}\n.ui.six.column.table td {\n  width: 16.66667%;\n}\n.ui.seven.column.table td {\n  width: 14.2857%;\n}\n.ui.eight.column.table td {\n  width: 12.5%;\n}\n.ui.nine.column.table td {\n  width: 11.1111%;\n}\n.ui.ten.column.table td {\n  width: 10%;\n}\n.ui.eleven.column.table td {\n  width: 9.0909%;\n}\n.ui.twelve.column.table td {\n  width: 8.3333%;\n}\n.ui.thirteen.column.table td {\n  width: 7.6923%;\n}\n.ui.fourteen.column.table td {\n  width: 7.1428%;\n}\n.ui.fifteen.column.table td {\n  width: 6.6666%;\n}\n.ui.sixteen.column.table td {\n  width: 6.25%;\n}\n/* Column Width */\n.ui.table th.one.wide,\n.ui.table td.one.wide {\n  width: 6.25%;\n}\n.ui.table th.two.wide,\n.ui.table td.two.wide {\n  width: 12.5%;\n}\n.ui.table th.three.wide,\n.ui.table td.three.wide {\n  width: 18.75%;\n}\n.ui.table th.four.wide,\n.ui.table td.four.wide {\n  width: 25%;\n}\n.ui.table th.five.wide,\n.ui.table td.five.wide {\n  width: 31.25%;\n}\n.ui.table th.six.wide,\n.ui.table td.six.wide {\n  width: 37.5%;\n}\n.ui.table th.seven.wide,\n.ui.table td.seven.wide {\n  width: 43.75%;\n}\n.ui.table th.eight.wide,\n.ui.table td.eight.wide {\n  width: 50%;\n}\n.ui.table th.nine.wide,\n.ui.table td.nine.wide {\n  width: 56.25%;\n}\n.ui.table th.ten.wide,\n.ui.table td.ten.wide {\n  width: 62.5%;\n}\n.ui.table th.eleven.wide,\n.ui.table td.eleven.wide {\n  width: 68.75%;\n}\n.ui.table th.twelve.wide,\n.ui.table td.twelve.wide {\n  width: 75%;\n}\n.ui.table th.thirteen.wide,\n.ui.table td.thirteen.wide {\n  width: 81.25%;\n}\n.ui.table th.fourteen.wide,\n.ui.table td.fourteen.wide {\n  width: 87.5%;\n}\n.ui.table th.fifteen.wide,\n.ui.table td.fifteen.wide {\n  width: 93.75%;\n}\n.ui.table th.sixteen.wide,\n.ui.table td.sixteen.wide {\n  width: 100%;\n}\n/*--------------\n     Celled\n---------------*/\n.ui.celled.table {\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.celled.table tbody tr,\n.ui.celled.table tfoot tr {\n  border: none;\n}\n.ui.celled.table th,\n.ui.celled.table td {\n  border: 1px solid rgba(0, 0, 0, 0.1);\n}\n/* Coupling with segment */\n.ui.celled.table.segment th:first-child,\n.ui.celled.table.segment td:first-child {\n  border-left: none;\n}\n.ui.celled.table.segment th:last-child,\n.ui.celled.table.segment td:last-child {\n  border-right: none;\n}\n/*--------------\n    Sortable\n---------------*/\n.ui.sortable.table thead th {\n  cursor: pointer;\n  white-space: nowrap;\n}\n.ui.sortable.table thead th.sorted,\n.ui.sortable.table thead th.sorted:hover {\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n}\n.ui.sortable.table thead th:after {\n  display: inline-block;\n  content: \'\';\n  width: 1em;\n  opacity: 0.8;\n  margin: 0em 0em 0em 0.5em;\n  font-family: \'Icons\';\n  font-style: normal;\n  font-weight: normal;\n  text-decoration: inherit;\n}\n.ui.sortable.table thead th.ascending:after {\n  content: \'\25b4\';\n}\n.ui.sortable.table thead th.descending:after {\n  content: \'\25be\';\n}\n/*--------------\n    Inverted\n---------------*/\n/* Text Color */\n.ui.inverted.table td {\n  color: rgba(255, 255, 255, 0.9);\n}\n.ui.inverted.table th {\n  background-color: rgba(0, 0, 0, 0.15);\n  color: rgba(255, 255, 255, 0.9);\n}\n/* Stripes */\n.ui.inverted.table tbody tr:nth-child(2n) {\n  background-color: rgba(255, 255, 255, 0.06);\n}\n/*--------------\n   Definition\n---------------*/\n.ui.definition.table td:first-child {\n  font-weight: bold;\n}\n/*--------------\n   Collapsing\n---------------*/\n.ui.collapsing.table {\n  width: auto;\n}\n/*--------------\n      Basic\n---------------*/\n.ui.basic.table th {\n  background-color: transparent;\n  padding: 0.5em;\n}\n.ui.basic.table tbody tr {\n  border-bottom: 1px solid rgba(0, 0, 0, 0.03);\n}\n.ui.basic.table td {\n  padding: 0.8em 0.5em;\n}\n.ui.basic.table tbody tr:nth-child(2n) {\n  background-color: transparent !important;\n}\n/*--------------\n     Padded\n---------------*/\n.ui.padded.table th,\n.ui.padded.table td {\n  padding: 0.8em 1em;\n}\n.ui.compact.table th {\n  padding: 0.3em 0.5em;\n}\n.ui.compact.table td {\n  padding: 0.2em 0.5em;\n}\n/*--------------\n      Sizes\n---------------*/\n/* Small */\n.ui.small.table {\n  font-size: 0.875em;\n}\n/* Standard */\n.ui.table {\n  font-size: 1em;\n}\n/* Large */\n.ui.large.table {\n  font-size: 1.1em;\n}\n\n/*\n * # Semantic - basic.Icon (Basic)\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n          Basic Icon\n*******************************/\n@font-face {\n  font-family: \'Basic Icons\';\n  src: url(../fonts/basic.icons.eot);\n  src: url(../fonts/basic.icons.eot?#iefix) format(\'embedded-opentype\'), url(../fonts/basic.icons.svg#basic.icons) format(\'svg\'), url(../fonts/basic.icons.woff) format(\'woff\'), url(../fonts/basic.icons.ttf) format(\'truetype\');\n  font-style: normal;\n  font-weight: normal;\n  font-variant: normal;\n  text-decoration: inherit;\n  text-transform: none;\n}\ni.basic.icon {\n  display: inline-block;\n  opacity: 0.75;\n  margin: 0em 0.25em 0em 0em;\n  width: 1.23em;\n  height: 1em;\n  font-family: \'Basic Icons\';\n  font-style: normal;\n  line-height: 1;\n  font-weight: normal;\n  text-decoration: inherit;\n  text-align: center;\n  speak: none;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  -webkit-font-smoothing: antialiased;\n  -moz-font-smoothing: antialiased;\n  font-smoothing: antialiased;\n}\n/* basic.icons available */\ni.basic.icon.circle.attention:before {\n  content: \'\2757\';\n}\n/* \'❗\' */\ni.basic.icon.circle.help:before {\n  content: \'\e704\';\n}\n/* \'\' */\ni.basic.icon.circle.info:before {\n  content: \'\e705\';\n}\n/* \'\' */\ni.basic.icon.add:before {\n  content: \'\2795\';\n}\n/* \'➕\' */\ni.basic.icon.chart:before {\n  content: \'📈\';\n}\n/* \'\1f4c8\' */\ni.basic.icon.chart.bar:before {\n  content: \'📊\';\n}\n/* \'\1f4ca\' */\ni.basic.icon.chart.pie:before {\n  content: \'\e7a2\';\n}\n/* \'\' */\ni.basic.icon.resize.full:before {\n  content: \'\e744\';\n}\n/* \'\' */\ni.basic.icon.resize.horizontal:before {\n  content: \'\2b0d\';\n}\n/* \'⬍\' */\ni.basic.icon.resize.small:before {\n  content: \'\e746\';\n}\n/* \'\' */\ni.basic.icon.resize.vertical:before {\n  content: \'\2b0c\';\n}\n/* \'⬌\' */\ni.basic.icon.down:before {\n  content: \'\2193\';\n}\n/* \'↓\' */\ni.basic.icon.down.triangle:before {\n  content: \'\25be\';\n}\n/* \'▾\' */\ni.basic.icon.down.arrow:before {\n  content: \'\e75c\';\n}\n/* \'\' */\ni.basic.icon.left:before {\n  content: \'\2190\';\n}\n/* \'←\' */\ni.basic.icon.left.triangle:before {\n  content: \'\25c2\';\n}\n/* \'◂\' */\ni.basic.icon.left.arrow:before {\n  content: \'\e75d\';\n}\n/* \'\' */\ni.basic.icon.right:before {\n  content: \'\2192\';\n}\n/* \'→\' */\ni.basic.icon.right.triangle:before {\n  content: \'\25b8\';\n}\n/* \'▸\' */\ni.basic.icon.right.arrow:before {\n  content: \'\e75e\';\n}\n/* \'\' */\ni.basic.icon.up:before {\n  content: \'\2191\';\n}\n/* \'↑\' */\ni.basic.icon.up.triangle:before {\n  content: \'\25b4\';\n}\n/* \'▴\' */\ni.basic.icon.up.arrow:before {\n  content: \'\e75f\';\n}\n/* \'\' */\ni.basic.icon.folder:before {\n  content: \'\e810\';\n}\n/* \'\' */\ni.basic.icon.open.folder:before {\n  content: \'📂\';\n}\n/* \'\1f4c2\' */\ni.basic.icon.globe:before {\n  content: \'𝌍\';\n}\n/* \'\1d30d\' */\ni.basic.icon.desk.globe:before {\n  content: \'🌐\';\n}\n/* \'\1f310\' */\ni.basic.icon.star:before {\n  content: \'\e801\';\n}\n/* \'\' */\ni.basic.icon.star.empty:before {\n  content: \'\e800\';\n}\n/* \'\' */\ni.basic.icon.star.half:before {\n  content: \'\e701\';\n}\n/* \'\' */\ni.basic.icon.lock:before {\n  content: \'🔒\';\n}\n/* \'\1f512\' */\ni.basic.icon.unlock:before {\n  content: \'🔓\';\n}\n/* \'\1f513\' */\ni.basic.icon.layout.grid:before {\n  content: \'\e80c\';\n}\n/* \'\' */\ni.basic.icon.layout.block:before {\n  content: \'\e708\';\n}\n/* \'\' */\ni.basic.icon.layout.list:before {\n  content: \'\e80b\';\n}\n/* \'\' */\ni.basic.icon.heart.empty:before {\n  content: \'\2661\';\n}\n/* \'♡\' */\ni.basic.icon.heart:before {\n  content: \'\2665\';\n}\n/* \'♥\' */\ni.basic.icon.asterisk:before {\n  content: \'\2731\';\n}\n/* \'✱\' */\ni.basic.icon.attachment:before {\n  content: \'📎\';\n}\n/* \'\1f4ce\' */\ni.basic.icon.attention:before {\n  content: \'\26a0\';\n}\n/* \'⚠\' */\ni.basic.icon.trophy:before {\n  content: \'🏉\';\n}\n/* \'\1f3c9\' */\ni.basic.icon.barcode:before {\n  content: \'\e792\';\n}\n/* \'\' */\ni.basic.icon.cart:before {\n  content: \'\e813\';\n}\n/* \'\' */\ni.basic.icon.block:before {\n  content: \'🚫\';\n}\n/* \'\1f6ab\' */\ni.basic.icon.book:before {\n  content: \'📖\';\n}\ni.basic.icon.bookmark:before {\n  content: \'🔖\';\n}\n/* \'\1f516\' */\ni.basic.icon.calendar:before {\n  content: \'📅\';\n}\n/* \'\1f4c5\' */\ni.basic.icon.cancel:before {\n  content: \'\2716\';\n}\n/* \'✖\' */\ni.basic.icon.close:before {\n  content: \'\e80d\';\n}\n/* \'\' */\ni.basic.icon.color:before {\n  content: \'\e794\';\n}\n/* \'\' */\ni.basic.icon.chat:before {\n  content: \'\e720\';\n}\n/* \'\' */\ni.basic.icon.check:before {\n  content: \'\2611\';\n}\n/* \'☑\' */\ni.basic.icon.time:before {\n  content: \'🕔\';\n}\n/* \'\1f554\' */\ni.basic.icon.cloud:before {\n  content: \'\2601\';\n}\n/* \'☁\' */\ni.basic.icon.code:before {\n  content: \'\e714\';\n}\n/* \'\' */\ni.basic.icon.email:before {\n  content: \'\40\';\n}\n/* \'@\' */\ni.basic.icon.settings:before {\n  content: \'\26ef\';\n}\n/* \'⛯\' */\ni.basic.icon.setting:before {\n  content: \'\2699\';\n}\n/* \'⚙\' */\ni.basic.icon.comment:before {\n  content: \'\e802\';\n}\n/* \'\' */\ni.basic.icon.clockwise.counter:before {\n  content: \'\27f2\';\n}\n/* \'⟲\' */\ni.basic.icon.clockwise:before {\n  content: \'\27f3\';\n}\n/* \'⟳\' */\ni.basic.icon.cube:before {\n  content: \'\e807\';\n}\n/* \'\' */\ni.basic.icon.direction:before {\n  content: \'\27a2\';\n}\n/* \'➢\' */\ni.basic.icon.doc:before {\n  content: \'📄\';\n}\n/* \'\1f4c4\' */\ni.basic.icon.docs:before {\n  content: \'\e736\';\n}\n/* \'\' */\ni.basic.icon.dollar:before {\n  content: \'💵\';\n}\n/* \'\1f4b5\' */\ni.basic.icon.paint:before {\n  content: \'\e7b5\';\n}\n/* \'\' */\ni.basic.icon.edit:before {\n  content: \'\270d\';\n}\n/* \'✍\' */\ni.basic.icon.eject:before {\n  content: \'\2ecf\';\n}\n/* \'⻏\' */\ni.basic.icon.export:before {\n  content: \'\e715\';\n}\n/* \'\' */\ni.basic.icon.hide:before {\n  content: \'\e70b\';\n}\n/* \'\' */\ni.basic.icon.unhide:before {\n  content: \'\e80f\';\n}\n/* \'\' */\ni.basic.icon.facebook:before {\n  content: \'\f301\';\n}\n/* \'\' */\ni.basic.icon.fast-forward:before {\n  content: \'\e804\';\n}\n/* \'\' */\ni.basic.icon.fire:before {\n  content: \'🔥\';\n}\n/* \'\1f525\' */\ni.basic.icon.flag:before {\n  content: \'\2691\';\n}\n/* \'⚑\' */\ni.basic.icon.lightning:before {\n  content: \'\26a1\';\n}\n/* \'⚡\' */\ni.basic.icon.lab:before {\n  content: \'\68\';\n}\n/* \'h\' */\ni.basic.icon.flight:before {\n  content: \'\2708\';\n}\n/* \'✈\' */\ni.basic.icon.forward:before {\n  content: \'\27a6\';\n}\n/* \'➦\' */\ni.basic.icon.gift:before {\n  content: \'🎁\';\n}\n/* \'\1f381\' */\ni.basic.icon.github:before {\n  content: \'\f308\';\n}\n/* \'\' */\ni.basic.icon.globe:before {\n  content: \'\e817\';\n}\n/* \'\' */\ni.basic.icon.headphones:before {\n  content: \'🎧\';\n}\n/* \'\1f3a7\' */\ni.basic.icon.question:before {\n  content: \'\2753\';\n}\n/* \'❓\' */\ni.basic.icon.home:before {\n  content: \'\2302\';\n}\n/* \'⌂\' */\ni.basic.icon.i:before {\n  content: \'\2139\';\n}\n/* \'ℹ\' */\ni.basic.icon.idea:before {\n  content: \'💡\';\n}\n/* \'\1f4a1\' */\ni.basic.icon.open:before {\n  content: \'🔗\';\n}\n/* \'\1f517\' */\ni.basic.icon.content:before {\n  content: \'\e782\';\n}\n/* \'\' */\ni.basic.icon.location:before {\n  content: \'\e724\';\n}\n/* \'\' */\ni.basic.icon.mail:before {\n  content: \'\2709\';\n}\n/* \'✉\' */\ni.basic.icon.mic:before {\n  content: \'🎤\';\n}\n/* \'\1f3a4\' */\ni.basic.icon.minus:before {\n  content: \'\2d\';\n}\n/* \'-\' */\ni.basic.icon.money:before {\n  content: \'💰\';\n}\n/* \'\1f4b0\' */\ni.basic.icon.off:before {\n  content: \'\e78e\';\n}\n/* \'\' */\ni.basic.icon.pause:before {\n  content: \'\e808\';\n}\n/* \'\' */\ni.basic.icon.photos:before {\n  content: \'\e812\';\n}\n/* \'\' */\ni.basic.icon.photo:before {\n  content: \'🌄\';\n}\n/* \'\1f304\' */\ni.basic.icon.pin:before {\n  content: \'📌\';\n}\n/* \'\1f4cc\' */\ni.basic.icon.play:before {\n  content: \'\e809\';\n}\n/* \'\' */\ni.basic.icon.plus:before {\n  content: \'\2b\';\n}\n/* \'+\' */\ni.basic.icon.print:before {\n  content: \'\e716\';\n}\n/* \'\' */\ni.basic.icon.rss:before {\n  content: \'\e73a\';\n}\n/* \'\' */\ni.basic.icon.search:before {\n  content: \'🔍\';\n}\n/* \'\1f50d\' */\ni.basic.icon.shuffle:before {\n  content: \'\e803\';\n}\n/* \'\' */\ni.basic.icon.tag:before {\n  content: \'\e80a\';\n}\n/* \'\' */\ni.basic.icon.tags:before {\n  content: \'\e70d\';\n}\n/* \'\' */\ni.basic.icon.terminal:before {\n  content: \'\e7ac\';\n}\n/* \'\' */\ni.basic.icon.thumbs.down:before {\n  content: \'👎\';\n}\n/* \'\1f44e\' */\ni.basic.icon.thumbs.up:before {\n  content: \'👍\';\n}\n/* \'\1f44d\' */\ni.basic.icon.to-end:before {\n  content: \'\e806\';\n}\n/* \'\' */\ni.basic.icon.to-start:before {\n  content: \'\e805\';\n}\n/* \'\' */\ni.basic.icon.top.list:before {\n  content: \'🏆\';\n}\n/* \'\1f3c6\' */\ni.basic.icon.trash:before {\n  content: \'\e729\';\n}\n/* \'\' */\ni.basic.icon.twitter:before {\n  content: \'\f303\';\n}\n/* \'\' */\ni.basic.icon.upload:before {\n  content: \'\e711\';\n}\n/* \'\' */\ni.basic.icon.user.add:before {\n  content: \'\e700\';\n}\n/* \'\' */\ni.basic.icon.user:before {\n  content: \'👤\';\n}\n/* \'\1f464\' */\ni.basic.icon.community:before {\n  content: \'\e814\';\n}\n/* \'\' */\ni.basic.icon.users:before {\n  content: \'👥\';\n}\n/* \'\1f465\' */\ni.basic.icon.id:before {\n  content: \'\e722\';\n}\n/* \'\' */\ni.basic.icon.url:before {\n  content: \'🔗\';\n}\n/* \'\1f517\' */\ni.basic.icon.zoom.in:before {\n  content: \'\e750\';\n}\n/* \'\' */\ni.basic.icon.zoom.out:before {\n  content: \'\e751\';\n}\n/* \'\' */\n/*--------------\n   Spacing Fix\n---------------*/\n/* dropdown arrows are to the right */\ni.dropdown.basic.icon {\n  margin: 0em 0em 0em 0.5em;\n}\n/* stars are usually consecutive */\ni.basic.icon.star {\n  width: auto;\n  margin: 0em;\n}\n/* left side basic.icons */\ni.basic.icon.left,\ni.basic.icon.left,\ni.basic.icon.left {\n  width: auto;\n  margin: 0em 0.5em 0em 0em;\n}\n/* right side basic.icons */\ni.basic.icon.search,\ni.basic.icon.up,\ni.basic.icon.down,\ni.basic.icon.right {\n  width: auto;\n  margin: 0em 0em 0em 0.5em;\n}\n/*--------------\n     Aliases\n---------------*/\n/* aliases for convenience */\ni.basic.icon.delete:before {\n  content: \'\e80d\';\n}\n/* \'\' */\ni.basic.icon.dropdown:before {\n  content: \'\25be\';\n}\n/* \'▾\' */\ni.basic.icon.help:before {\n  content: \'\e704\';\n}\n/* \'\' */\ni.basic.icon.info:before {\n  content: \'\e705\';\n}\n/* \'\' */\ni.basic.icon.error:before {\n  content: \'\e80d\';\n}\n/* \'\' */\ni.basic.icon.dislike:before {\n  content: \'\2661\';\n}\n/* \'♡\' */\ni.basic.icon.like:before {\n  content: \'\2665\';\n}\n/* \'♥\' */\ni.basic.icon.eye:before {\n  content: \'\e80f\';\n}\n/* \'\' */\ni.basic.icon.eye.hidden:before {\n  content: \'\e70b\';\n}\n/* \'\' */\ni.basic.icon.date:before {\n  content: \'📅\';\n}\n/* \'\1f4c5\' */\n/*******************************\n             States\n*******************************/\ni.basic.icon.hover {\n  opacity: 1;\n}\ni.basic.icon.active {\n  opacity: 1;\n}\ni.emphasized.basic.icon {\n  opacity: 1;\n}\ni.basic.icon.disabled {\n  opacity: 0.3;\n}\n/*******************************\n           Variations\n*******************************/\n/*-------------------\n         Link\n--------------------*/\ni.link.basic.icon {\n  cursor: pointer;\n  opacity: 0.7;\n  -webkit-transition: opacity 0.3s ease-out;\n  -moz-transition: opacity 0.3s ease-out;\n  transition: opacity 0.3s ease-out;\n}\n.link.basic.icon:hover {\n  opacity: 1 !important;\n}\n/*-------------------\n      Circular\n--------------------*/\ni.circular.basic.icon {\n  border-radius: 500px !important;\n  padding: 0.5em 0em !important;\n  -webkit-box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  line-height: 1 !important;\n  width: 2em !important;\n  height: 2em !important;\n}\ni.circular.inverted.basic.icon {\n  border: none;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*-------------------\n      Flipped\n--------------------*/\ni.vertically.flipped.basic.icon {\n  -webkit-transform: scale(1, -1);\n  -moz-transform: scale(1, -1);\n  -ms-transform: scale(1, -1);\n  transform: scale(1, -1);\n}\ni.horizontally.flipped.basic.icon {\n  -webkit-transform: scale(-1, 1);\n  -moz-transform: scale(-1, 1);\n  -ms-transform: scale(-1, 1);\n  transform: scale(-1, 1);\n}\n/*-------------------\n        Rotated\n--------------------*/\ni.left.rotated.basic.icon {\n  -webkit-transform: rotate(-90deg);\n  -moz-transform: rotate(-90deg);\n  -ms-transform: rotate(-90deg);\n  transform: rotate(-90deg);\n}\ni.right.rotated.basic.icon {\n  -webkit-transform: rotate(90deg);\n  -moz-transform: rotate(90deg);\n  -ms-transform: rotate(90deg);\n  transform: rotate(90deg);\n}\n/*-------------------\n        Square\n--------------------*/\ni.square.basic.icon {\n  width: 2em;\n  height: 2em;\n  padding: 0.5em 0.35em !important;\n  -webkit-box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  vertical-align: baseline;\n}\ni.square.basic.icon:before {\n  vertical-align: middle;\n}\ni.square.inverted.basic.icon {\n  border: none;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*-------------------\n      Inverted\n--------------------*/\ni.inverted.basic.icon {\n  background-color: #222222;\n  color: #FFFFFF;\n}\n/*-------------------\n       Colors\n--------------------*/\ni.blue.basic.icon {\n  color: #6ECFF5 !important;\n}\ni.black.basic.icon {\n  color: #5C6166 !important;\n}\ni.green.basic.icon {\n  color: #A1CF64 !important;\n}\ni.red.basic.icon {\n  color: #D95C5C !important;\n}\ni.purple.basic.icon {\n  color: #564F8A !important;\n}\ni.teal.basic.icon {\n  color: #00B5AD !important;\n}\n/*-------------------\n   Inverted Colors\n--------------------*/\ni.inverted.black.basic.icon {\n  background-color: #5C6166 !important;\n  color: #FFFFFF !important;\n}\ni.inverted.blue.basic.icon {\n  background-color: #6ECFF5 !important;\n  color: #FFFFFF !important;\n}\ni.inverted.green.basic.icon {\n  background-color: #A1CF64 !important;\n  color: #FFFFFF !important;\n}\ni.inverted.red.basic.icon {\n  background-color: #D95C5C !important;\n  color: #FFFFFF !important;\n}\ni.inverted.purple.basic.icon {\n  background-color: #564F8A !important;\n  color: #FFFFFF !important;\n}\ni.inverted.teal.basic.icon {\n  background-color: #00B5AD !important;\n  color: #FFFFFF !important;\n}\n/*-------------------\n        Sizes\n--------------------*/\ni.small.basic.icon {\n  font-size: 0.875em;\n}\ni.basic.icon {\n  font-size: 1em;\n}\ni.large.basic.icon {\n  font-size: 1.5em;\n  margin-right: 0.2em;\n  vertical-align: middle;\n}\ni.big.basic.icon {\n  font-size: 2em;\n  margin-right: 0.5em;\n  vertical-align: middle;\n}\ni.huge.basic.icon {\n  font-size: 4em;\n  margin-right: 0.75em;\n  vertical-align: middle;\n}\ni.massive.basic.icon {\n  font-size: 8em;\n  margin-right: 1em;\n  vertical-align: middle;\n}\n\n/*\n * # Semantic - Button\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Button\n*******************************/\n/* Prototype */\n.ui.button {\n  cursor: pointer;\n  display: inline-block;\n  vertical-align: middle;\n  min-height: 1em;\n  outline: none;\n  border: none;\n  background-color: #FAFAFA;\n  color: #808080;\n  margin: 0em;\n  padding: 0.8em 1.5em;\n  font-size: 1rem;\n  text-transform: uppercase;\n  line-height: 1;\n  font-weight: bold;\n  font-style: normal;\n  text-align: center;\n  text-decoration: none;\n  background-image: -webkit-gradient(linear, left top, left bottom, from(rgba(0, 0, 0, 0)), to(rgba(0, 0, 0, 0.05)));\n  background-image: -webkit-linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.05));\n  background-image: -moz-linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.05));\n  background-image: linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.05));\n  border-radius: 0.25em;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.08) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.08) inset;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);\n  -webkit-transition: opacity 0.25s ease, background-color 0.25s ease, color 0.25s ease, background 0.25s ease, -webkit-box-shadow 0.25s ease;\n  -moz-transition: opacity 0.25s ease, background-color 0.25s ease, color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;\n  transition: opacity 0.25s ease, background-color 0.25s ease, color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;\n}\n/*******************************\n            States\n*******************************/\n/*--------------\n     Active\n---------------*/\n.ui.buttons .active.button,\n.ui.active.button {\n  background-color: #EAEAEA;\n  background-image: none;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.05) inset !important;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.05) inset !important;\n  color: rgba(0, 0, 0, 0.7);\n}\n/*--------------\n      Hover\n---------------*/\n.ui.button:hover {\n  background-image: -webkit-gradient(linear, left top, left bottom, from(rgba(0, 0, 0, 0)), to(rgba(0, 0, 0, 0.08)));\n  background-image: -webkit-linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.08));\n  background-image: -moz-linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.08));\n  background-image: linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.08));\n  color: rgba(0, 0, 0, 0.7);\n}\n.ui.button.active:hover {\n  background-image: none;\n}\n.ui.button:hover .icon,\n.ui.button.hover .icon {\n  opacity: 0.85;\n}\n/*--------------\n      Down\n---------------*/\n.ui.button:active,\n.ui.active.button:active {\n  background-color: #F1F1F1;\n  color: rgba(0, 0, 0, 0.7);\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.05) inset !important;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.05) inset !important;\n}\n/*--------------\n    Loading\n---------------*/\n.ui.loading.button {\n  position: relative;\n  cursor: default;\n  background-color: #FFFFFF !important;\n  color: transparent !important;\n  -webkit-transition: all 0s linear;\n  -moz-transition: all 0s linear;\n  transition: all 0s linear;\n}\n.ui.loading.button:after {\n  position: absolute;\n  top: 0em;\n  left: 0em;\n  width: 100%;\n  height: 100%;\n  content: \'\';\n  background: transparent url(../images/loader-mini.gif) no-repeat 50% 50%;\n}\n.ui.labeled.icon.loading.button .icon {\n  background-color: transparent;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*-------------------\n      Disabled\n--------------------*/\n.ui.disabled.button,\n.ui.disabled.button:hover,\n.ui.disabled.button.active {\n  background-color: #DDDDDD !important;\n  cursor: default;\n  color: rgba(0, 0, 0, 0.5) !important;\n  opacity: 0.3 !important;\n  background-image: none !important;\n  -webkit-box-shadow: none !important;\n  box-shadow: none !important;\n}\n/*******************************\n             Types\n*******************************/\n/*-------------------\n       Animated\n--------------------*/\n.ui.animated.button {\n  position: relative;\n  overflow: hidden;\n}\n.ui.animated.button .visible.content {\n  position: relative;\n}\n.ui.animated.button .hidden.content {\n  position: absolute;\n  width: 100%;\n}\n/* Horizontal */\n.ui.animated.button .visible.content,\n.ui.animated.button .hidden.content {\n  -webkit-transition: right 0.3s ease 0s;\n  -moz-transition: right 0.3s ease 0s;\n  transition: right 0.3s ease 0s;\n}\n.ui.animated.button .visible.content {\n  left: auto;\n  right: 0%;\n}\n.ui.animated.button .hidden.content {\n  top: 50%;\n  left: auto;\n  right: -100%;\n  margin-top: -0.55em;\n}\n.ui.animated.button:hover .visible.content {\n  left: auto;\n  right: 200%;\n}\n.ui.animated.button:hover .hidden.content {\n  left: auto;\n  right: 0%;\n}\n/* Vertical */\n.ui.vertical.animated.button .visible.content,\n.ui.vertical.animated.button .hidden.content {\n  -webkit-transition: top 0.3s ease 0s, -webkit-transform 0.3s ease 0s;\n  -moz-transition: top 0.3s ease 0s, -moz-transform 0.3s ease 0s;\n  transition: top 0.3s ease 0s, transform 0.3s ease 0s;\n}\n.ui.vertical.animated.button .visible.content {\n  -webkit-transform: translateY(0%);\n  -moz-transform: translateY(0%);\n  -ms-transform: translateY(0%);\n  transform: translateY(0%);\n  right: auto;\n}\n.ui.vertical.animated.button .hidden.content {\n  top: -100%;\n  left: 0%;\n  right: auto;\n}\n.ui.vertical.animated.button:hover .visible.content {\n  -webkit-transform: translateY(200%);\n  -moz-transform: translateY(200%);\n  -ms-transform: translateY(200%);\n  transform: translateY(200%);\n  right: auto;\n}\n.ui.vertical.animated.button:hover .hidden.content {\n  top: 50%;\n  right: auto;\n}\n/* Fade */\n.ui.fade.animated.button .visible.content,\n.ui.fade.animated.button .hidden.content {\n  -webkit-transition: opacity 0.3s ease 0s, -webkit-transform 0.3s ease 0s;\n  -moz-transition: opacity 0.3s ease 0s, -moz-transform 0.3s ease 0s;\n  transition: opacity 0.3s ease 0s, transform 0.3s ease 0s;\n}\n.ui.fade.animated.button .visible.content {\n  left: auto;\n  right: auto;\n  opacity: 1;\n  -webkit-transform: scale(1);\n  -moz-transform: scale(1);\n  -ms-transform: scale(1);\n  transform: scale(1);\n}\n.ui.fade.animated.button .hidden.content {\n  opacity: 0;\n  left: 0%;\n  right: auto;\n  -webkit-transform: scale(1.2);\n  -moz-transform: scale(1.2);\n  -ms-transform: scale(1.2);\n  transform: scale(1.2);\n}\n.ui.fade.animated.button:hover .visible.content {\n  left: auto;\n  right: auto;\n  opacity: 0;\n  -webkit-transform: scale(0.7);\n  -moz-transform: scale(0.7);\n  -ms-transform: scale(0.7);\n  transform: scale(0.7);\n}\n.ui.fade.animated.button:hover .hidden.content {\n  left: 0%;\n  right: auto;\n  opacity: 1;\n  -webkit-transform: scale(1);\n  -moz-transform: scale(1);\n  -ms-transform: scale(1);\n  transform: scale(1);\n}\n/*-------------------\n       Primary\n--------------------*/\n.ui.primary.buttons .button,\n.ui.primary.button {\n  background-color: #D95C5C;\n  color: #FFFFFF;\n}\n.ui.primary.buttons .button:hover,\n.ui.primary.button:hover,\n.ui.primary.buttons .active.button,\n.ui.primary.button.active {\n  background-color: #E75859;\n  color: #FFFFFF;\n}\n.ui.primary.buttons .button:active,\n.ui.primary.button:active {\n  background-color: #D24B4C;\n  color: #FFFFFF;\n}\n/*-------------------\n      Secondary\n--------------------*/\n.ui.secondary.buttons .button,\n.ui.secondary.button {\n  background-color: #00B5AD;\n  color: #FFFFFF;\n}\n.ui.secondary.buttons .button:hover,\n.ui.secondary.button:hover,\n.ui.secondary.buttons .active.button,\n.ui.secondary.button.active {\n  background-color: #009A93;\n  color: #FFFFFF;\n}\n.ui.secondary.buttons .button:active,\n.ui.secondary.button:active {\n  background-color: #00847E;\n  color: #FFFFFF;\n}\n/*-------------------\n       Social\n--------------------*/\n/* Facebook */\n.ui.facebook.button {\n  background-color: #3B579D;\n  color: #FFFFFF;\n}\n.ui.facebook.button:hover {\n  background-color: #3A59A9;\n  color: #FFFFFF;\n}\n.ui.facebook.button:active {\n  background-color: #334F95;\n  color: #FFFFFF;\n}\n/* Twitter */\n.ui.twitter.button {\n  background-color: #4092CC;\n  color: #FFFFFF;\n}\n.ui.twitter.button:hover {\n  background-color: #399ADE;\n  color: #FFFFFF;\n}\n.ui.twitter.button:active {\n  background-color: #3283BC;\n  color: #FFFFFF;\n}\n/* Google Plus */\n.ui.google.plus.button {\n  background-color: #D34836;\n  color: #FFFFFF;\n}\n.ui.google.plus.button:hover {\n  background-color: #E3432E;\n  color: #FFFFFF;\n}\n.ui.google.plus.button:active {\n  background-color: #CA3A27;\n  color: #FFFFFF;\n}\n/* Linked In */\n.ui.linkedin.button {\n  background-color: #1F88BE;\n  color: #FFFFFF;\n}\n.ui.linkedin.button:hover {\n  background-color: #1394D6;\n  color: #FFFFFF;\n}\n.ui.linkedin.button:active {\n  background-color: #1179AE;\n  color: #FFFFFF;\n}\n/* YouTube */\n.ui.youtube.button {\n  background-color: #CC181E;\n  color: #FFFFFF;\n}\n.ui.youtube.button:hover {\n  background-color: #DF0209;\n  color: #FFFFFF;\n}\n.ui.youtube.button:active {\n  background-color: #A50006;\n  color: #FFFFFF;\n}\n/* Instagram */\n.ui.instagram.button {\n  background-color: #49769C;\n  color: #FFFFFF;\n}\n.ui.instagram.button:hover {\n  background-color: #4781B1;\n  color: #FFFFFF;\n}\n.ui.instagram.button:active {\n  background-color: #38658A;\n  color: #FFFFFF;\n}\n/* Pinterest */\n.ui.pinterest.button {\n  background-color: #00ACED;\n  color: #FFFFFF;\n}\n.ui.pinterest.button:hover {\n  background-color: #00B9FF;\n  color: #FFFFFF;\n}\n.ui.pinterest.button:active {\n  background-color: #009EDA;\n  color: #FFFFFF;\n}\n/* vk.com */\n.ui.vk.button {\n  background-color: #4D7198;\n  color: #FFFFFF;\n}\n.ui.vk.button:hover {\n  background-color: #537AA5;\n  color: #FFFFFF;\n}\n.ui.vk.button:active {\n  background-color: #405E7E;\n  color: #FFFFFF;\n}\n/*--------------\n     Icon\n---------------*/\n.ui.button > .icon {\n  margin-right: 0.6em;\n  line-height: 1;\n  -webkit-transition: opacity 0.1s ease\n  ;\n  -moz-transition: opacity 0.1s ease\n  ;\n  transition: opacity 0.1s ease\n  ;\n}\n/*******************************\n           Variations\n*******************************/\n/*-------------------\n       Floated\n--------------------*/\n.ui.left.floated.buttons,\n.ui.left.floated.button {\n  float: left;\n  margin-right: 0.25em;\n}\n.ui.right.floated.buttons,\n.ui.right.floated.button {\n  float: right;\n  margin-left: 0.25em;\n}\n/*-------------------\n        Sizes\n--------------------*/\n.ui.buttons .button,\n.ui.button {\n  font-size: 1rem;\n}\n.ui.mini.buttons .button,\n.ui.mini.buttons .or,\n.ui.mini.button {\n  font-size: 0.8rem;\n}\n.ui.mini.buttons .button,\n.ui.mini.button {\n  padding: 0.6em 0.8em;\n}\n.ui.mini.icon.buttons .button,\n.ui.mini.buttons .icon.button {\n  padding: 0.6em 0.6em;\n}\n.ui.tiny.buttons .button,\n.ui.tiny.buttons .or,\n.ui.tiny.button {\n  font-size: 0.875em;\n}\n.ui.tiny.buttons .button,\n.ui.tiny.buttons .button,\n.ui.tiny.button {\n  padding: 0.6em 0.8em;\n}\n.ui.tiny.icon.buttons .button,\n.ui.tiny.buttons .icon.button {\n  padding: 0.6em 0.6em;\n}\n.ui.small.buttons .button,\n.ui.small.buttons .or,\n.ui.small.button {\n  font-size: 0.875rem;\n}\n.ui.large.buttons .button,\n.ui.large.buttons .or,\n.ui.large.button {\n  font-size: 1.125rem;\n}\n.ui.big.buttons .button,\n.ui.big.buttons .or,\n.ui.big.button {\n  font-size: 1.25rem;\n}\n.ui.huge.buttons .button,\n.ui.huge.buttons .or,\n.ui.huge.button {\n  font-size: 1.375rem;\n}\n.ui.massive.buttons .button,\n.ui.massive.buttons .or,\n.ui.massive.button {\n  font-size: 1.5rem;\n  font-weight: bold;\n}\n/* Or resize */\n.ui.tiny.buttons .or:before,\n.ui.mini.buttons .or:before {\n  width: 1.45em;\n  height: 1.55em;\n  line-height: 1.4;\n  margin-left: -0.725em;\n  margin-top: -0.25em;\n}\n.ui.tiny.buttons .or:after,\n.ui.mini.buttons .or:after {\n  height: 1.45em;\n}\n/* loading */\n.ui.huge.loading.button:after {\n  background-image: url(../images/loader-small.gif);\n}\n.ui.massive.buttons .loading.button:after,\n.ui.gigantic.buttons .loading.button:after,\n.ui.massive.loading.button:after,\n.ui.gigantic.loading.button:after {\n  background-image: url(../images/loader-medium.gif);\n}\n.ui.huge.loading.button:after,\n.ui.huge.loading.button.active:after {\n  background-image: url(../images/loader-small.gif);\n}\n.ui.massive.buttons .loading.button:after,\n.ui.gigantic.buttons .loading.button:after,\n.ui.massive.loading.button:after,\n.ui.gigantic.loading.button:after,\n.ui.massive.buttons .loading.button.active:after,\n.ui.gigantic.buttons .loading.button.active:after,\n.ui.massive.loading.button.active:after,\n.ui.gigantic.loading.button.active:after {\n  background-image: url(../images/loader-medium.gif);\n}\n/*--------------\n    Icon Only\n---------------*/\n.ui.icon.buttons .button,\n.ui.icon.button {\n  padding: 0.8em;\n}\n.ui.icon.buttons .button > .icon,\n.ui.icon.button > .icon {\n  opacity: 0.9;\n  margin: 0em;\n  vertical-align: top;\n}\n/*-------------------\n        Basic\n--------------------*/\n.ui.basic.buttons .button,\n.ui.basic.button {\n  background-color: transparent !important;\n  background-image: none;\n  color: #808080 !important;\n  font-weight: normal;\n  text-transform: none;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n}\n.ui.basic.buttons {\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  border-radius: 0.25em;\n}\n.ui.basic.buttons .button:hover,\n.ui.basic.button:hover {\n  background-image: none;\n  color: #7F7F7F !important;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.18) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.18) inset;\n}\n.ui.basic.buttons .button:active,\n.ui.basic.button:active {\n  background-color: rgba(0, 0, 0, 0.02) !important;\n  color: #7F7F7F !important;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n}\n.ui.basic.buttons .button.active,\n.ui.basic.button.active {\n  background-color: rgba(0, 0, 0, 0.05);\n  color: #7F7F7F;\n  -webkit-box-shadow: 0px 0px 0px 1px #BDBDBD inset;\n  box-shadow: 0px 0px 0px 1px #BDBDBD inset;\n}\n.ui.basic.buttons .button.active:hover,\n.ui.basic.button.active:hover {\n  background-color: rgba(0, 0, 0, 0.1);\n}\n/* Inverted */\n.ui.basic.inverted.buttons .button,\n.ui.basic.inverted.button {\n  color: #FAFAFA !important;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(255, 255, 255, 0.3) inset;\n  box-shadow: 0px 0px 0px 1px rgba(255, 255, 255, 0.3) inset;\n}\n.ui.basic.inverted.buttons .button:hover,\n.ui.basic.inverted.button:hover {\n  background-image: none;\n  color: #FFFFFF !important;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(255, 255, 255, 0.5) inset;\n  box-shadow: 0px 0px 0px 1px rgba(255, 255, 255, 0.5) inset;\n}\n.ui.basic.inverted.buttons .button:active,\n.ui.basic.inverted.button:active {\n  background-color: rgba(255, 255, 255, 0.05) !important;\n  color: #FFFFFF !important;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(255, 255, 255, 0.8) inset !important;\n  box-shadow: 0px 0px 0px 1px rgba(255, 255, 255, 0.8) inset !important;\n}\n.ui.basic.inverted.buttons .button.active,\n.ui.basic.inverted.button.active {\n  background-color: rgba(255, 255, 255, 0.5);\n  color: #FFFFFF;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.basic.inverted.buttons .button.active:hover,\n.ui.basic.inverted.button.active:hover {\n  background-color: rgba(0, 0, 0, 0.1);\n}\n/* Basic Group */\n.ui.basic.buttons .button {\n  border-left: 1px solid rgba(0, 0, 0, 0.1);\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.basic.buttons .button:hover,\n.ui.basic.buttons .button:active {\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.basic.buttons .button.active,\n.ui.basic.buttons .button.active:hover {\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.2) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.2) inset;\n}\n/*--------------\n   Labeled Icon\n---------------*/\n.ui.labeled.icon.buttons .button,\n.ui.labeled.icon.button {\n  position: relative;\n  padding-left: 4em !important;\n  padding-right: 1.4em !important;\n}\n.ui.labeled.icon.buttons > .button > .icon,\n.ui.labeled.icon.button > .icon {\n  position: absolute;\n  top: 0em;\n  left: 0em;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  width: 2.75em;\n  height: 100%;\n  padding-top: 0.8em;\n  background-color: rgba(0, 0, 0, 0.05);\n  text-align: center;\n  border-radius: 0.25em 0px 0px 0.25em;\n  line-height: 1;\n  -webkit-box-shadow: -1px 0px 0px 0px rgba(0, 0, 0, 0.05) inset;\n  box-shadow: -1px 0px 0px 0px rgba(0, 0, 0, 0.05) inset;\n}\n.ui.labeled.icon.buttons .button > .icon {\n  border-radius: 0em;\n}\n.ui.labeled.icon.buttons .button:first-child > .icon {\n  border-top-left-radius: 0.25em;\n  border-bottom-left-radius: 0.25em;\n}\n.ui.labeled.icon.buttons .button:last-child > .icon {\n  border-top-right-radius: 0.25em;\n  border-bottom-right-radius: 0.25em;\n}\n.ui.vertical.labeled.icon.buttons .button:first-child > .icon {\n  border-radius: 0em;\n  border-top-left-radius: 0.25em;\n}\n.ui.vertical.labeled.icon.buttons .button:last-child > .icon {\n  border-radius: 0em;\n  border-bottom-left-radius: 0.25em;\n}\n.ui.right.labeled.icon.button {\n  padding-left: 1.4em !important;\n  padding-right: 4em !important;\n}\n.ui.left.fluid.labeled.icon.button,\n.ui.right.fluid.labeled.icon.button {\n  padding-left: 1.4em !important;\n  padding-right: 1.4em !important;\n}\n.ui.right.labeled.icon.button .icon {\n  left: auto;\n  right: 0em;\n  border-radius: 0em 0.25em 0.25em 0em;\n  -webkit-box-shadow: 1px 0px 0px 0px rgba(0, 0, 0, 0.05) inset;\n  box-shadow: 1px 0px 0px 0px rgba(0, 0, 0, 0.05) inset;\n}\n/*--------------\n     Toggle\n---------------*/\n/* Toggle (Modifies active state to give affordances) */\n.ui.toggle.buttons .active.button,\n.ui.buttons .button.toggle.active,\n.ui.button.toggle.active {\n  background-color: #5BBD72 !important;\n  color: #FFFFFF !important;\n  -webkit-box-shadow: none !important;\n  box-shadow: none !important;\n}\n.ui.button.toggle.active:hover {\n  background-color: #58CB73 !important;\n  color: #FFFFFF !important;\n  -webkit-box-shadow: none !important;\n  box-shadow: none !important;\n}\n/*--------------\n    Circular\n---------------*/\n.ui.circular.button {\n  border-radius: 10em;\n}\n/*--------------\n     Attached\n---------------*/\n.ui.attached.button {\n  display: block;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) !important;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) !important;\n}\n.ui.attached.top.button {\n  border-radius: 0.25em 0.25em 0em 0em;\n}\n.ui.attached.bottom.button {\n  border-radius: 0em 0em 0.25em 0.25em;\n}\n.ui.attached.left.button {\n  display: inline-block;\n  border-left: none;\n  padding-right: 0.75em;\n  text-align: right;\n  border-radius: 0.25em 0em 0em 0.25em;\n}\n.ui.attached.right.button {\n  display: inline-block;\n  padding-left: 0.75em;\n  text-align: left;\n  border-radius: 0em 0.25em 0.25em 0em;\n}\n/*-------------------\n      Or Buttons\n--------------------*/\n.ui.buttons .or {\n  position: relative;\n  float: left;\n  width: 0.3em;\n  height: 1.1em;\n  z-index: 3;\n}\n.ui.buttons .or:before {\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  content: \'or\';\n  background-color: #FFFFFF;\n  margin-top: -0.1em;\n  margin-left: -0.9em;\n  width: 1.8em;\n  height: 1.8em;\n  line-height: 1.55;\n  color: #AAAAAA;\n  font-style: normal;\n  font-weight: normal;\n  text-align: center;\n  border-radius: 500px;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.buttons .or[data-text]:before {\n  content: attr(data-text);\n}\n.ui.buttons .or:after {\n  position: absolute;\n  top: 0em;\n  left: 0em;\n  content: \' \';\n  width: 0.3em;\n  height: 1.7em;\n  background-color: transparent;\n  border-top: 0.5em solid #FFFFFF;\n  border-bottom: 0.5em solid #FFFFFF;\n}\n/* Fluid Or */\n.ui.fluid.buttons .or {\n  width: 0em !important;\n}\n.ui.fluid.buttons .or:after {\n  display: none;\n}\n/*-------------------\n       Attached\n--------------------*/\n/* Plural Attached */\n.attached.ui.buttons {\n  margin: 0px;\n  border-radius: 4px 4px 0px 0px;\n}\n.attached.ui.buttons .button:first-child {\n  border-radius: 4px 0px 0px 0px;\n}\n.attached.ui.buttons .button:last-child {\n  border-radius: 0px 4px 0px 0px;\n}\n/* Bottom Side */\n.bottom.attached.ui.buttons {\n  margin-top: -1px;\n  border-radius: 0px 0px 4px 4px;\n}\n.bottom.attached.ui.buttons .button:first-child {\n  border-radius: 0px 0px 0px 4px;\n}\n.bottom.attached.ui.buttons .button:last-child {\n  border-radius: 0px 0px 4px 0px;\n}\n/* Left Side */\n.left.attached.ui.buttons {\n  margin-left: -1px;\n  border-radius: 0px 4px 4px 0px;\n}\n.left.attached.ui.buttons .button:first-child {\n  margin-left: -1px;\n  border-radius: 0px 4px 0px 0px;\n}\n.left.attached.ui.buttons .button:last-child {\n  margin-left: -1px;\n  border-radius: 0px 0px 4px 0px;\n}\n/* Right Side */\n.right.attached.ui.buttons,\n.right.attached.ui.buttons .button {\n  margin-right: -1px;\n  border-radius: 4px 0px 0px 4px;\n}\n.right.attached.ui.buttons .button:first-child {\n  margin-left: -1px;\n  border-radius: 4px 0px 0px 0px;\n}\n.right.attached.ui.buttons .button:last-child {\n  margin-left: -1px;\n  border-radius: 0px 0px 0px 4px;\n}\n/* Fluid */\n.ui.fluid.buttons,\n.ui.button.fluid,\n.ui.fluid.buttons > .button {\n  display: block;\n  width: 100%;\n}\n.ui.\32.buttons > .button,\n.ui.two.buttons > .button {\n  width: 50%;\n}\n.ui.\33.buttons > .button,\n.ui.three.buttons > .button {\n  width: 33.333%;\n}\n.ui.\34.buttons > .button,\n.ui.four.buttons > .button {\n  width: 25%;\n}\n.ui.\35.buttons > .button,\n.ui.five.buttons > .button {\n  width: 20%;\n}\n.ui.\36.buttons > .button,\n.ui.six.buttons > .button {\n  width: 16.666%;\n}\n.ui.\37.buttons > .button,\n.ui.seven.buttons > .button {\n  width: 14.285%;\n}\n.ui.\38.buttons > .button,\n.ui.eight.buttons > .button {\n  width: 12.500%;\n}\n.ui.\39.buttons > .button,\n.ui.nine.buttons > .button {\n  width: 11.11%;\n}\n.ui.\31\30.buttons > .button,\n.ui.ten.buttons > .button {\n  width: 10%;\n}\n.ui.\31\31.buttons > .button,\n.ui.eleven.buttons > .button {\n  width: 9.09%;\n}\n.ui.\31\32.buttons > .button,\n.ui.twelve.buttons > .button {\n  width: 8.3333%;\n}\n/* Fluid Vertical Buttons */\n.ui.fluid.vertical.buttons,\n.ui.fluid.vertical.buttons > .button {\n  display: block;\n  width: auto;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.\32.vertical.buttons > .button,\n.ui.two.vertical.buttons > .button {\n  height: 50%;\n}\n.ui.\33.vertical.buttons > .button,\n.ui.three.vertical.buttons > .button {\n  height: 33.333%;\n}\n.ui.\34.vertical.buttons > .button,\n.ui.four.vertical.buttons > .button {\n  height: 25%;\n}\n.ui.\35.vertical.buttons > .button,\n.ui.five.vertical.buttons > .button {\n  height: 20%;\n}\n.ui.\36.vertical.buttons > .button,\n.ui.six.vertical.buttons > .button {\n  height: 16.666%;\n}\n.ui.\37.vertical.buttons > .button,\n.ui.seven.vertical.buttons > .button {\n  height: 14.285%;\n}\n.ui.\38.vertical.buttons > .button,\n.ui.eight.vertical.buttons > .button {\n  height: 12.500%;\n}\n.ui.\39.vertical.buttons > .button,\n.ui.nine.vertical.buttons > .button {\n  height: 11.11%;\n}\n.ui.\31\30.vertical.buttons > .button,\n.ui.ten.vertical.buttons > .button {\n  height: 10%;\n}\n.ui.\31\31.vertical.buttons > .button,\n.ui.eleven.vertical.buttons > .button {\n  height: 9.09%;\n}\n.ui.\31\32.vertical.buttons > .button,\n.ui.twelve.vertical.buttons > .button {\n  height: 8.3333%;\n}\n/*-------------------\n       Colors\n--------------------*/\n/*--- Black ---*/\n.ui.black.buttons .button,\n.ui.black.button {\n  background-color: #5C6166;\n  color: #FFFFFF;\n}\n.ui.black.buttons .button:hover,\n.ui.black.button:hover {\n  background-color: #4C4C4C;\n  color: #FFFFFF;\n}\n.ui.black.buttons .button:active,\n.ui.black.button:active {\n  background-color: #333333;\n  color: #FFFFFF;\n}\n/*--- Green ---*/\n.ui.green.buttons .button,\n.ui.green.button {\n  background-color: #5BBD72;\n  color: #FFFFFF;\n}\n.ui.green.buttons .button:hover,\n.ui.green.button:hover,\n.ui.green.buttons .active.button,\n.ui.green.button.active {\n  background-color: #58cb73;\n  color: #FFFFFF;\n}\n.ui.green.buttons .button:active,\n.ui.green.button:active {\n  background-color: #4CB164;\n  color: #FFFFFF;\n}\n/*--- Red ---*/\n.ui.red.buttons .button,\n.ui.red.button {\n  background-color: #D95C5C;\n  color: #FFFFFF;\n}\n.ui.red.buttons .button:hover,\n.ui.red.button:hover,\n.ui.red.buttons .active.button,\n.ui.red.button.active {\n  background-color: #E75859;\n  color: #FFFFFF;\n}\n.ui.red.buttons .button:active,\n.ui.red.button:active {\n  background-color: #D24B4C;\n  color: #FFFFFF;\n}\n/*--- Orange ---*/\n.ui.orange.buttons .button,\n.ui.orange.button {\n  background-color: #E96633;\n  color: #FFFFFF;\n}\n.ui.orange.buttons .button:hover,\n.ui.orange.button:hover,\n.ui.orange.buttons .active.button,\n.ui.orange.button.active {\n  background-color: #FF7038;\n  color: #FFFFFF;\n}\n.ui.orange.buttons .button:active,\n.ui.orange.button:active {\n  background-color: #DA683B;\n  color: #FFFFFF;\n}\n/*--- Blue ---*/\n.ui.blue.buttons .button,\n.ui.blue.button {\n  background-color: #6ECFF5;\n  color: #FFFFFF;\n}\n.ui.blue.buttons .button:hover,\n.ui.blue.button:hover,\n.ui.blue.buttons .active.button,\n.ui.blue.button.active {\n  background-color: #1AB8F3;\n  color: #FFFFFF;\n}\n.ui.blue.buttons .button:active,\n.ui.blue.button:active {\n  background-color: #0AA5DF;\n  color: #FFFFFF;\n}\n/*--- Purple ---*/\n.ui.purple.buttons .button,\n.ui.purple.button {\n  background-color: #564F8A;\n  color: #FFFFFF;\n}\n.ui.purple.buttons .button:hover,\n.ui.purple.button:hover,\n.ui.purple.buttons .active.button,\n.ui.purple.button.active {\n  background-color: #3E3773;\n  color: #FFFFFF;\n}\n.ui.purple.buttons .button:active,\n.ui.purple.button:active {\n  background-color: #2E2860;\n  color: #FFFFFF;\n}\n/*--- Teal ---*/\n.ui.teal.buttons .button,\n.ui.teal.button {\n  background-color: #00B5AD;\n  color: #FFFFFF;\n}\n.ui.teal.buttons .button:hover,\n.ui.teal.button:hover,\n.ui.teal.buttons .active.button,\n.ui.teal.button.active {\n  background-color: #009A93;\n  color: #FFFFFF;\n}\n.ui.teal.buttons .button:active,\n.ui.teal.button:active {\n  background-color: #00847E;\n  color: #FFFFFF;\n}\n/*---------------\n    Positive\n----------------*/\n.ui.positive.buttons .button,\n.ui.positive.button {\n  background-color: #5BBD72 !important;\n  color: #FFFFFF;\n}\n.ui.positive.buttons .button:hover,\n.ui.positive.button:hover,\n.ui.positive.buttons .active.button,\n.ui.positive.button.active {\n  background-color: #58CB73 !important;\n  color: #FFFFFF;\n}\n.ui.positive.buttons .button:active,\n.ui.positive.button:active {\n  background-color: #4CB164 !important;\n  color: #FFFFFF;\n}\n/*---------------\n     Negative\n----------------*/\n.ui.negative.buttons .button,\n.ui.negative.button {\n  background-color: #D95C5C !important;\n  color: #FFFFFF;\n}\n.ui.negative.buttons .button:hover,\n.ui.negative.button:hover,\n.ui.negative.buttons .active.button,\n.ui.negative.button.active {\n  background-color: #E75859 !important;\n  color: #FFFFFF;\n}\n.ui.negative.buttons .button:active,\n.ui.negative.button:active {\n  background-color: #D24B4C !important;\n  color: #FFFFFF;\n}\n/*******************************\n            Groups\n*******************************/\n.ui.buttons {\n  display: inline-block;\n  vertical-align: middle;\n}\n.ui.buttons:after {\n  content: ".";\n  display: block;\n  height: 0;\n  clear: both;\n  visibility: hidden;\n}\n.ui.buttons .button:first-child {\n  border-left: none;\n}\n.ui.buttons .button {\n  float: left;\n  border-radius: 0em;\n}\n.ui.buttons .button:first-child {\n  margin-left: 0em;\n  border-top-left-radius: 0.25em;\n  border-bottom-left-radius: 0.25em;\n}\n.ui.buttons .button:last-child {\n  border-top-right-radius: 0.25em;\n  border-bottom-right-radius: 0.25em;\n}\n/* Vertical  Style */\n.ui.vertical.buttons {\n  display: inline-block;\n}\n.ui.vertical.buttons .button {\n  display: block;\n  float: none;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n}\n.ui.vertical.buttons .button:first-child,\n.ui.vertical.buttons .mini.button:first-child,\n.ui.vertical.buttons .tiny.button:first-child,\n.ui.vertical.buttons .small.button:first-child,\n.ui.vertical.buttons .massive.button:first-child,\n.ui.vertical.buttons .huge.button:first-child {\n  margin-top: 0px;\n  border-radius: 0.25em 0.25em 0px 0px;\n}\n.ui.vertical.buttons .button:last-child,\n.ui.vertical.buttons .mini.button:last-child,\n.ui.vertical.buttons .tiny.button:last-child,\n.ui.vertical.buttons .small.button:last-child,\n.ui.vertical.buttons .massive.button:last-child,\n.ui.vertical.buttons .huge.button:last-child,\n.ui.vertical.buttons .gigantic.button:last-child {\n  border-radius: 0px 0px 0.25em 0.25em;\n}\n\n/*\n * # Semantic - Divider\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Divider\n*******************************/\n.ui.divider {\n  margin: 1rem 0rem;\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  border-bottom: 1px solid rgba(255, 255, 255, 0.8);\n  line-height: 1;\n  height: 0em;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);\n}\n.ui.vertical.divider,\n.ui.horizontal.divider {\n  position: absolute;\n  border: none;\n  height: 0em;\n  margin: 0em;\n  background-color: transparent;\n  font-size: 0.875rem;\n  font-weight: bold;\n  text-align: center;\n  text-transform: uppercase;\n  color: rgba(0, 0, 0, 0.8);\n}\n/*--------------\n    Vertical\n---------------*/\n.ui.vertical.divider {\n  position: absolute;\n  z-index: 2;\n  top: 50%;\n  left: 50%;\n  margin: 0% 0% 0% -3%;\n  width: 6%;\n  height: 50%;\n  line-height: 0;\n  padding: 0em;\n}\n.ui.vertical.divider:before,\n.ui.vertical.divider:after {\n  position: absolute;\n  left: 50%;\n  content: " ";\n  z-index: 3;\n  border-left: 1px solid rgba(0, 0, 0, 0.1);\n  border-right: 1px solid rgba(255, 255, 255, 0.8);\n  width: 0%;\n  height: 80%;\n}\n.ui.vertical.divider:before {\n  top: -100%;\n}\n.ui.vertical.divider:after {\n  top: auto;\n  bottom: 0px;\n}\n/*--------------\n    Horizontal\n---------------*/\n.ui.horizontal.divider {\n  position: relative;\n  top: 0%;\n  left: 0%;\n  margin: 1rem 1.5rem;\n  height: auto;\n  padding: 0em;\n  line-height: 1;\n}\n.ui.horizontal.divider:before,\n.ui.horizontal.divider:after {\n  position: absolute;\n  content: " ";\n  z-index: 3;\n  width: 50%;\n  top: 50%;\n  height: 0%;\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  border-bottom: 1px solid rgba(255, 255, 255, 0.8);\n}\n.ui.horizontal.divider:before {\n  left: 0%;\n  margin-left: -1.5rem;\n}\n.ui.horizontal.divider:after {\n  left: auto;\n  right: 0%;\n  margin-right: -1.5rem;\n}\n/*--------------\n      Icon\n---------------*/\n.ui.divider > .icon {\n  margin: 0em;\n  font-size: 1rem;\n  vertical-align: middle;\n}\n/*******************************\n            Variations\n*******************************/\n/*--------------\n    Inverted\n---------------*/\n.ui.divider.inverted {\n  color: #ffffff;\n}\n.ui.vertical.inverted.divider,\n.ui.horizontal.inverted.divider {\n  color: rgba(255, 255, 255, 0.9);\n}\n.ui.divider.inverted,\n.ui.divider.inverted:after,\n.ui.divider.inverted:before {\n  border-top-color: rgba(0, 0, 0, 0.15);\n  border-bottom-color: rgba(255, 255, 255, 0.15);\n  border-left-color: rgba(0, 0, 0, 0.15);\n  border-right-color: rgba(255, 255, 255, 0.15);\n}\n/*--------------\n    Fitted\n---------------*/\n.ui.fitted.divider {\n  margin: 0em;\n}\n/*--------------\n    Clearing\n---------------*/\n.ui.clearing.divider {\n  clear: both;\n}\n/*--------------\n    Section\n---------------*/\n.ui.section.divider {\n  margin-top: 2rem;\n  margin-bottom: 2rem;\n}\n\n/*\n * # Semantic - Header\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Header\n*******************************/\n/* Standard */\n.ui.header {\n  border: none;\n  margin: 1em 0em 1rem;\n  padding: 0em;\n  font-size: 1.33em;\n  font-weight: bold;\n  line-height: 1.33;\n}\n.ui.header .sub.header {\n  font-size: 1rem;\n  font-weight: normal;\n  margin: 0em;\n  padding: 0em;\n  line-height: 1.2;\n  color: rgba(0, 0, 0, 0.5);\n}\n.ui.header .icon {\n  display: table-cell;\n  vertical-align: middle;\n  padding-right: 0.5em;\n}\n.ui.header .icon:only-child {\n  display: inline-block;\n  vertical-align: baseline;\n}\n.ui.header .content {\n  display: inline-block;\n  vertical-align: top;\n}\n.ui.header .icon + .content {\n  padding-left: 0.5em;\n  display: table-cell;\n}\n/* Positioning */\n.ui.header:first-child {\n  margin-top: 0em;\n}\n.ui.header:last-child {\n  margin-bottom: 0em;\n}\n.ui.header + p {\n  margin-top: 0em;\n}\n/*--------------\n  Page Heading\n---------------*/\nh1.ui.header {\n  min-height: 1rem;\n  line-height: 1.33;\n  font-size: 2rem;\n}\nh2.ui.header {\n  line-height: 1.33;\n  font-size: 1.75rem;\n}\nh3.ui.header {\n  line-height: 1.33;\n  font-size: 1.33rem;\n}\nh4.ui.header {\n  line-height: 1.33;\n  font-size: 1.1rem;\n}\nh5.ui.header {\n  line-height: 1.2;\n  font-size: 1rem;\n}\n/*--------------\n Content Heading\n---------------*/\n.ui.huge.header {\n  min-height: 1em;\n  font-size: 2em;\n}\n.ui.large.header {\n  font-size: 1.75em;\n}\n.ui.medium.header {\n  font-size: 1.33em;\n}\n.ui.small.header {\n  font-size: 1.1em;\n}\n.ui.tiny.header {\n  font-size: 1em;\n}\n/*******************************\n            Types\n*******************************/\n/*-------------------\n        Icon\n--------------------*/\n.ui.icon.header {\n  display: inline-block;\n  text-align: center;\n}\n.ui.icon.header .icon {\n  float: none;\n  display: block;\n  font-size: 3em;\n  margin: 0em auto 0.2em;\n  padding: 0em;\n}\n.ui.icon.header .content {\n  display: block;\n}\n.ui.icon.header .circular.icon,\n.ui.icon.header .square.icon {\n  font-size: 2em;\n}\n.ui.block.icon.header .icon {\n  margin-bottom: 0em;\n}\n.ui.icon.header.aligned {\n  margin-left: auto;\n  margin-right: auto;\n  display: block;\n}\n/*******************************\n            States\n*******************************/\n.ui.disabled.header {\n  opacity: 0.5;\n}\n/*******************************\n           Variations\n*******************************/\n/*-------------------\n       Colors\n--------------------*/\n.ui.blue.header {\n  color: #6ECFF5 !important;\n}\n.ui.black.header {\n  color: #5C6166 !important;\n}\n.ui.green.header {\n  color: #A1CF64 !important;\n}\n.ui.red.header {\n  color: #D95C5C !important;\n}\n.ui.purple.header {\n  color: #564F8A !important;\n}\n.ui.teal.header {\n  color: #00B5AD !important;\n}\n.ui.blue.dividing.header {\n  border-bottom: 3px solid #6ECFF5;\n}\n.ui.black.dividing.header {\n  border-bottom: 3px solid #5C6166;\n}\n.ui.green.dividing.header {\n  border-bottom: 3px solid #A1CF64;\n}\n.ui.red.dividing.header {\n  border-bottom: 3px solid #D95C5C;\n}\n.ui.purple.dividing.header {\n  border-bottom: 3px solid #564F8A;\n}\n.ui.teal.dividing.header {\n  border-bottom: 3px solid #00B5AD;\n}\n/*-------------------\n      Inverted\n--------------------*/\n.ui.inverted.header {\n  color: #FFFFFF;\n}\n.ui.inverted.header .sub.header {\n  color: rgba(255, 255, 255, 0.85);\n}\n/*-------------------\n   Inverted Colors\n--------------------*/\n.ui.inverted.black.header {\n  background-color: #5C6166 !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.blue.header {\n  background-color: #6ECFF5 !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.green.header {\n  background-color: #A1CF64 !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.red.header {\n  background-color: #D95C5C !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.purple.header {\n  background-color: #564F8A !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.teal.header {\n  background-color: #00B5AD !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.block.header {\n  border-bottom: none;\n}\n/*-------------------\n       Aligned\n--------------------*/\n.ui.left.aligned.header {\n  text-align: left;\n}\n.ui.right.aligned.header {\n  text-align: right;\n}\n.ui.center.aligned.header {\n  text-align: center;\n}\n.ui.justified.header {\n  text-align: justify;\n}\n.ui.justified.header:after {\n  display: inline-block;\n  content: \'\';\n  width: 100%;\n}\n/*-------------------\n       Floated\n--------------------*/\n.ui.floated.header,\n.ui.left.floated.header {\n  float: left;\n  margin-top: 0em;\n  margin-right: 0.5em;\n}\n.ui.right.floated.header {\n  float: right;\n  margin-top: 0em;\n  margin-left: 0.5em;\n}\n/*-------------------\n       Fittted\n--------------------*/\n.ui.fitted.header {\n  padding: 0em;\n}\n/*-------------------\n      Dividing\n--------------------*/\n.ui.dividing.header {\n  padding-bottom: 0.2rem;\n  border-bottom: 1px solid rgba(0, 0, 0, 0.1);\n}\n.ui.dividing.header .sub.header {\n  padding-bottom: 0.5em;\n}\n.ui.dividing.header .icon {\n  margin-bottom: 0.2em;\n}\n/*-------------------\n        Block\n--------------------*/\n.ui.block.header {\n  background-color: rgba(0, 0, 0, 0.05);\n  padding: 0.5em 1em;\n}\n/*-------------------\n       Attached\n--------------------*/\n.ui.attached.header {\n  background-color: #E0E0E0;\n  padding: 0.5em 1rem;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n}\n.ui.top.attached.header {\n  margin-bottom: 0em;\n  border-radius: 0.3125em 0.3125em 0em 0em;\n}\n.ui.bottom.attached.header {\n  margin-top: 0em;\n  border-radius: 0em 0em 0.3125em 0.3125em;\n}\n\n/*\n * # Semantic - Icon\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*!\n *  Font Awesome 3.2.1\n *  the iconic font designed for Bootstrap\n *  ------------------------------------------------------------------------------\n *  The full suite of pictographic icons, examples, and documentation can be\n *  found at http://fon.io.  Stay up to date on Twitter at\n *  http://twitter.com/fon.\n *\n *  License\n *  ------------------------------------------------------------------------------\n *  - The Font Awesome font is licensed under SIL OFL 1.1 -\n *    http://scripts.sil.org/OFL\n\n/*******************************\n             Icon\n*******************************/\n@font-face {\n  font-family: \'Icons\';\n  src: url(../fonts/icons.eot);\n  src: url(../fonts/icons.eot?#iefix) format(\'embedded-opentype\'), url(../fonts/icons.svg#icons) format(\'svg\'), url(../fonts/icons.woff) format(\'woff\'), url(../fonts/icons.ttf) format(\'truetype\');\n  font-style: normal;\n  font-weight: normal;\n  font-variant: normal;\n  text-decoration: inherit;\n  text-transform: none;\n}\ni.icon {\n  display: inline-block;\n  opacity: 0.75;\n  margin: 0em 0.25em 0em 0em;\n  width: 1.23em;\n  height: 1em;\n  font-family: \'Icons\';\n  font-style: normal;\n  line-height: 1;\n  font-weight: normal;\n  text-decoration: inherit;\n  text-align: center;\n  speak: none;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\ni.icon.left:before {\n  content: "\f060";\n}\ni.icon.right:before {\n  content: "\f061";\n}\ni.icon.add.sign.box:before {\n  content: "\f0fe";\n}\ni.icon.add.sign:before {\n  content: "\f055";\n}\ni.icon.add:before {\n  content: "\f067";\n}\ni.icon.adjust:before {\n  content: "\f042";\n}\ni.icon.adn:before {\n  content: "\f170";\n}\ni.icon.align.center:before {\n  content: "\f037";\n}\ni.icon.align.justify:before {\n  content: "\f039";\n}\ni.icon.align.left:before {\n  content: "\f036";\n}\ni.icon.align.right:before {\n  content: "\f038";\n}\ni.icon.ambulance:before {\n  content: "\f0f9";\n}\ni.icon.anchor:before {\n  content: "\f13d";\n}\ni.icon.android:before {\n  content: "\f17b";\n}\ni.icon.angle.down:before {\n  content: "\f107";\n}\ni.icon.angle.left:before {\n  content: "\f104";\n}\ni.icon.angle.right:before {\n  content: "\f105";\n}\ni.icon.angle.up:before {\n  content: "\f106";\n}\ni.icon.apple:before {\n  content: "\f179";\n}\ni.icon.archive:before {\n  content: "\f187";\n}\ni.icon.arrow.down:before {\n  content: "\f078";\n}\ni.icon.arrow.left:before {\n  content: "\f053";\n}\ni.icon.arrow.right:before {\n  content: "\f054";\n}\ni.icon.arrow.sign.down:before {\n  content: "\f13a";\n}\ni.icon.arrow.sign.left:before {\n  content: "\f137";\n}\ni.icon.arrow.sign.right:before {\n  content: "\f138";\n}\ni.icon.arrow.sign.up:before {\n  content: "\f139";\n}\ni.icon.arrow.up:before {\n  content: "\f077";\n}\ni.icon.asterisk:before {\n  content: "\f069";\n}\ni.icon.attachment:before {\n  content: "\f0c6";\n}\ni.icon.attention:before {\n  content: "\f06a";\n}\ni.icon.backward:before {\n  content: "\f04a";\n}\ni.icon.ban.circle:before {\n  content: "\f05e";\n}\ni.icon.bar.chart:before {\n  content: "\f080";\n}\ni.icon.barcode:before {\n  content: "\f02a";\n}\ni.icon.beer:before {\n  content: "\f0fc";\n}\ni.icon.bell.outline:before {\n  content: "\f0a2";\n}\ni.icon.bell:before {\n  content: "\f0f3";\n}\ni.icon.bitbucket.sign:before {\n  content: "\f172";\n}\ni.icon.bitbucket:before {\n  content: "\f171";\n}\ni.icon.bitcoin:before {\n  content: "\f15a";\n}\ni.icon.bold:before {\n  content: "\f032";\n}\ni.icon.bolt:before {\n  content: "\f0e7";\n}\ni.icon.book:before {\n  content: "\f02d";\n}\ni.icon.bookmark.empty:before {\n  content: "\f097";\n}\ni.icon.bookmark:before {\n  content: "\f02e";\n}\ni.icon.box.arrow.down:before {\n  content: "\f150";\n}\n/*rtl:ignore*/\ni.icon.box.arrow.right:before {\n  content: "\f152";\n}\ni.icon.box.arrow.up:before {\n  content: "\f151";\n}\ni.icon.briefcase:before {\n  content: "\f0b1";\n}\ni.icon.browser:before {\n  content: "\f022";\n}\ni.icon.bug:before {\n  content: "\f188";\n}\ni.icon.building:before {\n  content: "\f0f7";\n}\ni.icon.bullhorn:before {\n  content: "\f0a1";\n}\ni.icon.bullseye:before {\n  content: "\f140";\n}\ni.icon.calendar.empty:before {\n  content: "\f133";\n}\ni.icon.calendar:before {\n  content: "\f073";\n}\ni.icon.camera.retro:before {\n  content: "\f083";\n}\ni.icon.camera:before {\n  content: "\f030";\n}\ni.icon.triangle.down:before {\n  content: "\f0d7";\n}\ni.icon.triangle.left:before {\n  content: "\f0d9";\n}\ni.icon.triangle.right:before {\n  content: "\f0da";\n}\ni.icon.triangle.up:before {\n  content: "\f0d8";\n}\ni.icon.cart:before {\n  content: "\f07a";\n}\ni.icon.certificate:before {\n  content: "\f0a3";\n}\ni.icon.chat.outline:before {\n  content: "\f0e6";\n}\ni.icon.chat:before {\n  content: "\f086";\n}\ni.icon.checkbox.empty:before {\n  content: "\f096";\n}\ni.icon.checkbox.minus:before {\n  content: "\f147";\n}\ni.icon.checked.checkbox:before {\n  content: "\f046";\n}\ni.icon.checkmark.sign:before {\n  content: "\f14a";\n}\ni.icon.checkmark:before {\n  content: "\f00c";\n}\ni.icon.circle.blank:before {\n  content: "\f10c";\n}\ni.icon.circle.down:before {\n  content: "\f0ab";\n}\ni.icon.circle.left:before {\n  content: "\f0a8";\n}\ni.icon.circle.right:before {\n  content: "\f0a9";\n}\ni.icon.circle.up:before {\n  content: "\f0aa";\n}\ni.icon.circle:before {\n  content: "\f111";\n}\ni.icon.cloud.download:before {\n  content: "\f0ed";\n}\ni.icon.cloud.upload:before {\n  content: "\f0ee";\n}\ni.icon.cloud:before {\n  content: "\f0c2";\n}\ni.icon.code.fork:before {\n  content: "\f126";\n}\ni.icon.code:before {\n  content: "\f121";\n}\ni.icon.coffee:before {\n  content: "\f0f4";\n}\ni.icon.collapse:before {\n  content: "\f117";\n}\ni.icon.comment.outline:before {\n  content: "\f0e5";\n}\ni.icon.comment:before {\n  content: "\f075";\n}\ni.icon.copy:before {\n  content: "\f0c5";\n}\ni.icon.crop:before {\n  content: "\f125";\n}\ni.icon.css3:before {\n  content: "\f13c";\n}\ni.icon.cut:before {\n  content: "\f0c4";\n}\ni.icon.dashboard:before {\n  content: "\f0e4";\n}\ni.icon.desktop:before {\n  content: "\f108";\n}\ni.icon.doctor:before {\n  content: "\f0f0";\n}\ni.icon.dollar:before {\n  content: "\f155";\n}\ni.icon.double.angle.down:before {\n  content: "\f103";\n}\ni.icon.double.angle.left:before {\n  content: "\f100";\n}\ni.icon.double.angle.right:before {\n  content: "\f101";\n}\ni.icon.double.angle.up:before {\n  content: "\f102";\n}\ni.icon.down:before {\n  content: "\f063";\n}\ni.icon.download.disk:before {\n  content: "\f019";\n}\ni.icon.download:before {\n  content: "\f01a";\n}\ni.icon.dribbble:before {\n  content: "\f17d";\n}\ni.icon.dropbox:before {\n  content: "\f16b";\n}\ni.icon.edit.sign:before {\n  content: "\f14b";\n}\ni.icon.edit:before {\n  content: "\f044";\n}\ni.icon.eject:before {\n  content: "\f052";\n}\ni.icon.ellipsis.horizontal:before {\n  content: "\f141";\n}\ni.icon.ellipsis.vertical:before {\n  content: "\f142";\n}\ni.icon.eraser:before {\n  content: "\f12d";\n}\ni.icon.euro:before {\n  content: "\f153";\n}\ni.icon.exchange:before {\n  content: "\f0ec";\n}\ni.icon.exclamation:before {\n  content: "\f12a";\n}\ni.icon.expand:before {\n  content: "\f116";\n}\ni.icon.external.url.sign:before {\n  content: "\f14c";\n}\ni.icon.external.url:before {\n  content: "\f08e";\n}\ni.icon.facebook.sign:before {\n  content: "\f082";\n}\ni.icon.facebook:before {\n  content: "\f09a";\n}\ni.icon.facetime.video:before {\n  content: "\f03d";\n}\ni.icon.fast.backward:before {\n  content: "\f049";\n}\ni.icon.fast.forward:before {\n  content: "\f050";\n}\ni.icon.female:before {\n  content: "\f182";\n}\ni.icon.fighter.jet:before {\n  content: "\f0fb";\n}\ni.icon.file.outline:before {\n  content: "\f016";\n}\ni.icon.file.text.outline:before {\n  content: "\f0f6";\n}\ni.icon.file.text:before {\n  content: "\f15c";\n}\ni.icon.file:before {\n  content: "\f15b";\n}\ni.icon.filter:before {\n  content: "\f0b0";\n}\ni.icon.fire.extinguisher:before {\n  content: "\f134";\n}\ni.icon.fire:before {\n  content: "\f06d";\n}\ni.icon.flag.checkered:before {\n  content: "\f11e";\n}\ni.icon.flag.empty:before {\n  content: "\f11d";\n}\ni.icon.flag:before {\n  content: "\f024";\n}\ni.icon.flickr:before {\n  content: "\f16e";\n}\ni.icon.folder.open.outline:before {\n  content: "\f115";\n}\ni.icon.folder.open:before {\n  content: "\f07c";\n}\ni.icon.folder.outline:before {\n  content: "\f114";\n}\ni.icon.folder:before {\n  content: "\f07b";\n}\ni.icon.font:before {\n  content: "\f031";\n}\ni.icon.food:before {\n  content: "\f0f5";\n}\ni.icon.forward.mail:before {\n  content: "\f064";\n}\ni.icon.forward:before {\n  content: "\f04e";\n}\ni.icon.foursquare:before {\n  content: "\f180";\n}\ni.icon.frown:before {\n  content: "\f119";\n}\ni.icon.fullscreen:before {\n  content: "\f0b2";\n}\ni.icon.gamepad:before {\n  content: "\f11b";\n}\ni.icon.gift:before {\n  content: "\f06b";\n}\ni.icon.github.alternate:before {\n  content: "\f09b";\n}\ni.icon.github.sign:before {\n  content: "\f092";\n}\ni.icon.github:before {\n  content: "\f113";\n}\ni.icon.gittip:before {\n  content: "\f184";\n}\ni.icon.glass:before {\n  content: "\f000";\n}\ni.icon.globe:before {\n  content: "\f0ac";\n}\ni.icon.google.plus.sign:before {\n  content: "\f0d4";\n}\ni.icon.google.plus:before {\n  content: "\f0d5";\n}\ni.icon.h.sign:before {\n  content: "\f0fd";\n}\ni.icon.hand.down:before {\n  content: "\f0a7";\n}\ni.icon.hand.left:before {\n  content: "\f0a5";\n}\ni.icon.hand.right:before {\n  content: "\f0a4";\n}\ni.icon.hand.up:before {\n  content: "\f0a6";\n}\ni.icon.hdd:before {\n  content: "\f0a0";\n}\ni.icon.headphones:before {\n  content: "\f025";\n}\ni.icon.heart.empty:before {\n  content: "\f08a";\n}\ni.icon.heart:before {\n  content: "\f004";\n}\ni.icon.help:before {\n  content: "\f059";\n}\ni.icon.hide:before {\n  content: "\f070";\n}\ni.icon.home:before {\n  content: "\f015";\n}\ni.icon.hospital:before {\n  content: "\f0f8";\n}\ni.icon.html5:before {\n  content: "\f13b";\n}\ni.icon.inbox:before {\n  content: "\f01c";\n}\ni.icon.indent.left:before {\n  content: "\f03b";\n}\ni.icon.indent.right:before {\n  content: "\f03c";\n}\ni.icon.info.letter:before {\n  content: "\f129";\n}\ni.icon.info:before {\n  content: "\f05a";\n}\ni.icon.instagram:before {\n  content: "\f16d";\n}\ni.icon.italic:before {\n  content: "\f033";\n}\ni.icon.key:before {\n  content: "\f084";\n}\ni.icon.keyboard:before {\n  content: "\f11c";\n}\ni.icon.lab:before {\n  content: "\f0c3";\n}\ni.icon.laptop:before {\n  content: "\f109";\n}\ni.icon.layout.block:before {\n  content: "\f009";\n}\ni.icon.layout.column:before {\n  content: "\f0db";\n}\ni.icon.layout.grid:before {\n  content: "\f00a";\n}\ni.icon.layout.list:before {\n  content: "\f00b";\n}\ni.icon.leaf:before {\n  content: "\f06c";\n}\ni.icon.legal:before {\n  content: "\f0e3";\n}\ni.icon.lemon:before {\n  content: "\f094";\n}\ni.icon.level.down:before {\n  content: "\f149";\n}\ni.icon.level.up:before {\n  content: "\f148";\n}\ni.icon.lightbulb:before {\n  content: "\f0eb";\n}\ni.icon.linkedin.sign:before {\n  content: "\f08c";\n}\ni.icon.linkedin:before {\n  content: "\f0e1";\n}\ni.icon.linux:before {\n  content: "\f17c";\n}\ni.icon.list.ordered:before {\n  content: "\f0cb";\n}\ni.icon.list.unordered:before {\n  content: "\f0ca";\n}\ni.icon.list:before {\n  content: "\f03a";\n}\ni.icon.loading:before {\n  content: "\f110";\n}\ni.icon.location:before {\n  content: "\f124";\n}\ni.icon.lock:before {\n  content: "\f023";\n}\ni.icon.long.arrow.down:before {\n  content: "\f175";\n}\ni.icon.long.arrow.left:before {\n  content: "\f177";\n}\ni.icon.long.arrow.right:before {\n  content: "\f178";\n}\ni.icon.long.arrow.up:before {\n  content: "\f176";\n}\ni.icon.magic:before {\n  content: "\f0d0";\n}\ni.icon.magnet:before {\n  content: "\f076";\n}\ni.icon.mail.outline:before {\n  content: "\f003";\n}\ni.icon.mail.reply:before {\n  content: "\f112";\n}\ni.icon.mail:before {\n  content: "\f0e0";\n}\ni.icon.male:before {\n  content: "\f183";\n}\ni.icon.map.marker:before {\n  content: "\f041";\n}\ni.icon.map:before {\n  content: "\f14e";\n}\ni.icon.maxcdn:before {\n  content: "\f136";\n}\ni.icon.medkit:before {\n  content: "\f0fa";\n}\ni.icon.meh:before {\n  content: "\f11a";\n}\ni.icon.minus.sign.alternate:before {\n  content: "\f146";\n}\ni.icon.minus.sign:before {\n  content: "\f056";\n}\ni.icon.minus:before {\n  content: "\f068";\n}\ni.icon.mobile:before {\n  content: "\f10b";\n}\ni.icon.money:before {\n  content: "\f0d6";\n}\ni.icon.moon:before {\n  content: "\f186";\n}\ni.icon.move:before {\n  content: "\f047";\n}\ni.icon.music:before {\n  content: "\f001";\n}\ni.icon.mute:before {\n  content: "\f131";\n}\ni.icon.off:before {\n  content: "\f011";\n}\ni.icon.ok.circle:before {\n  content: "\f05d";\n}\ni.icon.ok.sign:before {\n  content: "\f058";\n}\ni.icon.paste:before {\n  content: "\f0ea";\n}\ni.icon.pause:before {\n  content: "\f04c";\n}\ni.icon.payment:before {\n  content: "\f09d";\n}\ni.icon.pencil:before {\n  content: "\f040";\n}\ni.icon.phone.sign:before {\n  content: "\f098";\n}\ni.icon.phone:before {\n  content: "\f095";\n}\ni.icon.photo:before {\n  content: "\f03e";\n}\ni.icon.pin:before {\n  content: "\f08d";\n}\ni.icon.pinterest.sign:before {\n  content: "\f0d3";\n}\ni.icon.pinterest:before {\n  content: "\f0d2";\n}\ni.icon.plane:before {\n  content: "\f072";\n}\ni.icon.play.circle:before {\n  content: "\f01d";\n}\ni.icon.play.sign:before {\n  content: "\f144";\n}\ni.icon.play:before {\n  content: "\f04b";\n}\ni.icon.pound:before {\n  content: "\f154";\n}\ni.icon.print:before {\n  content: "\f02f";\n}\ni.icon.puzzle.piece:before {\n  content: "\f12e";\n}\ni.icon.qr.code:before {\n  content: "\f029";\n}\ni.icon.question:before {\n  content: "\f128";\n}\ni.icon.quote.left:before {\n  content: "\f10d";\n}\ni.icon.quote.right:before {\n  content: "\f10e";\n}\ni.icon.refresh:before {\n  content: "\f021";\n}\ni.icon.remove.circle:before {\n  content: "\f05c";\n}\ni.icon.remove.sign:before {\n  content: "\f057";\n}\ni.icon.remove:before {\n  content: "\f00d";\n}\ni.icon.renren:before {\n  content: "\f18b";\n}\ni.icon.reorder:before {\n  content: "\f0c9";\n}\ni.icon.repeat:before {\n  content: "\f01e";\n}\ni.icon.reply.all.mail:before {\n  content: "\f122";\n}\ni.icon.resize.full:before {\n  content: "\f065";\n}\ni.icon.resize.horizontal:before {\n  content: "\f07e";\n}\ni.icon.resize.small:before {\n  content: "\f066";\n}\ni.icon.resize.vertical:before {\n  content: "\f07d";\n}\ni.icon.retweet:before {\n  content: "\f079";\n}\ni.icon.road:before {\n  content: "\f018";\n}\ni.icon.rocket:before {\n  content: "\f135";\n}\ni.icon.rss.sign:before {\n  content: "\f143";\n}\ni.icon.rss:before {\n  content: "\f09e";\n}\ni.icon.rupee:before {\n  content: "\f156";\n}\ni.icon.save:before {\n  content: "\f0c7";\n}\ni.icon.screenshot:before {\n  content: "\f05b";\n}\ni.icon.search:before {\n  content: "\f002";\n}\ni.icon.setting:before {\n  content: "\f013";\n}\ni.icon.settings:before {\n  content: "\f085";\n}\ni.icon.share.sign:before {\n  content: "\f14d";\n}\ni.icon.share:before {\n  content: "\f045";\n}\ni.icon.shield:before {\n  content: "\f132";\n}\ni.icon.shuffle:before {\n  content: "\f074";\n}\ni.icon.sign.in:before {\n  content: "\f090";\n}\ni.icon.sign.out:before {\n  content: "\f08b";\n}\ni.icon.sign:before {\n  content: "\f0c8";\n}\ni.icon.signal:before {\n  content: "\f012";\n}\ni.icon.sitemap:before {\n  content: "\f0e8";\n}\ni.icon.skype:before {\n  content: "\f17e";\n}\ni.icon.smile:before {\n  content: "\f118";\n}\ni.icon.sort.ascending:before {\n  content: "\f0de";\n}\ni.icon.sort.descending:before {\n  content: "\f0dd";\n}\ni.icon.sort.alphabet.descending:before {\n  content: "\f15e";\n}\ni.icon.sort.alphabet:before {\n  content: "\f15d";\n}\ni.icon.sort.attributes.descending:before {\n  content: "\f161";\n}\ni.icon.sort.attributes:before {\n  content: "\f160";\n}\ni.icon.sort.order.descending:before {\n  content: "\f163";\n}\ni.icon.sort.order:before {\n  content: "\f162";\n}\ni.icon.sort:before {\n  content: "\f0dc";\n}\ni.icon.stackexchange:before {\n  content: "\f16c";\n}\ni.icon.star.empty:before {\n  content: "\f006";\n}\ni.icon.star.half.empty:before {\n  content: "\f123";\n}\ni.icon.star.half.full:before,\ni.icon.star.half:before {\n  content: "\f089";\n}\ni.icon.star:before {\n  content: "\f005";\n}\ni.icon.step.backward:before {\n  content: "\f048";\n}\ni.icon.step.forward:before {\n  content: "\f051";\n}\ni.icon.stethoscope:before {\n  content: "\f0f1";\n}\ni.icon.stop:before {\n  content: "\f04d";\n}\ni.icon.strikethrough:before {\n  content: "\f0cc";\n}\ni.icon.subscript:before {\n  content: "\f12c";\n}\ni.icon.suitcase:before {\n  content: "\f0f2";\n}\ni.icon.sun:before {\n  content: "\f185";\n}\ni.icon.superscript:before {\n  content: "\f12b";\n}\ni.icon.table:before {\n  content: "\f0ce";\n}\ni.icon.tablet:before {\n  content: "\f10a";\n}\ni.icon.tag:before {\n  content: "\f02b";\n}\ni.icon.tags:before {\n  content: "\f02c";\n}\ni.icon.tasks:before {\n  content: "\f0ae";\n}\ni.icon.terminal:before {\n  content: "\f120";\n}\ni.icon.text.height:before {\n  content: "\f034";\n}\ni.icon.text.width:before {\n  content: "\f035";\n}\ni.icon.thumbs.down.outline:before {\n  content: "\f088";\n}\ni.icon.thumbs.down:before {\n  content: "\f165";\n}\ni.icon.thumbs.up.outline:before {\n  content: "\f087";\n}\ni.icon.thumbs.up:before {\n  content: "\f164";\n}\ni.icon.ticket:before {\n  content: "\f145";\n}\ni.icon.time:before {\n  content: "\f017";\n}\ni.icon.tint:before {\n  content: "\f043";\n}\ni.icon.trash:before {\n  content: "\f014";\n}\ni.icon.trello:before {\n  content: "\f181";\n}\ni.icon.trophy:before {\n  content: "\f091";\n}\ni.icon.truck:before {\n  content: "\f0d1";\n}\ni.icon.tumblr.sign:before {\n  content: "\f174";\n}\ni.icon.tumblr:before {\n  content: "\f173";\n}\ni.icon.twitter.sign:before {\n  content: "\f081";\n}\ni.icon.twitter:before {\n  content: "\f099";\n}\ni.icon.umbrella:before {\n  content: "\f0e9";\n}\ni.icon.underline:before {\n  content: "\f0cd";\n}\ni.icon.undo:before {\n  content: "\f0e2";\n}\ni.icon.unhide:before {\n  content: "\f06e";\n}\ni.icon.unlink:before {\n  content: "\f127";\n}\ni.icon.unlock.alternate:before {\n  content: "\f13e";\n}\ni.icon.unlock:before {\n  content: "\f09c";\n}\ni.icon.unmute:before {\n  content: "\f130";\n}\ni.icon.up:before {\n  content: "\f062";\n}\ni.icon.upload.disk:before {\n  content: "\f093";\n}\ni.icon.upload:before {\n  content: "\f01b";\n}\ni.icon.url:before {\n  content: "\f0c1";\n}\ni.icon.user:before {\n  content: "\f007";\n}\ni.icon.users:before {\n  content: "\f0c0";\n}\ni.icon.video:before {\n  content: "\f008";\n}\ni.icon.vk:before {\n  content: "\f189";\n}\ni.icon.volume.down:before {\n  content: "\f027";\n}\ni.icon.volume.off:before {\n  content: "\f026";\n}\ni.icon.volume.up:before {\n  content: "\f028";\n}\ni.icon.warning:before {\n  content: "\f071";\n}\ni.icon.weibo:before {\n  content: "\f18a";\n}\ni.icon.windows:before {\n  content: "\f17a";\n}\ni.icon.won:before {\n  content: "\f159";\n}\ni.icon.wrench:before {\n  content: "\f0ad";\n}\ni.icon.xing.sign:before {\n  content: "\f169";\n}\ni.icon.xing:before {\n  content: "\f168";\n}\ni.icon.yen:before {\n  content: "\f157";\n}\ni.icon.youtube.play:before {\n  content: "\f16a";\n}\ni.icon.youtube.sign:before {\n  content: "\f166";\n}\ni.icon.youtube:before {\n  content: "\f167";\n}\ni.icon.yuan:before {\n  content: "\f158";\n}\ni.icon.zoom.in:before {\n  content: "\f00e";\n}\ni.icon.zoom.out:before {\n  content: "\f010";\n}\n/*--------------\n    Aliases\n---------------*/\ni.icon.check:before {\n  content: "\f00c";\n}\ni.icon.close:before {\n  content: "\f00d";\n}\ni.icon.delete:before {\n  content: "\f00d";\n}\ni.icon.like:before {\n  content: "\f004";\n}\ni.icon.plus:before {\n  content: "\f067";\n}\ni.icon.signup:before {\n  content: "\f044";\n}\n/*--------------\n   Spacing Fix\n---------------*/\n/* stars are usually consecutive */\ni.icon.star {\n  width: auto;\n  margin: 0em;\n}\n/* left side icons */\ni.icon.left {\n  width: auto;\n  margin: 0em 0.5em 0em 0em;\n}\n/* right side icons */\ni.icon.search,\ni.icon.right {\n  width: auto;\n  margin: 0em 0em 0em 0.5em;\n}\n/*******************************\n             Types\n*******************************/\n/*--------------\n    Loading\n---------------*/\ni.icon.loading {\n  -webkit-animation: icon-loading 2s linear infinite;\n  -moz-animation: icon-loading 2s linear infinite;\n  -ms-animation: icon-loading 2s linear infinite;\n  animation: icon-loading 2s linear infinite;\n}\n@keyframes icon-loading {\n  from {\n    -webkit-transform: rotate(0deg);\n    -moz-transform: rotate(0deg);\n    -ms-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n  to {\n    -webkit-transform: rotate(360deg);\n    -moz-transform: rotate(360deg);\n    -ms-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n@-moz-keyframes icon-loading {\n  from {\n    -moz-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n  to {\n    -moz-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n@-webkit-keyframes icon-loading {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n@-ms-keyframes icon-loading {\n  from {\n    -ms-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n  to {\n    -ms-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n/*******************************\n             States\n*******************************/\ni.icon.hover {\n  opacity: 1;\n}\ni.icon.active {\n  opacity: 1;\n}\ni.emphasized.icon {\n  opacity: 1;\n}\ni.icon.disabled {\n  opacity: 0.3;\n}\n/*******************************\n           Variations\n*******************************/\n/*-------------------\n         Link\n--------------------*/\ni.link.icon {\n  cursor: pointer;\n  opacity: 0.7;\n  -webkit-transition: opacity 0.3s ease-out;\n  -moz-transition: opacity 0.3s ease-out;\n  transition: opacity 0.3s ease-out;\n}\ni.link.icon:hover {\n  opacity: 1 !important;\n}\n/*-------------------\n      Circular\n--------------------*/\ni.circular.icon {\n  border-radius: 500em !important;\n  padding: 0.5em 0.35em !important;\n  -webkit-box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  line-height: 1 !important;\n  width: 2em !important;\n  height: 2em !important;\n}\ni.circular.inverted.icon {\n  border: none;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*-------------------\n      Flipped\n--------------------*/\ni.flipped.icon,\ni.horizontally.flipped.icon {\n  -webkit-transform: scale(-1, 1);\n  -moz-transform: scale(-1, 1);\n  -ms-transform: scale(-1, 1);\n  transform: scale(-1, 1);\n}\ni.vertically.flipped.icon {\n  -webkit-transform: scale(1, -1);\n  -moz-transform: scale(1, -1);\n  -ms-transform: scale(1, -1);\n  transform: scale(1, -1);\n}\n/*-------------------\n      Rotated\n--------------------*/\ni.rotated.icon,\ni.right.rotated.icon,\ni.clockwise.rotated.icon {\n  -webkit-transform: rotate(90deg);\n  -moz-transform: rotate(90deg);\n  -ms-transform: rotate(90deg);\n  transform: rotate(90deg);\n}\ni.left.rotated.icon,\ni.counterclockwise.rotated.icon {\n  -webkit-transform: rotate(-90deg);\n  -moz-transform: rotate(-90deg);\n  -ms-transform: rotate(-90deg);\n  transform: rotate(-90deg);\n}\n/*-------------------\n        Square\n--------------------*/\ni.square.icon {\n  width: 2em;\n  height: 2em;\n  padding: 0.5em 0.35em !important;\n  -webkit-box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  vertical-align: baseline;\n}\ni.square.inverted.icon {\n  border: none;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*-------------------\n      Inverted\n--------------------*/\ni.inverted.icon {\n  background-color: #222222;\n  color: #FFFFFF;\n  -moz-osx-font-smoothing: grayscale;\n}\n/*-------------------\n       Colors\n--------------------*/\ni.blue.icon {\n  color: #6ECFF5 !important;\n}\ni.black.icon {\n  color: #5C6166 !important;\n}\ni.green.icon {\n  color: #A1CF64 !important;\n}\ni.red.icon {\n  color: #D95C5C !important;\n}\ni.purple.icon {\n  color: #564F8A !important;\n}\ni.orange.icon {\n  color: #F05940 !important;\n}\ni.teal.icon {\n  color: #00B5AD !important;\n}\n/*-------------------\n   Inverted Colors\n--------------------*/\ni.inverted.black.icon {\n  background-color: #5C6166 !important;\n  color: #FFFFFF !important;\n}\ni.inverted.blue.icon {\n  background-color: #6ECFF5 !important;\n  color: #FFFFFF !important;\n}\ni.inverted.green.icon {\n  background-color: #A1CF64 !important;\n  color: #FFFFFF !important;\n}\ni.inverted.red.icon {\n  background-color: #D95C5C !important;\n  color: #FFFFFF !important;\n}\ni.inverted.purple.icon {\n  background-color: #564F8A !important;\n  color: #FFFFFF !important;\n}\ni.inverted.orange.icon {\n  background-color: #F05940 !important;\n  color: #FFFFFF !important;\n}\ni.inverted.teal.icon {\n  background-color: #00B5AD !important;\n  color: #FFFFFF !important;\n}\n/*-------------------\n        Sizes\n--------------------*/\ni.small.icon {\n  font-size: 0.875em;\n}\ni.icon {\n  font-size: 1em;\n}\ni.large.icon {\n  font-size: 1.5em;\n  vertical-align: middle;\n}\ni.big.icon {\n  font-size: 2em;\n  vertical-align: middle;\n}\ni.huge.icon {\n  font-size: 4em;\n  vertical-align: middle;\n}\ni.massive.icon {\n  font-size: 8em;\n  vertical-align: middle;\n}\n\n/*\n * # Semantic - Image\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n             Image\n*******************************/\n.ui.image {\n  position: relative;\n  display: inline-block;\n  vertical-align: middle;\n  max-width: 100%;\n  background-color: rgba(0, 0, 0, 0.05);\n}\nimg.ui.image {\n  display: block;\n  background: none;\n}\n.ui.image img {\n  display: block;\n  max-width: 100%;\n  height: auto;\n}\n/*******************************\n            States\n*******************************/\n.ui.disabled.image {\n  cursor: default;\n  opacity: 0.3;\n}\n/*******************************\n          Variations\n*******************************/\n/*--------------\n     Rounded\n---------------*/\n.ui.rounded.images .image,\n.ui.rounded.images img,\n.ui.rounded.image img,\n.ui.rounded.image {\n  border-radius: 0.3125em;\n}\n/*--------------\n     Circular\n---------------*/\n.ui.circular.images .image,\n.ui.circular.images img,\n.ui.circular.image img,\n.ui.circular.image {\n  border-radius: 500rem;\n}\n/*--------------\n     Fluid\n---------------*/\n.ui.fluid.images,\n.ui.fluid.image,\n.ui.fluid.images img,\n.ui.fluid.image img {\n  display: block;\n  width: 100%;\n}\n/*--------------\n     Avatar\n---------------*/\n.ui.avatar.images .image,\n.ui.avatar.images img,\n.ui.avatar.image img,\n.ui.avatar.image {\n  margin-right: 0.5em;\n  display: inline-block;\n  width: 2em;\n  height: 2em;\n  border-radius: 500rem;\n}\n/*-------------------\n       Floated\n--------------------*/\n.ui.floated.image,\n.ui.floated.images {\n  float: left;\n  margin-right: 1em;\n  margin-bottom: 1em;\n}\n.ui.right.floated.images,\n.ui.right.floated.image {\n  float: right;\n  margin-bottom: 1em;\n  margin-left: 1em;\n}\n/*--------------\n     Sizes\n---------------*/\n.ui.tiny.images .image,\n.ui.tiny.images img,\n.ui.tiny.image {\n  width: 20px;\n  font-size: 0.7rem;\n}\n.ui.mini.images .image,\n.ui.mini.images img,\n.ui.mini.image {\n  width: 35px;\n  font-size: 0.8rem;\n}\n.ui.small.images .image,\n.ui.small.images img,\n.ui.small.image {\n  width: 80px;\n  font-size: 0.9rem;\n}\n.ui.medium.images .image,\n.ui.medium.images img,\n.ui.medium.image {\n  width: 300px;\n  font-size: 1rem;\n}\n.ui.large.images .image,\n.ui.large.images img,\n.ui.large.image {\n  width: 450px;\n  font-size: 1.1rem;\n}\n.ui.huge.images .image,\n.ui.huge.images img,\n.ui.huge.image {\n  width: 600px;\n  font-size: 1.2rem;\n}\n/*******************************\n              Groups\n*******************************/\n.ui.images {\n  font-size: 0em;\n  margin: 0em -0.25rem 0rem;\n}\n.ui.images .image,\n.ui.images img {\n  display: inline-block;\n  margin: 0em 0.25em 0.5em;\n}\n\n/*\n * # Semantic - Input\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n           Standard\n*******************************/\n/*--------------------\n        Inputs\n---------------------*/\n.ui.input {\n  display: inline-block;\n  position: relative;\n  color: rgba(0, 0, 0, 0.7);\n}\n.ui.input input {\n  width: 100%;\n  font-family: "Helvetica Neue", "Helvetica", Arial;\n  margin: 0em;\n  padding: 0.65em 1em;\n  font-size: 1em;\n  background-color: #FFFFFF;\n  border: 1px solid rgba(0, 0, 0, 0.15);\n  outline: none;\n  color: rgba(0, 0, 0, 0.7);\n  border-radius: 0.3125em;\n  -webkit-transition: background-color 0.3s ease-out, -webkit-box-shadow 0.2s ease, border-color 0.2s ease;\n  -moz-transition: background-color 0.3s ease-out, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.3s ease-out, box-shadow 0.2s ease, border-color 0.2s ease;\n  -webkit-tap-highlight-color: rgba(255, 255, 255, 0);\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n/*--------------------\n      Placeholder\n---------------------*/\n/* browsers require these rules separate */\n.ui.input::-webkit-input-placeholder {\n  color: #BBBBBB;\n}\n.ui.input::-moz-placeholder {\n  color: #BBBBBB;\n}\n/*******************************\n            States\n*******************************/\n/*--------------------\n        Active\n---------------------*/\n.ui.input input:active,\n.ui.input.down input {\n  border-color: rgba(0, 0, 0, 0.3);\n  background-color: #FAFAFA;\n}\n/*--------------------\n        Loading\n---------------------*/\n.ui.loading.input > .icon {\n  background: url(../images/loader-mini.gif) no-repeat 50% 50%;\n}\n.ui.loading.input > .icon:before,\n.ui.loading.input > .icon:after {\n  display: none;\n}\n/*--------------------\n        Focus\n---------------------*/\n.ui.input.focus input,\n.ui.input input:focus {\n  border-color: rgba(0, 0, 0, 0.2);\n  color: rgba(0, 0, 0, 0.85);\n}\n.ui.input.focus input input::-webkit-input-placeholder,\n.ui.input input:focus input::-webkit-input-placeholder {\n  color: #AAAAAA;\n}\n.ui.input.focus input input::-moz-placeholder,\n.ui.input input:focus input::-moz-placeholder {\n  color: #AAAAAA;\n}\n/*--------------------\n        Error\n---------------------*/\n.ui.input.error input {\n  background-color: #FFFAFA;\n  border-color: #E7BEBE;\n  color: #D95C5C;\n}\n/* Error Placeholder */\n.ui.input.error input ::-webkit-input-placeholder {\n  color: rgba(255, 80, 80, 0.4);\n}\n.ui.input.error input ::-moz-placeholder {\n  color: rgba(255, 80, 80, 0.4);\n}\n.ui.input.error input :focus::-webkit-input-placeholder {\n  color: rgba(255, 80, 80, 0.7);\n}\n.ui.input.error input :focus::-moz-placeholder {\n  color: rgba(255, 80, 80, 0.7);\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------------\n      Transparent\n---------------------*/\n.ui.transparent.input input {\n  border: none;\n  background-color: transparent;\n}\n/*--------------------\n         Icon\n---------------------*/\n.ui.icon.input > .icon {\n  cursor: default;\n  position: absolute;\n  opacity: 0.5;\n  top: 0px;\n  right: 0px;\n  margin: 0em;\n  width: 2.6em;\n  height: 100%;\n  padding-top: 0.82em;\n  text-align: center;\n  border-radius: 0em 0.3125em 0.3125em 0em;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  -webkit-transition: opacity 0.3s ease-out;\n  -moz-transition: opacity 0.3s ease-out;\n  transition: opacity 0.3s ease-out;\n}\n.ui.icon.input > .link.icon {\n  cursor: pointer;\n}\n.ui.icon.input input {\n  padding-right: 3em !important;\n}\n.ui.icon.input > .circular.icon {\n  top: 0.35em;\n  right: 0.5em;\n}\n/* Left Side */\n.ui.left.icon.input > .icon {\n  right: auto;\n  left: 1px;\n  border-radius: 0.3125em 0em 0em 0.3125em;\n}\n.ui.left.icon.input > .circular.icon {\n  right: auto;\n  left: 0.5em;\n}\n.ui.left.icon.input > input {\n  padding-left: 3em !important;\n  padding-right: 1.2em !important;\n}\n/* Focus */\n.ui.icon.input > input:focus ~ .icon {\n  opacity: 1;\n}\n/*--------------------\n        Labeled\n---------------------*/\n.ui.labeled.input .corner.label {\n  font-size: 0.7em;\n  border-radius: 0 0.3125em;\n}\n.ui.labeled.input .left.corner.label {\n  border-radius: 0.3125em 0;\n}\n.ui.labeled.input input {\n  padding-right: 2.5em !important;\n}\n/* Spacing with corner label */\n.ui.labeled.icon.input:not(.left) > input {\n  padding-right: 3.25em !important;\n}\n.ui.labeled.icon.input:not(.left) > .icon {\n  margin-right: 1.25em;\n}\n/*--------------------\n        Action\n---------------------*/\n.ui.action.input {\n  display: table;\n}\n.ui.action.input > input {\n  display: table-cell;\n  border-top-right-radius: 0px !important;\n  border-bottom-right-radius: 0px !important;\n  border-right: none;\n}\n.ui.action.input > .button,\n.ui.action.input > .buttons {\n  display: table-cell;\n  border-top-left-radius: 0px;\n  border-bottom-left-radius: 0px;\n  white-space: nowrap;\n}\n.ui.action.input > .button > .icon,\n.ui.action.input > .buttons > .button > .icon {\n  display: inline;\n  vertical-align: top;\n}\n.ui.fluid.action.input {\n  display: table;\n  width: 100%;\n}\n.ui.fluid.action.input > .button {\n  width: 0.01%;\n}\n/*--------------------\n        Fluid\n---------------------*/\n.ui.fluid.input {\n  display: block;\n}\n/*--------------------\n        Size\n---------------------*/\n.ui.mini.input {\n  font-size: 0.8125em;\n}\n.ui.small.input {\n  font-size: 0.875em;\n}\n.ui.input {\n  font-size: 1em;\n}\n.ui.large.input {\n  font-size: 1.125em;\n}\n.ui.big.input {\n  font-size: 1.25em;\n}\n.ui.huge.input {\n  font-size: 1.375em;\n}\n.ui.massive.input {\n  font-size: 1.5em;\n}\n\n/*\n * # Semantic - Label\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Label\n*******************************/\n.ui.label {\n  display: inline-block;\n  vertical-align: middle;\n  margin: -0.25em 0.25em 0em;\n  background-color: #E8E8E8;\n  border-color: #E8E8E8;\n  padding: 0.5em 0.8em;\n  color: rgba(0, 0, 0, 0.65);\n  text-transform: uppercase;\n  font-weight: normal;\n  border-radius: 0.325em;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  -webkit-transition: background 0.1s linear\n  ;\n  -moz-transition: background 0.1s linear\n  ;\n  transition: background 0.1s linear\n  ;\n}\n.ui.label:first-child {\n  margin-left: 0em;\n}\n.ui.label:last-child {\n  margin-right: 0em;\n}\n/* Link */\na.ui.label {\n  cursor: pointer;\n}\n/* Inside Link */\n.ui.label a {\n  cursor: pointer;\n  color: inherit;\n  opacity: 0.8;\n  -webkit-transition: 0.2s opacity ease;\n  -moz-transition: 0.2s opacity ease;\n  transition: 0.2s opacity ease;\n}\n.ui.label a:hover {\n  opacity: 1;\n}\n/* Detail */\n.ui.label .detail {\n  display: inline-block;\n  margin-left: 0.5em;\n  font-weight: bold;\n  opacity: 0.8;\n}\n/* Icon */\n.ui.label .icon {\n  width: auto;\n}\n/* Removable label */\n.ui.label .delete.icon {\n  cursor: pointer;\n  margin: 0em 0em 0em 0.5em;\n  opacity: 0.7;\n  -webkit-transition: background 0.1s linear\n  ;\n  -moz-transition: background 0.1s linear\n  ;\n  transition: background 0.1s linear\n  ;\n}\n.ui.label .delete.icon:hover {\n  opacity: 0.99;\n}\n/*-------------------\n       Coupling\n--------------------*/\n/* Padding on next content after a label */\n.ui.segment > .attached.label:first-child + * {\n  margin-top: 2.5em;\n}\n.ui.segment > .bottom.attached.label:first-child ~ :last-child {\n  margin-top: 0em;\n  margin-bottom: 2.5em;\n}\n/*******************************\n             Types\n*******************************/\n.ui.image.label {\n  width: auto !important;\n  margin-top: 0em;\n  margin-bottom: 0em;\n  padding-top: 0.4em;\n  padding-bottom: 0.4em;\n  line-height: 1.5em;\n  vertical-align: baseline;\n  text-transform: none;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n}\n.ui.image.label img {\n  display: inline-block;\n  height: 2.25em;\n  margin: -0.4em 0.8em -0.4em -0.8em;\n  vertical-align: top;\n  border-radius: 0.325em 0em 0em 0.325em;\n}\n/*******************************\n             States\n*******************************/\n/*-------------------\n      Disabled\n--------------------*/\n.ui.label.disabled {\n  opacity: 0.5;\n}\n/*-------------------\n        Hover\n--------------------*/\na.ui.labels .label:hover,\na.ui.label:hover {\n  background-color: #E0E0E0;\n  border-color: #E0E0E0;\n  color: rgba(0, 0, 0, 0.7);\n}\n.ui.labels a.label:hover:before,\na.ui.label:hover:before {\n  background-color: #E0E0E0;\n  color: rgba(0, 0, 0, 0.7);\n}\n/*-------------------\n      Visible\n--------------------*/\n.ui.labels.visible .label,\n.ui.label.visible {\n  display: inline-block !important;\n}\n/*-------------------\n      Hidden\n--------------------*/\n.ui.labels.hidden .label,\n.ui.label.hidden {\n  display: none !important;\n}\n/*******************************\n           Variations\n*******************************/\n/*-------------------\n         Tag\n--------------------*/\n.ui.tag.labels .label,\n.ui.tag.label {\n  margin-left: 1em;\n  position: relative;\n  padding: 0.33em 1.3em 0.33em 1.4em;\n  border-radius: 0px 3px 3px 0px;\n}\n.ui.tag.labels .label:before,\n.ui.tag.label:before {\n  position: absolute;\n  top: 0.3em;\n  left: 0.3em;\n  content: \'\';\n  margin-left: -1em;\n  background-image: none;\n  width: 1.5em;\n  height: 1.5em;\n  -webkit-transform: rotate(45deg);\n  -moz-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n  -webkit-transition: background 0.1s linear\n    ;\n  -moz-transition: background 0.1s linear\n    ;\n  transition: background 0.1s linear\n    ;\n}\n.ui.tag.labels .label:after,\n.ui.tag.label:after {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: -0.25em;\n  margin-top: -0.3em;\n  background-color: #FFFFFF;\n  width: 0.55em;\n  height: 0.55em;\n  -webkit-box-shadow: 0 -1px 1px 0 rgba(0, 0, 0, 0.3);\n  box-shadow: 0 -1px 1px 0 rgba(0, 0, 0, 0.3);\n  border-radius: 100px 100px 100px 100px;\n}\n/*-------------------\n       Ribbon\n--------------------*/\n.ui.ribbon.label {\n  position: relative;\n  margin: 0em 0.2em;\n  left: -2rem;\n  padding-left: 2rem;\n  border-radius: 0px 4px 4px 0px;\n  border-color: rgba(0, 0, 0, 0.15);\n}\n.ui.ribbon.label:after {\n  position: absolute;\n  content: "";\n  top: 100%;\n  left: 0%;\n  border-top: 0em solid transparent;\n  border-right-width: 1em;\n  border-right-color: inherit;\n  border-right-style: solid;\n  border-bottom: 1em solid transparent;\n  border-left: 0em solid transparent;\n  width: 0em;\n  height: 0em;\n}\n/*-------------------\n       Attached\n--------------------*/\n.ui.top.attached.label,\n.ui.attached.label {\n  width: 100%;\n  position: absolute;\n  margin: 0em;\n  top: 0em;\n  left: 0em;\n  padding: 0.75em 1em;\n  border-radius: 4px 4px 0em 0em;\n}\n.ui.bottom.attached.label {\n  top: auto;\n  bottom: 0em;\n  border-radius: 0em 0em 4px 4px;\n}\n.ui.top.left.attached.label {\n  width: auto;\n  margin-top: 0em !important;\n  border-radius: 4px 0em 4px 0em;\n}\n.ui.top.right.attached.label {\n  width: auto;\n  left: auto;\n  right: 0em;\n  border-radius: 0em 4px 0em 4px;\n}\n.ui.bottom.left.attached.label {\n  width: auto;\n  top: auto;\n  bottom: 0em;\n  border-radius: 4px 0em 0em 4px;\n}\n.ui.bottom.right.attached.label {\n  top: auto;\n  bottom: 0em;\n  left: auto;\n  right: 0em;\n  width: auto;\n  border-radius: 4px 0em 4px 0em;\n}\n/*-------------------\n    Corner Label\n--------------------*/\n.ui.corner.label {\n  background-color: transparent;\n  position: absolute;\n  top: 0em;\n  right: 0em;\n  z-index: 10;\n  margin: 0em;\n  width: 3em;\n  height: 3em;\n  padding: 0em;\n  text-align: center;\n  -webkit-transition: color 0.2s ease;\n  -moz-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n.ui.corner.label:after {\n  position: absolute;\n  content: "";\n  right: 0em;\n  top: 0em;\n  z-index: -1;\n  width: 0em;\n  height: 0em;\n  border-top: 0em solid transparent;\n  border-right: 3em solid transparent;\n  border-bottom: 3em solid transparent;\n  border-left: 0em solid transparent;\n  border-right-color: inherit;\n  -webkit-transition: border-color 0.2s ease;\n  -moz-transition: border-color 0.2s ease;\n  transition: border-color 0.2s ease;\n}\n.ui.corner.label .icon {\n  font-size: 0.875em;\n  margin: 0.5em 0em 0em 1.25em;\n}\n.ui.corner.label .text {\n  display: inline-block;\n  font-weight: bold;\n  margin: 0.5em 0em 0em 1em;\n  width: 2.5em;\n  font-size: 0.875em;\n  text-align: center;\n  -webkit-transform: rotate(45deg);\n  -moz-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n}\n/* Coupling */\n.ui.rounded.image > .ui.corner.label,\n.ui.input > .ui.corner.label,\n.ui.segment > .ui.corner.label {\n  overflow: hidden;\n}\n.ui.segment > .ui.corner.label {\n  top: -1px;\n  right: -1px;\n}\n.ui.segment > .ui.left.corner.label {\n  right: auto;\n  left: -1px;\n}\n.ui.input > .ui.corner.label {\n  top: 1px;\n  right: 1px;\n}\n.ui.input > .ui.right.corner.label {\n  right: auto;\n  left: 1px;\n}\n/* Left Corner */\n.ui.left.corner.label,\n.ui.left.corner.label:after {\n  right: auto;\n  left: 0em;\n}\n.ui.left.corner.label:after {\n  border-top: 3em solid transparent;\n  border-right: 3em solid transparent;\n  border-bottom: 0em solid transparent;\n  border-left: 0em solid transparent;\n  border-top-color: inherit;\n}\n.ui.left.corner.label .icon {\n  margin: 0.5em 0em 0em -1em;\n}\n.ui.left.corner.label .text {\n  margin: 0.5em 0em 0em -1em;\n  -webkit-transform: rotate(-45deg);\n  -moz-transform: rotate(-45deg);\n  -ms-transform: rotate(-45deg);\n  transform: rotate(-45deg);\n}\n/* Hover */\n.ui.corner.label:hover {\n  background-color: transparent;\n}\n/*-------------------\n       Fluid\n--------------------*/\n.ui.label.fluid,\n.ui.fluid.labels > .label {\n  width: 100%;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n/*-------------------\n       Inverted\n--------------------*/\n.ui.inverted.labels .label,\n.ui.inverted.label {\n  color: #FFFFFF !important;\n}\n/*-------------------\n       Colors\n--------------------*/\n/*--- Black ---*/\n.ui.black.labels .label,\n.ui.black.label {\n  background-color: #5C6166 !important;\n  border-color: #5C6166 !important;\n  color: #FFFFFF !important;\n}\n.ui.labels .black.label:before,\n.ui.black.labels .label:before,\n.ui.black.label:before {\n  background-color: #5C6166 !important;\n}\n/* Hover */\na.ui.black.labels .label:hover,\na.ui.black.label:hover {\n  background-color: #333333 !important;\n  border-color: #333333 !important;\n}\n.ui.labels a.black.label:hover:before,\n.ui.black.labels a.label:hover:before,\na.ui.black.label:hover:before {\n  background-color: #333333 !important;\n}\n/* Corner */\n.ui.black.corner.label,\n.ui.black.corner.label:hover {\n  background-color: transparent !important;\n}\n/* Ribbon */\n.ui.black.ribbon.label {\n  border-color: #333333 !important;\n}\n/*--- Green ---*/\n.ui.green.labels .label,\n.ui.green.label {\n  background-color: #A1CF64 !important;\n  border-color: #A1CF64 !important;\n  color: #FFFFFF !important;\n}\n.ui.labels .green.label:before,\n.ui.green.labels .label:before,\n.ui.green.label:before {\n  background-color: #A1CF64 !important;\n}\n/* Hover */\na.ui.green.labels .label:hover,\na.ui.green.label:hover {\n  background-color: #89B84C !important;\n  border-color: #89B84C !important;\n}\n.ui.labels a.green.label:hover:before,\n.ui.green.labels a.label:hover:before,\na.ui.green.label:hover:before {\n  background-color: #89B84C !important;\n}\n/* Corner */\n.ui.green.corner.label,\n.ui.green.corner.label:hover {\n  background-color: transparent !important;\n}\n/* Ribbon */\n.ui.green.ribbon.label {\n  border-color: #89B84C !important;\n}\n/*--- Red ---*/\n.ui.red.labels .label,\n.ui.red.label {\n  background-color: #D95C5C !important;\n  border-color: #D95C5C !important;\n  color: #FFFFFF !important;\n}\n.ui.labels .red.label:before,\n.ui.red.labels .label:before,\n.ui.red.label:before {\n  background-color: #D95C5C !important;\n}\n/* Corner */\n.ui.red.corner.label,\n.ui.red.corner.label:hover {\n  background-color: transparent !important;\n}\n/* Hover */\na.ui.red.labels .label:hover,\na.ui.red.label:hover {\n  background-color: #DE3859 !important;\n  border-color: #DE3859 !important;\n  color: #FFFFFF !important;\n}\n.ui.labels a.red.label:hover:before,\n.ui.red.labels a.label:hover:before,\na.ui.red.label:hover:before {\n  background-color: #DE3859 !important;\n}\n/* Ribbon */\n.ui.red.ribbon.label {\n  border-color: #DE3859 !important;\n}\n/*--- Blue ---*/\n.ui.blue.labels .label,\n.ui.blue.label {\n  background-color: #6ECFF5 !important;\n  border-color: #6ECFF5 !important;\n  color: #FFFFFF !important;\n}\n.ui.labels .blue.label:before,\n.ui.blue.labels .label:before,\n.ui.blue.label:before {\n  background-color: #6ECFF5 !important;\n}\n/* Hover */\na.ui.blue.labels .label:hover,\n.ui.blue.labels a.label:hover,\na.ui.blue.label:hover {\n  background-color: #1AB8F3 !important;\n  border-color: #1AB8F3 !important;\n  color: #FFFFFF !important;\n}\n.ui.labels a.blue.label:hover:before,\n.ui.blue.labels a.label:hover:before,\na.ui.blue.label:hover:before {\n  background-color: #1AB8F3 !important;\n}\n/* Corner */\n.ui.blue.corner.label,\n.ui.blue.corner.label:hover {\n  background-color: transparent !important;\n}\n/* Ribbon */\n.ui.blue.ribbon.label {\n  border-color: #1AB8F3 !important;\n}\n/*--- Purple ---*/\n.ui.purple.labels .label,\n.ui.purple.label {\n  background-color: #564F8A !important;\n  border-color: #564F8A !important;\n  color: #FFFFFF !important;\n}\n.ui.labels .purple.label:before,\n.ui.purple.labels .label:before,\n.ui.purple.label:before {\n  background-color: #564F8A !important;\n}\n/* Hover */\na.ui.purple.labels .label:hover,\n.ui.purple.labels a.label:hover,\na.ui.purple.label:hover {\n  background-color: #3E3773 !important;\n  border-color: #3E3773 !important;\n  color: #FFFFFF !important;\n}\n.ui.labels a.purple.label:hover:before,\n.ui.purple.labels a.label:hover:before,\na.ui.purple.label:hover:before {\n  background-color: #3E3773 !important;\n}\n/* Corner */\n.ui.purple.corner.label,\n.ui.purple.corner.label:hover {\n  background-color: transparent !important;\n}\n/* Ribbon */\n.ui.purple.ribbon.label {\n  border-color: #3E3773 !important;\n}\n/*--- Orange ---*/\n.ui.orange.labels .label,\n.ui.orange.label {\n  background-color: #F05940 !important;\n  border-color: #F05940 !important;\n  color: #FFFFFF !important;\n}\n.ui.labels .orange.label:before,\n.ui.orange.labels .label:before,\n.ui.orange.label:before {\n  background-color: #F05940 !important;\n}\n/* Hover */\na.ui.orange.labels .label:hover,\n.ui.orange.labels a.label:hover,\na.ui.orange.label:hover {\n  background-color: #FF4121 !important;\n  border-color: #FF4121 !important;\n  color: #FFFFFF !important;\n}\n.ui.labels a.orange.label:hover:before,\n.ui.orange.labels a.label:hover:before,\na.ui.orange.label:hover:before {\n  background-color: #FF4121 !important;\n}\n/* Corner */\n.ui.orange.corner.label,\n.ui.orange.corner.label:hover {\n  background-color: transparent !important;\n}\n/* Ribbon */\n.ui.orange.ribbon.label {\n  border-color: #FF4121 !important;\n}\n/*--- Teal ---*/\n.ui.teal.labels .label,\n.ui.teal.label {\n  background-color: #00B5AD !important;\n  border-color: #00B5AD !important;\n  color: #FFFFFF !important;\n}\n.ui.labels .teal.label:before,\n.ui.teal.labels .label:before,\n.ui.teal.label:before {\n  background-color: #00B5AD !important;\n}\n/* Hover */\na.ui.teal.labels .label:hover,\n.ui.teal.labels a.label:hover,\na.ui.teal.label:hover {\n  background-color: #009A93 !important;\n  border-color: #009A93 !important;\n  color: #FFFFFF !important;\n}\n.ui.labels a.teal.label:hover:before,\n.ui.teal.labels a.label:hover:before,\na.ui.teal.label:hover:before {\n  background-color: #009A93 !important;\n}\n/* Corner */\n.ui.teal.corner.label,\n.ui.teal.corner.label:hover {\n  background-color: transparent !important;\n}\n/* Ribbon */\n.ui.teal.ribbon.label {\n  border-color: #009A93 !important;\n}\n/*-------------------\n     Horizontal\n--------------------*/\n.ui.horizontal.labels .label,\n.ui.horizontal.label {\n  margin: -0.125em 0.5em -0.125em 0em;\n  padding: 0.35em 1em;\n  min-width: 6em;\n  text-align: center;\n}\n/*-------------------\n       Circular\n--------------------*/\n.ui.circular.labels .label,\n.ui.circular.label {\n  min-height: 1em;\n  max-height: 2em;\n  padding: 0.5em !important;\n  line-height: 1em;\n  text-align: center;\n  border-radius: 500rem;\n}\n/*-------------------\n       Pointing\n--------------------*/\n.ui.pointing.label {\n  position: relative;\n}\n.ui.attached.pointing.label {\n  position: absolute;\n}\n.ui.pointing.label:before {\n  position: absolute;\n  content: "";\n  width: 0.6em;\n  height: 0.6em;\n  background-image: none;\n  -webkit-transform: rotate(45deg);\n  -moz-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n  z-index: 2;\n  -webkit-transition: background 0.1s linear\n  ;\n  -moz-transition: background 0.1s linear\n  ;\n  transition: background 0.1s linear\n  ;\n}\n/*--- Above ---*/\n.ui.pointing.label:before {\n  background-color: #E8E8E8;\n}\n.ui.pointing.label,\n.ui.pointing.above.label {\n  margin-top: 1em;\n}\n.ui.pointing.label:before,\n.ui.pointing.above.label:before {\n  margin-left: -0.3em;\n  top: -0.3em;\n  left: 50%;\n}\n/*--- Below ---*/\n.ui.pointing.below.label {\n  margin-top: 0em;\n  margin-bottom: 1em;\n}\n.ui.pointing.below.label:before {\n  margin-left: -0.3em;\n  top: auto;\n  right: auto;\n  bottom: -0.3em;\n  left: 50%;\n}\n/*--- Left ---*/\n.ui.pointing.left.label {\n  margin-top: 0em;\n  margin-left: 1em;\n}\n.ui.pointing.left.label:before {\n  margin-top: -0.3em;\n  bottom: auto;\n  right: auto;\n  top: 50%;\n  left: 0em;\n}\n/*--- Right ---*/\n.ui.pointing.right.label {\n  margin-top: 0em;\n  margin-right: 1em;\n}\n.ui.pointing.right.label:before {\n  margin-top: -0.3em;\n  right: -0.3em;\n  top: 50%;\n  bottom: auto;\n  left: auto;\n}\n/*------------------\n   Floating Label\n-------------------*/\n.ui.floating.label {\n  position: absolute;\n  z-index: 100;\n  top: -1em;\n  left: 100%;\n  margin: 0em 0em 0em -1.5em !important;\n}\n/*-------------------\n        Sizes\n--------------------*/\n.ui.small.labels .label,\n.ui.small.label {\n  font-size: 0.75rem;\n}\n.ui.label {\n  font-size: 0.8125rem;\n}\n.ui.large.labels .label,\n.ui.large.label {\n  font-size: 0.875rem;\n}\n.ui.huge.labels .label,\n.ui.huge.label {\n  font-size: 1rem;\n}\n\n/*\n * # Semantic - Loader\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Loader\n*******************************/\n/* Standard Size */\n.ui.loader {\n  display: none;\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  margin: 0px;\n  z-index: 1000;\n  -webkit-transform: translateX(-50%) translateY(-50%);\n  -moz-transform: translateX(-50%) translateY(-50%);\n  -ms-transform: translateX(-50%) translateY(-50%);\n  transform: translateX(-50%) translateY(-50%);\n}\n.ui.dimmer .loader {\n  display: block;\n}\n/*******************************\n             Types\n*******************************/\n/*-------------------\n        Text\n--------------------*/\n.ui.text.loader {\n  width: auto !important;\n  height: auto !important;\n  text-align: center;\n  font-style: normal;\n}\n.ui.mini.text.loader {\n  min-width: 16px;\n  padding-top: 2em;\n  font-size: 0.875em;\n}\n.ui.small.text.loader {\n  min-width: 24px;\n  padding-top: 2.5em;\n  font-size: 0.875em;\n}\n.ui.text.loader {\n  min-width: 32px;\n  font-size: 1em;\n  padding-top: 3em;\n}\n.ui.large.text.loader {\n  min-width: 64px;\n  padding-top: 5em;\n  font-size: 1.2em;\n}\n/*******************************\n            States\n*******************************/\n.ui.loader.active,\n.ui.loader.visible {\n  display: block;\n}\n.ui.loader.disabled,\n.ui.loader.hidden {\n  display: none;\n}\n/*******************************\n            Variations\n*******************************/\n/*-------------------\n       Inverted\n--------------------*/\n.ui.dimmer .ui.text.loader,\n.ui.inverted.text.loader {\n  color: rgba(255, 255, 255, 0.8);\n}\n.ui.inverted.dimmer .ui.text.loader {\n  color: rgba(0, 0, 0, 0.8);\n}\n/* Tiny Size */\n.ui.dimmer .mini.ui.loader,\n.ui.inverted .mini.ui.loader {\n  background-image: url(../images/loader-mini-inverted.gif);\n}\n/* Small Size */\n.ui.dimmer .small.ui.loader,\n.ui.inverted .small.ui.loader {\n  background-image: url(../images/loader-small-inverted.gif);\n}\n/* Standard Size */\n.ui.dimmer .ui.loader,\n.ui.inverted.loader {\n  background-image: url(../images/loader-medium-inverted.gif);\n}\n/* Large Size */\n.ui.dimmer .large.ui.loader,\n.ui.inverted .large.ui.loader {\n  background-image: url(../images/loader-large-inverted.gif);\n}\n/*-------------------\n        Sizes\n--------------------*/\n/* Tiny Size */\n.ui.inverted.dimmer .ui.mini.loader,\n.ui.mini.loader {\n  width: 16px;\n  height: 16px;\n  background-image: url(../images/loader-mini.gif);\n}\n/* Small Size */\n.ui.inverted.dimmer .ui.small.loader,\n.ui.small.loader {\n  width: 24px;\n  height: 24px;\n  background-image: url(../images/loader-small.gif);\n}\n.ui.inverted.dimmer .ui.loader,\n.ui.loader {\n  width: 32px;\n  height: 32px;\n  background: url(../images/loader-medium.gif) no-repeat;\n  background-position: 48% 0px;\n}\n/* Large Size */\n.ui.inverted.dimmer .ui.loader.large,\n.ui.loader.large {\n  width: 64px;\n  height: 64px;\n  background-image: url(../images/loader-large.gif);\n}\n/*-------------------\n       Inline\n--------------------*/\n.ui.inline.loader {\n  position: static;\n  vertical-align: middle;\n  margin: 0em;\n  -webkit-transform: none;\n  -moz-transform: none;\n  -ms-transform: none;\n  transform: none;\n}\n.ui.inline.loader.active,\n.ui.inline.loader.visible {\n  display: inline-block;\n}\n\n/*\n * # Semantic - Progress Bar\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n         Progress Bar\n*******************************/\n.ui.progress {\n  border: 1px solid rgba(0, 0, 0, 0.1);\n  width: 100%;\n  height: 35px;\n  background-color: #FAFAFA;\n  padding: 5px;\n  border-radius: 0.3125em;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.progress .bar {\n  display: inline-block;\n  height: 100%;\n  background-color: #CCCCCC;\n  border-radius: 3px;\n  -webkit-transition: width 1s ease-in-out, background-color 1s ease-out;\n  -moz-transition: width 1s ease-in-out, background-color 1s ease-out;\n  transition: width 1s ease-in-out, background-color 1s ease-out;\n}\n/*******************************\n            States\n*******************************/\n/*--------------\n  Successful\n---------------*/\n.ui.successful.progress .bar {\n  background-color: #73E064 !important;\n}\n.ui.successful.progress .bar,\n.ui.successful.progress .bar::after {\n  -webkit-animation: none !important;\n  -moz-animation: none !important;\n  animation: none !important;\n}\n.ui.warning.progress .bar {\n  background-color: #E96633 !important;\n}\n.ui.warning.progress .bar,\n.ui.warning.progress .bar::after {\n  -webkit-animation: none !important;\n  -moz-animation: none !important;\n  animation: none !important;\n}\n/*--------------\n     Failed\n---------------*/\n.ui.failed.progress .bar {\n  background-color: #DF9BA4 !important;\n}\n.ui.failed.progress .bar,\n.ui.failed.progress .bar::after {\n  -webkit-animation: none !important;\n  -moz-animation: none !important;\n  animation: none !important;\n}\n/*--------------\n     Active\n---------------*/\n.ui.active.progress .bar {\n  position: relative;\n}\n.ui.active.progress .bar::after {\n  content: \'\';\n  opacity: 0;\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  right: 0px;\n  bottom: 0px;\n  background: #FFFFFF;\n  border-radius: 3px;\n  -webkit-animation: progress-active 2s ease-out infinite;\n  -moz-animation: progress-active 2s ease-out infinite;\n  animation: progress-active 2s ease-out infinite;\n}\n@-webkit-keyframes progress-active {\n  0% {\n    opacity: 0;\n    width: 0;\n  }\n  50% {\n    opacity: 0.3;\n  }\n  100% {\n    opacity: 0;\n    width: 95%;\n  }\n}\n@-moz-keyframes progress-active {\n  0% {\n    opacity: 0;\n    width: 0;\n  }\n  50% {\n    opacity: 0.3;\n  }\n  100% {\n    opacity: 0;\n    width: 100%;\n  }\n}\n@keyframes progress-active {\n  0% {\n    opacity: 0;\n    width: 0;\n  }\n  50% {\n    opacity: 0.3;\n  }\n  100% {\n    opacity: 0;\n    width: 100%;\n  }\n}\n/*--------------\n    Disabled\n---------------*/\n.ui.disabled.progress {\n  opacity: 0.35;\n}\n.ui.disabled.progress .bar,\n.ui.disabled.progress .bar::after {\n  -webkit-animation: none !important;\n  -moz-animation: none !important;\n  animation: none !important;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------\n    Attached\n---------------*/\n/* bottom attached */\n.ui.progress.attached {\n  position: relative;\n  border: none;\n}\n.ui.progress.attached,\n.ui.progress.attached .bar {\n  display: block;\n  height: 3px;\n  padding: 0px;\n  overflow: hidden;\n  border-radius: 0em 0em 0.3125em 0.3125em;\n}\n.ui.progress.attached .bar {\n  border-radius: 0em;\n}\n/* top attached */\n.ui.progress.top.attached,\n.ui.progress.top.attached .bar {\n  top: -2px;\n  border-radius: 0.3125em 0.3125em 0em 0em;\n}\n.ui.progress.top.attached .bar {\n  border-radius: 0em;\n}\n/*--------------\n     Colors\n---------------*/\n.ui.blue.progress .bar {\n  background-color: #6ECFF5;\n}\n.ui.black.progress .bar {\n  background-color: #5C6166;\n}\n.ui.green.progress .bar {\n  background-color: #A1CF64;\n}\n.ui.red.progress .bar {\n  background-color: #EF4D6D;\n}\n.ui.purple.progress .bar {\n  background-color: #564F8A;\n}\n.ui.teal.progress .bar {\n  background-color: #00B5AD;\n}\n/*--------------\n    Striped\n---------------*/\n.ui.progress.striped .bar {\n  -webkit-background-size: 30px 30px;\n  background-size: 30px 30px;\n  background-image: -webkit-gradient(linear, left top, right bottom, color-stop(0.25, rgba(255, 255, 255, 0.15)), color-stop(0.25, transparent), color-stop(0.5, transparent), color-stop(0.5, rgba(255, 255, 255, 0.15)), color-stop(0.75, rgba(255, 255, 255, 0.15)), color-stop(0.75, transparent), to(transparent));\n  background-image: -webkit-linear-gradient(135deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent);\n  background-image: -moz-linear-gradient(135deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent);\n  background-image: -webkit-linear-gradient(315deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent);\n  background-image: -moz-linear-gradient(315deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent);\n  background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent);\n}\n.ui.progress.active.striped .bar:after {\n  -webkit-animation: none;\n  -moz-animation: none;\n  -ms-animation: none;\n  animation: none;\n}\n.ui.progress.active.striped .bar {\n  -webkit-animation: progress-striped 3s linear infinite;\n  -moz-animation: progress-striped 3s linear infinite;\n  animation: progress-striped 3s linear infinite;\n}\n@-webkit-keyframes progress-striped {\n  0% {\n    background-position: 0px 0;\n  }\n  100% {\n    background-position: 60px 0;\n  }\n}\n@-moz-keyframes progress-striped {\n  0% {\n    background-position: 0px 0;\n  }\n  100% {\n    background-position: 60px 0;\n  }\n}\n@keyframes progress-striped {\n  0% {\n    background-position: 0px 0;\n  }\n  100% {\n    background-position: 60px 0;\n  }\n}\n/*--------------\n     Sizes\n---------------*/\n.ui.small.progress .bar {\n  height: 14px;\n}\n\n/*\n * # Semantic - Reveal\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Reveal\n*******************************/\n.ui.reveal {\n  display: inline-block;\n  position: relative !important;\n  z-index: 2 !important;\n  font-size: 0em !important;\n}\n.ui.reveal > .content {\n  font-size: 1rem !important;\n}\n.ui.reveal > .visible.content {\n  -webkit-transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  -moz-transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n}\n.ui.reveal > .visible.content {\n  position: absolute !important;\n  top: 0em !important;\n  left: 0em !important;\n  z-index: 4 !important;\n  -webkit-transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  -moz-transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n}\n.ui.reveal > .hidden.content {\n  position: relative !important;\n  z-index: 3 !important;\n}\n/*------------------\n   Loose Coupling\n-------------------*/\n.ui.reveal.button {\n  overflow: hidden;\n}\n/*******************************\n              Types\n*******************************/\n/*--------------\n      Slide\n---------------*/\n.ui.slide.reveal {\n  position: relative !important;\n  display: block;\n  overflow: hidden !important;\n  white-space: nowrap;\n}\n.ui.slide.reveal > .content {\n  display: block;\n  float: left;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  margin: 0em;\n  -webkit-transition: top 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s, left 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s, right 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s, bottom 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  -moz-transition: top 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s, left 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s, right 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s, bottom 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  transition: top 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s, left 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s, right 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s, bottom 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n}\n.ui.slide.reveal > .visible.content {\n  position: relative !important;\n}\n.ui.slide.reveal > .hidden.content {\n  position: absolute !important;\n  left: 100% !important;\n  width: 100% !important;\n}\n.ui.slide.reveal:hover > .visible.content,\n.ui.slide.reveal:focus > .visible.content {\n  left: -100% !important;\n}\n.ui.slide.reveal:hover > .hidden.content,\n.ui.slide.reveal:focus > .hidden.content {\n  left: 0% !important;\n}\n.ui.right.slide.reveal > .visible.content {\n  left: 0%;\n}\n.ui.right.slide.reveal > .hidden.content {\n  left: auto !important;\n  right: 100% !important;\n}\n.ui.right.slide.reveal:hover > .visible.content,\n.ui.right.slide.reveal:focus > .visible.content {\n  left: 100% !important;\n  right: auto !important;\n}\n.ui.right.slide.reveal:hover > .hidden.content,\n.ui.right.slide.reveal:focus > .hidden.content {\n  left: auto !important;\n  right: 0% !important;\n}\n.ui.up.slide.reveal > .visible.content {\n  top: 0% !important;\n  left: 0% !important;\n  right: auto !important;\n  bottom: auto !important;\n}\n.ui.up.slide.reveal > .hidden.content {\n  top: 100% !important;\n  left: 0% !important;\n  right: auto !important;\n  bottom: auto !important;\n}\n.ui.slide.up.reveal:hover > .visible.content,\n.ui.slide.up.reveal:focus > .visible.content {\n  top: -100% !important;\n  left: 0% !important;\n}\n.ui.slide.up.reveal:hover > .hidden.content,\n.ui.slide.up.reveal:focus > .hidden.content {\n  top: 0% !important;\n  left: 0% !important;\n}\n.ui.down.slide.reveal > .visible.content {\n  top: auto !important;\n  right: auto !important;\n  bottom: auto !important;\n  bottom: 0% !important;\n}\n.ui.down.slide.reveal > .hidden.content {\n  top: auto !important;\n  right: auto !important;\n  bottom: 100% !important;\n  left: 0% !important;\n}\n.ui.slide.down.reveal:hover > .visible.content,\n.ui.slide.down.reveal:focus > .visible.content {\n  left: 0% !important;\n  bottom: -100% !important;\n}\n.ui.slide.down.reveal:hover > .hidden.content,\n.ui.slide.down.reveal:focus > .hidden.content {\n  left: 0% !important;\n  bottom: 0% !important;\n}\n/*--------------\n      Fade\n---------------*/\n.ui.fade.reveal > .hidden.content {\n  -webkit-transition: opacity 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  -moz-transition: opacity 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  transition: opacity 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n}\n.ui.fade.reveal > .hidden.content {\n  z-index: 5 !important;\n  opacity: 0;\n}\n.ui.fade.reveal:hover > .hidden.content {\n  opacity: 1;\n}\n/*--------------\n      Move\n---------------*/\n.ui.move.reveal > .visible.content,\n.ui.move.left.reveal > .visible.content {\n  left: auto !important;\n  top: auto !important;\n  bottom: auto !important;\n  right: 0% !important;\n}\n.ui.move.reveal:hover > .visible.content,\n.ui.move.left.reveal:hover > .visible.content,\n.ui.move.reveal:focus > .visible.content,\n.ui.move.left.reveal:focus > .visible.content {\n  right: 100% !important;\n}\n.ui.move.right.reveal > .visible.content {\n  right: auto !important;\n  top: auto !important;\n  bottom: auto !important;\n  left: 0% !important;\n}\n.ui.move.right.reveal:hover > .visible.content,\n.ui.move.right.reveal:focus > .visible.content {\n  left: 100% !important;\n}\n.ui.move.up.reveal > .visible.content {\n  right: auto !important;\n  left: auto !important;\n  top: auto !important;\n  bottom: 0% !important;\n}\n.ui.move.up.reveal:hover > .visible.content,\n.ui.move.up.reveal:focus > .visible.content {\n  bottom: 100% !important;\n}\n.ui.move.down.reveal > .visible.content {\n  right: auto !important;\n  left: auto !important;\n  top: 0% !important;\n  bottom: auto !important;\n}\n.ui.move.down.reveal:hover > .visible.content,\n.ui.move.down.reveal:focus > .visible.content {\n  top: 100% !important;\n}\n/*--------------\n     Rotate\n---------------*/\n.ui.rotate.reveal > .visible.content {\n  -webkit-transition-duration: 0.8s;\n  -moz-transition-duration: 0.8s;\n  transition-duration: 0.8s;\n  -webkit-transform: rotate(0deg);\n  -moz-transform: rotate(0deg);\n  -ms-transform: rotate(0deg);\n  transform: rotate(0deg);\n}\n.ui.rotate.reveal > .visible.content,\n.ui.rotate.right.reveal > .visible.content {\n  -webkit-transform-origin: bottom right;\n  -moz-transform-origin: bottom right;\n  -ms-transform-origin: bottom right;\n  transform-origin: bottom right;\n}\n.ui.rotate.reveal:hover > .visible.content,\n.ui.rotate.right.reveal:hover > .visible.content,\n.ui.rotate.reveal:focus > .visible.content,\n.ui.rotate.right.reveal:focus > .visible.content {\n  -webkit-transform: rotate(110deg);\n  -moz-transform: rotate(110deg);\n  -ms-transform: rotate(110deg);\n  transform: rotate(110deg);\n}\n.ui.rotate.left.reveal > .visible.content {\n  -webkit-transform-origin: bottom left;\n  -moz-transform-origin: bottom left;\n  -ms-transform-origin: bottom left;\n  transform-origin: bottom left;\n}\n.ui.rotate.left.reveal:hover > .visible.content,\n.ui.rotate.left.reveal:focus > .visible.content {\n  -webkit-transform: rotate(-110deg);\n  -moz-transform: rotate(-110deg);\n  -ms-transform: rotate(-110deg);\n  transform: rotate(-110deg);\n}\n/*******************************\n              States\n*******************************/\n.ui.disabled.reveal {\n  opacity: 1 !important;\n}\n.ui.disabled.reveal > .content {\n  -webkit-transition: none !important;\n  -moz-transition: none !important;\n  transition: none !important;\n}\n.ui.disabled.reveal:hover > .visible.content,\n.ui.disabled.reveal:focus > .visible.content {\n  position: static !important;\n  display: block !important;\n  opacity: 1 !important;\n  top: 0 !important;\n  left: 0 !important;\n  right: auto !important;\n  bottom: auto !important;\n  -webkit-transform: none !important;\n  -moz-transform: none !important;\n  -ms-transform: none !important;\n  transform: none !important;\n}\n.ui.disabled.reveal:hover > .hidden.content,\n.ui.disabled.reveal:focus > .hidden.content {\n  display: none !important;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------\n     Masked\n---------------*/\n.ui.masked.reveal {\n  overflow: hidden;\n}\n/*--------------\n     Instant\n---------------*/\n.ui.instant.reveal > .content {\n  -webkit-transition-delay: 0s !important;\n  -moz-transition-delay: 0s !important;\n  transition-delay: 0s !important;\n}\n\n/*\n * # Semantic - Segment\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Segment\n*******************************/\n.ui.segment {\n  position: relative;\n  background-color: #FFFFFF;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  margin: 1em 0em;\n  padding: 1em;\n  border-radius: 5px 5px 5px 5px;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.segment:first-child {\n  margin-top: 0em;\n}\n.ui.segment:last-child {\n  margin-bottom: 0em;\n}\n.ui.segment:after {\n  content: \'\';\n  display: block;\n  height: 0;\n  clear: both;\n  visibility: hidden;\n}\n.ui.vertical.segment {\n  margin: 0em;\n  padding-left: 0em;\n  padding-right: 0em;\n  background-color: transparent;\n  border-radius: 0px;\n  -webkit-box-shadow: 0px 1px 0px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 1px 0px rgba(0, 0, 0, 0.1);\n}\n.ui.vertical.segment:first-child {\n  padding-top: 0em;\n}\n.ui.horizontal.segment {\n  margin: 0em;\n  padding-top: 0em;\n  padding-bottom: 0em;\n  background-color: transparent;\n  border-radius: 0px;\n  -webkit-box-shadow: 1px 0px 0px rgba(0, 0, 0, 0.1);\n  box-shadow: 1px 0px 0px rgba(0, 0, 0, 0.1);\n}\n.ui.horizontal.segment:first-child {\n  padding-left: 0em;\n}\n/*-------------------\n    Loose Coupling\n--------------------*/\n.ui.pointing.menu ~ .ui.attached.segment {\n  top: 1px;\n}\n.ui.page.grid.segment .ui.grid .ui.segment.column {\n  padding-top: 2rem;\n  padding-bottom: 2rem;\n}\n.ui.grid.segment,\n.ui.grid .ui.segment.row,\n.ui.grid .ui.segment.column {\n  border-radius: 0em;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  border: none;\n}\n/* No padding on edge content */\n.ui.segment > :first-child {\n  margin-top: 0em;\n}\n.ui.segment > :last-child {\n  margin-bottom: 0em;\n}\n/*******************************\n             Types\n*******************************/\n/*-------------------\n        Piled\n--------------------*/\n.ui.piled.segment {\n  margin: 2em 0em;\n  -webkit-box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.15);\n  -ms-box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.15);\n  -o-box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.15);\n  box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.15);\n}\n.ui.piled.segment:first-child {\n  margin-top: 0em;\n}\n.ui.piled.segment:last-child {\n  margin-bottom: 0em;\n}\n.ui.piled.segment:after,\n.ui.piled.segment:before {\n  background-color: #FFFFFF;\n  visibility: visible;\n  content: "";\n  display: block;\n  height: 100%;\n  left: -1px;\n  position: absolute;\n  width: 100%;\n  -webkit-box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.1);\n}\n.ui.piled.segment:after {\n  -webkit-transform: rotate(1.2deg);\n  -moz-transform: rotate(1.2deg);\n  -ms-transform: rotate(1.2deg);\n  transform: rotate(1.2deg);\n  top: 0;\n  z-index: -1;\n}\n.ui.piled.segment:before {\n  -webkit-transform: rotate(-1.2deg);\n  -moz-transform: rotate(-1.2deg);\n  -ms-transform: rotate(-1.2deg);\n  transform: rotate(-1.2deg);\n  top: 0;\n  z-index: -2;\n}\n/*-------------------\n       Stacked\n--------------------*/\n.ui.stacked.segment {\n  padding-bottom: 1.7em;\n}\n.ui.stacked.segment:after,\n.ui.stacked.segment:before {\n  content: \'\';\n  position: absolute;\n  bottom: -3px;\n  left: 0%;\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  background-color: rgba(0, 0, 0, 0.02);\n  width: 100%;\n  height: 5px;\n  visibility: visible;\n}\n.ui.stacked.segment:before {\n  bottom: 0px;\n}\n/* Inverted */\n.ui.stacked.inverted.segment:after,\n.ui.stacked.inverted.segment:before {\n  background-color: rgba(255, 255, 255, 0.1);\n  border-top: 1px solid rgba(255, 255, 255, 0.35);\n}\n/*-------------------\n       Circular\n--------------------*/\n.ui.circular.segment {\n  display: table-cell;\n  padding: 2em;\n  text-align: center;\n  vertical-align: middle;\n  border-radius: 500em;\n}\n/*-------------------\n       Raised\n--------------------*/\n.ui.raised.segment {\n  -webkit-box-shadow: 0px 1px 2px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 1px 2px 1px rgba(0, 0, 0, 0.1);\n}\n/*******************************\n            States\n*******************************/\n.ui.disabled.segment {\n  opacity: 0.8;\n  color: #DDDDDD;\n}\n/*******************************\n           Variations\n*******************************/\n/*-------------------\n       Basic\n--------------------*/\n.ui.basic.segment {\n  position: relative;\n  background-color: transparent;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  border-radius: 0px;\n}\n.ui.basic.segment:first-child {\n  padding-top: 0em;\n}\n.ui.basic.segment:last-child {\n  padding-bottom: 0em;\n}\n/*-------------------\n       Fittted\n--------------------*/\n.ui.fitted.segment {\n  padding: 0em;\n}\n/*-------------------\n       Colors\n--------------------*/\n.ui.blue.segment {\n  border-top: 0.2em solid #6ECFF5;\n}\n.ui.green.segment {\n  border-top: 0.2em solid #A1CF64;\n}\n.ui.red.segment {\n  border-top: 0.2em solid #D95C5C;\n}\n.ui.orange.segment {\n  border-top: 0.2em solid #F05940;\n}\n.ui.purple.segment {\n  border-top: 0.2em solid #564F8A;\n}\n.ui.teal.segment {\n  border-top: 0.2em solid #00B5AD;\n}\n/*-------------------\n   Inverted Colors\n--------------------*/\n.ui.inverted.black.segment {\n  background-color: #5C6166 !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.blue.segment {\n  background-color: #6ECFF5 !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.green.segment {\n  background-color: #A1CF64 !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.red.segment {\n  background-color: #D95C5C !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.orange.segment {\n  background-color: #F05940 !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.purple.segment {\n  background-color: #564F8A !important;\n  color: #FFFFFF !important;\n}\n.ui.inverted.teal.segment {\n  background-color: #00B5AD !important;\n  color: #FFFFFF !important;\n}\n/*-------------------\n       Aligned\n--------------------*/\n.ui.left.aligned.segment {\n  text-align: left;\n}\n.ui.right.aligned.segment {\n  text-align: right;\n}\n.ui.center.aligned.segment {\n  text-align: center;\n}\n.ui.justified.segment {\n  text-align: justify;\n  -webkit-hyphens: auto;\n  -moz-hyphens: auto;\n  -ms-hyphens: auto;\n  hyphens: auto;\n}\n/*-------------------\n       Floated\n--------------------*/\n.ui.floated.segment,\n.ui.left.floated.segment {\n  float: left;\n}\n.ui.right.floated.segment {\n  float: right;\n}\n/*-------------------\n      Inverted\n--------------------*/\n.ui.inverted.segment {\n  border: none;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.inverted.segment .segment {\n  color: rgba(0, 0, 0, 0.7);\n}\n.ui.inverted.segment .inverted.segment {\n  color: #FFFFFF;\n}\n.ui.inverted.segment,\n.ui.primary.inverted.segment {\n  background-color: #222222;\n  color: #FFFFFF;\n}\n/*-------------------\n     Ordinality\n--------------------*/\n.ui.primary.segment {\n  background-color: #FFFFFF;\n  color: #555555;\n}\n.ui.secondary.segment {\n  background-color: #FAF9FA;\n  color: #777777;\n}\n.ui.tertiary.segment {\n  background-color: #EBEBEB;\n  color: #B0B0B0;\n}\n.ui.secondary.inverted.segment {\n  background-color: #555555;\n  background-image: -webkit-gradient(linear, 0 0, 0 100%, from(rgba(255, 255, 255, 0.3)), to(rgba(255, 255, 255, 0.3)));\n  background-image: -webkit-linear-gradient(rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.3) 100%);\n  background-image: -moz-linear-gradient(rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.3) 100%);\n  background-image: -webkit-gradient(linear, left top, left bottom, from(rgba(255, 255, 255, 0.3)), to(rgba(255, 255, 255, 0.3)));\n  background-image: linear-gradient(rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.3) 100%);\n  color: #FAFAFA;\n}\n.ui.tertiary.inverted.segment {\n  background-color: #555555;\n  background-image: -webkit-gradient(linear, 0 0, 0 100%, from(rgba(255, 255, 255, 0.6)), to(rgba(255, 255, 255, 0.6)));\n  background-image: -webkit-linear-gradient(rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.6) 100%);\n  background-image: -moz-linear-gradient(rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.6) 100%);\n  background-image: -webkit-gradient(linear, left top, left bottom, from(rgba(255, 255, 255, 0.6)), to(rgba(255, 255, 255, 0.6)));\n  background-image: linear-gradient(rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.6) 100%);\n  color: #EEEEEE;\n}\n/*-------------------\n      Attached\n--------------------*/\n.ui.segment.attached {\n  top: -1px;\n  bottom: -1px;\n  border-radius: 0px;\n  margin: 0em;\n  -webkit-box-shadow: 0px 0px 0px 1px #DDDDDD;\n  box-shadow: 0px 0px 0px 1px #DDDDDD;\n}\n.ui.top.attached.segment {\n  top: 0px;\n  bottom: -1px;\n  margin-top: 1em;\n  margin-bottom: 0em;\n  border-radius: 5px 5px 0px 0px;\n}\n.ui.segment.top.attached:first-child {\n  margin-top: 0em;\n}\n.ui.segment.bottom.attached {\n  top: -1px;\n  bottom: 0px;\n  margin-top: 0em;\n  margin-bottom: 1em;\n  border-radius: 0px 0px 5px 5px;\n}\n.ui.segment.bottom.attached:last-child {\n  margin-bottom: 0em;\n}\n\n/*\n * # Semantic - Steps\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Step\n*******************************/\n.ui.step,\n.ui.steps .step {\n  display: inline-block;\n  position: relative;\n  padding: 1em 2em 1em 3em;\n  vertical-align: top;\n  background-color: #FFFFFF;\n  color: #888888;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.step:after,\n.ui.steps .step:after {\n  position: absolute;\n  z-index: 2;\n  content: \'\';\n  top: 0.42em;\n  right: -1em;\n  border: medium none;\n  background-color: #FFFFFF;\n  width: 2.2em;\n  height: 2.2em;\n  -webkit-transform: rotate(-45deg);\n  -moz-transform: rotate(-45deg);\n  -ms-transform: rotate(-45deg);\n  transform: rotate(-45deg);\n  -webkit-box-shadow: -1px -1px 0 0 rgba(0, 0, 0, 0.15) inset;\n  box-shadow: -1px -1px 0 0 rgba(0, 0, 0, 0.15) inset;\n}\n.ui.step,\n.ui.steps .step,\n.ui.steps .step:after {\n  -webkit-transition: background-color 0.1s ease, opacity 0.1s ease, color 0.1s ease, -webkit-box-shadow 0.1s ease;\n  -moz-transition: background-color 0.1s ease, opacity 0.1s ease, color 0.1s ease, box-shadow 0.1s ease;\n  transition: background-color 0.1s ease, opacity 0.1s ease, color 0.1s ease, box-shadow 0.1s ease;\n}\n/*******************************\n            Types\n*******************************/\n/* Vertical */\n.ui.vertical.steps {\n  overflow: visible;\n}\n.ui.vertical.steps .step {\n  display: block;\n  border-radius: 0em;\n  padding: 1em 2em;\n}\n.ui.vertical.steps .step:first-child {\n  padding: 1em 2em;\n  border-radius: 0em;\n  border-top-left-radius: 0.3125rem;\n  border-top-right-radius: 0.3125rem;\n}\n.ui.vertical.steps .active.step:first-child {\n  border-top-right-radius: 0rem;\n}\n.ui.vertical.steps .step:last-child {\n  border-radius: 0em;\n  border-bottom-left-radius: 0.3125rem;\n  border-bottom-right-radius: 0.3125rem;\n}\n.ui.vertical.steps .active.step:last-child {\n  border-bottom-right-radius: 0rem;\n}\n/* Arrow */\n.ui.vertical.steps .step:after {\n  display: none;\n}\n/* Active Arrow */\n.ui.vertical.steps .active.step:after {\n  display: block;\n}\n/* Two Line */\n.ui.vertical.steps .two.line.step {\n  line-height: 1.3;\n}\n.ui.vertical.steps .two.line.active.step:after {\n  position: absolute;\n  z-index: 2;\n  content: \'\';\n  top: 0em;\n  right: -1.45em;\n  background-color: transparent;\n  border-bottom: 2.35em solid transparent;\n  border-left: 1.55em solid #555555;\n  border-top: 2.35em solid transparent;\n  width: 0em;\n  height: 0em;\n  -webkit-transform: none;\n  -moz-transform: none;\n  -ms-transform: none;\n  transform: none;\n}\n/*******************************\n            Group\n*******************************/\n.ui.steps {\n  cursor: pointer;\n  display: inline-block;\n  font-size: 0em;\n  overflow: hidden;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  line-height: 1;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  border-radius: 0.3125rem;\n}\n.ui.steps .step:first-child {\n  padding-left: 1.35em;\n  border-radius: 0.3125em 0em 0em 0.3125em;\n}\n.ui.steps .step:last-child {\n  border-radius: 0em 0.3125em 0.3125em 0em;\n}\n.ui.steps .step:only-child {\n  border-radius: 0.3125em;\n}\n.ui.steps .step:last-child {\n  margin-right: 0em;\n}\n.ui.steps .step:last-child:after {\n  display: none;\n}\n/*******************************\n             States\n*******************************/\n/* Hover */\n.ui.step:hover,\n.ui.step.hover {\n  background-color: #F7F7F7;\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.steps .step.hover:after,\n.ui.steps .step:hover:after,\n.ui.step:hover,\n.ui.step.hover::after {\n  background-color: #F7F7F7;\n}\n/* Hover */\n.ui.steps .step.down,\n.ui.steps .step:active,\n.ui.step.down,\n.ui.step:active {\n  background-color: #F0F0F0;\n}\n.ui.steps .step.down:after,\n.ui.steps .step:active:after,\n.ui.steps.down::after,\n.ui.steps:active::after {\n  background-color: #F0F0F0;\n}\n/* Active */\n.ui.steps .step.active,\n.ui.active.step {\n  cursor: auto;\n  background-color: #555555;\n  color: #FFFFFF;\n  font-weight: bold;\n}\n.ui.steps .step.active:after,\n.ui.active.steps:after {\n  background-color: #555555;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/* Disabled */\n.ui.steps .disabled.step,\n.ui.disabled.step {\n  cursor: auto;\n  background-color: #FFFFFF;\n  color: #CBCBCB;\n}\n.ui.steps .disabled.step:after,\n.ui.disabled.step:after {\n  background-color: #FFFFFF;\n}\n/*******************************\n           Variations\n*******************************/\n/* Attached */\n.attached.ui.steps {\n  margin: 0em;\n  border-radius: 0.3125em 0.3125em 0em 0em;\n}\n.attached.ui.steps .step:first-child {\n  border-radius: 0.3125em 0em 0em 0em;\n}\n.attached.ui.steps .step:last-child {\n  border-radius: 0em 0.3125em 0em 0em;\n}\n/* Bottom Side */\n.bottom.attached.ui.steps {\n  margin-top: -1px;\n  border-radius: 0em 0em 0.3125em 0.3125em;\n}\n.bottom.attached.ui.steps .step:first-child {\n  border-radius: 0em 0em 0em 0.3125em;\n}\n.bottom.attached.ui.steps .step:last-child {\n  border-radius: 0em 0em 0.3125em 0em;\n}\n/* Evenly divided  */\n.ui.one.steps,\n.ui.two.steps,\n.ui.three.steps,\n.ui.four.steps,\n.ui.five.steps,\n.ui.six.steps,\n.ui.seven.steps,\n.ui.eight.steps {\n  display: block;\n}\n.ui.one.steps > .step {\n  width: 100%;\n}\n.ui.two.steps > .step {\n  width: 50%;\n}\n.ui.three.steps > .step {\n  width: 33.333%;\n}\n.ui.four.steps > .step {\n  width: 25%;\n}\n.ui.five.steps > .step {\n  width: 20%;\n}\n.ui.six.steps > .step {\n  width: 16.666%;\n}\n.ui.seven.steps > .step {\n  width: 14.285%;\n}\n.ui.eight.steps > .step {\n  width: 12.500%;\n}\n/*******************************\n             Sizes\n*******************************/\n.ui.small.step,\n.ui.small.steps .step {\n  font-size: 0.8rem;\n}\n.ui.step,\n.ui.steps .step {\n  font-size: 1rem;\n}\n.ui.large.step,\n.ui.large.steps .step {\n  font-size: 1.25rem;\n}\n\n/*\n * # Semantic - Accordion\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Accordion\n*******************************/\n.ui.accordion,\n.ui.accordion .accordion {\n  width: 600px;\n  max-width: 100%;\n  font-size: 1rem;\n  border-radius: 0.3125em;\n  background-color: #FFFFFF;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n}\n.ui.accordion .title,\n.ui.accordion .accordion .title {\n  cursor: pointer;\n  margin: 0em;\n  padding: 0.75em 1em;\n  color: rgba(0, 0, 0, 0.6);\n  border-top: 1px solid rgba(0, 0, 0, 0.05);\n  -webkit-transition: background-color 0.2s ease-out;\n  -moz-transition: background-color 0.2s ease-out;\n  transition: background-color 0.2s ease-out;\n}\n.ui.accordion .title:first-child,\n.ui.accordion .accordion .title:first-child {\n  border-top: none;\n}\n/* Content */\n.ui.accordion .content,\n.ui.accordion .accordion .content {\n  display: none;\n  margin: 0em;\n  padding: 1.3em 1em;\n}\n/* Arrow */\n.ui.accordion .title .dropdown.icon,\n.ui.accordion .accordion .title .dropdown.icon {\n  display: inline-block;\n  float: none;\n  margin: 0em 0.5em 0em 0em;\n  -webkit-transition: -webkit-transform 0.2s ease, opacity 0.2s ease;\n  -moz-transition: -moz-transform 0.2s ease, opacity 0.2s ease;\n  transition: transform 0.2s ease,\n    opacity 0.2s ease\n  ;\n  -webkit-transform: rotate(0deg);\n  -moz-transform: rotate(0deg);\n  -ms-transform: rotate(0deg);\n  transform: rotate(0deg);\n}\n.ui.accordion .title .dropdown.icon:before,\n.ui.accordion .accordion .title .dropdown.icon:before {\n  content: \'\f0da\' /*rtl:\'\f0d9\'*/;\n}\n/*--------------\n Loose Coupling\n---------------*/\n.ui.basic.accordion.menu {\n  background-color: #FFFFFF;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n}\n.ui.basic.accordion.menu .title,\n.ui.basic.accordion.menu .content {\n  padding: 0em;\n}\n/*******************************\n            Types\n*******************************/\n/*--------------\n     Basic\n---------------*/\n.ui.basic.accordion {\n  background-color: transparent;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.basic.accordion .title,\n.ui.basic.accordion .accordion .title {\n  background-color: transparent;\n  border-top: none;\n  padding-left: 0em;\n  padding-right: 0em;\n}\n.ui.basic.accordion .content,\n.ui.basic.accordion .accordion .content {\n  padding: 0.5em 0em;\n}\n.ui.basic.accordion .active.title,\n.ui.basic.accordion .accordion .active.title {\n  background-color: transparent;\n}\n/*******************************\n            States\n*******************************/\n/*--------------\n      Hover\n---------------*/\n.ui.accordion .title:hover,\n.ui.accordion .active.title,\n.ui.accordion .accordion .title:hover,\n.ui.accordion .accordion .active.title {\n  color: rgba(0, 0, 0, 0.8);\n}\n/*--------------\n     Active\n---------------*/\n.ui.accordion .active.title,\n.ui.accordion .accordion .active.title {\n  background-color: rgba(0, 0, 0, 0.1);\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.accordion .active.title .dropdown.icon,\n.ui.accordion .accordion .active.title .dropdown.icon {\n  -webkit-transform: rotate(90deg);\n  -moz-transform: rotate(90deg);\n  -ms-transform: rotate(90deg);\n  transform: rotate(90deg);\n}\n.ui.accordion .active.content,\n.ui.accordion .accordion .active.content {\n  display: block;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------\n     Fluid\n---------------*/\n.ui.fluid.accordion,\n.ui.fluid.accordion .accordion {\n  width: 100%;\n}\n\n/*\n * # Semantic - Chat Room\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n           Chat Room\n*******************************/\n.ui.chatroom {\n  background-color: #F8F8F8;\n  width: 330px;\n  height: 370px;\n  padding: 0px;\n}\n.ui.chatroom .room {\n  position: relative;\n  background-color: #FFFFFF;\n  overflow: hidden;\n  height: 286px;\n  border: 1px solid rgba(0, 0, 0, 0.1);\n  border-top: none;\n  border-bottom: none;\n}\n.ui.chatroom .room .loader {\n  display: none;\n  margin: -25px 0px 0px -25px;\n}\n/* Chat Room Actions */\n.ui.chatroom .actions {\n  overflow: hidden;\n  background-color: #EEEEEE;\n  padding: 4px;\n  border: 1px solid rgba(0, 0, 0, 0.1);\n  border-radius: 5px 5px 0px 0px;\n}\n.ui.chatroom .actions .button {\n  float: right;\n  margin-left: 3px;\n}\n/* Online User Count */\n.ui.chatroom .actions .message {\n  float: left;\n  margin-left: 6px;\n  font-size: 11px;\n  color: #AAAAAA;\n  text-shadow: 0px -1px 0px rgba(255, 255, 255, 0.8);\n  line-height: 28px;\n}\n.ui.chatroom .actions .message .loader {\n  display: inline-block;\n  margin-right: 8px;\n}\n/* Chat Room Text Log */\n.ui.chatroom .log {\n  float: left;\n  overflow: auto;\n  overflow-x: hidden;\n  overflow-y: auto;\n}\n.ui.chatroom .log .message {\n  padding: 3px 0px;\n  border-top: 1px dotted #DADADA;\n}\n.ui.chatroom .log .message:first-child {\n  border-top: none;\n}\n/* status event */\n.ui.chatroom .status {\n  padding: 5px 0px;\n  color: #AAAAAA;\n  font-size: 12px;\n  font-style: italic;\n  line-height: 1.33;\n  border-top: 1px dotted #DADADA;\n}\n.ui.chatroom .log .status:first-child {\n  border-top: none;\n}\n.ui.chatroom .log .flag {\n  float: left;\n}\n.ui.chatroom .log p {\n  margin-left: 0px;\n}\n.ui.chatroom .log .author {\n  font-weight: bold;\n  -webkit-transition: color 0.3s ease-out;\n  -moz-transition: color 0.3s ease-out;\n  transition: color 0.3s ease-out;\n}\n.ui.chatroom .log a.author:hover {\n  opacity: 0.8;\n}\n.ui.chatroom .log .message.admin p {\n  font-weight: bold;\n  margin: 1px 0px 0px 23px;\n}\n.ui.chatroom .log .divider {\n  margin: -1px 0px;\n  font-size: 11px;\n  padding: 10px 0px;\n  border-top: 1px solid #F8F8F8;\n  border-bottom: 1px solid #F8F8F8;\n}\n.ui.chatroom .log .divider .rule {\n  top: 50%;\n  width: 15%;\n}\n.ui.chatroom .log .divider .label {\n  color: #777777;\n  margin: 0px;\n}\n/* Chat Room User List */\n.ui.chatroom .room .list {\n  position: relative;\n  overflow: auto;\n  overflow-x: hidden;\n  overflow-y: auto;\n  float: left;\n  background-color: #EEEEEE;\n  border-left: 1px solid #DDDDDD;\n}\n.ui.chatroom .room .list .user {\n  display: table;\n  padding: 3px 7px;\n  border-bottom: 1px solid #DDDDDD;\n}\n.ui.chatroom .room .list .user:hover {\n  background-color: #F8F8F8;\n}\n.ui.chatroom .room .list .image {\n  display: table-cell;\n  vertical-align: middle;\n  width: 20px;\n}\n.ui.chatroom .room .list .image img {\n  width: 20px;\n  height: 20px;\n  vertical-align: middle;\n}\n.ui.chatroom .room .list p {\n  display: table-cell;\n  vertical-align: middle;\n  padding-left: 7px;\n  padding-right: 14px;\n  font-size: 11px;\n  line-height: 1.2;\n  font-weight: bold;\n}\n.ui.chatroom .room .list a:hover {\n  opacity: 0.8;\n}\n/* User List Loading */\n.ui.chatroom.loading .loader {\n  display: block;\n}\n/* Chat Room Talk Input */\n.ui.chatroom .talk {\n  border: 1px solid rgba(0, 0, 0, 0.1);\n  padding: 5px 0px 0px;\n  background-color: #EEEEEE;\n  border-radius: 0px 0px 5px 5px;\n}\n.ui.chatroom .talk .avatar,\n.ui.chatroom .talk input,\n.ui.chatroom .talk .button {\n  float: left;\n}\n.ui.chatroom .talk .avatar img {\n  display: block;\n  width: 30px;\n  height: 30px;\n  margin-right: 4px;\n  border-radius: 500rem;\n}\n.ui.chatroom .talk input {\n  border: 1px solid #CCCCCC;\n  margin: 0px;\n  width: 196px;\n  height: 14px;\n  padding: 8px 5px;\n  font-size: 12px;\n  color: #555555;\n}\n.ui.chatroom .talk input.focus {\n  border: 1px solid #AAAAAA;\n}\n.ui.chatroom .send {\n  width: 80px;\n  height: 32px;\n  margin-left: -1px;\n  padding: 4px 12px;\n  font-size: 12px;\n  line-height: 23px;\n  -webkit-box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1) inset;\n  border-radius: 0 5px 5px 0;\n}\n.ui.chatroom .talk .log-in.button {\n  display: block;\n  float: none;\n  margin-top: -6px;\n  height: 22px;\n  border-radius: 0px 0px 4px 4px;\n}\n.ui.chatroom .talk .log-in.button i {\n  vertical-align: text-top;\n}\n/* Quirky Flags */\n.ui.chatroom .log .team.flag {\n  width: 18px;\n}\n/* Chat room Loaded */\n.ui.chatroom.loading .loader {\n  display: block;\n}\n/* Standard Size */\n.ui.chatroom {\n  width: 330px;\n  height: 370px;\n}\n.ui.chatroom .room .container {\n  width: 3000px;\n}\n.ui.chatroom .log {\n  width: 314px;\n  height: 278px;\n  padding: 4px 7px;\n}\n.ui.chatroom .room .list {\n  width: 124px;\n  height: 278px;\n  padding: 4px 0px;\n}\n.ui.chatroom .room .list .user {\n  width: 110px;\n}\n.ui.chatroom .talk {\n  height: 40px;\n}\n\n/*\n * # Semantic - Checkbox\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n           Checkbox\n*******************************/\n/*--------------\n    Standard\n---------------*/\n/*--- Content ---*/\n.ui.checkbox {\n  position: relative;\n  display: inline-block;\n  min-width: 1em;\n  min-height: 1.25em;\n  line-height: 1em;\n  outline: none;\n  vertical-align: middle;\n}\n.ui.checkbox input {\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  opacity: 0;\n  outline: none;\n}\n/*--- Box ---*/\n.ui.checkbox .box,\n.ui.checkbox label {\n  cursor: pointer;\n  padding-left: 2em;\n  outline: none;\n}\n.ui.checkbox .box:before,\n.ui.checkbox label:before {\n  position: absolute;\n  top: 0em;\n  line-height: 1;\n  width: 1em;\n  height: 1em;\n  left: 0em;\n  content: \'\';\n  border-radius: 4px;\n  background: #FFFFFF;\n  -webkit-transition: background-color 0.3s ease, -webkit-box-shadow 0.3s ease;\n  -moz-transition: background-color 0.3s ease, box-shadow 0.3s ease;\n  transition: background-color 0.3s ease, box-shadow 0.3s ease;\n  -webkit-box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.2);\n  box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.2);\n}\n/*--- Checkbox ---*/\n.ui.checkbox .box:after,\n.ui.checkbox label:after {\n  -ms-filter: "progid:DXImageTransform.Microsoft.Alpha(Opacity=0)";\n  filter: alpha(opacity=0);\n  opacity: 0;\n  content: \'\';\n  position: absolute;\n  background: transparent;\n  border: 0.2em solid #333333;\n  border-top: none;\n  border-right: none;\n  -webkit-transform: rotate(-45deg);\n  -moz-transform: rotate(-45deg);\n  -ms-transform: rotate(-45deg);\n  transform: rotate(-45deg);\n}\n.ui.checkbox .box:after,\n.ui.checkbox label:after {\n  top: 0.275em;\n  left: 0.2em;\n  width: 0.45em;\n  height: 0.15em;\n}\n/*--- Inside Label ---*/\n.ui.checkbox label {\n  display: block;\n  color: rgba(0, 0, 0, 0.6);\n  -webkit-transition: color 0.2s ease;\n  -moz-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n.ui.checkbox label:hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.checkbox input:focus ~ label {\n  color: rgba(0, 0, 0, 0.8);\n}\n/*--- Outside Label  ---*/\n.ui.checkbox ~ label {\n  cursor: pointer;\n  opacity: 0.85;\n  vertical-align: middle;\n}\n.ui.checkbox ~ label:hover {\n  opacity: 1;\n}\n/*******************************\n           States\n*******************************/\n/*--- Hover ---*/\n.ui.checkbox .box:hover::before,\n.ui.checkbox label:hover::before {\n  -webkit-box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.3);\n  box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.3);\n}\n/*--- Down ---*/\n.ui.checkbox .box:active::before,\n.ui.checkbox label:active::before {\n  background-color: #F5F5F5;\n}\n/*--- Focus ---*/\n.ui.checkbox input:focus ~ .box:before,\n.ui.checkbox input:focus ~ label:before {\n  -webkit-box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.3);\n  box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.3);\n}\n/*--- Active ---*/\n.ui.checkbox input:checked ~ .box:after,\n.ui.checkbox input:checked ~ label:after {\n  -ms-filter: "progid:DXImageTransform.Microsoft.Alpha(Opacity=100)";\n  filter: alpha(opacity=100);\n  opacity: 1;\n}\n/*--- Disabled ---*/\n.ui.disabled.checkbox ~ .box:after,\n.ui.checkbox input[disabled] ~ .box:after,\n.ui.disabled.checkbox label,\n.ui.checkbox input[disabled] ~ label {\n  opacity: 0.4;\n  color: rgba(0, 0, 0, 0.3);\n}\n/*******************************\n          Variations\n*******************************/\n/*--------------\n     Radio\n---------------*/\n.ui.radio.checkbox .box:before,\n.ui.radio.checkbox label:before {\n  min-width: 1em;\n  height: 1em;\n  border-radius: 500px;\n  -webkit-transform: none;\n  -moz-transform: none;\n  -ms-transform: none;\n  transform: none;\n}\n.ui.radio.checkbox .box:after,\n.ui.radio.checkbox label:after {\n  border: none;\n  top: 0.2em;\n  left: 0.2em;\n  width: 0.6em;\n  height: 0.6em;\n  background-color: #555555;\n  -webkit-transform: none;\n  -moz-transform: none;\n  -ms-transform: none;\n  transform: none;\n  border-radius: 500px;\n}\n/*--------------\n     Slider\n---------------*/\n.ui.slider.checkbox {\n  cursor: pointer;\n  min-width: 3em;\n}\n/* Line */\n.ui.slider.checkbox:after {\n  position: absolute;\n  top: 0.5em;\n  left: 0em;\n  content: \'\';\n  width: 3em;\n  height: 2px;\n  background-color: rgba(0, 0, 0, 0.1);\n}\n/* Button */\n.ui.slider.checkbox .box,\n.ui.slider.checkbox label {\n  padding-left: 4em;\n}\n.ui.slider.checkbox .box:before,\n.ui.slider.checkbox label:before {\n  cursor: pointer;\n  display: block;\n  position: absolute;\n  top: -0.25em;\n  left: 0em;\n  z-index: 1;\n  width: 1.5em;\n  height: 1.5em;\n  -webkit-transform: none;\n  -moz-transform: none;\n  -ms-transform: none;\n  transform: none;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  border-radius: 50rem;\n  -webkit-transition: left 0.3s ease 0s;\n  -moz-transition: left 0.3s ease 0s;\n  transition: left 0.3s ease 0s;\n}\n/* Button Activation Light */\n.ui.slider.checkbox .box:after,\n.ui.slider.checkbox label:after {\n  opacity: 1;\n  position: absolute;\n  content: \'\';\n  top: 0.15em;\n  left: 0em;\n  z-index: 2;\n  margin-left: 0.375em;\n  border: none;\n  width: 0.75em;\n  height: 0.75em;\n  border-radius: 50rem;\n  -webkit-transform: none;\n  -moz-transform: none;\n  -ms-transform: none;\n  transform: none;\n  -webkit-transition: background 0.3s ease 0s,\n    left 0.3s ease 0s\n  ;\n  -moz-transition: background 0.3s ease 0s,\n    left 0.3s ease 0s\n  ;\n  transition: background 0.3s ease 0s,\n    left 0.3s ease 0s\n  ;\n}\n/* Selected Slider Toggle */\n.ui.slider.checkbox input:checked ~ .box:before,\n.ui.slider.checkbox input:checked ~ label:before,\n.ui.slider.checkbox input:checked ~ .box:after,\n.ui.slider.checkbox input:checked ~ label:after {\n  left: 1.75em;\n}\n/* Off Color */\n.ui.slider.checkbox .box:after,\n.ui.slider.checkbox label:after {\n  background-color: #D95C5C;\n}\n/* On Color */\n.ui.slider.checkbox input:checked ~ .box:after,\n.ui.slider.checkbox input:checked ~ label:after {\n  background-color: #89B84C;\n}\n/*--------------\n     Toggle\n---------------*/\n.ui.toggle.checkbox {\n  cursor: pointer;\n}\n.ui.toggle.checkbox .box,\n.ui.toggle.checkbox label {\n  padding-left: 4em;\n}\n/* Switch */\n.ui.toggle.checkbox .box:before,\n.ui.toggle.checkbox label:before {\n  cursor: pointer;\n  display: block;\n  position: absolute;\n  content: \'\';\n  top: -0.25em;\n  left: 0em;\n  z-index: 1;\n  background-color: #FFFFFF;\n  width: 3em;\n  height: 1.5em;\n  -webkit-transform: none;\n  -moz-transform: none;\n  -ms-transform: none;\n  transform: none;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) inset;\n  border-radius: 50rem;\n}\n/* Activation Light */\n.ui.toggle.checkbox .box:after,\n.ui.toggle.checkbox label:after {\n  opacity: 1;\n  background-color: transparent;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  content: \'\';\n  position: absolute;\n  top: 0.15em;\n  left: 0.5em;\n  z-index: 2;\n  border: none;\n  width: 0.75em;\n  height: 0.75em;\n  background-color: #D95C5C;\n  border-radius: 50rem;\n  -webkit-transition: background 0.3s ease 0s,\n    left 0.3s ease 0s\n  ;\n  -moz-transition: background 0.3s ease 0s,\n    left 0.3s ease 0s\n  ;\n  transition: background 0.3s ease 0s,\n    left 0.3s ease 0s\n  ;\n}\n/* Active */\n.ui.toggle.checkbox:active .box:before,\n.ui.toggle.checkbox:active label:before {\n  background-color: #F5F5F5;\n}\n/* Active */\n.ui.toggle.checkbox input:checked ~ .box:after,\n.ui.toggle.checkbox input:checked ~ label:after {\n  left: 1.75em;\n  background-color: #89B84C;\n}\n/*--------------\n     Sizes\n---------------*/\n.ui.checkbox {\n  font-size: 1em;\n}\n.ui.large.checkbox {\n  font-size: 1.25em;\n}\n.ui.huge.checkbox {\n  font-size: 1.5em;\n}\n\n/*\n * # Semantic - Dimmer\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Dimmer\n*******************************/\n.ui.dimmable {\n  position: relative;\n}\n.ui.dimmer {\n  display: none;\n  position: absolute;\n  top: 0em !important;\n  left: 0em !important;\n  width: 0%;\n  height: 0%;\n  text-align: center;\n  vertical-align: middle;\n  background-color: rgba(0, 0, 0, 0.85);\n  opacity: 0;\n  line-height: 1;\n  -webkit-animation-fill-mode: both;\n  -moz-animation-fill-mode: both;\n  animation-fill-mode: both;\n  -webkit-animation-duration: 0.5s;\n  -moz-animation-duration: 0.5s;\n  animation-duration: 0.5s;\n  -webkit-transition: background-color 0.5s linear;\n  -moz-transition: background-color 0.5s linear;\n  transition: background-color 0.5s linear;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  box-sizing: border-box;\n  z-index: 1000;\n}\n/* Dimmer Content */\n.ui.dimmer > .content {\n  width: 100%;\n  height: 100%;\n  display: table;\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n}\n.ui.dimmer > .content > div {\n  display: table-cell;\n  vertical-align: middle;\n  color: #FFFFFF;\n}\n/* Loose Coupling */\n.ui.segment > .ui.dimmer {\n  border-radius: 5px;\n}\n.ui.horizontal.segment > .ui.dimmer,\n.ui.vertical.segment > .ui.dimmer {\n  border-radius: 5px;\n}\n/*******************************\n            States\n*******************************/\n.ui.dimmed.dimmable:not(body) {\n  overflow: hidden;\n}\n.ui.dimmed.dimmable > .ui.animating.dimmer,\n.ui.dimmed.dimmable > .ui.visible.dimmer,\n.ui.active.dimmer {\n  display: block;\n  width: 100%;\n  height: 100%;\n  opacity: 1;\n}\n.ui.disabled.dimmer {\n  width: 0em !important;\n  height: 0em !important;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------\n      Page\n---------------*/\n.ui.page.dimmer {\n  position: fixed;\n  -webkit-transform-style: preserve-3d;\n  -moz-transform-style: preserve-3d;\n  -ms-transform-style: preserve-3d;\n  transform-style: preserve-3d;\n  -webkit-perspective: 2000px;\n  -moz-perspective: 2000px;\n  -ms-perspective: 2000px;\n  perspective: 2000px;\n  -webkit-transform-origin: center center;\n  -moz-transform-origin: center center;\n  -ms-transform-origin: center center;\n  transform-origin: center center;\n}\n.ui.scrolling.dimmable > .dimmer,\n.ui.scrolling.page.dimmer {\n  position: absolute;\n}\n/* Blurred Background\nbody.ui.dimmed.dimmable > :not(.dimmer){\n  filter: ~"blur(15px) grayscale(0.7)";\n}\n*/\n/*--------------\n    Aligned\n---------------*/\n.ui.dimmer > .top.aligned.content > * {\n  vertical-align: top;\n}\n.ui.dimmer > .bottom.aligned.content > * {\n  vertical-align: bottom;\n}\n/*--------------\n    Inverted\n---------------*/\n.ui.inverted.dimmer {\n  background-color: rgba(255, 255, 255, 0.85);\n}\n.ui.inverted.dimmer > .content > * {\n  color: rgba(0, 0, 0, 0.8);\n}\n/*--------------\n     Simple\n---------------*/\n/* Displays without javascript */\n.ui.simple.dimmer {\n  display: block;\n  overflow: hidden;\n  opacity: 1;\n  z-index: -100;\n  background-color: rgba(0, 0, 0, 0);\n}\n.ui.dimmed.dimmable > .ui.simple.dimmer {\n  overflow: visible;\n  opacity: 1;\n  width: 100%;\n  height: 100%;\n  background-color: rgba(0, 0, 0, 0.85);\n  z-index: 1;\n}\n.ui.simple.inverted.dimmer {\n  background-color: rgba(255, 255, 255, 0);\n}\n.ui.dimmed.dimmable > .ui.simple.inverted.dimmer {\n  background-color: rgba(255, 255, 255, 0.85);\n}\n\n/*\n * # Semantic - Dropdown\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Dropdown\n*******************************/\n.ui.dropdown {\n  cursor: pointer;\n  position: relative;\n  display: inline-block;\n  line-height: 1;\n  -webkit-transition: border-radius 0.1s ease, width 0.2s ease;\n  -moz-transition: border-radius 0.1s ease, width 0.2s ease;\n  transition: border-radius 0.1s ease, width 0.2s ease;\n  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);\n  -moz-tap-highlight-color: rgba(0, 0, 0, 0);\n  tap-highlight-color: rgba(0, 0, 0, 0);\n}\n/*******************************\n            Content\n*******************************/\n/*--------------\n     Menu\n---------------*/\n.ui.dropdown .menu {\n  cursor: auto;\n  position: absolute;\n  display: none;\n  top: 100%;\n  margin: 0em;\n  background-color: #FFFFFF;\n  min-width: 100%;\n  white-space: nowrap;\n  font-size: 0.875em;\n  text-shadow: none;\n  -webkit-box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.1);\n  border-radius: 0px 0px 0.325em 0.325em;\n  -webkit-transition: opacity 0.2s ease;\n  -moz-transition: opacity 0.2s ease;\n  transition: opacity 0.2s ease;\n  z-index: 11;\n}\n/*--------------\n      Icon\n---------------*/\n.ui.dropdown > .dropdown.icon {\n  width: auto;\n  margin: 0em 0em 0em 1em;\n}\n.ui.dropdown > .dropdown.icon:before {\n  content: "\f0d7";\n}\n.ui.dropdown .menu .item .dropdown.icon {\n  width: auto;\n  float: right;\n  margin: 0em 0em 0em 0.5em;\n}\n.ui.dropdown .menu .item .dropdown.icon:before {\n  content: "\f0da" /*rtl:"\f0d9"*/;\n}\n/*--------------\n      Text\n---------------*/\n.ui.dropdown > .text {\n  display: inline-block;\n  -webkit-transition: color 0.2s ease;\n  -moz-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n/* Flyout Direction */\n.ui.dropdown .menu {\n  left: 0px;\n}\n/*--------------\n    Sub Menu\n---------------*/\n.ui.dropdown .menu .menu {\n  top: 0% !important;\n  left: 100% !important;\n  margin: 0em !important;\n  border-radius: 0 0.325em 0.325em 0em !important;\n}\n.ui.dropdown .menu .menu:after {\n  display: none;\n}\n.ui.dropdown .menu .item {\n  cursor: pointer;\n  border: none;\n  border-top: 1px solid rgba(0, 0, 0, 0.05);\n  height: auto;\n  font-size: 0.875em;\n  display: block;\n  color: rgba(0, 0, 0, 0.75);\n  padding: 0.85em 1em !important;\n  font-size: 0.875rem;\n  text-transform: none;\n  font-weight: normal;\n  text-align: left;\n  -webkit-touch-callout: none;\n}\n.ui.dropdown .menu .item:before {\n  display: none;\n}\n.ui.dropdown .menu .item .icon {\n  margin-right: 0.75em;\n}\n.ui.dropdown .menu .item:first-child {\n  border-top: none;\n}\n/*******************************\n            Coupling\n*******************************/\n/* Opposite on last menu on right */\n.ui.menu .right.menu .dropdown:last-child .menu,\n.ui.buttons > .ui.dropdown:last-child .menu {\n  left: auto;\n  right: 0px;\n}\n.ui.vertical.menu .dropdown.item > .dropdown.icon:before {\n  content: "\f0da" /*rtl:"\f0d9"*/;\n}\n.ui.dropdown.icon.button > .dropdown.icon {\n  margin: 0em;\n}\n/*******************************\n            States\n*******************************/\n/* Dropdown Visible */\n.ui.visible.dropdown > .menu {\n  display: block;\n}\n/*--------------------\n        Hover\n----------------------*/\n/* Menu Item Hover */\n.ui.dropdown .menu .item:hover {\n  background-color: rgba(0, 0, 0, 0.02);\n  z-index: 12;\n}\n/*--------------------\n        Selected\n----------------------*/\n/* Menu Item Selected */\n.ui.dropdown .menu .item.selected {\n  background-color: rgba(0, 0, 0, 0.02);\n  z-index: 12;\n}\n/*--------------------\n        Active\n----------------------*/\n/* Menu Item Active */\n.ui.dropdown .menu .active.item {\n  background-color: rgba(0, 0, 0, 0.06) !important;\n  border-left: none;\n  border-color: transparent !important;\n  -webkit-box-shadow: none;\n  -moz-shadow: none;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n  z-index: 12;\n}\n/*--------------------\n     Default Text\n----------------------*/\n.ui.dropdown > .default.text,\n.ui.default.dropdown > .text {\n  color: rgba(0, 0, 0, 0.5);\n}\n.ui.dropdown:hover > .default.text,\n.ui.default.dropdown:hover > .text {\n  color: rgba(0, 0, 0, 0.8);\n}\n/*--------------------\n        Error\n----------------------*/\n.ui.dropdown.error,\n.ui.dropdown.error > .text,\n.ui.dropdown.error > .default.text {\n  color: #D95C5C !important;\n}\n.ui.selection.dropdown.error {\n  background-color: #FFFAFA;\n  -webkit-box-shadow: 0px 0px 0px 1px #e7bebe !important;\n  box-shadow: 0px 0px 0px 1px #e7bebe !important;\n}\n.ui.selection.dropdown.error:hover {\n  -webkit-box-shadow: 0px 0px 0px 1px #e7bebe !important;\n  box-shadow: 0px 0px 0px 1px #e7bebe !important;\n}\n.ui.dropdown.error > .menu,\n.ui.dropdown.error > .menu .menu {\n  -webkit-box-shadow: 0px 0px 1px 1px #E7BEBE !important;\n  box-shadow: 0px 0px 1px 1px #E7BEBE !important;\n}\n.ui.dropdown.error > .menu .item {\n  color: #D95C5C !important;\n}\n/* Item Hover */\n.ui.dropdown.error > .menu .item:hover {\n  background-color: #FFF2F2 !important;\n}\n/* Item Active */\n.ui.dropdown.error > .menu .active.item {\n  background-color: #FDCFCF !important;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------\n     Simple\n---------------*/\n/* Displays without javascript */\n.ui.simple.dropdown .menu:before,\n.ui.simple.dropdown .menu:after {\n  display: none;\n}\n.ui.simple.dropdown .menu {\n  display: block;\n  overflow: hidden;\n  top: -9999px !important;\n  position: absolute;\n  opacity: 0;\n  width: 0;\n  height: 0;\n  -webkit-transition: opacity 0.2s ease-out;\n  -moz-transition: opacity 0.2s ease-out;\n  transition: opacity 0.2s ease-out;\n}\n.ui.simple.active.dropdown,\n.ui.simple.dropdown:hover {\n  border-bottom-left-radius: 0em !important;\n  border-bottom-right-radius: 0em !important;\n}\n.ui.simple.active.dropdown > .menu,\n.ui.simple.dropdown:hover > .menu {\n  overflow: visible;\n  width: auto;\n  height: auto;\n  top: 100% !important;\n  opacity: 1;\n}\n.ui.simple.dropdown > .menu .item:active > .menu,\n.ui.simple.dropdown:hover > .menu .item:hover > .menu {\n  overflow: visible;\n  width: auto;\n  height: auto;\n  top: 0% !important;\n  left: 100% !important;\n  opacity: 1;\n}\n.ui.simple.disabled.dropdown:hover .menu {\n  display: none;\n  height: 0px;\n  width: 0px;\n  overflow: hidden;\n}\n/*--------------\n    Selection\n---------------*/\n/* Displays like a select box */\n.ui.selection.dropdown {\n  cursor: pointer;\n  display: inline-block;\n  word-wrap: break-word;\n  white-space: normal;\n  background-color: #FFFFFF;\n  padding: 0.65em 1em;\n  line-height: 1.33;\n  color: rgba(0, 0, 0, 0.8);\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) !important;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1) !important;\n  border-radius: 0.3125em !important;\n}\n.ui.selection.dropdown select {\n  display: none;\n}\n.ui.selection.dropdown > .dropdown.icon {\n  opacity: 0.7;\n  margin: 0.2em 0em 0.2em 1.25em;\n  -webkit-transition: opacity 0.2s ease-out;\n  -moz-transition: opacity 0.2s ease-out;\n  transition: opacity 0.2s ease-out;\n}\n.ui.selection.dropdown,\n.ui.selection.dropdown .menu {\n  -webkit-transition: -webkit-box-shadow 0.2s ease-out;\n  -moz-transition: box-shadow 0.2s ease-out;\n  transition: box-shadow 0.2s ease-out;\n}\n.ui.selection.dropdown .menu {\n  top: 100%;\n  max-height: 312px;\n  overflow-x: hidden;\n  overflow-y: auto;\n  -webkit-box-shadow: 0px 1px 0px 1px #E0E0E0;\n  box-shadow: 0px 1px 0px 1px #E0E0E0;\n  border-radius: 0px 0px 0.325em 0.325em;\n}\n.ui.selection.dropdown .menu:after,\n.ui.selection.dropdown .menu:before {\n  display: none;\n}\n.ui.selection.dropdown .menu img {\n  height: 2.5em;\n  display: inline-block;\n  vertical-align: middle;\n  margin-right: 0.5em;\n}\n/*--------------------\n        Error\n----------------------*/\n.ui.selection.dropdown.error,\n.ui.selection.dropdown.error .item {\n  background-color: #FFFAFA;\n  color: #D95C5C;\n}\n.ui.selection.dropdown.error {\n  -webkit-box-shadow: 0px 0px 0px 1px #e7bebe !important;\n  box-shadow: 0px 0px 0px 1px #e7bebe !important;\n}\n.ui.selection.dropdown.error .menu {\n  -webkit-box-shadow: 0px 1px 0px 1px #E7BEBE;\n  box-shadow: 0px 1px 0px 1px #E7BEBE;\n  border-radius: 0px 0px 0.325em 0.325em;\n}\n/* Menu Item Active */\n.ui.selection.dropdown.error .menu .active.item {\n  background-color: #FDCFCF !important;\n}\n/* Hover */\n.ui.selection.dropdown:hover {\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.2) !important;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.2) !important;\n}\n.ui.selection.dropdown:hover .menu {\n  -webkit-box-shadow: 0px 1px 0px 1px #D3D3D3;\n  box-shadow: 0px 1px 0px 1px #D3D3D3;\n}\n.ui.selection.dropdown:hover > .dropdown.icon {\n  opacity: 1;\n}\n.ui.selection.dropdown.error:hover {\n  -webkit-box-shadow: 0px 0px 0px 1px #e7bebe !important;\n  box-shadow: 0px 0px 0px 1px #e7bebe !important;\n}\n.ui.selection.dropdown.error:hover .menu {\n  -webkit-box-shadow: 0px 1px 0px 1px #E7BEBE;\n  box-shadow: 0px 1px 0px 1px #E7BEBE;\n}\n.ui.selection.dropdown.error .menu .item:hover {\n  background-color: #FFF2F2;\n}\n/* Selected */\n.ui.selection.dropdown.error .menu .item.selected {\n  background-color: #FFF2F2;\n}\n/* Visible */\n.ui.visible.selection.dropdown {\n  border-bottom-left-radius: 0em !important;\n  border-bottom-right-radius: 0em !important;\n}\n/* Active */\n.ui.active.selection.dropdown {\n  border-radius: 0.3125em 0.3125em 0em 0em !important;\n}\n.ui.active.selection.dropdown > .dropdown.icon {\n  opacity: 1;\n}\n/*--------------\n      Fluid\n---------------*/\n.ui.fluid.dropdown {\n  display: block;\n}\n.ui.fluid.dropdown > .dropdown.icon {\n  float: right;\n}\n/*--------------\n     Inline\n---------------*/\n.ui.inline.dropdown {\n  cursor: pointer;\n  display: inline-block;\n  color: inherit;\n}\n.ui.inline.dropdown .dropdown.icon {\n  margin: 0em 0.5em 0em 0.25em;\n}\n.ui.inline.dropdown .text {\n  font-weight: bold;\n}\n.ui.inline.dropdown .menu {\n  cursor: auto;\n  margin-top: 0.25em;\n  border-radius: 0.325em;\n}\n/*--------------\n    Floating\n---------------*/\n.ui.floating.dropdown .menu {\n  left: 0;\n  right: auto;\n  margin-top: 0.5em !important;\n  border-radius: 0.325em;\n}\n/*--------------\n     Pointing\n---------------*/\n.ui.pointing.dropdown .menu {\n  top: 100%;\n  margin-top: 0.75em;\n  border-radius: 0.325em;\n}\n.ui.pointing.dropdown .menu:after {\n  display: block;\n  position: absolute;\n  pointer-events: none;\n  content: " ";\n  visibility: visible;\n  width: 0.5em;\n  height: 0.5em;\n  -webkit-box-shadow: -1px -1px 0px 1px rgba(0, 0, 0, 0.05);\n  box-shadow: -1px -1px 0px 1px rgba(0, 0, 0, 0.05);\n  background-image: none;\n  background-color: #FFFFFF;\n  -webkit-transform: rotate(45deg);\n  -moz-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n  z-index: 2;\n}\n.ui.pointing.dropdown .menu .active.item:first-child {\n  background: transparent -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.03));\n  background: transparent -moz-linear-gradient(transparent, rgba(0, 0, 0, 0.03));\n  background: transparent linear-gradient(transparent, rgba(0, 0, 0, 0.03));\n}\n/* Directions */\n.ui.pointing.dropdown .menu:after {\n  top: -0.25em;\n  left: 50%;\n  margin: 0em 0em 0em -0.25em;\n}\n.ui.top.left.pointing.dropdown .menu {\n  top: 100%;\n  bottom: auto;\n  left: 0%;\n  right: auto;\n  margin: 0.75em 0em 0em;\n}\n.ui.top.left.pointing.dropdown .menu:after {\n  top: -0.25em;\n  left: 1.25em;\n  right: auto;\n  margin: 0em;\n  -webkit-transform: rotate(45deg);\n  -moz-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n}\n.ui.top.right.pointing.dropdown .menu {\n  top: 100%;\n  bottom: auto;\n  right: 0%;\n  left: auto;\n  margin: 0.75em 0em 0em;\n}\n.ui.top.right.pointing.dropdown .menu:after {\n  top: -0.25em;\n  left: auto;\n  right: 1.25em;\n  margin: 0em;\n  -webkit-transform: rotate(45deg);\n  -moz-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n}\n.ui.left.pointing.dropdown .menu {\n  top: 0%;\n  left: 100%;\n  right: auto;\n  margin: 0em 0em 0em 0.75em;\n}\n.ui.left.pointing.dropdown .menu:after {\n  top: 1em;\n  left: -0.25em;\n  margin: 0em 0em 0em 0em;\n  -webkit-transform: rotate(-45deg);\n  -moz-transform: rotate(-45deg);\n  -ms-transform: rotate(-45deg);\n  transform: rotate(-45deg);\n}\n.ui.right.pointing.dropdown .menu {\n  top: 0%;\n  left: auto;\n  right: 100%;\n  margin: 0em 0.75em 0em 0em;\n}\n.ui.right.pointing.dropdown .menu:after {\n  top: 1em;\n  left: auto;\n  right: -0.25em;\n  margin: 0em 0em 0em 0em;\n  -webkit-transform: rotate(135deg);\n  -moz-transform: rotate(135deg);\n  -ms-transform: rotate(135deg);\n  transform: rotate(135deg);\n}\n\n/*\n * # Semantic - Modal\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n             Modal\n*******************************/\n.ui.modal {\n  display: none;\n  position: fixed;\n  z-index: 1001;\n  top: 50%;\n  left: 50%;\n  text-align: left;\n  width: 90%;\n  margin-left: -45%;\n  background-color: #FFFFFF;\n  border: 1px solid #DDDDDD;\n  border-radius: 5px;\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n}\n/*******************************\n            Content\n*******************************/\n/*--------------\n     Close\n---------------*/\n.ui.modal > .close {\n  cursor: pointer;\n  position: absolute;\n  z-index: 1;\n  opacity: 0.8;\n  font-size: 1.25em;\n  top: -1.75em;\n  right: -1.75em;\n  color: #FFFFFF;\n}\n.ui.modal > .close:hover {\n  opacity: 1;\n}\n/*--------------\n     Header\n---------------*/\n.ui.modal > .header {\n  margin: 0em;\n  padding: 1.5rem 2rem;\n  font-size: 1.6em;\n  font-weight: bold;\n  border-radius: 0.325em 0.325em 0px 0px;\n}\n/*--------------\n     Content\n---------------*/\n.ui.modal > .content {\n  display: table;\n  width: 100%;\n  position: relative;\n  padding: 2em;\n  background-color: #F4F4F4;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.modal > .content > .left:not(.ui) {\n  display: table-cell;\n  padding-right: 1.5%;\n  min-width: 25%;\n}\n.ui.modal > .content > .right:not(.ui) {\n  display: table-cell;\n  padding-left: 1.5%;\n  vertical-align: top;\n}\n/*rtl:ignore*/\n.ui.modal > .content > .left:not(.ui) > i.icon {\n  font-size: 8em;\n  margin: 0em;\n}\n.ui.modal > .content p {\n  line-height: 1.6;\n}\n/*--------------\n     Actions\n---------------*/\n.ui.modal .actions {\n  padding: 1rem 2rem;\n  text-align: right;\n}\n.ui.modal .actions > .button {\n  margin-left: 0.75em;\n}\n/*-------------------\n       Sizing\n--------------------*/\n/* Mobile Only */\n@media only screen and (max-width: 768px) {\n  /*rtl:ignore*/\n  .ui.modal .content > .left:not(.ui) {\n    display: block;\n    padding: 0em 0em 1em;\n  }\n  /*rtl:ignore*/\n  .ui.modal .content > .right:not(.ui) {\n    display: block;\n    padding: 1em 0em 0em;\n    -webkit-box-shadow: none;\n    box-shadow: none;\n  }\n  .ui.modal .content .image {\n    width: auto !important;\n    max-width: 100%;\n  }\n  .ui.modal .actions {\n    padding-bottom: 0em;\n  }\n  .ui.modal .actions > .buttons,\n  .ui.modal .actions > .button {\n    margin-bottom: 1em;\n  }\n}\n/* Tablet and Mobile */\n@media only screen and (max-width: 998px) {\n  .ui.modal {\n    width: 92%;\n    margin-left: -46%;\n  }\n  .ui.modal > .close {\n    color: rgba(0, 0, 0, 0.8);\n    top: 1.5rem;\n    right: 1rem;\n  }\n}\n/* Computer / Responsive */\n@media only screen and (min-width: 998px) {\n  .ui.modal {\n    width: 74%;\n    margin-left: -37%;\n  }\n}\n@media only screen and (min-width: 1500px) {\n  .ui.modal {\n    width: 56%;\n    margin-left: -28%;\n  }\n}\n@media only screen and (min-width: 1750px) {\n  .ui.modal {\n    width: 42%;\n    margin-left: -21%;\n  }\n}\n@media only screen and (min-width: 2000px) {\n  .ui.modal {\n    width: 36%;\n    margin-left: -18%;\n  }\n}\n/*******************************\n             Types\n*******************************/\n.ui.basic.modal {\n  background-color: transparent;\n  border: none;\n  color: #FFFFFF;\n}\n.ui.basic.modal > .close {\n  top: 1.5rem;\n  right: 1rem;\n}\n.ui.basic.modal .content {\n  background-color: transparent;\n}\n/*******************************\n            Variations\n*******************************/\n/* A modal that cannot fit on the page */\n.ui.modal.scrolling {\n  position: absolute;\n  margin-top: 10px;\n}\n/*******************************\n              States\n*******************************/\n.ui.active.modal {\n  display: block;\n}\n/*--------------\n      Size\n---------------*/\n/* Small */\n.ui.small.modal > .header {\n  font-size: 1.3em;\n}\n@media only screen and (min-width: 998px) {\n  .ui.small.modal {\n    width: 58%;\n    margin-left: -29%;\n  }\n}\n@media only screen and (min-width: 1500px) {\n  .ui.small.modal {\n    width: 40%;\n    margin-left: -20%;\n  }\n}\n@media only screen and (min-width: 1750px) {\n  .ui.small.modal {\n    width: 26%;\n    margin-left: -13%;\n  }\n}\n@media only screen and (min-width: 2000px) {\n  .ui.small.modal {\n    width: 20%;\n    margin-left: -10%;\n  }\n}\n/* Large */\n@media only screen and (min-width: 998px) {\n  .ui.large.modal {\n    width: 74%;\n    margin-left: -37%;\n  }\n}\n@media only screen and (min-width: 1500px) {\n  .ui.large.modal {\n    width: 64%;\n    margin-left: -32%;\n  }\n}\n@media only screen and (min-width: 1750px) {\n  .ui.large.modal {\n    width: 54%;\n    margin-left: -27%;\n  }\n}\n@media only screen and (min-width: 2000px) {\n  .ui.large.modal {\n    width: 44%;\n    margin-left: -22%;\n  }\n}\n\n/*\n * # Semantic - Nag\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n             Nag\n*******************************/\n.ui.nag {\n  display: none;\n  opacity: 0.95;\n  position: relative;\n  top: 0px;\n  left: 0%;\n  z-index: 101;\n  min-height: 0;\n  width: 100%;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  margin: 0em;\n  line-height: 3em;\n  padding: 0em 1em;\n  background-color: #555555;\n  -webkit-box-shadow: 0px 1px 2px 0px rgba(0, 0, 0, 0.2);\n  box-shadow: 0px 1px 2px 0px rgba(0, 0, 0, 0.2);\n  font-size: 1em;\n  text-align: center;\n  color: rgba(255, 255, 255, 0.8);\n  border-radius: 0px 0px 5px 5px;\n  -webkit-transition: 0.2s background;\n  -moz-transition: 0.2s background;\n  transition: 0.2s background;\n}\na.ui.nag {\n  cursor: pointer;\n}\n.ui.nag > .title {\n  display: inline-block;\n  margin: 0em 0.5em;\n  color: #FFFFFF;\n}\n.ui.nag > .close.icon {\n  cursor: pointer;\n  opacity: 0.4;\n  position: absolute;\n  top: 50%;\n  right: 1em;\n  margin-top: -0.5em;\n  color: #FFFFFF;\n  -webkit-transition: 0.1s opacity;\n  -moz-transition: 0.1s opacity;\n  transition: 0.1s opacity;\n}\n/*******************************\n             States\n*******************************/\n/* Hover */\n.ui.nag:hover {\n  opacity: 1;\n}\n.ui.nag .close:hover {\n  opacity: 1;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------\n     Static\n---------------*/\n.ui.overlay.nag {\n  position: absolute;\n  display: block;\n}\n/*--------------\n     Fixed\n---------------*/\n.ui.fixed.nag {\n  position: fixed;\n}\n/*--------------\n     Bottom\n---------------*/\n.ui.bottom.nag {\n  border-radius: 5px 5px 0px 0px;\n}\n.ui.fixed.bottom.nags,\n.ui.fixed.bottom.nag {\n  top: auto;\n  bottom: 0px;\n}\n/*--------------\n     White\n---------------*/\n.ui.white.nags .nag,\n.ui.white.nag {\n  background-color: #F1F1F1;\n  text-shadow: 0px 1px 0px rgba(255, 255, 255, 0.8);\n  color: #ACACAC;\n}\n.ui.white.nags .nag .close,\n.ui.white.nags .nag .title,\n.ui.white.nag .close,\n.ui.white.nag .title {\n  color: #333333;\n}\n/*******************************\n           Groups\n*******************************/\n.ui.nags .nag {\n  border-radius: 0px;\n}\n\n/*\n * # Semantic - Popup\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Popup\n*******************************/\n.ui.popup {\n  display: none;\n  position: absolute;\n  top: 0px;\n  right: 0px;\n  z-index: 900;\n  border: 1px solid rgba(0, 0, 0, 0.1);\n  max-width: 250px;\n  background-color: #FFFFFF;\n  padding: 0.8em 1.2em;\n  font-size: 0.875rem;\n  font-weight: normal;\n  font-style: normal;\n  color: rgba(0, 0, 0, 0.7);\n  border-radius: 0.2em;\n  -webkit-box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.1);\n}\n.ui.popup .header {\n  padding: 0em 0em 0.5em;\n  font-size: 1.125em;\n  line-height: 1.2;\n  font-weight: bold;\n}\n.ui.popup:before {\n  position: absolute;\n  content: "";\n  width: 0.75em;\n  height: 0.75rem;\n  background-image: none;\n  background-color: #FFFFFF;\n  -webkit-transform: rotate(45deg);\n  -moz-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n  z-index: 2;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  -webkit-box-shadow: 1px 1px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 1px 1px 1px rgba(0, 0, 0, 0.1);\n}\n.ui.popup .ui.button {\n  width: 100%;\n}\n/*******************************\n            Types\n*******************************/\n/*--------------\n     Spacing\n---------------*/\n.ui.popup {\n  margin: 0em;\n}\n.ui.popup.bottom {\n  margin: 0.75em 0em 0em;\n}\n.ui.popup.top {\n  margin: 0em 0em 0.75em;\n}\n.ui.popup.left.center {\n  margin: 0em 0.75em 0em 0em;\n}\n.ui.popup.right.center {\n  margin: 0em 0em 0em 0.75em;\n}\n.ui.popup.center {\n  margin-left: -1.25em;\n}\n/*--------------\n     Pointer\n---------------*/\n/*--- Below ---*/\n.ui.bottom.center.popup:before {\n  margin-left: -0.4em;\n  top: -0.4em;\n  left: 50%;\n  right: auto;\n  bottom: auto;\n  -webkit-box-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2);\n  box-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2);\n}\n.ui.bottom.left.popup {\n  margin-right: -2em;\n}\n.ui.bottom.left.popup:before {\n  top: -0.4em;\n  right: 1em;\n  bottom: auto;\n  left: auto;\n  margin-left: 0em;\n  -webkit-box-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2);\n  box-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2);\n}\n.ui.bottom.right.popup {\n  margin-left: -2em;\n}\n.ui.bottom.right.popup:before {\n  top: -0.4em;\n  left: 1em;\n  right: auto;\n  bottom: auto;\n  margin-left: 0em;\n  -webkit-box-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2);\n  box-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2);\n}\n/*--- Above ---*/\n.ui.top.center.popup:before {\n  top: auto;\n  right: auto;\n  bottom: -0.4em;\n  left: 50%;\n  margin-left: -0.4em;\n}\n.ui.top.left.popup {\n  margin-right: -2em;\n}\n.ui.top.left.popup:before {\n  bottom: -0.4em;\n  right: 1em;\n  top: auto;\n  left: auto;\n  margin-left: 0em;\n}\n.ui.top.right.popup {\n  margin-left: -2em;\n}\n.ui.top.right.popup:before {\n  bottom: -0.4em;\n  left: 1em;\n  top: auto;\n  right: auto;\n  margin-left: 0em;\n}\n/*--- Left Center ---*/\n.ui.left.center.popup:before {\n  top: 50%;\n  right: -0.35em;\n  bottom: auto;\n  left: auto;\n  margin-top: -0.4em;\n  -webkit-box-shadow: 1px -1px 1px rgba(0, 0, 0, 0.2);\n  box-shadow: 1px -1px 1px rgba(0, 0, 0, 0.2);\n}\n/*--- Right Center  ---*/\n.ui.right.center.popup:before {\n  top: 50%;\n  left: -0.35em;\n  bottom: auto;\n  right: auto;\n  margin-top: -0.4em;\n  -webkit-box-shadow: -1px 1px 1px rgba(0, 0, 0, 0.2);\n  box-shadow: -1px 1px 1px rgba(0, 0, 0, 0.2);\n}\n/*******************************\n            States\n*******************************/\n.ui.loading.popup {\n  display: block;\n  visibility: hidden;\n}\n.ui.animating.popup,\n.ui.visible.popup {\n  display: block;\n}\n/*******************************\n            Variations\n*******************************/\n/*--------------\n      Size\n---------------*/\n.ui.small.popup {\n  font-size: 0.75rem;\n}\n.ui.large.popup {\n  font-size: 1rem;\n}\n/*--------------\n     Colors\n---------------*/\n/* Inverted colors  */\n.ui.inverted.popup {\n  background-color: #333333;\n  border: none;\n  color: #FFFFFF;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n.ui.inverted.popup .header {\n  background-color: rgba(0, 0, 0, 0.2);\n  color: #FFFFFF;\n}\n.ui.inverted.popup:before {\n  background-color: #333333;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n\n/*\n * # Semantic - Rating\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n           Rating\n*******************************/\n.ui.rating {\n  display: inline-block;\n  font-size: 0em;\n  vertical-align: middle;\n  margin: 0em 0.5rem 0em 0em;\n}\n.ui.rating:last-child {\n  margin-right: 0em;\n}\n.ui.rating:before {\n  display: block;\n  content: \'\';\n  visibility: hidden;\n  clear: both;\n  height: 0;\n}\n/* Icon */\n.ui.rating .icon {\n  cursor: pointer;\n  margin: 0em;\n  width: 1em;\n  height: auto;\n  padding: 0em;\n  color: rgba(0, 0, 0, 0.15);\n  font-weight: normal;\n  font-style: normal;\n}\n.ui.rating .icon:before {\n  content: "\2605";\n}\n/*******************************\n             Types\n*******************************/\n/*-------------------\n        Star\n--------------------*/\n.ui.star.rating .icon {\n  width: 1.2em;\n}\n/* Star */\n.ui.star.rating .icon:before {\n  content: \'\f006\';\n  font-family: \'Icons\';\n}\n/* Active Star */\n.ui.star.rating .active.icon:before {\n  content: \'\f005\';\n  font-family: \'Icons\';\n}\n/*-------------------\n        Heart\n--------------------*/\n.ui.heart.rating .icon {\n  width: 1.2em;\n}\n.ui.heart.rating .icon:before {\n  content: \'\f08a\';\n  font-family: \'Icons\';\n}\n/* Active */\n.ui.heart.rating .active.icon:before {\n  content: \'\f004\';\n  font-family: \'Icons\';\n}\n.ui.heart.rating .active.icon {\n  color: #EF404A !important;\n}\n/* Hovered */\n.ui.heart.rating .hover.icon,\n.ui.heart.rating .active.hover.icon {\n  color: #FF2733 !important;\n}\n/*******************************\n             States\n*******************************/\n/*-------------------\n        Active\n--------------------*/\n/* disabled rating */\n.ui.disabled.rating .icon {\n  cursor: default;\n}\n/* active icons */\n.ui.rating .active.icon {\n  color: #FFCB08 !important;\n}\n/*-------------------\n        Hover\n--------------------*/\n/* rating */\n.ui.rating.hover .active.icon {\n  opacity: 0.5;\n}\n/* icon */\n.ui.rating .icon.hover,\n.ui.rating .icon.hover.active {\n  opacity: 1;\n  color: #FFB70A !important;\n}\n/*******************************\n          Variations\n*******************************/\n.ui.small.rating .icon {\n  font-size: 0.75rem;\n}\n.ui.rating .icon {\n  font-size: 1rem;\n}\n.ui.large.rating .icon {\n  font-size: 1.5rem;\n  vertical-align: middle;\n}\n.ui.huge.rating .icon {\n  font-size: 2rem;\n  vertical-align: middle;\n}\n\n/*\n * # Semantic - Search\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n             Search\n*******************************/\n.ui.search {\n  position: relative;\n  text-shadow: none;\n  font-style: normal;\n  font-weight: normal;\n}\n.ui.search input {\n  border-radius: 500rem;\n}\n/*--------------\n     Button\n---------------*/\n.ui.search > .button {\n  position: relative;\n  z-index: 2;\n  float: right;\n  margin: 0px 0px 0px -15px;\n  padding: 6px 15px 7px;\n  border-radius: 0px 15px 15px 0px;\n  -webkit-box-shadow: none;\n  box-shadow: none;\n}\n/*--------------\n    Results\n---------------*/\n.ui.search .results {\n  display: none;\n  position: absolute;\n  z-index: 999;\n  top: 100%;\n  left: 0px;\n  overflow: hidden;\n  background-color: #FFFFFF;\n  margin-top: 0.5em;\n  width: 380px;\n  font-size: 0.875em;\n  line-height: 1.2;\n  color: #555555;\n  border-radius: 3px;\n  -webkit-box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.1), 0px -2px 0px 0px rgba(0, 0, 0, 0.1) inset;\n  box-shadow: 0px 0px 1px 1px rgba(0, 0, 0, 0.1), 0px -2px 0px 0px rgba(0, 0, 0, 0.1) inset;\n}\n.ui.search .result {\n  cursor: pointer;\n  overflow: hidden;\n  padding: 0.5em 1em;\n}\n.ui.search .result:first-child {\n  border-top: none;\n}\n.ui.search .result .image {\n  background: #F0F0F0;\n  margin-right: 10px;\n  float: left;\n  overflow: hidden;\n  border-radius: 3px;\n  width: 38px;\n  height: 38px;\n}\n.ui.search .result .image img {\n  display: block;\n  width: 38px;\n  height: 38px;\n}\n.ui.search .result .image ~ .info {\n  float: none;\n  margin-left: 50px;\n}\n.ui.search .result .info {\n  float: left;\n}\n.ui.search .result .title {\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.search .result .description {\n  color: rgba(0, 0, 0, 0.6);\n}\n.ui.search .result .price {\n  float: right;\n  color: #5BBD72;\n  font-weight: bold;\n}\n/*--------------\n    Message\n---------------*/\n.ui.search .message {\n  padding: 1em;\n}\n.ui.search .message .text .title {\n  margin: 0em 0em 0.5rem;\n  font-size: 1.25rem;\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.search .message .text .description {\n  margin: 0em;\n  font-size: 1rem;\n  color: rgba(0, 0, 0, 0.5);\n}\n/*--------------\n    Categories\n---------------*/\n.ui.search .results .category {\n  background-color: #FAFAFA;\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  -webkit-transition: background 0.2s ease-in;\n  -moz-transition: background 0.2s ease-in;\n  transition: background 0.2s ease-in;\n}\n.ui.search .results .category:first-child {\n  border-top: none;\n}\n.ui.search .results .category > .name {\n  float: left;\n  padding: 12px 0px 0px 8px;\n  font-weight: bold;\n  color: #777777;\n  text-shadow: 0px 1px 0px rgba(255, 255, 255, 0.8);\n}\n.ui.search .results .category .result {\n  background-color: #FFFFFF;\n  margin-left: 80px;\n  border-left: 1px solid rgba(0, 0, 0, 0.1);\n}\n/* View All Results */\n.ui.search .all {\n  display: block;\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  background-color: #FAFAFA;\n  height: 2em;\n  line-height: 2em;\n  color: rgba(0, 0, 0, 0.6);\n  font-weight: bold;\n  text-align: center;\n}\n/*******************************\n            States\n*******************************/\n/*--------------\n      Hover\n---------------*/\n.ui.search .result:hover,\n.ui.search .category .result:hover {\n  background-color: #F8F8F8;\n}\n.ui.search .all:hover {\n  background-color: #F0F0F0;\n}\n/*--------------\n     Loading\n---------------*/\n.ui.search.loading .input .icon {\n  background: url(../images/loader-mini.gif) no-repeat 50% 50%;\n}\n.ui.search.loading .input .icon:before,\n.ui.search.loading .input .icon:after {\n  display: none;\n}\n/*--------------\n      Active\n---------------*/\n.ui.search .results .category.active {\n  background-color: #F1F1F1;\n}\n.ui.search .results .category.active > .name {\n  color: #333333;\n}\n.ui.search .result.active,\n.ui.search .category .result.active {\n  background-color: #FBFBFB;\n}\n.ui.search .result.active .title {\n  color: #000000;\n}\n.ui.search .result.active .description {\n  color: #555555;\n}\n/*******************************\n           Variations\n*******************************/\n/* Large */\n.ui.search .large.result .image,\n.ui.search .large.result .image img {\n  width: 50px;\n  height: 50px;\n}\n.ui.search .large.results .indented.info {\n  margin-left: 65px;\n}\n.ui.search .large.results .info .title {\n  font-size: 16px;\n}\n.ui.search .large.results .info .description {\n  font-size: 11px;\n}\n\n/*\n * # Semantic - Shape\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n              Shape\n*******************************/\n.ui.shape {\n  display: inline-block;\n  position: relative;\n  -webkit-perspective: 2000px;\n  -moz-perspective: 2000px;\n  -ms-perspective: 2000px;\n  perspective: 2000px;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.shape .sides {\n  -webkit-transform-style: preserve-3d;\n  -moz-transform-style: preserve-3d;\n  -ms-transform-style: preserve-3d;\n  transform-style: preserve-3d;\n}\n.ui.shape .side {\n  opacity: 1;\n  width: 100%;\n  margin: 0em !important;\n  -webkit-backface-visibility: hidden;\n  -moz-backface-visibility: hidden;\n  -ms-backface-visibility: hidden;\n  backface-visibility: hidden;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n.ui.shape .side {\n  display: none;\n}\n/*******************************\n             Types\n*******************************/\n.ui.cube.shape .side {\n  min-width: 15em;\n  height: 15em;\n  padding: 2em;\n  background-color: #E6E6E6;\n  color: rgba(0, 0, 0, 0.6);\n  -webkit-box-shadow: 0px 0px 2px rgba(0, 0, 0, 0.3);\n  box-shadow: 0px 0px 2px rgba(0, 0, 0, 0.3);\n}\n.ui.cube.shape .side > .content {\n  width: 100%;\n  height: 100%;\n  display: table;\n  text-align: center;\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n}\n.ui.cube.shape .side > .content > div {\n  display: table-cell;\n  vertical-align: middle;\n  font-size: 2em;\n}\n/*******************************\n          Variations\n*******************************/\n.ui.text.shape.animating .sides {\n  position: static;\n}\n.ui.text.shape .side {\n  white-space: nowrap;\n}\n.ui.text.shape .side > * {\n  white-space: normal;\n}\n/*******************************\n             States\n*******************************/\n/*--------------\n    Loading\n---------------*/\n.ui.loading.shape {\n  position: absolute;\n  top: -9999px;\n  left: -9999px;\n}\n/*--------------\n    Animating\n---------------*/\n.ui.shape .animating.side {\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  z-index: 100;\n}\n.ui.shape .hidden.side {\n  opacity: 0.4;\n}\n/*--------------\n      CSS\n---------------*/\n.ui.shape.animating {\n  -webkit-transition: all 0.6s ease-in-out;\n  -moz-transition: all 0.6s ease-in-out;\n  transition: all 0.6s ease-in-out;\n}\n.ui.shape.animating .sides {\n  position: absolute;\n}\n.ui.shape.animating .sides {\n  -webkit-transition: all 0.6s ease-in-out;\n  -moz-transition: all 0.6s ease-in-out;\n  transition: all 0.6s ease-in-out;\n}\n.ui.shape.animating .side {\n  -webkit-transition: opacity 0.6s ease-in-out;\n  -moz-transition: opacity 0.6s ease-in-out;\n  transition: opacity 0.6s ease-in-out;\n}\n/*--------------\n     Active\n---------------*/\n.ui.shape .active.side {\n  display: block;\n}\n\n/*\n * # Semantic - Sidebar\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Sidebar\n*******************************/\nbody {\n  -webkit-transition: margin 0.3s ease, -webkit-transform 0.3s ease /*rtl:append:,\n    padding 0.3s ease*/;\n  -moz-transition: margin 0.3s ease, -moz-transform 0.3s ease /*rtl:append:,\n    padding 0.3s ease*/;\n  transition: margin 0.3s ease, transform 0.3s ease /*rtl:append:,\n    padding 0.3s ease*/;\n}\n.ui.sidebar {\n  position: fixed;\n  margin: 0 !important;\n  height: 100% !important;\n  border-radius: 0px !important;\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  -ms-overflow-y: auto;\n  overflow-y: auto;\n  top: 0px;\n  left: 0px;\n  z-index: 999;\n  -webkit-transition: margin-left 0.3s ease, margin-top 0.3s ease;\n  -moz-transition: margin-left 0.3s ease, margin-top 0.3s ease;\n  transition: margin-left 0.3s ease, margin-top 0.3s ease;\n}\n/*-------------------\n      Coupling\n--------------------*/\nbody.pushed.scrolling.ui.dimmable {\n  position: static;\n}\n/*******************************\n             Types\n*******************************/\n/*-------------------\n       Direction\n--------------------*/\n.ui.right.very.thin.sidebar,\n.ui.right.thin.sidebar,\n.ui.right.sidebar,\n.ui.right.wide.sidebar,\n.ui.right.very.wide.sidebar {\n  left: 100%;\n  margin: 0px !important;\n}\n.ui.top.sidebar {\n  width: 100% !important;\n}\n.ui.bottom.sidebar {\n  width: 100% !important;\n  top: 100%;\n  margin: 0px !important;\n}\n/*******************************\n            States\n*******************************/\n.ui.active.sidebar {\n  margin-left: 0px !important;\n}\n.ui.active.top.sidebar,\n.ui.active.bottom.sidebar {\n  margin-top: 0px !important;\n}\n/*******************************\n           Variations\n*******************************/\n/*-------------------\n      Formatted\n--------------------*/\n.ui.styled.sidebar {\n  padding: 1em 1.5em;\n  background-color: #FFFFFF;\n  -webkit-box-shadow: 1px 0px 0px rgba(0, 0, 0, 0.1);\n  box-shadow: 1px 0px 0px rgba(0, 0, 0, 0.1);\n}\n.ui.styled.very.thin.sidebar {\n  padding: 0.5em;\n}\n.ui.styled.thin.sidebar {\n  padding: 1em;\n}\n/*-------------------\n       Floating\n--------------------*/\n.ui.floating.sidebar {\n  -webkit-box-shadow: 2px 0px 2px rgba(0, 0, 0, 0.2);\n  box-shadow: 2px 0px 2px rgba(0, 0, 0, 0.2);\n}\n.ui.right.floating.sidebar {\n  -webkit-box-shadow: -2px 0px 2px rgba(0, 0, 0, 0.2);\n  box-shadow: -2px 0px 2px rgba(0, 0, 0, 0.2);\n}\n.ui.top.floating.sidebar {\n  -webkit-box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.2);\n  box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.2);\n}\n.ui.bottom.floating.sidebar {\n  -webkit-box-shadow: 0px -4px 4px rgba(0, 0, 0, 0.2);\n  box-shadow: 0px -4px 4px rgba(0, 0, 0, 0.2);\n}\n/*-------------------\n        Width\n--------------------*/\n/* Very Thin */\n.ui.very.thin.sidebar {\n  width: 60px !important;\n  margin-left: -60px !important;\n}\n.ui.active.very.thin.sidebar {\n  margin-left: 0px !important;\n}\n.ui.active.right.very.thin.sidebar {\n  margin-left: -60px !important;\n}\n/* Thin */\n.ui.thin.sidebar {\n  width: 200px !important;\n  margin-left: -200px !important;\n}\n.ui.active.thin.sidebar {\n  margin-left: 0px !important;\n}\n.ui.active.right.thin.sidebar {\n  margin-left: -200px !important;\n}\n/* Standard */\n.ui.sidebar {\n  width: 275px !important;\n  margin-left: -275px !important;\n}\n.ui.active.sidebar {\n  margin-left: 0px !important;\n}\n.ui.active.right.sidebar {\n  margin-left: -275px !important;\n}\n/* Wide */\n.ui.wide.sidebar {\n  width: 350px !important;\n  margin-left: -350px !important;\n}\n.ui.active.wide.sidebar {\n  margin-left: 0px !important;\n}\n.ui.active.right.wide.sidebar {\n  margin-left: -350px !important;\n}\n/* Very Wide */\n.ui.very.wide.sidebar {\n  width: 475px !important;\n  margin-left: -475px !important;\n}\n.ui.active.very.wide.sidebar {\n  margin-left: 0px !important;\n}\n.ui.active.right.very.wide.sidebar {\n  margin-left: -475px !important;\n}\n/*-------------------\n       Height\n--------------------*/\n/* Standard */\n.ui.top.sidebar {\n  margin: -40px 0px 0px 0px !important;\n}\n.ui.top.sidebar,\n.ui.bottom.sidebar {\n  height: 40px !important;\n}\n.ui.active.bottom.sidebar {\n  margin-top: -40px !important;\n}\n\n/*\n * # Semantic - Tab\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n           UI Tabs\n*******************************/\n.ui.tab {\n  display: none;\n}\n/*******************************\n             States\n*******************************/\n/*--------------------\n       Active\n---------------------*/\n.ui.tab.active,\n.ui.tab.open {\n  display: block;\n}\n/*--------------------\n       Loading\n---------------------*/\n.ui.tab.loading {\n  position: relative;\n  overflow: hidden;\n  display: block;\n  min-height: 250px;\n  text-indent: -10000px;\n}\n.ui.tab.loading * {\n  position: relative !important;\n  left: -10000px !important;\n}\n.ui.tab.loading:after {\n  position: absolute;\n  top: 50px;\n  left: 50%;\n  content: \'Loading...\';\n  margin-left: -32px;\n  text-indent: 5px;\n  color: rgba(0, 0, 0, 0.4);\n  width: 100%;\n  height: 100%;\n  padding-top: 75px;\n  background: url(../images/loader-large.gif) no-repeat 0px 0px;\n  visibility: visible;\n}\n\n/*******************************\n  Semantic - Transition\n  Author: Jack Lukic\n\n  CSS animation definitions for\n  transition module\n\n*******************************/\n/*\n  Some transitions adapted from Animate CSS\n  https://github.com/daneden/animate.css\n*/\n.ui.transition {\n  -webkit-animation-iteration-count: 1;\n  -moz-animation-iteration-count: 1;\n  animation-iteration-count: 1;\n  -webkit-animation-duration: 1s;\n  -moz-animation-duration: 1s;\n  animation-duration: 1s;\n  -webkit-animation-timing-function: ease;\n  -moz-animation-timing-function: ease;\n  animation-timing-function: ease;\n  -webkit-animation-fill-mode: both;\n  -moz-animation-fill-mode: both;\n  animation-fill-mode: both;\n}\n/*******************************\n            States\n*******************************/\n.ui.animating.transition {\n  display: block;\n  -webkit-backface-visibility: hidden;\n  -moz-backface-visibility: hidden;\n  -ms-backface-visibility: hidden;\n  backface-visibility: hidden;\n  -webkit-transform: translateZ(0);\n  -moz-transform: translateZ(0);\n  -ms-transform: translateZ(0);\n  transform: translateZ(0);\n}\n/* Loading */\n.ui.loading.transition {\n  position: absolute;\n  top: -999999px;\n  left: -99999px;\n}\n/* Hidden */\n.ui.hidden.transition {\n  display: none !important;\n}\n/* Visible */\n.ui.visible.transition {\n  display: block;\n  visibility: visible;\n}\n/* Disabled */\n.ui.disabled.transition {\n  -webkit-animation-play-state: paused;\n  -moz-animation-play-state: paused;\n  animation-play-state: paused;\n}\n/*******************************\n          Variations\n*******************************/\n.ui.looping.transition {\n  -webkit-animation-iteration-count: infinite;\n  -moz-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n}\n/*******************************\n             Types\n*******************************/\n/*--------------\n    Emphasis\n---------------*/\n.ui.flash.transition {\n  -webkit-animation-name: flash;\n  -moz-animation-name: flash;\n  animation-name: flash;\n}\n.ui.shake.transition {\n  -webkit-animation-name: shake;\n  -moz-animation-name: shake;\n  animation-name: shake;\n}\n.ui.bounce.transition {\n  -webkit-animation-name: bounce;\n  -moz-animation-name: bounce;\n  animation-name: bounce;\n}\n.ui.tada.transition {\n  -webkit-animation-name: tada;\n  -moz-animation-name: tada;\n  animation-name: tada;\n}\n/* originally authored by Nick Pettit - https://github.com/nickpettit/glide */\n.ui.pulse.transition {\n  -webkit-animation-name: pulse;\n  -moz-animation-name: pulse;\n  animation-name: pulse;\n}\n/*--------------\n     Flips\n---------------*/\n.ui.flip.transition.in,\n.ui.flip.transition.out {\n  -webkit-perspective: 2000px;\n  -moz-perspective: 2000px;\n  -ms-perspective: 2000px;\n  perspective: 2000px;\n}\n.ui.horizontal.flip.transition.in,\n.ui.horizontal.flip.transition.out {\n  -webkit-animation-name: horizontalFlip;\n  -moz-animation-name: horizontalFlip;\n  animation-name: horizontalFlip;\n}\n.ui.horizontal.flip.transition.out {\n  -webkit-animation-name: horizontalFlipOut;\n  -moz-animation-name: horizontalFlipOut;\n  animation-name: horizontalFlipOut;\n}\n.ui.vertical.flip.transition.in,\n.ui.vertical.flip.transition.out {\n  -webkit-animation-name: verticalFlip;\n  -moz-animation-name: verticalFlip;\n  animation-name: verticalFlip;\n}\n.ui.vertical.flip.transition.out {\n  -webkit-animation-name: verticalFlipOut;\n  -moz-animation-name: verticalFlipOut;\n  animation-name: verticalFlipOut;\n}\n/*--------------\n      Fades\n---------------*/\n.ui.fade.transition.in {\n  -webkit-animation-name: fade;\n  -moz-animation-name: fade;\n  animation-name: fade;\n}\n.ui.fade.transition.out {\n  -webkit-animation-name: fadeOut;\n  -moz-animation-name: fadeOut;\n  animation-name: fadeOut;\n}\n.ui.fade.up.transition.in {\n  -webkit-animation-name: fadeUp;\n  -moz-animation-name: fadeUp;\n  animation-name: fadeUp;\n}\n.ui.fade.up.transition.out {\n  -webkit-animation-name: fadeUpOut;\n  -moz-animation-name: fadeUpOut;\n  animation-name: fadeUpOut;\n}\n.ui.fade.down.transition.in {\n  -webkit-animation-name: fadeDown;\n  -moz-animation-name: fadeDown;\n  animation-name: fadeDown;\n}\n.ui.fade.down.transition.out {\n  -webkit-animation-name: fadeDownOut;\n  -moz-animation-name: fadeDownOut;\n  animation-name: fadeDownOut;\n}\n/*--------------\n      Scale\n---------------*/\n.ui.scale.transition.in {\n  -webkit-animation-name: scale;\n  -moz-animation-name: scale;\n  animation-name: scale;\n}\n.ui.scale.transition.out {\n  -webkit-animation-name: scaleOut;\n  -moz-animation-name: scaleOut;\n  animation-name: scaleOut;\n}\n/*--------------\n     Slide\n---------------*/\n.ui.slide.down.transition.in {\n  -webkit-animation-name: slide;\n  -moz-animation-name: slide;\n  animation-name: slide;\n  -moz-transform-origin: 50% 0%;\n  transform-origin: 50% 0%;\n  -ms-transform-origin: 50% 0%;\n  -webkit-transform-origin: 50% 0%;\n}\n.ui.slide.down.transition.out {\n  -webkit-animation-name: slideOut;\n  -moz-animation-name: slideOut;\n  animation-name: slideOut;\n  -webkit-transform-origin: 50% 0%;\n  -moz-transform-origin: 50% 0%;\n  -ms-transform-origin: 50% 0%;\n  transform-origin: 50% 0%;\n}\n.ui.slide.up.transition.in {\n  -webkit-animation-name: slide;\n  -moz-animation-name: slide;\n  animation-name: slide;\n  -webkit-transform-origin: 50% 100%;\n  -moz-transform-origin: 50% 100%;\n  -ms-transform-origin: 50% 100%;\n  transform-origin: 50% 100%;\n}\n.ui.slide.up.transition.out {\n  -webkit-animation-name: slideOut;\n  -moz-animation-name: slideOut;\n  animation-name: slideOut;\n  -webkit-transform-origin: 50% 100%;\n  -moz-transform-origin: 50% 100%;\n  -ms-transform-origin: 50% 100%;\n  transform-origin: 50% 100%;\n}\n@-webkit-keyframes slide {\n  0% {\n    opacity: 0;\n    -webkit-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n  100% {\n    opacity: 1;\n    -webkit-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n}\n@-moz-keyframes slide {\n  0% {\n    opacity: 0;\n    -moz-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n  100% {\n    opacity: 1;\n    -moz-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n}\n@keyframes slide {\n  0% {\n    opacity: 0;\n    -webkit-transform: scaleY(0);\n    -moz-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n  100% {\n    opacity: 1;\n    -webkit-transform: scaleY(1);\n    -moz-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n}\n@-webkit-keyframes slideOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n  100% {\n    opacity: 0;\n    -webkit-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n}\n@-moz-keyframes slideOut {\n  0% {\n    opacity: 1;\n    -moz-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n  100% {\n    opacity: 0;\n    -moz-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n}\n@keyframes slideOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scaleY(1);\n    -moz-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n  100% {\n    opacity: 0;\n    -webkit-transform: scaleY(0);\n    -moz-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n}\n/*******************************\n       Animations\n*******************************/\n/*--------------\n    Emphasis\n---------------*/\n/* Flash */\n@-webkit-keyframes flash {\n  0%,\n  50%,\n  100% {\n    opacity: 1;\n  }\n  25%,\n  75% {\n    opacity: 0;\n  }\n}\n@-moz-keyframes flash {\n  0%,\n  50%,\n  100% {\n    opacity: 1;\n  }\n  25%,\n  75% {\n    opacity: 0;\n  }\n}\n@keyframes flash {\n  0%,\n  50%,\n  100% {\n    opacity: 1;\n  }\n  25%,\n  75% {\n    opacity: 0;\n  }\n}\n/* Shake */\n@-webkit-keyframes shake {\n  0%,\n  100% {\n    -webkit-transform: translateX(0);\n    transform: translateX(0);\n  }\n  10%,\n  30%,\n  50%,\n  70%,\n  90% {\n    -webkit-transform: translateX(-10px);\n    transform: translateX(-10px);\n  }\n  20%,\n  40%,\n  60%,\n  80% {\n    -webkit-transform: translateX(10px);\n    transform: translateX(10px);\n  }\n}\n@-moz-keyframes shake {\n  0%,\n  100% {\n    -moz-transform: translateX(0);\n    transform: translateX(0);\n  }\n  10%,\n  30%,\n  50%,\n  70%,\n  90% {\n    -moz-transform: translateX(-10px);\n    transform: translateX(-10px);\n  }\n  20%,\n  40%,\n  60%,\n  80% {\n    -moz-transform: translateX(10px);\n    transform: translateX(10px);\n  }\n}\n@keyframes shake {\n  0%,\n  100% {\n    -webkit-transform: translateX(0);\n    -moz-transform: translateX(0);\n    transform: translateX(0);\n  }\n  10%,\n  30%,\n  50%,\n  70%,\n  90% {\n    -webkit-transform: translateX(-10px);\n    -moz-transform: translateX(-10px);\n    transform: translateX(-10px);\n  }\n  20%,\n  40%,\n  60%,\n  80% {\n    -webkit-transform: translateX(10px);\n    -moz-transform: translateX(10px);\n    transform: translateX(10px);\n  }\n}\n/* Bounce */\n@-webkit-keyframes bounce {\n  0%,\n  20%,\n  50%,\n  80%,\n  100% {\n    -webkit-transform: translateY(0);\n    transform: translateY(0);\n  }\n  40% {\n    -webkit-transform: translateY(-30px);\n    transform: translateY(-30px);\n  }\n  60% {\n    -webkit-transform: translateY(-15px);\n    transform: translateY(-15px);\n  }\n}\n@-moz-keyframes bounce {\n  0%,\n  20%,\n  50%,\n  80%,\n  100% {\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n  40% {\n    -moz-transform: translateY(-30px);\n    transform: translateY(-30px);\n  }\n  60% {\n    -moz-transform: translateY(-15px);\n    transform: translateY(-15px);\n  }\n}\n@keyframes bounce {\n  0%,\n  20%,\n  50%,\n  80%,\n  100% {\n    -webkit-transform: translateY(0);\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n  40% {\n    -webkit-transform: translateY(-30px);\n    -moz-transform: translateY(-30px);\n    transform: translateY(-30px);\n  }\n  60% {\n    -webkit-transform: translateY(-15px);\n    -moz-transform: translateY(-15px);\n    transform: translateY(-15px);\n  }\n}\n/* Tada */\n@-webkit-keyframes tada {\n  0% {\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n  10%,\n  20% {\n    -webkit-transform: scale(0.9) rotate(-3deg);\n    transform: scale(0.9) rotate(-3deg);\n  }\n  30%,\n  50%,\n  70%,\n  90% {\n    -webkit-transform: scale(1.1) rotate(3deg);\n    transform: scale(1.1) rotate(3deg);\n  }\n  40%,\n  60%,\n  80% {\n    -webkit-transform: scale(1.1) rotate(-3deg);\n    transform: scale(1.1) rotate(-3deg);\n  }\n  100% {\n    -webkit-transform: scale(1) rotate(0);\n    transform: scale(1) rotate(0);\n  }\n}\n@-moz-keyframes tada {\n  0% {\n    -moz-transform: scale(1);\n    transform: scale(1);\n  }\n  10%,\n  20% {\n    -moz-transform: scale(0.9) rotate(-3deg);\n    transform: scale(0.9) rotate(-3deg);\n  }\n  30%,\n  50%,\n  70%,\n  90% {\n    -moz-transform: scale(1.1) rotate(3deg);\n    transform: scale(1.1) rotate(3deg);\n  }\n  40%,\n  60%,\n  80% {\n    -moz-transform: scale(1.1) rotate(-3deg);\n    transform: scale(1.1) rotate(-3deg);\n  }\n  100% {\n    -moz-transform: scale(1) rotate(0);\n    transform: scale(1) rotate(0);\n  }\n}\n@keyframes tada {\n  0% {\n    -webkit-transform: scale(1);\n    -moz-transform: scale(1);\n    transform: scale(1);\n  }\n  10%,\n  20% {\n    -webkit-transform: scale(0.9) rotate(-3deg);\n    -moz-transform: scale(0.9) rotate(-3deg);\n    transform: scale(0.9) rotate(-3deg);\n  }\n  30%,\n  50%,\n  70%,\n  90% {\n    -webkit-transform: scale(1.1) rotate(3deg);\n    -moz-transform: scale(1.1) rotate(3deg);\n    transform: scale(1.1) rotate(3deg);\n  }\n  40%,\n  60%,\n  80% {\n    -webkit-transform: scale(1.1) rotate(-3deg);\n    -moz-transform: scale(1.1) rotate(-3deg);\n    transform: scale(1.1) rotate(-3deg);\n  }\n  100% {\n    -webkit-transform: scale(1) rotate(0);\n    -moz-transform: scale(1) rotate(0);\n    transform: scale(1) rotate(0);\n  }\n}\n/* Pulse */\n@-webkit-keyframes pulse {\n  0% {\n    -webkit-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n  50% {\n    -webkit-transform: scale(0.9);\n    transform: scale(0.9);\n    opacity: 0.7;\n  }\n  100% {\n    -webkit-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n}\n@-moz-keyframes pulse {\n  0% {\n    -moz-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n  50% {\n    -moz-transform: scale(0.9);\n    transform: scale(0.9);\n    opacity: 0.7;\n  }\n  100% {\n    -moz-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n}\n@keyframes pulse {\n  0% {\n    -webkit-transform: scale(1);\n    -moz-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n  50% {\n    -webkit-transform: scale(0.9);\n    -moz-transform: scale(0.9);\n    transform: scale(0.9);\n    opacity: 0.7;\n  }\n  100% {\n    -webkit-transform: scale(1);\n    -moz-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n}\n/*--------------\n     Flips\n---------------*/\n/* Horizontal */\n@-webkit-keyframes horizontalFlip {\n  0% {\n    -webkit-transform: rotateY(-90deg);\n    transform: rotateY(-90deg);\n    opacity: 0;\n  }\n  100% {\n    -webkit-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n}\n@-moz-keyframes horizontalFlip {\n  0% {\n    -moz-transform: rotateY(-90deg);\n    transform: rotateY(-90deg);\n    opacity: 0;\n  }\n  100% {\n    -moz-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n}\n@keyframes horizontalFlip {\n  0% {\n    -webkit-transform: rotateY(-90deg);\n    -moz-transform: rotateY(-90deg);\n    transform: rotateY(-90deg);\n    opacity: 0;\n  }\n  100% {\n    -webkit-transform: rotateY(0deg);\n    -moz-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n}\n/* Horizontal */\n@-webkit-keyframes horizontalFlipOut {\n  0% {\n    -webkit-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n  100% {\n    -webkit-transform: rotateY(90deg);\n    transform: rotateY(90deg);\n    opacity: 0;\n  }\n}\n@-moz-keyframes horizontalFlipOut {\n  0% {\n    -moz-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n  100% {\n    -moz-transform: rotateY(90deg);\n    transform: rotateY(90deg);\n    opacity: 0;\n  }\n}\n@keyframes horizontalFlipOut {\n  0% {\n    -webkit-transform: rotateY(0deg);\n    -moz-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n  100% {\n    -webkit-transform: rotateY(90deg);\n    -moz-transform: rotateY(90deg);\n    transform: rotateY(90deg);\n    opacity: 0;\n  }\n}\n/* Vertical */\n@-webkit-keyframes verticalFlip {\n  0% {\n    -webkit-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n  100% {\n    -webkit-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n}\n@-moz-keyframes verticalFlip {\n  0% {\n    -moz-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n  100% {\n    -moz-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n}\n@keyframes verticalFlip {\n  0% {\n    -webkit-transform: rotateX(-90deg);\n    -moz-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n  100% {\n    -webkit-transform: rotateX(0deg);\n    -moz-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n}\n@-webkit-keyframes verticalFlipOut {\n  0% {\n    -webkit-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n  100% {\n    -webkit-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n}\n@-moz-keyframes verticalFlipOut {\n  0% {\n    -moz-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n  100% {\n    -moz-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n}\n@keyframes verticalFlipOut {\n  0% {\n    -webkit-transform: rotateX(0deg);\n    -moz-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n  100% {\n    -webkit-transform: rotateX(-90deg);\n    -moz-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n}\n/*--------------\n     Fades\n---------------*/\n/* Fade */\n@-webkit-keyframes fade {\n  0% {\n    opacity: 0;\n  }\n  100% {\n    opacity: 1;\n  }\n}\n@-moz-keyframes fade {\n  0% {\n    opacity: 0;\n  }\n  100% {\n    opacity: 1;\n  }\n}\n@keyframes fade {\n  0% {\n    opacity: 0;\n  }\n  100% {\n    opacity: 1;\n  }\n}\n@-webkit-keyframes fadeOut {\n  0% {\n    opacity: 1;\n  }\n  100% {\n    opacity: 0;\n  }\n}\n@-moz-keyframes fadeOut {\n  0% {\n    opacity: 1;\n  }\n  100% {\n    opacity: 0;\n  }\n}\n@keyframes fadeOut {\n  0% {\n    opacity: 1;\n  }\n  100% {\n    opacity: 0;\n  }\n}\n/* Fade Up */\n@-webkit-keyframes fadeUp {\n  0% {\n    opacity: 0;\n    -webkit-transform: translateY(20px);\n    transform: translateY(20px);\n  }\n  100% {\n    opacity: 1;\n    -webkit-transform: translateY(0);\n    transform: translateY(0);\n  }\n}\n@-moz-keyframes fadeUp {\n  0% {\n    opacity: 0;\n    -moz-transform: translateY(20px);\n    transform: translateY(20px);\n  }\n  100% {\n    opacity: 1;\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n}\n@keyframes fadeUp {\n  0% {\n    opacity: 0;\n    -webkit-transform: translateY(20px);\n    -moz-transform: translateY(20px);\n    transform: translateY(20px);\n  }\n  100% {\n    opacity: 1;\n    -webkit-transform: translateY(0);\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n}\n@-webkit-keyframes fadeUpOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: translateY(0);\n    transform: translateY(0);\n  }\n  100% {\n    opacity: 0;\n    -webkit-transform: translateY(20px);\n    transform: translateY(20px);\n  }\n}\n@-moz-keyframes fadeUpOut {\n  0% {\n    opacity: 1;\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n  100% {\n    opacity: 0;\n    -moz-transform: translateY(20px);\n    transform: translateY(20px);\n  }\n}\n@keyframes fadeUpOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: translateY(0);\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n  100% {\n    opacity: 0;\n    -webkit-transform: translateY(20px);\n    -moz-transform: translateY(20px);\n    transform: translateY(20px);\n  }\n}\n/* Fade Down */\n@-webkit-keyframes fadeDown {\n  0% {\n    opacity: 0;\n    -webkit-transform: translateY(-20px);\n    transform: translateY(-20px);\n  }\n  100% {\n    opacity: 1;\n    -webkit-transform: translateY(0);\n    transform: translateY(0);\n  }\n}\n@-moz-keyframes fadeDown {\n  0% {\n    opacity: 0;\n    -moz-transform: translateY(-20px);\n    transform: translateY(-20px);\n  }\n  100% {\n    opacity: 1;\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n}\n@keyframes fadeDown {\n  0% {\n    opacity: 0;\n    -webkit-transform: translateY(-20px);\n    -moz-transform: translateY(-20px);\n    transform: translateY(-20px);\n  }\n  100% {\n    opacity: 1;\n    -webkit-transform: translateY(0);\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n}\n@-webkit-keyframes fadeDownOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: translateY(0);\n    transform: translateY(0);\n  }\n  100% {\n    opacity: 0;\n    -webkit-transform: translateY(-20px);\n    transform: translateY(-20px);\n  }\n}\n@-moz-keyframes fadeDownOut {\n  0% {\n    opacity: 1;\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n  100% {\n    opacity: 0;\n    -moz-transform: translateY(-20px);\n    transform: translateY(-20px);\n  }\n}\n@keyframes fadeDownOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: translateY(0);\n    -moz-transform: translateY(0);\n    transform: translateY(0);\n  }\n  100% {\n    opacity: 0;\n    -webkit-transform: translateY(-20px);\n    -moz-transform: translateY(-20px);\n    transform: translateY(-20px);\n  }\n}\n/*--------------\n      Scale\n---------------*/\n/* Scale */\n@-webkit-keyframes scale {\n  0% {\n    opacity: 0;\n    -webkit-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n  100% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n}\n@-moz-keyframes scale {\n  0% {\n    opacity: 0;\n    -moz-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n  100% {\n    opacity: 1;\n    -moz-transform: scale(1);\n    transform: scale(1);\n  }\n}\n@keyframes scale {\n  0% {\n    opacity: 0;\n    -webkit-transform: scale(0.7);\n    -moz-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n  100% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    -moz-transform: scale(1);\n    transform: scale(1);\n  }\n}\n@-webkit-keyframes scaleOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n  100% {\n    opacity: 0;\n    -webkit-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n}\n@-moz-keyframes scaleOut {\n  0% {\n    opacity: 1;\n    -moz-transform: scale(1);\n    transform: scale(1);\n  }\n  100% {\n    opacity: 0;\n    -moz-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n}\n@keyframes scaleOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    -moz-transform: scale(1);\n    transform: scale(1);\n  }\n  100% {\n    opacity: 0;\n    -webkit-transform: scale(0.7);\n    -moz-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n}\n\n/*\n * # Semantic - Video\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n/*******************************\n            Video\n*******************************/\n.ui.video {\n  position: relative;\n  max-width: 100%;\n}\n/*--------------\n     Content\n---------------*/\n/* Placeholder Image */\n.ui.video .placeholder {\n  background-color: #333333;\n}\n/* Play Icon Overlay */\n.ui.video .play {\n  cursor: pointer;\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  z-index: 10;\n  width: 100%;\n  height: 100%;\n  -ms-filter: "progid:DXImageTransform.Microsoft.Alpha(Opacity=60)";\n  filter: alpha(opacity=60);\n  opacity: 0.6;\n  -webkit-transition: opacity 0.3s;\n  -moz-transition: opacity 0.3s;\n  transition: opacity 0.3s;\n}\n.ui.video .play.icon:before {\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  z-index: 11;\n  font-size: 6rem;\n  margin: -3rem 0em 0em -3rem;\n  color: #FFFFFF;\n  text-shadow: 0px 3px 3px rgba(0, 0, 0, 0.4);\n}\n.ui.video .placeholder {\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n/* IFrame Embed */\n.ui.video .embed {\n  display: none;\n}\n/*******************************\n            States\n*******************************/\n/*--------------\n    Hover\n---------------*/\n.ui.video .play:hover {\n  opacity: 1;\n}\n/*--------------\n     Active\n---------------*/\n.ui.video.active .play,\n.ui.video.active .placeholder {\n  display: none;\n}\n.ui.video.active .embed {\n  display: block;\n}\n\n/*\n * # Semantic Comment View\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n * Released: April 17 2013\n */\n/*******************************\n            Standard\n*******************************/\n/*--------------\n    Comments\n---------------*/\n.ui.comments a {\n  cursor: pointer;\n}\n/*--------------\n     Comment\n---------------*/\n.ui.comments .comment {\n  position: relative;\n  margin-top: 0.5em;\n  padding-top: 0.5em;\n}\n.ui.comments .comment:first-child {\n  margin-top: 0em;\n  padding-top: 0em;\n}\n/*--------------------\n   Avatar (Optional)\n---------------------*/\n.ui.comments .comment .avatar {\n  display: block;\n  float: left;\n  width: 4em;\n}\n.ui.comments .comment .avatar img {\n  display: block;\n  margin: 0em auto;\n  width: 3em;\n  height: 3em;\n  border-radius: 500px;\n}\n/*--------------\n     Content\n---------------*/\n.ui.comments .comment > .content,\n.ui.comments .comment > .avatar {\n  display: block;\n}\n.ui.comments .comment .avatar ~ .content {\n  padding: 0em 1em;\n}\n/* If there is an avatar move content over */\n.ui.comments .comment > .avatar ~ .content {\n  padding-top: 0.25em;\n  margin-left: 3.5em;\n}\n.ui.comments .comment .metadata {\n  display: inline-block;\n  margin-left: 0.3em;\n  color: rgba(0, 0, 0, 0.4);\n}\n.ui.comments .comment .metadata > * {\n  display: inline-block;\n  margin: 0em 0.3em 0em 0em;\n}\n/*--------------------\n     Comment Text\n---------------------*/\n.ui.comments .comment .text {\n  margin: 0.25em 0em 0.5em;\n  word-wrap: break-word;\n}\n/*--------------------\n     User Actions\n---------------------*/\n.ui.comments .comment .actions {\n  font-size: 0.9em;\n}\n.ui.comments .comment .actions a {\n  display: inline-block;\n  margin: 0em 0.3em 0em 0em;\n  color: rgba(0, 0, 0, 0.3);\n}\n.ui.comments .comment .actions a.active,\n.ui.comments .comment .actions a:hover {\n  color: rgba(0, 0, 0, 0.6);\n}\n/*--------------------\n      Reply Form\n---------------------*/\n.ui.comments .reply.form {\n  margin-top: 0.75em;\n  width: 100%;\n  max-width: 30em;\n}\n.ui.comments .comment .reply.form {\n  margin-left: 2em;\n}\n.ui.comments > .reply.form {\n  margin-top: 1.5em;\n  max-width: 40em;\n}\n.ui.comments .reply.form textarea {\n  height: 12em;\n}\n/*--------------------\n    Nested Comments\n---------------------*/\n.ui.comments .comment .comments {\n  margin-top: 0.5em;\n  padding-top: 0.5em;\n  padding-bottom: 1em;\n}\n.ui.comments .comment .comments:before {\n  position: absolute;\n  top: 0px;\n  left: 0px;\n}\n/* One Deep */\n.ui.comments > .comment .comments {\n  margin-left: 2em;\n}\n/* Two Deep */\n.ui.comments > .comment > .comments > .comment > .comments {\n  margin-left: 1.75em;\n}\n/* Three Deep */\n.ui.comments > .comment > .comments > .comment > .comments > .comment > .comments {\n  margin-left: 1.5em;\n}\n/* Four Deep or more */\n.ui.comments > .comment > .comments > .comment > .comments > .comment > .comments > .comment .comments {\n  margin-left: 0.5em;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------------\n        Threaded\n---------------------*/\n.ui.threaded.comments .comment .comments {\n  margin-left: 2em !important;\n  padding-left: 2em !important;\n  -webkit-box-shadow: -1px 0px 0px rgba(0, 0, 0, 0.05);\n  box-shadow: -1px 0px 0px rgba(0, 0, 0, 0.05);\n}\n/*--------------------\n        Minimal\n---------------------*/\n.ui.minimal.comments .comment .actions {\n  opacity: 0;\n  -webkit-transition: opacity 0.1s ease-out;\n  -moz-transition: opacity 0.1s ease-out;\n  transition: opacity 0.1s ease-out;\n  -webkit-transition-delay: 0.1s;\n  -moz-transition-delay: 0.1s;\n  transition-delay: 0.1s;\n}\n.ui.minimal.comments .comment > .content:hover > .actions {\n  opacity: 1;\n}\n/*--------------------\n       Sizes\n---------------------*/\n.ui.small.comments {\n  font-size: 0.875em;\n}\n\n/*\n * # Activity Feed View\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n * Released: May 22, 2013\n */\n/*******************************\n         Activity Feed\n*******************************/\n.ui.feed a {\n  cursor: pointer;\n}\n.ui.feed,\n.ui.feed .event,\n.ui.feed .label,\n.ui.feed .content,\n.ui.feed .extra {\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n/*******************************\n            Content\n*******************************/\n/* Event */\n.ui.feed .event {\n  width: 100%;\n  display: table;\n  padding: 1em;\n}\n.ui.feed .event:first-child {\n  border-top: 0px;\n}\n.ui.feed .event:last-child {\n  margin-bottom: 1em;\n}\n/* Event Label */\n.ui.feed .label {\n  width: 3em;\n  display: table-cell;\n  vertical-align: top;\n  text-align: left;\n}\n.ui.feed .label .icon {\n  font-size: 1.5em;\n  padding: 0.5em;\n  margin: 0em;\n}\n.ui.feed .label img {\n  width: 3em;\n  margin: 0em;\n  border-radius: 50em;\n}\n.ui.feed .label + .content {\n  padding: 0.75em 1em 0em;\n}\n/* Content */\n.ui.feed .content {\n  display: table-cell;\n  vertical-align: top;\n  text-align: left;\n  word-wrap: break-word;\n}\n/* Date */\n.ui.feed .content .date {\n  float: right;\n  padding-left: 1em;\n  color: rgba(0, 0, 0, 0.4);\n}\n/* Summary */\n.ui.feed .content .summary {\n  color: rgba(0, 0, 0, 0.75);\n}\n.ui.feed .content .summary img {\n  display: inline-block;\n  margin-right: 0.25em;\n  width: 4em;\n  border-radius: 500px;\n}\n/* Additional Information */\n.ui.feed .content .extra {\n  margin: 1em 0em 0em;\n  padding: 0.5em 0em 0em;\n  color: rgba(0, 0, 0, 0.5);\n}\n.ui.feed .content .extra.images img {\n  display: inline-block;\n  margin-right: 0.25em;\n  width: 6em;\n}\n.ui.feed .content .extra.text {\n  padding: 0.5em 1em;\n  border-left: 0.2em solid rgba(0, 0, 0, 0.1);\n}\n/*******************************\n            Variations\n*******************************/\n.ui.small.feed {\n  font-size: 0.875em;\n}\n.ui.small.feed .label img {\n  width: 2.5em;\n}\n.ui.small.feed .label .icon {\n  font-size: 1.25em;\n}\n.ui.feed .event {\n  padding: 0.75em 0em;\n}\n.ui.small.feed .label + .content {\n  padding: 0.5em 0.5em 0;\n}\n.ui.small.feed .content .extra.images img {\n  width: 5em;\n}\n.ui.small.feed .content .extra {\n  margin: 0.5em 0em 0em;\n}\n.ui.small.feed .content .extra.text {\n  padding: 0.25em 0.5em;\n}\n\n/*\n * # Semantic Item View\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n * Released: April 17 2013\n */\n/*******************************\n            Standard\n*******************************/\n/*--------------\n      Items\n---------------*/\n.ui.items {\n  margin: 1em 0em 0em;\n}\n.ui.items:first-child {\n  margin-top: 0em;\n}\n.ui.items:last-child {\n  margin-bottom: -1em;\n}\n/* Force Clearing */\n.ui.items:after {\n  display: block;\n  content: \' \';\n  height: 0px;\n  clear: both;\n  overflow: hidden;\n  visibility: hidden;\n}\n/*--------------\n      Item\n---------------*/\n.ui.items > .row > .item,\n.ui.items > .item {\n  display: block;\n  float: left;\n  position: relative;\n  top: 0px;\n  width: 316px;\n  min-height: 375px;\n  margin: 0em 0.5em 2.5em;\n  padding: 0em;\n  background-color: #FFFFFF;\n  line-height: 1.2;\n  font-size: 1em;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.1);\n  border-bottom: 0.2em solid rgba(0, 0, 0, 0.2);\n  border-radius: 0.33em;\n  -webkit-transition: -webkit-box-shadow 0.2s ease;\n  -moz-transition: box-shadow 0.2s ease;\n  transition: box-shadow 0.2s ease;\n  padding: 0.5em;\n}\n.ui.items a.item,\n.ui.items .item a {\n  cursor: pointer;\n}\n.ui.items .item,\n.ui.items .item > .image,\n.ui.items .item > .image .overlay,\n.ui.items .item > .content,\n.ui.items .item > .content > .meta,\n.ui.items .item > .content > .extra {\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n}\n/*--------------\n      Images\n---------------*/\n.ui.items .item > .image {\n  display: block;\n  position: relative;\n  background-color: rgba(0, 0, 0, 0.05);\n  -webkit-box-sizing: border-box;\n  -moz-box-sizing: border-box;\n  -ms-box-sizing: border-box;\n  box-sizing: border-box;\n  border-radius: 0.2em;\n}\n.ui.items .item > .image > img {\n  display: block;\n  width: 100%;\n}\n/*--------------\n     Content\n---------------*/\n.ui.items .item > .content {\n  padding: 0.75em 0.5em;\n}\n.ui.items .item > .content > .name {\n  display: block;\n  font-size: 1.25em;\n  font-weight: bold;\n  margin-bottom: 0.2em;\n  color: rgba(0, 0, 0, 0.7);\n}\n.ui.items .item > .content > .description {\n  clear: both;\n  margin: 0em 0em;\n  color: rgba(0, 0, 0, 0.45);\n}\n.ui.items .item > .content > .description p {\n  margin: 0em 0em 0.2em;\n}\n.ui.items .item > .content > .description p:last-child {\n  margin-bottom: 0em;\n}\n/*--------------\n      Meta\n---------------*/\n.ui.items .item .meta {\n  float: right;\n  color: rgba(0, 0, 0, 0.35);\n}\n.ui.items .item > .content > .meta + .name {\n  float: left;\n}\n/*--------------\n     Labels\n---------------*/\n/*-----star----- */\n/* hover */\n.ui.items .item .star.label:hover::after {\n  border-right-color: #F6EFC3;\n}\n.ui.items .item .star.label:hover::after {\n  border-top-color: #F6EFC3;\n}\n.ui.items .item .star.label:hover .icon {\n  color: #ac9400;\n}\n/* active */\n.ui.items .item .star.label.active::after {\n  border-right-color: #F6EFC3;\n}\n.ui.items .item .star.label.active::after {\n  border-top-color: #F6EFC3;\n}\n.ui.items .item .star.label.active .icon {\n  color: #ac9400;\n}\n/*-----like----- */\n/* hover */\n.ui.items .item .like.label:hover::after {\n  border-right-color: #F5E1E2;\n}\n.ui.items .item .like.label.active::after {\n  border-top-color: #F5E1E2;\n}\n.ui.items .item .like.label:hover .icon {\n  color: #ef404a;\n}\n/* active */\n.ui.items .item .like.label.active::after {\n  border-right-color: #F5E1E2;\n}\n.ui.items .item .like.label.active::after {\n  border-top-color: #F5E1E2;\n}\n.ui.items .item .like.label.active .icon {\n  color: #ef404a;\n}\n/*--------------\n      Extra\n---------------*/\n.ui.items .item .extra {\n  position: absolute;\n  width: 100%;\n  padding: 0em 0.5em;\n  bottom: -2em;\n  left: 0em;\n  height: 1.5em;\n  color: rgba(0, 0, 0, 0.25);\n  -webkit-transition: color 0.2s ease;\n  -moz-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n.ui.items .item .extra > img {\n  display: inline-block;\n  border-radius: 500px 500px 500px 500px;\n  margin-right: 0.25em;\n  vertical-align: middle;\n  width: 2em;\n}\n.ui.items .item .extra .left {\n  float: left;\n}\n.ui.items .item .extra .right {\n  float: right;\n}\n/*******************************\n           States\n*******************************/\n.ui.items .item:hover {\n  cursor: pointer;\n  z-index: 5;\n  -webkit-box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.2);\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.2);\n}\n.ui.items .item:hover .extra {\n  color: rgba(0, 0, 0, 0.5);\n}\n.ui.items .item:nth-of-type(6n+1):hover {\n  border-bottom-color: #6ECFF5 !important;\n}\n.ui.items .item:nth-of-type(6n+2):hover {\n  border-bottom-color: #5C6166 !important;\n}\n.ui.items .item:nth-of-type(6n+3):hover {\n  border-bottom-color: #A1CF64 !important;\n}\n.ui.items .item:nth-of-type(6n+4):hover {\n  border-bottom-color: #D95C5C !important;\n}\n.ui.items .item:nth-of-type(6n+5):hover {\n  border-bottom-color: #00B5AD !important;\n}\n.ui.items .item:nth-of-type(6n+6):hover {\n  border-bottom-color: #564F8A !important;\n}\n/*******************************\n           Variations\n*******************************/\n/*--------------\n    Connected\n---------------*/\n.ui.connected.items {\n  display: table;\n  width: 100%;\n  margin-left: 0em !important;\n  margin-right: 0em !important;\n}\n.ui.connected.items > .row > .item,\n.ui.connected.items > .item {\n  float: none;\n  display: table-cell;\n  vertical-align: top;\n  height: auto;\n  border-radius: 0px;\n  margin: 0em;\n  width: 33.33%;\n}\n.ui.connected.items > .row {\n  display: table;\n  margin: 0.5em 0em;\n}\n.ui.connected.items > .row:first-child {\n  margin-top: 0em;\n}\n/* Borders */\n.ui.connected.items > .item,\n.ui.connected.items > .row:last-child > .item {\n  border-bottom: 0.2em solid rgba(0, 0, 0, 0.2);\n}\n.ui.connected.items > .row:last-child > .item:first-child,\n.ui.connected.items > .item:first-child {\n  border-radius: 0em 0em 0em 0.33em;\n}\n.ui.connected.items > .row:last-child > .item:last-child,\n.ui.connected.items > .item:last-child {\n  border-radius: 0em 0em 0.33em 0em;\n}\n/* Hover */\n.ui.connected.items .item:hover {\n  border-bottom-width: 0.2em;\n}\n/* Item Count */\n.ui.one.connected.items > .row > .item,\n.ui.one.connected.items > .item {\n  width: 50%;\n  padding-left: 2%;\n  padding-right: 2%;\n}\n.ui.two.connected.items > .row > .item,\n.ui.two.connected.items > .item {\n  width: 50%;\n  padding-left: 1%;\n  padding-right: 1%;\n}\n.ui.three.connected.items > .row > .item,\n.ui.three.connected.items > .item {\n  width: 33.333%;\n  padding-left: 1%;\n  padding-right: 1%;\n}\n.ui.four.connected.items > .row > .item,\n.ui.four.connected.items > .item {\n  width: 25%;\n  padding-left: 0.5%;\n  padding-right: 0.5%;\n}\n.ui.five.connected.items > .row > .item,\n.ui.five.connected.items > .item {\n  width: 20%;\n  padding-left: 0.5%;\n  padding-right: 0.5%;\n}\n.ui.six.connected.items > .row > .item,\n.ui.six.connected.items > .item {\n  width: 16.66%;\n  padding-left: 0.5%;\n  padding-right: 0.5%;\n}\n.ui.seven.connected.items > .row > .item,\n.ui.seven.connected.items > .item {\n  width: 14.28%;\n  padding-left: 0.5%;\n  padding-right: 0.5%;\n}\n.ui.eight.connected.items > .row > .item,\n.ui.eight.connected.items > .item {\n  width: 12.5%;\n  padding-left: 0.25%;\n  padding-right: 0.25%;\n}\n.ui.nine.connected.items > .row > .item,\n.ui.nine.connected.items > .item {\n  width: 11.11%;\n  padding-left: 0.25%;\n  padding-right: 0.25%;\n}\n.ui.ten.connected.items > .row > .item,\n.ui.ten.connected.items > .item {\n  width: 10%;\n  padding-left: 0.2%;\n  padding-right: 0.2%;\n}\n.ui.eleven.connected.items > .row > .item,\n.ui.eleven.connected.items > .item {\n  width: 9.09%;\n  padding-left: 0.2%;\n  padding-right: 0.2%;\n}\n.ui.twelve.connected.items > .row > .item,\n.ui.twelve.connected.items > .item {\n  width: 8.3333%;\n  padding-left: 0.1%;\n  padding-right: 0.1%;\n}\n/*-------------------\n      Responsive\n--------------------*/\n@media only screen and (max-width: 768px) {\n  .ui.stackable.items {\n    display: block !important;\n  }\n  .ui.stackable.items > .item,\n  .ui.stackable.items > .row > .item {\n    display: block !important;\n    height: auto !important;\n    width: 100% !important;\n    padding: 0% !important;\n  }\n}\n/*--------------------\n      Horizontal\n---------------------*/\n.ui.horizontal.items > .item,\n.ui.items > .horizontal.item {\n  display: table;\n}\n.ui.horizontal.items > .item > .image,\n.ui.items > .horizontal.item > .image {\n  display: table-cell;\n  width: 50%;\n}\n.ui.horizontal.items > .item > .image + .content,\n.ui.items > .horizontal.item > .image + .content {\n  width: 50%;\n  display: table-cell;\n}\n.ui.horizontal.items > .item > .content,\n.ui.items > .horizontal.item > .content {\n  padding: 1% 1.7% 11% 3%;\n  vertical-align: top;\n}\n.ui.horizontal.items > .item > .meta,\n.ui.items > .horizontal.item > .meta {\n  position: absolute;\n  padding: 0%;\n  bottom: 7%;\n  left: 3%;\n  width: 94%;\n}\n.ui.horizontal.items > .item > .image + .content + .meta,\n.ui.items > .horizontal.item > .image + .content + .meta {\n  bottom: 7%;\n  left: 53%;\n  width: 44%;\n}\n.ui.horizontal.items > .item .avatar,\n.ui.items > .horizontal.item .avatar {\n  width: 11.5%;\n}\n.ui.items > .item .avatar {\n  max-width: 25px;\n}\n/*--------------\n    Item Count\n---------------*/\n.ui.one.items {\n  margin-left: -2%;\n  margin-right: -2%;\n}\n.ui.one.items > .item {\n  width: 100%;\n  margin-left: 2%;\n  margin-right: 2%;\n}\n.ui.two.items {\n  margin-left: -1%;\n  margin-right: -1%;\n}\n.ui.two.items > .item {\n  width: 48%;\n  margin-left: 1%;\n  margin-right: 1%;\n}\n.ui.two.items > .item:nth-child(2n+1) {\n  clear: left;\n}\n.ui.three.items {\n  margin-left: -1%;\n  margin-right: -1%;\n}\n.ui.three.items > .item {\n  width: 31.333%;\n  margin-left: 1%;\n  margin-right: 1%;\n}\n.ui.three.items > .item:nth-child(3n+1) {\n  clear: left;\n}\n.ui.four.items {\n  margin-left: -0.5%;\n  margin-right: -0.5%;\n}\n.ui.four.items > .item {\n  width: 24%;\n  margin-left: 0.5%;\n  margin-right: 0.5%;\n}\n.ui.four.items > .item:nth-child(4n+1) {\n  clear: left;\n}\n.ui.five.items {\n  margin-left: -0.5%;\n  margin-right: -0.5%;\n}\n.ui.five.items > .item {\n  width: 19%;\n  margin-left: 0.5%;\n  margin-right: 0.5%;\n}\n.ui.five.items > .item:nth-child(5n+1) {\n  clear: left;\n}\n.ui.six.items {\n  margin-left: -0.5%;\n  margin-right: -0.5%;\n}\n.ui.six.items > .item {\n  width: 15.66%;\n  margin-left: 0.5%;\n  margin-right: 0.5%;\n}\n.ui.six.items > .item:nth-child(6n+1) {\n  clear: left;\n}\n.ui.seven.items {\n  margin-left: -0.5%;\n  margin-right: -0.5%;\n}\n.ui.seven.items > .item {\n  width: 13.28%;\n  margin-left: 0.5%;\n  margin-right: 0.5%;\n  font-size: 11px;\n}\n.ui.seven.items > .item:nth-child(7n+1) {\n  clear: left;\n}\n.ui.eight.items {\n  margin-left: -0.25%;\n  margin-right: -0.25%;\n}\n.ui.eight.items > .item {\n  width: 12.0%;\n  margin-left: 0.25%;\n  margin-right: 0.25%;\n  font-size: 11px;\n}\n.ui.eight.items > .item:nth-child(8n+1) {\n  clear: left;\n}\n.ui.nine.items {\n  margin-left: -0.25%;\n  margin-right: -0.25%;\n}\n.ui.nine.items > .item {\n  width: 10.61%;\n  margin-left: 0.25%;\n  margin-right: 0.25%;\n  font-size: 10px;\n}\n.ui.nine.items > .item:nth-child(9n+1) {\n  clear: left;\n}\n.ui.ten.items {\n  margin-left: -0.2%;\n  margin-right: -0.2%;\n}\n.ui.ten.items > .item {\n  width: 9.6%;\n  margin-left: 0.2%;\n  margin-right: 0.2%;\n  font-size: 10px;\n}\n.ui.ten.items > .item:nth-child(10n+1) {\n  clear: left;\n}\n.ui.eleven.items {\n  margin-left: -0.2%;\n  margin-right: -0.2%;\n}\n.ui.eleven.items > .item {\n  width: 8.69%;\n  margin-left: 0.2%;\n  margin-right: 0.2%;\n  font-size: 9px;\n}\n.ui.eleven.items > .item:nth-child(11n+1) {\n  clear: left;\n}\n.ui.twelve.items {\n  margin-left: -0.1%;\n  margin-right: -0.1%;\n}\n.ui.twelve.items > .item {\n  width: 8.1333%;\n  margin-left: 0.1%;\n  margin-right: 0.1%;\n  font-size: 9px;\n}\n.ui.twelve.items > .item:nth-child(12n+1) {\n  clear: left;\n}\n\n/*\n * # Semantic List - Flat\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n * Released: April 26 2013\n */\n/*******************************\n            List\n*******************************/\nul.ui.list,\nol.ui.list,\n.ui.list {\n  list-style-type: none;\n  margin: 1em 0em;\n  padding: 0em;\n}\nul.ui.list ul,\nol.ui.list ol,\n.ui.list .list {\n  margin: 0em;\n  padding: 0.5em 0em 0.5em 1em;\n}\nul.ui.list:first-child,\nol.ui.list:first-child,\n.ui.list:first-child {\n  margin-top: 0em;\n}\nul.ui.list:last-child,\nol.ui.list:last-child,\n.ui.list:last-child {\n  margin-bottom: 0em;\n}\n/*******************************\n            Content\n*******************************/\n/* List Item */\nul.ui.list li,\nol.ui.list li,\n.ui.list .item {\n  display: list-item;\n  list-style-type: none;\n  list-style-position: inside;\n  padding: 0.3em 0em;\n  line-height: 1.2em;\n}\n.ui.list .item:after {\n  content: \'\';\n  display: block;\n  height: 0;\n  clear: both;\n  visibility: hidden;\n}\n/* Sub-List */\n.ui.list .list {\n  clear: both;\n}\n/* Icon */\n.ui.list .item > .icon {\n  display: block;\n  float: left;\n  margin: 0em 1em 0em 0em;\n  padding: 0.1em 0em 0em 0em;\n}\n.ui.list .item > .icon:only-child {\n  display: inline-block;\n}\n.ui.horizontal.list .item > .icon {\n  margin: 0em;\n  padding: 0em 0.25em 0em 0em;\n}\n.ui.horizontal.list .item > .icon,\n.ui.horizontal.list .item > .icon + .content {\n  float: none;\n  display: inline-block;\n}\n/* Image */\n.ui.list .item > img {\n  display: block;\n  float: left;\n  margin-right: 1em;\n  vertical-align: middle;\n}\n/* Content */\n.ui.list .item > .content {\n  display: inline-block;\n  vertical-align: middle;\n  line-height: 1.2em;\n}\n.ui.list .item > .icon + .content {\n  display: table-cell;\n  vertical-align: top;\n}\n/* Link */\n.ui.list a {\n  cursor: pointer;\n}\n.ui.list a .icon {\n  color: rgba(0, 0, 0, 0.6);\n  -webkit-transition: color 0.2s ease;\n  -moz-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n/* Header */\n.ui.list .header {\n  font-weight: bold;\n}\n.ui.list .description {\n  color: rgba(0, 0, 0, 0.5);\n}\n/* Floated Content */\n.ui.list .item > .left.floated {\n  margin-right: 1em;\n  float: left;\n}\n.ui.list .item > .right.floated {\n  margin-left: 1em;\n  float: right;\n}\n/*******************************\n            Types\n*******************************/\n/*-------------------\n      Horizontal\n--------------------*/\n.ui.horizontal.list {\n  display: inline-block;\n  font-size: 0em;\n}\n.ui.horizontal.list > .item {\n  display: inline-block;\n  margin-left: 1em;\n  font-size: 1rem;\n}\n.ui.horizontal.list > .item:first-child {\n  margin-left: 0em;\n}\n.ui.horizontal.list .list {\n  padding-left: 0em;\n  padding-bottom: 0em;\n}\n/*******************************\n             States\n*******************************/\n/*-------------------\n        Hover\n--------------------*/\n.ui.list a:hover .icon {\n  color: rgba(0, 0, 0, 0.8);\n}\n/*******************************\n           Variations\n*******************************/\n/*-------------------\n       Inverted\n--------------------*/\n.ui.inverted.list a .icon {\n  color: rgba(255, 255, 255, 0.6);\n}\n.ui.inverted.list .description {\n  color: rgba(255, 255, 255, 0.8);\n}\n.ui.inverted.link.list .item {\n  color: rgba(255, 255, 255, 0.4);\n}\n/*-------------------\n       Link\n--------------------*/\n.ui.link.list .item {\n  color: rgba(0, 0, 0, 0.3);\n}\n.ui.link.list a.item,\n.ui.link.list .item a {\n  color: rgba(0, 0, 0, 0.5);\n}\n.ui.link.list a.item:hover,\n.ui.link.list .item a:hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.link.list a.item:active,\n.ui.link.list .item a:active {\n  color: rgba(0, 0, 0, 0.8);\n}\n.ui.link.list a.active.item,\n.ui.link.list .active.item a {\n  color: rgba(0, 0, 0, 0.8);\n}\n/* Inverted */\n.ui.inverted.link.list a.item,\n.ui.inverted.link.list .item a {\n  color: rgba(255, 255, 255, 0.6);\n}\n.ui.inverted.link.list a.item:hover,\n.ui.inverted.link.list .item a:hover {\n  color: rgba(255, 255, 255, 0.8);\n}\n.ui.inverted.link.list a.item:active,\n.ui.inverted.link.list .item a:active {\n  color: rgba(255, 255, 255, 0.9);\n}\n.ui.inverted.link.list a.active.item,\n.ui.inverted.link.list .active.item a {\n  color: rgba(255, 255, 255, 0.8);\n}\n/*-------------------\n      Selection\n--------------------*/\n.ui.selection.list .item {\n  cursor: pointer;\n  color: rgba(0, 0, 0, 0.4);\n  padding: 0.5em;\n  -webkit-transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n  -moz-transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n  transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n}\n.ui.selection.list .item:hover {\n  background-color: rgba(0, 0, 0, 0.02);\n  color: rgba(0, 0, 0, 0.7);\n}\n.ui.selection.list .item:active {\n  background-color: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.7);\n}\n.ui.selection.list .item.active {\n  background-color: rgba(0, 0, 0, 0.04);\n  color: rgba(0, 0, 0, 0.7);\n}\n.ui.animated.list .item {\n  -webkit-transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n  -moz-transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n  transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n}\n.ui.animated.list:not(.horizontal) .item:hover {\n  padding-left: 1em;\n}\n.ui.animated.list:not(.horizontal) .item:hover .item:hover {\n  padding-left: 0.5em;\n}\n/* Inverted */\n.ui.inverted.selection.list .item {\n  color: rgba(255, 255, 255, 0.6);\n}\n.ui.inverted.selection.list .item:hover {\n  background-color: rgba(255, 255, 255, 0.04);\n  color: rgba(255, 255, 255, 0.8);\n}\n.ui.inverted.selection.list .item:active {\n  background-color: rgba(255, 255, 255, 0.1);\n  color: rgba(255, 255, 255, 0.7);\n}\n.ui.inverted.selection.list .item.active {\n  background-color: rgba(255, 255, 255, 0.08);\n  color: #FFFFFF;\n}\n/*-------------------\n      Bulleted\n--------------------*/\nul.ui.list,\n.ui.bulleted.list {\n  margin-left: 1.5em;\n}\nul.ui.list li,\n.ui.bulleted.list .item {\n  position: relative;\n}\nul.ui.list li:before,\n.ui.bulleted.list .item:before {\n  position: absolute;\n  left: -1.5em;\n  content: \'•\';\n}\nul.ui.list ul,\n.ui.bulleted.list .list {\n  padding-left: 1.5em;\n}\n/* Horizontal Bulleted */\nul.ui.horizontal.bulleted.list,\n.ui.horizontal.bulleted.list {\n  margin-left: 0em;\n}\nul.ui.horizontal.bulleted.list li,\n.ui.horizontal.bulleted.list .item {\n  margin-left: 1.5em;\n}\nul.ui.horizontal.bulleted.list li:before,\n.ui.horizontal.bulleted.list .item:before {\n  left: -0.9em;\n}\nul.ui.horizontal.bulleted.list li:first-child,\n.ui.horizontal.bulleted.list .item:first-child {\n  margin-left: 0em;\n}\nul.ui.horizontal.bulleted.list li:first-child::before,\n.ui.horizontal.bulleted.list .item:first-child::before {\n  display: none;\n}\n/*-------------------\n       Ordered\n--------------------*/\nol.ui.list,\n.ui.ordered.list {\n  counter-reset: ordered;\n  margin-left: 2em;\n  list-style-type: none;\n}\nol.ui.list li,\n.ui.ordered.list .item {\n  list-style-type: none;\n  position: relative;\n}\nol.ui.list li:before,\n.ui.ordered.list .item:before {\n  position: absolute;\n  left: -2em;\n  counter-increment: ordered;\n  content: counters(ordered, ".");\n  text-align: right;\n  vertical-align: top;\n  opacity: 0.75;\n}\nol.ui.list ol,\n.ui.ordered.list .list {\n  counter-reset: ordered;\n  padding-left: 2.5em;\n}\nol.ui.list ol li:before,\n.ui.ordered.list .list .item:before {\n  left: -2.5em;\n}\n/* Horizontal Ordered */\nol.ui.horizontal.list,\n.ui.ordered.horizontal.list {\n  margin-left: 0em;\n}\nol.ui.horizontal.list li:before,\n.ui.ordered.horizontal.list .item:before {\n  position: static;\n  left: 0em;\n  margin: 0em 0.5em 0em 0em;\n}\n/*-------------------\n       Divided\n--------------------*/\n.ui.divided.list > .item,\n.ui.divided.list:not(.horizontal) > .list {\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n}\n.ui.divided.list .item .menu .item {\n  border-width: 0px;\n}\n.ui.divided.list .item:first-child {\n  border-top-width: 0px;\n}\n/* Sub Menu */\n.ui.divided.list:not(.horizontal) .list {\n  margin-left: -0.5em;\n  margin-right: -0.5em;\n}\n.ui.divided.list:not(.horizontal) .list .item {\n  padding-left: 1em;\n  padding-right: 1em;\n}\n.ui.divided.list:not(.horizontal) .list .item:first-child {\n  border-top-width: 1px;\n}\n/* Divided bulleted */\n.ui.divided.bulleted.list {\n  margin-left: 0em;\n}\n.ui.divided.bulleted.list .item {\n  padding-left: 1.5em;\n}\n.ui.divided.bulleted.list .item:before {\n  left: 0.5em;\n}\n/* Divided ordered */\n.ui.divided.ordered.list {\n  margin-left: 0em;\n}\n.ui.divided.ordered.list > .item {\n  padding-left: 2em;\n  padding-right: 2em;\n}\n.ui.divided.ordered.list > .item:before {\n  left: 0.5em;\n}\n.ui.divided.ordered.list .item .list {\n  margin-left: -2em;\n  margin-right: -2em;\n}\n/* Divided horizontal */\n.ui.divided.horizontal.list {\n  margin-left: 0em;\n}\n.ui.divided.horizontal.list > .item {\n  border-top: none;\n  border-left: 1px solid rgba(0, 0, 0, 0.1);\n  margin: 0em;\n  padding-left: 0.75em;\n  padding-right: 0.75em;\n  line-height: 0.6em;\n}\n.ui.horizontal.divided.list > .item:first-child {\n  border-left: none;\n  padding-left: 0em;\n}\n/* Inverted */\n.ui.divided.inverted.list > .item,\n.ui.divided.inverted.list > .list {\n  border-color: rgba(255, 255, 255, 0.2);\n}\n.ui.divided.inverted.horizontal.list .item {\n  border-color: rgba(255, 255, 255, 0.2);\n}\n/*-------------------\n        Celled\n--------------------*/\n.ui.celled.list > .item,\n.ui.celled.list > .list {\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n}\n.ui.celled.list > .item:last-child {\n  border-bottom: 1px solid rgba(0, 0, 0, 0.1);\n}\n/* Sub Menu */\n.ui.celled.list .item .list {\n  margin-left: -0.5em;\n  margin-right: -0.5em;\n}\n.ui.celled.list .item .list .item {\n  border-width: 0px;\n}\n.ui.celled.list .list .item:first-child {\n  border-top-width: 0px;\n}\n/* Celled Bulleted */\n.ui.celled.bulleted.list {\n  margin-left: 0em;\n}\n.ui.celled.bulleted.list > .item {\n  padding-left: 1.5em;\n}\n.ui.celled.bulleted.list > .item:before {\n  left: 0.5em;\n}\n/* Celled Ordered */\n.ui.celled.ordered.list {\n  margin-left: 0em;\n}\n.ui.celled.ordered.list .item {\n  padding-left: 2em;\n  padding-right: 2em;\n}\n.ui.celled.ordered.list .item:before {\n  left: 0.5em;\n}\n.ui.celled.ordered.list .item .list {\n  margin-left: -2em;\n  margin-right: -2em;\n}\n/* Celled Horizontal */\n.ui.horizontal.celled.list {\n  margin-left: 0em;\n}\n.ui.horizontal.celled.list .item {\n  border-top: none;\n  border-left: 1px solid rgba(0, 0, 0, 0.1);\n  margin: 0em;\n  padding-left: 0.75em;\n  padding-right: 0.75em;\n  line-height: 0.6em;\n}\n.ui.horizontal.celled.list .item:last-child {\n  border-bottom: none;\n  border-right: 1px solid rgba(0, 0, 0, 0.1);\n}\n/* Inverted */\n.ui.celled.inverted.list > .item,\n.ui.celled.inverted.list > .list {\n  border-color: rgba(255, 255, 255, 0.2);\n}\n.ui.celled.inverted.horizontal.list .item {\n  border-color: rgba(255, 255, 255, 0.2);\n}\n/*-------------------\n       Relaxed\n--------------------*/\n.ui.relaxed.list:not(.horizontal) .item {\n  padding-top: 0.5em;\n  padding-bottom: 0.5em;\n}\n.ui.relaxed.list .header {\n  margin-bottom: 0.25em;\n}\n.ui.horizontal.relaxed.list .item {\n  padding-left: 1.25em;\n  padding-right: 1.25em;\n}\n.ui.very.relaxed.list:not(.horizontal) .item {\n  padding-top: 1em;\n  padding-bottom: 1em;\n}\n.ui.very.relaxed.list .header {\n  margin-bottom: 0.5em;\n}\n.ui.horizontal.very.relaxed.list .item {\n  padding-left: 2em;\n  padding-right: 2em;\n}\n/*-------------------\n      Sizes\n--------------------*/\n.ui.mini.list .item {\n  font-size: 0.7rem;\n}\n.ui.tiny.list .item {\n  font-size: 0.8125rem;\n}\n.ui.small.list .item {\n  font-size: 0.875rem;\n}\n.ui.list .item {\n  font-size: 1em;\n}\n.ui.large.list .item {\n  font-size: 1.125rem;\n}\n.ui.big.list .item {\n  font-size: 1.25rem;\n}\n.ui.huge.list .item {\n  font-size: 1.375rem;\n}\n.ui.massive.list .item {\n  font-size: 1.5rem;\n}\n\n/*\n * # Statistic\n *\n *\n * Copyright 2013 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n * Released: Aug 20, 2013\n */\n/*******************************\n           Statistic\n*******************************/\n.ui.statistic {\n  text-align: center;\n}\n/*******************************\n            Content\n*******************************/\n.ui.statistic > .number {\n  font-size: 4em;\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.7);\n}\n.ui.statistic > .description {\n  opacity: 0.8;\n}\n';
},{}],93:[function(require,module,exports){

},{}],94:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],95:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}]},{},[85])
