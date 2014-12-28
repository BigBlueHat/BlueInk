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
var _ = require('../util')

/**
 * Create a child instance that prototypally inehrits
 * data on parent. To achieve that we create an intermediate
 * constructor with its prototype pointing to parent.
 *
 * @param {Object} opts
 * @param {Function} [BaseCtor]
 * @return {Vue}
 * @public
 */

exports.$addChild = function (opts, BaseCtor) {
  BaseCtor = BaseCtor || _.Vue
  opts = opts || {}
  var parent = this
  var ChildVue
  var inherit = opts.inherit !== undefined
    ? opts.inherit
    : BaseCtor.options.inherit
  if (inherit) {
    var ctors = parent._childCtors
    if (!ctors) {
      ctors = parent._childCtors = {}
    }
    ChildVue = ctors[BaseCtor.cid]
    if (!ChildVue) {
      var optionName = BaseCtor.options.name
      var className = optionName
        ? _.camelize(optionName, true)
        : 'VueComponent'
      ChildVue = new Function(
        'return function ' + className + ' (options) {' +
        'this.constructor = ' + className + ';' +
        'this._init(options) }'
      )()
      ChildVue.options = BaseCtor.options
      ChildVue.prototype = this
      ctors[BaseCtor.cid] = ChildVue
    }
  } else {
    ChildVue = BaseCtor
  }
  opts._parent = parent
  opts._root = parent.$root
  var child = new ChildVue(opts)
  if (!this._children) {
    this._children = []
  }
  this._children.push(child)
  return child
}
},{"../util":59}],3:[function(require,module,exports){
var _ = require('../util')
var Watcher = require('../watcher')
var Path = require('../parsers/path')
var textParser = require('../parsers/text')
var dirParser = require('../parsers/directive')
var expParser = require('../parsers/expression')
var filterRE = /[^|]\|[^|]/

/**
 * Get the value from an expression on this vm.
 *
 * @param {String} exp
 * @return {*}
 */

exports.$get = function (exp) {
  var res = expParser.parse(exp)
  if (res) {
    return res.get.call(this, this)
  }
}

/**
 * Set the value from an expression on this vm.
 * The expression must be a valid left-hand
 * expression in an assignment.
 *
 * @param {String} exp
 * @param {*} val
 */

exports.$set = function (exp, val) {
  var res = expParser.parse(exp, true)
  if (res && res.set) {
    res.set.call(this, this, val)
  }
}

/**
 * Add a property on the VM
 *
 * @param {String} key
 * @param {*} val
 */

exports.$add = function (key, val) {
  this._data.$add(key, val)
}

/**
 * Delete a property on the VM
 *
 * @param {String} key
 */

exports.$delete = function (key) {
  this._data.$delete(key)
}

/**
 * Watch an expression, trigger callback when its
 * value changes.
 *
 * @param {String} exp
 * @param {Function} cb
 * @param {Boolean} [deep]
 * @param {Boolean} [immediate]
 * @return {Function} - unwatchFn
 */

exports.$watch = function (exp, cb, deep, immediate) {
  var vm = this
  var key = deep ? exp + '**deep**' : exp
  var watcher = vm._userWatchers[key]
  var wrappedCb = function (val, oldVal) {
    cb.call(vm, val, oldVal)
  }
  if (!watcher) {
    watcher = vm._userWatchers[key] =
      new Watcher(vm, exp, wrappedCb, {
        deep: deep,
        user: true
      })
  } else {
    watcher.addCb(wrappedCb)
  }
  if (immediate) {
    wrappedCb(watcher.value)
  }
  return function unwatchFn () {
    watcher.removeCb(wrappedCb)
    if (!watcher.active) {
      vm._userWatchers[key] = null
    }
  }
}

/**
 * Evaluate a text directive, including filters.
 *
 * @param {String} text
 * @return {String}
 */

exports.$eval = function (text) {
  // check for filters.
  if (filterRE.test(text)) {
    var dir = dirParser.parse(text)[0]
    // the filter regex check might give false positive
    // for pipes inside strings, so it's possible that
    // we don't get any filters here
    return dir.filters
      ? _.applyFilters(
          this.$get(dir.expression),
          _.resolveFilters(this, dir.filters).read,
          this
        )
      : this.$get(dir.expression)
  } else {
    // no filter
    return this.$get(text)
  }
}

/**
 * Interpolate a piece of template text.
 *
 * @param {String} text
 * @return {String}
 */

exports.$interpolate = function (text) {
  var tokens = textParser.parse(text)
  var vm = this
  if (tokens) {
    return tokens.length === 1
      ? vm.$eval(tokens[0].value)
      : tokens.map(function (token) {
          return token.tag
            ? vm.$eval(token.value)
            : token.value
        }).join('')
  } else {
    return text
  }
}

/**
 * Log instance data as a plain JS object
 * so that it is easier to inspect in console.
 * This method assumes console is available.
 *
 * @param {String} [path]
 */

exports.$log = function (path) {
  var data = path
    ? Path.get(this._data, path)
    : this._data
  if (data) {
    data = JSON.parse(JSON.stringify(data))
  }
  console.log(data)
}
},{"../parsers/directive":47,"../parsers/expression":48,"../parsers/path":49,"../parsers/text":51,"../util":59,"../watcher":63}],4:[function(require,module,exports){
var _ = require('../util')
var transition = require('../transition')

/**
 * Append instance to target
 *
 * @param {Node} target
 * @param {Function} [cb]
 * @param {Boolean} [withTransition] - defaults to true
 */

exports.$appendTo = function (target, cb, withTransition) {
  return insert(
    this, target, cb, withTransition,
    append, transition.append
  )
}

/**
 * Prepend instance to target
 *
 * @param {Node} target
 * @param {Function} [cb]
 * @param {Boolean} [withTransition] - defaults to true
 */

exports.$prependTo = function (target, cb, withTransition) {
  target = query(target)
  if (target.hasChildNodes()) {
    this.$before(target.firstChild, cb, withTransition)
  } else {
    this.$appendTo(target, cb, withTransition)
  }
  return this
}

/**
 * Insert instance before target
 *
 * @param {Node} target
 * @param {Function} [cb]
 * @param {Boolean} [withTransition] - defaults to true
 */

exports.$before = function (target, cb, withTransition) {
  return insert(
    this, target, cb, withTransition,
    before, transition.before
  )
}

/**
 * Insert instance after target
 *
 * @param {Node} target
 * @param {Function} [cb]
 * @param {Boolean} [withTransition] - defaults to true
 */

exports.$after = function (target, cb, withTransition) {
  target = query(target)
  if (target.nextSibling) {
    this.$before(target.nextSibling, cb, withTransition)
  } else {
    this.$appendTo(target.parentNode, cb, withTransition)
  }
  return this
}

/**
 * Remove instance from DOM
 *
 * @param {Function} [cb]
 * @param {Boolean} [withTransition] - defaults to true
 */

exports.$remove = function (cb, withTransition) {
  var inDoc = this._isAttached && _.inDoc(this.$el)
  // if we are not in document, no need to check
  // for transitions
  if (!inDoc) withTransition = false
  var op
  var self = this
  var realCb = function () {
    if (inDoc) self._callHook('detached')
    if (cb) cb()
  }
  if (
    this._isBlock &&
    !this._blockFragment.hasChildNodes()
  ) {
    op = withTransition === false
      ? append
      : transition.removeThenAppend
    blockOp(this, this._blockFragment, op, realCb)
  } else {
    op = withTransition === false
      ? remove
      : transition.remove
    op(this.$el, this, realCb)
  }
  return this
}

/**
 * Shared DOM insertion function.
 *
 * @param {Vue} vm
 * @param {Element} target
 * @param {Function} [cb]
 * @param {Boolean} [withTransition]
 * @param {Function} op1 - op for non-transition insert
 * @param {Function} op2 - op for transition insert
 * @return vm
 */

function insert (vm, target, cb, withTransition, op1, op2) {
  target = query(target)
  var targetIsDetached = !_.inDoc(target)
  var op = withTransition === false || targetIsDetached
    ? op1
    : op2
  var shouldCallHook =
    !targetIsDetached &&
    !vm._isAttached &&
    !_.inDoc(vm.$el)
  if (vm._isBlock) {
    blockOp(vm, target, op, cb)
  } else {
    op(vm.$el, target, vm, cb)
  }
  if (shouldCallHook) {
    vm._callHook('attached')
  }
  return vm
}

/**
 * Execute a transition operation on a block instance,
 * iterating through all its block nodes.
 *
 * @param {Vue} vm
 * @param {Node} target
 * @param {Function} op
 * @param {Function} cb
 */

function blockOp (vm, target, op, cb) {
  var current = vm._blockStart
  var end = vm._blockEnd
  var next
  while (next !== end) {
    next = current.nextSibling
    op(current, target, vm)
    current = next
  }
  op(end, target, vm, cb)
}

/**
 * Check for selectors
 *
 * @param {String|Element} el
 */

function query (el) {
  return typeof el === 'string'
    ? document.querySelector(el)
    : el
}

/**
 * Append operation that takes a callback.
 *
 * @param {Node} el
 * @param {Node} target
 * @param {Vue} vm - unused
 * @param {Function} [cb]
 */

function append (el, target, vm, cb) {
  target.appendChild(el)
  if (cb) cb()
}

/**
 * InsertBefore operation that takes a callback.
 *
 * @param {Node} el
 * @param {Node} target
 * @param {Vue} vm - unused
 * @param {Function} [cb]
 */

function before (el, target, vm, cb) {
  _.before(el, target)
  if (cb) cb()
}

/**
 * Remove operation that takes a callback.
 *
 * @param {Node} el
 * @param {Vue} vm - unused
 * @param {Function} [cb]
 */

function remove (el, vm, cb) {
  _.remove(el)
  if (cb) cb()
}
},{"../transition":53,"../util":59}],5:[function(require,module,exports){
var _ = require('../util')

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 */

exports.$on = function (event, fn) {
  (this._events[event] || (this._events[event] = []))
    .push(fn)
  modifyListenerCount(this, event, 1)
  return this
}

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 */

exports.$once = function (event, fn) {
  var self = this
  function on () {
    self.$off(event, on)
    fn.apply(this, arguments)
  }
  on.fn = fn
  this.$on(event, on)
  return this
}

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 */

exports.$off = function (event, fn) {
  var cbs
  // all
  if (!arguments.length) {
    if (this.$parent) {
      for (event in this._events) {
        cbs = this._events[event]
        if (cbs) {
          modifyListenerCount(this, event, -cbs.length)
        }
      }
    }
    this._events = {}
    return this
  }
  // specific event
  cbs = this._events[event]
  if (!cbs) {
    return this
  }
  if (arguments.length === 1) {
    modifyListenerCount(this, event, -cbs.length)
    this._events[event] = null
    return this
  }
  // specific handler
  var cb
  var i = cbs.length
  while (i--) {
    cb = cbs[i]
    if (cb === fn || cb.fn === fn) {
      modifyListenerCount(this, event, -1)
      cbs.splice(i, 1)
      break
    }
  }
  return this
}

/**
 * Trigger an event on self.
 *
 * @param {String} event
 */

exports.$emit = function (event) {
  this._eventCancelled = false
  var cbs = this._events[event]
  if (cbs) {
    // avoid leaking arguments:
    // http://jsperf.com/closure-with-arguments
    var i = arguments.length - 1
    var args = new Array(i)
    while (i--) {
      args[i] = arguments[i + 1]
    }
    i = 0
    cbs = cbs.length > 1
      ? _.toArray(cbs)
      : cbs
    for (var l = cbs.length; i < l; i++) {
      if (cbs[i].apply(this, args) === false) {
        this._eventCancelled = true
      }
    }
  }
  return this
}

/**
 * Recursively broadcast an event to all children instances.
 *
 * @param {String} event
 * @param {...*} additional arguments
 */

exports.$broadcast = function (event) {
  // if no child has registered for this event,
  // then there's no need to broadcast.
  if (!this._eventsCount[event]) return
  var children = this._children
  if (children) {
    for (var i = 0, l = children.length; i < l; i++) {
      var child = children[i]
      child.$emit.apply(child, arguments)
      if (!child._eventCancelled) {
        child.$broadcast.apply(child, arguments)
      }
    }
  }
  return this
}

/**
 * Recursively propagate an event up the parent chain.
 *
 * @param {String} event
 * @param {...*} additional arguments
 */

exports.$dispatch = function () {
  var parent = this.$parent
  while (parent) {
    parent.$emit.apply(parent, arguments)
    parent = parent._eventCancelled
      ? null
      : parent.$parent
  }
  return this
}

/**
 * Modify the listener counts on all parents.
 * This bookkeeping allows $broadcast to return early when
 * no child has listened to a certain event.
 *
 * @param {Vue} vm
 * @param {String} event
 * @param {Number} count
 */

var hookRE = /^hook:/
function modifyListenerCount (vm, event, count) {
  var parent = vm.$parent
  // hooks do not get broadcasted so no need
  // to do bookkeeping for them
  if (!parent || !count || hookRE.test(event)) return
  while (parent) {
    parent._eventsCount[event] =
      (parent._eventsCount[event] || 0) + count
    parent = parent.$parent
  }
}
},{"../util":59}],6:[function(require,module,exports){
var _ = require('../util')
var mergeOptions = require('../util/merge-option')

/**
 * Expose useful internals
 */

exports.util = _
exports.nextTick = _.nextTick
exports.config = require('../config')

exports.compiler = {
  compile: require('../compiler/compile'),
  transclude: require('../compiler/transclude')
}

exports.parsers = {
  path: require('../parsers/path'),
  text: require('../parsers/text'),
  template: require('../parsers/template'),
  directive: require('../parsers/directive'),
  expression: require('../parsers/expression')
}

/**
 * Each instance constructor, including Vue, has a unique
 * cid. This enables us to create wrapped "child
 * constructors" for prototypal inheritance and cache them.
 */

exports.cid = 0
var cid = 1

/**
 * Class inehritance
 *
 * @param {Object} extendOptions
 */

exports.extend = function (extendOptions) {
  extendOptions = extendOptions || {}
  var Super = this
  var Sub = createClass(extendOptions.name || 'VueComponent')
  Sub.prototype = Object.create(Super.prototype)
  Sub.prototype.constructor = Sub
  Sub.cid = cid++
  Sub.options = mergeOptions(
    Super.options,
    extendOptions
  )
  Sub['super'] = Super
  // allow further extension
  Sub.extend = Super.extend
  // create asset registers, so extended classes
  // can have their private assets too.
  createAssetRegisters(Sub)
  return Sub
}

/**
 * A function that returns a sub-class constructor with the
 * given name. This gives us much nicer output when
 * logging instances in the console.
 *
 * @param {String} name
 * @return {Function}
 */

function createClass (name) {
  return new Function(
    'return function ' + _.camelize(name, true) +
    ' (options) { this._init(options) }'
  )()
}

/**
 * Plugin system
 *
 * @param {Object} plugin
 */

exports.use = function (plugin) {
  // additional parameters
  var args = _.toArray(arguments, 1)
  args.unshift(this)
  if (typeof plugin.install === 'function') {
    plugin.install.apply(plugin, args)
  } else {
    plugin.apply(null, args)
  }
  return this
}

/**
 * Define asset registration methods on a constructor.
 *
 * @param {Function} Constructor
 */

var assetTypes = [
  'directive',
  'filter',
  'partial',
  'transition'
]

function createAssetRegisters (Constructor) {

  /* Asset registration methods share the same signature:
   *
   * @param {String} id
   * @param {*} definition
   */

  assetTypes.forEach(function (type) {
    Constructor[type] = function (id, definition) {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        this.options[type + 's'][id] = definition
      }
    }
  })

  /**
   * Component registration needs to automatically invoke
   * Vue.extend on object values.
   *
   * @param {String} id
   * @param {Object|Function} definition
   */

  Constructor.component = function (id, definition) {
    if (!definition) {
      return this.options.components[id]
    } else {
      if (_.isPlainObject(definition)) {
        definition.name = id
        definition = _.Vue.extend(definition)
      }
      this.options.components[id] = definition
    }
  }
}

createAssetRegisters(exports)
},{"../compiler/compile":10,"../compiler/transclude":11,"../config":12,"../parsers/directive":47,"../parsers/expression":48,"../parsers/path":49,"../parsers/template":50,"../parsers/text":51,"../util":59,"../util/merge-option":61}],7:[function(require,module,exports){
var _ = require('../util')
var compile = require('../compiler/compile')

/**
 * Set instance target element and kick off the compilation
 * process. The passed in `el` can be a selector string, an
 * existing Element, or a DocumentFragment (for block
 * instances).
 *
 * @param {Element|DocumentFragment|string} el
 * @public
 */

exports.$mount = function (el) {
  if (this._isCompiled) {
    _.warn('$mount() should be called only once.')
    return
  }
  if (!el) {
    el = document.createElement('div')
  } else if (typeof el === 'string') {
    var selector = el
    el = document.querySelector(el)
    if (!el) {
      _.warn('Cannot find element: ' + selector)
      return
    }
  }
  this._compile(el)
  this._isCompiled = true
  this._callHook('compiled')
  if (_.inDoc(this.$el)) {
    this._callHook('attached')
    this._initDOMHooks()
    ready.call(this)
  } else {
    this._initDOMHooks()
    this.$once('hook:attached', ready)
  }
  return this
}

/**
 * Mark an instance as ready.
 */

function ready () {
  this._isAttached = true
  this._isReady = true
  this._callHook('ready')
}

/**
 * Teardown the instance, simply delegate to the internal
 * _destroy.
 */

exports.$destroy = function (remove, deferCleanup) {
  this._destroy(remove, deferCleanup)
}

/**
 * Partially compile a piece of DOM and return a
 * decompile function.
 *
 * @param {Element|DocumentFragment} el
 * @return {Function}
 */

exports.$compile = function (el) {
  return compile(el, this.$options, true)(this, el)
}
},{"../compiler/compile":10,"../util":59}],8:[function(require,module,exports){
var _ = require('./util')

// we have two separate queues: one for directive updates
// and one for user watcher registered via $watch().
// we want to guarantee directive updates to be called
// before user watchers so that when user watchers are
// triggered, the DOM would have already been in updated
// state.
var queue = []
var userQueue = []
var has = {}
var waiting = false
var flushing = false

/**
 * Reset the batcher's state.
 */

function reset () {
  queue = []
  userQueue = []
  has = {}
  waiting = false
  flushing = false
}

/**
 * Flush both queues and run the jobs.
 */

function flush () {
  flushing = true
  run(queue)
  run(userQueue)
  reset()
}

/**
 * Run the jobs in a single queue.
 *
 * @param {Array} queue
 */

function run (queue) {
  // do not cache length because more jobs might be pushed
  // as we run existing jobs
  for (var i = 0; i < queue.length; i++) {
    queue[i].run()
  }
}

/**
 * Push a job into the job queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 *
 * @param {Object} job
 *   properties:
 *   - {String|Number} id
 *   - {Function}      run
 */

exports.push = function (job) {
  if (!job.id || !has[job.id] || flushing) {
    // A user watcher callback could trigger another
    // directive update during the flushing; at that time
    // the directive queue would already have been run, so
    // we call that update immediately as it is pushed.
    if (flushing && !job.user) {
      job.run()
      return
    }
    ;(job.user ? userQueue : queue).push(job)
    has[job.id] = job
    if (!waiting) {
      waiting = true
      _.nextTick(flush)
    }
  }
}
},{"./util":59}],9:[function(require,module,exports){
/**
 * A doubly linked list-based Least Recently Used (LRU)
 * cache. Will keep most recently used items while
 * discarding least recently used items when its limit is
 * reached. This is a bare-bone version of
 * Rasmus Andersson's js-lru:
 *
 *   https://github.com/rsms/js-lru
 *
 * @param {Number} limit
 * @constructor
 */

function Cache (limit) {
  this.size = 0
  this.limit = limit
  this.head = this.tail = undefined
  this._keymap = {}
}

var p = Cache.prototype

/**
 * Put <value> into the cache associated with <key>.
 * Returns the entry which was removed to make room for
 * the new entry. Otherwise undefined is returned.
 * (i.e. if there was enough room already).
 *
 * @param {String} key
 * @param {*} value
 * @return {Entry|undefined}
 */

p.put = function (key, value) {
  var entry = {
    key:key,
    value:value
  }
  this._keymap[key] = entry
  if (this.tail) {
    this.tail.newer = entry
    entry.older = this.tail
  } else {
    this.head = entry
  }
  this.tail = entry
  if (this.size === this.limit) {
    return this.shift()
  } else {
    this.size++
  }
}

/**
 * Purge the least recently used (oldest) entry from the
 * cache. Returns the removed entry or undefined if the
 * cache was empty.
 */

p.shift = function () {
  var entry = this.head
  if (entry) {
    this.head = this.head.newer
    this.head.older = undefined
    entry.newer = entry.older = undefined
    this._keymap[entry.key] = undefined
  }
  return entry
}

/**
 * Get and register recent use of <key>. Returns the value
 * associated with <key> or undefined if not in cache.
 *
 * @param {String} key
 * @param {Boolean} returnEntry
 * @return {Entry|*}
 */

p.get = function (key, returnEntry) {
  var entry = this._keymap[key]
  if (entry === undefined) return
  if (entry === this.tail) {
    return returnEntry
      ? entry
      : entry.value
  }
  // HEAD--------------TAIL
  //   <.older   .newer>
  //  <--- add direction --
  //   A  B  C  <D>  E
  if (entry.newer) {
    if (entry === this.head) {
      this.head = entry.newer
    }
    entry.newer.older = entry.older // C <-- E.
  }
  if (entry.older) {
    entry.older.newer = entry.newer // C. --> E
  }
  entry.newer = undefined // D --x
  entry.older = this.tail // D. --> E
  if (this.tail) {
    this.tail.newer = entry // E. <-- D
  }
  this.tail = entry
  return returnEntry
    ? entry
    : entry.value
}

module.exports = Cache
},{}],10:[function(require,module,exports){
var _ = require('../util')
var config = require('../config')
var textParser = require('../parsers/text')
var dirParser = require('../parsers/directive')
var templateParser = require('../parsers/template')

/**
 * Compile a template and return a reusable composite link
 * function, which recursively contains more link functions
 * inside. This top level compile function should only be
 * called on instance root nodes.
 *
 * When the `asParent` flag is true, this means we are doing
 * a partial compile for a component's parent scope markup
 * (See #502). This could **only** be triggered during
 * compilation of `v-component`, and we need to skip v-with,
 * v-ref & v-component in this situation.
 *
 * @param {Element|DocumentFragment} el
 * @param {Object} options
 * @param {Boolean} partial
 * @param {Boolean} asParent - compiling a component
 *                             container as its parent.
 * @return {Function}
 */

module.exports = function compile (el, options, partial, asParent) {
  var params = !partial && options.paramAttributes
  var paramsLinkFn = params
    ? compileParamAttributes(el, params, options)
    : null
  var nodeLinkFn = el instanceof DocumentFragment
    ? null
    : compileNode(el, options, asParent)
  var childLinkFn =
    !(nodeLinkFn && nodeLinkFn.terminal) &&
    el.tagName !== 'SCRIPT' &&
    el.hasChildNodes()
      ? compileNodeList(el.childNodes, options)
      : null

  /**
   * A linker function to be called on a already compiled
   * piece of DOM, which instantiates all directive
   * instances.
   *
   * @param {Vue} vm
   * @param {Element|DocumentFragment} el
   * @return {Function|undefined}
   */

  return function link (vm, el) {
    var originalDirCount = vm._directives.length
    if (paramsLinkFn) paramsLinkFn(vm, el)
    if (nodeLinkFn) nodeLinkFn(vm, el)
    if (childLinkFn) childLinkFn(vm, el.childNodes)

    /**
     * If this is a partial compile, the linker function
     * returns an unlink function that tearsdown all
     * directives instances generated during the partial
     * linking.
     */

    if (partial) {
      var dirs = vm._directives.slice(originalDirCount)
      return function unlink () {
        var i = dirs.length
        while (i--) {
          dirs[i]._teardown()
        }
        i = vm._directives.indexOf(dirs[0])
        vm._directives.splice(i, dirs.length)
      }
    }
  }
}

/**
 * Compile a node and return a nodeLinkFn based on the
 * node type.
 *
 * @param {Node} node
 * @param {Object} options
 * @param {Boolean} asParent
 * @return {Function|undefined}
 */

function compileNode (node, options, asParent) {
  var type = node.nodeType
  if (type === 1 && node.tagName !== 'SCRIPT') {
    return compileElement(node, options, asParent)
  } else if (type === 3 && config.interpolate) {
    return compileTextNode(node, options)
  }
}

/**
 * Compile an element and return a nodeLinkFn.
 *
 * @param {Element} el
 * @param {Object} options
 * @param {Boolean} asParent
 * @return {Function|null}
 */

function compileElement (el, options, asParent) {
  var linkFn, tag, component
  // check custom element component, but only on non-root
  if (!asParent && !el.__vue__) {
    tag = el.tagName.toLowerCase()
    component =
      tag.indexOf('-') > 0 &&
      options.components[tag]
    if (component) {
      el.setAttribute(config.prefix + 'component', tag)
    }
  }
  if (component || el.hasAttributes()) {
    // check terminal direcitves
    if (!asParent) {
      linkFn = checkTerminalDirectives(el, options)
    }
    // if not terminal, build normal link function
    if (!linkFn) {
      var dirs = collectDirectives(el, options, asParent)
      linkFn = dirs.length
        ? makeDirectivesLinkFn(dirs)
        : null
    }
  }
  // if the element is a textarea, we need to interpolate
  // its content on initial render.
  if (el.tagName === 'TEXTAREA') {
    var realLinkFn = linkFn
    linkFn = function (vm, el) {
      el.value = vm.$interpolate(el.value)
      if (realLinkFn) realLinkFn(vm, el)
    }
    linkFn.terminal = true
  }
  return linkFn
}

/**
 * Build a multi-directive link function.
 *
 * @param {Array} directives
 * @return {Function} directivesLinkFn
 */

function makeDirectivesLinkFn (directives) {
  return function directivesLinkFn (vm, el) {
    // reverse apply because it's sorted low to high
    var i = directives.length
    var dir, j, k
    while (i--) {
      dir = directives[i]
      if (dir._link) {
        // custom link fn
        dir._link(vm, el)
      } else {
        k = dir.descriptors.length
        for (j = 0; j < k; j++) {
          vm._bindDir(dir.name, el,
                      dir.descriptors[j], dir.def)
        }
      }
    }
  }
}

/**
 * Compile a textNode and return a nodeLinkFn.
 *
 * @param {TextNode} node
 * @param {Object} options
 * @return {Function|null} textNodeLinkFn
 */

function compileTextNode (node, options) {
  var tokens = textParser.parse(node.nodeValue)
  if (!tokens) {
    return null
  }
  var frag = document.createDocumentFragment()
  var el, token
  for (var i = 0, l = tokens.length; i < l; i++) {
    token = tokens[i]
    el = token.tag
      ? processTextToken(token, options)
      : document.createTextNode(token.value)
    frag.appendChild(el)
  }
  return makeTextNodeLinkFn(tokens, frag, options)
}

/**
 * Process a single text token.
 *
 * @param {Object} token
 * @param {Object} options
 * @return {Node}
 */

function processTextToken (token, options) {
  var el
  if (token.oneTime) {
    el = document.createTextNode(token.value)
  } else {
    if (token.html) {
      el = document.createComment('v-html')
      setTokenType('html')
    } else if (token.partial) {
      el = document.createComment('v-partial')
      setTokenType('partial')
    } else {
      // IE will clean up empty textNodes during
      // frag.cloneNode(true), so we have to give it
      // something here...
      el = document.createTextNode(' ')
      setTokenType('text')
    }
  }
  function setTokenType (type) {
    token.type = type
    token.def = options.directives[type]
    token.descriptor = dirParser.parse(token.value)[0]
  }
  return el
}

/**
 * Build a function that processes a textNode.
 *
 * @param {Array<Object>} tokens
 * @param {DocumentFragment} frag
 */

function makeTextNodeLinkFn (tokens, frag) {
  return function textNodeLinkFn (vm, el) {
    var fragClone = frag.cloneNode(true)
    var childNodes = _.toArray(fragClone.childNodes)
    var token, value, node
    for (var i = 0, l = tokens.length; i < l; i++) {
      token = tokens[i]
      value = token.value
      if (token.tag) {
        node = childNodes[i]
        if (token.oneTime) {
          value = vm.$eval(value)
          if (token.html) {
            _.replace(node, templateParser.parse(value, true))
          } else {
            node.nodeValue = value
          }
        } else {
          vm._bindDir(token.type, node,
                      token.descriptor, token.def)
        }
      }
    }
    _.replace(el, fragClone)
  }
}

/**
 * Compile a node list and return a childLinkFn.
 *
 * @param {NodeList} nodeList
 * @param {Object} options
 * @return {Function|undefined}
 */

function compileNodeList (nodeList, options) {
  var linkFns = []
  var nodeLinkFn, childLinkFn, node
  for (var i = 0, l = nodeList.length; i < l; i++) {
    node = nodeList[i]
    nodeLinkFn = compileNode(node, options)
    childLinkFn =
      !(nodeLinkFn && nodeLinkFn.terminal) &&
      node.tagName !== 'SCRIPT' &&
      node.hasChildNodes()
        ? compileNodeList(node.childNodes, options)
        : null
    linkFns.push(nodeLinkFn, childLinkFn)
  }
  return linkFns.length
    ? makeChildLinkFn(linkFns)
    : null
}

/**
 * Make a child link function for a node's childNodes.
 *
 * @param {Array<Function>} linkFns
 * @return {Function} childLinkFn
 */

function makeChildLinkFn (linkFns) {
  return function childLinkFn (vm, nodes) {
    // stablize nodes
    nodes = _.toArray(nodes)
    var node, nodeLinkFn, childrenLinkFn
    for (var i = 0, n = 0, l = linkFns.length; i < l; n++) {
      node = nodes[n]
      nodeLinkFn = linkFns[i++]
      childrenLinkFn = linkFns[i++]
      if (nodeLinkFn) {
        nodeLinkFn(vm, node)
      }
      if (childrenLinkFn) {
        childrenLinkFn(vm, node.childNodes)
      }
    }
  }
}

/**
 * Compile param attributes on a root element and return
 * a paramAttributes link function.
 *
 * @param {Element} el
 * @param {Array} attrs
 * @param {Object} options
 * @return {Function} paramsLinkFn
 */

function compileParamAttributes (el, attrs, options) {
  var params = []
  var i = attrs.length
  var name, value, param
  while (i--) {
    name = attrs[i]
    value = el.getAttribute(name)
    if (value !== null) {
      param = {
        name: name,
        value: value
      }
      var tokens = textParser.parse(value)
      if (tokens) {
        el.removeAttribute(name)
        if (tokens.length > 1) {
          _.warn(
            'Invalid param attribute binding: "' +
            name + '="' + value + '"' +
            '\nDon\'t mix binding tags with plain text ' +
            'in param attribute bindings.'
          )
          continue
        } else {
          param.dynamic = true
          param.value = tokens[0].value
        }
      }
      params.push(param)
    }
  }
  return makeParamsLinkFn(params, options)
}

/**
 * Build a function that applies param attributes to a vm.
 *
 * @param {Array} params
 * @param {Object} options
 * @return {Function} paramsLinkFn
 */

var dataAttrRE = /^data-/

function makeParamsLinkFn (params, options) {
  var def = options.directives['with']
  return function paramsLinkFn (vm, el) {
    var i = params.length
    var param, path
    while (i--) {
      param = params[i]
      // params could contain dashes, which will be
      // interpreted as minus calculations by the parser
      // so we need to wrap the path here
      path = _.camelize(param.name.replace(dataAttrRE, ''))
      if (param.dynamic) {
        // dynamic param attribtues are bound as v-with.
        // we can directly duck the descriptor here beacuse
        // param attributes cannot use expressions or
        // filters.
        vm._bindDir('with', el, {
          arg: path,
          expression: param.value
        }, def)
      } else {
        // just set once
        vm.$set(path, param.value)
      }
    }
  }
}

/**
 * Check an element for terminal directives in fixed order.
 * If it finds one, return a terminal link function.
 *
 * @param {Element} el
 * @param {Object} options
 * @return {Function} terminalLinkFn
 */

var terminalDirectives = [
  'repeat',
  'if',
  'component'
]

function skip () {}
skip.terminal = true

function checkTerminalDirectives (el, options) {
  if (_.attr(el, 'pre') !== null) {
    return skip
  }
  var value, dirName
  /* jshint boss: true */
  for (var i = 0; i < 3; i++) {
    dirName = terminalDirectives[i]
    if (value = _.attr(el, dirName)) {
      return makeTeriminalLinkFn(el, dirName, value, options)
    }
  }
}

/**
 * Build a link function for a terminal directive.
 *
 * @param {Element} el
 * @param {String} dirName
 * @param {String} value
 * @param {Object} options
 * @return {Function} terminalLinkFn
 */

function makeTeriminalLinkFn (el, dirName, value, options) {
  var descriptor = dirParser.parse(value)[0]
  var def = options.directives[dirName]
  var terminalLinkFn = function (vm, el) {
    vm._bindDir(dirName, el, descriptor, def)
  }
  terminalLinkFn.terminal = true
  return terminalLinkFn
}

/**
 * Collect the directives on an element.
 *
 * @param {Element} el
 * @param {Object} options
 * @param {Boolean} asParent
 * @return {Array}
 */

function collectDirectives (el, options, asParent) {
  var attrs = _.toArray(el.attributes)
  var i = attrs.length
  var dirs = []
  var attr, attrName, dir, dirName, dirDef
  while (i--) {
    attr = attrs[i]
    attrName = attr.name
    if (attrName.indexOf(config.prefix) === 0) {
      dirName = attrName.slice(config.prefix.length)
      if (asParent &&
          (dirName === 'with' ||
           dirName === 'component')) {
        continue
      }
      dirDef = options.directives[dirName]
      _.assertAsset(dirDef, 'directive', dirName)
      if (dirDef) {
        dirs.push({
          name: dirName,
          descriptors: dirParser.parse(attr.value),
          def: dirDef
        })
      }
    } else if (config.interpolate) {
      dir = collectAttrDirective(el, attrName, attr.value,
                                 options)
      if (dir) {
        dirs.push(dir)
      }
    }
  }
  // sort by priority, LOW to HIGH
  dirs.sort(directiveComparator)
  return dirs
}

/**
 * Check an attribute for potential dynamic bindings,
 * and return a directive object.
 *
 * @param {Element} el
 * @param {String} name
 * @param {String} value
 * @param {Object} options
 * @return {Object}
 */

function collectAttrDirective (el, name, value, options) {
  if (options._skipAttrs &&
      options._skipAttrs.indexOf(name) > -1) {
    return
  }
  var tokens = textParser.parse(value)
  if (tokens) {
    var def = options.directives.attr
    var i = tokens.length
    var allOneTime = true
    while (i--) {
      var token = tokens[i]
      if (token.tag && !token.oneTime) {
        allOneTime = false
      }
    }
    return {
      def: def,
      _link: allOneTime
        ? function (vm, el) {
            el.setAttribute(name, vm.$interpolate(value))
          }
        : function (vm, el) {
            var value = textParser.tokensToExp(tokens, vm)
            var desc = dirParser.parse(name + ':' + value)[0]
            vm._bindDir('attr', el, desc, def)
          }
    }
  }
}

/**
 * Directive priority sort comparator
 *
 * @param {Object} a
 * @param {Object} b
 */

function directiveComparator (a, b) {
  a = a.def.priority || 0
  b = b.def.priority || 0
  return a > b ? 1 : -1
}
},{"../config":12,"../parsers/directive":47,"../parsers/template":50,"../parsers/text":51,"../util":59}],11:[function(require,module,exports){
var _ = require('../util')
var templateParser = require('../parsers/template')

/**
 * Process an element or a DocumentFragment based on a
 * instance option object. This allows us to transclude
 * a template node/fragment before the instance is created,
 * so the processed fragment can then be cloned and reused
 * in v-repeat.
 *
 * @param {Element} el
 * @param {Object} options
 * @return {Element|DocumentFragment}
 */

module.exports = function transclude (el, options) {
  // for template tags, what we want is its content as
  // a documentFragment (for block instances)
  if (el.tagName === 'TEMPLATE') {
    el = templateParser.parse(el)
  }
  if (options && options.template) {
    el = transcludeTemplate(el, options)
  }
  if (el instanceof DocumentFragment) {
    _.prepend(document.createComment('v-start'), el)
    el.appendChild(document.createComment('v-end'))
  }
  return el
}

/**
 * Process the template option.
 * If the replace option is true this will swap the $el.
 *
 * @param {Element} el
 * @param {Object} options
 * @return {Element|DocumentFragment}
 */

function transcludeTemplate (el, options) {
  var template = options.template
  var frag = templateParser.parse(template, true)
  if (!frag) {
    _.warn('Invalid template option: ' + template)
  } else {
    var rawContent = options._content || _.extractContent(el)
    if (options.replace) {
      if (frag.childNodes.length > 1) {
        transcludeContent(frag, rawContent)
        return frag
      } else {
        var replacer = frag.firstChild
        _.copyAttributes(el, replacer)
        transcludeContent(replacer, rawContent)
        return replacer
      }
    } else {
      el.appendChild(frag)
      transcludeContent(el, rawContent)
      return el
    }
  }
}

/**
 * Resolve <content> insertion points mimicking the behavior
 * of the Shadow DOM spec:
 *
 *   http://w3c.github.io/webcomponents/spec/shadow/#insertion-points
 *
 * @param {Element|DocumentFragment} el
 * @param {Element} raw
 */

function transcludeContent (el, raw) {
  var outlets = getOutlets(el)
  var i = outlets.length
  if (!i) return
  var outlet, select, selected, j, main
  // first pass, collect corresponding content
  // for each outlet.
  while (i--) {
    outlet = outlets[i]
    if (raw) {
      select = outlet.getAttribute('select')
      if (select) {  // select content
        selected = raw.querySelectorAll(select)
        outlet.content = _.toArray(
          selected.length
            ? selected
            : outlet.childNodes
        )
      } else { // default content
        main = outlet
      }
    } else { // fallback content
      outlet.content = _.toArray(outlet.childNodes)
    }
  }
  // second pass, actually insert the contents
  for (i = 0, j = outlets.length; i < j; i++) {
    outlet = outlets[i]
    if (outlet !== main) {
      insertContentAt(outlet, outlet.content)
    }
  }
  // finally insert the main content
  if (main) {
    insertContentAt(main, _.toArray(raw.childNodes))
  }
}

/**
 * Get <content> outlets from the element/list
 *
 * @param {Element|Array} el
 * @return {Array}
 */

var concat = [].concat
function getOutlets (el) {
  return _.isArray(el)
    ? concat.apply([], el.map(getOutlets))
    : el.querySelectorAll
      ? _.toArray(el.querySelectorAll('content'))
      : []
}

/**
 * Insert an array of nodes at outlet,
 * then remove the outlet.
 *
 * @param {Element} outlet
 * @param {Array} contents
 */

function insertContentAt (outlet, contents) {
  // not using util DOM methods here because
  // parentNode can be cached
  var parent = outlet.parentNode
  for (var i = 0, j = contents.length; i < j; i++) {
    parent.insertBefore(contents[i], outlet)
  }
  parent.removeChild(outlet)
}
},{"../parsers/template":50,"../util":59}],12:[function(require,module,exports){
module.exports = {

  /**
   * The prefix to look for when parsing directives.
   *
   * @type {String}
   */

  prefix: 'v-',

  /**
   * Whether to print debug messages.
   * Also enables stack trace for warnings.
   *
   * @type {Boolean}
   */

  debug: false,

  /**
   * Whether to suppress warnings.
   *
   * @type {Boolean}
   */

  silent: false,

  /**
   * Whether allow observer to alter data objects'
   * __proto__.
   *
   * @type {Boolean}
   */

  proto: true,

  /**
   * Whether to parse mustache tags in templates.
   *
   * @type {Boolean}
   */

  interpolate: true,

  /**
   * Whether to use async rendering.
   */

  async: true,

  /**
   * Internal flag to indicate the delimiters have been
   * changed.
   *
   * @type {Boolean}
   */

  _delimitersChanged: true

}

/**
 * Interpolation delimiters.
 * We need to mark the changed flag so that the text parser
 * knows it needs to recompile the regex.
 *
 * @type {Array<String>}
 */

var delimiters = ['{{', '}}']
Object.defineProperty(module.exports, 'delimiters', {
  get: function () {
    return delimiters
  },
  set: function (val) {
    delimiters = val
    this._delimitersChanged = true
  }
})
},{}],13:[function(require,module,exports){
var _ = require('./util')
var config = require('./config')
var Watcher = require('./watcher')
var textParser = require('./parsers/text')
var expParser = require('./parsers/expression')

/**
 * A directive links a DOM element with a piece of data,
 * which is the result of evaluating an expression.
 * It registers a watcher with the expression and calls
 * the DOM update function when a change is triggered.
 *
 * @param {String} name
 * @param {Node} el
 * @param {Vue} vm
 * @param {Object} descriptor
 *                 - {String} expression
 *                 - {String} [arg]
 *                 - {Array<Object>} [filters]
 * @param {Object} def - directive definition object
 * @constructor
 */

function Directive (name, el, vm, descriptor, def) {
  // public
  this.name = name
  this.el = el
  this.vm = vm
  // copy descriptor props
  this.raw = descriptor.raw
  this.expression = descriptor.expression
  this.arg = descriptor.arg
  this.filters = _.resolveFilters(vm, descriptor.filters)
  // private
  this._locked = false
  this._bound = false
  // init
  this._bind(def)
}

var p = Directive.prototype

/**
 * Initialize the directive, mixin definition properties,
 * setup the watcher, call definition bind() and update()
 * if present.
 *
 * @param {Object} def
 */

p._bind = function (def) {
  if (this.name !== 'cloak' && this.el.removeAttribute) {
    this.el.removeAttribute(config.prefix + this.name)
  }
  if (typeof def === 'function') {
    this.update = def
  } else {
    _.extend(this, def)
  }
  this._watcherExp = this.expression
  this._checkDynamicLiteral()
  if (this.bind) {
    this.bind()
  }
  if (
    this.update && this._watcherExp &&
    (!this.isLiteral || this._isDynamicLiteral) &&
    !this._checkStatement()
  ) {
    // wrapped updater for context
    var dir = this
    var update = this._update = function (val, oldVal) {
      if (!dir._locked) {
        dir.update(val, oldVal)
      }
    }
    // use raw expression as identifier because filters
    // make them different watchers
    var watcher = this.vm._watchers[this.raw]
    // v-repeat always creates a new watcher because it has
    // a special filter that's bound to its directive
    // instance.
    if (!watcher || this.name === 'repeat') {
      watcher = this.vm._watchers[this.raw] = new Watcher(
        this.vm,
        this._watcherExp,
        update, // callback
        {
          filters: this.filters,
          twoWay: this.twoWay,
          deep: this.deep
        }
      )
    } else {
      watcher.addCb(update)
    }
    this._watcher = watcher
    if (this._initValue != null) {
      watcher.set(this._initValue)
    } else {
      this.update(watcher.value)
    }
  }
  this._bound = true
}

/**
 * check if this is a dynamic literal binding.
 *
 * e.g. v-component="{{currentView}}"
 */

p._checkDynamicLiteral = function () {
  var expression = this.expression
  if (expression && this.isLiteral) {
    var tokens = textParser.parse(expression)
    if (tokens) {
      var exp = textParser.tokensToExp(tokens)
      this.expression = this.vm.$get(exp)
      this._watcherExp = exp
      this._isDynamicLiteral = true
    }
  }
}

/**
 * Check if the directive is a function caller
 * and if the expression is a callable one. If both true,
 * we wrap up the expression and use it as the event
 * handler.
 *
 * e.g. v-on="click: a++"
 *
 * @return {Boolean}
 */

p._checkStatement = function () {
  var expression = this.expression
  if (
    expression && this.acceptStatement &&
    !expParser.pathTestRE.test(expression)
  ) {
    var fn = expParser.parse(expression).get
    var vm = this.vm
    var handler = function () {
      fn.call(vm, vm)
    }
    if (this.filters) {
      handler = _.applyFilters(
        handler,
        this.filters.read,
        vm
      )
    }
    this.update(handler)
    return true
  }
}

/**
 * Check for an attribute directive param, e.g. lazy
 *
 * @param {String} name
 * @return {String}
 */

p._checkParam = function (name) {
  var param = this.el.getAttribute(name)
  if (param !== null) {
    this.el.removeAttribute(name)
  }
  return param
}

/**
 * Teardown the watcher and call unbind.
 */

p._teardown = function () {
  if (this._bound) {
    if (this.unbind) {
      this.unbind()
    }
    var watcher = this._watcher
    if (watcher && watcher.active) {
      watcher.removeCb(this._update)
      if (!watcher.active) {
        this.vm._watchers[this.raw] = null
      }
    }
    this._bound = false
    this.vm = this.el = this._watcher = null
  }
}

/**
 * Set the corresponding value with the setter.
 * This should only be used in two-way directives
 * e.g. v-model.
 *
 * @param {*} value
 * @param {Boolean} lock - prevent wrtie triggering update.
 * @public
 */

p.set = function (value, lock) {
  if (this.twoWay) {
    if (lock) {
      this._locked = true
    }
    this._watcher.set(value)
    if (lock) {
      var self = this
      _.nextTick(function () {
        self._locked = false
      })
    }
  }
}

module.exports = Directive
},{"./config":12,"./parsers/expression":48,"./parsers/text":51,"./util":59,"./watcher":63}],14:[function(require,module,exports){
// xlink
var xlinkNS = 'http://www.w3.org/1999/xlink'
var xlinkRE = /^xlink:/

module.exports = {

  priority: 850,

  bind: function () {
    var name = this.arg
    this.update = xlinkRE.test(name)
      ? xlinkHandler
      : defaultHandler
  }

}

function defaultHandler (value) {
  if (value || value === 0) {
    this.el.setAttribute(this.arg, value)
  } else {
    this.el.removeAttribute(this.arg)
  }
}

function xlinkHandler (value) {
  if (value != null) {
    this.el.setAttributeNS(xlinkNS, this.arg, value)
  } else {
    this.el.removeAttributeNS(xlinkNS, 'href')
  }
}
},{}],15:[function(require,module,exports){
var _ = require('../util')
var addClass = _.addClass
var removeClass = _.removeClass

module.exports = function (value) {
  if (this.arg) {
    var method = value ? addClass : removeClass
    method(this.el, this.arg)
  } else {
    if (this.lastVal) {
      removeClass(this.el, this.lastVal)
    }
    if (value) {
      addClass(this.el, value)
      this.lastVal = value
    }
  }
}
},{"../util":59}],16:[function(require,module,exports){
var config = require('../config')

module.exports = {

  bind: function () {
    var el = this.el
    this.vm.$once('hook:compiled', function () {
      el.removeAttribute(config.prefix + 'cloak')
    })
  }

}
},{"../config":12}],17:[function(require,module,exports){
var _ = require('../util')
var templateParser = require('../parsers/template')

module.exports = {

  isLiteral: true,

  /**
   * Setup. Two possible usages:
   *
   * - static:
   *   v-component="comp"
   *
   * - dynamic:
   *   v-component="{{currentView}}"
   */

  bind: function () {
    if (!this.el.__vue__) {
      // create a ref anchor
      this.ref = document.createComment('v-component')
      _.replace(this.el, this.ref)
      // check keep-alive options.
      // If yes, instead of destroying the active vm when
      // hiding (v-if) or switching (dynamic literal) it,
      // we simply remove it from the DOM and save it in a
      // cache object, with its constructor id as the key.
      this.keepAlive = this._checkParam('keep-alive') != null
      if (this.keepAlive) {
        this.cache = {}
      }
      // if static, build right now.
      if (!this._isDynamicLiteral) {
        this.resolveCtor(this.expression)
        this.childVM = this.build()
        this.childVM.$before(this.ref)
      } else {
        // check dynamic component params
        this.readyEvent = this._checkParam('wait-for')
        this.transMode = this._checkParam('transition-mode')
      }
    } else {
      _.warn(
        'v-component="' + this.expression + '" cannot be ' +
        'used on an already mounted instance.'
      )
    }
  },

  /**
   * Resolve the component constructor to use when creating
   * the child vm.
   */

  resolveCtor: function (id) {
    this.ctorId = id
    this.Ctor = this.vm.$options.components[id]
    _.assertAsset(this.Ctor, 'component', id)
  },

  /**
   * Instantiate/insert a new child vm.
   * If keep alive and has cached instance, insert that
   * instance; otherwise build a new one and cache it.
   *
   * @return {Vue} - the created instance
   */

  build: function () {
    if (this.keepAlive) {
      var cached = this.cache[this.ctorId]
      if (cached) {
        return cached
      }
    }
    var vm = this.vm
    var el = templateParser.clone(this.el)
    if (this.Ctor) {
      var child = vm.$addChild({
        el: el,
        _asComponent: true
      }, this.Ctor)
      if (this.keepAlive) {
        this.cache[this.ctorId] = child
      }
      return child
    }
  },

  /**
   * Teardown the current child, but defers cleanup so
   * that we can separate the destroy and removal steps.
   */

  unbuild: function () {
    var child = this.childVM
    if (!child || this.keepAlive) {
      return
    }
    // the sole purpose of `deferCleanup` is so that we can
    // "deactivate" the vm right now and perform DOM removal
    // later.
    child.$destroy(false, true)
  },

  /**
   * Remove current destroyed child and manually do
   * the cleanup after removal.
   *
   * @param {Function} cb
   */

  removeCurrent: function (cb) {
    var child = this.childVM
    var keepAlive = this.keepAlive
    if (child) {
      child.$remove(function () {
        if (!keepAlive) child._cleanup()
        if (cb) cb()
      })
    } else if (cb) {
      cb()
    }
  },

  /**
   * Update callback for the dynamic literal scenario,
   * e.g. v-component="{{view}}"
   */

  update: function (value) {
    if (!value) {
      // just destroy and remove current
      this.unbuild()
      this.removeCurrent()
      this.childVM = null
    } else {
      this.resolveCtor(value)
      this.unbuild()
      var newComponent = this.build()
      var self = this
      if (this.readyEvent) {
        newComponent.$once(this.readyEvent, function () {
          self.swapTo(newComponent)
        })
      } else {
        this.swapTo(newComponent)
      }
    }
  },

  /**
   * Actually swap the components, depending on the
   * transition mode. Defaults to simultaneous.
   *
   * @param {Vue} target
   */

  swapTo: function (target) {
    var self = this
    switch (self.transMode) {
      case 'in-out':
        target.$before(self.ref, function () {
          self.removeCurrent()
          self.childVM = target
        })
        break
      case 'out-in':
        self.removeCurrent(function () {
          target.$before(self.ref)
          self.childVM = target
        })
        break
      default:
        self.removeCurrent()
        target.$before(self.ref)
        self.childVM = target
    }
  },

  /**
   * Unbind.
   */

  unbind: function () {
    this.unbuild()
    // destroy all keep-alive cached instances
    if (this.cache) {
      for (var key in this.cache) {
        this.cache[key].$destroy()
      }
      this.cache = null
    }
  }

}
},{"../parsers/template":50,"../util":59}],18:[function(require,module,exports){
module.exports = {

  isLiteral: true,

  bind: function () {
    this.vm.$$[this.expression] = this.el
  },

  unbind: function () {
    delete this.vm.$$[this.expression]
  }
  
}
},{}],19:[function(require,module,exports){
var _ = require('../util')

module.exports = { 

  bind: function () {
    var child = this.el.__vue__
    if (!child || this.vm !== child.$parent) {
      _.warn(
        '`v-events` should only be used on a child component ' +
        'from the parent template.'
      )
      return
    }
    var method = this.vm[this.expression]
    if (!method) {
      _.warn(
        '`v-events` cannot find method "' + this.expression +
        '" on the parent instance.'
      )
    }
    child.$on(this.arg, method)
  }

  // when child is destroyed, all events are turned off,
  // so no need for unbind here.

}
},{"../util":59}],20:[function(require,module,exports){
var _ = require('../util')
var templateParser = require('../parsers/template')

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
    value = _.toString(value)
    if (this.nodes) {
      this.swap(value)
    } else {
      this.el.innerHTML = value
    }
  },

  swap: function (value) {
    // remove old nodes
    var i = this.nodes.length
    while (i--) {
      _.remove(this.nodes[i])
    }
    // convert new value to a fragment
    // do not attempt to retrieve from id selector
    var frag = templateParser.parse(value, true, true)
    // save a reference to these nodes so we can remove later
    this.nodes = _.toArray(frag.childNodes)
    _.before(frag, this.el)
  }

}
},{"../parsers/template":50,"../util":59}],21:[function(require,module,exports){
var _ = require('../util')
var compile = require('../compiler/compile')
var templateParser = require('../parsers/template')
var transition = require('../transition')

module.exports = {

  bind: function () {
    var el = this.el
    if (!el.__vue__) {
      this.start = document.createComment('v-if-start')
      this.end = document.createComment('v-if-end')
      _.replace(el, this.end)
      _.before(this.start, this.end)
      if (el.tagName === 'TEMPLATE') {
        this.template = templateParser.parse(el, true)
      } else {
        this.template = document.createDocumentFragment()
        this.template.appendChild(el)
      }
      // compile the nested partial
      this.linker = compile(
        this.template,
        this.vm.$options,
        true
      )
    } else {
      this.invalid = true
      _.warn(
        'v-if="' + this.expression + '" cannot be ' +
        'used on an already mounted instance.'
      )
    }
  },

  update: function (value) {
    if (this.invalid) return
    if (value) {
      this.insert()
    } else {
      this.teardown()
    }
  },

  insert: function () {
    // avoid duplicate inserts, since update() can be
    // called with different truthy values
    if (!this.unlink) {
      this.compile(this.template) 
    }
  },

  compile: function (template) {
    var vm = this.vm
    var frag = templateParser.clone(template)
    var originalChildLength = vm._children
      ? vm._children.length
      : 0
    this.unlink = this.linker
      ? this.linker(vm, frag)
      : vm.$compile(frag)
    transition.blockAppend(frag, this.end, vm)
    this.children = vm._children
      ? vm._children.slice(originalChildLength)
      : null
    if (this.children && _.inDoc(vm.$el)) {
      this.children.forEach(function (child) {
        child._callHook('attached')
      })
    }
  },

  teardown: function () {
    if (!this.unlink) return
    transition.blockRemove(this.start, this.end, this.vm)
    if (this.children && _.inDoc(this.vm.$el)) {
      this.children.forEach(function (child) {
        if (!child._isDestroyed) {
          child._callHook('detached')
        }
      })
    }
    this.unlink()
    this.unlink = null
  }

}
},{"../compiler/compile":10,"../parsers/template":50,"../transition":53,"../util":59}],22:[function(require,module,exports){
// manipulation directives
exports.text       = require('./text')
exports.html       = require('./html')
exports.attr       = require('./attr')
exports.show       = require('./show')
exports['class']   = require('./class')
exports.el         = require('./el')
exports.ref        = require('./ref')
exports.cloak      = require('./cloak')
exports.style      = require('./style')
exports.partial    = require('./partial')
exports.transition = require('./transition')

// event listener directives
exports.on         = require('./on')
exports.model      = require('./model')

// child vm directives
exports.component  = require('./component')
exports.repeat     = require('./repeat')
exports['if']      = require('./if')

// child vm communication directives
exports['with']    = require('./with')
exports.events     = require('./events')
},{"./attr":14,"./class":15,"./cloak":16,"./component":17,"./el":18,"./events":19,"./html":20,"./if":21,"./model":25,"./on":28,"./partial":29,"./ref":30,"./repeat":31,"./show":32,"./style":33,"./text":34,"./transition":35,"./with":36}],23:[function(require,module,exports){
var _ = require('../../util')

module.exports = {

  bind: function () {
    var self = this
    var el = this.el
    this.listener = function () {
      self.set(el.checked, true)
    }
    _.on(el, 'change', this.listener)
    if (el.checked) {
      this._initValue = el.checked
    }
  },

  update: function (value) {
    this.el.checked = !!value
  },

  unbind: function () {
    _.off(this.el, 'change', this.listener)
  }

}
},{"../../util":59}],24:[function(require,module,exports){
var _ = require('../../util')

module.exports = {

  bind: function () {
    var self = this
    var el = this.el

    // check params
    // - lazy: update model on "change" instead of "input"
    var lazy = this._checkParam('lazy') != null
    // - number: cast value into number when updating model.
    var number = this._checkParam('number') != null

    // handle composition events.
    // http://blog.evanyou.me/2014/01/03/composition-event/
    var cpLocked = false
    this.cpLock = function () {
      cpLocked = true
    }
    this.cpUnlock = function () {
      cpLocked = false
      // in IE11 the "compositionend" event fires AFTER
      // the "input" event, so the input handler is blocked
      // at the end... have to call it here.
      set()
    }
    _.on(el,'compositionstart', this.cpLock)
    _.on(el,'compositionend', this.cpUnlock)

    // shared setter
    function set () {
      self.set(
        number ? _.toNumber(el.value) : el.value,
        true
      )
    }

    // if the directive has filters, we need to
    // record cursor position and restore it after updating
    // the input with the filtered value.
    // also force update for type="range" inputs to enable
    // "lock in range" (see #506)
    this.listener = this.filters || el.type === 'range'
      ? function textInputListener () {
          if (cpLocked) return
          var charsOffset
          // some HTML5 input types throw error here
          try {
            // record how many chars from the end of input
            // the cursor was at
            charsOffset = el.value.length - el.selectionStart
          } catch (e) {}
          // Fix IE10/11 infinite update cycle
          // https://github.com/yyx990803/vue/issues/592
          /* istanbul ignore if */
          if (charsOffset < 0) {
            return
          }
          set()
          _.nextTick(function () {
            // force a value update, because in
            // certain cases the write filters output the
            // same result for different input values, and
            // the Observer set events won't be triggered.
            var newVal = self._watcher.value
            self.update(newVal)
            if (charsOffset != null) {
              var cursorPos =
                _.toString(newVal).length - charsOffset
              el.setSelectionRange(cursorPos, cursorPos)
            }
          })
        }
      : function textInputListener () {
          if (cpLocked) return
          set()
        }

    this.event = lazy ? 'change' : 'input'
    _.on(el, this.event, this.listener)

    // IE9 doesn't fire input event on backspace/del/cut
    if (!lazy && _.isIE9) {
      this.onCut = function () {
        _.nextTick(self.listener)
      }
      this.onDel = function (e) {
        if (e.keyCode === 46 || e.keyCode === 8) {
          self.listener()
        }
      }
      _.on(el, 'cut', this.onCut)
      _.on(el, 'keyup', this.onDel)
    }

    // set initial value if present
    if (
      el.hasAttribute('value') ||
      (el.tagName === 'TEXTAREA' && el.value.trim())
    ) {
      this._initValue = number
        ? _.toNumber(el.value)
        : el.value
    }
  },

  update: function (value) {
    this.el.value = _.toString(value)
  },

  unbind: function () {
    var el = this.el
    _.off(el, this.event, this.listener)
    _.off(el,'compositionstart', this.cpLock)
    _.off(el,'compositionend', this.cpUnlock)
    if (this.onCut) {
      _.off(el,'cut', this.onCut)
      _.off(el,'keyup', this.onDel)
    }
  }

}
},{"../../util":59}],25:[function(require,module,exports){
var _ = require('../../util')

var handlers = {
  _default: require('./default'),
  radio: require('./radio'),
  select: require('./select'),
  checkbox: require('./checkbox')
}

module.exports = {

  priority: 800,
  twoWay: true,
  handlers: handlers,

  /**
   * Possible elements:
   *   <select>
   *   <textarea>
   *   <input type="*">
   *     - text
   *     - checkbox
   *     - radio
   *     - number
   *     - TODO: more types may be supplied as a plugin
   */

  bind: function () {
    // friendly warning...
    var filters = this.filters
    if (filters && filters.read && !filters.write) {
      _.warn(
        'It seems you are using a read-only filter with ' +
        'v-model. You might want to use a two-way filter ' +
        'to ensure correct behavior.'
      )
    }
    var el = this.el
    var tag = el.tagName
    var handler
    if (tag === 'INPUT') {
      handler = handlers[el.type] || handlers._default
    } else if (tag === 'SELECT') {
      handler = handlers.select
    } else if (tag === 'TEXTAREA') {
      handler = handlers._default
    } else {
      _.warn("v-model doesn't support element type: " + tag)
      return
    }
    handler.bind.call(this)
    this.update = handler.update
    this.unbind = handler.unbind
  }

}
},{"../../util":59,"./checkbox":23,"./default":24,"./radio":26,"./select":27}],26:[function(require,module,exports){
var _ = require('../../util')

module.exports = {

  bind: function () {
    var self = this
    var el = this.el
    this.listener = function () {
      self.set(el.value, true)
    }
    _.on(el, 'change', this.listener)
    if (el.checked) {
      this._initValue = el.value
    }
  },

  update: function (value) {
    /* jshint eqeqeq: false */
    this.el.checked = value == this.el.value
  },

  unbind: function () {
    _.off(this.el, 'change', this.listener)
  }

}
},{"../../util":59}],27:[function(require,module,exports){
var _ = require('../../util')
var Watcher = require('../../watcher')

module.exports = {

  bind: function () {
    var self = this
    var el = this.el
    // check options param
    var optionsParam = this._checkParam('options')
    if (optionsParam) {
      initOptions.call(this, optionsParam)
    }
    this.multiple = el.hasAttribute('multiple')
    this.listener = function () {
      var value = self.multiple
        ? getMultiValue(el)
        : el.value
      self.set(value, true)
    }
    _.on(el, 'change', this.listener)
    checkInitialValue.call(this)
  },

  update: function (value) {
    /* jshint eqeqeq: false */
    var el = this.el
    el.selectedIndex = -1
    var multi = this.multiple && _.isArray(value)
    var options = el.options
    var i = options.length
    var option
    while (i--) {
      option = options[i]
      option.selected = multi
        ? indexOf(value, option.value) > -1
        : value == option.value
    }
  },

  unbind: function () {
    _.off(this.el, 'change', this.listener)
    if (this.optionWatcher) {
      this.optionWatcher.teardown()
    }
  }

}

/**
 * Initialize the option list from the param.
 *
 * @param {String} expression
 */

function initOptions (expression) {
  var self = this
  function optionUpdateWatcher (value) {
    if (_.isArray(value)) {
      self.el.innerHTML = ''
      buildOptions(self.el, value)
      if (self._watcher) {
        self.update(self._watcher.value)
      }
    } else {
      _.warn('Invalid options value for v-model: ' + value)
    }
  }
  this.optionWatcher = new Watcher(
    this.vm,
    expression,
    optionUpdateWatcher,
    { deep: true }
  )
  // update with initial value
  optionUpdateWatcher(this.optionWatcher.value)
}

/**
 * Build up option elements. IE9 doesn't create options
 * when setting innerHTML on <select> elements, so we have
 * to use DOM API here.
 *
 * @param {Element} parent - a <select> or an <optgroup>
 * @param {Array} options
 */

function buildOptions (parent, options) {
  var op, el
  for (var i = 0, l = options.length; i < l; i++) {
    op = options[i]
    if (!op.options) {
      el = document.createElement('option')
      if (typeof op === 'string') {
        el.text = el.value = op
      } else {
        el.text = op.text
        el.value = op.value
      }
    } else {
      el = document.createElement('optgroup')
      el.label = op.label
      buildOptions(el, op.options)
    }
    parent.appendChild(el)
  }
}

/**
 * Check the initial value for selected options.
 */

function checkInitialValue () {
  var initValue
  var options = this.el.options
  for (var i = 0, l = options.length; i < l; i++) {
    if (options[i].hasAttribute('selected')) {
      if (this.multiple) {
        (initValue || (initValue = []))
          .push(options[i].value)
      } else {
        initValue = options[i].value
      }
    }
  }
  if (initValue) {
    this._initValue = initValue
  }
}

/**
 * Helper to extract a value array for select[multiple]
 *
 * @param {SelectElement} el
 * @return {Array}
 */

function getMultiValue (el) {
  return Array.prototype.filter
    .call(el.options, filterSelected)
    .map(getOptionValue)
}

function filterSelected (op) {
  return op.selected
}

function getOptionValue (op) {
  return op.value || op.text
}

/**
 * Native Array.indexOf uses strict equal, but in this
 * case we need to match string/numbers with soft equal.
 *
 * @param {Array} arr
 * @param {*} val
 */

function indexOf (arr, val) {
  /* jshint eqeqeq: false */
  var i = arr.length
  while (i--) {
    if (arr[i] == val) return i
  }
  return -1
}
},{"../../util":59,"../../watcher":63}],28:[function(require,module,exports){
var _ = require('../util')

module.exports = {

  acceptStatement: true,
  priority: 700,

  bind: function () {
    // deal with iframes
    if (
      this.el.tagName === 'IFRAME' &&
      this.arg !== 'load'
    ) {
      var self = this
      this.iframeBind = function () {
        _.on(self.el.contentWindow, self.arg, self.handler)
      }
      _.on(this.el, 'load', this.iframeBind)
    }
  },

  update: function (handler) {
    if (typeof handler !== 'function') {
      _.warn(
        'Directive "v-on:' + this.expression + '" ' +
        'expects a function value.'
      )
      return
    }
    this.reset()
    var vm = this.vm
    this.handler = function (e) {
      e.targetVM = vm
      vm.$event = e
      var res = handler(e)
      vm.$event = null
      return res
    }
    if (this.iframeBind) {
      this.iframeBind()
    } else {
      _.on(this.el, this.arg, this.handler)
    }
  },

  reset: function () {
    var el = this.iframeBind
      ? this.el.contentWindow
      : this.el
    if (this.handler) {
      _.off(el, this.arg, this.handler)
    }
  },

  unbind: function () {
    this.reset()
    _.off(this.el, 'load', this.iframeBind)
  }
}
},{"../util":59}],29:[function(require,module,exports){
var _ = require('../util')
var templateParser = require('../parsers/template')
var vIf = require('./if')

module.exports = {

  isLiteral: true,

  // same logic reuse from v-if
  compile: vIf.compile,
  teardown: vIf.teardown,

  bind: function () {
    var el = this.el
    this.start = document.createComment('v-partial-start')
    this.end = document.createComment('v-partial-end')
    if (el.nodeType !== 8) {
      el.innerHTML = ''
    }
    if (el.tagName === 'TEMPLATE' || el.nodeType === 8) {
      _.replace(el, this.end)
    } else {
      el.appendChild(this.end)
    }
    _.before(this.start, this.end)
    if (!this._isDynamicLiteral) {
      this.insert(this.expression)
    }
  },

  update: function (id) {
    this.teardown()
    this.insert(id)
  },

  insert: function (id) {
    var partial = this.vm.$options.partials[id]
    _.assertAsset(partial, 'partial', id)
    if (partial) {
      this.compile(templateParser.parse(partial))
    }
  }

}
},{"../parsers/template":50,"../util":59,"./if":21}],30:[function(require,module,exports){
var _ = require('../util')

module.exports = {

  isLiteral: true,

  bind: function () {
    var child = this.el.__vue__
    if (!child || this.vm !== child.$parent) {
      _.warn(
        'v-ref should only be used on a child component ' +
        'from the parent template.'
      )
      return
    }
    this.vm.$[this.expression] = child
  },

  unbind: function () {
    if (this.vm.$[this.expression] === this.el.__vue__) {
      delete this.vm.$[this.expression]
    }
  }
  
}
},{"../util":59}],31:[function(require,module,exports){
var _ = require('../util')
var isObject = _.isObject
var textParser = require('../parsers/text')
var expParser = require('../parsers/expression')
var templateParser = require('../parsers/template')
var compile = require('../compiler/compile')
var transclude = require('../compiler/transclude')
var mergeOptions = require('../util/merge-option')
var uid = 0

module.exports = {

  /**
   * Setup.
   */

  bind: function () {
    // uid as a cache identifier
    this.id = '__v_repeat_' + (++uid)
    // we need to insert the objToArray converter
    // as the first read filter, because it has to be invoked
    // before any user filters. (can't do it in `update`)
    if (!this.filters) {
      this.filters = {}
    }
    // add the object -> array convert filter
    var objectConverter = _.bind(objToArray, this)
    if (!this.filters.read) {
      this.filters.read = [objectConverter]
    } else {
      this.filters.read.unshift(objectConverter)
    }
    // setup ref node
    this.ref = document.createComment('v-repeat')
    _.replace(this.el, this.ref)
    // check if this is a block repeat
    this.template = this.el.tagName === 'TEMPLATE'
      ? templateParser.parse(this.el, true)
      : this.el
    // check other directives that need to be handled
    // at v-repeat level
    this.checkIf()
    this.checkRef()
    this.checkComponent()
    // check for trackby param
    this.idKey =
      this._checkParam('track-by') ||
      this._checkParam('trackby') // 0.11.0 compat
    // cache for primitive value instances
    this.cache = Object.create(null)
  },

  /**
   * Warn against v-if usage.
   */

  checkIf: function () {
    if (_.attr(this.el, 'if') !== null) {
      _.warn(
        'Don\'t use v-if with v-repeat. ' +
        'Use v-show or the "filterBy" filter instead.'
      )
    }
  },

  /**
   * Check if v-ref/ v-el is also present.
   */

  checkRef: function () {
    var childId = _.attr(this.el, 'ref')
    this.childId = childId
      ? this.vm.$interpolate(childId)
      : null
    var elId = _.attr(this.el, 'el')
    this.elId = elId
      ? this.vm.$interpolate(elId)
      : null
  },

  /**
   * Check the component constructor to use for repeated
   * instances. If static we resolve it now, otherwise it
   * needs to be resolved at build time with actual data.
   */

  checkComponent: function () {
    var id = _.attr(this.el, 'component')
    var options = this.vm.$options
    if (!id) {
      this.Ctor = _.Vue // default constructor
      this.inherit = true // inline repeats should inherit
      // important: transclude with no options, just
      // to ensure block start and block end
      this.template = transclude(this.template)
      this._linkFn = compile(this.template, options)
    } else {
      this._asComponent = true
      var tokens = textParser.parse(id)
      if (!tokens) { // static component
        var Ctor = this.Ctor = options.components[id]
        _.assertAsset(Ctor, 'component', id)
        // If there's no parent scope directives and no
        // content to be transcluded, we can optimize the
        // rendering by pre-transcluding + compiling here
        // and provide a link function to every instance.
        if (!this.el.hasChildNodes() &&
            !this.el.hasAttributes()) {
          // merge an empty object with owner vm as parent
          // so child vms can access parent assets.
          var merged = mergeOptions(Ctor.options, {}, {
            $parent: this.vm
          })
          this.template = transclude(this.template, merged)
          this._linkFn = compile(this.template, merged, false, true)
        }
      } else {
        // to be resolved later
        var ctorExp = textParser.tokensToExp(tokens)
        this.ctorGetter = expParser.parse(ctorExp).get
      }
    }
  },

  /**
   * Update.
   * This is called whenever the Array mutates.
   *
   * @param {Array} data
   */

  update: function (data) {
    if (typeof data === 'number') {
      data = range(data)
    }
    this.vms = this.diff(data || [], this.vms)
    // update v-ref
    if (this.childId) {
      this.vm.$[this.childId] = this.vms
    }
    if (this.elId) {
      this.vm.$$[this.elId] = this.vms.map(function (vm) {
        return vm.$el
      })
    }
  },

  /**
   * Diff, based on new data and old data, determine the
   * minimum amount of DOM manipulations needed to make the
   * DOM reflect the new data Array.
   *
   * The algorithm diffs the new data Array by storing a
   * hidden reference to an owner vm instance on previously
   * seen data. This allows us to achieve O(n) which is
   * better than a levenshtein distance based algorithm,
   * which is O(m * n).
   *
   * @param {Array} data
   * @param {Array} oldVms
   * @return {Array}
   */

  diff: function (data, oldVms) {
    var idKey = this.idKey
    var converted = this.converted
    var ref = this.ref
    var alias = this.arg
    var init = !oldVms
    var vms = new Array(data.length)
    var obj, raw, vm, i, l
    // First pass, go through the new Array and fill up
    // the new vms array. If a piece of data has a cached
    // instance for it, we reuse it. Otherwise build a new
    // instance.
    for (i = 0, l = data.length; i < l; i++) {
      obj = data[i]
      raw = converted ? obj.value : obj
      vm = !init && this.getVm(raw)
      if (vm) { // reusable instance
        vm._reused = true
        vm.$index = i // update $index
        if (converted) {
          vm.$key = obj.key // update $key
        }
        if (idKey) { // swap track by id data
          if (alias) {
            vm[alias] = raw
          } else {
            vm._setData(raw)
          }
        }
      } else { // new instance
        vm = this.build(obj, i)
        vm._new = true
      }
      vms[i] = vm
      // insert if this is first run
      if (init) {
        vm.$before(ref)
      }
    }
    // if this is the first run, we're done.
    if (init) {
      return vms
    }
    // Second pass, go through the old vm instances and
    // destroy those who are not reused (and remove them
    // from cache)
    for (i = 0, l = oldVms.length; i < l; i++) {
      vm = oldVms[i]
      if (!vm._reused) {
        this.uncacheVm(vm)
        vm.$destroy(true)
      }
    }
    // final pass, move/insert new instances into the
    // right place. We're going in reverse here because
    // insertBefore relies on the next sibling to be
    // resolved.
    var targetNext, currentNext
    i = vms.length
    while (i--) {
      vm = vms[i]
      // this is the vm that we should be in front of
      targetNext = vms[i + 1]
      if (!targetNext) {
        // This is the last item. If it's reused then
        // everything else will eventually be in the right
        // place, so no need to touch it. Otherwise, insert
        // it.
        if (!vm._reused) {
          vm.$before(ref)
        }
      } else {
        if (vm._reused) {
          // this is the vm we are actually in front of
          currentNext = findNextVm(vm, ref)
          // we only need to move if we are not in the right
          // place already.
          if (currentNext !== targetNext) {
            vm.$before(targetNext.$el, null, false)
          }
        } else {
          // new instance, insert to existing next
          vm.$before(targetNext.$el)
        }
      }
      vm._new = false
      vm._reused = false
    }
    return vms
  },

  /**
   * Build a new instance and cache it.
   *
   * @param {Object} data
   * @param {Number} index
   */

  build: function (data, index) {
    var original = data
    var meta = { $index: index }
    if (this.converted) {
      meta.$key = original.key
    }
    var raw = this.converted ? data.value : data
    var alias = this.arg
    var hasAlias = !isObject(raw) || alias
    // wrap the raw data with alias
    data = hasAlias ? {} : raw
    if (alias) {
      data[alias] = raw
    } else if (hasAlias) {
      meta.$value = raw
    }
    // resolve constructor
    var Ctor = this.Ctor || this.resolveCtor(data, meta)
    var vm = this.vm.$addChild({
      el: templateParser.clone(this.template),
      _asComponent: this._asComponent,
      _linkFn: this._linkFn,
      _meta: meta,
      data: data,
      inherit: this.inherit
    }, Ctor)
    // cache instance
    this.cacheVm(raw, vm)
    return vm
  },

  /**
   * Resolve a contructor to use for an instance.
   * The tricky part here is that there could be dynamic
   * components depending on instance data.
   *
   * @param {Object} data
   * @param {Object} meta
   * @return {Function}
   */

  resolveCtor: function (data, meta) {
    // create a temporary context object and copy data
    // and meta properties onto it.
    // use _.define to avoid accidentally overwriting scope
    // properties.
    var context = Object.create(this.vm)
    var key
    for (key in data) {
      _.define(context, key, data[key])
    }
    for (key in meta) {
      _.define(context, key, meta[key])
    }
    var id = this.ctorGetter.call(context, context)
    var Ctor = this.vm.$options.components[id]
    _.assertAsset(Ctor, 'component', id)
    return Ctor
  },

  /**
   * Unbind, teardown everything
   */

  unbind: function () {
    if (this.childId) {
      delete this.vm.$[this.childId]
    }
    if (this.vms) {
      var i = this.vms.length
      var vm
      while (i--) {
        vm = this.vms[i]
        this.uncacheVm(vm)
        vm.$destroy()
      }
    }
  },

  /**
   * Cache a vm instance based on its data.
   *
   * If the data is an object, we save the vm's reference on
   * the data object as a hidden property. Otherwise we
   * cache them in an object and for each primitive value
   * there is an array in case there are duplicates.
   *
   * @param {Object} data
   * @param {Vue} vm
   */

  cacheVm: function (data, vm) {
    var idKey = this.idKey
    var cache = this.cache
    var id
    if (idKey) {
      id = data[idKey]
      if (!cache[id]) {
        cache[id] = vm
      } else {
        _.warn('Duplicate ID in v-repeat: ' + id)
      }
    } else if (isObject(data)) {
      id = this.id
      if (data.hasOwnProperty(id)) {
        if (data[id] === null) {
          data[id] = vm
        } else {
          _.warn(
            'Duplicate objects are not supported in v-repeat.'
          )
        }
      } else {
        _.define(data, this.id, vm)
      }
    } else {
      if (!cache[data]) {
        cache[data] = [vm]
      } else {
        cache[data].push(vm)
      }
    }
    vm._raw = data
  },

  /**
   * Try to get a cached instance from a piece of data.
   *
   * @param {Object} data
   * @return {Vue|undefined}
   */

  getVm: function (data) {
    if (this.idKey) {
      return this.cache[data[this.idKey]]
    } else if (isObject(data)) {
      return data[this.id]
    } else {
      var cached = this.cache[data]
      if (cached) {
        var i = 0
        var vm = cached[i]
        // since duplicated vm instances might be a reused
        // one OR a newly created one, we need to return the
        // first instance that is neither of these.
        while (vm && (vm._reused || vm._new)) {
          vm = cached[++i]
        }
        return vm
      }
    }
  },

  /**
   * Delete a cached vm instance.
   *
   * @param {Vue} vm
   */

  uncacheVm: function (vm) {
    var data = vm._raw
    if (this.idKey) {
      this.cache[data[this.idKey]] = null
    } else if (isObject(data)) {
      data[this.id] = null
      vm._raw = null
    } else {
      this.cache[data].pop()
    }
  }

}

/**
 * Helper to find the next element that is an instance
 * root node. This is necessary because a destroyed vm's
 * element could still be lingering in the DOM before its
 * leaving transition finishes, but its __vue__ reference
 * should have been removed so we can skip them.
 *
 * @param {Vue} vm
 * @param {CommentNode} ref
 * @return {Vue}
 */

function findNextVm (vm, ref) {
  var el = (vm._blockEnd || vm.$el).nextSibling
  while (!el.__vue__ && el !== ref) {
    el = el.nextSibling
  }
  return el.__vue__
}

/**
 * Attempt to convert non-Array objects to array.
 * This is the default filter installed to every v-repeat
 * directive.
 *
 * It will be called with **the directive** as `this`
 * context so that we can mark the repeat array as converted
 * from an object.
 *
 * @param {*} obj
 * @return {Array}
 * @private
 */

function objToArray (obj) {
  if (!_.isPlainObject(obj)) {
    return obj
  }
  var keys = Object.keys(obj)
  var i = keys.length
  var res = new Array(i)
  var key
  while (i--) {
    key = keys[i]
    res[i] = {
      key: key,
      value: obj[key]
    }
  }
  // `this` points to the repeat directive instance
  this.converted = true
  return res
}

/**
 * Create a range array from given number.
 *
 * @param {Number} n
 * @return {Array}
 */

function range (n) {
  var i = -1
  var ret = new Array(n)
  while (++i < n) {
    ret[i] = i
  }
  return ret
}
},{"../compiler/compile":10,"../compiler/transclude":11,"../parsers/expression":48,"../parsers/template":50,"../parsers/text":51,"../util":59,"../util/merge-option":61}],32:[function(require,module,exports){
var transition = require('../transition')

module.exports = function (value) {
  var el = this.el
  transition.apply(el, value ? 1 : -1, function () {
    el.style.display = value ? '' : 'none'
  }, this.vm)
}
},{"../transition":53}],33:[function(require,module,exports){
var _ = require('../util')
var prefixes = ['-webkit-', '-moz-', '-ms-']
var camelPrefixes = ['Webkit', 'Moz', 'ms']
var importantRE = /!important;?$/
var camelRE = /([a-z])([A-Z])/g
var testEl = null
var propCache = {}

module.exports = {

  deep: true,

  update: function (value) {
    if (this.arg) {
      this.setProp(this.arg, value)
    } else {
      if (typeof value === 'object') {
        // cache object styles so that only changed props
        // are actually updated.
        if (!this.cache) this.cache = {}
        for (var prop in value) {
          this.setProp(prop, value[prop])
          /* jshint eqeqeq: false */
          if (value[prop] != this.cache[prop]) {
            this.cache[prop] = value[prop]
            this.setProp(prop, value[prop])
          }
        }
      } else {
        this.el.style.cssText = value
      }
    }
  },

  setProp: function (prop, value) {
    prop = normalize(prop)
    if (!prop) return // unsupported prop
    // cast possible numbers/booleans into strings
    if (value != null) value += ''
    if (value) {
      var isImportant = importantRE.test(value)
        ? 'important'
        : ''
      if (isImportant) {
        value = value.replace(importantRE, '').trim()
      }
      this.el.style.setProperty(prop, value, isImportant)
    } else {
      this.el.style.removeProperty(prop)
    }
  }

}

/**
 * Normalize a CSS property name.
 * - cache result
 * - auto prefix
 * - camelCase -> dash-case
 *
 * @param {String} prop
 * @return {String}
 */

function normalize (prop) {
  if (propCache[prop]) {
    return propCache[prop]
  }
  var res = prefix(prop)
  propCache[prop] = propCache[res] = res
  return res
}

/**
 * Auto detect the appropriate prefix for a CSS property.
 * https://gist.github.com/paulirish/523692
 *
 * @param {String} prop
 * @return {String}
 */

function prefix (prop) {
  prop = prop.replace(camelRE, '$1-$2').toLowerCase()
  var camel = _.camelize(prop)
  var upper = camel.charAt(0).toUpperCase() + camel.slice(1)
  if (!testEl) {
    testEl = document.createElement('div')
  }
  if (camel in testEl.style) {
    return prop
  }
  var i = prefixes.length
  var prefixed
  while (i--) {
    prefixed = camelPrefixes[i] + upper
    if (prefixed in testEl.style) {
      return prefixes[i] + prop
    }
  }
}
},{"../util":59}],34:[function(require,module,exports){
var _ = require('../util')

module.exports = {

  bind: function () {
    this.attr = this.el.nodeType === 3
      ? 'nodeValue'
      : 'textContent'
  },

  update: function (value) {
    this.el[this.attr] = _.toString(value)
  }
  
}
},{"../util":59}],35:[function(require,module,exports){
module.exports = {

  priority: 1000,
  isLiteral: true,

  bind: function () {
    this.el.__v_trans = {
      id: this.expression
    }
  }

}
},{}],36:[function(require,module,exports){
var _ = require('../util')
var Watcher = require('../watcher')

module.exports = {

  priority: 900,

  bind: function () {
    var vm = this.vm
    if (this.el !== vm.$el) {
      _.warn(
        'v-with can only be used on instance root elements.'
      )
    } else if (!vm.$parent) {
      _.warn(
        'v-with must be used on an instance with a parent.'
      )
    } else {
      var key = this.arg
      this.watcher = new Watcher(
        vm.$parent,
        this.expression,
        key
          ? function (val) {
              vm.$set(key, val)
            }
          : function (val) {
              vm.$data = val
            }
      )
      // initial set
      var initialVal = this.watcher.value
      if (key) {
        vm.$set(key, initialVal)
      } else {
        vm.$data = initialVal
      }
    }
  },

  unbind: function () {
    if (this.watcher) {
      this.watcher.teardown()
    }
  }

}
},{"../util":59,"../watcher":63}],37:[function(require,module,exports){
var _ = require('../util')
var Path = require('../parsers/path')

/**
 * Filter filter for v-repeat
 *
 * @param {String} searchKey
 * @param {String} [delimiter]
 * @param {String} dataKey
 */

exports.filterBy = function (arr, searchKey, delimiter, dataKey) {
  // allow optional `in` delimiter
  // because why not
  if (delimiter && delimiter !== 'in') {
    dataKey = delimiter
  }
  // get the search string
  var search =
    _.stripQuotes(searchKey) ||
    this.$get(searchKey)
  if (!search) {
    return arr
  }
  search = ('' + search).toLowerCase()
  // get the optional dataKey
  dataKey =
    dataKey &&
    (_.stripQuotes(dataKey) || this.$get(dataKey))
  return arr.filter(function (item) {
    return dataKey
      ? contains(Path.get(item, dataKey), search)
      : contains(item, search)
  })
}

/**
 * Filter filter for v-repeat
 *
 * @param {String} sortKey
 * @param {String} reverseKey
 */

exports.orderBy = function (arr, sortKey, reverseKey) {
  var key =
    _.stripQuotes(sortKey) ||
    this.$get(sortKey)
  if (!key) {
    return arr
  }
  var order = 1
  if (reverseKey) {
    if (reverseKey === '-1') {
      order = -1
    } else if (reverseKey.charCodeAt(0) === 0x21) { // !
      reverseKey = reverseKey.slice(1)
      order = this.$get(reverseKey) ? 1 : -1
    } else {
      order = this.$get(reverseKey) ? -1 : 1
    }
  }
  // sort on a copy to avoid mutating original array
  return arr.slice().sort(function (a, b) {
    a = Path.get(a, key)
    b = Path.get(b, key)
    return a === b ? 0 : a > b ? order : -order
  })
}

/**
 * String contain helper
 *
 * @param {*} val
 * @param {String} search
 */

function contains (val, search) {
  if (_.isObject(val)) {
    for (var key in val) {
      if (contains(val[key], search)) {
        return true
      }
    }
  } else if (val != null) {
    return val.toString().toLowerCase().indexOf(search) > -1
  }
}
},{"../parsers/path":49,"../util":59}],38:[function(require,module,exports){
var _ = require('../util')

/**
 * Stringify value.
 *
 * @param {Number} indent
 */

exports.json = {
  read: function (value, indent) {
    return typeof value === 'string'
      ? value
      : JSON.stringify(value, null, Number(indent) || 2)
  },
  write: function (value) {
    try {
      return JSON.parse(value)
    } catch (e) {
      return value
    }
  }
}

/**
 * 'abc' => 'Abc'
 */

exports.capitalize = function (value) {
  if (!value && value !== 0) return ''
  value = value.toString()
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * 'abc' => 'ABC'
 */

exports.uppercase = function (value) {
  return (value || value === 0)
    ? value.toString().toUpperCase()
    : ''
}

/**
 * 'AbC' => 'abc'
 */

exports.lowercase = function (value) {
  return (value || value === 0)
    ? value.toString().toLowerCase()
    : ''
}

/**
 * 12345 => $12,345.00
 *
 * @param {String} sign
 */

var digitsRE = /(\d{3})(?=\d)/g

exports.currency = function (value, sign) {
  value = parseFloat(value)
  if (!value && value !== 0) return ''
  sign = sign || '$'
  var s = Math.floor(Math.abs(value)).toString(),
    i = s.length % 3,
    h = i > 0
      ? (s.slice(0, i) + (s.length > 3 ? ',' : ''))
      : '',
    f = '.' + value.toFixed(2).slice(-2)
  return (value < 0 ? '-' : '') +
    sign + h + s.slice(i).replace(digitsRE, '$1,') + f
}

/**
 * 'item' => 'items'
 *
 * @params
 *  an array of strings corresponding to
 *  the single, double, triple ... forms of the word to
 *  be pluralized. When the number to be pluralized
 *  exceeds the length of the args, it will use the last
 *  entry in the array.
 *
 *  e.g. ['single', 'double', 'triple', 'multiple']
 */

exports.pluralize = function (value) {
  var args = _.toArray(arguments, 1)
  return args.length > 1
    ? (args[value % 10 - 1] || args[args.length - 1])
    : (args[0] + (value === 1 ? '' : 's'))
}

/**
 * A special filter that takes a handler function,
 * wraps it so it only gets triggered on specific
 * keypresses. v-on only.
 *
 * @param {String} key
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

exports.key = function (handler, key) {
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

// expose keycode hash
exports.key.keyCodes = keyCodes

/**
 * Install special array filters
 */

_.extend(exports, require('./array-filters'))
},{"../util":59,"./array-filters":37}],39:[function(require,module,exports){
var _ = require('../util')
var Directive = require('../directive')
var compile = require('../compiler/compile')
var transclude = require('../compiler/transclude')

/**
 * Transclude, compile and link element.
 *
 * If a pre-compiled linker is available, that means the
 * passed in element will be pre-transcluded and compiled
 * as well - all we need to do is to call the linker.
 *
 * Otherwise we need to call transclude/compile/link here.
 *
 * @param {Element} el
 * @return {Element}
 */

exports._compile = function (el) {
  var options = this.$options
  var parent = options._parent
  if (options._linkFn) {
    this._initElement(el)
    options._linkFn(this, el)
  } else {
    var raw = el
    if (options._asComponent) {
      // separate container element and content
      var content = options._content = _.extractContent(raw)
      // create two separate linekrs for container and content
      var parentOptions = parent.$options
      
      // hack: we need to skip the paramAttributes for this
      // child instance when compiling its parent container
      // linker. there could be a better way to do this.
      parentOptions._skipAttrs = options.paramAttributes
      var containerLinkFn =
        compile(raw, parentOptions, true, true)
      parentOptions._skipAttrs = null

      if (content) {
        var contentLinkFn =
          compile(content, parentOptions, true)
        // call content linker now, before transclusion
        this._contentUnlinkFn = contentLinkFn(parent, content)
      }
      // tranclude, this possibly replaces original
      el = transclude(el, options)
      this._initElement(el)
      // now call the container linker on the resolved el
      this._containerUnlinkFn = containerLinkFn(parent, el)
    } else {
      // simply transclude
      el = transclude(el, options)
      this._initElement(el)
    }
    var linkFn = compile(el, options)
    linkFn(this, el)
    if (options.replace) {
      _.replace(raw, el)
    }
  }
  return el
}

/**
 * Initialize instance element. Called in the public
 * $mount() method.
 *
 * @param {Element} el
 */

exports._initElement = function (el) {
  if (el instanceof DocumentFragment) {
    this._isBlock = true
    this.$el = this._blockStart = el.firstChild
    this._blockEnd = el.lastChild
    this._blockFragment = el
  } else {
    this.$el = el
  }
  this.$el.__vue__ = this
  this._callHook('beforeCompile')
}

/**
 * Create and bind a directive to an element.
 *
 * @param {String} name - directive name
 * @param {Node} node   - target node
 * @param {Object} desc - parsed directive descriptor
 * @param {Object} def  - directive definition object
 */

exports._bindDir = function (name, node, desc, def) {
  this._directives.push(
    new Directive(name, node, this, desc, def)
  )
}

/**
 * Teardown an instance, unobserves the data, unbind all the
 * directives, turn off all the event listeners, etc.
 *
 * @param {Boolean} remove - whether to remove the DOM node.
 * @param {Boolean} deferCleanup - if true, defer cleanup to
 *                                 be called later
 */

exports._destroy = function (remove, deferCleanup) {
  if (this._isBeingDestroyed) {
    return
  }
  this._callHook('beforeDestroy')
  this._isBeingDestroyed = true
  var i
  // remove self from parent. only necessary
  // if parent is not being destroyed as well.
  var parent = this.$parent
  if (parent && !parent._isBeingDestroyed) {
    i = parent._children.indexOf(this)
    parent._children.splice(i, 1)
  }
  // destroy all children.
  if (this._children) {
    i = this._children.length
    while (i--) {
      this._children[i].$destroy()
    }
  }
  // teardown parent linkers
  if (this._containerUnlinkFn) {
    this._containerUnlinkFn()
  }
  if (this._contentUnlinkFn) {
    this._contentUnlinkFn()
  }
  // teardown all directives. this also tearsdown all
  // directive-owned watchers. intentionally check for
  // directives array length on every loop since directives
  // that manages partial compilation can splice ones out
  for (i = 0; i < this._directives.length; i++) {
    this._directives[i]._teardown()
  }
  // teardown all user watchers.
  for (i in this._userWatchers) {
    this._userWatchers[i].teardown()
  }
  // remove reference to self on $el
  if (this.$el) {
    this.$el.__vue__ = null
  }
  // remove DOM element
  var self = this
  if (remove && this.$el) {
    this.$remove(function () {
      self._cleanup()
    })
  } else if (!deferCleanup) {
    this._cleanup()
  }
}

/**
 * Clean up to ensure garbage collection.
 * This is called after the leave transition if there
 * is any.
 */

exports._cleanup = function () {
  // remove reference from data ob
  this._data.__ob__.removeVm(this)
  this._data =
  this._watchers =
  this._userWatchers =
  this._watcherList =
  this.$el =
  this.$parent =
  this.$root =
  this._children =
  this._directives = null
  // call the last hook...
  this._isDestroyed = true
  this._callHook('destroyed')
  // turn off all instance listeners.
  this.$off()
}
},{"../compiler/compile":10,"../compiler/transclude":11,"../directive":13,"../util":59}],40:[function(require,module,exports){
var _ = require('../util')
var inDoc = _.inDoc

/**
 * Setup the instance's option events & watchers.
 * If the value is a string, we pull it from the
 * instance's methods by name.
 */

exports._initEvents = function () {
  var options = this.$options
  registerCallbacks(this, '$on', options.events)
  registerCallbacks(this, '$watch', options.watch)
}

/**
 * Register callbacks for option events and watchers.
 *
 * @param {Vue} vm
 * @param {String} action
 * @param {Object} hash
 */

function registerCallbacks (vm, action, hash) {
  if (!hash) return
  var handlers, key, i, j
  for (key in hash) {
    handlers = hash[key]
    if (_.isArray(handlers)) {
      for (i = 0, j = handlers.length; i < j; i++) {
        register(vm, action, key, handlers[i])
      }
    } else {
      register(vm, action, key, handlers)
    }
  }
}

/**
 * Helper to register an event/watch callback.
 *
 * @param {Vue} vm
 * @param {String} action
 * @param {String} key
 * @param {*} handler
 */

function register (vm, action, key, handler) {
  var type = typeof handler
  if (type === 'function') {
    vm[action](key, handler)
  } else if (type === 'string') {
    var methods = vm.$options.methods
    var method = methods && methods[handler]
    if (method) {
      vm[action](key, method)
    } else {
      _.warn(
        'Unknown method: "' + handler + '" when ' +
        'registering callback for ' + action +
        ': "' + key + '".'
      )
    }
  }
}

/**
 * Setup recursive attached/detached calls
 */

exports._initDOMHooks = function () {
  this.$on('hook:attached', onAttached)
  this.$on('hook:detached', onDetached)
}

/**
 * Callback to recursively call attached hook on children
 */

function onAttached () {
  this._isAttached = true
  var children = this._children
  if (!children) return
  for (var i = 0, l = children.length; i < l; i++) {
    var child = children[i]
    if (!child._isAttached && inDoc(child.$el)) {
      child._callHook('attached')
    }
  }
}

/**
 * Callback to recursively call detached hook on children
 */

function onDetached () {
  this._isAttached = false
  var children = this._children
  if (!children) return
  for (var i = 0, l = children.length; i < l; i++) {
    var child = children[i]
    if (child._isAttached && !inDoc(child.$el)) {
      child._callHook('detached')
    }
  }
}

/**
 * Trigger all handlers for a hook
 *
 * @param {String} hook
 */

exports._callHook = function (hook) {
  var handlers = this.$options[hook]
  if (handlers) {
    for (var i = 0, j = handlers.length; i < j; i++) {
      handlers[i].call(this)
    }
  }
  this.$emit('hook:' + hook)
}
},{"../util":59}],41:[function(require,module,exports){
var mergeOptions = require('../util/merge-option')

/**
 * The main init sequence. This is called for every
 * instance, including ones that are created from extended
 * constructors.
 *
 * @param {Object} options - this options object should be
 *                           the result of merging class
 *                           options and the options passed
 *                           in to the constructor.
 */

exports._init = function (options) {

  options = options || {}

  this.$el           = null
  this.$parent       = options._parent
  this.$root         = options._root || this
  this.$             = {} // child vm references
  this.$$            = {} // element references
  this._watcherList  = [] // all watchers as an array
  this._watchers     = {} // internal watchers as a hash
  this._userWatchers = {} // user watchers as a hash
  this._directives   = [] // all directives

  // a flag to avoid this being observed
  this._isVue = true

  // events bookkeeping
  this._events         = {}    // registered callbacks
  this._eventsCount    = {}    // for $broadcast optimization
  this._eventCancelled = false // for event cancellation

  // block instance properties
  this._isBlock     = false
  this._blockStart  =          // @type {CommentNode}
  this._blockEnd    = null     // @type {CommentNode}

  // lifecycle state
  this._isCompiled  =
  this._isDestroyed =
  this._isReady     =
  this._isAttached  =
  this._isBeingDestroyed = false

  // children
  this._children =         // @type {Array}
  this._childCtors = null  // @type {Object} - hash to cache
                           // child constructors

  // merge options.
  options = this.$options = mergeOptions(
    this.constructor.options,
    options,
    this
  )

  // set data after merge.
  this._data = options.data || {}

  // initialize data observation and scope inheritance.
  this._initScope()

  // setup event system and option events.
  this._initEvents()

  // call created hook
  this._callHook('created')

  // if `el` option is passed, start compilation.
  if (options.el) {
    this.$mount(options.el)
  }
}
},{"../util/merge-option":61}],42:[function(require,module,exports){
var _ = require('../util')
var Observer = require('../observer')
var Dep = require('../observer/dep')

/**
 * Setup the scope of an instance, which contains:
 * - observed data
 * - computed properties
 * - user methods
 * - meta properties
 */

exports._initScope = function () {
  this._initData()
  this._initComputed()
  this._initMethods()
  this._initMeta()
}

/**
 * Initialize the data. 
 */

exports._initData = function () {
  // proxy data on instance
  var data = this._data
  var keys = Object.keys(data)
  var i = keys.length
  var key
  while (i--) {
    key = keys[i]
    if (!_.isReserved(key)) {
      this._proxy(key)
    }
  }
  // observe data
  Observer.create(data).addVm(this)
}

/**
 * Swap the isntance's $data. Called in $data's setter.
 *
 * @param {Object} newData
 */

exports._setData = function (newData) {
  newData = newData || {}
  var oldData = this._data
  this._data = newData
  var keys, key, i
  // unproxy keys not present in new data
  keys = Object.keys(oldData)
  i = keys.length
  while (i--) {
    key = keys[i]
    if (!_.isReserved(key) && !(key in newData)) {
      this._unproxy(key)
    }
  }
  // proxy keys not already proxied,
  // and trigger change for changed values
  keys = Object.keys(newData)
  i = keys.length
  while (i--) {
    key = keys[i]
    if (!this.hasOwnProperty(key) && !_.isReserved(key)) {
      // new property
      this._proxy(key)
    }
  }
  oldData.__ob__.removeVm(this)
  Observer.create(newData).addVm(this)
  this._digest()
}

/**
 * Proxy a property, so that
 * vm.prop === vm._data.prop
 *
 * @param {String} key
 */

exports._proxy = function (key) {
  // need to store ref to self here
  // because these getter/setters might
  // be called by child instances!
  var self = this
  Object.defineProperty(self, key, {
    configurable: true,
    enumerable: true,
    get: function proxyGetter () {
      return self._data[key]
    },
    set: function proxySetter (val) {
      self._data[key] = val
    }
  })
}

/**
 * Unproxy a property.
 *
 * @param {String} key
 */

exports._unproxy = function (key) {
  delete this[key]
}

/**
 * Force update on every watcher in scope.
 */

exports._digest = function () {
  var i = this._watcherList.length
  while (i--) {
    this._watcherList[i].update()
  }
  var children = this._children
  var child
  if (children) {
    i = children.length
    while (i--) {
      child = children[i]
      if (child.$options.inherit) {
        child._digest()
      }
    }
  }
}

/**
 * Setup computed properties. They are essentially
 * special getter/setters
 */

function noop () {}
exports._initComputed = function () {
  var computed = this.$options.computed
  if (computed) {
    for (var key in computed) {
      var userDef = computed[key]
      var def = {
        enumerable: true,
        configurable: true
      }
      if (typeof userDef === 'function') {
        def.get = _.bind(userDef, this)
        def.set = noop
      } else {
        def.get = userDef.get
          ? _.bind(userDef.get, this)
          : noop
        def.set = userDef.set
          ? _.bind(userDef.set, this)
          : noop
      }
      Object.defineProperty(this, key, def)
    }
  }
}

/**
 * Setup instance methods. Methods must be bound to the
 * instance since they might be called by children
 * inheriting them.
 */

exports._initMethods = function () {
  var methods = this.$options.methods
  if (methods) {
    for (var key in methods) {
      this[key] = _.bind(methods[key], this)
    }
  }
}

/**
 * Initialize meta information like $index, $key & $value.
 */

exports._initMeta = function () {
  var metas = this.$options._meta
  if (metas) {
    for (var key in metas) {
      this._defineMeta(key, metas[key])
    }
  }
}

/**
 * Define a meta property, e.g $index, $key, $value
 * which only exists on the vm instance but not in $data.
 *
 * @param {String} key
 * @param {*} value
 */

exports._defineMeta = function (key, value) {
  var dep = new Dep()
  Object.defineProperty(this, key, {
    enumerable: true,
    configurable: true,
    get: function metaGetter () {
      if (Observer.target) {
        Observer.target.addDep(dep)
      }
      return value
    },
    set: function metaSetter (val) {
      if (val !== value) {
        value = val
        dep.notify()
      }
    }
  })
}
},{"../observer":45,"../observer/dep":44,"../util":59}],43:[function(require,module,exports){
var _ = require('../util')
var arrayProto = Array.prototype
var arrayMethods = Object.create(arrayProto)

/**
 * Intercept mutating methods and emit events
 */

;[
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]
.forEach(function (method) {
  // cache original method
  var original = arrayProto[method]
  _.define(arrayMethods, method, function mutator () {
    // avoid leaking arguments:
    // http://jsperf.com/closure-with-arguments
    var i = arguments.length
    var args = new Array(i)
    while (i--) {
      args[i] = arguments[i]
    }
    var result = original.apply(this, args)
    var ob = this.__ob__
    var inserted
    switch (method) {
      case 'push':
        inserted = args
        break
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    ob.notify()
    return result
  })
})

/**
 * Swap the element at the given index with a new value
 * and emits corresponding event.
 *
 * @param {Number} index
 * @param {*} val
 * @return {*} - replaced element
 */

_.define(
  arrayProto,
  '$set',
  function $set (index, val) {
    if (index >= this.length) {
      this.length = index + 1
    }
    return this.splice(index, 1, val)[0]
  }
)

/**
 * Convenience method to remove the element at given index.
 *
 * @param {Number} index
 * @param {*} val
 */

_.define(
  arrayProto,
  '$remove',
  function $remove (index) {
    if (typeof index !== 'number') {
      index = this.indexOf(index)
    }
    if (index > -1) {
      return this.splice(index, 1)[0]
    }
  }
)

module.exports = arrayMethods
},{"../util":59}],44:[function(require,module,exports){
var uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 *
 * @constructor
 */

function Dep () {
  this.id = ++uid
  this.subs = []
}

var p = Dep.prototype

/**
 * Add a directive subscriber.
 *
 * @param {Directive} sub
 */

p.addSub = function (sub) {
  this.subs.push(sub)
}

/**
 * Remove a directive subscriber.
 *
 * @param {Directive} sub
 */

p.removeSub = function (sub) {
  if (this.subs.length) {
    var i = this.subs.indexOf(sub)
    if (i > -1) this.subs.splice(i, 1)
  }
}

/**
 * Notify all subscribers of a new value.
 */

p.notify = function () {
  for (var i = 0, l = this.subs.length; i < l; i++) {
    this.subs[i].update()
  }
}

module.exports = Dep
},{}],45:[function(require,module,exports){
var _ = require('../util')
var config = require('../config')
var Dep = require('./dep')
var arrayMethods = require('./array')
var arrayKeys = Object.getOwnPropertyNames(arrayMethods)
require('./object')

var uid = 0

/**
 * Type enums
 */

var ARRAY  = 0
var OBJECT = 1

/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 *
 * @param {Object|Array} target
 * @param {Object} proto
 */

function protoAugment (target, src) {
  target.__proto__ = src
}

/**
 * Augment an target Object or Array by defining
 * hidden properties.
 *
 * @param {Object|Array} target
 * @param {Object} proto
 */

function copyAugment (target, src, keys) {
  var i = keys.length
  var key
  while (i--) {
    key = keys[i]
    _.define(target, key, src[key])
  }
}

/**
 * Observer class that are attached to each observed
 * object. Once attached, the observer converts target
 * object's property keys into getter/setters that
 * collect dependencies and dispatches updates.
 *
 * @param {Array|Object} value
 * @param {Number} type
 * @constructor
 */

function Observer (value, type) {
  this.id = ++uid
  this.value = value
  this.active = true
  this.deps = []
  _.define(value, '__ob__', this)
  if (type === ARRAY) {
    var augment = config.proto && _.hasProto
      ? protoAugment
      : copyAugment
    augment(value, arrayMethods, arrayKeys)
    this.observeArray(value)
  } else if (type === OBJECT) {
    this.walk(value)
  }
}

Observer.target = null

var p = Observer.prototype

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 *
 * @param {*} value
 * @return {Observer|undefined}
 * @static
 */

Observer.create = function (value) {
  if (
    value &&
    value.hasOwnProperty('__ob__') &&
    value.__ob__ instanceof Observer
  ) {
    return value.__ob__
  } else if (_.isArray(value)) {
    return new Observer(value, ARRAY)
  } else if (
    _.isPlainObject(value) &&
    !value._isVue // avoid Vue instance
  ) {
    return new Observer(value, OBJECT)
  }
}

/**
 * Walk through each property and convert them into
 * getter/setters. This method should only be called when
 * value type is Object. Properties prefixed with `$` or `_`
 * and accessor properties are ignored.
 *
 * @param {Object} obj
 */

p.walk = function (obj) {
  var keys = Object.keys(obj)
  var i = keys.length
  var key, prefix
  while (i--) {
    key = keys[i]
    prefix = key.charCodeAt(0)
    if (prefix !== 0x24 && prefix !== 0x5F) { // skip $ or _
      this.convert(key, obj[key])
    }
  }
}

/**
 * Try to carete an observer for a child value,
 * and if value is array, link dep to the array.
 *
 * @param {*} val
 * @return {Dep|undefined}
 */

p.observe = function (val) {
  return Observer.create(val)
}

/**
 * Observe a list of Array items.
 *
 * @param {Array} items
 */

p.observeArray = function (items) {
  var i = items.length
  while (i--) {
    this.observe(items[i])
  }
}

/**
 * Convert a property into getter/setter so we can emit
 * the events when the property is accessed/changed.
 *
 * @param {String} key
 * @param {*} val
 */

p.convert = function (key, val) {
  var ob = this
  var childOb = ob.observe(val)
  var dep = new Dep()
  if (childOb) {
    childOb.deps.push(dep)
  }
  Object.defineProperty(ob.value, key, {
    enumerable: true,
    configurable: true,
    get: function () {
      // Observer.target is a watcher whose getter is
      // currently being evaluated.
      if (ob.active && Observer.target) {
        Observer.target.addDep(dep)
      }
      return val
    },
    set: function (newVal) {
      if (newVal === val) return
      // remove dep from old value
      var oldChildOb = val && val.__ob__
      if (oldChildOb) {
        var oldDeps = oldChildOb.deps
        oldDeps.splice(oldDeps.indexOf(dep), 1)
      }
      val = newVal
      // add dep to new value
      var newChildOb = ob.observe(newVal)
      if (newChildOb) {
        newChildOb.deps.push(dep)
      }
      dep.notify()
    }
  })
}

/**
 * Notify change on all self deps on an observer.
 * This is called when a mutable value mutates. e.g.
 * when an Array's mutating methods are called, or an
 * Object's $add/$delete are called.
 */

p.notify = function () {
  var deps = this.deps
  for (var i = 0, l = deps.length; i < l; i++) {
    deps[i].notify()
  }
}

/**
 * Add an owner vm, so that when $add/$delete mutations
 * happen we can notify owner vms to proxy the keys and
 * digest the watchers. This is only called when the object
 * is observed as an instance's root $data.
 *
 * @param {Vue} vm
 */

p.addVm = function (vm) {
  (this.vms = this.vms || []).push(vm)
}

/**
 * Remove an owner vm. This is called when the object is
 * swapped out as an instance's $data object.
 *
 * @param {Vue} vm
 */

p.removeVm = function (vm) {
  this.vms.splice(this.vms.indexOf(vm), 1)
}

module.exports = Observer

},{"../config":12,"../util":59,"./array":43,"./dep":44,"./object":46}],46:[function(require,module,exports){
var _ = require('../util')
var objProto = Object.prototype

/**
 * Add a new property to an observed object
 * and emits corresponding event
 *
 * @param {String} key
 * @param {*} val
 * @public
 */

_.define(
  objProto,
  '$add',
  function $add (key, val) {
    if (this.hasOwnProperty(key)) return
    var ob = this.__ob__
    if (!ob || _.isReserved(key)) {
      this[key] = val
      return
    }
    ob.convert(key, val)
    if (ob.vms) {
      var i = ob.vms.length
      while (i--) {
        var vm = ob.vms[i]
        vm._proxy(key)
        vm._digest()
      }
    } else {
      ob.notify()
    }
  }
)

/**
 * Deletes a property from an observed object
 * and emits corresponding event
 *
 * @param {String} key
 * @public
 */

_.define(
  objProto,
  '$delete',
  function $delete (key) {
    if (!this.hasOwnProperty(key)) return
    delete this[key]
    var ob = this.__ob__
    if (!ob || _.isReserved(key)) {
      return
    }
    if (ob.vms) {
      var i = ob.vms.length
      while (i--) {
        var vm = ob.vms[i]
        vm._unproxy(key)
        vm._digest()
      }
    } else {
      ob.notify()
    }
  }
)
},{"../util":59}],47:[function(require,module,exports){
var _ = require('../util')
var Cache = require('../cache')
var cache = new Cache(1000)
var argRE = /^[^\{\?]+$|^'[^']*'$|^"[^"]*"$/
var filterTokenRE = /[^\s'"]+|'[^']+'|"[^"]+"/g

/**
 * Parser state
 */

var str
var c, i, l
var inSingle
var inDouble
var curly
var square
var paren
var begin
var argIndex
var dirs
var dir
var lastFilterIndex
var arg

/**
 * Push a directive object into the result Array
 */

function pushDir () {
  dir.raw = str.slice(begin, i).trim()
  if (dir.expression === undefined) {
    dir.expression = str.slice(argIndex, i).trim()
  } else if (lastFilterIndex !== begin) {
    pushFilter()
  }
  if (i === 0 || dir.expression) {
    dirs.push(dir)
  }
}

/**
 * Push a filter to the current directive object
 */

function pushFilter () {
  var exp = str.slice(lastFilterIndex, i).trim()
  var filter
  if (exp) {
    filter = {}
    var tokens = exp.match(filterTokenRE)
    filter.name = tokens[0]
    filter.args = tokens.length > 1 ? tokens.slice(1) : null
  }
  if (filter) {
    (dir.filters = dir.filters || []).push(filter)
  }
  lastFilterIndex = i + 1
}

/**
 * Parse a directive string into an Array of AST-like
 * objects representing directives.
 *
 * Example:
 *
 * "click: a = a + 1 | uppercase" will yield:
 * {
 *   arg: 'click',
 *   expression: 'a = a + 1',
 *   filters: [
 *     { name: 'uppercase', args: null }
 *   ]
 * }
 *
 * @param {String} str
 * @return {Array<Object>}
 */

exports.parse = function (s) {

  var hit = cache.get(s)
  if (hit) {
    return hit
  }

  // reset parser state
  str = s
  inSingle = inDouble = false
  curly = square = paren = begin = argIndex = 0
  lastFilterIndex = 0
  dirs = []
  dir = {}
  arg = null

  for (i = 0, l = str.length; i < l; i++) {
    c = str.charCodeAt(i)
    if (inSingle) {
      // check single quote
      if (c === 0x27) inSingle = !inSingle
    } else if (inDouble) {
      // check double quote
      if (c === 0x22) inDouble = !inDouble
    } else if (
      c === 0x2C && // comma
      !paren && !curly && !square
    ) {
      // reached the end of a directive
      pushDir()
      // reset & skip the comma
      dir = {}
      begin = argIndex = lastFilterIndex = i + 1
    } else if (
      c === 0x3A && // colon
      !dir.expression &&
      !dir.arg
    ) {
      // argument
      arg = str.slice(begin, i).trim()
      // test for valid argument here
      // since we may have caught stuff like first half of
      // an object literal or a ternary expression.
      if (argRE.test(arg)) {
        argIndex = i + 1
        dir.arg = _.stripQuotes(arg) || arg
      }
    } else if (
      c === 0x7C && // pipe
      str.charCodeAt(i + 1) !== 0x7C &&
      str.charCodeAt(i - 1) !== 0x7C
    ) {
      if (dir.expression === undefined) {
        // first filter, end of expression
        lastFilterIndex = i + 1
        dir.expression = str.slice(argIndex, i).trim()
      } else {
        // already has filter
        pushFilter()
      }
    } else {
      switch (c) {
        case 0x22: inDouble = true; break // "
        case 0x27: inSingle = true; break // '
        case 0x28: paren++; break         // (
        case 0x29: paren--; break         // )
        case 0x5B: square++; break        // [
        case 0x5D: square--; break        // ]
        case 0x7B: curly++; break         // {
        case 0x7D: curly--; break         // }
      }
    }
  }

  if (i === 0 || begin !== i) {
    pushDir()
  }

  cache.put(s, dirs)
  return dirs
}
},{"../cache":9,"../util":59}],48:[function(require,module,exports){
var _ = require('../util')
var Path = require('./path')
var Cache = require('../cache')
var expressionCache = new Cache(1000)

var keywords =
  'Math,break,case,catch,continue,debugger,default,' +
  'delete,do,else,false,finally,for,function,if,in,' +
  'instanceof,new,null,return,switch,this,throw,true,try,' +
  'typeof,var,void,while,with,undefined,abstract,boolean,' +
  'byte,char,class,const,double,enum,export,extends,' +
  'final,float,goto,implements,import,int,interface,long,' +
  'native,package,private,protected,public,short,static,' +
  'super,synchronized,throws,transient,volatile,' +
  'arguments,let,yield'

var wsRE = /\s/g
var newlineRE = /\n/g
var saveRE = /[\{,]\s*[\w\$_]+\s*:|'[^']*'|"[^"]*"/g
var restoreRE = /"(\d+)"/g
var pathTestRE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*|\['.*?'\]|\[".*?"\]|\[\d+\])*$/
var pathReplaceRE = /[^\w$\.]([A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*|\['.*?'\]|\[".*?"\])*)/g
var keywordsRE = new RegExp('^(' + keywords.replace(/,/g, '\\b|') + '\\b)')

/**
 * Save / Rewrite / Restore
 *
 * When rewriting paths found in an expression, it is
 * possible for the same letter sequences to be found in
 * strings and Object literal property keys. Therefore we
 * remove and store these parts in a temporary array, and
 * restore them after the path rewrite.
 */

var saved = []

/**
 * Save replacer
 *
 * @param {String} str
 * @return {String} - placeholder with index
 */

function save (str) {
  var i = saved.length
  saved[i] = str.replace(newlineRE, '\\n')
  return '"' + i + '"'
}

/**
 * Path rewrite replacer
 *
 * @param {String} raw
 * @return {String}
 */

function rewrite (raw) {
  var c = raw.charAt(0)
  var path = raw.slice(1)
  if (keywordsRE.test(path)) {
    return raw
  } else {
    path = path.indexOf('"') > -1
      ? path.replace(restoreRE, restore)
      : path
    return c + 'scope.' + path
  }
}

/**
 * Restore replacer
 *
 * @param {String} str
 * @param {String} i - matched save index
 * @return {String}
 */

function restore (str, i) {
  return saved[i]
}

/**
 * Rewrite an expression, prefixing all path accessors with
 * `scope.` and generate getter/setter functions.
 *
 * @param {String} exp
 * @param {Boolean} needSet
 * @return {Function}
 */

function compileExpFns (exp, needSet) {
  // reset state
  saved.length = 0
  // save strings and object literal keys
  var body = exp
    .replace(saveRE, save)
    .replace(wsRE, '')
  // rewrite all paths
  // pad 1 space here becaue the regex matches 1 extra char
  body = (' ' + body)
    .replace(pathReplaceRE, rewrite)
    .replace(restoreRE, restore)
  var getter = makeGetter(body)
  if (getter) {
    return {
      get: getter,
      body: body,
      set: needSet
        ? makeSetter(body)
        : null
    }
  }
}

/**
 * Compile getter setters for a simple path.
 *
 * @param {String} exp
 * @return {Function}
 */

function compilePathFns (exp) {
  var getter, path
  if (exp.indexOf('[') < 0) {
    // really simple path
    path = exp.split('.')
    getter = Path.compileGetter(path)
  } else {
    // do the real parsing
    path = Path.parse(exp)
    getter = path.get
  }
  return {
    get: getter,
    // always generate setter for simple paths
    set: function (obj, val) {
      Path.set(obj, path, val)
    }
  }
}

/**
 * Build a getter function. Requires eval.
 *
 * We isolate the try/catch so it doesn't affect the
 * optimization of the parse function when it is not called.
 *
 * @param {String} body
 * @return {Function|undefined}
 */

function makeGetter (body) {
  try {
    return new Function('scope', 'return ' + body + ';')
  } catch (e) {
    _.warn(
      'Invalid expression. ' +
      'Generated function body: ' + body
    )
  }
}

/**
 * Build a setter function.
 *
 * This is only needed in rare situations like "a[b]" where
 * a settable path requires dynamic evaluation.
 *
 * This setter function may throw error when called if the
 * expression body is not a valid left-hand expression in
 * assignment.
 *
 * @param {String} body
 * @return {Function|undefined}
 */

function makeSetter (body) {
  try {
    return new Function('scope', 'value', body + '=value;')
  } catch (e) {
    _.warn('Invalid setter function body: ' + body)
  }
}

/**
 * Check for setter existence on a cache hit.
 *
 * @param {Function} hit
 */

function checkSetter (hit) {
  if (!hit.set) {
    hit.set = makeSetter(hit.body)
  }
}

/**
 * Parse an expression into re-written getter/setters.
 *
 * @param {String} exp
 * @param {Boolean} needSet
 * @return {Function}
 */

exports.parse = function (exp, needSet) {
  exp = exp.trim()
  // try cache
  var hit = expressionCache.get(exp)
  if (hit) {
    if (needSet) {
      checkSetter(hit)
    }
    return hit
  }
  // we do a simple path check to optimize for them.
  // the check fails valid paths with unusal whitespaces,
  // but that's too rare and we don't care.
  var res = pathTestRE.test(exp)
    ? compilePathFns(exp)
    : compileExpFns(exp, needSet)
  expressionCache.put(exp, res)
  return res
}

// Export the pathRegex for external use
exports.pathTestRE = pathTestRE
},{"../cache":9,"../util":59,"./path":49}],49:[function(require,module,exports){
var _ = require('../util')
var Cache = require('../cache')
var pathCache = new Cache(1000)
var identRE = /^[$_a-zA-Z]+[\w$]*$/

/**
 * Path-parsing algorithm scooped from Polymer/observe-js
 */

var pathStateMachine = {
  'beforePath': {
    'ws': ['beforePath'],
    'ident': ['inIdent', 'append'],
    '[': ['beforeElement'],
    'eof': ['afterPath']
  },

  'inPath': {
    'ws': ['inPath'],
    '.': ['beforeIdent'],
    '[': ['beforeElement'],
    'eof': ['afterPath']
  },

  'beforeIdent': {
    'ws': ['beforeIdent'],
    'ident': ['inIdent', 'append']
  },

  'inIdent': {
    'ident': ['inIdent', 'append'],
    '0': ['inIdent', 'append'],
    'number': ['inIdent', 'append'],
    'ws': ['inPath', 'push'],
    '.': ['beforeIdent', 'push'],
    '[': ['beforeElement', 'push'],
    'eof': ['afterPath', 'push']
  },

  'beforeElement': {
    'ws': ['beforeElement'],
    '0': ['afterZero', 'append'],
    'number': ['inIndex', 'append'],
    "'": ['inSingleQuote', 'append', ''],
    '"': ['inDoubleQuote', 'append', '']
  },

  'afterZero': {
    'ws': ['afterElement', 'push'],
    ']': ['inPath', 'push']
  },

  'inIndex': {
    '0': ['inIndex', 'append'],
    'number': ['inIndex', 'append'],
    'ws': ['afterElement'],
    ']': ['inPath', 'push']
  },

  'inSingleQuote': {
    "'": ['afterElement'],
    'eof': 'error',
    'else': ['inSingleQuote', 'append']
  },

  'inDoubleQuote': {
    '"': ['afterElement'],
    'eof': 'error',
    'else': ['inDoubleQuote', 'append']
  },

  'afterElement': {
    'ws': ['afterElement'],
    ']': ['inPath', 'push']
  }
}

function noop () {}

/**
 * Determine the type of a character in a keypath.
 *
 * @param {Char} char
 * @return {String} type
 */

function getPathCharType (char) {
  if (char === undefined) {
    return 'eof'
  }

  var code = char.charCodeAt(0)

  switch(code) {
    case 0x5B: // [
    case 0x5D: // ]
    case 0x2E: // .
    case 0x22: // "
    case 0x27: // '
    case 0x30: // 0
      return char

    case 0x5F: // _
    case 0x24: // $
      return 'ident'

    case 0x20: // Space
    case 0x09: // Tab
    case 0x0A: // Newline
    case 0x0D: // Return
    case 0xA0:  // No-break space
    case 0xFEFF:  // Byte Order Mark
    case 0x2028:  // Line Separator
    case 0x2029:  // Paragraph Separator
      return 'ws'
  }

  // a-z, A-Z
  if ((0x61 <= code && code <= 0x7A) ||
      (0x41 <= code && code <= 0x5A)) {
    return 'ident'
  }

  // 1-9
  if (0x31 <= code && code <= 0x39) {
    return 'number'
  }

  return 'else'
}

/**
 * Parse a string path into an array of segments
 * Todo implement cache
 *
 * @param {String} path
 * @return {Array|undefined}
 */

function parsePath (path) {
  var keys = []
  var index = -1
  var mode = 'beforePath'
  var c, newChar, key, type, transition, action, typeMap

  var actions = {
    push: function() {
      if (key === undefined) {
        return
      }
      keys.push(key)
      key = undefined
    },
    append: function() {
      if (key === undefined) {
        key = newChar
      } else {
        key += newChar
      }
    }
  }

  function maybeUnescapeQuote () {
    var nextChar = path[index + 1]
    if ((mode === 'inSingleQuote' && nextChar === "'") ||
        (mode === 'inDoubleQuote' && nextChar === '"')) {
      index++
      newChar = nextChar
      actions.append()
      return true
    }
  }

  while (mode) {
    index++
    c = path[index]

    if (c === '\\' && maybeUnescapeQuote()) {
      continue
    }

    type = getPathCharType(c)
    typeMap = pathStateMachine[mode]
    transition = typeMap[type] || typeMap['else'] || 'error'

    if (transition === 'error') {
      return // parse error
    }

    mode = transition[0]
    action = actions[transition[1]] || noop
    newChar = transition[2] === undefined
      ? c
      : transition[2]
    action()

    if (mode === 'afterPath') {
      return keys
    }
  }
}

/**
 * Format a accessor segment based on its type.
 *
 * @param {String} key
 * @return {Boolean}
 */

function formatAccessor(key) {
  if (identRE.test(key)) { // identifier
    return '.' + key
  } else if (+key === key >>> 0) { // bracket index
    return '[' + key + ']'
  } else { // bracket string
    return '["' + key.replace(/"/g, '\\"') + '"]'
  }
}

/**
 * Compiles a getter function with a fixed path.
 *
 * @param {Array} path
 * @return {Function}
 */

exports.compileGetter = function (path) {
  var body =
    'try{return o' +
    path.map(formatAccessor).join('') +
    '}catch(e){};'
  return new Function('o', body)
}

/**
 * External parse that check for a cache hit first
 *
 * @param {String} path
 * @return {Array|undefined}
 */

exports.parse = function (path) {
  var hit = pathCache.get(path)
  if (!hit) {
    hit = parsePath(path)
    if (hit) {
      hit.get = exports.compileGetter(hit)
      pathCache.put(path, hit)
    }
  }
  return hit
}

/**
 * Get from an object from a path string
 *
 * @param {Object} obj
 * @param {String} path
 */

exports.get = function (obj, path) {
  path = exports.parse(path)
  if (path) {
    return path.get(obj)
  }
}

/**
 * Set on an object from a path
 *
 * @param {Object} obj
 * @param {String | Array} path
 * @param {*} val
 */

exports.set = function (obj, path, val) {
  if (typeof path === 'string') {
    path = exports.parse(path)
  }
  if (!path || !_.isObject(obj)) {
    return false
  }
  var last, key
  for (var i = 0, l = path.length - 1; i < l; i++) {
    last = obj
    key = path[i]
    obj = obj[key]
    if (!_.isObject(obj)) {
      obj = {}
      last.$add(key, obj)
    }
  }
  key = path[i]
  if (key in obj) {
    obj[key] = val
  } else {
    obj.$add(key, val)
  }
  return true
}
},{"../cache":9,"../util":59}],50:[function(require,module,exports){
var _ = require('../util')
var Cache = require('../cache')
var templateCache = new Cache(1000)
var idSelectorCache = new Cache(1000)

var map = {
  _default : [0, '', ''],
  legend   : [1, '<fieldset>', '</fieldset>'],
  tr       : [2, '<table><tbody>', '</tbody></table>'],
  col      : [
    2,
    '<table><tbody></tbody><colgroup>',
    '</colgroup></table>'
  ]
}

map.td =
map.th = [
  3,
  '<table><tbody><tr>',
  '</tr></tbody></table>'
]

map.option =
map.optgroup = [
  1,
  '<select multiple="multiple">',
  '</select>'
]

map.thead =
map.tbody =
map.colgroup =
map.caption =
map.tfoot = [1, '<table>', '</table>']

map.g =
map.defs =
map.symbol =
map.use =
map.image =
map.text =
map.circle =
map.ellipse =
map.line =
map.path =
map.polygon =
map.polyline =
map.rect = [
  1,
  '<svg ' +
    'xmlns="http://www.w3.org/2000/svg" ' +
    'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    'xmlns:ev="http://www.w3.org/2001/xml-events"' +
    'version="1.1">',
  '</svg>'
]

var tagRE = /<([\w:]+)/
var entityRE = /&\w+;/

/**
 * Convert a string template to a DocumentFragment.
 * Determines correct wrapping by tag types. Wrapping
 * strategy found in jQuery & component/domify.
 *
 * @param {String} templateString
 * @return {DocumentFragment}
 */

function stringToFragment (templateString) {
  // try a cache hit first
  var hit = templateCache.get(templateString)
  if (hit) {
    return hit
  }

  var frag = document.createDocumentFragment()
  var tagMatch = templateString.match(tagRE)
  var entityMatch = entityRE.test(templateString)

  if (!tagMatch && !entityMatch) {
    // text only, return a single text node.
    frag.appendChild(
      document.createTextNode(templateString)
    )
  } else {

    var tag    = tagMatch && tagMatch[1]
    var wrap   = map[tag] || map._default
    var depth  = wrap[0]
    var prefix = wrap[1]
    var suffix = wrap[2]
    var node   = document.createElement('div')

    node.innerHTML = prefix + templateString.trim() + suffix
    while (depth--) {
      node = node.lastChild
    }

    var child
    /* jshint boss:true */
    while (child = node.firstChild) {
      frag.appendChild(child)
    }
  }

  templateCache.put(templateString, frag)
  return frag
}

/**
 * Convert a template node to a DocumentFragment.
 *
 * @param {Node} node
 * @return {DocumentFragment}
 */

function nodeToFragment (node) {
  var tag = node.tagName
  // if its a template tag and the browser supports it,
  // its content is already a document fragment.
  if (
    tag === 'TEMPLATE' &&
    node.content instanceof DocumentFragment
  ) {
    return node.content
  }
  return tag === 'SCRIPT'
    ? stringToFragment(node.textContent)
    : stringToFragment(node.innerHTML)
}

// Test for the presence of the Safari template cloning bug
// https://bugs.webkit.org/show_bug.cgi?id=137755
var hasBrokenTemplate = _.inBrowser
  ? (function () {
      var a = document.createElement('div')
      a.innerHTML = '<template>1</template>'
      return !a.cloneNode(true).firstChild.innerHTML
    })()
  : false

// Test for IE10/11 textarea placeholder clone bug
var hasTextareaCloneBug = _.inBrowser
  ? (function () {
      var t = document.createElement('textarea')
      t.placeholder = 't'
      return t.cloneNode(true).value === 't'
    })()
  : false

/**
 * 1. Deal with Safari cloning nested <template> bug by
 *    manually cloning all template instances.
 * 2. Deal with IE10/11 textarea placeholder bug by setting
 *    the correct value after cloning.
 *
 * @param {Element|DocumentFragment} node
 * @return {Element|DocumentFragment}
 */

exports.clone = function (node) {
  var res = node.cloneNode(true)
  var i, original, cloned
  /* istanbul ignore if */
  if (hasBrokenTemplate) {
    original = node.querySelectorAll('template')
    if (original.length) {
      cloned = res.querySelectorAll('template')
      i = cloned.length
      while (i--) {
        cloned[i].parentNode.replaceChild(
          original[i].cloneNode(true),
          cloned[i]
        )
      }
    }
  }
  /* istanbul ignore if */
  if (hasTextareaCloneBug) {
    if (node.tagName === 'TEXTAREA') {
      res.value = node.value
    } else {
      original = node.querySelectorAll('textarea')
      if (original.length) {
        cloned = res.querySelectorAll('textarea')
        i = cloned.length
        while (i--) {
          cloned[i].value = original[i].value
        }
      }
    }
  }
  return res
}

/**
 * Process the template option and normalizes it into a
 * a DocumentFragment that can be used as a partial or a
 * instance template.
 *
 * @param {*} template
 *    Possible values include:
 *    - DocumentFragment object
 *    - Node object of type Template
 *    - id selector: '#some-template-id'
 *    - template string: '<div><span>{{msg}}</span></div>'
 * @param {Boolean} clone
 * @param {Boolean} noSelector
 * @return {DocumentFragment|undefined}
 */

exports.parse = function (template, clone, noSelector) {
  var node, frag

  // if the template is already a document fragment,
  // do nothing
  if (template instanceof DocumentFragment) {
    return clone
      ? template.cloneNode(true)
      : template
  }

  if (typeof template === 'string') {
    // id selector
    if (!noSelector && template.charAt(0) === '#') {
      // id selector can be cached too
      frag = idSelectorCache.get(template)
      if (!frag) {
        node = document.getElementById(template.slice(1))
        if (node) {
          frag = nodeToFragment(node)
          // save selector to cache
          idSelectorCache.put(template, frag)
        }
      }
    } else {
      // normal string template
      frag = stringToFragment(template)
    }
  } else if (template.nodeType) {
    // a direct node
    frag = nodeToFragment(template)
  }

  return frag && clone
    ? exports.clone(frag)
    : frag
}
},{"../cache":9,"../util":59}],51:[function(require,module,exports){
var Cache = require('../cache')
var config = require('../config')
var dirParser = require('./directive')
var regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g
var cache, tagRE, htmlRE, firstChar, lastChar

/**
 * Escape a string so it can be used in a RegExp
 * constructor.
 *
 * @param {String} str
 */

function escapeRegex (str) {
  return str.replace(regexEscapeRE, '\\$&')
}

/**
 * Compile the interpolation tag regex.
 *
 * @return {RegExp}
 */

function compileRegex () {
  config._delimitersChanged = false
  var open = config.delimiters[0]
  var close = config.delimiters[1]
  firstChar = open.charAt(0)
  lastChar = close.charAt(close.length - 1)
  var firstCharRE = escapeRegex(firstChar)
  var lastCharRE = escapeRegex(lastChar)
  var openRE = escapeRegex(open)
  var closeRE = escapeRegex(close)
  tagRE = new RegExp(
    firstCharRE + '?' + openRE +
    '(.+?)' +
    closeRE + lastCharRE + '?',
    'g'
  )
  htmlRE = new RegExp(
    '^' + firstCharRE + openRE +
    '.*' +
    closeRE + lastCharRE + '$'
  )
  // reset cache
  cache = new Cache(1000)
}

/**
 * Parse a template text string into an array of tokens.
 *
 * @param {String} text
 * @return {Array<Object> | null}
 *               - {String} type
 *               - {String} value
 *               - {Boolean} [html]
 *               - {Boolean} [oneTime]
 */

exports.parse = function (text) {
  if (config._delimitersChanged) {
    compileRegex()
  }
  var hit = cache.get(text)
  if (hit) {
    return hit
  }
  if (!tagRE.test(text)) {
    return null
  }
  var tokens = []
  var lastIndex = tagRE.lastIndex = 0
  var match, index, value, first, oneTime, partial
  /* jshint boss:true */
  while (match = tagRE.exec(text)) {
    index = match.index
    // push text token
    if (index > lastIndex) {
      tokens.push({
        value: text.slice(lastIndex, index)
      })
    }
    // tag token
    first = match[1].charCodeAt(0)
    oneTime = first === 0x2A // *
    partial = first === 0x3E // >
    value = (oneTime || partial)
      ? match[1].slice(1)
      : match[1]
    tokens.push({
      tag: true,
      value: value.trim(),
      html: htmlRE.test(match[0]),
      oneTime: oneTime,
      partial: partial
    })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    tokens.push({
      value: text.slice(lastIndex)
    })
  }
  cache.put(text, tokens)
  return tokens
}

/**
 * Format a list of tokens into an expression.
 * e.g. tokens parsed from 'a {{b}} c' can be serialized
 * into one single expression as '"a " + b + " c"'.
 *
 * @param {Array} tokens
 * @param {Vue} [vm]
 * @return {String}
 */

exports.tokensToExp = function (tokens, vm) {
  return tokens.length > 1
    ? tokens.map(function (token) {
        return formatToken(token, vm)
      }).join('+')
    : formatToken(tokens[0], vm, true)
}

/**
 * Format a single token.
 *
 * @param {Object} token
 * @param {Vue} [vm]
 * @param {Boolean} single
 * @return {String}
 */

function formatToken (token, vm, single) {
  return token.tag
    ? vm && token.oneTime
      ? '"' + vm.$eval(token.value) + '"'
      : single
        ? token.value
        : inlineFilters(token.value)
    : '"' + token.value + '"'
}

/**
 * For an attribute with multiple interpolation tags,
 * e.g. attr="some-{{thing | filter}}", in order to combine
 * the whole thing into a single watchable expression, we
 * have to inline those filters. This function does exactly
 * that. This is a bit hacky but it avoids heavy changes
 * to directive parser and watcher mechanism.
 *
 * @param {String} exp
 * @return {String}
 */

var filterRE = /[^|]\|[^|]/
function inlineFilters (exp) {
  if (!filterRE.test(exp)) {
    return '(' + exp + ')'
  } else {
    var dir = dirParser.parse(exp)[0]
    if (!dir.filters) {
      return '(' + exp + ')'
    } else {
      exp = dir.expression
      for (var i = 0, l = dir.filters.length; i < l; i++) {
        var filter = dir.filters[i]
        var args = filter.args
          ? ',"' + filter.args.join('","') + '"'
          : ''
        exp = 'this.$options.filters["' + filter.name + '"]' +
          '.apply(this,[' + exp + args + '])'
      }
      return exp
    }
  }
}
},{"../cache":9,"../config":12,"./directive":47}],52:[function(require,module,exports){
var _ = require('../util')
var addClass = _.addClass
var removeClass = _.removeClass
var transDurationProp = _.transitionProp + 'Duration'
var animDurationProp = _.animationProp + 'Duration'

var queue = []
var queued = false

/**
 * Push a job into the transition queue, which is to be
 * executed on next frame.
 *
 * @param {Element} el    - target element
 * @param {Number} dir    - 1: enter, -1: leave
 * @param {Function} op   - the actual dom operation
 * @param {String} cls    - the className to remove when the
 *                          transition is done.
 * @param {Function} [cb] - user supplied callback.
 */

function push (el, dir, op, cls, cb) {
  queue.push({
    el  : el,
    dir : dir,
    cb  : cb,
    cls : cls,
    op  : op
  })
  if (!queued) {
    queued = true
    _.nextTick(flush)
  }
}

/**
 * Flush the queue, and do one forced reflow before
 * triggering transitions.
 */

function flush () {
  /* jshint unused: false */
  var f = document.documentElement.offsetHeight
  queue.forEach(run)
  queue = []
  queued = false
}

/**
 * Run a transition job.
 *
 * @param {Object} job
 */

function run (job) {

  var el = job.el
  var data = el.__v_trans
  var cls = job.cls
  var cb = job.cb
  var op = job.op
  var transitionType = getTransitionType(el, data, cls)

  if (job.dir > 0) { // ENTER
    if (transitionType === 1) {
      // trigger transition by removing enter class
      removeClass(el, cls)
      // only need to listen for transitionend if there's
      // a user callback
      if (cb) setupTransitionCb(_.transitionEndEvent)
    } else if (transitionType === 2) {
      // animations are triggered when class is added
      // so we just listen for animationend to remove it.
      setupTransitionCb(_.animationEndEvent, function () {
        removeClass(el, cls)
      })
    } else {
      // no transition applicable
      removeClass(el, cls)
      if (cb) cb()
    }
  } else { // LEAVE
    if (transitionType) {
      // leave transitions/animations are both triggered
      // by adding the class, just remove it on end event.
      var event = transitionType === 1
        ? _.transitionEndEvent
        : _.animationEndEvent
      setupTransitionCb(event, function () {
        op()
        removeClass(el, cls)
      })
    } else {
      op()
      removeClass(el, cls)
      if (cb) cb()
    }
  }

  /**
   * Set up a transition end callback, store the callback
   * on the element's __v_trans data object, so we can
   * clean it up if another transition is triggered before
   * the callback is fired.
   *
   * @param {String} event
   * @param {Function} [cleanupFn]
   */

  function setupTransitionCb (event, cleanupFn) {
    data.event = event
    var onEnd = data.callback = function transitionCb (e) {
      if (e.target === el) {
        _.off(el, event, onEnd)
        data.event = data.callback = null
        if (cleanupFn) cleanupFn()
        if (cb) cb()
      }
    }
    _.on(el, event, onEnd)
  }
}

/**
 * Get an element's transition type based on the
 * calculated styles
 *
 * @param {Element} el
 * @param {Object} data
 * @param {String} className
 * @return {Number}
 *         1 - transition
 *         2 - animation
 */

function getTransitionType (el, data, className) {
  var type = data.cache && data.cache[className]
  if (type) return type
  var inlineStyles = el.style
  var computedStyles = window.getComputedStyle(el)
  var transDuration =
    inlineStyles[transDurationProp] ||
    computedStyles[transDurationProp]
  if (transDuration && transDuration !== '0s') {
    type = 1
  } else {
    var animDuration =
      inlineStyles[animDurationProp] ||
      computedStyles[animDurationProp]
    if (animDuration && animDuration !== '0s') {
      type = 2
    }
  }
  if (type) {
    if (!data.cache) data.cache = {}
    data.cache[className] = type
  }
  return type
}

/**
 * Apply CSS transition to an element.
 *
 * @param {Element} el
 * @param {Number} direction - 1: enter, -1: leave
 * @param {Function} op - the actual DOM operation
 * @param {Object} data - target element's transition data
 */

module.exports = function (el, direction, op, data, cb) {
  var prefix = data.id || 'v'
  var enterClass = prefix + '-enter'
  var leaveClass = prefix + '-leave'
  // clean up potential previous unfinished transition
  if (data.callback) {
    _.off(el, data.event, data.callback)
    removeClass(el, enterClass)
    removeClass(el, leaveClass)
    data.event = data.callback = null
  }
  if (direction > 0) { // enter
    addClass(el, enterClass)
    op()
    push(el, direction, null, enterClass, cb)
  } else { // leave
    addClass(el, leaveClass)
    push(el, direction, op, leaveClass, cb)
  }
}
},{"../util":59}],53:[function(require,module,exports){
var _ = require('../util')
var applyCSSTransition = require('./css')
var applyJSTransition = require('./js')

/**
 * Append with transition.
 *
 * @oaram {Element} el
 * @param {Element} target
 * @param {Vue} vm
 * @param {Function} [cb]
 */

exports.append = function (el, target, vm, cb) {
  apply(el, 1, function () {
    target.appendChild(el)
  }, vm, cb)
}

/**
 * InsertBefore with transition.
 *
 * @oaram {Element} el
 * @param {Element} target
 * @param {Vue} vm
 * @param {Function} [cb]
 */

exports.before = function (el, target, vm, cb) {
  apply(el, 1, function () {
    _.before(el, target)
  }, vm, cb)
}

/**
 * Remove with transition.
 *
 * @oaram {Element} el
 * @param {Vue} vm
 * @param {Function} [cb]
 */

exports.remove = function (el, vm, cb) {
  apply(el, -1, function () {
    _.remove(el)
  }, vm, cb)
}

/**
 * Remove by appending to another parent with transition.
 * This is only used in block operations.
 *
 * @oaram {Element} el
 * @param {Element} target
 * @param {Vue} vm
 * @param {Function} [cb]
 */

exports.removeThenAppend = function (el, target, vm, cb) {
  apply(el, -1, function () {
    target.appendChild(el)
  }, vm, cb)
}

/**
 * Append the childNodes of a fragment to target.
 *
 * @param {DocumentFragment} block
 * @param {Node} target
 * @param {Vue} vm
 */

exports.blockAppend = function (block, target, vm) {
  var nodes = _.toArray(block.childNodes)
  for (var i = 0, l = nodes.length; i < l; i++) {
    exports.before(nodes[i], target, vm)
  }
}

/**
 * Remove a block of nodes between two edge nodes.
 *
 * @param {Node} start
 * @param {Node} end
 * @param {Vue} vm
 */

exports.blockRemove = function (start, end, vm) {
  var node = start.nextSibling
  var next
  while (node !== end) {
    next = node.nextSibling
    exports.remove(node, vm)
    node = next
  }
}

/**
 * Apply transitions with an operation callback.
 *
 * @oaram {Element} el
 * @param {Number} direction
 *                  1: enter
 *                 -1: leave
 * @param {Function} op - the actual DOM operation
 * @param {Vue} vm
 * @param {Function} [cb]
 */

var apply = exports.apply = function (el, direction, op, vm, cb) {
  var transData = el.__v_trans
  if (
    !transData ||
    !vm._isCompiled ||
    // if the vm is being manipulated by a parent directive
    // during the parent's compilation phase, skip the
    // animation.
    (vm.$parent && !vm.$parent._isCompiled)
  ) {
    op()
    if (cb) cb()
    return
  }
  // determine the transition type on the element
  var jsTransition = vm.$options.transitions[transData.id]
  if (jsTransition) {
    // js
    applyJSTransition(
      el,
      direction,
      op,
      transData,
      jsTransition,
      vm,
      cb
    )
  } else if (_.transitionEndEvent) {
    // css
    applyCSSTransition(
      el,
      direction,
      op,
      transData,
      cb
    )
  } else {
    // not applicable
    op()
    if (cb) cb()
  }
}
},{"../util":59,"./css":52,"./js":54}],54:[function(require,module,exports){
/**
 * Apply JavaScript enter/leave functions.
 *
 * @param {Element} el
 * @param {Number} direction - 1: enter, -1: leave
 * @param {Function} op - the actual DOM operation
 * @param {Object} data - target element's transition data
 * @param {Object} def - transition definition object
 * @param {Vue} vm - the owner vm of the element
 * @param {Function} [cb]
 */

module.exports = function (el, direction, op, data, def, vm, cb) {
  if (data.cancel) {
    data.cancel()
    data.cancel = null
  }
  if (direction > 0) { // enter
    if (def.beforeEnter) {
      def.beforeEnter.call(vm, el)
    }
    op()
    if (def.enter) {
      data.cancel = def.enter.call(vm, el, function () {
        data.cancel = null
        if (cb) cb()
      })
    } else if (cb) {
      cb()
    }
  } else { // leave
    if (def.leave) {
      data.cancel = def.leave.call(vm, el, function () {
        data.cancel = null
        op()
        if (cb) cb()
      })
    } else {
      op()
      if (cb) cb()
    }
  }
}
},{}],55:[function(require,module,exports){
var config = require('../config')

/**
 * Enable debug utilities. The enableDebug() function and
 * all _.log() & _.warn() calls will be dropped in the
 * minified production build.
 */

enableDebug()

function enableDebug () {
  var hasConsole = typeof console !== 'undefined'
  
  /**
   * Log a message.
   *
   * @param {String} msg
   */

  exports.log = function (msg) {
    if (hasConsole && config.debug) {
      console.log('[Vue info]: ' + msg)
    }
  }

  /**
   * We've got a problem here.
   *
   * @param {String} msg
   */

  exports.warn = function (msg) {
    if (hasConsole && !config.silent) {
      console.warn('[Vue warn]: ' + msg)
      /* istanbul ignore if */
      if (config.debug) {
        /* jshint debug: true */
        debugger
      } else {
        console.log(
          'Set `Vue.config.debug = true` to enable debug mode.'
        )
      }
    }
  }

  /**
   * Assert asset exists
   */

  exports.assertAsset = function (val, type, id) {
    if (!val) {
      exports.warn('Failed to resolve ' + type + ': ' + id)
    }
  }
}
},{"../config":12}],56:[function(require,module,exports){
var config = require('../config')

/**
 * Check if a node is in the document.
 *
 * @param {Node} node
 * @return {Boolean}
 */

var doc =
  typeof document !== 'undefined' &&
  document.documentElement

exports.inDoc = function (node) {
  return doc && doc.contains(node)
}

/**
 * Extract an attribute from a node.
 *
 * @param {Node} node
 * @param {String} attr
 */

exports.attr = function (node, attr) {
  attr = config.prefix + attr
  var val = node.getAttribute(attr)
  if (val !== null) {
    node.removeAttribute(attr)
  }
  return val
}

/**
 * Insert el before target
 *
 * @param {Element} el
 * @param {Element} target 
 */

exports.before = function (el, target) {
  target.parentNode.insertBefore(el, target)
}

/**
 * Insert el after target
 *
 * @param {Element} el
 * @param {Element} target 
 */

exports.after = function (el, target) {
  if (target.nextSibling) {
    exports.before(el, target.nextSibling)
  } else {
    target.parentNode.appendChild(el)
  }
}

/**
 * Remove el from DOM
 *
 * @param {Element} el
 */

exports.remove = function (el) {
  el.parentNode.removeChild(el)
}

/**
 * Prepend el to target
 *
 * @param {Element} el
 * @param {Element} target 
 */

exports.prepend = function (el, target) {
  if (target.firstChild) {
    exports.before(el, target.firstChild)
  } else {
    target.appendChild(el)
  }
}

/**
 * Replace target with el
 *
 * @param {Element} target
 * @param {Element} el
 */

exports.replace = function (target, el) {
  var parent = target.parentNode
  if (parent) {
    parent.replaceChild(el, target)
  }
}

/**
 * Copy attributes from one element to another.
 *
 * @param {Element} from
 * @param {Element} to
 */

exports.copyAttributes = function (from, to) {
  if (from.hasAttributes()) {
    var attrs = from.attributes
    for (var i = 0, l = attrs.length; i < l; i++) {
      var attr = attrs[i]
      to.setAttribute(attr.name, attr.value)
    }
  }
}

/**
 * Add event listener shorthand.
 *
 * @param {Element} el
 * @param {String} event
 * @param {Function} cb
 */

exports.on = function (el, event, cb) {
  el.addEventListener(event, cb)
}

/**
 * Remove event listener shorthand.
 *
 * @param {Element} el
 * @param {String} event
 * @param {Function} cb
 */

exports.off = function (el, event, cb) {
  el.removeEventListener(event, cb)
}

/**
 * Add class with compatibility for IE & SVG
 *
 * @param {Element} el
 * @param {Strong} cls
 */

exports.addClass = function (el, cls) {
  if (el.classList) {
    el.classList.add(cls)
  } else {
    var cur = ' ' + (el.getAttribute('class') || '') + ' '
    if (cur.indexOf(' ' + cls + ' ') < 0) {
      el.setAttribute('class', (cur + cls).trim())
    }
  }
}

/**
 * Remove class with compatibility for IE & SVG
 *
 * @param {Element} el
 * @param {Strong} cls
 */

exports.removeClass = function (el, cls) {
  if (el.classList) {
    el.classList.remove(cls)
  } else {
    var cur = ' ' + (el.getAttribute('class') || '') + ' '
    var tar = ' ' + cls + ' '
    while (cur.indexOf(tar) >= 0) {
      cur = cur.replace(tar, ' ')
    }
    el.setAttribute('class', cur.trim())
  }
}

/**
 * Extract raw content inside an element into a temporary
 * container div
 *
 * @param {Element} el
 * @return {Element}
 */

exports.extractContent = function (el) {
  var child
  var rawContent
  if (el.hasChildNodes()) {
    rawContent = document.createElement('div')
    /* jshint boss:true */
    while (child = el.firstChild) {
      rawContent.appendChild(child)
    }
  }
  return rawContent
}
},{"../config":12}],57:[function(require,module,exports){
/**
 * Can we use __proto__?
 *
 * @type {Boolean}
 */

exports.hasProto = '__proto__' in {}

/**
 * Indicates we have a window
 *
 * @type {Boolean}
 */

var toString = Object.prototype.toString
var inBrowser = exports.inBrowser =
  typeof window !== 'undefined' &&
  toString.call(window) !== '[object Object]'

/**
 * Defer a task to the start of the next event loop
 *
 * @param {Function} cb
 * @param {Object} ctx
 */

var defer = inBrowser
  ? (window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    setTimeout)
  : setTimeout

exports.nextTick = function (cb, ctx) {
  if (ctx) {
    defer(function () { cb.call(ctx) }, 0)
  } else {
    defer(cb, 0)
  }
}

/**
 * Detect if we are in IE9...
 *
 * @type {Boolean}
 */

exports.isIE9 =
  inBrowser &&
  navigator.userAgent.indexOf('MSIE 9.0') > 0

/**
 * Sniff transition/animation events
 */

if (inBrowser && !exports.isIE9) {
  var isWebkitTrans =
    window.ontransitionend === undefined &&
    window.onwebkittransitionend !== undefined
  var isWebkitAnim =
    window.onanimationend === undefined &&
    window.onwebkitanimationend !== undefined
  exports.transitionProp = isWebkitTrans
    ? 'WebkitTransition'
    : 'transition'
  exports.transitionEndEvent = isWebkitTrans
    ? 'webkitTransitionEnd'
    : 'transitionend'
  exports.animationProp = isWebkitAnim
    ? 'WebkitAnimation'
    : 'animation'
  exports.animationEndEvent = isWebkitAnim
    ? 'webkitAnimationEnd'
    : 'animationend'
}
},{}],58:[function(require,module,exports){
var _ = require('./debug')

/**
 * Resolve read & write filters for a vm instance. The
 * filters descriptor Array comes from the directive parser.
 *
 * This is extracted into its own utility so it can
 * be used in multiple scenarios.
 *
 * @param {Vue} vm
 * @param {Array<Object>} filters
 * @param {Object} [target]
 * @return {Object}
 */

exports.resolveFilters = function (vm, filters, target) {
  if (!filters) {
    return
  }
  var res = target || {}
  // var registry = vm.$options.filters
  filters.forEach(function (f) {
    var def = vm.$options.filters[f.name]
    _.assertAsset(def, 'filter', f.name)
    if (!def) return
    var args = f.args
    var reader, writer
    if (typeof def === 'function') {
      reader = def
    } else {
      reader = def.read
      writer = def.write
    }
    if (reader) {
      if (!res.read) res.read = []
      res.read.push(function (value) {
        return args
          ? reader.apply(vm, [value].concat(args))
          : reader.call(vm, value)
      })
    }
    if (writer) {
      if (!res.write) res.write = []
      res.write.push(function (value, oldVal) {
        return args
          ? writer.apply(vm, [value, oldVal].concat(args))
          : writer.call(vm, value, oldVal)
      })
    }
  })
  return res
}

/**
 * Apply filters to a value
 *
 * @param {*} value
 * @param {Array} filters
 * @param {Vue} vm
 * @param {*} oldVal
 * @return {*}
 */

exports.applyFilters = function (value, filters, vm, oldVal) {
  if (!filters) {
    return value
  }
  for (var i = 0, l = filters.length; i < l; i++) {
    value = filters[i].call(vm, value, oldVal)
  }
  return value
}
},{"./debug":55}],59:[function(require,module,exports){
var lang   = require('./lang')
var extend = lang.extend

extend(exports, lang)
extend(exports, require('./env'))
extend(exports, require('./dom'))
extend(exports, require('./filter'))
extend(exports, require('./debug'))
},{"./debug":55,"./dom":56,"./env":57,"./filter":58,"./lang":60}],60:[function(require,module,exports){
/**
 * Check is a string starts with $ or _
 *
 * @param {String} str
 * @return {Boolean}
 */

exports.isReserved = function (str) {
  var c = str.charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

/**
 * Guard text output, make sure undefined outputs
 * empty string
 *
 * @param {*} value
 * @return {String}
 */

exports.toString = function (value) {
  return value == null
    ? ''
    : value.toString()
}

/**
 * Check and convert possible numeric numbers before
 * setting back to data
 *
 * @param {*} value
 * @return {*|Number}
 */

exports.toNumber = function (value) {
  return (
    isNaN(value) ||
    value === null ||
    typeof value === 'boolean'
  ) ? value
    : Number(value)
}

/**
 * Strip quotes from a string
 *
 * @param {String} str
 * @return {String | false}
 */

exports.stripQuotes = function (str) {
  var a = str.charCodeAt(0)
  var b = str.charCodeAt(str.length - 1)
  return a === b && (a === 0x22 || a === 0x27)
    ? str.slice(1, -1)
    : false
}

/**
 * Camelize a hyphen-delmited string.
 *
 * @param {String} str
 * @return {String}
 */

var camelRE = /[-_](\w)/g
var capitalCamelRE = /(?:^|[-_])(\w)/g

exports.camelize = function (str, cap) {
  var RE = cap ? capitalCamelRE : camelRE
  return str.replace(RE, function (_, c) {
    return c ? c.toUpperCase () : ''
  })
}

/**
 * Simple bind, faster than native
 *
 * @param {Function} fn
 * @param {Object} ctx
 * @return {Function}
 */

exports.bind = function (fn, ctx) {
  return function () {
    return fn.apply(ctx, arguments)
  }
}

/**
 * Convert an Array-like object to a real Array.
 *
 * @param {Array-like} list
 * @param {Number} [start] - start index
 * @return {Array}
 */

exports.toArray = function (list, start) {
  start = start || 0
  var i = list.length - start
  var ret = new Array(i)
  while (i--) {
    ret[i] = list[i + start]
  }
  return ret
}

/**
 * Mix properties into target object.
 *
 * @param {Object} to
 * @param {Object} from
 */

exports.extend = function (to, from) {
  for (var key in from) {
    to[key] = from[key]
  }
  return to
}

/**
 * Quick object check - this is primarily used to tell
 * Objects from primitive values when we know the value
 * is a JSON-compliant type.
 *
 * @param {*} obj
 * @return {Boolean}
 */

exports.isObject = function (obj) {
  return obj && typeof obj === 'object'
}

/**
 * Strict object type check. Only returns true
 * for plain JavaScript objects.
 *
 * @param {*} obj
 * @return {Boolean}
 */

var toString = Object.prototype.toString
exports.isPlainObject = function (obj) {
  return toString.call(obj) === '[object Object]'
}

/**
 * Array type check.
 *
 * @param {*} obj
 * @return {Boolean}
 */

exports.isArray = function (obj) {
  return Array.isArray(obj)
}

/**
 * Define a non-enumerable property
 *
 * @param {Object} obj
 * @param {String} key
 * @param {*} val
 * @param {Boolean} [enumerable]
 */

exports.define = function (obj, key, val, enumerable) {
  Object.defineProperty(obj, key, {
    value        : val,
    enumerable   : !!enumerable,
    writable     : true,
    configurable : true
  })
}
},{}],61:[function(require,module,exports){
var _ = require('./index')
var extend = _.extend

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 *
 * All strategy functions follow the same signature:
 *
 * @param {*} parentVal
 * @param {*} childVal
 * @param {Vue} [vm]
 */

var strats = Object.create(null)

/**
 * Helper that recursively merges two data objects together.
 */

function mergeData (to, from) {
  var key, toVal, fromVal
  for (key in from) {
    toVal = to[key]
    fromVal = from[key]
    if (!to.hasOwnProperty(key)) {
      to.$add(key, fromVal)
    } else if (_.isObject(toVal) && _.isObject(fromVal)) {
      mergeData(toVal, fromVal)
    }
  }
  return to
}

/**
 * Data
 */

strats.data = function (parentVal, childVal, vm) {
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    if (!childVal) {
      return parentVal
    }
    if (typeof childVal !== 'function') {
      _.warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.'
      )
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    return function mergedDataFn () {
      return mergeData(
        childVal.call(this),
        parentVal.call(this)
      )
    }
  } else {
    // instance merge, return raw object
    var instanceData = typeof childVal === 'function'
      ? childVal.call(vm)
      : childVal
    var defaultData = typeof parentVal === 'function'
      ? parentVal.call(vm)
      : undefined
    if (instanceData) {
      return mergeData(instanceData, defaultData)
    } else {
      return defaultData
    }
  }
}

/**
 * El
 */

strats.el = function (parentVal, childVal, vm) {
  if (!vm && childVal && typeof childVal !== 'function') {
    _.warn(
      'The "el" option should be a function ' +
      'that returns a per-instance value in component ' +
      'definitions.'
    )
    return
  }
  var ret = childVal || parentVal
  // invoke the element factory if this is instance merge
  return vm && typeof ret === 'function'
    ? ret.call(vm)
    : ret
}

/**
 * Hooks and param attributes are merged as arrays.
 */

strats.created =
strats.ready =
strats.attached =
strats.detached =
strats.beforeCompile =
strats.compiled =
strats.beforeDestroy =
strats.destroyed =
strats.paramAttributes = function (parentVal, childVal) {
  return childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : _.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
}

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */

strats.directives =
strats.filters =
strats.partials =
strats.transitions =
strats.components = function (parentVal, childVal, vm, key) {
  var ret = Object.create(
    vm && vm.$parent
      ? vm.$parent.$options[key]
      : _.Vue.options[key]
  )
  if (parentVal) {
    var keys = Object.keys(parentVal)
    var i = keys.length
    var field
    while (i--) {
      field = keys[i]
      ret[field] = parentVal[field]
    }
  }
  if (childVal) extend(ret, childVal)
  return ret
}

/**
 * Events & Watchers.
 *
 * Events & watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */

strats.watch =
strats.events = function (parentVal, childVal) {
  if (!childVal) return parentVal
  if (!parentVal) return childVal
  var ret = {}
  extend(ret, parentVal)
  for (var key in childVal) {
    var parent = ret[key]
    var child = childVal[key]
    ret[key] = parent
      ? parent.concat(child)
      : [child]
  }
  return ret
}

/**
 * Other object hashes.
 */

strats.methods =
strats.computed = function (parentVal, childVal) {
  if (!childVal) return parentVal
  if (!parentVal) return childVal
  var ret = Object.create(parentVal)
  extend(ret, childVal)
  return ret
}

/**
 * Default strategy.
 */

var defaultStrat = function (parentVal, childVal) {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Make sure component options get converted to actual
 * constructors.
 *
 * @param {Object} components
 */

function guardComponents (components) {
  if (components) {
    var def
    for (var key in components) {
      def = components[key]
      if (_.isPlainObject(def)) {
        def.name = key
        components[key] = _.Vue.extend(def)
      }
    }
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 *
 * @param {Object} parent
 * @param {Object} child
 * @param {Vue} [vm] - if vm is present, indicates this is
 *                     an instantiation merge.
 */

module.exports = function mergeOptions (parent, child, vm) {
  guardComponents(child.components)
  var options = {}
  var key
  if (child.mixins) {
    for (var i = 0, l = child.mixins.length; i < l; i++) {
      parent = mergeOptions(parent, child.mixins[i], vm)
    }
  }
  for (key in parent) {
    merge(key)
  }
  for (key in child) {
    if (!(parent.hasOwnProperty(key))) {
      merge(key)
    }
  }
  function merge (key) {
    var strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}
},{"./index":59}],62:[function(require,module,exports){
var _ = require('./util')
var extend = _.extend

/**
 * The exposed Vue constructor.
 *
 * API conventions:
 * - public API methods/properties are prefiexed with `$`
 * - internal methods/properties are prefixed with `_`
 * - non-prefixed properties are assumed to be proxied user
 *   data.
 *
 * @constructor
 * @param {Object} [options]
 * @public
 */

function Vue (options) {
  this._init(options)
}

/**
 * Mixin global API
 */

extend(Vue, require('./api/global'))

/**
 * Vue and every constructor that extends Vue has an
 * associated options object, which can be accessed during
 * compilation steps as `this.constructor.options`.
 *
 * These can be seen as the default options of every
 * Vue instance.
 */

Vue.options = {
  directives  : require('./directives'),
  filters     : require('./filters'),
  partials    : {},
  transitions : {},
  components  : {}
}

/**
 * Build up the prototype
 */

var p = Vue.prototype

/**
 * $data has a setter which does a bunch of
 * teardown/setup work
 */

Object.defineProperty(p, '$data', {
  get: function () {
    return this._data
  },
  set: function (newData) {
    this._setData(newData)
  }
})

/**
 * Mixin internal instance methods
 */

extend(p, require('./instance/init'))
extend(p, require('./instance/events'))
extend(p, require('./instance/scope'))
extend(p, require('./instance/compile'))

/**
 * Mixin public API methods
 */

extend(p, require('./api/data'))
extend(p, require('./api/dom'))
extend(p, require('./api/events'))
extend(p, require('./api/child'))
extend(p, require('./api/lifecycle'))

module.exports = _.Vue = Vue
},{"./api/child":2,"./api/data":3,"./api/dom":4,"./api/events":5,"./api/global":6,"./api/lifecycle":7,"./directives":22,"./filters":38,"./instance/compile":39,"./instance/events":40,"./instance/init":41,"./instance/scope":42,"./util":59}],63:[function(require,module,exports){
var _ = require('./util')
var config = require('./config')
var Observer = require('./observer')
var expParser = require('./parsers/expression')
var batcher = require('./batcher')
var uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 *
 * @param {Vue} vm
 * @param {String} expression
 * @param {Function} cb
 * @param {Object} options
 *                 - {Array} filters
 *                 - {Boolean} twoWay
 *                 - {Boolean} deep
 *                 - {Boolean} user
 * @constructor
 */

function Watcher (vm, expression, cb, options) {
  this.vm = vm
  vm._watcherList.push(this)
  this.expression = expression
  this.cbs = [cb]
  this.id = ++uid // uid for batching
  this.active = true
  options = options || {}
  this.deep = options.deep
  this.user = options.user
  this.deps = Object.create(null)
  // setup filters if any.
  // We delegate directive filters here to the watcher
  // because they need to be included in the dependency
  // collection process.
  if (options.filters) {
    this.readFilters = options.filters.read
    this.writeFilters = options.filters.write
  }
  // parse expression for getter/setter
  var res = expParser.parse(expression, options.twoWay)
  this.getter = res.get
  this.setter = res.set
  this.value = this.get()
}

var p = Watcher.prototype

/**
 * Add a dependency to this directive.
 *
 * @param {Dep} dep
 */

p.addDep = function (dep) {
  var id = dep.id
  if (!this.newDeps[id]) {
    this.newDeps[id] = dep
    if (!this.deps[id]) {
      this.deps[id] = dep
      dep.addSub(this)
    }
  }
}

/**
 * Evaluate the getter, and re-collect dependencies.
 */

p.get = function () {
  this.beforeGet()
  var vm = this.vm
  var value
  try {
    value = this.getter.call(vm, vm)
  } catch (e) {
    _.warn(
      'Error when evaluating expression "' +
      this.expression + '":\n   ' + e
    )
  }
  // "touch" every property so they are all tracked as
  // dependencies for deep watching
  if (this.deep) {
    traverse(value)
  }
  value = _.applyFilters(value, this.readFilters, vm)
  this.afterGet()
  return value
}

/**
 * Set the corresponding value with the setter.
 *
 * @param {*} value
 */

p.set = function (value) {
  var vm = this.vm
  value = _.applyFilters(
    value, this.writeFilters, vm, this.value
  )
  try {
    this.setter.call(vm, vm, value)
  } catch (e) {
    _.warn(
      'Error when evaluating setter "' +
      this.expression + '":\n   ' + e
    )
  }
}

/**
 * Prepare for dependency collection.
 */

p.beforeGet = function () {
  Observer.target = this
  this.newDeps = {}
}

/**
 * Clean up for dependency collection.
 */

p.afterGet = function () {
  Observer.target = null
  for (var id in this.deps) {
    if (!this.newDeps[id]) {
      this.deps[id].removeSub(this)
    }
  }
  this.deps = this.newDeps
}

/**
 * Subscriber interface.
 * Will be called when a dependency changes.
 */

p.update = function () {
  if (!config.async || config.debug) {
    this.run()
  } else {
    batcher.push(this)
  }
}

/**
 * Batcher job interface.
 * Will be called by the batcher.
 */

p.run = function () {
  if (this.active) {
    var value = this.get()
    if (
      (typeof value === 'object' && value !== null) ||
      value !== this.value
    ) {
      var oldValue = this.value
      this.value = value
      var cbs = this.cbs
      for (var i = 0, l = cbs.length; i < l; i++) {
        cbs[i](value, oldValue)
        // if a callback also removed other callbacks,
        // we need to adjust the loop accordingly.
        var removed = l - cbs.length
        if (removed) {
          i -= removed
          l -= removed
        }
      }
    }
  }
}

/**
 * Add a callback.
 *
 * @param {Function} cb
 */

p.addCb = function (cb) {
  this.cbs.push(cb)
}

/**
 * Remove a callback.
 *
 * @param {Function} cb
 */

p.removeCb = function (cb) {
  var cbs = this.cbs
  if (cbs.length > 1) {
    var i = cbs.indexOf(cb)
    if (i > -1) {
      cbs.splice(i, 1)
    }
  } else if (cb === cbs[0]) {
    this.teardown()
  }
}

/**
 * Remove self from all dependencies' subcriber list.
 */

p.teardown = function () {
  if (this.active) {
    // remove self from vm's watcher list
    // we can skip this if the vm if being destroyed
    // which can improve teardown performance.
    if (!this.vm._isBeingDestroyed) {
      var list = this.vm._watcherList
      list.splice(list.indexOf(this))
    }
    for (var id in this.deps) {
      this.deps[id].removeSub(this)
    }
    this.active = false
    this.vm = this.cbs = this.value = null
  }
}


/**
 * Recrusively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 *
 * @param {Object} obj
 */

function traverse (obj) {
  var key, val, i
  for (key in obj) {
    val = obj[key]
    if (_.isArray(val)) {
      i = val.length
      while (i--) traverse(val[i])
    } else if (_.isObject(val)) {
      traverse(val)
    }
  }
}

module.exports = Watcher
},{"./batcher":8,"./config":12,"./observer":45,"./parsers/expression":48,"./util":59}],64:[function(require,module,exports){
module.exports = 'body {\n  position: relative;\n}\nui-blueink {\n  top: 0;\n  right: 0;\n  left: 0;\n  text-align: left;\n}\n';
},{}],65:[function(require,module,exports){
require('insert-css')(require('./semantic-ui/semantic.css'));
require('insert-css')(require('./main.css'));

var Vue = require('vue');
Vue.config.debug = true;
var PouchDB = require('./pouchdb.js');

var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);


Vue.component('ui-blueink', {
  ready: function() {
    document.body.style.top = this.$el.clientHeight + 'px';
  },
  replace: true,
  template: '\
    <ui-blueink class="ui fixed transparent inverted main menu">\
        <menu-pages></menu-pages>\
        <menu-content></menu-content>\
    </ui-blueink>',
  components: {
    'menu-pages': require('./menu-pages'),
    'menu-content': require('./menu-content')
  }
});

window.BlueInk = new Vue({
  el: 'body'
});

},{"./main.css":64,"./menu-content":70,"./menu-pages":75,"./pouchdb.js":77,"./semantic-ui/semantic.css":78,"insert-css":1,"vue":62}],66:[function(require,module,exports){
module.exports = function array_merge () {
    // http://kevin.vanzonneveld.net
    // +   original by: Brett Zamir (http://brett-zamir.me)
    // +   bugfixed by: Nate
    // +   input by: josh
    // +   bugfixed by: Brett Zamir (http://brett-zamir.me)
    // *     example 1: arr1 = {"color": "red", 0: 2, 1: 4}
    // *     example 1: arr2 = {0: "a", 1: "b", "color": "green", "shape": "trapezoid", 2: 4}
    // *     example 1: array_merge(arr1, arr2)
    // *     returns 1: {"color": "green", 0: 2, 1: 4, 2: "a", 3: "b", "shape": "trapezoid", 4: 4}
    // *     example 2: arr1 = []
    // *     example 2: arr2 = {1: "data"}
    // *     example 2: array_merge(arr1, arr2)
    // *     returns 2: {0: "data"}
    
    var args = Array.prototype.slice.call(arguments),
                            retObj = {}, k, j = 0, i = 0, retArr = true;
    
    for (i=0; i < args.length; i++) {
        if (!(args[i] instanceof Array)) {
            retArr=false;
            break;
        }
    }
    
    if (retArr) {
        retArr = [];
        for (i=0; i < args.length; i++) {
            retArr = retArr.concat(args[i]);
        }
        return retArr;
    }
    var ct = 0;
    
    for (i=0, ct=0; i < args.length; i++) {
        if (args[i] instanceof Array) {
            for (j=0; j < args[i].length; j++) {
                retObj[ct++] = args[i][j];
            }
        } else {
            for (k in args[i]) {
                if (args[i].hasOwnProperty(k)) {
                    if (parseInt(k, 10)+'' === k) {
                        retObj[ct++] = args[i][k];
                    } else {
                        retObj[k] = args[i][k];
                    }
                }
            }
        }
    }
    return retObj;
}

function array_merge_recursive (arr1, arr2){
    // http://kevin.vanzonneveld.net
    // +   original by: Subhasis Deb
    // +      input by: Brett Zamir (http://brett-zamir.me)
    // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // -    depends on: array_merge
    // *     example 1: arr1 = {'color': {'favourite': 'read'}, 0: 5}
    // *     example 1: arr2 = {0: 10, 'color': {'favorite': 'green', 0: 'blue'}}
    // *     example 1: array_merge_recursive(arr1, arr2)
    // *     returns 1: {'color': {'favorite': {0: 'red', 1: 'green'}, 0: 'blue'}, 1: 5, 1: 10}

    var idx = '';

    if ((arr1 && (arr1 instanceof Array)) && (arr2 && (arr2 instanceof Array))) {
        for (idx in arr2) {
            arr1.push(arr2[idx]);
        }
    } else if ((arr1 && (arr1 instanceof Object)) && (arr2 && (arr2 instanceof Object))) {
        for (idx in arr2) {
            if (idx in arr1) {
                if (typeof arr1[idx] == 'object' && typeof arr2 == 'object') {
                    arr1[idx] = this.array_merge_recursive(arr1[idx], arr2[idx]);
                } else {
                    arr1[idx] = arr2[idx];
                }
            } else {
                arr1[idx] = arr2[idx];
            }
        }
    }
    
    return arr1;
}

},{}],67:[function(require,module,exports){
var Vue = require('vue');
var array_merge_recursive = require('./array_merge_recursive.js');

// TODO: componentize
var PouchDB = require('../pouchdb.js');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

module.exports = Vue.extend({
  data: function() {
    return {
      schema_name: '',
      schema: {},
      doc_id: '',
      values: {}
    };
  },
  computed: {
    schemaUrl: function() {
      return '_blueink/schemas/' + this.schema_name;
    },
    valuesUrl: function() {
      if (this.doc_id !== undefined) {
        return '_blueink/' + this.doc_id;
      } else {
        // if we don't have an existing doc,
        // set a UUID to avoid duplicate doc creation
        this.doc_id = PouchDB.utils.uuid();
      }
    }
  },
  watch: {
    // TODO: move all this stuff to vue-schema; it's not really modal stuff
    schemaUrl: 'fetchSchema',
    valuesUrl: 'fetchValues'
  },
  replace: true,
  template: require('./template.html'),
  created: function() {
    document.body.style.overflow = 'hidden';
    if (this.schema_name !== '') {
      this.fetchSchema();
    }
    if (this.doc_id !== '') {
      this.fetchValues();
    }
  },
  destroyed: function() {
    document.body.style.overflow = 'auto';
  },
  methods: {
    destroy: function() {
      this.$destroy(true);
    },
    save: function() {
      var self = this;
      var doc = array_merge_recursive(this.$get('values'), this.$.editor.output());
      db.put(doc, this.doc_id, function (err, resp) {
        if (err) {
          alert('Something went wrong. Please try again.');
          console.log(err);
        } else {
          alert('The ' + doc.type + ' was saved successfully!');
          self.$emit('saved', doc.type);
          self.destroy();
        }
      });
    },
    fetchSchema: function () {
      if (!this.schemaUrl) return false;
      var xhr = new XMLHttpRequest(),
          self = this;
      xhr.open('GET', self.schemaUrl);
      xhr.onload = function () {
        self.schema = JSON.parse(xhr.responseText);
      };
      xhr.send();
    },
    fetchValues: function () {
      if (!this.valuesUrl) return false;
      var xhr = new XMLHttpRequest(),
          self = this;
      xhr.open('GET', self.valuesUrl);
      xhr.onload = function () {
        self.values = JSON.parse(xhr.responseText);
      };
      xhr.send();
    }
  },
  components: {
    'vue-schema': require('../vue-schema')
  }
});

},{"../pouchdb.js":77,"../vue-schema":79,"./array_merge_recursive.js":66,"./template.html":68,"vue":62}],68:[function(require,module,exports){
module.exports = '<div class="ui dimmer page visible active" style="overflow: auto">\n  <div style="margin-top: -243.5px;" class="ui fullscreen modal transition visible active scrolling">\n    <div class="header">\n      <div class="ui two column grid">\n        <div class="column">\n          <div class="ui huge header">Add {{schema_name}}</div>\n        </div>\n        <div class="right aligned column">\n          <div class="ui tiny buttons">\n            <div class="ui button"\n              v-on="click: destroy()">\n              Cancel\n            </div>\n            <div class="or"></div>\n            <div class="ui positive button"\n              v-on="click: save()">\n              Save\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n    <div class="content">\n      <vue-schema v-ref="editor"\n        v-with="schema: schema, values: values"></vue-schema>\n    </div>\n    <div class="actions">\n      <div class="ui tiny buttons">\n        <div class="ui button"\n          v-on="click: destroy()">\n          Cancel\n        </div>\n        <div class="or"></div>\n        <div class="ui positive button"\n          v-on="click: save()">\n          Save\n        </div>\n      </div>\n    </div>\n  </div>\n</div>\n';
},{}],69:[function(require,module,exports){
module.exports = 'menu-content .item .label {\n  display:none;\n}\n\nmenu-content .item:hover .label {\n  display:block;\n}\n';
},{}],70:[function(require,module,exports){
require('insert-css')(require('./index.css'));

// TODO: componentize
var PouchDB = require('../pouchdb.js');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

module.exports = {
  replace: true,
  template: require('./template.html'),
  components: {
    'menu-items': require('../menu-items')
  },
  data: function() {
    return {
      types: []
    }
  },
  created: function() {
    var self = this;
    db.query('blueink/by_type?group=true',
    function(err, response) {
      self.types = response.rows;
    });
  }
};

},{"../menu-items":72,"../pouchdb.js":77,"./index.css":69,"./template.html":71,"insert-css":1}],71:[function(require,module,exports){
module.exports = '<menu-content class="section ui dropdown simple link item">\n  <div>Content</div>\n  <ul class="menu">\n    <li class="item" v-repeat="types">{{key}}\n      <span class="ui small bottom right attached label">{{value}}</span>\n      <menu-items type="{{key}}"></menu-items>\n    </li>\n  </ul>\n</menu-content>\n';
},{}],72:[function(require,module,exports){
// TODO: componentize
var PouchDB = require('../pouchdb.js');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

var MakeModal = require('../make-modal');

module.exports = {
  replace: true,
  template: require('./template.html'),
  paramAttributes: ['type'],
  data: function() {
    return {
      type: "",
      items: []
    }
  },
  watch: {
    type: 'loadItems'
  },
  methods: {
    loadItems: function() {
      var self = this;
      db.query('blueink/by_type?reduce=false&key="' + self.type + '"',
      function(err, response) {
        self.items = response.rows;
      });
    },
    openMakeModal: function(doc_id) {
      var self = this;
      var modal = new MakeModal({
        data: {
          schema_name: this.type,
          doc_id: doc_id
        }
      });
      modal.$mount();
      modal.$appendTo('body');
      modal.$on('saved', function(type) {
        self.loadItems();
      });
    }
  }
};

},{"../make-modal":67,"../pouchdb.js":77,"./template.html":73}],73:[function(require,module,exports){
module.exports = '<ul class="menu">\n  <div class="item">\n    <div class="ui primary button"\n      v-on="click: openMakeModal()">new {{type}}</div>\n  </div>\n  <li class="item" v-repeat="items" v-on="click: openMakeModal(id)">\n    {{value}}\n  </li>\n</ul>\n';
},{}],74:[function(require,module,exports){
module.exports = 'menu-pages > nav > h4 {\n  padding: 1em;\n}\n\nmenu-pages > nav > .hide {\n  display: none;\n}\n';
},{}],75:[function(require,module,exports){
require('insert-css')(require('./index.css'));

// TODO: componentize
var PouchDB = require('../pouchdb.js');
var db = new PouchDB(location.protocol + '//' + location.hostname + ':'
    + location.port + '/' + location.pathname.split('/')[1]);

module.exports = {
  replace: true,
  template: require('./template.html'),
  data: function() {
    return {
      pages: []
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
  }
};

},{"../pouchdb.js":77,"./index.css":74,"./template.html":76,"insert-css":1}],76:[function(require,module,exports){
module.exports = '<menu-pages class="section ui dropdown simple link item">\n  <div>Pages</div>\n  <ul class="menu">\n    <li v-repeat="pages">\n      <a class="item" href="{{url}}">{{url}}</a>\n    </li>\n  </ul>\n</menu-pages>\n';
},{}],77:[function(require,module,exports){
(function (global){
//    PouchDB 3.2.0
//    
//    (c) 2012-2014 Dale Harvey and the PouchDB team
//    PouchDB may be freely distributed under the Apache license, version 2.0.
//    For all details and documentation:
//    http://pouchdb.com
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var t;"undefined"!=typeof window?t=window:"undefined"!=typeof global?t=global:"undefined"!=typeof self&&(t=self),t.PouchDB=e()}}(function(){var define,module,exports;return function e(t,n,r){function o(s,a){if(!n[s]){if(!t[s]){var u="function"==typeof require&&require;if(!a&&u)return u(s,!0);if(i)return i(s,!0);var c=new Error("Cannot find module '"+s+"'");throw c.code="MODULE_NOT_FOUND",c}var f=n[s]={exports:{}};t[s][0].call(f.exports,function(e){var n=t[s][1][e];return o(n?n:e)},f,f.exports,e,t,n,r)}return n[s].exports}for(var i="function"==typeof require&&require,s=0;s<r.length;s++)o(r[s]);return o}({1:[function(e,t){"use strict";function n(e,t){for(var n=0;n<e.length;n++)if(t(e[n],n)===!0)return e[n];return!1}function r(e){return function(t,n){t||n[0]&&n[0].error?e(t||n[0]):e(null,n.length?n[0]:n)}}function o(e){var t={},n=[];return u.traverseRevTree(e,function(e,r,o,i){var s=r+"-"+o;return e&&(t[s]=0),void 0!==i&&n.push({from:i,to:s}),s}),n.reverse(),n.forEach(function(e){t[e.from]=void 0===t[e.from]?1+t[e.to]:Math.min(t[e.from],1+t[e.to])}),t}function i(e,t,n){var r="limit"in t?t.keys.slice(t.skip,t.limit+t.skip):t.skip>0?t.keys.slice(t.skip):t.keys;if(t.descending&&r.reverse(),!r.length)return e._allDocs({limit:0},n);var o={offset:t.skip};return h.all(r.map(function(n){var r=a.extend(!0,{key:n,deleted:"ok"},t);return["limit","skip","keys"].forEach(function(e){delete r[e]}),new h(function(t,i){e._allDocs(r,function(e,r){return e?i(e):(o.total_rows=r.total_rows,void t(r.rows[0]||{key:n,error:"not_found"}))})})})).then(function(e){return o.rows=e,o})}function s(){var e=this;f.call(this),e.autoCompact=function(t){return e.auto_compaction&&"http"!==e.type()?function(n,r){if(n)t(n);else{var o=r.length,i=function(){o--,o||t(null,r)};if(!r.length)return t(null,r);r.forEach(function(t){t.ok&&t.id?e.compactDocument(t.id,0,i):i()})}}:t};var t,n=0,r=["change","delete","create","update"];this.on("newListener",function(o){if(~r.indexOf(o)){if(n)return void n++;n++;var i=0;t=this.changes({conflicts:!0,include_docs:!0,continuous:!0,since:"now",onChange:function(t){t.seq<=i||(i=t.seq,e.emit("change",t),t.doc._deleted?e.emit("delete",t):"1"===t.doc._rev.split("-")[0]?e.emit("create",t):e.emit("update",t))}})}}),this.on("removeListener",function(e){~r.indexOf(e)&&(n--,n||t.cancel())})}var a=e("./utils"),u=e("./merge"),c=e("./deps/errors"),f=e("events").EventEmitter,l=e("./deps/upsert"),d=e("./changes"),h=a.Promise;a.inherits(s,f),t.exports=s,s.prototype.post=a.adapterFun("post",function(e,t,n){return"function"==typeof t&&(n=t,t={}),"object"!=typeof e||Array.isArray(e)?n(c.NOT_AN_OBJECT):void this.bulkDocs({docs:[e]},t,this.autoCompact(r(n)))}),s.prototype.put=a.adapterFun("put",a.getArguments(function(e){var t,n,o,i,s=e.shift(),u="_id"in s;if("object"!=typeof s||Array.isArray(s))return(i=e.pop())(c.NOT_AN_OBJECT);for(s=a.clone(s);;)if(t=e.shift(),n=typeof t,"string"!==n||u?"string"!==n||!u||"_rev"in s?"object"===n?o=t:"function"===n&&(i=t):s._rev=t:(s._id=t,u=!0),!e.length)break;o=o||{};var f=a.invalidIdError(s._id);return f?i(f):a.isLocalId(s._id)&&"function"==typeof this._putLocal?s._deleted?this._removeLocal(s,i):this._putLocal(s,i):void this.bulkDocs({docs:[s]},o,this.autoCompact(r(i)))})),s.prototype.putAttachment=a.adapterFun("putAttachment",function(e,t,n,r,o,i){function s(e){return e._attachments=e._attachments||{},e._attachments[t]={content_type:o,data:r},a.put(e)}var a=this;return"function"==typeof o&&(i=o,o=r,r=n,n=null),"undefined"==typeof o&&(o=r,r=n,n=null),a.get(e).then(function(e){if(e._rev!==n)throw c.REV_CONFLICT;return s(e)},function(t){if(t.error===c.MISSING_DOC.error)return s({_id:e});throw t})}),s.prototype.removeAttachment=a.adapterFun("removeAttachment",function(e,t,n,r){var o=this;o.get(e,function(e,i){return e?void r(e):i._rev!==n?void r(c.REV_CONFLICT):i._attachments?(delete i._attachments[t],0===Object.keys(i._attachments).length&&delete i._attachments,void o.put(i,r)):r()})}),s.prototype.remove=a.adapterFun("remove",function(e,t,n,o){var i;"string"==typeof t?(i={_id:e,_rev:t},"function"==typeof n&&(o=n,n={})):(i=e,"function"==typeof t?(o=t,n={}):(o=n,n=t)),n=a.clone(n||{}),n.was_delete=!0;var s={_id:i._id,_rev:i._rev||n.rev};return s._deleted=!0,a.isLocalId(s._id)&&"function"==typeof this._removeLocal?this._removeLocal(i,o):void this.bulkDocs({docs:[s]},n,r(o))}),s.prototype.revsDiff=a.adapterFun("revsDiff",function(e,t,n){function r(e,t){c.has(e)||c.set(e,{missing:[]}),c.get(e).missing.push(t)}function o(t,n){var o=e[t].slice(0);u.traverseRevTree(n,function(e,n,i,s,a){var u=n+"-"+i,c=o.indexOf(u);-1!==c&&(o.splice(c,1),"available"!==a.status&&r(t,u))}),o.forEach(function(e){r(t,e)})}"function"==typeof t&&(n=t,t={}),t=a.clone(t);var i=Object.keys(e);if(!i.length)return n(null,{});var s=0,c=new a.Map;i.map(function(t){this._getRevisionTree(t,function(r,a){if(r&&404===r.status&&"missing"===r.message)c.set(t,{missing:e[t]});else{if(r)return n(r);o(t,a)}if(++s===i.length){var u={};return c.forEach(function(e,t){u[t]=e}),n(null,u)}})},this)}),s.prototype.compactDocument=a.adapterFun("compactDocument",function(e,t,n){var r=this;this._getRevisionTree(e,function(i,s){if(i)return n(i);var a=o(s),c=[],f=[];Object.keys(a).forEach(function(e){a[e]>t&&c.push(e)}),u.traverseRevTree(s,function(e,t,n,r,o){var i=t+"-"+n;"available"===o.status&&-1!==c.indexOf(i)&&f.push(i)}),r._doCompaction(e,f,n)})}),s.prototype.compact=a.adapterFun("compact",function(e,t){"function"==typeof e&&(t=e,e={});var n=this;e=a.clone(e||{}),n.get("_local/compaction")["catch"](function(){return!1}).then(function(r){return"function"==typeof n._compact?(r&&r.last_seq&&(e.last_seq=r.last_seq),n._compact(e,t)):void 0})}),s.prototype._compact=function(e,t){function n(){l(c,"_local/compaction",function(e){return!e.last_seq||e.last_seq<i?(e.last_seq=i,e):!1},t)}function r(){a--,!a&&s&&n()}function o(e){a++,c.compactDocument(e.id,0).then(r,t)}var i,s=!1,a=0,u={returnDocs:!1},c=this;e.last_seq&&(u.since=e.last_seq),c.changes(u).on("change",o).on("complete",function(e){s=!0,i=e.last_seq,a||n()}).on("error",t)},s.prototype.get=a.adapterFun("get",function(e,t,r){function o(){var n=[],o=i.length;return o?void i.forEach(function(i){s.get(e,{rev:i,revs:t.revs,attachments:t.attachments},function(e,t){n.push(e?{missing:i}:{ok:t}),o--,o||r(null,n)})}):r(null,n)}if("function"==typeof t&&(r=t,t={}),"string"!=typeof e)return r(c.INVALID_ID);if(a.isLocalId(e)&&"function"==typeof this._getLocal)return this._getLocal(e,r);var i=[],s=this;if(!t.open_revs)return this._get(e,t,function(e,o){if(t=a.clone(t),e)return r(e);var i=o.doc;if(!i)return r(new Error("no doc!"));var c=o.metadata,f=o.ctx;if(t.conflicts){var l=u.collectConflicts(c);l.length&&(i._conflicts=l)}if(t.revs||t.revs_info){var d=u.rootToLeaf(c.rev_tree),h=n(d,function(e){return-1!==e.ids.map(function(e){return e.id}).indexOf(i._rev.split("-")[1])}),p=h.ids.map(function(e){return e.id}).indexOf(i._rev.split("-")[1])+1,v=h.ids.length-p;if(h.ids.splice(p,v),h.ids.reverse(),t.revs&&(i._revisions={start:h.pos+h.ids.length-1,ids:h.ids.map(function(e){return e.id})}),t.revs_info){var g=h.pos+h.ids.length;i._revs_info=h.ids.map(function(e){return g--,{rev:g+"-"+e.id,status:e.opts.status}})}}if(t.local_seq&&(i._local_seq=o.metadata.seq),t.attachments&&i._attachments){var y=i._attachments,m=Object.keys(y).length;if(0===m)return r(null,i);Object.keys(y).forEach(function(e){this._getAttachment(y[e],{encode:!0,ctx:f},function(t,n){var o=i._attachments[e];o.data=n,delete o.stub,delete o.length,--m||r(null,i)})},s)}else{if(i._attachments)for(var _ in i._attachments)i._attachments.hasOwnProperty(_)&&(i._attachments[_].stub=!0);r(null,i)}});if("all"===t.open_revs)this._getRevisionTree(e,function(e,t){e&&(t=[]),i=u.collectLeaves(t).map(function(e){return e.rev}),o()});else{if(!Array.isArray(t.open_revs))return r(c.error(c.UNKNOWN_ERROR,"function_clause"));i=t.open_revs;for(var f=0;f<i.length;f++){var l=i[f];if("string"!=typeof l||!/^\d+-/.test(l))return r(c.error(c.BAD_REQUEST,"Invalid rev format"))}o()}}),s.prototype.getAttachment=a.adapterFun("getAttachment",function(e,t,n,r){var o=this;n instanceof Function&&(r=n,n={}),n=a.clone(n),this._get(e,n,function(e,i){return e?r(e):i.doc._attachments&&i.doc._attachments[t]?(n.ctx=i.ctx,void o._getAttachment(i.doc._attachments[t],n,r)):r(c.MISSING_DOC)})}),s.prototype.allDocs=a.adapterFun("allDocs",function(e,t){if("function"==typeof e&&(t=e,e={}),e=a.clone(e),e.skip="undefined"!=typeof e.skip?e.skip:0,"keys"in e){if(!Array.isArray(e.keys))return t(new TypeError("options.keys must be an array"));var n=["startkey","endkey","key"].filter(function(t){return t in e})[0];if(n)return void t(c.error(c.QUERY_PARSE_ERROR,"Query parameter `"+n+"` is not compatible with multi-get"));if("http"!==this.type())return i(this,e,t)}return this._allDocs(e,t)}),s.prototype.changes=function(e,t){return"function"==typeof e&&(t=e,e={}),new d(this,e,t)},s.prototype.close=a.adapterFun("close",function(e){return this._closed=!0,this._close(e)}),s.prototype.info=a.adapterFun("info",function(e){var t=this;this._info(function(n,r){return n?e(n):(r.db_name=r.db_name||t._db_name,r.auto_compaction=!(!t._auto_compaction||"http"===t.type()),void e(null,r))})}),s.prototype.id=a.adapterFun("id",function(e){return this._id(e)}),s.prototype.type=function(){return"function"==typeof this._type?this._type():this.adapter},s.prototype.bulkDocs=a.adapterFun("bulkDocs",function(e,t,n){if("function"==typeof t&&(n=t,t={}),t=a.clone(t),Array.isArray(e)&&(e={docs:e}),!e||!e.docs||!Array.isArray(e.docs))return n(c.MISSING_BULK_DOCS);for(var r=0;r<e.docs.length;++r)if("object"!=typeof e.docs[r]||Array.isArray(e.docs[r]))return n(c.NOT_AN_OBJECT);return e=a.clone(e),"new_edits"in t||(t.new_edits="new_edits"in e?e.new_edits:!0),t.new_edits||"http"===this.type()||e.docs.sort(function(e,t){var n=a.compare(e._id,t._id);if(0!==n)return n;var r=e._revisions?e._revisions.start:0,o=t._revisions?t._revisions.start:0;return a.compare(r,o)}),e.docs.forEach(function(e){e._deleted&&delete e._attachments}),this._bulkDocs(e,t,this.autoCompact(function(e,r){return e?n(e):(t.new_edits||(r=r.filter(function(e){return e.error})),void n(null,r))}))}),s.prototype.registerDependentDatabase=a.adapterFun("registerDependentDatabase",function(e,t){function n(t){return t.dependentDbs=t.dependentDbs||{},t.dependentDbs[e]?!1:(t.dependentDbs[e]=!0,t)}var r={};this.__opts.db&&(r.db=this.__opts.db),this._adapter&&(r.adapter=this._adapter);var o=new this.constructor(e,r);l(this,"_local/_pouch_dependentDbs",n,function(e){return e?t(e):t(null,{db:o})})})},{"./changes":6,"./deps/errors":12,"./deps/upsert":16,"./merge":20,"./utils":25,events:33}],2:[function(e,t){(function(n,r){"use strict";function o(e){return/^_(design|local)/.test(e)?e:encodeURIComponent(e)}function i(e){return e._attachments&&Object.keys(e._attachments)?d.Promise.all(Object.keys(e._attachments).map(function(t){var n=e._attachments[t];if(n.data&&"string"!=typeof n.data){if(v)return new d.Promise(function(e){d.readAsBinaryString(n.data,function(t){n.data=d.btoa(t),e()})});n.data=n.data.toString("base64")}})):d.Promise.resolve()}function s(e,t){if(/http(s?):/.test(e)){var n=d.parseUri(e);n.remote=!0,(n.user||n.password)&&(n.auth={username:n.user,password:n.password});var r=n.path.replace(/(^\/|\/$)/g,"").split("/");if(n.db=r.pop(),n.path=r.join("/"),t=t||{},t=d.clone(t),n.headers=t.headers||{},t.auth||n.auth){var o=t.auth||n.auth,i=d.btoa(o.username+":"+o.password);n.headers.Authorization="Basic "+i}return t.headers&&(n.headers=t.headers),n}return{host:"",path:"/",db:e,auth:!1}}function a(e,t){return u(e,e.db+"/"+t)}function u(e,t){if(e.remote){var n=e.path?"/":"";return e.protocol+"://"+e.host+":"+e.port+"/"+e.path+n+t}return"/"+t}function c(e,t){function n(e,t){var n=d.extend({},_,e);return p(n.method+" "+n.url),d.ajax(n,t)}function c(e){return e.split("/").map(encodeURIComponent).join("/")}var g=this;g.getHost=e.getHost?e.getHost:s;var y=g.getHost(e.name,e),m=a(y,"");g.getUrl=function(){return m},g.getHeaders=function(){return d.clone(y.headers)};var _=e.ajax||{};e=d.clone(e);var b=function(){n({headers:y.headers,method:"PUT",url:m},function(e){e&&401===e.status?n({headers:y.headers,method:"HEAD",url:m},function(e){e?t(e):t(null,g)}):e&&412!==e.status?t(e):t(null,g)})};e.skipSetup||n({headers:y.headers,method:"GET",url:m},function(e){e?404===e.status?(d.explain404("PouchDB is just detecting if the remote DB exists."),b()):t(e):t(null,g)}),g.type=function(){return"http"},g.id=d.adapterFun("id",function(e){n({headers:y.headers,method:"GET",url:u(y,"")},function(t,n){var r=n&&n.uuid?n.uuid+y.db:a(y,"");e(null,r)})}),g.request=d.adapterFun("request",function(e,t){e.headers=y.headers,e.url=a(y,e.url),n(e,t)}),g.compact=d.adapterFun("compact",function(e,t){"function"==typeof e&&(t=e,e={}),e=d.clone(e),n({headers:y.headers,url:a(y,"_compact"),method:"POST"},function(){function n(){g.info(function(r,o){o.compact_running?setTimeout(n,e.interval||200):t()})}"function"==typeof t&&n()})}),g._info=function(e){n({headers:y.headers,method:"GET",url:a(y,"")},function(t,n){t?e(t):(n.host=a(y,""),e(null,n))})},g.get=d.adapterFun("get",function(e,t,r){"function"==typeof t&&(r=t,t={}),t=d.clone(t),void 0===t.auto_encode&&(t.auto_encode=!0);var i=[];t.revs&&i.push("revs=true"),t.revs_info&&i.push("revs_info=true"),t.local_seq&&i.push("local_seq=true"),t.open_revs&&("all"!==t.open_revs&&(t.open_revs=JSON.stringify(t.open_revs)),i.push("open_revs="+t.open_revs)),t.attachments&&i.push("attachments=true"),t.rev&&i.push("rev="+t.rev),t.conflicts&&i.push("conflicts="+t.conflicts),i=i.join("&"),i=""===i?"":"?"+i,t.auto_encode&&(e=o(e));var s={headers:y.headers,method:"GET",url:a(y,e+i)},u=e.split("/");(u.length>1&&"_design"!==u[0]&&"_local"!==u[0]||u.length>2&&"_design"===u[0]&&"_local"!==u[0])&&(s.binary=!0),n(s,function(e,t,n){return e?r(e):void r(null,t,n)})}),g.remove=d.adapterFun("remove",function(e,t,r,i){var s;"string"==typeof t?(s={_id:e,_rev:t},"function"==typeof r&&(i=r,r={})):(s=e,"function"==typeof t?(i=t,r={}):(i=r,r=t));var u=s._rev||r.rev;n({headers:y.headers,method:"DELETE",url:a(y,o(s._id))+"?rev="+u},i)}),g.getAttachment=d.adapterFun("getAttachment",function(e,t,n,r){"function"==typeof n&&(r=n,n={}),n=d.clone(n),void 0===n.auto_encode&&(n.auto_encode=!0),n.auto_encode&&(e=o(e)),n.auto_encode=!1,g.get(e+"/"+c(t),n,r)}),g.removeAttachment=d.adapterFun("removeAttachment",function(e,t,r,i){var s=a(y,o(e)+"/"+c(t))+"?rev="+r;n({headers:y.headers,method:"DELETE",url:s},i)}),g.putAttachment=d.adapterFun("putAttachment",function(e,t,i,s,u,f){"function"==typeof u&&(f=u,u=s,s=i,i=null),"undefined"==typeof u&&(u=s,s=i,i=null);var l=o(e)+"/"+c(t),p=a(y,l);if(i&&(p+="?rev="+i),"string"==typeof s){var g;try{g=d.atob(s)}catch(m){return f(d.extend({},h.BAD_ARG,{reason:"Attachments need to be base64 encoded"}))}s=v?d.createBlob([d.fixBinary(g)],{type:u}):g?new r(g,"binary"):""}var _={headers:d.clone(y.headers),method:"PUT",url:p,processData:!1,body:s,timeout:6e4};_.headers["Content-Type"]=u,n(_,f)}),g.put=d.adapterFun("put",d.getArguments(function(e){var t,r,s,u=e.shift(),c="_id"in u,f=e.pop();return"object"!=typeof u||Array.isArray(u)?f(h.NOT_AN_OBJECT):(u=d.clone(u),void i(u).then(function(){for(;;)if(t=e.shift(),r=typeof t,"string"!==r||c?"string"!==r||!c||"_rev"in u?"object"===r&&(s=d.clone(t)):u._rev=t:(u._id=t,c=!0),!e.length)break;s=s||{};var i=d.invalidIdError(u._id);if(i)throw i;var l=[];s&&"undefined"!=typeof s.new_edits&&l.push("new_edits="+s.new_edits),l=l.join("&"),""!==l&&(l="?"+l),n({headers:y.headers,method:"PUT",url:a(y,o(u._id))+l,body:u},function(e,t){return e?f(e):(t.ok=!0,void f(null,t))})})["catch"](f))})),g.post=d.adapterFun("post",function(e,t,n){return"function"==typeof t&&(n=t,t={}),t=d.clone(t),"object"!=typeof e?n(h.NOT_AN_OBJECT):("_id"in e||(e._id=d.uuid()),void g.put(e,t,function(e,t){return e?n(e):(t.ok=!0,void n(null,t))}))}),g._bulkDocs=function(e,t,r){"undefined"!=typeof t.new_edits&&(e.new_edits=t.new_edits),d.Promise.all(e.docs.map(i)).then(function(){n({headers:y.headers,method:"POST",url:a(y,"_bulk_docs"),body:e},function(e,t){return e?r(e):(t.forEach(function(e){e.ok=!0}),void r(null,t))})})["catch"](r)},g.allDocs=d.adapterFun("allDocs",function(e,t){"function"==typeof e&&(t=e,e={}),e=d.clone(e);var r,o=[],i="GET";if(e.conflicts&&o.push("conflicts=true"),e.descending&&o.push("descending=true"),e.include_docs&&o.push("include_docs=true"),e.attachments&&o.push("attachments=true"),e.key&&o.push("key="+encodeURIComponent(JSON.stringify(e.key))),e.startkey&&o.push("startkey="+encodeURIComponent(JSON.stringify(e.startkey))),e.endkey&&o.push("endkey="+encodeURIComponent(JSON.stringify(e.endkey))),"undefined"!=typeof e.inclusive_end&&o.push("inclusive_end="+!!e.inclusive_end),"undefined"!=typeof e.limit&&o.push("limit="+e.limit),"undefined"!=typeof e.skip&&o.push("skip="+e.skip),o=o.join("&"),""!==o&&(o="?"+o),"undefined"!=typeof e.keys){var s="keys="+encodeURIComponent(JSON.stringify(e.keys));s.length+o.length+1<=l?o+=(-1!==o.indexOf("?")?"&":"?")+s:(i="POST",r=JSON.stringify({keys:e.keys}))}n({headers:y.headers,method:i,url:a(y,"_all_docs"+o),body:r},t)}),g._changes=function(e){var t="batch_size"in e?e.batch_size:f;e=d.clone(e),e.timeout=e.timeout||3e4;var r={timeout:e.timeout-5e3},o="undefined"!=typeof e.limit?e.limit:!1;0===o&&(o=1);var i;i="returnDocs"in e?e.returnDocs:!0;var s=o;if(e.style&&(r.style=e.style),(e.include_docs||e.filter&&"function"==typeof e.filter)&&(r.include_docs=!0),e.attachments&&(r.attachments=!0),e.continuous&&(r.feed="longpoll"),e.conflicts&&(r.conflicts=!0),e.descending&&(r.descending=!0),e.filter&&"string"==typeof e.filter&&(r.filter=e.filter,"_view"===e.filter&&e.view&&"string"==typeof e.view&&(r.view=e.view)),e.query_params&&"object"==typeof e.query_params)for(var u in e.query_params)e.query_params.hasOwnProperty(u)&&(r[u]=e.query_params[u]);var c,p="GET";if(e.doc_ids){r.filter="_doc_ids";var v=JSON.stringify(e.doc_ids);v.length<l?r.doc_ids=v:(p="POST",c={doc_ids:e.doc_ids})}if(e.continuous&&g._useSSE)return g.sse(e,r,i);var m,_,b=function(i,u){if(!e.aborted){r.since=i,e.descending?o&&(r.limit=s):r.limit=!o||s>t?t:s;var f="?"+Object.keys(r).map(function(e){return e+"="+r[e]}).join("&"),l={headers:y.headers,method:p,url:a(y,"_changes"+f),timeout:e.timeout,body:c};_=i,e.aborted||(m=n(l,u))}},w=10,E=0,S={results:[]},A=function(n,r){if(!e.aborted){var a=0;if(r&&r.results){a=r.results.length,S.last_seq=r.last_seq;var u={};u.query=e.query_params,r.results=r.results.filter(function(t){s--;var n=d.filterChange(e)(t);return n&&(i&&S.results.push(t),d.call(e.onChange,t)),n})}else if(n)return e.aborted=!0,void d.call(e.complete,n);r&&r.last_seq&&(_=r.last_seq);var c=o&&0>=s||r&&t>a||e.descending;if((!e.continuous||o&&0>=s)&&c)d.call(e.complete,null,S);else{n?E+=1:E=0;var f=1<<E,l=w*f,p=e.maximumWait||3e4;if(l>p)return void d.call(e.complete,n||h.UNKNOWN_ERROR);setTimeout(function(){b(_,A)},l)}}};return b(e.since||0,A),{cancel:function(){e.aborted=!0,m&&m.abort()}}},g.sse=function(e,t,n){function r(t){var r=JSON.parse(t.data);n&&c.results.push(r),c.last_seq=r.seq,d.call(e.onChange,r)}function o(t){return u.removeEventListener("message",r,!1),l===!1?(g._useSSE=!1,void(f=g._changes(e))):(u.close(),void d.call(e.complete,t))}t.feed="eventsource",t.since=e.since||0,t.limit=e.limit,delete t.timeout;var i="?"+Object.keys(t).map(function(e){return e+"="+t[e]}).join("&"),s=a(y,"_changes"+i),u=new EventSource(s),c={results:[],last_seq:!1},f=!1,l=!1;return u.addEventListener("message",r,!1),u.onopen=function(){l=!0},u.onerror=o,{cancel:function(){return f?f.cancel():(u.removeEventListener("message",r,!1),void u.close())}}},g._useSSE=!1,g.revsDiff=d.adapterFun("revsDiff",function(e,t,r){"function"==typeof t&&(r=t,t={}),n({headers:y.headers,method:"POST",url:a(y,"_revs_diff"),body:JSON.stringify(e)},r)}),g._close=function(e){e()},g.destroy=d.adapterFun("destroy",function(e){n({url:a(y,""),method:"DELETE",headers:y.headers},function(t,n){t?(g.emit("error",t),e(t)):(g.emit("destroyed"),e(null,n))})})}var f=25,l=1800,d=e("../utils"),h=e("../deps/errors"),p=e("debug")("pouchdb:http"),v="undefined"==typeof n||n.browser;c.destroy=d.toPromise(function(e,t,n){var r=s(e,t);t=t||{},"function"==typeof t&&(n=t,t={}),t=d.clone(t),t.headers=r.headers,t.method="DELETE",t.url=a(r,"");var o=t.ajax||{};t=d.extend({},t,o),d.ajax(t,n)}),c.valid=function(){return!0},t.exports=c}).call(this,e("_process"),e("buffer").Buffer)},{"../deps/errors":12,"../utils":25,_process:34,buffer:29,debug:35}],3:[function(e,t){(function(n,r){"use strict";function o(e,t,n){try{e.apply(t,n)}catch(r){window.PouchDB&&window.PouchDB.emit("error",r)}}function i(){if(!q.running&&q.queue.length){q.running=!0;var e=q.queue.shift();e.action(function(t,r){o(e.callback,this,[t,r]),q.running=!1,n.nextTick(i)})}}function s(e){return function(t){var n=t.target&&t.target.error&&t.target.error.name||t.target;e(m.error(m.IDB_ERROR,n,t.type))}}function a(e,t,n){var r={data:_.stringify(e)};return r.winningRev=t,r.deletedOrLocal=n?"1":"0",r.id=e.id,r}function u(e){if(!e)return null;if(!e.data)return e;var t=_.parse(e.data);return t.winningRev=e.winningRev,t.deletedOrLocal="1"===e.deletedOrLocal,t}function c(e,t,n,r){n?e?"string"!=typeof e?g.readAsBinaryString(e,function(e){r(g.btoa(e))}):r(e):r(""):e?"string"!=typeof e?r(e):(e=g.fixBinary(atob(e)),r(g.createBlob([e],{type:t}))):r(g.createBlob([""],{type:t}))}function f(e,t,n,r){function o(){++a===s.length&&r&&r()}function i(e,t){var r=e._attachments[t],i=r.digest;n.objectStore(S).get(i).onsuccess=function(e){r.body=e.target.result.body,o()}}var s=Object.keys(e._attachments||{});if(!s.length)return r&&r();var a=0;s.forEach(function(n){t.attachments&&t.include_docs?i(e,n):(e._attachments[n].stub=!0,o())})}function l(e){return g.Promise.all(e.map(function(e){if(e.doc&&e.doc._attachments){var t=Object.keys(e.doc._attachments);return g.Promise.all(t.map(function(t){var n=e.doc._attachments[t];if("body"in n){var r=n.body,o=n.content_type;return new g.Promise(function(i){c(r,o,!0,function(r){e.doc._attachments[t]=g.extend(g.pick(n,["digest","content_type"]),{data:r}),i()})})}}))}}))}function d(e,t){var n=this;q.queue.push({action:function(t){h(n,e,t)},callback:t}),i()}function h(e,t,o){function i(e){var t=e.createObjectStore(w,{keyPath:"id"});t.createIndex("seq","seq",{unique:!0}),e.createObjectStore(E,{autoIncrement:!0}).createIndex("_doc_id_rev","_doc_id_rev",{unique:!0}),e.createObjectStore(S,{keyPath:"digest"}),e.createObjectStore(k,{keyPath:"id",autoIncrement:!1}),e.createObjectStore(x),t.createIndex("deletedOrLocal","deletedOrLocal",{unique:!1}),e.createObjectStore(T,{keyPath:"_id"});var n=e.createObjectStore(A,{autoIncrement:!0});n.createIndex("seq","seq"),n.createIndex("digestSeq","digestSeq",{unique:!0})}function h(e,t){var n=e.objectStore(w);n.createIndex("deletedOrLocal","deletedOrLocal",{unique:!1}),n.openCursor().onsuccess=function(e){var r=e.target.result;if(r){var o=r.value,i=g.isDeleted(o);o.deletedOrLocal=i?"1":"0",n.put(o),r["continue"]()}else t()}}function p(e){e.createObjectStore(T,{keyPath:"_id"}).createIndex("_doc_id_rev","_doc_id_rev",{unique:!0})}function _(e,t){var n=e.objectStore(T),o=e.objectStore(w),i=e.objectStore(E),s=o.openCursor();s.onsuccess=function(e){var s=e.target.result;if(s){var a=s.value,u=a.id,c=g.isLocalId(u),f=y.winningRev(a);if(c){var l=u+"::"+f,d=u+"::",h=u+"::~",p=i.index("_doc_id_rev"),v=r.IDBKeyRange.bound(d,h,!1,!1),m=p.openCursor(v);m.onsuccess=function(e){if(m=e.target.result){var t=m.value;t._doc_id_rev===l&&n.put(t),i["delete"](m.primaryKey),m["continue"]()}else o["delete"](s.primaryKey),s["continue"]()}}else s["continue"]()}else t&&t()}}function q(e){var t=e.createObjectStore(A,{autoIncrement:!0});t.createIndex("seq","seq"),t.createIndex("digestSeq","digestSeq",{unique:!0})}function R(e){var t=e.objectStore(E),n=e.objectStore(S),r=e.objectStore(A),o=n.count();o.onsuccess=function(e){var n=e.target.result;n&&(t.openCursor().onsuccess=function(e){var t=e.target.result;if(t){for(var n=t.value,o=t.primaryKey,i=Object.keys(n._attachments||{}),s={},a=0;a<i.length;a++){var u=n._attachments[i[a]];s[u.digest]=!0}var c=Object.keys(s);for(a=0;a<c.length;a++){var f=c[a];r.put({seq:o,digestSeq:f+"::"+o})}t["continue"]()}})}}function O(e,t,n){function o(){n(null,{total_rows:e,offset:t.skip,rows:I})}var i="startkey"in t?t.startkey:!1,s="endkey"in t?t.endkey:!1,a="key"in t?t.key:!1,c=t.skip||0,d="number"==typeof t.limit?t.limit:-1,h=t.inclusive_end!==!1,p="descending"in t&&t.descending?"prev":null,v=!1;p&&i&&s&&(v=s,s=!1);var _=null;try{i&&s?_=r.IDBKeyRange.bound(i,s,!1,!h):i?_=p?r.IDBKeyRange.upperBound(i):r.IDBKeyRange.lowerBound(i):s?_=p?r.IDBKeyRange.lowerBound(s,!h):r.IDBKeyRange.upperBound(s,!h):a&&(_=r.IDBKeyRange.only(a))}catch(b){return"DataError"===b.name&&0===b.code?n(null,{total_rows:e,offset:t.skip,rows:[]}):n(m.error(m.IDB_ERROR,b.name,b.message))}var A=[w,E];t.attachments&&A.push(S);var k=B.transaction(A,"readonly");k.oncomplete=function(){t.attachments?l(I).then(o):o()};var T=k.objectStore(w),x=p?T.openCursor(_,p):T.openCursor(_),I=[];x.onsuccess=function(e){function n(e,n){var o={id:e.id,key:e.id,value:{rev:i}};t.include_docs&&(o.doc=n,o.doc._rev=i,o.doc._doc_id_rev&&delete o.doc._doc_id_rev,t.conflicts&&(o.doc._conflicts=y.collectConflicts(e)),f(o.doc,t,k));var s=g.isDeleted(e,i);if("ok"===t.deleted)s&&(o.value.deleted=!0,o.doc=null),I.push(o);else if(!s&&c--<=0){if(v){if(h&&o.key<v)return;if(!h&&o.key<=v)return}if(I.push(o),0===--d)return}r["continue"]()}if(e.target.result){var r=e.target.result,o=u(r.value),i=o.winningRev||y.winningRev(o);if(t.include_docs){var s=k.objectStore(E).index("_doc_id_rev"),a=o.id+"::"+i;s.get(a).onsuccess=function(e){n(u(r.value),e.target.result)}}else n(o)}}}function D(e){if(-1!==P)return e(null,P);var t,n=B.transaction([w],"readonly"),o=n.objectStore(w).index("deletedOrLocal");o.count(r.IDBKeyRange.only("0")).onsuccess=function(e){t=e.target.result},n.onerror=s(e),n.oncomplete=function(){P=t,e(null,P)}}var C=t.name,N=null,j=!1,B=null,P=-1;e.type=function(){return"idb"},e._id=g.toPromise(function(e){e(null,N)}),e._bulkDocs=function(t,n,r){function o(){g.processDocs(_,e,q,x,I,h,n)}function i(e){function t(){++n===_.length&&e()}if(!_.length)return e();var n=0;_.forEach(function(e){if(e._id&&g.isLocalId(e._id))return t();var n=e.metadata.id,r=x.objectStore(w).get(n);r.onsuccess=function(e){var r=u(e.target.result);r&&q.set(n,r),t()}})}function c(){if(!R){var e=I.map(function(e){if(!Object.keys(e).length)return{ok:!0};if(e.error)return e;var t=e.metadata,n=y.winningRev(t);return{ok:!0,id:t.id,rev:n}});d.Changes.notify(C),P=-1,r(null,e)}}function f(e,t){var n=x.objectStore([S]).get(e);n.onsuccess=function(n){if(n.target.result)t();else{var r=new Error("unknown stub attachment with digest "+e);r.status=412,t(r)}}}function l(e){function t(){++o===n.length&&e(r)}var n=[];if(_.forEach(function(e){e.data&&e.data._attachments&&Object.keys(e.data._attachments).forEach(function(t){var r=e.data._attachments[t];r.stub&&n.push(r.digest)})}),!n.length)return e();var r,o=0;n.forEach(function(e){f(e,function(e){e&&!r&&(r=e),t()})})}function h(e,t,n,r,o,i){function s(e){l||(e?(l=e,r(l)):d===m.length&&f())}function u(e){d++,s(e)}function c(t,n){function r(){++i===s.length&&n()}function o(n){var o=e.data._attachments[n].digest,i=x.objectStore(A).put({seq:t,digestSeq:o+"::"+t});i.onsuccess=r,i.onerror=function(e){e.preventDefault(),e.stopPropagation(),r()}}var i=0,s=Object.keys(e.data._attachments||{});if(!s.length)return n();for(var a=0;a<s.length;a++)o(s[a])}function f(){function o(o){var s=e.metadata,u=o.target.result;s.seq=u,delete s.rev;var f=a(s,t,n),l=x.objectStore(w).put(f);l.onsuccess=function(){delete s.deletedOrLocal,delete s.winningRev,I[i]=e,q.set(e.metadata.id,e.metadata),c(u,function(){g.call(r)})}}e.data._doc_id_rev=y;var s=x.objectStore(E),u=s.index("_doc_id_rev"),f=s.put(e.data);f.onsuccess=o,f.onerror=function(t){t.preventDefault(),t.stopPropagation();var n=u.getKey(e.data._doc_id_rev);n.onsuccess=function(t){var n=s.put(e.data,t.target.result);n.onsuccess=o}}}var l=null,d=0,h=e.data._id=e.metadata.id,v=e.data._rev=e.metadata.rev,y=h+"::"+v;n&&(e.data._deleted=!0);var m=e.data._attachments?Object.keys(e.data._attachments):[];for(var _ in e.data._attachments)if(e.data._attachments[_].stub)d++,s();else{var b=e.data._attachments[_].data;delete e.data._attachments[_].data;var S=e.data._attachments[_].digest;p(S,b,u)}m.length||f()}function p(e,t,n){var r=x.objectStore(S);r.get(e).onsuccess=function(o){var i=o.target.result;if(i)return g.call(n);var s={digest:e,body:t};r.put(s).onsuccess=function(){g.call(n)}}}var v=n.new_edits,m=t.docs,_=m.map(function(e){if(e._id&&g.isLocalId(e._id))return e;var t=g.parseDoc(e,v);return t}),b=_.filter(function(e){return e.error});if(b.length)return r(b[0]);var x,I=new Array(_.length),q=new g.Map,R=!1,O=L?"blob":"base64";g.preprocessAttachments(_,O,function(e){if(e)return r(e);var t=[w,E,S,k,T,A];x=B.transaction(t,"readwrite"),x.onerror=s(r),x.ontimeout=s(r),x.oncomplete=c,l(function(e){return e?(R=!0,r(e)):void i(o)})})},e._get=function(e,t,n){function r(){n(s,{doc:o,metadata:i,ctx:a})}var o,i,s,a;t=g.clone(t),a=t.ctx?t.ctx:B.transaction([w,E,S],"readonly"),a.objectStore(w).get(e).onsuccess=function(e){if(i=u(e.target.result),!i)return s=m.MISSING_DOC,r();if(g.isDeleted(i)&&!t.rev)return s=m.error(m.MISSING_DOC,"deleted"),r();var n=a.objectStore(E),c=t.rev||i.winningRev||y.winningRev(i),f=i.id+"::"+c;n.index("_doc_id_rev").get(f).onsuccess=function(e){return o=e.target.result,o&&o._doc_id_rev&&delete o._doc_id_rev,o?void r():(s=m.MISSING_DOC,r())}}},e._getAttachment=function(e,t,n){var r;t=g.clone(t),r=t.ctx?t.ctx:B.transaction([w,E,S],"readonly");var o=e.digest,i=e.content_type;r.objectStore(S).get(o).onsuccess=function(e){var r=e.target.result.body;c(r,i,t.encode,function(e){n(null,e)})}},e._allDocs=function(e,t){D(function(n,r){return n?t(n):0===e.limit?t(null,{total_rows:r,offset:e.skip,rows:[]}):void O(r,e,t)})},e._info=function(e){D(function(t,n){if(t)return e(t);if(null===B){var r=new Error("db isn't open");return r.id="idbNull",e(r)}var o=0,i=B.transaction([E],"readonly");i.objectStore(E).openCursor(null,"prev").onsuccess=function(e){var t=e.target.result;o=t?t.key:0},i.oncomplete=function(){e(null,{doc_count:n,update_seq:o})}})},e._changes=function(t){function n(){var e=[w,E];t.attachments&&e.push(S),_=B.transaction(e,"readonly"),_.onerror=s(t.complete),_.oncomplete=i;var n;n=h?_.objectStore(E).openCursor(r.IDBKeyRange.lowerBound(t.since,!0),h):_.objectStore(E).openCursor(r.IDBKeyRange.lowerBound(t.since,!0)),n.onsuccess=o,n.onerror=onerror}function o(e){var n=e.target.result;if(n){var r=n.value;if(c&&!c.has(r._id))return n["continue"]();var o=_.objectStore(w);o.get(r._id).onsuccess=function(e){var o=u(e.target.result);p<o.seq&&(p=o.seq);var i=o.winningRev||y.winningRev(o);if(r._rev!==i)return n["continue"]();delete r._doc_id_rev;var s=t.processChange(r,o,t);s.seq=n.key,k(s)&&(A++,m&&b.push(s),t.attachments&&t.include_docs?f(r,t,_,function(){l([s]).then(function(){t.onChange(s)})}):t.onChange(s)),A!==v&&n["continue"]()}}}function i(){function e(){t.complete(null,{results:b,last_seq:p})}t.continuous||(t.attachments?l(b).then(e):e())}if(t=g.clone(t),t.continuous){var a=C+":"+g.uuid();return d.Changes.addListener(C,a,e,t),d.Changes.notify(C),{cancel:function(){d.Changes.removeListener(C,a)}}}var c=t.doc_ids&&new g.Set(t.doc_ids),h=t.descending?"prev":null,p=0;t.since=t.since&&!h?t.since:0;var v="limit"in t?t.limit:-1;0===v&&(v=1);var m;m="returnDocs"in t?t.returnDocs:!0;var _,b=[],A=0,k=g.filterChange(t);n()},e._close=function(e){return null===B?e(m.NOT_OPEN):(B.close(),delete I[C],B=null,void e())
},e._getRevisionTree=function(e,t){var n=B.transaction([w],"readonly"),r=n.objectStore(w).get(e);r.onsuccess=function(e){var n=u(e.target.result);n?t(null,n.rev_tree):t(m.MISSING_DOC)}},e._doCompaction=function(e,t,n){function o(){h.length&&h.forEach(function(e){var t=d.index("digestSeq").count(r.IDBKeyRange.bound(e+"::",e+"::￿",!1,!1));t.onsuccess=function(t){var n=t.target.result;n||l["delete"](e)}})}var i=B.transaction([w,E,S,A],"readwrite"),c=i.objectStore(w),f=i.objectStore(E),l=i.objectStore(S),d=i.objectStore(A),h=[];c.get(e).onsuccess=function(n){var s=u(n.target.result);y.traverseRevTree(s.rev_tree,function(e,n,r,o,i){var s=n+"-"+r;-1!==t.indexOf(s)&&(i.status="missing")});var c=t.length;t.forEach(function(t){var n=f.index("_doc_id_rev"),u=e+"::"+t;n.getKey(u).onsuccess=function(e){var t=e.target.result;if("number"==typeof t){f["delete"](t);var n=d.index("seq").openCursor(r.IDBKeyRange.only(t));n.onsuccess=function(e){var t=e.target.result;if(t){var n=t.value.digestSeq.split("::")[0];h.push(n),d["delete"](t.primaryKey),t["continue"]()}else if(c--,!c){var r=s.winningRev||y.winningRev(s),u=s.deletedOrLocal;i.objectStore(w).put(a(s,r,u)),o()}}}}})},i.onerror=s(n),i.oncomplete=function(){g.call(n)}},e._getLocal=function(e,t){var n=B.transaction([T],"readonly"),r=n.objectStore(T).get(e);r.onerror=s(t),r.onsuccess=function(e){var n=e.target.result;n?(delete n._doc_id_rev,t(null,n)):t(m.MISSING_DOC)}},e._putLocal=function(e,t,n){"function"==typeof t&&(n=t,t={}),delete e._revisions;var r=e._rev,o=e._id;e._rev=r?"0-"+(parseInt(r.split("-")[1],10)+1):"0-1";var i,a=t.ctx;a||(a=B.transaction([T],"readwrite"),a.onerror=s(n),a.oncomplete=function(){i&&n(null,i)});var u,c=a.objectStore(T);r?(u=c.get(o),u.onsuccess=function(o){var s=o.target.result;if(s&&s._rev===r){var a=c.put(e);a.onsuccess=function(){i={ok:!0,id:e._id,rev:e._rev},t.ctx&&n(null,i)}}else n(m.REV_CONFLICT)}):(u=c.add(e),u.onerror=function(e){n(m.REV_CONFLICT),e.preventDefault(),e.stopPropagation()},u.onsuccess=function(){i={ok:!0,id:e._id,rev:e._rev},t.ctx&&n(null,i)})},e._removeLocal=function(e,t){var n,r=B.transaction([T],"readwrite");r.oncomplete=function(){n&&t(null,n)};var o=e._id,i=r.objectStore(T),a=i.get(o);a.onerror=s(t),a.onsuccess=function(r){var s=r.target.result;s&&s._rev===e._rev?(i["delete"](o),n={ok:!0,id:o,rev:"0-0"}):t(m.MISSING_DOC)}};var U=I[C];if(U)return B=U.idb,N=U.instanceId,j=U.idStored,void n.nextTick(function(){o(null,e)});var F=r.indexedDB.open(C,b);"openReqList"in d||(d.openReqList={}),d.openReqList[C]=F,F.onupgradeneeded=function(e){var t=e.target.result;if(e.oldVersion<1)return void i(t);var n=e.currentTarget.transaction;e.oldVersion<4&&(q(t),e.oldVersion<3?(p(t),e.oldVersion<2?h(n,function(){_(n,function(){R(n)})}):_(n,function(){R(n)})):R(n))},F.onsuccess=function(t){B=t.target.result,B.onversionchange=function(){B.close(),delete I[C]},B.onabort=function(){B.close(),delete I[C]};var n=B.transaction([k,x],"readwrite"),r=n.objectStore(k).get(k);r.onsuccess=function(t){var r=function(){null!==L&&j&&(I[C]={idb:B,instanceId:N,idStored:j,loaded:!0},o(null,e))},i=t.target.result||{id:k};C+"_id"in i?(N=i[C+"_id"],j=!0,r()):(N=g.uuid(),i[C+"_id"]=N,n.objectStore(k).put(i).onsuccess=function(){j=!0,r()}),v||(v=new g.Promise(function(e){var t=g.createBlob([""],{type:"image/png"});n.objectStore(x).put(t,"key"),n.oncomplete=function(){n=B.transaction([k,x],"readwrite");var t=n.objectStore(x).get("key");t.onsuccess=function(t){var n=t.target.result,r=URL.createObjectURL(n);g.ajax({url:r,cache:!0,binary:!0},function(t,n){t&&405===t.status?e(!0):(e(!(!n||"image/png"!==n.type)),t&&404===t.status&&g.explain404("PouchDB is just detecting blob URL support.")),URL.revokeObjectURL(r)})}}})["catch"](function(){L=!1,r()})),v.then(function(e){L=e,r()})}},F.onerror=s(o)}function p(e,t,n){"openReqList"in d||(d.openReqList={}),d.Changes.removeAllListeners(e),d.openReqList[e]&&d.openReqList[e].result&&d.openReqList[e].result.close();var o=r.indexedDB.deleteDatabase(e);o.onsuccess=function(){d.openReqList[e]&&(d.openReqList[e]=null),g.hasLocalStorage()&&e in r.localStorage&&delete r.localStorage[e],delete I[e],n(null,{ok:!0})},o.onerror=s(n)}var v,g=e("../utils"),y=e("../merge"),m=e("../deps/errors"),_=e("vuvuzela"),b=4,w="document-store",E="by-sequence",S="attach-store",A="attach-seq-store",k="meta-store",T="local-store",x="detect-blob-support",I={},q={running:!1,queue:[]},L=null;d.valid=function(){var e="undefined"!=typeof openDatabase&&/Safari/.test(navigator.userAgent)&&!/Chrome/.test(navigator.userAgent);return!e&&r.indexedDB&&r.IDBKeyRange},d.destroy=g.toPromise(function(e,t,n){q.queue.push({action:function(n){p(e,t,n)},callback:n}),i()}),d.Changes=new g.Changes,t.exports=d}).call(this,e("_process"),"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{"../deps/errors":12,"../merge":20,"../utils":25,_process:34,vuvuzela:67}],4:[function(e,t){t.exports=["idb","websql"]},{}],5:[function(e,t){(function(n){"use strict";function r(e){return"'"+e+"'"}function o(e){return e.replace(/\u0002/g,"").replace(/\u0001/g,"").replace(/\u0000/g,"")}function i(e){return e.replace(/\u0001\u0001/g,"\x00").replace(/\u0001\u0002/g,"").replace(/\u0002\u0002/g,"")}function s(e,t,n,r,o){function i(){++u===a.length&&o&&o()}function s(e,t){var o=e._attachments[t],s={encode:!0,ctx:r};n._getAttachment(o,s,function(n,r){e._attachments[t]=h.extend(h.pick(o,["digest","content_type"]),{data:r}),i()})}var a=Object.keys(e._attachments||{});if(!a.length)return o&&o();var u=0;a.forEach(function(n){t.attachments&&t.include_docs?s(e,n):(e._attachments[n].stub=!0,i())})}function a(e,t,n,r,o){return"SELECT "+e+" FROM "+("string"==typeof t?t:t.join(" JOIN "))+(n?" ON "+n:"")+(r?" WHERE "+("string"==typeof r?r:r.join(" AND ")):"")+(o?" ORDER BY "+o:"")}function u(e){return function(t){var n=t&&t.constructor.toString().match(/function ([^\(]+)/),r=n&&n[1]||t.type,o=t.target||t.message;e(v.error(v.WSQ_ERROR,o,r))}}function c(e){return delete e._id,delete e._rev,JSON.stringify(e)}function f(e,t,n){return e=JSON.parse(e),e._id=t,e._rev=n,e}function l(e){if("size"in e)return 1e6*e.size;var t=/Android/.test(window.navigator.userAgent);return t?5e6:1}function d(e,t){function r(){h.hasLocalStorage()&&(n.localStorage["_pouch__websqldb_"+K]=!0),t(null,H)}function m(e,t){e.executeSql(L),e.executeSql("ALTER TABLE "+S+" ADD COLUMN deleted TINYINT(1) DEFAULT 0",[],function(){e.executeSql(I),e.executeSql("ALTER TABLE "+E+" ADD COLUMN local TINYINT(1) DEFAULT 0",[],function(){e.executeSql("CREATE INDEX IF NOT EXISTS 'doc-store-local-idx' ON "+E+" (local, id)");var n="SELECT "+E+".winningseq AS seq, "+E+".json AS metadata FROM "+S+" JOIN "+E+" ON "+S+".seq = "+E+".winningseq";e.executeSql(n,[],function(e,n){for(var r=[],o=[],i=0;i<n.rows.length;i++){var s=n.rows.item(i),a=s.seq,u=JSON.parse(s.metadata);h.isDeleted(u)&&r.push(a),h.isLocalId(u.id)&&o.push(u.id)}e.executeSql("UPDATE "+E+"SET local = 1 WHERE id IN ("+o.map(function(){return"?"}).join(",")+")",o,function(){e.executeSql("UPDATE "+S+" SET deleted = 1 WHERE seq IN ("+r.map(function(){return"?"}).join(",")+")",r,t)})})})})}function N(e,t){var n="CREATE TABLE IF NOT EXISTS "+k+" (id UNIQUE, rev, json)";e.executeSql(n,[],function(){var n="SELECT "+E+".id AS id, "+S+".json AS data FROM "+S+" JOIN "+E+" ON "+S+".seq = "+E+".winningseq WHERE local = 1";e.executeSql(n,[],function(e,n){function r(){if(!o.length)return t(e);var n=o.shift(),i=JSON.parse(n.data)._rev;e.executeSql("INSERT INTO "+k+" (id, rev, json) VALUES (?,?,?)",[n.id,i,n.data],function(e){e.executeSql("DELETE FROM "+E+" WHERE id=?",[n.id],function(e){e.executeSql("DELETE FROM "+S+" WHERE seq=?",[n.seq],function(){r()})})})}for(var o=[],i=0;i<n.rows.length;i++)o.push(n.rows.item(i));r()})})}function j(e,t){function n(n){function r(){if(!n.length)return t(e);var o=n.shift(),i=y(o.hex,V),s=i.lastIndexOf("::"),a=i.substring(0,s),u=i.substring(s+2),c="UPDATE "+S+" SET doc_id=?, rev=? WHERE doc_id_rev=?";e.executeSql(c,[a,u,i],function(){r()})}r()}var r="ALTER TABLE "+S+" ADD COLUMN doc_id";e.executeSql(r,[],function(e){var t="ALTER TABLE "+S+" ADD COLUMN rev";e.executeSql(t,[],function(e){e.executeSql(q,[],function(e){var t="SELECT hex(doc_id_rev) as hex FROM "+S;e.executeSql(t,[],function(e,t){for(var r=[],o=0;o<t.rows.length;o++)r.push(t.rows.item(o));n(r)})})})})}function B(e,t){function n(e){var n="SELECT COUNT(*) AS cnt FROM "+A;e.executeSql(n,[],function(e,n){function r(){var n=a(C+", "+E+".id AS id",[E,S],D,null,E+".id ");n+=" LIMIT "+s+" OFFSET "+i,i+=s,e.executeSql(n,[],function(e,n){function o(e,t){var n=i[e]=i[e]||[];-1===n.indexOf(t)&&n.push(t)}if(!n.rows.length)return t(e);for(var i={},s=0;s<n.rows.length;s++)for(var a=n.rows.item(s),u=f(a.data,a.id,a.rev),c=Object.keys(u._attachments||{}),l=0;l<c.length;l++){var d=u._attachments[c[l]];o(d.digest,a.seq)}var h=[];if(Object.keys(i).forEach(function(e){var t=i[e];t.forEach(function(t){h.push([e,t])})}),!h.length)return r();var p=0;h.forEach(function(t){var n="INSERT INTO "+x+" (digest, seq) VALUES (?,?)";e.executeSql(n,t,function(){++p===h.length&&r()})})})}var o=n.rows.item(0).cnt;if(!o)return t(e);var i=0,s=10;r()})}var r="CREATE TABLE IF NOT EXISTS "+x+" (digest, seq INTEGER)";e.executeSql(r,[],function(e){e.executeSql(O,[],function(e){e.executeSql(R,[],n)})})}function P(e,t){var n="ALTER TABLE "+A+" ADD COLUMN escaped TINYINT(1) DEFAULT 0";e.executeSql(n,[],t)}function U(e,t){e.executeSql('SELECT HEX("a") AS hex',[],function(e,n){var r=n.rows.item(0).hex;V=2===r.length?"UTF-8":"UTF-16",t()})}function F(){for(;X.length>0;){var e=X.pop();e(null,W)}}function M(e,t){if(0===t){var n="CREATE TABLE IF NOT EXISTS "+T+" (dbid, db_version INTEGER)",r="CREATE TABLE IF NOT EXISTS "+A+" (digest UNIQUE, escaped TINYINT(1), body BLOB)",o="CREATE TABLE IF NOT EXISTS "+x+" (digest, seq INTEGER)",i="CREATE TABLE IF NOT EXISTS "+E+" (id unique, json, winningseq)",s="CREATE TABLE IF NOT EXISTS "+S+" (seq INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, json, deleted TINYINT(1), doc_id, rev)",a="CREATE TABLE IF NOT EXISTS "+k+" (id UNIQUE, rev, json)";e.executeSql(r),e.executeSql(a),e.executeSql(o,[],function(){e.executeSql(R),e.executeSql(O)}),e.executeSql(i,[],function(){e.executeSql(L),e.executeSql(s,[],function(){e.executeSql(I),e.executeSql(q),e.executeSql(n,[],function(){var t="INSERT INTO "+T+" (db_version, dbid) VALUES (?,?)";W=h.uuid();var n=[w,W];e.executeSql(t,n,function(){F()})})})})}else{var u=function(){var n=w>t;n&&e.executeSql("UPDATE "+T+" SET db_version = "+w);var r="SELECT dbid FROM "+T;e.executeSql(r,[],function(e,t){W=t.rows.item(0).dbid,F()})},c=[m,N,j,B,P,u],f=t,l=function(e){c[f-1](e,l),f++};l(e)}}function G(){Q.transaction(function(e){U(e,function(){J(e)})},u(t),r)}function J(e){var t="SELECT sql FROM sqlite_master WHERE tbl_name = "+T;e.executeSql(t,[],function(e,t){t.rows.length?/db_version/.test(t.rows.item(0).sql)?e.executeSql("SELECT db_version FROM "+T,[],function(e,t){var n=t.rows.item(0).db_version;M(e,n)}):e.executeSql("ALTER TABLE "+T+" ADD COLUMN db_version INTEGER",[],function(){M(e,1)}):M(e,0)})}function Y(e,t){if(-1!==$)return t($);var n=a("COUNT("+E+".id) AS 'num'",[E,S],D,S+".deleted=0");e.executeSql(n,[],function(e,n){$=n.rows.item(0).num,t($)})}var V,H=this,W=null,K=e.name,z=l(e),X=[],$=-1,Q=_(K,b,K,z);return Q?("function"!=typeof Q.readTransaction&&(Q.readTransaction=Q.transaction),h.isCordova()&&"undefined"!=typeof n?n.addEventListener(K+"_pouch",function Z(){n.removeEventListener(K+"_pouch",Z,!1),G()},!1):G(),H.type=function(){return"websql"},H._id=h.toPromise(function(e){e(null,W)}),H._info=function(e){Q.readTransaction(function(t){Y(t,function(n){var r="SELECT MAX(seq) AS seq FROM "+S;t.executeSql(r,[],function(t,r){var o=r.rows.item(0).seq||0;e(null,{doc_count:n,update_seq:o})})})},u(e))},H._bulkDocs=function(e,t,n){function r(){if(T)return n(T);var e=I.map(function(e){if(!Object.keys(e).length)return{ok:!0};if(e.error)return e;var t=e.metadata,n=p.winningRev(t);return{ok:!0,id:t.id,rev:n}});d.Changes.notify(K),$=-1,n(null,e)}function i(e,t){var n="SELECT count(*) as cnt FROM "+A+" WHERE digest=?";k.executeSql(n,[e],function(n,r){if(0===r.rows.item(0).cnt){var o=new Error("unknown stub attachment with digest "+e);o.status=412,t(o)}else t()})}function s(e){function t(){++o===n.length&&e(r)}var n=[];if(b.forEach(function(e){e.data&&e.data._attachments&&Object.keys(e.data._attachments).forEach(function(t){var r=e.data._attachments[t];r.stub&&n.push(r.digest)})}),!n.length)return e();var r,o=0;n.forEach(function(e){i(e,function(e){e&&!r&&(r=e),t()})})}function f(e,t,n,r,o,i){function s(){function t(e,t){function n(){return++i===s.length&&t(),!1}function o(t){var o="INSERT INTO "+x+" (digest, seq) VALUES (?,?)",i=[r._attachments[t].digest,e];k.executeSql(o,i,n,n)}var i=0,s=Object.keys(r._attachments||{});if(!s.length)return t();for(var a=0;a<s.length;a++)o(s[a])}var r=e.data,o=n?1:0,i=r._id,s=r._rev,u=c(r),f="INSERT INTO "+S+" (doc_id, rev, json, deleted) VALUES (?, ?, ?, ?);",d=[i,s,u,o];k.executeSql(f,d,function(e,n){var r=n.insertId;t(r,function(){l(e,r)})},function(){var e=a("seq",S,null,"doc_id=? AND rev=?");return k.executeSql(e,[i,s],function(e,n){var r=n.rows.item(0).seq,a="UPDATE "+S+" SET json=?, deleted=? WHERE doc_id=? AND rev=?;",c=[u,o,i,s];e.executeSql(a,c,function(e){t(r,function(){l(e,r)})})}),!1})}function u(e){d||(e?(d=e,r(d)):h===p.length&&s())}function f(e){h++,u(e)}function l(n,s){e.metadata.seq=s,delete e.metadata.rev;var a=o?"UPDATE "+E+" SET json=?, winningseq=(SELECT seq FROM "+S+" WHERE doc_id="+E+".id AND rev=?) WHERE id=?":"INSERT INTO "+E+" (id, winningseq, json) VALUES (?, ?, ?);",u=g.stringify(e.metadata),c=e.metadata.id,f=o?[u,t,c]:[c,s,u];n.executeSql(a,f,function(){I[i]=e,q.set(c,e.metadata),r()})}var d=null,h=0;e.data._id=e.metadata.id,e.data._rev=e.metadata.rev,n&&(e.data._deleted=!0);var p=e.data._attachments?Object.keys(e.data._attachments):[];for(var v in e.data._attachments)if(e.data._attachments[v].stub)h++,u();else{var m=e.data._attachments[v].data;delete e.data._attachments[v].data;var _=e.data._attachments[v].digest;y(_,m,f)}p.length||s()}function l(){h.processDocs(b,H,q,k,I,f,t)}function v(e){function t(){++n===b.length&&e()}if(!b.length)return e();var n=0;b.forEach(function(e){if(e._id&&h.isLocalId(e._id))return t();var n=e.metadata.id;k.executeSql("SELECT json FROM "+E+" WHERE id = ?",[n],function(e,r){if(r.rows.length){var o=g.parse(r.rows.item(0).json);q.set(n,o)}t()})})}function y(e,t,n){var r="SELECT digest FROM "+A+" WHERE digest=?";k.executeSql(r,[e],function(i,s){return s.rows.length?n():(r="INSERT INTO "+A+" (digest, body, escaped) VALUES (?,?,1)",void i.executeSql(r,[e,o(t)],function(){n()},function(){return n(),!1}))})}var m=t.new_edits,_=e.docs,b=_.map(function(e){if(e._id&&h.isLocalId(e._id))return e;var t=h.parseDoc(e,m);return t}),w=b.filter(function(e){return e.error});if(w.length)return n(w[0]);var k,T,I=new Array(b.length),q=new h.Map;h.preprocessAttachments(b,"binary",function(e){return e?n(e):void Q.transaction(function(e){k=e,s(function(e){e?T=e:v(l)})},u(n),r)})},H._get=function(e,t,n){function r(){n(s,{doc:o,metadata:i,ctx:l})}t=h.clone(t);var o,i,s;if(!t.ctx)return void Q.readTransaction(function(r){t.ctx=r,H._get(e,t,n)});var u,c,l=t.ctx;t.rev?(u=a(C,[E,S],E+".id="+S+".doc_id",[S+".doc_id=?",S+".rev=?"]),c=[e,t.rev]):(u=a(C,[E,S],D,E+".id=?"),c=[e]),l.executeSql(u,c,function(e,n){if(!n.rows.length)return s=v.MISSING_DOC,r();var a=n.rows.item(0);return i=g.parse(a.metadata),a.deleted&&!t.rev?(s=v.error(v.MISSING_DOC,"deleted"),r()):(o=f(a.data,i.id,a.rev),void r())})},H._allDocs=function(e,t){var n,r=[],o="startkey"in e?e.startkey:!1,i="endkey"in e?e.endkey:!1,c="key"in e?e.key:!1,l="descending"in e?e.descending:!1,d="limit"in e?e.limit:-1,h="skip"in e?e.skip:0,v=e.inclusive_end!==!1,y=[],m=[];if(c!==!1)m.push(E+".id = ?"),y.push(c);else if(o!==!1||i!==!1){if(o!==!1&&(m.push(E+".id "+(l?"<=":">=")+" ?"),y.push(o)),i!==!1){var _=l?">":"<";v&&(_+="="),m.push(E+".id "+_+" ?"),y.push(i)}c!==!1&&(m.push(E+".id = ?"),y.push(c))}"ok"!==e.deleted&&m.push(S+".deleted = 0"),Q.readTransaction(function(t){Y(t,function(o){if(n=o,0!==d){var i=a(C,[E,S],D,m,E+".id "+(l?"DESC":"ASC"));i+=" LIMIT "+d+" OFFSET "+h,t.executeSql(i,y,function(t,n){for(var o=0,i=n.rows.length;i>o;o++){var a=n.rows.item(o),u=g.parse(a.metadata),c=f(a.data,u.id,a.rev),l=c._rev,d={id:u.id,key:u.id,value:{rev:l}};if(e.include_docs&&(d.doc=c,d.doc._rev=l,e.conflicts&&(d.doc._conflicts=p.collectConflicts(u)),s(d.doc,e,H,t)),a.deleted){if("ok"!==e.deleted)continue;d.value.deleted=!0,d.doc=null}r.push(d)}})}})},u(t),function(){t(null,{total_rows:n,offset:e.skip,rows:r})})},H._changes=function(e){function t(){var t=[E+".winningseq > "+e.since],n=[];e.doc_ids&&(t.push(E+".id IN ("+e.doc_ids.map(function(){return"?"}).join(",")+")"),n=e.doc_ids);var d=a(C,[E,S],D,t,E+".winningseq "+(r?"DESC":"ASC")),p=h.filterChange(e);e.view||e.filter||(d+=" LIMIT "+o);var v=0;Q.readTransaction(function(t){t.executeSql(d,n,function(t,n){function r(t){return function(){e.onChange(t)}}for(var a=0,u=n.rows.length;u>a;a++){var d=n.rows.item(a),h=g.parse(d.metadata);v<d.seq&&(v=d.seq);var y=f(d.data,h.id,d.rev),m=e.processChange(y,h,e);if(m.seq=d.seq,p(m)&&(l++,i&&c.push(m),e.attachments&&e.include_docs?s(y,e,H,t,r(m)):r(m)()),l===o)break}})},u(e.complete),function(){e.continuous||e.complete(null,{results:c,last_seq:v})})}if(e=h.clone(e),e.continuous){var n=K+":"+h.uuid();return d.Changes.addListener(K,n,H,e),d.Changes.notify(K),{cancel:function(){d.Changes.removeListener(K,n)}}}var r=e.descending;e.since=e.since&&!r?e.since:0;var o="limit"in e?e.limit:-1;0===o&&(o=1);var i;i="returnDocs"in e?e.returnDocs:!0;var c=[],l=0;t()},H._close=function(e){e()},H._getAttachment=function(e,t,n){var r,o=t.ctx,s=e.digest,a=e.content_type,u="SELECT escaped, CASE WHEN escaped = 1 THEN body ELSE HEX(body) END AS body FROM "+A+" WHERE digest=?";o.executeSql(u,[s],function(e,o){var s=o.rows.item(0),u=s.escaped?i(s.body):y(s.body,V);t.encode?r=btoa(u):(u=h.fixBinary(u),r=h.createBlob([u],{type:a})),n(null,r)})},H._getRevisionTree=function(e,t){Q.readTransaction(function(n){var r="SELECT json AS metadata FROM "+E+" WHERE id = ?";n.executeSql(r,[e],function(e,n){if(n.rows.length){var r=g.parse(n.rows.item(0).metadata);t(null,r.rev_tree)}else t(v.MISSING_DOC)})})},H._doCompaction=function(e,t,n){return t.length?void Q.transaction(function(n){var r="SELECT json AS metadata FROM "+E+" WHERE id = ?";n.executeSql(r,[e],function(n,r){var o=g.parse(r.rows.item(0).metadata);p.traverseRevTree(o.rev_tree,function(e,n,r,o,i){var s=n+"-"+r;-1!==t.indexOf(s)&&(i.status="missing")});var i="UPDATE "+E+" SET json = ? WHERE id = ?";n.executeSql(i,[g.stringify(o),e])}),t.forEach(function(t){var r="SELECT seq FROM "+S+" WHERE doc_id=? AND rev=?";n.executeSql(r,[e,t],function(e,t){if(t.rows.length){var n=t.rows.item(0).seq,r="SELECT a1.digest AS digest FROM "+x+" a1 JOIN "+x+" a2 ON a1.digest=a2.digest WHERE a1.seq=? GROUP BY a1.digest HAVING COUNT(*) = 1";e.executeSql(r,[n],function(e,t){for(var r=[],o=0;o<t.rows.length;o++)r.push(t.rows.item(o).digest);e.executeSql("DELETE FROM "+S+" WHERE seq=?",[n]),e.executeSql("DELETE FROM "+x+" WHERE seq=?",[n]),r.forEach(function(t){e.executeSql("DELETE FROM "+x+" WHERE digest=?",[t]),e.executeSql("DELETE FROM "+A+" WHERE digest=?",[t])})})}})})},u(n),function(){n()}):n()},H._getLocal=function(e,t){Q.readTransaction(function(n){var r="SELECT json, rev FROM "+k+" WHERE id=?";n.executeSql(r,[e],function(n,r){if(r.rows.length){var o=r.rows.item(0),i=f(o.json,e,o.rev);t(null,i)}else t(v.MISSING_DOC)})})},H._putLocal=function(e,t,n){function r(e){var r,u;i?(r="UPDATE "+k+" SET rev=?, json=? WHERE id=? AND rev=?",u=[o,f,s,i]):(r="INSERT INTO "+k+" (id, rev, json) VALUES (?,?,?)",u=[s,o,f]),e.executeSql(r,u,function(e,r){r.rowsAffected?(a={ok:!0,id:s,rev:o},t.ctx&&n(null,a)):n(v.REV_CONFLICT)},function(){return n(v.REV_CONFLICT),!1})}"function"==typeof t&&(n=t,t={}),delete e._revisions;var o,i=e._rev,s=e._id;o=e._rev=i?"0-"+(parseInt(i.split("-")[1],10)+1):"0-1";var a,f=c(e);t.ctx?r(t.ctx):Q.transaction(function(e){r(e)},u(n),function(){a&&n(null,a)})},void(H._removeLocal=function(e,t){var n;Q.transaction(function(r){var o="DELETE FROM "+k+" WHERE id=? AND rev=?",i=[e._id,e._rev];r.executeSql(o,i,function(r,o){return o.rowsAffected?void(n={ok:!0,id:e._id,rev:"0-0"}):t(v.MISSING_DOC)})},u(t),function(){n&&t(null,n)})})):t(v.UNKNOWN_ERROR)}var h=e("../utils"),p=e("../merge"),v=e("../deps/errors"),g=e("vuvuzela"),y=e("../deps/parse-hex"),m={},_=h.getArguments(function(e){if("undefined"!=typeof n){if(n.navigator&&n.navigator.sqlitePlugin&&n.navigator.sqlitePlugin.openDatabase)return navigator.sqlitePlugin.openDatabase.apply(navigator.sqlitePlugin,e);if(n.sqlitePlugin&&n.sqlitePlugin.openDatabase)return n.sqlitePlugin.openDatabase.apply(n.sqlitePlugin,e);var t=m[e[0]];return t||(t=m[e[0]]=n.openDatabase.apply(n,e)),t}}),b=1,w=6,E=r("document-store"),S=r("by-sequence"),A=r("attach-store"),k=r("local-store"),T=r("metadata-store"),x=r("attach-seq-store"),I="CREATE INDEX IF NOT EXISTS 'by-seq-deleted-idx' ON "+S+" (seq, deleted)",q="CREATE UNIQUE INDEX IF NOT EXISTS 'by-seq-doc-id-rev' ON "+S+" (doc_id, rev)",L="CREATE INDEX IF NOT EXISTS 'doc-winningseq-idx' ON "+E+" (winningseq)",R="CREATE INDEX IF NOT EXISTS 'attach-seq-seq-idx' ON "+x+" (seq)",O="CREATE UNIQUE INDEX IF NOT EXISTS 'attach-seq-digest-idx' ON "+x+" (digest, seq)",D=S+".seq = "+E+".winningseq",C=S+".seq AS seq, "+S+".deleted AS deleted, "+S+".json AS data, "+S+".rev AS rev, "+E+".json AS metadata";d.valid=function(){if("undefined"!=typeof n){if(n.navigator&&n.navigator.sqlitePlugin&&n.navigator.sqlitePlugin.openDatabase)return!0;if(n.sqlitePlugin&&n.sqlitePlugin.openDatabase)return!0;if(n.openDatabase)return!0}return!1},d.destroy=h.toPromise(function(e,t,r){d.Changes.removeAllListeners(e);var o=l(t),i=_(e,b,e,o);i.transaction(function(e){var t=[E,S,A,T,k,x];t.forEach(function(t){e.executeSql("DROP TABLE IF EXISTS "+t,[])})},u(r),function(){h.hasLocalStorage()&&(delete n.localStorage["_pouch__websqldb_"+e],delete n.localStorage[e]),r(null,{ok:!0})})}),d.Changes=new h.Changes,t.exports=d}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{"../deps/errors":12,"../deps/parse-hex":14,"../merge":20,"../utils":25,vuvuzela:67}],6:[function(e,t){"use strict";function n(e,t,n){function r(){i.cancel()}a.call(this);var i=this;this.db=e,t=t?o.clone(t):{};var s=n||t.complete||function(){},u=t.complete=o.once(function(t,n){t?i.emit("error",t):i.emit("complete",n),i.removeAllListeners(),e.removeListener("destroyed",r)});s&&(i.on("complete",function(e){s(null,e)}),i.on("error",function(e){s(e)}));var c=t.onChange;c&&i.on("change",c),e.once("destroyed",r),t.onChange=function(e){t.isCancelled||(i.emit("change",e),i.startSeq&&i.startSeq<=e.seq&&(i.emit("uptodate"),i.startSeq=!1),e.deleted?i.emit("delete",e):1===e.changes.length&&"1-"===e.changes[0].rev.slice(0,2)?i.emit("create",e):i.emit("update",e))};var f=new o.Promise(function(e,n){t.complete=function(t,r){t?n(t):e(r)}});i.once("cancel",function(){c&&i.removeListener("change",c),t.complete(null,{status:"cancelled"})}),this.then=f.then.bind(f),this["catch"]=f["catch"].bind(f),this.then(function(e){u(null,e)},u),e.taskqueue.isReady?i.doChanges(t):e.taskqueue.addTask(function(){i.isCancelled?i.emit("cancel"):i.doChanges(t)})}function r(e,t,n){var r=[{rev:e._rev}];"all_docs"===n.style&&(r=i.collectLeaves(t.rev_tree).map(function(e){return{rev:e.rev}}));var s={id:t.id,changes:r,doc:e};return o.isDeleted(t,e._rev)&&(s.deleted=!0),n.conflicts&&(s.doc._conflicts=i.collectConflicts(t),s.doc._conflicts.length||delete s.doc._conflicts),s}var o=e("./utils"),i=e("./merge"),s=e("./deps/errors"),a=e("events").EventEmitter,u=e("./evalFilter"),c=e("./evalView");t.exports=n,o.inherits(n,a),n.prototype.cancel=function(){this.isCancelled=!0,this.db.taskqueue.isReady&&this.emit("cancel")},n.prototype.doChanges=function(e){var t=this,n=e.complete;if(e=o.clone(e),"live"in e&&!("continuous"in e)&&(e.continuous=e.live),e.processChange=r,"latest"===e.since&&(e.since="now"),e.since||(e.since=0),"now"===e.since)return void this.db.info().then(function(r){return t.isCancelled?void n(null,{status:"cancelled"}):(e.since=r.update_seq-1,void t.doChanges(e))},n);if(e.continuous&&"now"!==e.since&&this.db.info().then(function(e){t.startSeq=e.update_seq-1},function(e){if("idbNull"!==e.id)throw e}),"http"!==this.db.type()&&e.filter&&"string"==typeof e.filter&&!e.doc_ids)return this.filterChanges(e);"descending"in e||(e.descending=!1),e.limit=0===e.limit?1:e.limit,e.complete=n;var i=this.db._changes(e);if(i&&"function"==typeof i.cancel){var s=t.cancel;t.cancel=o.getArguments(function(e){i.cancel(),s.apply(this,e)})}},n.prototype.filterChanges=function(e){var t=this,n=e.complete;if("_view"===e.filter){if(!e.view||"string"!=typeof e.view){var r=new Error("`view` filter parameter is not provided.");return r.status=s.BAD_REQUEST.status,r.name=s.BAD_REQUEST.name,r.error=!0,void n(r)}var o=e.view.split("/");this.db.get("_design/"+o[0],function(r,i){if(t.isCancelled)return void n(null,{status:"cancelled"});if(r)return void n(r);if(i&&i.views&&i.views[o[1]]){var a=c(i.views[o[1]].map);return e.filter=a,void t.doChanges(e)}var u=i.views?"missing json key: "+o[1]:"missing json key: views";r||(r=new Error(u),r.status=s.MISSING_DOC.status,r.name=s.MISSING_DOC.name,r.error=!0),n(r)})}else{var i=e.filter.split("/");this.db.get("_design/"+i[0],function(r,o){if(t.isCancelled)return void n(null,{status:"cancelled"});if(r)return void n(r);if(o&&o.filters&&o.filters[i[1]]){var a=u(o.filters[i[1]]);return e.filter=a,void t.doChanges(e)}var c=o&&o.filters?"missing json key: "+i[1]:"missing json key: filters";return r||(r=new Error(c),r.status=s.MISSING_DOC.status,r.name=s.MISSING_DOC.name,r.error=!0),void n(r)})}}},{"./deps/errors":12,"./evalFilter":18,"./evalView":19,"./merge":20,"./utils":25,events:33}],7:[function(e,t){"use strict";function n(e,t,n,r){return e.get(t)["catch"](function(n){if(404===n.status)return"http"===e.type()&&o.explain404("PouchDB is just checking if a remote checkpoint exists."),{_id:t};throw n}).then(function(t){return r.cancelled?void 0:(t.last_seq=n,e.put(t))})}function r(e,t,n,r){this.src=e,this.target=t,this.id=n,this.returnValue=r}var o=e("./utils");r.prototype.writeCheckpoint=function(e){var t=this;return this.updateTarget(e).then(function(){return t.updateSource(e)})},r.prototype.updateTarget=function(e){return n(this.target,this.id,e,this.returnValue)},r.prototype.updateSource=function(e){var t=this;return this.readOnlySource?o.Promise.resolve(!0):n(this.src,this.id,e,this.returnValue)["catch"](function(e){var n="number"==typeof e.status&&4===Math.floor(e.status/100);if(n)return t.readOnlySource=!0,!0;throw e})},r.prototype.getCheckpoint=function(){var e=this;return e.target.get(e.id).then(function(t){return e.src.get(e.id).then(function(e){return t.last_seq===e.last_seq?e.last_seq:0},function(n){if(404===n.status&&t.last_seq)return e.src.put({_id:e.id,last_seq:0}).then(function(){return 0},function(n){return 401===n.status?(e.readOnlySource=!0,t.last_seq):0});throw n})})["catch"](function(e){if(404!==e.status)throw e;return 0})},t.exports=r},{"./utils":25}],8:[function(e,t){(function(n){"use strict";function r(e){e&&n.debug&&console.error(e)}function o(e,t,n){if(!(this instanceof o))return new o(e,t,n);var c=this;("function"==typeof t||"undefined"==typeof t)&&(n=t,t={}),e&&"object"==typeof e&&(t=e,e=void 0),"undefined"==typeof n&&(n=r),t=t||{},this.__opts=t;var f=n;c.auto_compaction=t.auto_compaction,c.prefix=o.prefix,i.call(c),c.taskqueue=new a;var l=new u(function(r,i){n=function(e,t){return e?i(e):(delete t.then,void r(t))},t=s.clone(t);var a,u,f=t.name||e;return function(){try{if("string"!=typeof f)throw u=new Error("Missing/invalid DB name"),u.code=400,u;if(a=o.parseAdapter(f,t),t.originalName=f,t.name=a.name,t.prefix&&"http"!==a.adapter&&"https"!==a.adapter&&(t.name=t.prefix+t.name),t.adapter=t.adapter||a.adapter,c._adapter=t.adapter,c._db_name=f,!o.adapters[t.adapter])throw u=new Error("Adapter is missing"),u.code=404,u;if(!o.adapters[t.adapter].valid())throw u=new Error("Invalid Adapter"),u.code=404,u}catch(e){c.taskqueue.fail(e),c.changes=s.toPromise(function(t){t.complete&&t.complete(e)})}}(),u?i(u):(c.adapter=t.adapter,c.replicate={},c.replicate.from=function(e,t,n){return c.constructor.replicate(e,c,t,n)},c.replicate.to=function(e,t,n){return c.constructor.replicate(c,e,t,n)},c.sync=function(e,t,n){return c.constructor.sync(c,e,t,n)},c.replicate.sync=c.sync,c.destroy=s.adapterFun("destroy",function(e){var t=this;t.info(function(n,r){return n?e(n):void t.constructor.destroy(r.db_name,e)})}),o.adapters[t.adapter].call(c,t,function(e){function r(e){"destroyed"===e&&(c.emit("destroyed"),o.removeListener(f,r))}return e?void(n&&(c.taskqueue.fail(e),n(e))):(o.on(f,r),c.emit("created",c),o.emit("created",t.originalName),c.taskqueue.ready(c),void n(null,c))}),t.skipSetup&&c.taskqueue.ready(c),void(s.isCordova()&&cordova.fireWindowEvent(t.name+"_pouch",{})))});l.then(function(e){f(null,e)},f),c.then=l.then.bind(l),c["catch"]=l["catch"].bind(l)}var i=e("./adapter"),s=e("./utils"),a=e("./taskqueue"),u=s.Promise;s.inherits(o,i),o.debug=e("debug"),t.exports=o}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{"./adapter":1,"./taskqueue":24,"./utils":25,debug:35}],9:[function(e,t){"use strict";function n(e,t){function n(t,n,r){if(e.binary||e.json||!e.processData||"string"==typeof t){if(!e.binary&&e.json&&"string"==typeof t)try{t=JSON.parse(t)}catch(o){return r(o)}}else t=JSON.stringify(t);Array.isArray(t)&&(t=t.map(function(e){var t;return e.ok?e:e.error&&"conflict"===e.error?(t=i.REV_CONFLICT,t.id=e.id,t):e.error&&"forbidden"===e.error?(t=i.FORBIDDEN,t.id=e.id,t.reason=e.reason,t):e.missing?(t=i.MISSING_DOC,t.missing=e.missing,t):e})),r(null,t,n)}function a(e,t){var n,r,o,s;try{n=JSON.parse(e.responseText);for(s in i)if(i.hasOwnProperty(s)&&i[s].name===n.error){o=i[s];break}o||(o=i.UNKNOWN_ERROR,e.status&&(o.status=e.status),e.statusText&&(e.name=e.statusText)),r=i.error(o,n.reason)}catch(a){for(var s in i)if(i.hasOwnProperty(s)&&i[s].status===e.status){o=i[s];break}o||(o=i.UNKNOWN_ERROR,e.status&&(o.status=e.status),e.statusText&&(e.name=e.statusText)),r=i.error(o)}e.withCredentials&&0===e.status&&(r.status=405,r.statusText="Method Not Allowed"),t(r)}var u=!1,c=s.getArguments(function(e){u||(t.apply(this,e),u=!0)});"function"==typeof e&&(c=e,e={}),e=s.clone(e);var f={method:"GET",headers:{},json:!0,processData:!0,timeout:1e4,cache:!1};if(e=s.extend(!0,f,e),"GET"===e.method&&!e.cache){var l=-1!==e.url.indexOf("?");e.url+=(l?"&":"?")+"_nonce="+s.uuid(16)}var d,h;h=e.xhr?new e.xhr:new XMLHttpRequest,h.open(e.method,e.url),h.withCredentials=!0,e.json&&(e.headers.Accept="application/json",e.headers["Content-Type"]=e.headers["Content-Type"]||"application/json",e.body&&e.processData&&"string"!=typeof e.body&&(e.body=JSON.stringify(e.body))),e.binary&&(h.responseType="arraybuffer");var p=function(e,t,n){var r="";if(n){var o=new Date;o.setTime(o.getTime()+24*n*60*60*1e3),r="; expires="+o.toGMTString()}document.cookie=e+"="+t+r+"; path=/"};for(var v in e.headers)if("Cookie"===v){var g=e.headers[v].split("=");p(g[0],g[1],10)}else h.setRequestHeader(v,e.headers[v]);"body"in e||(e.body=null);var y=function(){u||(h.abort(),a(h,c))};return h.onreadystatechange=function(){if(4===h.readyState&&!u)if(clearTimeout(d),h.status>=200&&h.status<300){var t;t=e.binary?o([h.response||""],{type:h.getResponseHeader("Content-Type")}):h.responseText,n(t,h,c)}else a(h,c)},e.timeout>0&&(d=setTimeout(y,e.timeout),h.onprogress=function(){clearTimeout(d),d=setTimeout(y,e.timeout)
},"undefined"==typeof r&&(r=-1!==Object.keys(h).indexOf("upload")),r&&(h.upload.onprogress=h.onprogress)),e.body&&e.body instanceof Blob?s.readAsBinaryString(e.body,function(e){h.send(s.fixBinary(e))}):h.send(e.body),{abort:y}}var r,o=e("./blob.js"),i=e("./errors"),s=e("../utils");t.exports=n},{"../utils":25,"./blob.js":10,"./errors":12}],10:[function(e,t){(function(e){"use strict";function n(t,n){t=t||[],n=n||{};try{return new Blob(t,n)}catch(r){if("TypeError"!==r.name)throw r;for(var o=e.BlobBuilder||e.MSBlobBuilder||e.MozBlobBuilder||e.WebKitBlobBuilder,i=new o,s=0;s<t.length;s+=1)i.append(t[s]);return i.getBlob(n.type)}}t.exports=n}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],11:[function(e,t,n){"use strict";function r(){this.store={}}function o(e){if(this.store=new r,e&&Array.isArray(e))for(var t=0,n=e.length;n>t;t++)this.add(e[t])}n.Map=r,n.Set=o,r.prototype.mangle=function(e){if("string"!=typeof e)throw new TypeError("key must be a string but Got "+e);return"$"+e},r.prototype.unmangle=function(e){return e.substring(1)},r.prototype.get=function(e){var t=this.mangle(e);return t in this.store?this.store[t]:void 0},r.prototype.set=function(e,t){var n=this.mangle(e);return this.store[n]=t,!0},r.prototype.has=function(e){var t=this.mangle(e);return t in this.store},r.prototype["delete"]=function(e){var t=this.mangle(e);return t in this.store?(delete this.store[t],!0):!1},r.prototype.forEach=function(e){var t=this,n=Object.keys(t.store);n.forEach(function(n){var r=t.store[n];n=t.unmangle(n),e(r,n)})},o.prototype.add=function(e){return this.store.set(e,!0)},o.prototype.has=function(e){return this.store.has(e)},o.prototype["delete"]=function(e){return this.store["delete"](e)}},{}],12:[function(e,t,n){"use strict";function r(e){this.status=e.status,this.name=e.error,this.message=e.reason,this.error=!0}r.prototype__proto__=Error.prototype,r.prototype.toString=function(){return JSON.stringify({status:this.status,name:this.name,message:this.message})},n.UNAUTHORIZED=new r({status:401,error:"unauthorized",reason:"Name or password is incorrect."}),n.MISSING_BULK_DOCS=new r({status:400,error:"bad_request",reason:"Missing JSON list of 'docs'"}),n.MISSING_DOC=new r({status:404,error:"not_found",reason:"missing"}),n.REV_CONFLICT=new r({status:409,error:"conflict",reason:"Document update conflict"}),n.INVALID_ID=new r({status:400,error:"invalid_id",reason:"_id field must contain a string"}),n.MISSING_ID=new r({status:412,error:"missing_id",reason:"_id is required for puts"}),n.RESERVED_ID=new r({status:400,error:"bad_request",reason:"Only reserved document ids may start with underscore."}),n.NOT_OPEN=new r({status:412,error:"precondition_failed",reason:"Database not open"}),n.UNKNOWN_ERROR=new r({status:500,error:"unknown_error",reason:"Database encountered an unknown error"}),n.BAD_ARG=new r({status:500,error:"badarg",reason:"Some query argument is invalid"}),n.INVALID_REQUEST=new r({status:400,error:"invalid_request",reason:"Request was invalid"}),n.QUERY_PARSE_ERROR=new r({status:400,error:"query_parse_error",reason:"Some query parameter is invalid"}),n.DOC_VALIDATION=new r({status:500,error:"doc_validation",reason:"Bad special document member"}),n.BAD_REQUEST=new r({status:400,error:"bad_request",reason:"Something wrong with the request"}),n.NOT_AN_OBJECT=new r({status:400,error:"bad_request",reason:"Document must be a JSON object"}),n.DB_MISSING=new r({status:404,error:"not_found",reason:"Database not found"}),n.IDB_ERROR=new r({status:500,error:"indexed_db_went_bad",reason:"unknown"}),n.WSQ_ERROR=new r({status:500,error:"web_sql_went_bad",reason:"unknown"}),n.LDB_ERROR=new r({status:500,error:"levelDB_went_went_bad",reason:"unknown"}),n.FORBIDDEN=new r({status:403,error:"forbidden",reason:"Forbidden by design doc validate_doc_update function"}),n.error=function(e,t,n){function r(){this.message=t,n&&(this.name=n)}return r.prototype=e,new r(t)}},{}],13:[function(e,t){(function(n,r){"use strict";function o(e,t,n){if("function"==typeof e.slice)return t?n?e.slice(t,n):e.slice(t):e.slice();t=Math.floor(t||0),n=Math.floor(n||0);var r=e.byteLength;if(t=0>t?Math.max(t+r,0):Math.min(r,t),n=0>n?Math.max(n+r,0):Math.min(r,n),0>=n-t)return new ArrayBuffer(0);var o=new ArrayBuffer(n-t),i=new Uint8Array(o),s=new Uint8Array(e,t,n-t);return i.set(s),o}function i(e){var t=[255&e,e>>>8&255,e>>>16&255,e>>>24&255];return t.map(function(e){return String.fromCharCode(e)}).join("")}function s(e){for(var t="",n=0;n<e.length;n++)t+=i(e[n]);return r.btoa(t)}var a=e("crypto"),u=e("spark-md5"),c=r.setImmediate||r.setTimeout,f=32768;t.exports=function(e,t){function r(e,t,n,r){d?e.appendBinary(t.substring(n,r)):e.append(o(t,n,r))}function i(){var n=g*p,o=n+p;if(n+p>=e.size&&(o=e.size),g++,v>g)r(y,e,n,o),c(i);else{r(y,e,n,o);var a=y.end(!0),u=s(a);t(null,u),y.destroy()}}if(!n.browser){var l=a.createHash("md5").update(e).digest("base64");return void t(null,l)}var d="string"==typeof e,h=d?e.length:e.byteLength,p=Math.min(f,h),v=Math.ceil(h/p),g=0,y=d?new u:new u.ArrayBuffer;i()}}).call(this,e("_process"),"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{_process:34,crypto:28,"spark-md5":66}],14:[function(e,t){"use strict";function n(e){return decodeURIComponent(window.escape(e))}function r(e){return 65>e?e-48:e-55}function o(e,t,n){for(var o="";n>t;)o+=String.fromCharCode(r(e.charCodeAt(t++))<<4|r(e.charCodeAt(t++)));return o}function i(e,t,n){for(var o="";n>t;)o+=String.fromCharCode(r(e.charCodeAt(t+2))<<12|r(e.charCodeAt(t+3))<<8|r(e.charCodeAt(t))<<4|r(e.charCodeAt(t+1))),t+=4;return o}function s(e,t){return"UTF-8"===t?n(o(e,0,e.length)):i(e,0,e.length)}t.exports=s},{}],15:[function(e,t){"use strict";function n(e){for(var t=r,n=t.parser[t.strictMode?"strict":"loose"].exec(e),o={},i=14;i--;){var s=t.key[i],a=n[i]||"",u=-1!==["user","password"].indexOf(s);o[s]=u?decodeURIComponent(a):a}return o[t.q.name]={},o[t.key[12]].replace(t.q.parser,function(e,n,r){n&&(o[t.q.name][n]=r)}),o}var r={strictMode:!1,key:["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],q:{name:"queryKey",parser:/(?:^|&)([^&=]*)=?([^&]*)/g},parser:{strict:/^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,loose:/^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/}};t.exports=n},{}],16:[function(e,t){"use strict";function n(e,t,n){return new o(function(o,i){return t&&"object"==typeof t&&(t=t._id),"string"!=typeof t?i(new Error("doc id is required")):void e.get(t,function(s,a){if(s)return 404!==s.status?i(s):o(r(e,n({_id:t}),n));var u=n(a);return u?void o(r(e,u,n)):o(a)})})}function r(e,t,r){return e.put(t)["catch"](function(o){if(409!==o.status)throw o;return n(e,t,r)})}var o=e("../utils").Promise;t.exports=function(e,t,r,o){return"function"!=typeof o?n(e,t,r):void n(e,t,r).then(function(e){o(null,e)},o)}},{"../utils":25}],17:[function(e,t){"use strict";function n(e){return 0|Math.random()*e}function r(e,t){t=t||o.length;var r="",i=-1;if(e){for(;++i<e;)r+=o[n(t)];return r}for(;++i<36;)switch(i){case 8:case 13:case 18:case 23:r+="-";break;case 19:r+=o[3&n(16)|8];break;default:r+=o[n(16)]}return r}var o="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");t.exports=r},{}],18:[function(_dereq_,module,exports){"use strict";function evalFilter(input){return eval(["(function () { return ",input," })()"].join(""))}module.exports=evalFilter},{}],19:[function(_dereq_,module,exports){"use strict";function evalView(input){return eval(["(function () {","  return function (doc) {","    var emitted = false;","    var emit = function (a, b) {","      emitted = true;","    };","    var view = "+input+";","    view(doc);","    if (emitted) {","      return true;","    }","  }","})()"].join("\n"))}module.exports=evalView},{}],20:[function(e,t){"use strict";function n(e){for(var t,n=e.shift(),r=[n.id,n.opts,[]],o=r;e.length;)n=e.shift(),t=[n.id,n.opts,[]],o[2].push(t),o=t;return r}function r(e,t){for(var n=[{tree1:e,tree2:t}],r=!1;n.length>0;){var o=n.pop(),i=o.tree1,s=o.tree2;(i[1].status||s[1].status)&&(i[1].status="available"===i[1].status||"available"===s[1].status?"available":"missing");for(var a=0;a<s[2].length;a++)if(i[2][0]){for(var u=!1,c=0;c<i[2].length;c++)i[2][c][0]===s[2][a][0]&&(n.push({tree1:i[2][c],tree2:s[2][a]}),u=!0);u||(r="new_branch",i[2].push(s[2][a]),i[2].sort())}else r="new_leaf",i[2][0]=s[2][a]}return{conflicts:r,tree:e}}function o(e,t,n){var o,i=[],s=!1,a=!1;return e.length?(e.forEach(function(e){if(e.pos===t.pos&&e.ids[0]===t.ids[0])o=r(e.ids,t.ids),i.push({pos:e.pos,ids:o.tree}),s=s||o.conflicts,a=!0;else if(n!==!0){var u=e.pos<t.pos?e:t,c=e.pos<t.pos?t:e,f=c.pos-u.pos,l=[],d=[];for(d.push({ids:u.ids,diff:f,parent:null,parentIdx:null});d.length>0;){var h=d.pop();0!==h.diff?h.ids&&h.ids[2].forEach(function(e,t){d.push({ids:e,diff:h.diff-1,parent:h.ids,parentIdx:t})}):h.ids[0]===c.ids[0]&&l.push(h)}var p=l[0];p?(o=r(p.ids,c.ids),p.parent[2][p.parentIdx]=o.tree,i.push({pos:u.pos,ids:u.ids}),s=s||o.conflicts,a=!0):i.push(e)}else i.push(e)}),a||i.push(t),i.sort(function(e,t){return e.pos-t.pos}),{tree:i,conflicts:s||"internal_node"}):{tree:[t],conflicts:"new_leaf"}}function i(e,t){var r=a.rootToLeaf(e).map(function(e){var r=e.ids.slice(-t);return{pos:e.pos+(e.ids.length-r.length),ids:n(r)}});return r.reduce(function(e,t){return o(e,t,!0).tree},[r.shift()])}var s=e("pouchdb-extend"),a={};a.merge=function(e,t,n){e=s(!0,[],e),t=s(!0,{},t);var r=o(e,t);return{tree:i(r.tree,n),conflicts:r.conflicts}},a.winningRev=function(e){var t=[];return a.traverseRevTree(e.rev_tree,function(e,n,r,o,i){e&&t.push({pos:n,id:r,deleted:!!i.deleted})}),t.sort(function(e,t){return e.deleted!==t.deleted?e.deleted>t.deleted?1:-1:e.pos!==t.pos?t.pos-e.pos:e.id<t.id?1:-1}),t[0].pos+"-"+t[0].id},a.traverseRevTree=function(e,t){for(var n,r=e.slice();n=r.pop();)for(var o=n.pos,i=n.ids,s=i[2],a=t(0===s.length,o,i[0],n.ctx,i[1]),u=0,c=s.length;c>u;u++)r.push({pos:o+1,ids:s[u],ctx:a})},a.collectLeaves=function(e){var t=[];return a.traverseRevTree(e,function(e,n,r,o,i){e&&t.unshift({rev:n+"-"+r,pos:n,opts:i})}),t.sort(function(e,t){return t.pos-e.pos}),t.map(function(e){delete e.pos}),t},a.collectConflicts=function(e){var t=a.winningRev(e),n=a.collectLeaves(e.rev_tree),r=[];return n.forEach(function(e){e.rev===t||e.opts.deleted||r.push(e.rev)}),r},a.rootToLeaf=function(e){var t=[];return a.traverseRevTree(e,function(e,n,r,o,i){if(o=o?o.slice(0):[],o.push({id:r,opts:i}),e){var s=n+1-o.length;t.unshift({pos:s,ids:o})}return o}),t},t.exports=a},{"pouchdb-extend":57}],21:[function(e,t,n){"use strict";function r(e,t){e=parseInt(e,10),t=parseInt(t,10),e!==e&&(e=0),t!==t||e>=t?t=(e||1)<<1:t+=1;var n=Math.random(),r=t-e;return~~(r*n+e)}function o(e){var t=0;return e||(t=2e3),r(e,t)}function i(e,t,n,r,i,s,a){return r.retry===!1?(i.emit("error",a),void i.removeAllListeners()):(r.default_back_off=r.default_back_off||0,r.retries=r.retries||0,"function"!=typeof r.back_off_function&&(r.back_off_function=o),r.retries++,r.max_retries&&r.retries>r.max_retries?(i.emit("error",new Error("tried "+r.retries+" times but replication failed")),void i.removeAllListeners()):(i.emit("requestError",a),"active"===i.state&&(i.emit("syncStopped"),i.state="stopped",i.once("syncRestarted",function(){r.current_back_off=r.default_back_off})),r.current_back_off=r.current_back_off||r.default_back_off,r.current_back_off=r.back_off_function(r.current_back_off),void setTimeout(function(){u(e,t,n,r,i)},r.current_back_off)))}function s(){d.call(this),this.cancelled=!1,this.state="pending";var e=this,t=new l.Promise(function(t,n){e.once("complete",t),e.once("error",n)});e.then=function(e,n){return t.then(e,n)},e["catch"]=function(e){return t["catch"](e)},e["catch"](function(){})}function a(e,t,n){var r=n.filter?n.filter.toString():"";return e.id().then(function(e){return t.id().then(function(t){var o=e+t+r+JSON.stringify(n.query_params)+n.doc_ids;return l.MD5(o).then(function(e){return e=e.replace(/\//g,".").replace(/\+/g,"_"),"_local/"+e})})})}function u(e,t,n,r,o,s){function a(){if(0!==T.docs.length){var e=T.docs;return n.bulkDocs({docs:e},{new_edits:!1}).then(function(e){if(P.cancelled)throw b(),new Error("cancelled");var t=[];e.forEach(function(e){if(e.error){s.doc_write_failures++;var n=new Error(e.reason||e.message||"Unknown reason");n.name=e.name||e.error,t.push(n)}}),s.errors=s.errors.concat(t),s.docs_written+=T.docs.length-t.length;var n=t.filter(function(e){return"unauthorized"!==e.name&&"forbidden"!==e.name});if(n.length>0){var r=new Error("bulkDocs error");throw r.other_errors=t,_("target.bulkDocs failed to write docs",r),new Error("bulkWrite partial failure")}},function(t){throw s.doc_write_failures+=e.length,t})}}function u(){for(var e=T.diffs,n=Object.keys(e)[0],r=e[n].missing,o=[],i=0;i<r.length;i+=p)o.push(r.slice(i,Math.min(r.length,i+p)));return l.Promise.all(o.map(function(r){return t.get(n,{revs:!0,open_revs:r,attachments:!0}).then(function(t){t.forEach(function(e){return P.cancelled?b():void(e.ok&&(s.docs_read++,T.pendingRevs++,T.docs.push(e.ok)))}),delete e[n]})}))}function c(){return Object.keys(T.diffs).length>0?u().then(c):l.Promise.resolve()}function f(){var e=Object.keys(T.diffs).filter(function(e){var t=T.diffs[e].missing;return 1===t.length&&"1-"===t[0].slice(0,2)});return t.allDocs({keys:e,include_docs:!0}).then(function(e){if(P.cancelled)throw b(),new Error("cancelled");e.rows.forEach(function(e){!e.doc||e.deleted||"1-"!==e.value.rev.slice(0,2)||e.doc._attachments&&0!==Object.keys(e.doc._attachments).length||(s.docs_read++,T.pendingRevs++,T.docs.push(e.doc),delete T.diffs[e.id])})})}function d(){return f().then(c)}function v(){return q=!0,U.writeCheckpoint(T.seq).then(function(){if(q=!1,P.cancelled)throw b(),new Error("cancelled");s.last_seq=O=T.seq,o.emit("change",l.clone(s)),T=void 0,A()})["catch"](function(e){throw q=!1,_("writeCheckpoint completed with error",e),e})}function g(){var e={};return T.changes.forEach(function(t){e[t.id]=t.changes.map(function(e){return e.rev})}),n.revsDiff(e).then(function(e){if(P.cancelled)throw b(),new Error("cancelled");T.diffs=e,T.pendingRevs=0})}function y(){if(!P.cancelled&&!T){if(0===x.length)return void m(!0);T=x.shift(),g().then(d).then(a).then(v).then(y)["catch"](function(e){_("batch processing terminated with error",e)})}}function m(e){return 0===I.changes.length?void(0!==x.length||T||((D&&F.live||L)&&o.emit("uptodate",l.clone(s)),L&&b())):void((e||L||I.changes.length>=C)&&(x.push(I),I={seq:0,changes:[],docs:[]},y()))}function _(e,t){R||(s.ok=!1,s.status="aborting",s.errors.push(t),x=[],I={seq:0,changes:[],docs:[]},b())}function b(){if(!(R||P.cancelled&&(s.status="cancelled",q))){s.status=s.status||"complete",s.end_time=new Date,s.last_seq=O,R=P.cancelled=!0;var a=s.errors.filter(function(e){return"unauthorized"!==e.name&&"forbidden"!==e.name});if(a.length>0){var u=s.errors.pop();s.errors.length>0&&(u.other_errors=s.errors),u.result=s,i(e,t,n,r,o,s,u)}else o.emit("complete",s),o.removeAllListeners()}}function w(e){return P.cancelled?b():(0!==I.changes.length||0!==x.length||T||o.emit("outofdate",l.clone(s)),I.seq=e.seq,I.changes.push(e),void m(0===x.length))}function E(e){return j=!1,P.cancelled?b():(F.since<e.last_seq?(F.since=e.last_seq,A()):D?(F.live=!0,A()):L=!0,void m(!0))}function S(e){return j=!1,P.cancelled?b():void _("changes rejected",e)}function A(){function e(){r.cancel()}function n(){o.removeListener("cancel",e)}if(!j&&!L&&x.length<N){j=!0,o.once("cancel",e);var r=t.changes(F).on("change",w);r.then(n,n),r.then(E)["catch"](S)}}function k(){U.getCheckpoint().then(function(e){O=e,F={since:O,limit:C,batch_size:C,style:"all_docs",doc_ids:B,returnDocs:!1},r.filter&&(F.filter=r.filter),r.query_params&&(F.query_params=r.query_params),A()})["catch"](function(e){_("getCheckpoint rejected with ",e)})}var T,x=[],I={seq:0,changes:[],docs:[]},q=!1,L=!1,R=!1,O=0,D=r.continuous||r.live||!1,C=r.batch_size||100,N=r.batches_limit||10,j=!1,B=r.doc_ids,P={cancelled:!1},U=new h(t,n,e,P);s=s||{ok:!0,start_time:new Date,docs_read:0,docs_written:0,doc_write_failures:0,errors:[]};var F={};o.ready(t,n),o.once("cancel",b),"function"==typeof r.onChange&&o.on("change",r.onChange),"function"==typeof r.complete&&(o.once("error",r.complete),o.once("complete",function(e){r.complete(null,e)})),"undefined"==typeof r.since?k():(q=!0,U.writeCheckpoint(r.since).then(function(){return q=!1,P.cancelled?void b():(O=r.since,void k())})["catch"](function(e){throw q=!1,_("writeCheckpoint completed with error",e),e}))}function c(e,t){var n=t.PouchConstructor;return"string"==typeof e?new n(e):e.then?e:l.Promise.resolve(e)}function f(e,t,n,r){"function"==typeof n&&(r=n,n={}),"undefined"==typeof n&&(n={}),n.complete||(n.complete=r||function(){}),n=l.clone(n),n.continuous=n.continuous||n.live,n.retry=n.retry||!1,n.PouchConstructor=n.PouchConstructor||this;var o=new s(n);return c(e,n).then(function(e){return c(t,n).then(function(t){return a(e,t,n).then(function(r){u(r,e,t,n,o)})})})["catch"](function(e){o.emit("error",e),n.complete(e)}),o}var l=e("./utils"),d=e("events").EventEmitter,h=e("./checkpointer"),p=50;l.inherits(s,d),s.prototype.cancel=function(){this.cancelled=!0,this.state="cancelled",this.emit("cancel")},s.prototype.ready=function(e,t){function n(){o.cancel()}function r(){e.removeListener("destroyed",n),t.removeListener("destroyed",n)}var o=this;this.once("change",function(){"pending"===this.state?(o.state="active",o.emit("syncStarted")):"stopped"===o.state&&(o.state="active",o.emit("syncRestarted"))}),e.once("destroyed",n),t.once("destroyed",n),this.then(r,r)},n.toPouch=c,n.replicate=f},{"./checkpointer":7,"./utils":25,events:33}],22:[function(e,t){(function(n){"use strict";var r=e("./constructor"),o=e("./utils"),i=o.Promise,s=e("events").EventEmitter;r.adapters={},r.preferredAdapters=e("./adapters/preferredAdapters.js"),r.prefix="_pouch_";var a=new s,u=["on","addListener","emit","listeners","once","removeAllListeners","removeListener","setMaxListeners"];u.forEach(function(e){r[e]=a[e].bind(a)}),r.setMaxListeners(0),r.parseAdapter=function(e,t){var i,s,a=e.match(/([a-z\-]*):\/\/(.*)/);if(a){if(e=/http(s?)/.test(a[1])?a[1]+"://"+a[2]:a[2],i=a[1],!r.adapters[i].valid())throw"Invalid adapter";return{name:e,adapter:a[1]}}var u="idb"in r.adapters&&"websql"in r.adapters&&o.hasLocalStorage()&&n.localStorage["_pouch__websqldb_"+r.prefix+e];if("undefined"!=typeof t&&t.db)s="leveldb";else for(var c=0;c<r.preferredAdapters.length;++c)if(s=r.preferredAdapters[c],s in r.adapters){if(u&&"idb"===s)continue;break}if(i=r.adapters[s],s&&i){var f="use_prefix"in i?i.use_prefix:!0;return{name:f?r.prefix+e:e,adapter:s}}throw"No valid adapter found"},r.destroy=o.toPromise(function(e,t,n){function s(){c.destroy(d,t,function(t,o){t?n(t):(r.emit("destroyed",e),r.emit(e,"destroyed"),n(null,o||{ok:!0}))})}("function"==typeof t||"undefined"==typeof t)&&(n=t,t={}),e&&"object"==typeof e&&(t=e,e=void 0);var a=r.parseAdapter(t.name||e,t),u=a.name,c=r.adapters[a.adapter],f="use_prefix"in c?c.use_prefix:!0,l=f?u.replace(new RegExp("^"+r.prefix),""):u,d=("http"===a.adapter||"https"===a.adapter?"":t.prefix||"")+u,h=o.extend(!0,{},t,{adapter:a.adapter});new r(l,h,function(e,u){return e?n(e):void u.get("_local/_pouch_dependentDbs",function(e,u){if(e)return 404!==e.status?n(e):s();var c=u.dependentDbs,l=Object.keys(c).map(function(e){var n=f?e.replace(new RegExp("^"+r.prefix),""):e,i=o.extend(!0,t,{adapter:a.adapter});return r.destroy(n,i)});i.all(l).then(s,function(e){n(e)})})})}),r.allDbs=o.toPromise(function(e){var t=new Error("allDbs method removed");t.stats="400",e(t)}),r.adapter=function(e,t){t.valid()&&(r.adapters[e]=t)},r.plugin=function(e){Object.keys(e).forEach(function(t){r.prototype[t]=e[t]})},r.defaults=function(e){function t(t,n,i){("function"==typeof n||"undefined"==typeof n)&&(i=n,n={}),t&&"object"==typeof t&&(n=t,t=void 0),n=o.extend(!0,{},e,n),r.call(this,t,n,i)}return o.inherits(t,r),t.destroy=o.toPromise(function(t,n,i){return("function"==typeof n||"undefined"==typeof n)&&(i=n,n={}),t&&"object"==typeof t&&(n=t,t=void 0),n=o.extend(!0,{},e,n),r.destroy(t,n,i)}),u.forEach(function(e){t[e]=a[e].bind(a)}),t.setMaxListeners(0),t.preferredAdapters=r.preferredAdapters.slice(),Object.keys(r).forEach(function(e){e in t||(t[e]=r[e])}),t},t.exports=r}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{"./adapters/preferredAdapters.js":4,"./constructor":8,"./utils":25,events:33}],23:[function(e,t){"use strict";function n(e,t,n,s){return"function"==typeof n&&(s=n,n={}),"undefined"==typeof n&&(n={}),n=o.clone(n),n.PouchConstructor=n.PouchConstructor||this,e=i.toPouch(e,n),t=i.toPouch(t,n),new r(e,t,n,s)}function r(e,t,n,r){function i(e){h||(h=!0,f.emit("cancel",e))}function a(e){f.emit("change",{direction:"pull",change:e})}function u(e){f.emit("change",{direction:"push",change:e})}function c(e){return function(t,n){var r="change"===t&&(n===a||n===u),o="cancel"===t&&n===i,s=t in p&&n===p[t];(r||o||s)&&(t in v||(v[t]={}),v[t][e]=!0,2===Object.keys(v[t]).length&&f.removeAllListeners(t))}}var f=this;this.canceled=!1;var l,d;"onChange"in n&&(l=n.onChange,delete n.onChange),"function"!=typeof r||n.complete?"complete"in n&&(d=n.complete,delete n.complete):d=r,this.push=s(e,t,n),this.pull=s(t,e,n);var h=!1,p={},v={};this.on("newListener",function(e){"change"===e?(f.pull.on("change",a),f.push.on("change",u)):"cancel"===e?(f.pull.on("cancel",i),f.push.on("cancel",i)):"error"===e||"removeListener"===e||"complete"===e||e in p||(p[e]=function(t){f.emit(e,t)},f.pull.on(e,p[e]),f.push.on(e,p[e]))}),this.on("removeListener",function(e){"change"===e?(f.pull.removeListener("change",a),f.push.removeListener("change",u)):"cancel"===e?(f.pull.removeListener("cancel",i),f.push.removeListener("cancel",i)):e in p&&"function"==typeof p[e]&&(f.pull.removeListener(e,p[e]),f.push.removeListener(e,p[e]),delete p[e])}),this.pull.on("removeListener",c("pull")),this.push.on("removeListener",c("push"));var g=o.Promise.all([this.push,this.pull]).then(function(e){var t={push:e[0],pull:e[1]};return f.emit("complete",t),d&&d(null,t),f.removeAllListeners(),t},function(e){throw f.cancel(),f.emit("error",e),d&&d(e),f.removeAllListeners(),e});this.then=function(e,t){return g.then(e,t)},this["catch"]=function(e){return g["catch"](e)}}var o=e("./utils"),i=e("./replicate"),s=i.replicate,a=e("events").EventEmitter;o.inherits(r,a),t.exports=n,r.prototype.cancel=function(){this.canceled||(this.canceled=!0,this.push.cancel(),this.pull.cancel())}},{"./replicate":21,"./utils":25,events:33}],24:[function(e,t){"use strict";function n(){this.isReady=!1,this.failed=!1,this.queue=[]}t.exports=n,n.prototype.execute=function(){var e,t;if(this.failed)for(;e=this.queue.shift();)"function"!=typeof e?(t=e.parameters[e.parameters.length-1],"function"==typeof t?t(this.failed):"changes"===e.name&&"function"==typeof t.complete&&t.complete(this.failed)):e(this.failed);else if(this.isReady)for(;e=this.queue.shift();)"function"==typeof e?e():e.task=this.db[e.name].apply(this.db,e.parameters)},n.prototype.fail=function(e){this.failed=e,this.execute()},n.prototype.ready=function(e){return this.failed?!1:0===arguments.length?this.isReady:(this.isReady=e?!0:!1,this.db=e,void this.execute())},n.prototype.addTask=function(e,t){if("function"!=typeof e){var n={name:e,parameters:t};return this.queue.push(n),this.failed&&this.execute(),n}this.queue.push(e),this.failed&&this.execute()}},{}],25:[function(e,t,n){(function(t,r){function o(e){var t={};return e.forEach(function(e){t[e]=!0}),t}function i(){return"undefined"!=typeof chrome&&"undefined"!=typeof chrome.storage&&"undefined"!=typeof chrome.storage.local}function s(){if(!(this instanceof s))return new s;var e=this;f.call(this),this.isChrome=i(),this.listeners={},this.hasLocal=!1,this.isChrome||(this.hasLocal=n.hasLocalStorage()),this.isChrome?chrome.storage.onChanged.addListener(function(t){null!=t.db_name&&e.emit(t.dbName.newValue)}):this.hasLocal&&(r.addEventListener?r.addEventListener("storage",function(t){e.emit(t.key)}):r.attachEvent("storage",function(t){e.emit(t.key)}))}var a=e("./merge");n.extend=e("pouchdb-extend"),n.ajax=e("./deps/ajax"),n.createBlob=e("./deps/blob"),n.uuid=e("./deps/uuid"),n.getArguments=e("argsarray");var u=e("./deps/buffer"),c=e("./deps/errors"),f=e("events").EventEmitter,l=e("./deps/collections");n.Map=l.Map,n.Set=l.Set,n.Promise="function"==typeof r.Promise?r.Promise:e("bluebird");var d=n.Promise,h=o(["_id","_rev","_attachments","_deleted","_revisions","_revs_info","_conflicts","_deleted_conflicts","_local_seq","_rev_tree","_replication_id","_replication_state","_replication_state_time","_replication_state_reason","_replication_stats"]),p=o(["_attachments","_replication_id","_replication_state","_replication_state_time","_replication_state_reason","_replication_stats"]);n.lastIndexOf=function(e,t){for(var n=e.length-1;n>=0;n--)if(e.charAt(n)===t)return n;return-1},n.clone=function(e){return n.extend(!0,{},e)},n.pick=function(e,t){for(var n={},r=0,o=t.length;o>r;r++){var i=t[r];n[i]=e[i]}return n},n.inherits=e("inherits"),n.invalidIdError=function(e){var t;if(e?"string"!=typeof e?(t=new TypeError(c.INVALID_ID.message),t.status=400):/^_/.test(e)&&!/^_(design|local)/.test(e)&&(t=new TypeError(c.RESERVED_ID.message),t.status=400):(t=new TypeError(c.MISSING_ID.message),t.status=412),t)throw t},n.call=n.getArguments(function(e){if(e.length){var t=e.shift();"function"==typeof t&&t.apply(this,e)}}),n.isLocalId=function(e){return/^_local/.test(e)},n.isDeleted=function(e,t){t||(t=a.winningRev(e));var n=t.indexOf("-");-1!==n&&(t=t.substring(n+1));var r=!1;return a.traverseRevTree(e.rev_tree,function(e,n,o,i,s){o===t&&(r=!!s.deleted)}),r},n.revExists=function(e,t){var n=!1;return a.traverseRevTree(e.rev_tree,function(e,r,o){r+"-"+o===t&&(n=!0)}),n},n.filterChange=function(e){var t={},n=e.filter&&"function"==typeof e.filter;return t.query=e.query_params,function(r){if(e.filter&&n&&!e.filter.call(this,r.doc,t))return!1;if(e.include_docs){if(!e.attachments)for(var o in r.doc._attachments)r.doc._attachments.hasOwnProperty(o)&&(r.doc._attachments[o].stub=!0)}else delete r.doc;return!0}},n.parseDoc=function(e,t){var r,o,i,s,a={status:"available"};if(e._deleted&&(a.deleted=!0),t)if(e._id||(e._id=n.uuid()),o=n.uuid(32,16).toLowerCase(),e._rev){if(i=/^(\d+)-(.+)$/.exec(e._rev),!i)return s=new Error("bad_request"),s.message="Invalid rev format",s.error=!0,s;e._rev_tree=[{pos:parseInt(i[1],10),ids:[i[2],{status:"missing"},[[o,a,[]]]]}],r=parseInt(i[1],10)+1}else e._rev_tree=[{pos:1,ids:[o,a,[]]}],r=1;else if(e._revisions&&(e._rev_tree=[{pos:e._revisions.start-e._revisions.ids.length+1,ids:e._revisions.ids.reduce(function(e,t){return null===e?[t,a,[]]:[t,{status:"missing"},[e]]},null)}],r=e._revisions.start,o=e._revisions.ids[0]),!e._rev_tree){if(i=/^(\d+)-(.+)$/.exec(e._rev),!i)return s=new Error("bad_request"),s.message="Invalid rev format",s.error=!0,s;r=parseInt(i[1],10),o=i[2],e._rev_tree=[{pos:parseInt(i[1],10),ids:[i[2],a,[]]}]}n.invalidIdError(e._id),e._rev=[r,o].join("-");var u={metadata:{},data:{}};for(var f in e)if(e.hasOwnProperty(f)){var l="_"===f[0];if(l&&!h[f])throw s=new Error(c.DOC_VALIDATION.message+": "+f),s.status=c.DOC_VALIDATION.status,s;l&&!p[f]?u.metadata[f.slice(1)]=e[f]:u.data[f]=e[f]}return u},n.isCordova=function(){return"undefined"!=typeof cordova||"undefined"!=typeof PhoneGap||"undefined"!=typeof phonegap},n.hasLocalStorage=function(){if(i())return!1;try{return r.localStorage}catch(e){return!1}},n.Changes=s,n.inherits(s,f),s.prototype.addListener=function(e,t,r,o){function i(){r.changes({include_docs:o.include_docs,attachments:o.attachments,conflicts:o.conflicts,continuous:!1,descending:!1,filter:o.filter,doc_ids:o.doc_ids,view:o.view,since:o.since,query_params:o.query_params,onChange:function(e){e.seq>o.since&&!o.cancelled&&(o.since=e.seq,n.call(o.onChange,e))}})}this.listeners[t]||(this.listeners[t]=i,this.on(e,i))},s.prototype.removeListener=function(e,t){t in this.listeners&&f.prototype.removeListener.call(this,e,this.listeners[t])},s.prototype.notifyLocalWindows=function(e){this.isChrome?chrome.storage.local.set({dbName:e}):this.hasLocal&&(localStorage[e]="a"===localStorage[e]?"b":"a")},s.prototype.notify=function(e){this.emit(e),this.notifyLocalWindows(e)},n.atob=t.browser&&"atob"in r?function(e){return atob(e)}:function(e){var t=new u(e,"base64");if(t.toString("base64")!==e)throw"Cannot base64 encode full string";return t.toString("binary")},n.btoa=t.browser&&"btoa"in r?function(e){return btoa(e)}:function(e){return new u(e,"binary").toString("base64")},n.fixBinary=function(e){if(!t.browser)return e;for(var n=e.length,r=new ArrayBuffer(n),o=new Uint8Array(r),i=0;n>i;i++)o[i]=e.charCodeAt(i);return r},n.readAsBinaryString=function(e,t){var r=new FileReader,o="function"==typeof r.readAsBinaryString;r.onloadend=function(e){var r=e.target.result||"";return o?t(r):void t(n.arrayBufferToBinaryString(r))},o?r.readAsBinaryString(e):r.readAsArrayBuffer(e)},n.once=function(e){var t=!1;return n.getArguments(function(n){if(t)throw new Error("once called  more than once");t=!0,e.apply(this,n)})},n.toPromise=function(e){return n.getArguments(function(r){var o,i=this,s="function"==typeof r[r.length-1]?r.pop():!1;s&&(o=function(e,n){t.nextTick(function(){s(e,n)})});var a=new d(function(t,o){var s;try{var a=n.once(function(e,n){e?o(e):t(n)});r.push(a),s=e.apply(i,r),s&&"function"==typeof s.then&&t(s)}catch(u){o(u)}});return o&&a.then(function(e){o(null,e)},o),a.cancel=function(){return this},a})},n.adapterFun=function(t,r){function o(e,t,n){if(i.enabled){for(var r=[e._db_name,t],o=0;o<n.length-1;o++)r.push(n[o]);i.apply(null,r);var s=n[n.length-1];n[n.length-1]=function(n,r){var o=[e._db_name,t];o=o.concat(n?["error",n]:["success",r]),i.apply(null,o),s(n,r)}}}var i=e("debug")("pouchdb:api");return n.toPromise(n.getArguments(function(e){if(this._closed)return d.reject(new Error("database is closed"));var i=this;return o(i,t,e),this.taskqueue.isReady?r.apply(this,e):new n.Promise(function(n,r){i.taskqueue.addTask(function(o){o?r(o):n(i[t].apply(i,e))})})}))},n.arrayBufferToBinaryString=function(e){for(var t="",n=new Uint8Array(e),r=n.byteLength,o=0;r>o;o++)t+=String.fromCharCode(n[o]);return t},n.cancellableFun=function(e,t,r){r=r?n.clone(!0,{},r):{};var o=new f,i=r.complete||function(){},s=r.complete=n.once(function(e,t){e?i(e):(o.emit("end",t),i(null,t)),o.removeAllListeners()}),a=r.onChange||function(){},u=0;t.on("destroyed",function(){o.removeAllListeners()}),r.onChange=function(e){a(e),e.seq<=u||(u=e.seq,o.emit("change",e),e.deleted?o.emit("delete",e):1===e.changes.length&&"1-"===e.changes[0].rev.slice(0,1)?o.emit("create",e):o.emit("update",e))};var c=new d(function(e,t){r.complete=function(n,r){n?t(n):e(r)}});return c.then(function(e){s(null,e)},s),c.cancel=function(){c.isCancelled=!0,t.taskqueue.isReady&&r.complete(null,{status:"cancelled"})},t.taskqueue.isReady?e(t,r,c):t.taskqueue.addTask(function(){c.isCancelled?r.complete(null,{status:"cancelled"}):e(t,r,c)}),c.on=o.on.bind(o),c.once=o.once.bind(o),c.addListener=o.addListener.bind(o),c.removeListener=o.removeListener.bind(o),c.removeAllListeners=o.removeAllListeners.bind(o),c.setMaxListeners=o.setMaxListeners.bind(o),c.listeners=o.listeners.bind(o),c.emit=o.emit.bind(o),c},n.MD5=n.toPromise(e("./deps/md5")),n.explain404=function(e){t.browser&&"console"in r&&"info"in console&&console.info("The above 404 is totally normal. "+e)},n.parseUri=e("./deps/parse-uri"),n.compare=function(e,t){return t>e?-1:e>t?1:0},n.updateDoc=function(e,t,r,o,i,s,u){if(n.revExists(e,t.metadata.rev))return r[o]=t,i();
var f=n.isDeleted(e),l=n.isDeleted(t.metadata),d=/^1-/.test(t.metadata.rev);if(f&&!l&&u&&d){var h=t.data;h._rev=a.winningRev(e),h._id=t.metadata.id,t=n.parseDoc(h,u)}var p=a.merge(e.rev_tree,t.metadata.rev_tree[0],1e3),v=u&&(f&&l||!f&&"new_leaf"!==p.conflicts||f&&!l&&"new_branch"===p.conflicts);if(v){var g=c.REV_CONFLICT;return r[o]=g,i()}t.metadata.rev_tree=p.tree;var y=a.winningRev(t.metadata);l=n.isDeleted(t.metadata,y),s(t,y,l,i,!0,o)},n.processDocs=function(e,t,r,o,i,s,u){function f(e,t,r){var o=a.winningRev(e.metadata),f=n.isDeleted(e.metadata,o);return"was_delete"in u&&f?(i[t]=c.MISSING_DOC,r()):void s(e,o,f,r,!1,t)}if(e.length){var l=u.new_edits,d=new n.Map;e.forEach(function(e,r){if(e._id&&n.isLocalId(e._id))return void t[e._deleted?"_removeLocal":"_putLocal"](e,{ctx:o},function(e){i[r]=e?e:{}});var s=e.metadata.id;d.has(s)?d.get(s).push([e,r]):d.set(s,[[e,r]])}),d.forEach(function(e,t){function o(){++u<e.length&&a()}function a(){var a=e[u],c=a[0],d=a[1];r.has(t)?n.updateDoc(r.get(t),c,i,d,o,s,l):f(c,d,o)}var u=0;a()})}},n.preprocessAttachments=function(e,t,r){function o(e){try{return n.atob(e)}catch(t){var r=c.error(c.BAD_ARG,"Attachments need to be base64 encoded");return{error:r}}}function i(e,r){if(e.stub)return r();if("string"==typeof e.data){var i=o(e.data);if(i.error)return r(i.error);e.length=i.length,e.data="blob"===t?n.createBlob([n.fixBinary(i)],{type:e.content_type}):"base64"===t?n.btoa(i):i,n.MD5(i).then(function(t){e.digest="md5-"+t,r()})}else n.readAsBinaryString(e.data,function(o){"binary"===t?e.data=o:"base64"===t&&(e.data=n.btoa(o)),n.MD5(o).then(function(t){e.digest="md5-"+t,e.length=o.length,r()})})}function s(){u++,e.length===u&&(a?r(a):r())}if(!e.length)return r();var a,u=0;e.forEach(function(e){function t(e){a=e,r++,r===n.length&&s()}var n=e.data&&e.data._attachments?Object.keys(e.data._attachments):[],r=0;if(!n.length)return s();for(var o in e.data._attachments)e.data._attachments.hasOwnProperty(o)&&i(e.data._attachments[o],t)})}}).call(this,e("_process"),"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{"./deps/ajax":9,"./deps/blob":10,"./deps/buffer":28,"./deps/collections":11,"./deps/errors":12,"./deps/md5":13,"./deps/parse-uri":15,"./deps/uuid":17,"./merge":20,_process:34,argsarray:27,bluebird:42,debug:35,events:33,inherits:38,"pouchdb-extend":57}],26:[function(e,t){t.exports="3.2.0"},{}],27:[function(e,t){"use strict";function n(e){return function(){var t=arguments.length;if(t){for(var n=[],r=-1;++r<t;)n[r]=arguments[r];return e.call(this,n)}return e.call(this,[])}}t.exports=n},{}],28:[function(){},{}],29:[function(e,t,n){function r(e,t,n){if(!(this instanceof r))return new r(e,t,n);var o,i=typeof e;if("number"===i)o=e>0?e>>>0:0;else if("string"===i)"base64"===t&&(e=S(e)),o=r.byteLength(e,t);else{if("object"!==i||null===e)throw new TypeError("must start with number, buffer, array or string");"Buffer"===e.type&&N(e.data)&&(e=e.data),o=+e.length>0?Math.floor(+e.length):0}if(this.length>j)throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x"+j.toString(16)+" bytes");var s;r.TYPED_ARRAY_SUPPORT?s=r._augment(new Uint8Array(o)):(s=this,s.length=o,s._isBuffer=!0);var a;if(r.TYPED_ARRAY_SUPPORT&&"number"==typeof e.byteLength)s._set(e);else if(k(e))if(r.isBuffer(e))for(a=0;o>a;a++)s[a]=e.readUInt8(a);else for(a=0;o>a;a++)s[a]=(e[a]%256+256)%256;else if("string"===i)s.write(e,0,t);else if("number"===i&&!r.TYPED_ARRAY_SUPPORT&&!n)for(a=0;o>a;a++)s[a]=0;return s}function o(e,t,n,r){n=Number(n)||0;var o=e.length-n;r?(r=Number(r),r>o&&(r=o)):r=o;var i=t.length;if(i%2!==0)throw new Error("Invalid hex string");r>i/2&&(r=i/2);for(var s=0;r>s;s++){var a=parseInt(t.substr(2*s,2),16);if(isNaN(a))throw new Error("Invalid hex string");e[n+s]=a}return s}function i(e,t,n,r){var o=R(x(t),e,n,r);return o}function s(e,t,n,r){var o=R(I(t),e,n,r);return o}function a(e,t,n,r){return s(e,t,n,r)}function u(e,t,n,r){var o=R(L(t),e,n,r);return o}function c(e,t,n,r){var o=R(q(t),e,n,r);return o}function f(e,t,n){return D.fromByteArray(0===t&&n===e.length?e:e.slice(t,n))}function l(e,t,n){var r="",o="";n=Math.min(e.length,n);for(var i=t;n>i;i++)e[i]<=127?(r+=O(o)+String.fromCharCode(e[i]),o=""):o+="%"+e[i].toString(16);return r+O(o)}function d(e,t,n){var r="";n=Math.min(e.length,n);for(var o=t;n>o;o++)r+=String.fromCharCode(e[o]);return r}function h(e,t,n){return d(e,t,n)}function p(e,t,n){var r=e.length;(!t||0>t)&&(t=0),(!n||0>n||n>r)&&(n=r);for(var o="",i=t;n>i;i++)o+=T(e[i]);return o}function v(e,t,n){for(var r=e.slice(t,n),o="",i=0;i<r.length;i+=2)o+=String.fromCharCode(r[i]+256*r[i+1]);return o}function g(e,t,n){if(e%1!==0||0>e)throw new RangeError("offset is not uint");if(e+t>n)throw new RangeError("Trying to access beyond buffer length")}function y(e,t,n,o,i,s){if(!r.isBuffer(e))throw new TypeError("buffer must be a Buffer instance");if(t>i||s>t)throw new TypeError("value is out of bounds");if(n+o>e.length)throw new TypeError("index out of range")}function m(e,t,n,r){0>t&&(t=65535+t+1);for(var o=0,i=Math.min(e.length-n,2);i>o;o++)e[n+o]=(t&255<<8*(r?o:1-o))>>>8*(r?o:1-o)}function _(e,t,n,r){0>t&&(t=4294967295+t+1);for(var o=0,i=Math.min(e.length-n,4);i>o;o++)e[n+o]=t>>>8*(r?o:3-o)&255}function b(e,t,n,r,o,i){if(t>o||i>t)throw new TypeError("value is out of bounds");if(n+r>e.length)throw new TypeError("index out of range")}function w(e,t,n,r,o){return o||b(e,t,n,4,3.4028234663852886e38,-3.4028234663852886e38),C.write(e,t,n,r,23,4),n+4}function E(e,t,n,r,o){return o||b(e,t,n,8,1.7976931348623157e308,-1.7976931348623157e308),C.write(e,t,n,r,52,8),n+8}function S(e){for(e=A(e).replace(P,"");e.length%4!==0;)e+="=";return e}function A(e){return e.trim?e.trim():e.replace(/^\s+|\s+$/g,"")}function k(e){return N(e)||r.isBuffer(e)||e&&"object"==typeof e&&"number"==typeof e.length}function T(e){return 16>e?"0"+e.toString(16):e.toString(16)}function x(e){for(var t=[],n=0;n<e.length;n++){var r=e.charCodeAt(n);if(127>=r)t.push(r);else{var o=n;r>=55296&&57343>=r&&n++;for(var i=encodeURIComponent(e.slice(o,n+1)).substr(1).split("%"),s=0;s<i.length;s++)t.push(parseInt(i[s],16))}}return t}function I(e){for(var t=[],n=0;n<e.length;n++)t.push(255&e.charCodeAt(n));return t}function q(e){for(var t,n,r,o=[],i=0;i<e.length;i++)t=e.charCodeAt(i),n=t>>8,r=t%256,o.push(r),o.push(n);return o}function L(e){return D.toByteArray(e)}function R(e,t,n,r){for(var o=0;r>o&&!(o+n>=t.length||o>=e.length);o++)t[o+n]=e[o];return o}function O(e){try{return decodeURIComponent(e)}catch(t){return String.fromCharCode(65533)}}var D=e("base64-js"),C=e("ieee754"),N=e("is-array");n.Buffer=r,n.SlowBuffer=r,n.INSPECT_MAX_BYTES=50,r.poolSize=8192;var j=1073741823;r.TYPED_ARRAY_SUPPORT=function(){try{var e=new ArrayBuffer(0),t=new Uint8Array(e);return t.foo=function(){return 42},42===t.foo()&&"function"==typeof t.subarray&&0===new Uint8Array(1).subarray(1,1).byteLength}catch(n){return!1}}(),r.isBuffer=function(e){return!(null==e||!e._isBuffer)},r.compare=function(e,t){if(!r.isBuffer(e)||!r.isBuffer(t))throw new TypeError("Arguments must be Buffers");for(var n=e.length,o=t.length,i=0,s=Math.min(n,o);s>i&&e[i]===t[i];i++);return i!==s&&(n=e[i],o=t[i]),o>n?-1:n>o?1:0},r.isEncoding=function(e){switch(String(e).toLowerCase()){case"hex":case"utf8":case"utf-8":case"ascii":case"binary":case"base64":case"raw":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return!0;default:return!1}},r.concat=function(e,t){if(!N(e))throw new TypeError("Usage: Buffer.concat(list[, length])");if(0===e.length)return new r(0);if(1===e.length)return e[0];var n;if(void 0===t)for(t=0,n=0;n<e.length;n++)t+=e[n].length;var o=new r(t),i=0;for(n=0;n<e.length;n++){var s=e[n];s.copy(o,i),i+=s.length}return o},r.byteLength=function(e,t){var n;switch(e+="",t||"utf8"){case"ascii":case"binary":case"raw":n=e.length;break;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":n=2*e.length;break;case"hex":n=e.length>>>1;break;case"utf8":case"utf-8":n=x(e).length;break;case"base64":n=L(e).length;break;default:n=e.length}return n},r.prototype.length=void 0,r.prototype.parent=void 0,r.prototype.toString=function(e,t,n){var r=!1;if(t>>>=0,n=void 0===n||1/0===n?this.length:n>>>0,e||(e="utf8"),0>t&&(t=0),n>this.length&&(n=this.length),t>=n)return"";for(;;)switch(e){case"hex":return p(this,t,n);case"utf8":case"utf-8":return l(this,t,n);case"ascii":return d(this,t,n);case"binary":return h(this,t,n);case"base64":return f(this,t,n);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return v(this,t,n);default:if(r)throw new TypeError("Unknown encoding: "+e);e=(e+"").toLowerCase(),r=!0}},r.prototype.equals=function(e){if(!r.isBuffer(e))throw new TypeError("Argument must be a Buffer");return 0===r.compare(this,e)},r.prototype.inspect=function(){var e="",t=n.INSPECT_MAX_BYTES;return this.length>0&&(e=this.toString("hex",0,t).match(/.{2}/g).join(" "),this.length>t&&(e+=" ... ")),"<Buffer "+e+">"},r.prototype.compare=function(e){if(!r.isBuffer(e))throw new TypeError("Argument must be a Buffer");return r.compare(this,e)},r.prototype.get=function(e){return console.log(".get() is deprecated. Access using array indexes instead."),this.readUInt8(e)},r.prototype.set=function(e,t){return console.log(".set() is deprecated. Access using array indexes instead."),this.writeUInt8(e,t)},r.prototype.write=function(e,t,n,r){if(isFinite(t))isFinite(n)||(r=n,n=void 0);else{var f=r;r=t,t=n,n=f}t=Number(t)||0;var l=this.length-t;n?(n=Number(n),n>l&&(n=l)):n=l,r=String(r||"utf8").toLowerCase();var d;switch(r){case"hex":d=o(this,e,t,n);break;case"utf8":case"utf-8":d=i(this,e,t,n);break;case"ascii":d=s(this,e,t,n);break;case"binary":d=a(this,e,t,n);break;case"base64":d=u(this,e,t,n);break;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":d=c(this,e,t,n);break;default:throw new TypeError("Unknown encoding: "+r)}return d},r.prototype.toJSON=function(){return{type:"Buffer",data:Array.prototype.slice.call(this._arr||this,0)}},r.prototype.slice=function(e,t){var n=this.length;if(e=~~e,t=void 0===t?n:~~t,0>e?(e+=n,0>e&&(e=0)):e>n&&(e=n),0>t?(t+=n,0>t&&(t=0)):t>n&&(t=n),e>t&&(t=e),r.TYPED_ARRAY_SUPPORT)return r._augment(this.subarray(e,t));for(var o=t-e,i=new r(o,void 0,!0),s=0;o>s;s++)i[s]=this[s+e];return i},r.prototype.readUInt8=function(e,t){return t||g(e,1,this.length),this[e]},r.prototype.readUInt16LE=function(e,t){return t||g(e,2,this.length),this[e]|this[e+1]<<8},r.prototype.readUInt16BE=function(e,t){return t||g(e,2,this.length),this[e]<<8|this[e+1]},r.prototype.readUInt32LE=function(e,t){return t||g(e,4,this.length),(this[e]|this[e+1]<<8|this[e+2]<<16)+16777216*this[e+3]},r.prototype.readUInt32BE=function(e,t){return t||g(e,4,this.length),16777216*this[e]+(this[e+1]<<16|this[e+2]<<8|this[e+3])},r.prototype.readInt8=function(e,t){return t||g(e,1,this.length),128&this[e]?-1*(255-this[e]+1):this[e]},r.prototype.readInt16LE=function(e,t){t||g(e,2,this.length);var n=this[e]|this[e+1]<<8;return 32768&n?4294901760|n:n},r.prototype.readInt16BE=function(e,t){t||g(e,2,this.length);var n=this[e+1]|this[e]<<8;return 32768&n?4294901760|n:n},r.prototype.readInt32LE=function(e,t){return t||g(e,4,this.length),this[e]|this[e+1]<<8|this[e+2]<<16|this[e+3]<<24},r.prototype.readInt32BE=function(e,t){return t||g(e,4,this.length),this[e]<<24|this[e+1]<<16|this[e+2]<<8|this[e+3]},r.prototype.readFloatLE=function(e,t){return t||g(e,4,this.length),C.read(this,e,!0,23,4)},r.prototype.readFloatBE=function(e,t){return t||g(e,4,this.length),C.read(this,e,!1,23,4)},r.prototype.readDoubleLE=function(e,t){return t||g(e,8,this.length),C.read(this,e,!0,52,8)},r.prototype.readDoubleBE=function(e,t){return t||g(e,8,this.length),C.read(this,e,!1,52,8)},r.prototype.writeUInt8=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,1,255,0),r.TYPED_ARRAY_SUPPORT||(e=Math.floor(e)),this[t]=e,t+1},r.prototype.writeUInt16LE=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,2,65535,0),r.TYPED_ARRAY_SUPPORT?(this[t]=e,this[t+1]=e>>>8):m(this,e,t,!0),t+2},r.prototype.writeUInt16BE=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,2,65535,0),r.TYPED_ARRAY_SUPPORT?(this[t]=e>>>8,this[t+1]=e):m(this,e,t,!1),t+2},r.prototype.writeUInt32LE=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,4,4294967295,0),r.TYPED_ARRAY_SUPPORT?(this[t+3]=e>>>24,this[t+2]=e>>>16,this[t+1]=e>>>8,this[t]=e):_(this,e,t,!0),t+4},r.prototype.writeUInt32BE=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,4,4294967295,0),r.TYPED_ARRAY_SUPPORT?(this[t]=e>>>24,this[t+1]=e>>>16,this[t+2]=e>>>8,this[t+3]=e):_(this,e,t,!1),t+4},r.prototype.writeInt8=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,1,127,-128),r.TYPED_ARRAY_SUPPORT||(e=Math.floor(e)),0>e&&(e=255+e+1),this[t]=e,t+1},r.prototype.writeInt16LE=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,2,32767,-32768),r.TYPED_ARRAY_SUPPORT?(this[t]=e,this[t+1]=e>>>8):m(this,e,t,!0),t+2},r.prototype.writeInt16BE=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,2,32767,-32768),r.TYPED_ARRAY_SUPPORT?(this[t]=e>>>8,this[t+1]=e):m(this,e,t,!1),t+2},r.prototype.writeInt32LE=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,4,2147483647,-2147483648),r.TYPED_ARRAY_SUPPORT?(this[t]=e,this[t+1]=e>>>8,this[t+2]=e>>>16,this[t+3]=e>>>24):_(this,e,t,!0),t+4},r.prototype.writeInt32BE=function(e,t,n){return e=+e,t>>>=0,n||y(this,e,t,4,2147483647,-2147483648),0>e&&(e=4294967295+e+1),r.TYPED_ARRAY_SUPPORT?(this[t]=e>>>24,this[t+1]=e>>>16,this[t+2]=e>>>8,this[t+3]=e):_(this,e,t,!1),t+4},r.prototype.writeFloatLE=function(e,t,n){return w(this,e,t,!0,n)},r.prototype.writeFloatBE=function(e,t,n){return w(this,e,t,!1,n)},r.prototype.writeDoubleLE=function(e,t,n){return E(this,e,t,!0,n)},r.prototype.writeDoubleBE=function(e,t,n){return E(this,e,t,!1,n)},r.prototype.copy=function(e,t,n,o){var i=this;if(n||(n=0),o||0===o||(o=this.length),t||(t=0),o!==n&&0!==e.length&&0!==i.length){if(n>o)throw new TypeError("sourceEnd < sourceStart");if(0>t||t>=e.length)throw new TypeError("targetStart out of bounds");if(0>n||n>=i.length)throw new TypeError("sourceStart out of bounds");if(0>o||o>i.length)throw new TypeError("sourceEnd out of bounds");o>this.length&&(o=this.length),e.length-t<o-n&&(o=e.length-t+n);var s=o-n;if(1e3>s||!r.TYPED_ARRAY_SUPPORT)for(var a=0;s>a;a++)e[a+t]=this[a+n];else e._set(this.subarray(n,n+s),t)}},r.prototype.fill=function(e,t,n){if(e||(e=0),t||(t=0),n||(n=this.length),t>n)throw new TypeError("end < start");if(n!==t&&0!==this.length){if(0>t||t>=this.length)throw new TypeError("start out of bounds");if(0>n||n>this.length)throw new TypeError("end out of bounds");var r;if("number"==typeof e)for(r=t;n>r;r++)this[r]=e;else{var o=x(e.toString()),i=o.length;for(r=t;n>r;r++)this[r]=o[r%i]}return this}},r.prototype.toArrayBuffer=function(){if("undefined"!=typeof Uint8Array){if(r.TYPED_ARRAY_SUPPORT)return new r(this).buffer;for(var e=new Uint8Array(this.length),t=0,n=e.length;n>t;t+=1)e[t]=this[t];return e.buffer}throw new TypeError("Buffer.toArrayBuffer not supported in this browser")};var B=r.prototype;r._augment=function(e){return e.constructor=r,e._isBuffer=!0,e._get=e.get,e._set=e.set,e.get=B.get,e.set=B.set,e.write=B.write,e.toString=B.toString,e.toLocaleString=B.toString,e.toJSON=B.toJSON,e.equals=B.equals,e.compare=B.compare,e.copy=B.copy,e.slice=B.slice,e.readUInt8=B.readUInt8,e.readUInt16LE=B.readUInt16LE,e.readUInt16BE=B.readUInt16BE,e.readUInt32LE=B.readUInt32LE,e.readUInt32BE=B.readUInt32BE,e.readInt8=B.readInt8,e.readInt16LE=B.readInt16LE,e.readInt16BE=B.readInt16BE,e.readInt32LE=B.readInt32LE,e.readInt32BE=B.readInt32BE,e.readFloatLE=B.readFloatLE,e.readFloatBE=B.readFloatBE,e.readDoubleLE=B.readDoubleLE,e.readDoubleBE=B.readDoubleBE,e.writeUInt8=B.writeUInt8,e.writeUInt16LE=B.writeUInt16LE,e.writeUInt16BE=B.writeUInt16BE,e.writeUInt32LE=B.writeUInt32LE,e.writeUInt32BE=B.writeUInt32BE,e.writeInt8=B.writeInt8,e.writeInt16LE=B.writeInt16LE,e.writeInt16BE=B.writeInt16BE,e.writeInt32LE=B.writeInt32LE,e.writeInt32BE=B.writeInt32BE,e.writeFloatLE=B.writeFloatLE,e.writeFloatBE=B.writeFloatBE,e.writeDoubleLE=B.writeDoubleLE,e.writeDoubleBE=B.writeDoubleBE,e.fill=B.fill,e.inspect=B.inspect,e.toArrayBuffer=B.toArrayBuffer,e};var P=/[^+\/0-9A-z]/g},{"base64-js":30,ieee754:31,"is-array":32}],30:[function(e,t,n){var r="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";!function(e){"use strict";function t(e){var t=e.charCodeAt(0);return t===s?62:t===a?63:u>t?-1:u+10>t?t-u+26+26:f+26>t?t-f:c+26>t?t-c+26:void 0}function n(e){function n(e){c[l++]=e}var r,o,s,a,u,c;if(e.length%4>0)throw new Error("Invalid string. Length must be a multiple of 4");var f=e.length;u="="===e.charAt(f-2)?2:"="===e.charAt(f-1)?1:0,c=new i(3*e.length/4-u),s=u>0?e.length-4:e.length;var l=0;for(r=0,o=0;s>r;r+=4,o+=3)a=t(e.charAt(r))<<18|t(e.charAt(r+1))<<12|t(e.charAt(r+2))<<6|t(e.charAt(r+3)),n((16711680&a)>>16),n((65280&a)>>8),n(255&a);return 2===u?(a=t(e.charAt(r))<<2|t(e.charAt(r+1))>>4,n(255&a)):1===u&&(a=t(e.charAt(r))<<10|t(e.charAt(r+1))<<4|t(e.charAt(r+2))>>2,n(a>>8&255),n(255&a)),c}function o(e){function t(e){return r.charAt(e)}function n(e){return t(e>>18&63)+t(e>>12&63)+t(e>>6&63)+t(63&e)}var o,i,s,a=e.length%3,u="";for(o=0,s=e.length-a;s>o;o+=3)i=(e[o]<<16)+(e[o+1]<<8)+e[o+2],u+=n(i);switch(a){case 1:i=e[e.length-1],u+=t(i>>2),u+=t(i<<4&63),u+="==";break;case 2:i=(e[e.length-2]<<8)+e[e.length-1],u+=t(i>>10),u+=t(i>>4&63),u+=t(i<<2&63),u+="="}return u}var i="undefined"!=typeof Uint8Array?Uint8Array:Array,s="+".charCodeAt(0),a="/".charCodeAt(0),u="0".charCodeAt(0),c="a".charCodeAt(0),f="A".charCodeAt(0);e.toByteArray=n,e.fromByteArray=o}("undefined"==typeof n?this.base64js={}:n)},{}],31:[function(e,t,n){n.read=function(e,t,n,r,o){var i,s,a=8*o-r-1,u=(1<<a)-1,c=u>>1,f=-7,l=n?o-1:0,d=n?-1:1,h=e[t+l];for(l+=d,i=h&(1<<-f)-1,h>>=-f,f+=a;f>0;i=256*i+e[t+l],l+=d,f-=8);for(s=i&(1<<-f)-1,i>>=-f,f+=r;f>0;s=256*s+e[t+l],l+=d,f-=8);if(0===i)i=1-c;else{if(i===u)return s?0/0:1/0*(h?-1:1);s+=Math.pow(2,r),i-=c}return(h?-1:1)*s*Math.pow(2,i-r)},n.write=function(e,t,n,r,o,i){var s,a,u,c=8*i-o-1,f=(1<<c)-1,l=f>>1,d=23===o?Math.pow(2,-24)-Math.pow(2,-77):0,h=r?0:i-1,p=r?1:-1,v=0>t||0===t&&0>1/t?1:0;for(t=Math.abs(t),isNaN(t)||1/0===t?(a=isNaN(t)?1:0,s=f):(s=Math.floor(Math.log(t)/Math.LN2),t*(u=Math.pow(2,-s))<1&&(s--,u*=2),t+=s+l>=1?d/u:d*Math.pow(2,1-l),t*u>=2&&(s++,u/=2),s+l>=f?(a=0,s=f):s+l>=1?(a=(t*u-1)*Math.pow(2,o),s+=l):(a=t*Math.pow(2,l-1)*Math.pow(2,o),s=0));o>=8;e[n+h]=255&a,h+=p,a/=256,o-=8);for(s=s<<o|a,c+=o;c>0;e[n+h]=255&s,h+=p,s/=256,c-=8);e[n+h-p]|=128*v}},{}],32:[function(e,t){var n=Array.isArray,r=Object.prototype.toString;t.exports=n||function(e){return!!e&&"[object Array]"==r.call(e)}},{}],33:[function(e,t){function n(){this._events=this._events||{},this._maxListeners=this._maxListeners||void 0}function r(e){return"function"==typeof e}function o(e){return"number"==typeof e}function i(e){return"object"==typeof e&&null!==e}function s(e){return void 0===e}t.exports=n,n.EventEmitter=n,n.prototype._events=void 0,n.prototype._maxListeners=void 0,n.defaultMaxListeners=10,n.prototype.setMaxListeners=function(e){if(!o(e)||0>e||isNaN(e))throw TypeError("n must be a positive number");return this._maxListeners=e,this},n.prototype.emit=function(e){var t,n,o,a,u,c;if(this._events||(this._events={}),"error"===e&&(!this._events.error||i(this._events.error)&&!this._events.error.length)){if(t=arguments[1],t instanceof Error)throw t;throw TypeError('Uncaught, unspecified "error" event.')}if(n=this._events[e],s(n))return!1;if(r(n))switch(arguments.length){case 1:n.call(this);break;case 2:n.call(this,arguments[1]);break;case 3:n.call(this,arguments[1],arguments[2]);break;default:for(o=arguments.length,a=new Array(o-1),u=1;o>u;u++)a[u-1]=arguments[u];n.apply(this,a)}else if(i(n)){for(o=arguments.length,a=new Array(o-1),u=1;o>u;u++)a[u-1]=arguments[u];for(c=n.slice(),o=c.length,u=0;o>u;u++)c[u].apply(this,a)}return!0},n.prototype.addListener=function(e,t){var o;if(!r(t))throw TypeError("listener must be a function");if(this._events||(this._events={}),this._events.newListener&&this.emit("newListener",e,r(t.listener)?t.listener:t),this._events[e]?i(this._events[e])?this._events[e].push(t):this._events[e]=[this._events[e],t]:this._events[e]=t,i(this._events[e])&&!this._events[e].warned){var o;o=s(this._maxListeners)?n.defaultMaxListeners:this._maxListeners,o&&o>0&&this._events[e].length>o&&(this._events[e].warned=!0,console.error("(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.",this._events[e].length),"function"==typeof console.trace&&console.trace())}return this},n.prototype.on=n.prototype.addListener,n.prototype.once=function(e,t){function n(){this.removeListener(e,n),o||(o=!0,t.apply(this,arguments))}if(!r(t))throw TypeError("listener must be a function");var o=!1;return n.listener=t,this.on(e,n),this},n.prototype.removeListener=function(e,t){var n,o,s,a;if(!r(t))throw TypeError("listener must be a function");if(!this._events||!this._events[e])return this;if(n=this._events[e],s=n.length,o=-1,n===t||r(n.listener)&&n.listener===t)delete this._events[e],this._events.removeListener&&this.emit("removeListener",e,t);else if(i(n)){for(a=s;a-->0;)if(n[a]===t||n[a].listener&&n[a].listener===t){o=a;break}if(0>o)return this;1===n.length?(n.length=0,delete this._events[e]):n.splice(o,1),this._events.removeListener&&this.emit("removeListener",e,t)}return this},n.prototype.removeAllListeners=function(e){var t,n;if(!this._events)return this;if(!this._events.removeListener)return 0===arguments.length?this._events={}:this._events[e]&&delete this._events[e],this;if(0===arguments.length){for(t in this._events)"removeListener"!==t&&this.removeAllListeners(t);return this.removeAllListeners("removeListener"),this._events={},this}if(n=this._events[e],r(n))this.removeListener(e,n);else for(;n.length;)this.removeListener(e,n[n.length-1]);return delete this._events[e],this},n.prototype.listeners=function(e){var t;return t=this._events&&this._events[e]?r(this._events[e])?[this._events[e]]:this._events[e].slice():[]},n.listenerCount=function(e,t){var n;return n=e._events&&e._events[t]?r(e._events[t])?1:e._events[t].length:0}},{}],34:[function(e,t){function n(){}var r=t.exports={};r.nextTick=function(){var e="undefined"!=typeof window&&window.setImmediate,t="undefined"!=typeof window&&window.MutationObserver,n="undefined"!=typeof window&&window.postMessage&&window.addEventListener;if(e)return function(e){return window.setImmediate(e)};var r=[];if(t){var o=document.createElement("div"),i=new MutationObserver(function(){var e=r.slice();r.length=0,e.forEach(function(e){e()})});return i.observe(o,{attributes:!0}),function(e){r.length||o.setAttribute("yes","no"),r.push(e)}}return n?(window.addEventListener("message",function(e){var t=e.source;if((t===window||null===t)&&"process-tick"===e.data&&(e.stopPropagation(),r.length>0)){var n=r.shift();n()}},!0),function(e){r.push(e),window.postMessage("process-tick","*")}):function(e){setTimeout(e,0)}}(),r.title="browser",r.browser=!0,r.env={},r.argv=[],r.on=n,r.addListener=n,r.once=n,r.off=n,r.removeListener=n,r.removeAllListeners=n,r.emit=n,r.binding=function(){throw new Error("process.binding is not supported")},r.cwd=function(){return"/"},r.chdir=function(){throw new Error("process.chdir is not supported")}},{}],35:[function(e,t,n){function r(){return"WebkitAppearance"in document.documentElement.style||window.console&&(console.firebug||console.exception&&console.table)||navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)&&parseInt(RegExp.$1,10)>=31}function o(){var e=arguments,t=this.useColors;if(e[0]=(t?"%c":"")+this.namespace+(t?" %c":" ")+e[0]+(t?"%c ":" ")+"+"+n.humanize(this.diff),!t)return e;var r="color: "+this.color;e=[e[0],r,"color: inherit"].concat(Array.prototype.slice.call(e,1));var o=0,i=0;return e[0].replace(/%[a-z%]/g,function(e){"%"!==e&&(o++,"%c"===e&&(i=o))}),e.splice(i,0,r),e}function i(){return"object"==typeof console&&"function"==typeof console.log&&Function.prototype.apply.call(console.log,console,arguments)}function s(e){try{null==e?localStorage.removeItem("debug"):localStorage.debug=e}catch(t){}}function a(){var e;try{e=localStorage.debug}catch(t){}return e}n=t.exports=e("./debug"),n.log=i,n.formatArgs=o,n.save=s,n.load=a,n.useColors=r,n.colors=["lightseagreen","forestgreen","goldenrod","dodgerblue","darkorchid","crimson"],n.formatters.j=function(e){return JSON.stringify(e)},n.enable(a())},{"./debug":36}],36:[function(e,t,n){function r(){return n.colors[f++%n.colors.length]}function o(e){function t(){}function o(){var e=o,t=+new Date,i=t-(c||t);e.diff=i,e.prev=c,e.curr=t,c=t,null==e.useColors&&(e.useColors=n.useColors()),null==e.color&&e.useColors&&(e.color=r());var s=Array.prototype.slice.call(arguments);s[0]=n.coerce(s[0]),"string"!=typeof s[0]&&(s=["%o"].concat(s));var a=0;s[0]=s[0].replace(/%([a-z%])/g,function(t,r){if("%"===t)return t;a++;var o=n.formatters[r];if("function"==typeof o){var i=s[a];t=o.call(e,i),s.splice(a,1),a--}return t}),"function"==typeof n.formatArgs&&(s=n.formatArgs.apply(e,s));var u=o.log||n.log||console.log.bind(console);u.apply(e,s)}t.enabled=!1,o.enabled=!0;var i=n.enabled(e)?o:t;return i.namespace=e,i}function i(e){n.save(e);for(var t=(e||"").split(/[\s,]+/),r=t.length,o=0;r>o;o++)t[o]&&(e=t[o].replace(/\*/g,".*?"),"-"===e[0]?n.skips.push(new RegExp("^"+e.substr(1)+"$")):n.names.push(new RegExp("^"+e+"$")))}function s(){n.enable("")}function a(e){var t,r;for(t=0,r=n.skips.length;r>t;t++)if(n.skips[t].test(e))return!1;for(t=0,r=n.names.length;r>t;t++)if(n.names[t].test(e))return!0;return!1}function u(e){return e instanceof Error?e.stack||e.message:e}n=t.exports=o,n.coerce=u,n.disable=s,n.enable=i,n.enabled=a,n.humanize=e("ms"),n.names=[],n.skips=[],n.formatters={};var c,f=0},{ms:37}],37:[function(e,t){function n(e){var t=/^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(e);if(t){var n=parseFloat(t[1]),r=(t[2]||"ms").toLowerCase();switch(r){case"years":case"year":case"y":return n*f;case"days":case"day":case"d":return n*c;case"hours":case"hour":case"h":return n*u;case"minutes":case"minute":case"m":return n*a;case"seconds":case"second":case"s":return n*s;case"ms":return n}}}function r(e){return e>=c?Math.round(e/c)+"d":e>=u?Math.round(e/u)+"h":e>=a?Math.round(e/a)+"m":e>=s?Math.round(e/s)+"s":e+"ms"}function o(e){return i(e,c,"day")||i(e,u,"hour")||i(e,a,"minute")||i(e,s,"second")||e+" ms"}function i(e,t,n){return t>e?void 0:1.5*t>e?Math.floor(e/t)+" "+n:Math.ceil(e/t)+" "+n+"s"}var s=1e3,a=60*s,u=60*a,c=24*u,f=365.25*c;t.exports=function(e,t){return t=t||{},"string"==typeof e?n(e):t.long?o(e):r(e)}},{}],38:[function(e,t){t.exports="function"==typeof Object.create?function(e,t){e.super_=t,e.prototype=Object.create(t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}})}:function(e,t){e.super_=t;var n=function(){};n.prototype=t.prototype,e.prototype=new n,e.prototype.constructor=e}},{}],39:[function(e,t){"use strict";function n(){}t.exports=n},{}],40:[function(e,t){"use strict";function n(e){function t(e,t){function r(e){c[t]=e,++f===n&!u&&(u=!0,a.resolve(d,c))}i(e).then(r,function(e){u||(u=!0,a.reject(d,e))})}if("[object Array]"!==Object.prototype.toString.call(e))return o(new TypeError("must be an array"));var n=e.length,u=!1;if(!n)return i([]);for(var c=new Array(n),f=0,l=-1,d=new r(s);++l<n;)t(e[l],l);return d}var r=e("./promise"),o=e("./reject"),i=e("./resolve"),s=e("./INTERNAL"),a=e("./handlers");t.exports=n},{"./INTERNAL":39,"./handlers":41,"./promise":43,"./reject":46,"./resolve":47}],41:[function(e,t,n){"use strict";function r(e){var t=e&&e.then;return e&&"object"==typeof e&&"function"==typeof t?function(){t.apply(e,arguments)}:void 0}var o=e("./tryCatch"),i=e("./resolveThenable"),s=e("./states");n.resolve=function(e,t){var a=o(r,t);if("error"===a.status)return n.reject(e,a.value);var u=a.value;if(u)i.safely(e,u);else{e.state=s.FULFILLED,e.outcome=t;for(var c=-1,f=e.queue.length;++c<f;)e.queue[c].callFulfilled(t)}return e},n.reject=function(e,t){e.state=s.REJECTED,e.outcome=t;for(var n=-1,r=e.queue.length;++n<r;)e.queue[n].callRejected(t);return e}},{"./resolveThenable":48,"./states":49,"./tryCatch":50}],42:[function(e,t,n){t.exports=n=e("./promise"),n.resolve=e("./resolve"),n.reject=e("./reject"),n.all=e("./all"),n.race=e("./race")},{"./all":40,"./promise":43,"./race":45,"./reject":46,"./resolve":47}],43:[function(e,t){"use strict";function n(e){if(!(this instanceof n))return new n(e);if("function"!=typeof e)throw new TypeError("reslover must be a function");this.state=s.PENDING,this.queue=[],this.outcome=void 0,e!==o&&i.safely(this,e)}var r=e("./unwrap"),o=e("./INTERNAL"),i=e("./resolveThenable"),s=e("./states"),a=e("./queueItem");t.exports=n,n.prototype["catch"]=function(e){return this.then(null,e)},n.prototype.then=function(e,t){if("function"!=typeof e&&this.state===s.FULFILLED||"function"!=typeof t&&this.state===s.REJECTED)return this;var i=new n(o);if(this.state!==s.PENDING){var u=this.state===s.FULFILLED?e:t;r(i,u,this.outcome)}else this.queue.push(new a(i,e,t));return i}},{"./INTERNAL":39,"./queueItem":44,"./resolveThenable":48,"./states":49,"./unwrap":51}],44:[function(e,t){"use strict";function n(e,t,n){this.promise=e,"function"==typeof t&&(this.onFulfilled=t,this.callFulfilled=this.otherCallFulfilled),"function"==typeof n&&(this.onRejected=n,this.callRejected=this.otherCallRejected)}var r=e("./handlers"),o=e("./unwrap");t.exports=n,n.prototype.callFulfilled=function(e){r.resolve(this.promise,e)},n.prototype.otherCallFulfilled=function(e){o(this.promise,this.onFulfilled,e)},n.prototype.callRejected=function(e){r.reject(this.promise,e)},n.prototype.otherCallRejected=function(e){o(this.promise,this.onRejected,e)}},{"./handlers":41,"./unwrap":51}],45:[function(e,t){"use strict";function n(e){function t(e){i(e).then(function(e){u||(u=!0,a.resolve(f,e))},function(e){u||(u=!0,a.reject(f,e))})}if("[object Array]"!==Object.prototype.toString.call(e))return o(new TypeError("must be an array"));var n=e.length,u=!1;if(!n)return i([]);for(var c=-1,f=new r(s);++c<n;)t(e[c]);return f}var r=e("./promise"),o=e("./reject"),i=e("./resolve"),s=e("./INTERNAL"),a=e("./handlers");t.exports=n},{"./INTERNAL":39,"./handlers":41,"./promise":43,"./reject":46,"./resolve":47}],46:[function(e,t){"use strict";function n(e){var t=new r(o);return i.reject(t,e)}var r=e("./promise"),o=e("./INTERNAL"),i=e("./handlers");t.exports=n},{"./INTERNAL":39,"./handlers":41,"./promise":43}],47:[function(e,t){"use strict";function n(e){if(e)return e instanceof r?e:i.resolve(new r(o),e);var t=typeof e;switch(t){case"boolean":return s;case"undefined":return u;case"object":return a;case"number":return c;case"string":return f}}var r=e("./promise"),o=e("./INTERNAL"),i=e("./handlers");t.exports=n;var s=i.resolve(new r(o),!1),a=i.resolve(new r(o),null),u=i.resolve(new r(o),void 0),c=i.resolve(new r(o),0),f=i.resolve(new r(o),"")},{"./INTERNAL":39,"./handlers":41,"./promise":43}],48:[function(e,t,n){"use strict";function r(e,t){function n(t){a||(a=!0,o.reject(e,t))}function r(t){a||(a=!0,o.resolve(e,t))}function s(){t(r,n)}var a=!1,u=i(s);"error"===u.status&&n(u.value)}var o=e("./handlers"),i=e("./tryCatch");n.safely=r},{"./handlers":41,"./tryCatch":50}],49:[function(e,t,n){n.REJECTED=["REJECTED"],n.FULFILLED=["FULFILLED"],n.PENDING=["PENDING"]},{}],50:[function(e,t){"use strict";function n(e,t){var n={};try{n.value=e(t),n.status="success"}catch(r){n.status="error",n.value=r}return n}t.exports=n},{}],51:[function(e,t){"use strict";function n(e,t,n){r(function(){var r;try{r=t(n)}catch(i){return o.reject(e,i)}r===e?o.reject(e,new TypeError("Cannot resolve promise with itself")):o.resolve(e,r)})}var r=e("immediate"),o=e("./handlers");t.exports=n},{"./handlers":41,immediate:52}],52:[function(e,t){"use strict";function n(){o=!0;for(var e,t,n=a.length;n;){for(t=a,a=[],e=-1;++e<n;)t[e]();n=a.length}o=!1}function r(e){1!==a.push(e)||o||i()}for(var o,i,s=[e("./nextTick"),e("./mutation.js"),e("./messageChannel"),e("./stateChange"),e("./timeout")],a=[],u=-1,c=s.length;++u<c;)if(s[u]&&s[u].test&&s[u].test()){i=s[u].install(n);
break}t.exports=r},{"./messageChannel":53,"./mutation.js":54,"./nextTick":28,"./stateChange":55,"./timeout":56}],53:[function(e,t,n){(function(e){"use strict";n.test=function(){return e.setImmediate?!1:"undefined"!=typeof e.MessageChannel},n.install=function(t){var n=new e.MessageChannel;return n.port1.onmessage=t,function(){n.port2.postMessage(0)}}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],54:[function(e,t,n){(function(e){"use strict";var t=e.MutationObserver||e.WebKitMutationObserver;n.test=function(){return t},n.install=function(n){var r=0,o=new t(n),i=e.document.createTextNode("");return o.observe(i,{characterData:!0}),function(){i.data=r=++r%2}}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],55:[function(e,t,n){(function(e){"use strict";n.test=function(){return"document"in e&&"onreadystatechange"in e.document.createElement("script")},n.install=function(t){return function(){var n=e.document.createElement("script");return n.onreadystatechange=function(){t(),n.onreadystatechange=null,n.parentNode.removeChild(n),n=null},e.document.documentElement.appendChild(n),t}}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],56:[function(e,t,n){"use strict";n.test=function(){return!0},n.install=function(e){return function(){setTimeout(e,0)}}},{}],57:[function(e,t){"use strict";function n(e){return null===e?String(e):"object"==typeof e||"function"==typeof e?u[d.call(e)]||"object":typeof e}function r(e){return null!==e&&e===e.window}function o(e){if(!e||"object"!==n(e)||e.nodeType||r(e))return!1;try{if(e.constructor&&!h.call(e,"constructor")&&!h.call(e.constructor.prototype,"isPrototypeOf"))return!1}catch(t){return!1}var o;for(o in e);return void 0===o||h.call(e,o)}function i(e){return"function"===n(e)}function s(){for(var e=[],t=-1,n=arguments.length,r=new Array(n);++t<n;)r[t]=arguments[t];var o={};e.push({args:r,result:{container:o,key:"key"}});for(var i;i=e.pop();)a(e,i.args,i.result);return o.key}function a(e,t,n){var r,s,a,u,c,f,l,d=t[0]||{},h=1,v=t.length,g=!1,y=/\d+/;for("boolean"==typeof d&&(g=d,d=t[1]||{},h=2),"object"==typeof d||i(d)||(d={}),v===h&&(d=this,--h);v>h;h++)if(null!=(r=t[h])){l=p(r);for(s in r)if(!(s in Object.prototype)){if(l&&!y.test(s))continue;if(a=d[s],u=r[s],d===u)continue;g&&u&&(o(u)||(c=p(u)))?(c?(c=!1,f=a&&p(a)?a:[]):f=a&&o(a)?a:{},e.push({args:[g,f,u],result:{container:d,key:s}})):void 0!==u&&(p(r)&&i(u)||(d[s]=u))}}n.container[n.key]=d}for(var u={},c=["Boolean","Number","String","Function","Array","Date","RegExp","Object","Error"],f=0;f<c.length;f++){var l=c[f];u["[object "+l+"]"]=l.toLowerCase()}var d=u.toString,h=u.hasOwnProperty,p=Array.isArray||function(e){return"array"===n(e)};t.exports=s},{}],58:[function(e,t){"use strict";var n=e("./upsert"),r=e("./utils"),o=r.Promise;t.exports=function(e){var t=e.db,i=e.viewName,s=e.map,a=e.reduce,u=e.temporary,c=s.toString()+(a&&a.toString())+"undefined";if(!u&&t._cachedViews){var f=t._cachedViews[c];if(f)return o.resolve(f)}return t.info().then(function(e){function o(e){e.views=e.views||{};var t=i;-1===t.indexOf("/")&&(t=i+"/"+i);var n=e.views[t]=e.views[t]||{};if(!n[f])return n[f]=!0,e}var f=e.db_name+"-mrview-"+(u?"temp":r.MD5(c));return n(t,"_local/mrviews",o).then(function(){return t.registerDependentDatabase(f).then(function(e){var n=e.db;n.auto_compaction=!0;var r={name:f,db:n,sourceDB:t,adapter:t.adapter,mapFun:s,reduceFun:a};return r.db.get("_local/lastSeq")["catch"](function(e){if(404!==e.status)throw e}).then(function(e){return r.seq=e?e.seq:0,u||(t._cachedViews=t._cachedViews||{},t._cachedViews[c]=r,r.db.on("destroyed",function(){delete t._cachedViews[c]})),r})})})})}},{"./upsert":64,"./utils":65}],59:[function(_dereq_,module,exports){"use strict";module.exports=function(func,emit,sum,log,isArray,toJSON){return eval("'use strict'; ("+func.replace(/;\s*$/,"")+");")}},{}],60:[function(e,t,n){(function(t){"use strict";function r(e){return-1===e.indexOf("/")?[e,e]:e.split("/")}function o(e,t,n){try{return{output:t.apply(null,n)}}catch(r){return e.emit("error",r),{error:r}}}function i(e,t){var n=A(e.key,t.key);return 0!==n?n:A(e.value,t.value)}function s(e,t,n){return n=n||0,"number"==typeof t?e.slice(n,t+n):n>0?e.slice(n):e}function a(e){var t=e.value,n=t&&"object"==typeof t&&t._id||e.id;return n}function u(e){var t=new Error("builtin "+e+" function requires map values to be numbers or number arrays");return t.name="invalid_value",t.status=500,t}function c(e){for(var t=0,n=0,r=e.length;r>n;n++){var o=e[n];if("number"!=typeof o){if(!Array.isArray(o))throw u("_sum");t="number"==typeof t?[t]:t;for(var i=0,s=o.length;s>i;i++){var a=o[i];if("number"!=typeof a)throw u("_sum");"undefined"==typeof t[i]?t.push(a):t[i]+=a}}else"number"==typeof t?t+=o:t[0]+=o}return t}function f(e,t,n,r){var o=t[e];"undefined"!=typeof o&&(r&&(o=encodeURIComponent(JSON.stringify(o))),n.push(e+"="+o))}function l(e,t){var n=e.descending?"endkey":"startkey",r=e.descending?"startkey":"endkey";if("undefined"!=typeof e[n]&&"undefined"!=typeof e[r]&&A(e[n],e[r])>0)throw new _("No rows can match your key range, reverse your start_key and end_key or set {descending : true}");if(t.reduce&&e.reduce!==!1){if(e.include_docs)throw new _("{include_docs:true} is invalid for reduce");if(e.keys&&e.keys.length>1&&!e.group&&!e.group_level)throw new _("Multi-key fetches for reduce views must use {group: true}")}if(e.group_level){if("number"!=typeof e.group_level)throw new _('Invalid value for integer: "'+e.group_level+'"');if(e.group_level<0)throw new _('Invalid value for positive integer: "'+e.group_level+'"')}}function d(e,t,n){var o,i=[],s="GET";if(f("reduce",n,i),f("include_docs",n,i),f("attachments",n,i),f("limit",n,i),f("descending",n,i),f("group",n,i),f("group_level",n,i),f("skip",n,i),f("stale",n,i),f("conflicts",n,i),f("startkey",n,i,!0),f("endkey",n,i,!0),f("inclusive_end",n,i),f("key",n,i,!0),i=i.join("&"),i=""===i?"":"?"+i,"undefined"!=typeof n.keys){var a=2e3,u="keys="+encodeURIComponent(JSON.stringify(n.keys));u.length+i.length+1<=a?i+=("?"===i[0]?"&":"?")+u:(s="POST","string"==typeof t?o=JSON.stringify({keys:n.keys}):t.keys=n.keys)}if("string"==typeof t){var c=r(t);return e.request({method:s,url:"_design/"+c[0]+"/_view/"+c[1]+i,body:o})}return o=o||{},Object.keys(t).forEach(function(e){o[e]=Array.isArray(t[e])?t[e]:t[e].toString()}),e.request({method:"POST",url:"_temp_view"+i,body:o})}function h(e){return function(t){if(404===t.status)return e;throw t}}function p(e,t,n){var r="_local/doc_"+e;return t.db.get(r)["catch"](h({_id:r,keys:[]})).then(function(r){return L.resolve().then(function(){return r.keys.length?t.db.allDocs({keys:r.keys,include_docs:!0}):{rows:[]}}).then(function(t){var o=t.rows.map(function(e){return e.doc}).filter(function(e){return e}),i=n[e],s={};o.forEach(function(e){if(s[e._id]=!0,e._deleted=!i[e._id],!e._deleted){var t=i[e._id];"value"in t&&(e.value=t.value)}});var a=Object.keys(i);return a.forEach(function(e){if(!s[e]){var t={_id:e},n=i[e];"value"in n&&(t.value=n.value),o.push(t)}}),r.keys=q.uniq(a.concat(r.keys)),o.splice(0,0,r),o})})}function v(e,t,n){var r="_local/lastSeq";return e.db.get(r)["catch"](h({_id:r,seq:0})).then(function(r){var o=Object.keys(t);return L.all(o.map(function(n){return p(n,e,t)})).then(function(t){var o=[];return t.forEach(function(e){o=o.concat(e)}),r.seq=n,o.push(r),e.db.bulkDocs({docs:o})})})}function g(e,t,n){0===n.group_level&&delete n.group_level;var r,i=n.group||n.group_level;r=C[e.reduceFun]?C[e.reduceFun]:I(e.reduceFun.toString(),null,c,w,Array.isArray,JSON.parse);var a=[],u=n.group_level;t.forEach(function(e){var t=a[a.length-1],n=i?e.key:null;return i&&Array.isArray(n)&&"number"==typeof u&&(n=n.length>u?n.slice(0,u):n),t&&0===A(t.key[0][0],n)?(t.key.push([n,e.id]),void t.value.push(e.value)):void a.push({key:[[n,e.id]],value:[e.value]})});for(var f=0,l=a.length;l>f;f++){var d=a[f],h=o(e.sourceDB,r,[d.key,d.value,!1]);d.value=h.error?null:h.output,d.key=d.key[0][0]}return{rows:s(a,n.limit,n.skip)}}function y(e){return e.request({method:"POST",url:"_view_cleanup"})}function m(e,n,o){if("http"===e.type())return d(e,n,o);if("string"!=typeof n){l(o,n);var i={db:e,viewName:"temp_view/temp_view",map:n.map,reduce:n.reduce,temporary:!0};return O.add(function(){return x(i).then(function(e){function t(){return e.db.destroy()}return q.fin(N(e).then(function(){return j(e,o)}),t)})}),O.finish()}var s=n,a=r(s),u=a[0],c=a[1];return e.get("_design/"+u).then(function(n){var r=n.views&&n.views[c];if(!r||"string"!=typeof r.map)throw new b("ddoc "+u+" has no view named "+c);l(o,r);var i={db:e,viewName:s,map:r.map,reduce:r.reduce};return x(i).then(function(e){return"ok"===o.stale||"update_after"===o.stale?("update_after"===o.stale&&t.nextTick(function(){N(e)}),j(e,o)):N(e).then(function(){return j(e,o)})})})}function _(e){this.status=400,this.name="query_parse_error",this.message=e,this.error=!0;try{Error.captureStackTrace(this,_)}catch(t){}}function b(e){this.status=404,this.name="not_found",this.message=e,this.error=!0;try{Error.captureStackTrace(this,b)}catch(t){}}var w,E=e("pouchdb-collate"),S=e("./taskqueue"),A=E.collate,k=E.toIndexableString,T=E.normalizeKey,x=e("./create-view"),I=e("./evalfunc");w="undefined"!=typeof console&&"function"==typeof console.log?Function.prototype.bind.call(console.log,console):function(){};var q=e("./utils"),L=q.Promise,R=new S,O=new S,D=50,C={_sum:function(e,t){return c(t)},_count:function(e,t){return t.length},_stats:function(e,t){function n(e){for(var t=0,n=0,r=e.length;r>n;n++){var o=e[n];t+=o*o}return t}return{sum:c(t),min:Math.min.apply(null,t),max:Math.max.apply(null,t),count:t.length,sumsqr:n(t)}}},N=q.sequentialize(R,function(e){function t(e,t){var n={id:s._id,key:T(e)};"undefined"!=typeof t&&null!==t&&(n.value=T(t)),r.push(n)}function n(t,n){return function(){return v(e,t,n)}}var r,s,a;if("function"==typeof e.mapFun&&2===e.mapFun.length){var u=e.mapFun;a=function(e){return u(e,t)}}else a=I(e.mapFun.toString(),t,c,w,Array.isArray,JSON.parse);var f=e.seq||0,l=new S;return new L(function(t,u){function c(){l.finish().then(function(){e.seq=f,t()})}function d(){function t(e){u(e)}e.sourceDB.changes({conflicts:!0,include_docs:!0,since:f,limit:D}).on("complete",function(t){var u=t.results;if(!u.length)return c();for(var h={},p=0,v=u.length;v>p;p++){var g=u[p];if("_"!==g.doc._id[0]){r=[],s=g.doc,s._deleted||o(e.sourceDB,a,[s]),r.sort(i);for(var y,m={},_=0,b=r.length;b>_;_++){var w=r[_],E=[w.key,w.id];w.key===y&&E.push(_);var S=k(E);m[S]=w,y=w.key}h[g.doc._id]=m}f=g.seq}return l.add(n(h,f)),u.length<D?c():d()}).on("error",t)}d()})}),j=q.sequentialize(R,function(e,t){function n(t){return t.include_docs=!0,e.db.allDocs(t).then(function(e){return o=e.total_rows,e.rows.map(function(e){if("value"in e.doc&&"object"==typeof e.doc.value&&null!==e.doc.value){var t=Object.keys(e.doc.value).sort(),n=["id","key","value"];if(!(n>t||t>n))return e.doc.value}var r=E.parseIndexableString(e.doc._id);return{key:r[0],id:r[1],value:"value"in e.doc?e.doc.value:null}})})}function r(n){var r;if(r=i?g(e,n,t):{total_rows:o,offset:s,rows:n},t.include_docs){var u=q.uniq(n.map(a));return e.sourceDB.allDocs({keys:u,include_docs:!0,conflicts:t.conflicts,attachments:t.attachments}).then(function(e){var t={};return e.rows.forEach(function(e){e.doc&&(t["$"+e.id]=e.doc)}),n.forEach(function(e){var n=a(e),r=t["$"+n];r&&(e.doc=r)}),r})}return r}var o,i=e.reduceFun&&t.reduce!==!1,s=t.skip||0;"undefined"==typeof t.keys||t.keys.length||(t.limit=0,delete t.keys);var u=function(e){return e.reduce(function(e,t){return e.concat(t)})};if("undefined"!=typeof t.keys){var c=t.keys,f=c.map(function(e){var t={startkey:k([e]),endkey:k([e,{}])};return n(t)});return L.all(f).then(u).then(r)}var l={descending:t.descending};if("undefined"!=typeof t.startkey&&(l.startkey=k(t.descending?[t.startkey,{}]:[t.startkey])),"undefined"!=typeof t.endkey){var d=t.inclusive_end!==!1;t.descending&&(d=!d),l.endkey=k(d?[t.endkey,{}]:[t.endkey])}if("undefined"!=typeof t.key){var h=k([t.key]),p=k([t.key,{}]);l.descending?(l.endkey=h,l.startkey=p):(l.startkey=h,l.endkey=p)}return i||("number"==typeof t.limit&&(l.limit=t.limit),l.skip=s),n(l).then(r)}),B=q.sequentialize(R,function(e){return e.get("_local/mrviews").then(function(t){var n={};Object.keys(t.views).forEach(function(e){var t=r(e),o="_design/"+t[0],i=t[1];n[o]=n[o]||{},n[o][i]=!0});var o={keys:Object.keys(n),include_docs:!0};return e.allDocs(o).then(function(r){var o={};r.rows.forEach(function(e){var r=e.key.substring(8);Object.keys(n[e.key]).forEach(function(n){var i=r+"/"+n;t.views[i]||(i=n);var s=Object.keys(t.views[i]),a=e.doc&&e.doc.views&&e.doc.views[n];s.forEach(function(e){o[e]=o[e]||a})})});var i=Object.keys(o).filter(function(e){return!o[e]}),s=i.map(function(t){return e.constructor.destroy(t,{adapter:e.adapter})});return L.all(s).then(function(){return{ok:!0}})})},h({ok:!0}))});n.viewCleanup=q.callbackify(function(){var e=this;return"http"===e.type()?y(e):B(e)}),n.query=function(e,t,n){"function"==typeof t&&(n=t,t={}),t=q.extend(!0,{},t),"function"==typeof e&&(e={map:e});var r=this,o=L.resolve().then(function(){return m(r,e,t)});return q.promisedCallback(o,n),o},q.inherits(_,Error),q.inherits(b,Error)}).call(this,e("_process"))},{"./create-view":58,"./evalfunc":59,"./taskqueue":63,"./utils":65,_process:34,"pouchdb-collate":61}],61:[function(e,t,n){"use strict";function r(e){if(null!==e)switch(typeof e){case"boolean":return e?1:0;case"number":return f(e);case"string":return e.replace(/\u0002/g,"").replace(/\u0001/g,"").replace(/\u0000/g,"");case"object":var t=Array.isArray(e),r=t?e:Object.keys(e),o=-1,i=r.length,s="";if(t)for(;++o<i;)s+=n.toIndexableString(r[o]);else for(;++o<i;){var a=r[o];s+=n.toIndexableString(a)+n.toIndexableString(e[a])}return s}return""}function o(e,t){var n,r=t,o="1"===e[t];if(o)n=0,t++;else{var i="0"===e[t];t++;var s="",a=e.substring(t,t+d),u=parseInt(a,10)+l;for(i&&(u=-u),t+=d;;){var c=e[t];if("\x00"===c)break;s+=c,t++}s=s.split("."),n=1===s.length?parseInt(s,10):parseFloat(s[0]+"."+s[1]),i&&(n-=10),0!==u&&(n=parseFloat(n+"e"+u))}return{num:n,length:t-r}}function i(e,t){var n=e.pop();if(t.length){var r=t[t.length-1];n===r.element&&(t.pop(),r=t[t.length-1]);var o=r.element,i=r.index;if(Array.isArray(o))o.push(n);else if(i===e.length-2){var s=e.pop();o[s]=n}else e.push(n)}}function s(e,t){for(var r=Math.min(e.length,t.length),o=0;r>o;o++){var i=n.collate(e[o],t[o]);if(0!==i)return i}return e.length===t.length?0:e.length>t.length?1:-1}function a(e,t){return e===t?0:e>t?1:-1}function u(e,t){for(var r=Object.keys(e),o=Object.keys(t),i=Math.min(r.length,o.length),s=0;i>s;s++){var a=n.collate(r[s],o[s]);if(0!==a)return a;if(a=n.collate(e[r[s]],t[o[s]]),0!==a)return a}return r.length===o.length?0:r.length>o.length?1:-1}function c(e){var t=["boolean","number","string","object"],n=t.indexOf(typeof e);return~n?null===e?1:Array.isArray(e)?5:3>n?n+2:n+3:Array.isArray(e)?5:void 0}function f(e){if(0===e)return"1";var t=e.toExponential().split(/e\+?/),n=parseInt(t[1],10),r=0>e,o=r?"0":"2",i=(r?-n:n)-l,s=p.padLeft(i.toString(),"0",d);o+=h+s;var a=Math.abs(parseFloat(t[0]));r&&(a=10-a);var u=a.toFixed(20);return u=u.replace(/\.?0+$/,""),o+=h+u}var l=-324,d=3,h="",p=e("./utils");n.collate=function(e,t){if(e===t)return 0;e=n.normalizeKey(e),t=n.normalizeKey(t);var r=c(e),o=c(t);if(r-o!==0)return r-o;if(null===e)return 0;switch(typeof e){case"number":return e-t;case"boolean":return e===t?0:t>e?-1:1;case"string":return a(e,t)}return Array.isArray(e)?s(e,t):u(e,t)},n.normalizeKey=function(e){switch(typeof e){case"undefined":return null;case"number":return 1/0===e||e===-1/0||isNaN(e)?null:e;case"object":var t=e;if(Array.isArray(e)){var r=e.length;e=new Array(r);for(var o=0;r>o;o++)e[o]=n.normalizeKey(t[o])}else{if(e instanceof Date)return e.toJSON();if(null!==e){e={};for(var i in t)if(t.hasOwnProperty(i)){var s=t[i];"undefined"!=typeof s&&(e[i]=n.normalizeKey(s))}}}}return e},n.toIndexableString=function(e){var t="\x00";return e=n.normalizeKey(e),c(e)+h+r(e)+t},n.parseIndexableString=function(e){for(var t=[],n=[],r=0;;){var s=e[r++];if("\x00"!==s)switch(s){case"1":t.push(null);break;case"2":t.push("1"===e[r]),r++;break;case"3":var a=o(e,r);t.push(a.num),r+=a.length;break;case"4":for(var u="";;){var c=e[r];if("\x00"===c)break;u+=c,r++}u=u.replace(/\u0001\u0001/g,"\x00").replace(/\u0001\u0002/g,"").replace(/\u0002\u0002/g,""),t.push(u);break;case"5":var f={element:[],index:t.length};t.push(f.element),n.push(f);break;case"6":var l={element:{},index:t.length};t.push(l.element),n.push(l);break;default:throw new Error("bad collationIndex or unexpectedly reached end of input: "+s)}else{if(1===t.length)return t.pop();i(t,n)}}}},{"./utils":62}],62:[function(e,t,n){"use strict";function r(e,t,n){for(var r="",o=n-e.length;r.length<o;)r+=t;return r}n.padLeft=function(e,t,n){var o=r(e,t,n);return o+e},n.padRight=function(e,t,n){var o=r(e,t,n);return e+o},n.stringLexCompare=function(e,t){var n,r=e.length,o=t.length;for(n=0;r>n;n++){if(n===o)return 1;var i=e.charAt(n),s=t.charAt(n);if(i!==s)return s>i?-1:1}return o>r?-1:0},n.intToDecimalForm=function(e){var t=0>e,n="";do{var r=t?-Math.ceil(e%10):Math.floor(e%10);n=r+n,e=t?Math.ceil(e/10):Math.floor(e/10)}while(e);return t&&"0"!==n&&(n="-"+n),n}},{}],63:[function(e,t){"use strict";function n(){this.promise=new r(function(e){e()})}var r=e("./utils").Promise;n.prototype.add=function(e){return this.promise=this.promise["catch"](function(){}).then(function(){return e()}),this.promise},n.prototype.finish=function(){return this.promise},t.exports=n},{"./utils":65}],64:[function(e,t){"use strict";function n(e,t,n){return new o(function(o,i){return t&&"object"==typeof t&&(t=t._id),"string"!=typeof t?i(new Error("doc id is required")):void e.get(t,function(s,a){if(s)return 404!==s.status?i(s):o(r(e,n({_id:t}),n));var u=n(a);return u?void o(r(e,u,n)):o(a)})})}function r(e,t,r){return e.put(t)["catch"](function(o){if(409!==o.status)throw o;return n(e,t,r)})}var o=e("./utils").Promise;t.exports=n},{"./utils":65}],65:[function(e,t,n){(function(t,r){"use strict";n.Promise="function"==typeof r.Promise?r.Promise:e("lie"),n.inherits=e("inherits"),n.extend=e("pouchdb-extend");var o=e("argsarray");n.promisedCallback=function(e,n){return n&&e.then(function(e){t.nextTick(function(){n(null,e)})},function(e){t.nextTick(function(){n(e)})}),e},n.callbackify=function(e){return o(function(t){var r=t.pop(),o=e.apply(this,t);return"function"==typeof r&&n.promisedCallback(o,r),o})},n.fin=function(e,t){return e.then(function(e){var n=t();return"function"==typeof n.then?n.then(function(){return e}):e},function(e){var n=t();if("function"==typeof n.then)return n.then(function(){throw e});throw e})},n.sequentialize=function(e,t){return function(){var n=arguments,r=this;return e.add(function(){return t.apply(r,n)})}},n.uniq=function(e){for(var t={},n=0,r=e.length;r>n;n++)t["$"+e[n]]=!0;var o=Object.keys(t),i=new Array(o.length);for(n=0,r=o.length;r>n;n++)i[n]=o[n].substring(1);return i};var i=e("crypto"),s=e("spark-md5");n.MD5=function(e){return t.browser?s.hash(e):i.createHash("md5").update(e).digest("hex")}}).call(this,e("_process"),"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{_process:34,argsarray:27,crypto:28,inherits:38,lie:42,"pouchdb-extend":57,"spark-md5":66}],66:[function(e,t,n){!function(e){if("object"==typeof n)t.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var r;try{r=window}catch(o){r=self}r.SparkMD5=e()}}(function(){"use strict";var e=function(e,t){return e+t&4294967295},t=function(t,n,r,o,i,s){return n=e(e(n,t),e(o,s)),e(n<<i|n>>>32-i,r)},n=function(e,n,r,o,i,s,a){return t(n&r|~n&o,e,n,i,s,a)},r=function(e,n,r,o,i,s,a){return t(n&o|r&~o,e,n,i,s,a)},o=function(e,n,r,o,i,s,a){return t(n^r^o,e,n,i,s,a)},i=function(e,n,r,o,i,s,a){return t(r^(n|~o),e,n,i,s,a)},s=function(t,s){var a=t[0],u=t[1],c=t[2],f=t[3];a=n(a,u,c,f,s[0],7,-680876936),f=n(f,a,u,c,s[1],12,-389564586),c=n(c,f,a,u,s[2],17,606105819),u=n(u,c,f,a,s[3],22,-1044525330),a=n(a,u,c,f,s[4],7,-176418897),f=n(f,a,u,c,s[5],12,1200080426),c=n(c,f,a,u,s[6],17,-1473231341),u=n(u,c,f,a,s[7],22,-45705983),a=n(a,u,c,f,s[8],7,1770035416),f=n(f,a,u,c,s[9],12,-1958414417),c=n(c,f,a,u,s[10],17,-42063),u=n(u,c,f,a,s[11],22,-1990404162),a=n(a,u,c,f,s[12],7,1804603682),f=n(f,a,u,c,s[13],12,-40341101),c=n(c,f,a,u,s[14],17,-1502002290),u=n(u,c,f,a,s[15],22,1236535329),a=r(a,u,c,f,s[1],5,-165796510),f=r(f,a,u,c,s[6],9,-1069501632),c=r(c,f,a,u,s[11],14,643717713),u=r(u,c,f,a,s[0],20,-373897302),a=r(a,u,c,f,s[5],5,-701558691),f=r(f,a,u,c,s[10],9,38016083),c=r(c,f,a,u,s[15],14,-660478335),u=r(u,c,f,a,s[4],20,-405537848),a=r(a,u,c,f,s[9],5,568446438),f=r(f,a,u,c,s[14],9,-1019803690),c=r(c,f,a,u,s[3],14,-187363961),u=r(u,c,f,a,s[8],20,1163531501),a=r(a,u,c,f,s[13],5,-1444681467),f=r(f,a,u,c,s[2],9,-51403784),c=r(c,f,a,u,s[7],14,1735328473),u=r(u,c,f,a,s[12],20,-1926607734),a=o(a,u,c,f,s[5],4,-378558),f=o(f,a,u,c,s[8],11,-2022574463),c=o(c,f,a,u,s[11],16,1839030562),u=o(u,c,f,a,s[14],23,-35309556),a=o(a,u,c,f,s[1],4,-1530992060),f=o(f,a,u,c,s[4],11,1272893353),c=o(c,f,a,u,s[7],16,-155497632),u=o(u,c,f,a,s[10],23,-1094730640),a=o(a,u,c,f,s[13],4,681279174),f=o(f,a,u,c,s[0],11,-358537222),c=o(c,f,a,u,s[3],16,-722521979),u=o(u,c,f,a,s[6],23,76029189),a=o(a,u,c,f,s[9],4,-640364487),f=o(f,a,u,c,s[12],11,-421815835),c=o(c,f,a,u,s[15],16,530742520),u=o(u,c,f,a,s[2],23,-995338651),a=i(a,u,c,f,s[0],6,-198630844),f=i(f,a,u,c,s[7],10,1126891415),c=i(c,f,a,u,s[14],15,-1416354905),u=i(u,c,f,a,s[5],21,-57434055),a=i(a,u,c,f,s[12],6,1700485571),f=i(f,a,u,c,s[3],10,-1894986606),c=i(c,f,a,u,s[10],15,-1051523),u=i(u,c,f,a,s[1],21,-2054922799),a=i(a,u,c,f,s[8],6,1873313359),f=i(f,a,u,c,s[15],10,-30611744),c=i(c,f,a,u,s[6],15,-1560198380),u=i(u,c,f,a,s[13],21,1309151649),a=i(a,u,c,f,s[4],6,-145523070),f=i(f,a,u,c,s[11],10,-1120210379),c=i(c,f,a,u,s[2],15,718787259),u=i(u,c,f,a,s[9],21,-343485551),t[0]=e(a,t[0]),t[1]=e(u,t[1]),t[2]=e(c,t[2]),t[3]=e(f,t[3])},a=function(e){var t,n=[];for(t=0;64>t;t+=4)n[t>>2]=e.charCodeAt(t)+(e.charCodeAt(t+1)<<8)+(e.charCodeAt(t+2)<<16)+(e.charCodeAt(t+3)<<24);return n},u=function(e){var t,n=[];for(t=0;64>t;t+=4)n[t>>2]=e[t]+(e[t+1]<<8)+(e[t+2]<<16)+(e[t+3]<<24);return n},c=function(e){var t,n,r,o,i,u,c=e.length,f=[1732584193,-271733879,-1732584194,271733878];for(t=64;c>=t;t+=64)s(f,a(e.substring(t-64,t)));for(e=e.substring(t-64),n=e.length,r=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],t=0;n>t;t+=1)r[t>>2]|=e.charCodeAt(t)<<(t%4<<3);if(r[t>>2]|=128<<(t%4<<3),t>55)for(s(f,r),t=0;16>t;t+=1)r[t]=0;return o=8*c,o=o.toString(16).match(/(.*?)(.{0,8})$/),i=parseInt(o[2],16),u=parseInt(o[1],16)||0,r[14]=i,r[15]=u,s(f,r),f},f=function(e){var t,n,r,o,i,a,c=e.length,f=[1732584193,-271733879,-1732584194,271733878];for(t=64;c>=t;t+=64)s(f,u(e.subarray(t-64,t)));for(e=c>t-64?e.subarray(t-64):new Uint8Array(0),n=e.length,r=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],t=0;n>t;t+=1)r[t>>2]|=e[t]<<(t%4<<3);if(r[t>>2]|=128<<(t%4<<3),t>55)for(s(f,r),t=0;16>t;t+=1)r[t]=0;return o=8*c,o=o.toString(16).match(/(.*?)(.{0,8})$/),i=parseInt(o[2],16),a=parseInt(o[1],16)||0,r[14]=i,r[15]=a,s(f,r),f},l=["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"],d=function(e){var t,n="";for(t=0;4>t;t+=1)n+=l[e>>8*t+4&15]+l[e>>8*t&15];return n},h=function(e){var t;for(t=0;t<e.length;t+=1)e[t]=d(e[t]);return e.join("")},p=function(e){return h(c(e))},v=function(){this.reset()};return"5d41402abc4b2a76b9719d911017c592"!==p("hello")&&(e=function(e,t){var n=(65535&e)+(65535&t),r=(e>>16)+(t>>16)+(n>>16);return r<<16|65535&n}),v.prototype.append=function(e){return/[\u0080-\uFFFF]/.test(e)&&(e=unescape(encodeURIComponent(e))),this.appendBinary(e),this},v.prototype.appendBinary=function(e){this._buff+=e,this._length+=e.length;var t,n=this._buff.length;for(t=64;n>=t;t+=64)s(this._state,a(this._buff.substring(t-64,t)));return this._buff=this._buff.substr(t-64),this},v.prototype.end=function(e){var t,n,r=this._buff,o=r.length,i=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(t=0;o>t;t+=1)i[t>>2]|=r.charCodeAt(t)<<(t%4<<3);return this._finish(i,o),n=e?this._state:h(this._state),this.reset(),n},v.prototype._finish=function(e,t){var n,r,o,i=t;if(e[i>>2]|=128<<(i%4<<3),i>55)for(s(this._state,e),i=0;16>i;i+=1)e[i]=0;n=8*this._length,n=n.toString(16).match(/(.*?)(.{0,8})$/),r=parseInt(n[2],16),o=parseInt(n[1],16)||0,e[14]=r,e[15]=o,s(this._state,e)},v.prototype.reset=function(){return this._buff="",this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},v.prototype.destroy=function(){delete this._state,delete this._buff,delete this._length},v.hash=function(e,t){/[\u0080-\uFFFF]/.test(e)&&(e=unescape(encodeURIComponent(e)));var n=c(e);return t?n:h(n)},v.hashBinary=function(e,t){var n=c(e);return t?n:h(n)},v.ArrayBuffer=function(){this.reset()},v.ArrayBuffer.prototype.append=function(e){var t,n=this._concatArrayBuffer(this._buff,e),r=n.length;for(this._length+=e.byteLength,t=64;r>=t;t+=64)s(this._state,u(n.subarray(t-64,t)));return this._buff=r>t-64?n.subarray(t-64):new Uint8Array(0),this},v.ArrayBuffer.prototype.end=function(e){var t,n,r=this._buff,o=r.length,i=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(t=0;o>t;t+=1)i[t>>2]|=r[t]<<(t%4<<3);return this._finish(i,o),n=e?this._state:h(this._state),this.reset(),n},v.ArrayBuffer.prototype._finish=v.prototype._finish,v.ArrayBuffer.prototype.reset=function(){return this._buff=new Uint8Array(0),this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},v.ArrayBuffer.prototype.destroy=v.prototype.destroy,v.ArrayBuffer.prototype._concatArrayBuffer=function(e,t){var n=e.length,r=new Uint8Array(n+t.byteLength);return r.set(e),r.set(new Uint8Array(t),n),r},v.ArrayBuffer.hash=function(e,t){var n=f(new Uint8Array(e));return t?n:h(n)},v})},{}],67:[function(e,t,n){"use strict";function r(e,t,n){var r=n[n.length-1];e===r.element&&(n.pop(),r=n[n.length-1]);var o=r.element,i=r.index;if(Array.isArray(o))o.push(e);else if(i===t.length-2){var s=t.pop();o[s]=e}else t.push(e)}n.stringify=function(e){var t=[];t.push({obj:e});for(var n,r,o,i,s,a,u,c,f,l,d,h="";n=t.pop();)if(r=n.obj,o=n.prefix||"",i=n.val||"",h+=o,i)h+=i;else if("object"!=typeof r)h+="undefined"==typeof r?null:JSON.stringify(r);else if(null===r)h+="null";else if(Array.isArray(r)){for(t.push({val:"]"}),s=r.length-1;s>=0;s--)a=0===s?"":",",t.push({obj:r[s],prefix:a});t.push({val:"["})}else{u=[];for(c in r)r.hasOwnProperty(c)&&u.push(c);for(t.push({val:"}"}),s=u.length-1;s>=0;s--)f=u[s],l=r[f],d=s>0?",":"",d+=JSON.stringify(f)+":",t.push({obj:l,prefix:d});t.push({val:"{"})}return h},n.parse=function(e){for(var t,n,o,i,s,a,u,c,f,l=[],d=[],h=0;;)if(t=e[h++],"}"!==t&&"]"!==t&&"undefined"!=typeof t)switch(t){case" ":case"	":case"\n":case":":case",":break;case"n":h+=3,r(null,l,d);break;case"t":h+=3,r(!0,l,d);break;case"f":h+=4,r(!1,l,d);break;case"0":case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":case"-":for(n="",h--;;){if(o=e[h++],!/[\d\.\-e\+]/.test(o)){h--;break}n+=o}r(parseFloat(n),l,d);break;case'"':for(i="",s=void 0,a=0;;){if(u=e[h++],'"'===u&&("\\"!==s||a%2!==1))break;i+=u,s=u,"\\"===s?a++:a=0}r(JSON.parse('"'+i+'"'),l,d);break;case"[":c={element:[],index:l.length},l.push(c.element),d.push(c);break;case"{":f={element:{},index:l.length},l.push(f.element),d.push(f);break;default:throw new Error("unexpectedly reached end of input: "+t)}else{if(1===l.length)return l.pop();r(l.pop(),l,d)}}},{}],68:[function(e,t){(function(n){"use strict";var r=e("./setup");t.exports=r,r.ajax=e("./deps/ajax"),r.extend=e("pouchdb-extend"),r.utils=e("./utils"),r.Errors=e("./deps/errors"),r.replicate=e("./replicate").replicate,r.sync=e("./sync"),r.version=e("./version");var o=e("./adapters/http");if(r.adapter("http",o),r.adapter("https",o),r.adapter("idb",e("./adapters/idb")),r.adapter("websql",e("./adapters/websql")),r.plugin(e("pouchdb-mapreduce")),!n.browser){var i=e("./adapters/leveldb");r.adapter("ldb",i),r.adapter("leveldb",i)}}).call(this,e("_process"))},{"./adapters/http":2,"./adapters/idb":3,"./adapters/leveldb":28,"./adapters/websql":5,"./deps/ajax":9,"./deps/errors":12,"./replicate":21,"./setup":22,"./sync":23,"./utils":25,"./version":26,_process:34,"pouchdb-extend":57,"pouchdb-mapreduce":60}]},{},[68])(68)});
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],78:[function(require,module,exports){
module.exports = '@import \'http://fonts.googleapis.com/css?family=Lato:400,700,400italic,700italic&subset=latin\';\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Reset\n*******************************/\n\n/* Border-Box */\n\n*,\n*:before,\n*:after {\n  box-sizing: border-box;\n}\n\n/* iPad Input Shadows */\n\ninput[type="text"],\ninput[type="email"],\ninput[type="search"],\ninput[type="password"] {\n  -webkit-appearance: none;\n  -moz-appearance: none;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*! normalize.css v3.0.1 | MIT License | git.io/normalize */\n\n/**\n * Correct `block` display not defined in IE 8/9.\n */\n\n/*! normalize.css v3.0.1 | MIT License | git.io/normalize */\n\n/**\n * 1. Set default font family to sans-serif.\n * 2. Prevent iOS text size adjust after orientation change, without disabling\n *    user zoom.\n */\n\nhtml {\n  font-family: sans-serif;\n  /* 1 */\n  -ms-text-size-adjust: 100%;\n  /* 2 */\n  -webkit-text-size-adjust: 100%;\n}\n\n/**\n * Remove default margin.\n */\n\nbody {\n  margin: 0;\n}\n\n/* HTML5 display definitions\n   ========================================================================== */\n\n/**\n * Correct `block` display not defined for any HTML5 element in IE 8/9.\n * Correct `block` display not defined for `details` or `summary` in IE 10/11 and Firefox.\n * Correct `block` display not defined for `main` in IE 11.\n */\n\narticle,\naside,\ndetails,\nfigcaption,\nfigure,\nfooter,\nheader,\nhgroup,\nmain,\nnav,\nsection,\nsummary {\n  display: block;\n}\n\n/**\n * 1. Correct `inline-block` display not defined in IE 8/9.\n * 2. Normalize vertical alignment of `progress` in Chrome, Firefox, and Opera.\n */\n\naudio,\ncanvas,\nprogress,\nvideo {\n  display: inline-block;\n  /* 1 */\n  vertical-align: baseline;\n}\n\n/**\n * Prevent modern browsers from displaying `audio` without controls.\n * Remove excess height in iOS 5 devices.\n */\n\naudio:not([controls]) {\n  display: none;\n  height: 0;\n}\n\n/**\n * Address `[hidden]` styling not present in IE 8/9/10.\n * Hide the `template` element in IE 8/9/11, Safari, and Firefox < 22.\n */\n\n[hidden],\ntemplate {\n  display: none;\n}\n\n/* Links\n   ========================================================================== */\n\n/**\n * Remove the gray background color from active links in IE 10.\n */\n\na {\n  background: transparent;\n}\n\n/**\n * Improve readability when focused and also mouse hovered in all browsers.\n */\n\na:active,\na:hover {\n  outline: 0;\n}\n\n/* Text-level semantics\n   ========================================================================== */\n\n/**\n * Address styling not present in IE 8/9/10/11, Safari, and Chrome.\n */\n\nabbr[title] {\n  border-bottom: 1px dotted;\n}\n\n/**\n * Address style set to `bolder` in Firefox 4+, Safari, and Chrome.\n */\n\nb,\nstrong {\n  font-weight: bold;\n}\n\n/**\n * Address styling not present in Safari and Chrome.\n */\n\ndfn {\n  font-style: italic;\n}\n\n/**\n * Address variable `h1` font-size and margin within `section` and `article`\n * contexts in Firefox 4+, Safari, and Chrome.\n */\n\nh1 {\n  font-size: 2em;\n  margin: 0.67em 0;\n}\n\n/**\n * Address styling not present in IE 8/9.\n */\n\nmark {\n  background: #ff0;\n  color: #000;\n}\n\n/**\n * Address inconsistent and variable font size in all browsers.\n */\n\nsmall {\n  font-size: 80%;\n}\n\n/**\n * Prevent `sub` and `sup` affecting `line-height` in all browsers.\n */\n\nsub,\nsup {\n  font-size: 75%;\n  line-height: 0;\n  position: relative;\n  vertical-align: baseline;\n}\n\nsup {\n  top: -0.5em;\n}\n\nsub {\n  bottom: -0.25em;\n}\n\n/* Embedded content\n   ========================================================================== */\n\n/**\n * Remove border when inside `a` element in IE 8/9/10.\n */\n\nimg {\n  border: 0;\n}\n\n/**\n * Correct overflow not hidden in IE 9/10/11.\n */\n\nsvg:not(:root) {\n  overflow: hidden;\n}\n\n/* Grouping content\n   ========================================================================== */\n\n/**\n * Address margin not present in IE 8/9 and Safari.\n */\n\nfigure {\n  margin: 1em 40px;\n}\n\n/**\n * Address differences between Firefox and other browsers.\n */\n\nhr {\n  box-sizing: content-box;\n  height: 0;\n}\n\n/**\n * Contain overflow in all browsers.\n */\n\npre {\n  overflow: auto;\n}\n\n/**\n * Address odd `em`-unit font size rendering in all browsers.\n */\n\ncode,\nkbd,\npre,\nsamp {\n  font-family: monospace, monospace;\n  font-size: 1em;\n}\n\n/* Forms\n   ========================================================================== */\n\n/**\n * Known limitation: by default, Chrome and Safari on OS X allow very limited\n * styling of `select`, unless a `border` property is set.\n */\n\n/**\n * 1. Correct color not being inherited.\n *    Known issue: affects color of disabled elements.\n * 2. Correct font properties not being inherited.\n * 3. Address margins set differently in Firefox 4+, Safari, and Chrome.\n */\n\nbutton,\ninput,\noptgroup,\nselect,\ntextarea {\n  color: inherit;\n  /* 1 */\n  font: inherit;\n  /* 2 */\n  margin: 0;\n}\n\n/**\n * Address `overflow` set to `hidden` in IE 8/9/10/11.\n */\n\nbutton {\n  overflow: visible;\n}\n\n/**\n * Address inconsistent `text-transform` inheritance for `button` and `select`.\n * All other form control elements do not inherit `text-transform` values.\n * Correct `button` style inheritance in Firefox, IE 8/9/10/11, and Opera.\n * Correct `select` style inheritance in Firefox.\n */\n\nbutton,\nselect {\n  text-transform: none;\n}\n\n/**\n * 1. Avoid the WebKit bug in Android 4.0.* where (2) destroys native `audio`\n *    and `video` controls.\n * 2. Correct inability to style clickable `input` types in iOS.\n * 3. Improve usability and consistency of cursor style between image-type\n *    `input` and others.\n */\n\nbutton,\nhtml input[type="button"],\ninput[type="reset"],\ninput[type="submit"] {\n  -webkit-appearance: button;\n  /* 2 */\n  cursor: pointer;\n}\n\n/**\n * Re-set default cursor for disabled elements.\n */\n\nbutton[disabled],\nhtml input[disabled] {\n  cursor: default;\n}\n\n/**\n * Remove inner padding and border in Firefox 4+.\n */\n\nbutton::-moz-focus-inner,\ninput::-moz-focus-inner {\n  border: 0;\n  padding: 0;\n}\n\n/**\n * Address Firefox 4+ setting `line-height` on `input` using `!important` in\n * the UA stylesheet.\n */\n\ninput {\n  line-height: normal;\n}\n\n/**\n * It\'s recommended that you don\'t attempt to style these elements.\n * Firefox\'s implementation doesn\'t respect box-sizing, padding, or width.\n *\n * 1. Address box sizing set to `content-box` in IE 8/9/10.\n * 2. Remove excess padding in IE 8/9/10.\n */\n\ninput[type="checkbox"],\ninput[type="radio"] {\n  box-sizing: border-box;\n  /* 1 */\n  padding: 0;\n}\n\n/**\n * Fix the cursor style for Chrome\'s increment/decrement buttons. For certain\n * `font-size` values of the `input`, it causes the cursor style of the\n * decrement button to change from `default` to `text`.\n */\n\ninput[type="number"]::-webkit-inner-spin-button,\ninput[type="number"]::-webkit-outer-spin-button {\n  height: auto;\n}\n\n/**\n * 1. Address `appearance` set to `searchfield` in Safari and Chrome.\n * 2. Address `box-sizing` set to `border-box` in Safari and Chrome\n *    (include `-moz` to future-proof).\n */\n\ninput[type="search"] {\n  -webkit-appearance: textfield;\n  /* 1 */\n  /* 2 */\n  box-sizing: content-box;\n}\n\n/**\n * Remove inner padding and search cancel button in Safari and Chrome on OS X.\n * Safari (but not Chrome) clips the cancel button when the search input has\n * padding (and `textfield` appearance).\n */\n\ninput[type="search"]::-webkit-search-cancel-button,\ninput[type="search"]::-webkit-search-decoration {\n  -webkit-appearance: none;\n}\n\n/**\n * Define consistent border, margin, and padding.\n */\n\nfieldset {\n  border: 1px solid #c0c0c0;\n  margin: 0 2px;\n  padding: 0.35em 0.625em 0.75em;\n}\n\n/**\n * 1. Correct `color` not being inherited in IE 8/9/10/11.\n * 2. Remove padding so people aren\'t caught out if they zero out fieldsets.\n */\n\nlegend {\n  border: 0;\n  /* 1 */\n  padding: 0;\n}\n\n/**\n * Remove default vertical scrollbar in IE 8/9/10/11.\n */\n\ntextarea {\n  overflow: auto;\n}\n\n/**\n * Don\'t inherit the `font-weight` (applied by a rule above).\n * NOTE: the default cannot safely be changed in Chrome and Safari on OS X.\n */\n\noptgroup {\n  font-weight: bold;\n}\n\n/* Tables\n   ========================================================================== */\n\n/**\n * Remove most spacing between table cells.\n */\n\ntable {\n  border-collapse: collapse;\n  border-spacing: 0;\n}\n\ntd,\nth {\n  padding: 0;\n}\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Page\n*******************************/\n\n/* UI requires Border-Box */\n\n*,\n*:before,\n*:after {\n  box-sizing: border-box;\n}\n\nhtml,\nbody {\n  height: 100%;\n}\n\nhtml {\n  font-size: 14px;\n}\n\nbody {\n  margin: 0px;\n  padding: 0px;\n  min-width: 278px;\n  background: #f7f7f7;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-size: 14px;\n  line-height: 1.33;\n  color: rgba(0, 0, 0, 0.8);\n  font-smoothing: antialiased;\n}\n\n/*******************************\n             Headers\n*******************************/\n\nh1,\nh2,\nh3,\nh4,\nh5 {\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  line-height: 1.33em;\n  margin: -webkit-calc(2rem -  0.165em ) 0em 1rem;\n  margin: calc(2rem -  0.165em ) 0em 1rem;\n  font-weight: bold;\n  padding: 0em;\n}\n\nh1 {\n  min-height: 1rem;\n  font-size: 2rem;\n}\n\nh2 {\n  font-size: 1.714rem;\n}\n\nh3 {\n  font-size: 1.28rem;\n}\n\nh4 {\n  font-size: 1.071rem;\n}\n\nh5 {\n  font-size: 1rem;\n}\n\n/*******************************\n             Text\n*******************************/\n\np {\n  margin: 0em 0em 1em;\n  line-height: 1.33;\n}\n\np:first-child {\n  margin-top: 0em;\n}\n\np:last-child {\n  margin-bottom: 0em;\n}\n\n/*-------------------\n        Links\n--------------------*/\n\na {\n  color: #009fda;\n  text-decoration: none;\n}\n\na:hover {\n  color: #00b2f3;\n}\n\n/*******************************\n          Highlighting\n*******************************/\n\n::-webkit-selection {\n  background-color: rgba(255, 255, 160, 0.4);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n::-moz-selection {\n  background-color: rgba(255, 255, 160, 0.4);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n::selection {\n  background-color: rgba(255, 255, 160, 0.4);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*******************************\n        Global Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Button\n*******************************/\n\n.ui.button {\n  cursor: pointer;\n  display: inline-block;\n  min-height: 1em;\n  outline: none;\n  border: none;\n  vertical-align: baseline;\n  background-color: #e0e0e0;\n  color: rgba(0, 0, 0, 0.6);\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  margin: 0em 0.25em 0em 0em;\n  padding: 0.78571em 1.5em 0.78571em;\n  text-transform: none;\n  text-shadow: none;\n  font-weight: bold;\n  line-height: 1;\n  font-style: normal;\n  text-align: center;\n  text-decoration: none;\n  background-image: none;\n  border-radius: 0.2857rem;\n  box-shadow: 0px 0px 0px 1px transparent inset, 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n  -webkit-transition: opacity 0.1s ease, background-color 0.1s ease, color 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;\n  transition: opacity 0.1s ease, background-color 0.1s ease, color 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;\n  -webkit-tap-highlight-color: transparent;\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------\n      Hover\n---------------*/\n\n.ui.button:hover {\n  background-color: #e8e8e8;\n  background-image: none;\n  box-shadow: \'\';\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.button:hover .icon {\n  opacity: 0.85;\n}\n\n/*--------------\n      Focus\n---------------*/\n\n.ui.button:focus {\n  background-color: \'\';\n  background-image: \'\';\n  box-shadow: 0px 0px 0px 1px transparent inset, 0px 0px 1px rgba(81, 167, 232, 0.8) inset, 0px 0px 3px 2px rgba(81, 167, 232, 0.8);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.button:focus .icon {\n  opacity: 0.85;\n}\n\n/*--------------\n      Down\n---------------*/\n\n.ui.button:active,\n.ui.active.button:active {\n  background-color: #cccccc;\n  background-image: \'\';\n  color: rgba(0, 0, 0, 0.8);\n  box-shadow: 0px 0px 0px 1px transparent inset, 0px 1px 4px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n/*--------------\n     Active\n---------------*/\n\n.ui.active.button {\n  background-color: #d0d0d0;\n  background-image: none;\n  box-shadow: 0px 0px 0px 1px transparent inset;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.button.active:hover {\n  background-color: #d0d0d0;\n  background-image: none;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.button.active:active {\n  background-color: #d0d0d0;\n  background-image: none;\n}\n\n/*--------------\n    Loading\n---------------*/\n\n/* Specificity hack */\n\n.ui.loading.loading.loading.loading.loading.loading.button {\n  position: relative;\n  cursor: default;\n  point-events: none;\n  text-shadow: none !important;\n  color: transparent !important;\n  -webkit-transition: all 0s linear;\n  transition: all 0s linear;\n}\n\n.ui.loading.button:before {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: 50%;\n  margin: -0.64285em 0em 0em -0.64285em;\n  width: 1.2857em;\n  height: 1.2857em;\n  border-radius: 500rem;\n  border: 0.2em solid rgba(0, 0, 0, 0.15);\n}\n\n.ui.loading.button:after {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: 50%;\n  margin: -0.64285em 0em 0em -0.64285em;\n  width: 1.2857em;\n  height: 1.2857em;\n  -webkit-animation: button-spin 0.6s linear;\n  animation: button-spin 0.6s linear;\n  -webkit-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n  border-radius: 500rem;\n  border-color: #ffffff transparent transparent;\n  border-style: solid;\n  border-width: 0.2em;\n  box-shadow: 0px 0px 0px 1px transparent;\n}\n\n.ui.labeled.icon.loading.button .icon {\n  background-color: transparent;\n  box-shadow: none;\n}\n\n@-webkit-keyframes button-spin {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n@keyframes button-spin {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n.ui.basic.loading.button:not(.inverted):before {\n  border-color: rgba(0, 0, 0, 0.1);\n}\n\n.ui.basic.loading.button:not(.inverted):after {\n  border-top-color: #aaaaaa;\n}\n\n/*-------------------\n      Disabled\n--------------------*/\n\n.ui.buttons .disabled.button,\n.ui.disabled.button,\n.ui.disabled.button:hover,\n.ui.disabled.button.active {\n  cursor: default;\n  background-color: #dcddde !important;\n  color: rgba(0, 0, 0, 0.4) !important;\n  opacity: 0.3 !important;\n  background-image: none !important;\n  box-shadow: none !important;\n  pointer-events: none;\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*-------------------\n       Animated\n--------------------*/\n\n.ui.animated.button {\n  position: relative;\n  overflow: hidden;\n  padding-right: 0em !important;\n}\n\n.ui.animated.button .content {\n  will-change: transform, opacity;\n}\n\n.ui.animated.button .visible.content {\n  position: relative;\n  margin-right: 1.5em;\n}\n\n.ui.animated.button .hidden.content {\n  position: absolute;\n  width: 100%;\n}\n\n/* Horizontal */\n\n.ui.animated.button .visible.content,\n.ui.animated.button .hidden.content {\n  -webkit-transition: right 0.3s ease 0s;\n  transition: right 0.3s ease 0s;\n}\n\n.ui.animated.button .visible.content {\n  left: auto;\n  right: 0%;\n}\n\n.ui.animated.button .hidden.content {\n  top: 50%;\n  left: auto;\n  right: -100%;\n  margin-top: -0.5em;\n}\n\n.ui.animated.button:hover .visible.content {\n  left: auto;\n  right: 200%;\n}\n\n.ui.animated.button:hover .hidden.content {\n  left: auto;\n  right: 0%;\n}\n\n/* Vertical */\n\n.ui.vertical.animated.button .visible.content,\n.ui.vertical.animated.button .hidden.content {\n  -webkit-transition: top 0.3s ease, -webkit-transform 0.3s ease;\n  transition: top 0.3s ease, transform 0.3s ease;\n}\n\n.ui.vertical.animated.button .visible.content {\n  -webkit-transform: translateY(0%);\n  -ms-transform: translateY(0%);\n  transform: translateY(0%);\n  right: auto;\n}\n\n.ui.vertical.animated.button .hidden.content {\n  top: -50%;\n  left: 0%;\n  right: auto;\n}\n\n.ui.vertical.animated.button:hover .visible.content {\n  -webkit-transform: translateY(200%);\n  -ms-transform: translateY(200%);\n  transform: translateY(200%);\n  right: auto;\n}\n\n.ui.vertical.animated.button:hover .hidden.content {\n  top: 50%;\n  right: auto;\n}\n\n/* Fade */\n\n.ui.fade.animated.button .visible.content,\n.ui.fade.animated.button .hidden.content {\n  -webkit-transition: opacity 0.3s ease, -webkit-transform 0.3s ease;\n  transition: opacity 0.3s ease, transform 0.3s ease;\n}\n\n.ui.fade.animated.button .visible.content {\n  left: auto;\n  right: auto;\n  opacity: 1;\n  -webkit-transform: scale(1);\n  -ms-transform: scale(1);\n  transform: scale(1);\n}\n\n.ui.fade.animated.button .hidden.content {\n  opacity: 0;\n  left: 0%;\n  right: auto;\n  -webkit-transform: scale(1.5);\n  -ms-transform: scale(1.5);\n  transform: scale(1.5);\n}\n\n.ui.fade.animated.button:hover .visible.content {\n  left: auto;\n  right: auto;\n  opacity: 0;\n  -webkit-transform: scale(0.75);\n  -ms-transform: scale(0.75);\n  transform: scale(0.75);\n}\n\n.ui.fade.animated.button:hover .hidden.content {\n  left: 0%;\n  right: auto;\n  opacity: 1;\n  -webkit-transform: scale(1);\n  -ms-transform: scale(1);\n  transform: scale(1);\n}\n\n/*-------------------\n       Inverted\n--------------------*/\n\n.ui.inverted.button {\n  box-shadow: 0px 0px 0px 2px #ffffff inset !important;\n  background: transparent none;\n  color: #ffffff;\n  text-shadow: none !important;\n}\n\n.ui.inverted.buttons .button {\n  margin: 0px 0px 0px -2px;\n}\n\n.ui.inverted.buttons .button:first-child {\n  margin-left: 0em;\n}\n\n.ui.inverted.vertical.buttons .button {\n  margin: 0px 0px -2px 0px;\n}\n\n.ui.inverted.vertical.buttons .button:first-child {\n  margin-top: 0em;\n}\n\n.ui.inverted.buttons .button:hover {\n  position: relative;\n}\n\n.ui.inverted.button:hover {\n  background: #ffffff;\n  box-shadow: 0px 0px 0px 2px #ffffff inset !important;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*-------------------\n       Social\n--------------------*/\n\n/* Facebook */\n\n.ui.facebook.button {\n  background-color: #3b579d;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.facebook.button:hover {\n  background-color: #3f5da8;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.facebook.button:active {\n  background-color: #314983;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Twitter */\n\n.ui.twitter.button {\n  background-color: #4092cc;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.twitter.button:hover {\n  background-color: #4c99cf;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.twitter.button:active {\n  background-color: #3180b7;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Google Plus */\n\n.ui.google.plus.button {\n  background-color: #d34836;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.google.plus.button:hover {\n  background-color: #d65343;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.google.plus.button:active {\n  background-color: #bc3a29;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Linked In */\n\n.ui.linkedin.button {\n  background-color: #1f88be;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.linkedin.button:hover {\n  background-color: #2191cb;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.linkedin.button:active {\n  background-color: #1a729f;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* YouTube */\n\n.ui.youtube.button {\n  background-color: #cc181e;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.youtube.button:hover {\n  background-color: #da1a20;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.youtube.button:active {\n  background-color: #ac1419;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Instagram */\n\n.ui.instagram.button {\n  background-color: #49769c;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.instagram.button:hover {\n  background-color: #4e7ea6;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.instagram.button:active {\n  background-color: #3e6484;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Pinterest */\n\n.ui.pinterest.button {\n  background-color: #00aced;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.pinterest.button:hover {\n  background-color: #00b7fc;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.pinterest.button:active {\n  background-color: #0092c9;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* VK */\n\n.ui.vk.button {\n  background-color: #4D7198;\n  color: #ffffff;\n  background-image: none;\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.vk.button:hover {\n  background-color: #5279a2;\n  color: #ffffff;\n}\n\n.ui.vk.button:active {\n  background-color: #415f80;\n  color: #ffffff;\n}\n\n/*--------------\n     Icon\n---------------*/\n\n.ui.button > .icon {\n  opacity: 0.8;\n  margin: 0em 0.4em 0em -0.2em;\n  -webkit-transition: opacity 0.2s ease;\n  transition: opacity 0.2s ease;\n  vertical-align: baseline;\n  color: \'\';\n}\n\n.ui.button > .right.icon {\n  margin: 0em -0.2em 0em 0.4em;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-------------------\n       Floated\n--------------------*/\n\n.ui[class*="left floated"].buttons,\n.ui[class*="left floated"].button {\n  float: left;\n  margin-left: 0em;\n  margin-right: 0.25em;\n}\n\n.ui[class*="right floated"].buttons,\n.ui[class*="right floated"].button {\n  float: right;\n  margin-right: 0em;\n  margin-left: 0.25em;\n}\n\n/*-------------------\n       Compact\n--------------------*/\n\n.ui.compact.buttons .button,\n.ui.compact.button {\n  padding: 0.5892825em 1.125em 0.5892825em;\n}\n\n.ui.compact.icon.buttons .button,\n.ui.compact.icon.button {\n  padding: 0.5892825em 0.5892825em 0.5892825em;\n}\n\n.ui.compact.labeled.icon.buttons .button,\n.ui.compact.labeled.icon.button {\n  padding: 0.5892825em 3.69642em 0.5892825em;\n}\n\n/*-------------------\n        Sizes\n--------------------*/\n\n.ui.mini.buttons .button,\n.ui.mini.buttons .or,\n.ui.mini.button {\n  font-size: 0.71428571rem;\n}\n\n.ui.tiny.buttons .button,\n.ui.tiny.buttons .or,\n.ui.tiny.button {\n  font-size: 0.85714286rem;\n}\n\n.ui.small.buttons .button,\n.ui.small.buttons .or,\n.ui.small.button {\n  font-size: 0.92857143rem;\n}\n\n.ui.buttons .button,\n.ui.buttons .or,\n.ui.button {\n  font-size: 1rem;\n}\n\n.ui.large.buttons .button,\n.ui.large.buttons .or,\n.ui.large.button {\n  font-size: 1.14285714rem;\n}\n\n.ui.big.buttons .button,\n.ui.big.buttons .or,\n.ui.big.button {\n  font-size: 1.28571429rem;\n}\n\n.ui.huge.buttons .button,\n.ui.huge.buttons .or,\n.ui.huge.button {\n  font-size: 1.42857143rem;\n}\n\n.ui.massive.buttons .button,\n.ui.massive.buttons .or,\n.ui.massive.button {\n  font-size: 1.71428571rem;\n}\n\n/*--------------\n    Icon Only\n---------------*/\n\n.ui.icon.buttons .button,\n.ui.icon.button {\n  padding: 0.78571em 0.78571em 0.78571em;\n}\n\n.ui.icon.buttons .button > .icon,\n.ui.icon.button > .icon {\n  opacity: 0.9;\n  margin: 0em;\n  vertical-align: top;\n}\n\n/*-------------------\n        Basic\n--------------------*/\n\n.ui.basic.buttons .button,\n.ui.basic.button {\n  background: transparent !important;\n  background-image: none;\n  color: rgba(0, 0, 0, 0.6) !important;\n  font-weight: normal;\n  border-radius: 0.2857rem;\n  text-transform: none;\n  text-shadow: none !important;\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.basic.buttons {\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15);\n  border-radius: 0.2857rem;\n}\n\n.ui.basic.buttons .button {\n  border-radius: 0em;\n}\n\n.ui.basic.buttons .button:hover,\n.ui.basic.button:hover {\n  background: #fafafa !important;\n  color: rgba(0, 0, 0, 0.8) !important;\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15) inset, 0px 0px 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.basic.buttons .button:active,\n.ui.basic.button:active {\n  background: #f8f8f8 !important;\n  color: rgba(0, 0, 0, 0.8) !important;\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.15) inset, 0px 1px 4px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.basic.buttons .button.active,\n.ui.basic.button.active {\n  background: rgba(0, 0, 0, 0.05) !important;\n  box-shadow: \'\' !important;\n  color: rgba(0, 0, 0, 0.8);\n  box-shadow: rgba(39, 41, 43, 0.3);\n}\n\n.ui.basic.buttons .button.active:hover,\n.ui.basic.button.active:hover {\n  background-color: rgba(0, 0, 0, 0.05);\n}\n\n/* Vertical */\n\n.ui.basic.buttons .button:hover {\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15) inset, 0px 0px 0px 0px rgba(39, 41, 43, 0.15) inset inset;\n}\n\n.ui.basic.buttons .button:active {\n  box-shadow: 0px 0px 0px 1px rgba(0, 0, 0, 0.15) inset, 0px 1px 4px 0px rgba(39, 41, 43, 0.15) inset inset;\n}\n\n.ui.basic.buttons .button.active {\n  box-shadow: rgba(39, 41, 43, 0.3) inset;\n}\n\n/* Standard Basic Inverted */\n\n.ui.basic.inverted.buttons .button,\n.ui.basic.inverted.button {\n  background-color: transparent !important;\n  color: #fafafa !important;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n}\n\n.ui.basic.inverted.buttons .button:hover,\n.ui.basic.inverted.button:hover {\n  color: #ffffff !important;\n  box-shadow: 0px 0px 0px 2px #ffffff inset !important;\n}\n\n.ui.basic.inverted.buttons .button:active,\n.ui.basic.inverted.button:active {\n  background-color: rgba(255, 255, 255, 0.05) !important;\n  color: #ffffff !important;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.9) inset !important;\n}\n\n.ui.basic.inverted.buttons .button.active,\n.ui.basic.inverted.button.active {\n  background-color: rgba(255, 255, 255, 0.05);\n  color: #ffffff;\n  text-shadow: none;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.7) inset;\n}\n\n.ui.basic.inverted.buttons .button.active:hover,\n.ui.basic.inverted.button.active:hover {\n  background-color: rgba(255, 255, 255, 0.07);\n  box-shadow: 0px 0px 0px 2px #ffffff inset !important;\n}\n\n/* Basic Group */\n\n.ui.basic.buttons .button {\n  border-left: 1px solid rgba(39, 41, 43, 0.15);\n  box-shadow: none;\n}\n\n.ui.basic.vertical.buttons .button {\n  border-left: none;\n}\n\n/*--------------\n  Labeled Icon\n---------------*/\n\n.ui.labeled.icon.buttons .button,\n.ui.labeled.icon.button {\n  position: relative;\n  padding-left: 4.07142em !important;\n  padding-right: 1.5em !important;\n}\n\n/* Left Labeled */\n\n.ui.labeled.icon.buttons > .button > .icon,\n.ui.labeled.icon.button > .icon {\n  position: absolute;\n  width: 2.57142em;\n  height: 100%;\n  background-color: rgba(0, 0, 0, 0.05);\n  text-align: center;\n  color: \'\';\n  border-radius: 0.2857rem 0px 0px 0.2857rem;\n  line-height: 1;\n  box-shadow: -1px 0px 0px 0px transparent inset;\n}\n\n/* Left Labeled */\n\n.ui.labeled.icon.buttons > .button > .icon,\n.ui.labeled.icon.button > .icon {\n  top: 0em;\n  left: 0em;\n}\n\n/* Right Labeled */\n\n.ui[class*="right labeled"].icon.button {\n  padding-right: 4.07142em !important;\n  padding-left: 1.5em !important;\n}\n\n.ui[class*="right labeled"].icon.button > .icon {\n  left: auto;\n  right: 0em;\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n  box-shadow: 1px 0px 0px 0px transparent inset;\n}\n\n.ui.labeled.icon.buttons > .button > .icon:before,\n.ui.labeled.icon.button > .icon:before,\n.ui.labeled.icon.buttons > .button > .icon:after,\n.ui.labeled.icon.button > .icon:after {\n  display: block;\n  position: absolute;\n  width: 100%;\n  top: 50%;\n  text-align: center;\n  margin-top: -0.5em;\n}\n\n.ui.labeled.icon.buttons .button > .icon {\n  border-radius: 0em;\n}\n\n.ui.labeled.icon.buttons .button:first-child > .icon {\n  border-top-left-radius: 0.2857rem;\n  border-bottom-left-radius: 0.2857rem;\n}\n\n.ui.labeled.icon.buttons .button:last-child > .icon {\n  border-top-right-radius: 0.2857rem;\n  border-bottom-right-radius: 0.2857rem;\n}\n\n.ui.vertical.labeled.icon.buttons .button:first-child > .icon {\n  border-radius: 0em;\n  border-top-left-radius: 0.2857rem;\n}\n\n.ui.vertical.labeled.icon.buttons .button:last-child > .icon {\n  border-radius: 0em;\n  border-bottom-left-radius: 0.2857rem;\n}\n\n/* Fluid Labeled */\n\n.ui.fluid[class*="left labeled"].icon.button,\n.ui.fluid[class*="right labeled"].icon.button {\n  padding-left: 1.5em !important;\n  padding-right: 1.5em !important;\n}\n\n/*--------------\n     Toggle\n---------------*/\n\n/* Toggle (Modifies active state to give affordances) */\n\n.ui.toggle.buttons .active.button,\n.ui.buttons .button.toggle.active,\n.ui.button.toggle.active {\n  background-color: #5bbd72 !important;\n  box-shadow: none !important;\n  text-shadow: none;\n  color: #ffffff !important;\n}\n\n.ui.button.toggle.active:hover {\n  background-color: #66c17b !important;\n  text-shadow: none;\n  color: #ffffff !important;\n}\n\n/*--------------\n    Circular\n---------------*/\n\n.ui.circular.button {\n  border-radius: 10em;\n}\n\n.ui.circular.button > .icon {\n  width: 1em;\n  vertical-align: baseline;\n}\n\n/*--------------\n     Attached\n---------------*/\n\n.ui.attached.button {\n  display: block;\n  margin: 0em;\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15) !important;\n  border-radius: 0em;\n}\n\n.ui.attached.top.button {\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n}\n\n.ui.attached.bottom.button {\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n.ui.attached.left.button {\n  display: inline-block;\n  border-left: none;\n  padding-right: 0.75em;\n  text-align: right;\n  border-radius: 0.2857rem 0em 0em 0.2857rem;\n}\n\n.ui.attached.right.button {\n  display: inline-block;\n  padding-left: 0.75em;\n  text-align: left;\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n}\n\n/*-------------------\n      Or Buttons\n--------------------*/\n\n.ui.buttons .or {\n  position: relative;\n  float: left;\n  width: 0.3em;\n  height: 2.57142em;\n  z-index: 3;\n}\n\n.ui.buttons .or:before {\n  position: absolute;\n  content: \'or\';\n  top: 50%;\n  left: 50%;\n  background-color: #ffffff;\n  text-shadow: none;\n  margin-top: -0.892855em;\n  margin-left: -0.892855em;\n  width: 1.78571em;\n  height: 1.78571em;\n  line-height: 1.58571em;\n  color: rgba(0, 0, 0, 0.4);\n  font-style: normal;\n  font-weight: bold;\n  text-align: center;\n  border-radius: 500em;\n  box-shadow: 0px 0px 0px 1px transparent inset;\n}\n\n.ui.buttons .or[data-text]:before {\n  content: attr(data-text);\n}\n\n/* Fluid Or */\n\n.ui.fluid.buttons .or {\n  width: 0em !important;\n}\n\n.ui.fluid.buttons .or:after {\n  display: none;\n}\n\n/*-------------------\n       Attached\n--------------------*/\n\n/* Plural Attached */\n\n.attached.ui.buttons {\n  margin: 0px;\n  border-radius: 0em 0em 0em 0em;\n}\n\n.attached.ui.buttons .button {\n  margin: 0em;\n}\n\n.attached.ui.buttons .button:first-child {\n  border-radius: 0em 0em 0em 0em;\n}\n\n.attached.ui.buttons .button:last-child {\n  border-radius: 0em 0em 0em 0em;\n}\n\n/* Top Side */\n\n[class*="top attached"].ui.buttons {\n  margin-bottom: -1px;\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n}\n\n[class*="top attached"].ui.buttons .button:first-child {\n  border-radius: 0.2857rem 0em 0em 0em;\n}\n\n[class*="top attached"].ui.buttons .button:last-child {\n  border-radius: 0em 0.2857rem 0em 0em;\n}\n\n/* Bottom Side */\n\n[class*="bottom attached"].ui.buttons {\n  margin-top: -1px;\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n[class*="bottom attached"].ui.buttons .button:first-child {\n  border-radius: 0em 0em 0em 0.2857rem;\n}\n\n[class*="bottom attached"].ui.buttons .button:last-child {\n  border-radius: 0em 0em 0.2857rem 0em;\n}\n\n/* Left Side */\n\n[class*="left attached"].ui.buttons {\n  margin-left: -1px;\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n}\n\n[class*="left attached"].ui.buttons .button:first-child {\n  margin-left: -1px;\n  border-radius: 0em 0.2857rem 0em 0em;\n}\n\n[class*="left attached"].ui.buttons .button:last-child {\n  margin-left: -1px;\n  border-radius: 0em 0em 0.2857rem 0em;\n}\n\n/* Right Side */\n\n[class*="right attached"].ui.buttons,\n[class*="right attached"].ui.buttons .button {\n  margin-right: -1px;\n  border-radius: 0.2857rem 0em 0em 0.2857rem;\n}\n\n[class*="right attached"].ui.buttons .button:first-child {\n  margin-left: -1px;\n  border-radius: 0.2857rem 0em 0em 0em;\n}\n\n[class*="right attached"].ui.buttons .button:last-child {\n  margin-left: -1px;\n  border-radius: 0em 0em 0em 0.2857rem;\n}\n\n/* Fluid */\n\n.ui.fluid.buttons,\n.ui.button.fluid,\n.ui.fluid.buttons > .button {\n  display: block;\n  width: 100%;\n}\n\n.ui.\32.buttons,\n.ui.two.buttons {\n  width: 100%;\n}\n\n.ui.\32.buttons > .button,\n.ui.two.buttons > .button {\n  width: 50%;\n}\n\n.ui.\33.buttons,\n.ui.three.buttons {\n  width: 100%;\n}\n\n.ui.\33.buttons > .button,\n.ui.three.buttons > .button {\n  width: 33.333%;\n}\n\n.ui.\34.buttons,\n.ui.four.buttons {\n  width: 100%;\n}\n\n.ui.\34.buttons > .button,\n.ui.four.buttons > .button {\n  width: 25%;\n}\n\n.ui.\35.buttons,\n.ui.five.buttons {\n  width: 100%;\n}\n\n.ui.\35.buttons > .button,\n.ui.five.buttons > .button {\n  width: 20%;\n}\n\n.ui.\36.buttons,\n.ui.six.buttons {\n  width: 100%;\n}\n\n.ui.\36.buttons > .button,\n.ui.six.buttons > .button {\n  width: 16.666%;\n}\n\n.ui.\37.buttons,\n.ui.seven.buttons {\n  width: 100%;\n}\n\n.ui.\37.buttons > .button,\n.ui.seven.buttons > .button {\n  width: 14.285%;\n}\n\n.ui.\38.buttons,\n.ui.eight.buttons {\n  width: 100%;\n}\n\n.ui.\38.buttons > .button,\n.ui.eight.buttons > .button {\n  width: 12.500%;\n}\n\n.ui.\39.buttons,\n.ui.nine.buttons {\n  width: 100%;\n}\n\n.ui.\39.buttons > .button,\n.ui.nine.buttons > .button {\n  width: 11.11%;\n}\n\n.ui.\31\30.buttons,\n.ui.ten.buttons {\n  width: 100%;\n}\n\n.ui.\31\30.buttons > .button,\n.ui.ten.buttons > .button {\n  width: 10%;\n}\n\n.ui.\31\31.buttons,\n.ui.eleven.buttons {\n  width: 100%;\n}\n\n.ui.\31\31.buttons > .button,\n.ui.eleven.buttons > .button {\n  width: 9.09%;\n}\n\n.ui.\31\32.buttons,\n.ui.twelve.buttons {\n  width: 100%;\n}\n\n.ui.\31\32.buttons > .button,\n.ui.twelve.buttons > .button {\n  width: 8.3333%;\n}\n\n/* Fluid Vertical Buttons */\n\n.ui.fluid.vertical.buttons,\n.ui.fluid.vertical.buttons > .button {\n  display: block;\n  width: auto;\n}\n\n.ui.\32.vertical.buttons > .button,\n.ui.two.vertical.buttons > .button {\n  height: 50%;\n}\n\n.ui.\33.vertical.buttons > .button,\n.ui.three.vertical.buttons > .button {\n  height: 33.333%;\n}\n\n.ui.\34.vertical.buttons > .button,\n.ui.four.vertical.buttons > .button {\n  height: 25%;\n}\n\n.ui.\35.vertical.buttons > .button,\n.ui.five.vertical.buttons > .button {\n  height: 20%;\n}\n\n.ui.\36.vertical.buttons > .button,\n.ui.six.vertical.buttons > .button {\n  height: 16.666%;\n}\n\n.ui.\37.vertical.buttons > .button,\n.ui.seven.vertical.buttons > .button {\n  height: 14.285%;\n}\n\n.ui.\38.vertical.buttons > .button,\n.ui.eight.vertical.buttons > .button {\n  height: 12.500%;\n}\n\n.ui.\39.vertical.buttons > .button,\n.ui.nine.vertical.buttons > .button {\n  height: 11.11%;\n}\n\n.ui.\31\30.vertical.buttons > .button,\n.ui.ten.vertical.buttons > .button {\n  height: 10%;\n}\n\n.ui.\31\31.vertical.buttons > .button,\n.ui.eleven.vertical.buttons > .button {\n  height: 9.09%;\n}\n\n.ui.\31\32.vertical.buttons > .button,\n.ui.twelve.vertical.buttons > .button {\n  height: 8.3333%;\n}\n\n/*-------------------\n       Colors\n--------------------*/\n\n/*--- Black ---*/\n\n.ui.black.buttons .button,\n.ui.black.button {\n  background-color: #1b1c1d;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.black.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.black.buttons .button:hover,\n.ui.black.button:hover {\n  background-color: #1b1c1d;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.black.buttons .button:active,\n.ui.black.button:active {\n  background-color: #0a0a0b;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.black.buttons .button.active,\n.ui.black.buttons .button.active:active,\n.ui.black.button.active,\n.ui.black.button .button.active:active {\n  background-color: #0f0f10;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Basic */\n\n.ui.basic.black.buttons .button,\n.ui.basic.black.button {\n  box-shadow: 0px 0px 0px 2px rgba(39, 41, 43, 0.15) inset !important;\n  color: rgba(0, 0, 0, 0.6) !important;\n}\n\n.ui.basic.black.buttons .button:hover,\n.ui.basic.black.button:hover {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #1b1c1d inset !important;\n  color: #1b1c1d !important;\n}\n\n.ui.basic.black.buttons .button:active,\n.ui.basic.black.button:active {\n  box-shadow: 0px 0px 0px 2px #0a0a0b inset !important;\n  color: #0a0a0b !important;\n}\n\n.ui.basic.black.buttons .button.active,\n.ui.basic.black.button.active {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #0a0a0b inset !important;\n  color: #0a0a0b !important;\n}\n\n.ui.buttons > .basic.black.button:not(:first-child) {\n  margin-left: -2px;\n}\n\n/* Inverted */\n\n.ui.inverted.black.buttons .button,\n.ui.inverted.black.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px #d4d4d5 inset !important;\n  color: #ffffff;\n}\n\n.ui.inverted.black.buttons .button:hover,\n.ui.inverted.black.button:hover {\n  box-shadow: 0px 0px 0px 2px #333333 inset !important;\n  background-color: #333333;\n  color: #ffffff;\n}\n\n.ui.inverted.black.buttons .button.active,\n.ui.inverted.black.button.active {\n  box-shadow: 0px 0px 0px 2px #333333 inset !important;\n  background-color: #333333;\n  color: #ffffff;\n}\n\n.ui.inverted.black.buttons .button:active,\n.ui.inverted.black.button:active {\n  box-shadow: 0px 0px 0px 2px #212121 inset !important;\n  background-color: #212121;\n  color: #ffffff;\n}\n\n/* Inverted Basic */\n\n.ui.inverted.black.basic.buttons .button,\n.ui.inverted.black.buttons .basic.button,\n.ui.inverted.black.basic.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.black.basic.buttons .button:hover,\n.ui.inverted.black.buttons .basic.button:hover,\n.ui.inverted.black.basic.button:hover {\n  box-shadow: 0px 0px 0px 2px #333333 inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.black.basic.buttons .button.active,\n.ui.inverted.black.buttons .basic.button.active,\n.ui.inverted.black.basic.button.active {\n  box-shadow: 0px 0px 0px 2px #333333 inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.black.basic.buttons .button:active,\n.ui.inverted.black.buttons .basic.button:active,\n.ui.inverted.black.basic.button:active {\n  box-shadow: 0px 0px 0px 2px #212121 inset !important;\n  color: #ffffff !important;\n}\n\n/*--- Blue ---*/\n\n.ui.blue.buttons .button,\n.ui.blue.button {\n  background-color: #3b83c0;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.blue.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.blue.buttons .button:hover,\n.ui.blue.button:hover {\n  background-color: #458ac6;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.blue.buttons .button:active,\n.ui.blue.button:active {\n  background-color: #3370a5;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.blue.buttons .button.active,\n.ui.blue.buttons .button.active:active,\n.ui.blue.button.active,\n.ui.blue.button .button.active:active {\n  background-color: #3576ac;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Basic */\n\n.ui.basic.blue.buttons .button,\n.ui.basic.blue.button {\n  box-shadow: 0px 0px 0px 2px rgba(39, 41, 43, 0.15) inset !important;\n  color: rgba(0, 0, 0, 0.6) !important;\n}\n\n.ui.basic.blue.buttons .button:hover,\n.ui.basic.blue.button:hover {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #458ac6 inset !important;\n  color: #458ac6 !important;\n}\n\n.ui.basic.blue.buttons .button:active,\n.ui.basic.blue.button:active {\n  box-shadow: 0px 0px 0px 2px #3370a5 inset !important;\n  color: #3370a5 !important;\n}\n\n.ui.basic.blue.buttons .button.active,\n.ui.basic.blue.button.active {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #3370a5 inset !important;\n  color: #3370a5 !important;\n}\n\n.ui.buttons > .basic.blue.button:not(:first-child) {\n  margin-left: -2px;\n}\n\n/* Inverted */\n\n.ui.inverted.blue.buttons .button,\n.ui.inverted.blue.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px #54c8ff inset !important;\n  color: #54c8ff;\n}\n\n.ui.inverted.blue.buttons .button:hover,\n.ui.inverted.blue.button:hover {\n  box-shadow: 0px 0px 0px 2px #54c8ff inset !important;\n  background-color: #54c8ff;\n  color: #ffffff;\n}\n\n.ui.inverted.blue.buttons .button.active,\n.ui.inverted.blue.button.active {\n  box-shadow: 0px 0px 0px 2px #54c8ff inset !important;\n  background-color: #54c8ff;\n  color: #ffffff;\n}\n\n.ui.inverted.blue.buttons .button:active,\n.ui.inverted.blue.button:active {\n  box-shadow: 0px 0px 0px 2px #30bdff inset !important;\n  background-color: #30bdff;\n  color: #ffffff;\n}\n\n/* Inverted Basic */\n\n.ui.inverted.blue.basic.buttons .button,\n.ui.inverted.blue.buttons .basic.button,\n.ui.inverted.blue.basic.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.blue.basic.buttons .button:hover,\n.ui.inverted.blue.buttons .basic.button:hover,\n.ui.inverted.blue.basic.button:hover {\n  box-shadow: 0px 0px 0px 2px #54c8ff inset !important;\n  color: #54c8ff !important;\n}\n\n.ui.inverted.blue.basic.buttons .button.active,\n.ui.inverted.blue.buttons .basic.button.active,\n.ui.inverted.blue.basic.button.active {\n  box-shadow: 0px 0px 0px 2px #54c8ff inset !important;\n  color: #54c8ff !important;\n}\n\n.ui.inverted.blue.basic.buttons .button:active,\n.ui.inverted.blue.buttons .basic.button:active,\n.ui.inverted.blue.basic.button:active {\n  box-shadow: 0px 0px 0px 2px #30bdff inset !important;\n  color: #54c8ff !important;\n}\n\n/*--- Green ---*/\n\n.ui.green.buttons .button,\n.ui.green.button {\n  background-color: #5bbd72;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.green.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.green.buttons .button:hover,\n.ui.green.button:hover {\n  background-color: #66c17b;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.green.buttons .button:active,\n.ui.green.button:active {\n  background-color: #46ae5f;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.green.buttons .button.active,\n.ui.green.buttons .button.active:active,\n.ui.green.button.active,\n.ui.green.button .button.active:active {\n  background-color: #49b562;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Basic */\n\n.ui.basic.green.buttons .button,\n.ui.basic.green.button {\n  box-shadow: 0px 0px 0px 2px rgba(39, 41, 43, 0.15) inset !important;\n  color: rgba(0, 0, 0, 0.6) !important;\n}\n\n.ui.basic.green.buttons .button:hover,\n.ui.basic.green.button:hover {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #66c17b inset !important;\n  color: #66c17b !important;\n}\n\n.ui.basic.green.buttons .button:active,\n.ui.basic.green.button:active {\n  box-shadow: 0px 0px 0px 2px #46ae5f inset !important;\n  color: #46ae5f !important;\n}\n\n.ui.basic.green.buttons .button.active,\n.ui.basic.green.button.active {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #46ae5f inset !important;\n  color: #46ae5f !important;\n}\n\n.ui.buttons > .basic.green.button:not(:first-child) {\n  margin-left: -2px;\n}\n\n/* Inverted */\n\n.ui.inverted.green.buttons .button,\n.ui.inverted.green.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px #2ecc40 inset !important;\n  color: #2ecc40;\n}\n\n.ui.inverted.green.buttons .button:hover,\n.ui.inverted.green.button:hover {\n  box-shadow: 0px 0px 0px 2px #2ecc40 inset !important;\n  background-color: #2ecc40;\n  color: #ffffff;\n}\n\n.ui.inverted.green.buttons .button.active,\n.ui.inverted.green.button.active {\n  box-shadow: 0px 0px 0px 2px #2ecc40 inset !important;\n  background-color: #2ecc40;\n  color: #ffffff;\n}\n\n.ui.inverted.green.buttons .button:active,\n.ui.inverted.green.button:active {\n  box-shadow: 0px 0px 0px 2px #27af37 inset !important;\n  background-color: #27af37;\n  color: #ffffff;\n}\n\n/* Inverted Basic */\n\n.ui.inverted.green.basic.buttons .button,\n.ui.inverted.green.buttons .basic.button,\n.ui.inverted.green.basic.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.green.basic.buttons .button:hover,\n.ui.inverted.green.buttons .basic.button:hover,\n.ui.inverted.green.basic.button:hover {\n  box-shadow: 0px 0px 0px 2px #2ecc40 inset !important;\n  color: #2ecc40 !important;\n}\n\n.ui.inverted.green.basic.buttons .button.active,\n.ui.inverted.green.buttons .basic.button.active,\n.ui.inverted.green.basic.button.active {\n  box-shadow: 0px 0px 0px 2px #2ecc40 inset !important;\n  color: #2ecc40 !important;\n}\n\n.ui.inverted.green.basic.buttons .button:active,\n.ui.inverted.green.buttons .basic.button:active,\n.ui.inverted.green.basic.button:active {\n  box-shadow: 0px 0px 0px 2px #27af37 inset !important;\n  color: #2ecc40 !important;\n}\n\n/*--- Orange ---*/\n\n.ui.orange.buttons .button,\n.ui.orange.button {\n  background-color: #e07b53;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.orange.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.orange.buttons .button:hover,\n.ui.orange.button:hover {\n  background-color: #e28560;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.orange.buttons .button:active,\n.ui.orange.button:active {\n  background-color: #db6435;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.orange.buttons .button.active,\n.ui.orange.buttons .button.active:active,\n.ui.orange.button.active,\n.ui.orange.button .button.active:active {\n  background-color: #0f0f10;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Basic */\n\n.ui.basic.orange.buttons .button,\n.ui.basic.orange.button {\n  box-shadow: 0px 0px 0px 2px rgba(39, 41, 43, 0.15) inset !important;\n  color: rgba(0, 0, 0, 0.6) !important;\n}\n\n.ui.basic.orange.buttons .button:hover,\n.ui.basic.orange.button:hover {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #e28560 inset !important;\n  color: #e28560 !important;\n}\n\n.ui.basic.orange.buttons .button:active,\n.ui.basic.orange.button:active {\n  box-shadow: 0px 0px 0px 2px #db6435 inset !important;\n  color: #db6435 !important;\n}\n\n.ui.basic.orange.buttons .button.active,\n.ui.basic.orange.button.active {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #db6435 inset !important;\n  color: #db6435 !important;\n}\n\n.ui.buttons > .basic.orange.button:not(:first-child) {\n  margin-left: -2px;\n}\n\n/* Inverted */\n\n.ui.inverted.orange.buttons .button,\n.ui.inverted.orange.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px #ff851b inset !important;\n  color: #ff851b;\n}\n\n.ui.inverted.orange.buttons .button:hover,\n.ui.inverted.orange.button:hover {\n  box-shadow: 0px 0px 0px 2px #ff851b inset !important;\n  background-color: #ff851b;\n  color: #ffffff;\n}\n\n.ui.inverted.orange.buttons .button.active,\n.ui.inverted.orange.button.active {\n  box-shadow: 0px 0px 0px 2px #ff851b inset !important;\n  background-color: #ff851b;\n  color: #ffffff;\n}\n\n.ui.inverted.orange.buttons .button:active,\n.ui.inverted.orange.button:active {\n  box-shadow: 0px 0px 0px 2px #f67300 inset !important;\n  background-color: #f67300;\n  color: #ffffff;\n}\n\n/* Inverted Basic */\n\n.ui.inverted.orange.basic.buttons .button,\n.ui.inverted.orange.buttons .basic.button,\n.ui.inverted.orange.basic.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.orange.basic.buttons .button:hover,\n.ui.inverted.orange.buttons .basic.button:hover,\n.ui.inverted.orange.basic.button:hover {\n  box-shadow: 0px 0px 0px 2px #ff851b inset !important;\n  color: #ff851b !important;\n}\n\n.ui.inverted.orange.basic.buttons .button.active,\n.ui.inverted.orange.buttons .basic.button.active,\n.ui.inverted.orange.basic.button.active {\n  box-shadow: 0px 0px 0px 2px #ff851b inset !important;\n  color: #ff851b !important;\n}\n\n.ui.inverted.orange.basic.buttons .button:active,\n.ui.inverted.orange.buttons .basic.button:active,\n.ui.inverted.orange.basic.button:active {\n  box-shadow: 0px 0px 0px 2px #f67300 inset !important;\n  color: #ff851b !important;\n}\n\n/*--- Pink ---*/\n\n.ui.pink.buttons .button,\n.ui.pink.button {\n  background-color: #d9499a;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.pink.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.pink.buttons .button:hover,\n.ui.pink.button:hover {\n  background-color: #dc56a1;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.pink.buttons .button:active,\n.ui.pink.button:active {\n  background-color: #d22c8a;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.pink.buttons .button.active,\n.ui.pink.buttons .button.active:active,\n.ui.pink.button.active,\n.ui.pink.button .button.active:active {\n  background-color: #d5348e;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Basic */\n\n.ui.basic.pink.buttons .button,\n.ui.basic.pink.button {\n  box-shadow: 0px 0px 0px 2px rgba(39, 41, 43, 0.15) inset !important;\n  color: rgba(0, 0, 0, 0.6) !important;\n}\n\n.ui.basic.pink.buttons .button:hover,\n.ui.basic.pink.button:hover {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #dc56a1 inset !important;\n  color: #dc56a1 !important;\n}\n\n.ui.basic.pink.buttons .button:active,\n.ui.basic.pink.button:active {\n  box-shadow: 0px 0px 0px 2px #d22c8a inset !important;\n  color: #d22c8a !important;\n}\n\n.ui.basic.pink.buttons .button.active,\n.ui.basic.pink.button.active {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #d22c8a inset !important;\n  color: #d22c8a !important;\n}\n\n.ui.buttons > .basic.pink.button:not(:first-child) {\n  margin-left: -2px;\n}\n\n/* Inverted */\n\n.ui.inverted.pink.buttons .button,\n.ui.inverted.pink.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px #ff8edf inset !important;\n  color: #ff8edf;\n}\n\n.ui.inverted.pink.buttons .button:hover,\n.ui.inverted.pink.button:hover {\n  box-shadow: 0px 0px 0px 2px #ff8edf inset !important;\n  background-color: #ff8edf;\n  color: #ffffff;\n}\n\n.ui.inverted.pink.buttons .button.active,\n.ui.inverted.pink.button.active {\n  box-shadow: 0px 0px 0px 2px #ff8edf inset !important;\n  background-color: #ff8edf;\n  color: #ffffff;\n}\n\n.ui.inverted.pink.buttons .button:active,\n.ui.inverted.pink.button:active {\n  box-shadow: 0px 0px 0px 2px #ff6ad5 inset !important;\n  background-color: #ff6ad5;\n  color: #ffffff;\n}\n\n/* Inverted Basic */\n\n.ui.inverted.pink.basic.buttons .button,\n.ui.inverted.pink.buttons .basic.button,\n.ui.inverted.pink.basic.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.pink.basic.buttons .button:hover,\n.ui.inverted.pink.buttons .basic.button:hover,\n.ui.inverted.pink.basic.button:hover {\n  box-shadow: 0px 0px 0px 2px #ff8edf inset !important;\n  color: #ff8edf !important;\n}\n\n.ui.inverted.pink.basic.buttons .button.active,\n.ui.inverted.pink.buttons .basic.button.active,\n.ui.inverted.pink.basic.button.active {\n  box-shadow: 0px 0px 0px 2px #ff8edf inset !important;\n  color: #ff8edf !important;\n}\n\n.ui.inverted.pink.basic.buttons .button:active,\n.ui.inverted.pink.buttons .basic.button:active,\n.ui.inverted.pink.basic.button:active {\n  box-shadow: 0px 0px 0px 2px #ff6ad5 inset !important;\n  color: #ff8edf !important;\n}\n\n/*--- Purple ---*/\n\n.ui.purple.buttons .button,\n.ui.purple.button {\n  background-color: #564f8a;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.purple.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.purple.buttons .button:hover,\n.ui.purple.button:hover {\n  background-color: #5c5594;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.purple.buttons .button:active,\n.ui.purple.button:active {\n  background-color: #484273;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.purple.buttons .button.active,\n.ui.purple.buttons .button.active:active,\n.ui.purple.button.active,\n.ui.purple.button .button.active:active {\n  background-color: #4c467a;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Basic */\n\n.ui.basic.purple.buttons .button,\n.ui.basic.purple.button {\n  box-shadow: 0px 0px 0px 2px rgba(39, 41, 43, 0.15) inset !important;\n  color: rgba(0, 0, 0, 0.6) !important;\n}\n\n.ui.basic.purple.buttons .button:hover,\n.ui.basic.purple.button:hover {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #5c5594 inset !important;\n  color: #5c5594 !important;\n}\n\n.ui.basic.purple.buttons .button:active,\n.ui.basic.purple.button:active {\n  box-shadow: 0px 0px 0px 2px #484273 inset !important;\n  color: #484273 !important;\n}\n\n.ui.basic.purple.buttons .button.active,\n.ui.basic.purple.button.active {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #484273 inset !important;\n  color: #484273 !important;\n}\n\n.ui.buttons > .basic.purple.button:not(:first-child) {\n  margin-left: -2px;\n}\n\n/* Inverted */\n\n.ui.inverted.purple.buttons .button,\n.ui.inverted.purple.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px #cdc6ff inset !important;\n  color: #cdc6ff;\n}\n\n.ui.inverted.purple.buttons .button:hover,\n.ui.inverted.purple.button:hover {\n  box-shadow: 0px 0px 0px 2px #cdc6ff inset !important;\n  background-color: #cdc6ff;\n  color: #1b1c1d;\n}\n\n.ui.inverted.purple.buttons .button.active,\n.ui.inverted.purple.button.active {\n  box-shadow: 0px 0px 0px 2px #cdc6ff inset !important;\n  background-color: #cdc6ff;\n  color: #1b1c1d;\n}\n\n.ui.inverted.purple.buttons .button:active,\n.ui.inverted.purple.button:active {\n  box-shadow: 0px 0px 0px 2px #aea2ff inset !important;\n  background-color: #aea2ff;\n  color: #1b1c1d;\n}\n\n/* Inverted Basic */\n\n.ui.inverted.purple.basic.buttons .button,\n.ui.inverted.purple.buttons .basic.button,\n.ui.inverted.purple.basic.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.purple.basic.buttons .button:hover,\n.ui.inverted.purple.buttons .basic.button:hover,\n.ui.inverted.purple.basic.button:hover {\n  box-shadow: 0px 0px 0px 2px #cdc6ff inset !important;\n  color: #cdc6ff !important;\n}\n\n.ui.inverted.purple.basic.buttons .button.active,\n.ui.inverted.purple.buttons .basic.button.active,\n.ui.inverted.purple.basic.button.active {\n  box-shadow: 0px 0px 0px 2px #cdc6ff inset !important;\n  color: #cdc6ff !important;\n}\n\n.ui.inverted.purple.basic.buttons .button:active,\n.ui.inverted.purple.buttons .basic.button:active,\n.ui.inverted.purple.basic.button:active {\n  box-shadow: 0px 0px 0px 2px #aea2ff inset !important;\n  color: #cdc6ff !important;\n}\n\n/*--- Red ---*/\n\n.ui.red.buttons .button,\n.ui.red.button {\n  background-color: #d95c5c;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.red.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.red.buttons .button:hover,\n.ui.red.button:hover {\n  background-color: #dc6868;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.red.buttons .button:active,\n.ui.red.button:active {\n  background-color: #d23f3f;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.red.buttons .button.active,\n.ui.red.buttons .button.active:active,\n.ui.red.button.active,\n.ui.red.button .button.active:active {\n  background-color: #d44747;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Basic */\n\n.ui.basic.red.buttons .button,\n.ui.basic.red.button {\n  box-shadow: 0px 0px 0px 2px rgba(39, 41, 43, 0.15) inset !important;\n  color: rgba(0, 0, 0, 0.6) !important;\n}\n\n.ui.basic.red.buttons .button:hover,\n.ui.basic.red.button:hover {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #dc6868 inset !important;\n  color: #dc6868 !important;\n}\n\n.ui.basic.red.buttons .button:active,\n.ui.basic.red.button:active {\n  box-shadow: 0px 0px 0px 2px #d23f3f inset !important;\n  color: #d23f3f !important;\n}\n\n.ui.basic.red.buttons .button.active,\n.ui.basic.red.button.active {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #d23f3f inset !important;\n  color: #d23f3f !important;\n}\n\n.ui.buttons > .basic.red.button:not(:first-child) {\n  margin-left: -2px;\n}\n\n/* Inverted */\n\n.ui.inverted.red.buttons .button,\n.ui.inverted.red.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px #ff695e inset !important;\n  color: #ff695e;\n}\n\n.ui.inverted.red.buttons .button:hover,\n.ui.inverted.red.button:hover {\n  box-shadow: 0px 0px 0px 2px #ff695e inset !important;\n  background-color: #ff695e;\n  color: #ffffff;\n}\n\n.ui.inverted.red.buttons .button.active,\n.ui.inverted.red.button.active {\n  box-shadow: 0px 0px 0px 2px #ff695e inset !important;\n  background-color: #ff695e;\n  color: #ffffff;\n}\n\n.ui.inverted.red.buttons .button:active,\n.ui.inverted.red.button:active {\n  box-shadow: 0px 0px 0px 2px #ff483a inset !important;\n  background-color: #ff483a;\n  color: #ffffff;\n}\n\n/* Inverted Basic */\n\n.ui.inverted.red.basic.buttons .button,\n.ui.inverted.red.buttons .basic.button,\n.ui.inverted.red.basic.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.red.basic.buttons .button:hover,\n.ui.inverted.red.buttons .basic.button:hover,\n.ui.inverted.red.basic.button:hover {\n  box-shadow: 0px 0px 0px 2px #ff695e inset !important;\n  color: #ff695e !important;\n}\n\n.ui.inverted.red.basic.buttons .button.active,\n.ui.inverted.red.buttons .basic.button.active,\n.ui.inverted.red.basic.button.active {\n  box-shadow: 0px 0px 0px 2px #ff695e inset !important;\n  color: #ff695e !important;\n}\n\n.ui.inverted.red.basic.buttons .button:active,\n.ui.inverted.red.buttons .basic.button:active,\n.ui.inverted.red.basic.button:active {\n  box-shadow: 0px 0px 0px 2px #ff483a inset !important;\n  color: #ff695e !important;\n}\n\n/*--- Teal ---*/\n\n.ui.teal.buttons .button,\n.ui.teal.button {\n  background-color: #00b5ad;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.teal.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.teal.buttons .button:hover,\n.ui.teal.button:hover {\n  background-color: #00c4bc;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.teal.buttons .button:active,\n.ui.teal.button:active {\n  background-color: #00918b;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.teal.buttons .button.active,\n.ui.teal.buttons .button.active:active,\n.ui.teal.button.active,\n.ui.teal.button .button.active:active {\n  background-color: #009c95;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Basic */\n\n.ui.basic.teal.buttons .button,\n.ui.basic.teal.button {\n  box-shadow: 0px 0px 0px 2px rgba(39, 41, 43, 0.15) inset !important;\n  color: rgba(0, 0, 0, 0.6) !important;\n}\n\n.ui.basic.teal.buttons .button:hover,\n.ui.basic.teal.button:hover {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #00c4bc inset !important;\n  color: #00c4bc !important;\n}\n\n.ui.basic.teal.buttons .button:active,\n.ui.basic.teal.button:active {\n  box-shadow: 0px 0px 0px 2px #00918b inset !important;\n  color: #00918b !important;\n}\n\n.ui.basic.teal.buttons .button.active,\n.ui.basic.teal.button.active {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #00918b inset !important;\n  color: #00918b !important;\n}\n\n.ui.buttons > .basic.teal.button:not(:first-child) {\n  margin-left: -2px;\n}\n\n/* Inverted */\n\n.ui.inverted.teal.buttons .button,\n.ui.inverted.teal.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px #6dffff inset !important;\n  color: #6dffff;\n}\n\n.ui.inverted.teal.buttons .button:hover,\n.ui.inverted.teal.button:hover {\n  box-shadow: 0px 0px 0px 2px #6dffff inset !important;\n  background-color: #6dffff;\n  color: #1b1c1d;\n}\n\n.ui.inverted.teal.buttons .button.active,\n.ui.inverted.teal.button.active {\n  box-shadow: 0px 0px 0px 2px #6dffff inset !important;\n  background-color: #6dffff;\n  color: #1b1c1d;\n}\n\n.ui.inverted.teal.buttons .button:active,\n.ui.inverted.teal.button:active {\n  box-shadow: 0px 0px 0px 2px #49ffff inset !important;\n  background-color: #49ffff;\n  color: #1b1c1d;\n}\n\n/* Inverted Basic */\n\n.ui.inverted.teal.basic.buttons .button,\n.ui.inverted.teal.buttons .basic.button,\n.ui.inverted.teal.basic.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.teal.basic.buttons .button:hover,\n.ui.inverted.teal.buttons .basic.button:hover,\n.ui.inverted.teal.basic.button:hover {\n  box-shadow: 0px 0px 0px 2px #6dffff inset !important;\n  color: #6dffff !important;\n}\n\n.ui.inverted.teal.basic.buttons .button.active,\n.ui.inverted.teal.buttons .basic.button.active,\n.ui.inverted.teal.basic.button.active {\n  box-shadow: 0px 0px 0px 2px #6dffff inset !important;\n  color: #6dffff !important;\n}\n\n.ui.inverted.teal.basic.buttons .button:active,\n.ui.inverted.teal.buttons .basic.button:active,\n.ui.inverted.teal.basic.button:active {\n  box-shadow: 0px 0px 0px 2px #49ffff inset !important;\n  color: #6dffff !important;\n}\n\n/*--- Yellow ---*/\n\n.ui.yellow.buttons .button,\n.ui.yellow.button {\n  background-color: #f2c61f;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.yellow.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.yellow.buttons .button:hover,\n.ui.yellow.button:hover {\n  background-color: #f3ca2d;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.yellow.buttons .button:active,\n.ui.yellow.button:active {\n  background-color: #e0b40d;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.yellow.buttons .button.active,\n.ui.yellow.buttons .button.active:active,\n.ui.yellow.button.active,\n.ui.yellow.button .button.active:active {\n  background-color: #eabc0e;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/* Basic */\n\n.ui.basic.yellow.buttons .button,\n.ui.basic.yellow.button {\n  box-shadow: 0px 0px 0px 2px rgba(39, 41, 43, 0.15) inset !important;\n  color: rgba(0, 0, 0, 0.6) !important;\n}\n\n.ui.basic.yellow.buttons .button:hover,\n.ui.basic.yellow.button:hover {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #f3ca2d inset !important;\n  color: #f3ca2d !important;\n}\n\n.ui.basic.yellow.buttons .button:active,\n.ui.basic.yellow.button:active {\n  box-shadow: 0px 0px 0px 2px #e0b40d inset !important;\n  color: #e0b40d !important;\n}\n\n.ui.basic.yellow.buttons .button.active,\n.ui.basic.yellow.button.active {\n  background: transparent !important;\n  box-shadow: 0px 0px 0px 2px #e0b40d inset !important;\n  color: #e0b40d !important;\n}\n\n.ui.buttons > .basic.yellow.button:not(:first-child) {\n  margin-left: -2px;\n}\n\n/* Inverted */\n\n.ui.inverted.yellow.buttons .button,\n.ui.inverted.yellow.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px #ffe21f inset !important;\n  color: #ffe21f;\n}\n\n.ui.inverted.yellow.buttons .button:hover,\n.ui.inverted.yellow.button:hover {\n  box-shadow: 0px 0px 0px 2px #ffe21f inset !important;\n  background-color: #ffe21f;\n  color: #1b1c1d;\n}\n\n.ui.inverted.yellow.buttons .button.active,\n.ui.inverted.yellow.button.active {\n  box-shadow: 0px 0px 0px 2px #ffe21f inset !important;\n  background-color: #ffe21f;\n  color: #1b1c1d;\n}\n\n.ui.inverted.yellow.buttons .button:active,\n.ui.inverted.yellow.button:active {\n  box-shadow: 0px 0px 0px 2px #fada00 inset !important;\n  background-color: #fada00;\n  color: #1b1c1d;\n}\n\n/* Inverted Basic */\n\n.ui.inverted.yellow.basic.buttons .button,\n.ui.inverted.yellow.buttons .basic.button,\n.ui.inverted.yellow.basic.button {\n  background-color: transparent;\n  box-shadow: 0px 0px 0px 2px rgba(255, 255, 255, 0.5) inset !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.yellow.basic.buttons .button:hover,\n.ui.inverted.yellow.buttons .basic.button:hover,\n.ui.inverted.yellow.basic.button:hover {\n  box-shadow: 0px 0px 0px 2px #ffe21f inset !important;\n  color: #ffe21f !important;\n}\n\n.ui.inverted.yellow.basic.buttons .button.active,\n.ui.inverted.yellow.buttons .basic.button.active,\n.ui.inverted.yellow.basic.button.active {\n  box-shadow: 0px 0px 0px 2px #ffe21f inset !important;\n  color: #ffe21f !important;\n}\n\n.ui.inverted.yellow.basic.buttons .button:active,\n.ui.inverted.yellow.buttons .basic.button:active,\n.ui.inverted.yellow.basic.button:active {\n  box-shadow: 0px 0px 0px 2px #fada00 inset !important;\n  color: #ffe21f !important;\n}\n\n/*-------------------\n       Primary\n--------------------*/\n\n.ui.primary.buttons .button,\n.ui.primary.button {\n  background-color: #3b83c0;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.primary.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.primary.buttons .button:hover,\n.ui.primary.button:hover {\n  background-color: #458ac6;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.primary.buttons .button:active,\n.ui.primary.button:active {\n  background-color: #3370a5;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.primary.buttons .active.button,\n.ui.primary.button.active {\n  background-color: #3576ac;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/*-------------------\n      Secondary\n--------------------*/\n\n.ui.secondary.buttons .button,\n.ui.secondary.button {\n  background-color: #1b1c1d;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.secondary.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.secondary.buttons .button:hover,\n.ui.secondary.button:hover {\n  background-color: #222425;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.secondary.buttons .button:active,\n.ui.secondary.button:active {\n  background-color: #0a0a0b;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.secondary.buttons .active.button,\n.ui.secondary.button.active {\n  background-color: #0f0f10;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/*---------------\n    Positive\n----------------*/\n\n.ui.positive.buttons .button,\n.ui.positive.button {\n  background-color: #5bbd72 !important;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.positive.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.positive.buttons .button:hover,\n.ui.positive.button:hover,\n.ui.positive.buttons .active.button,\n.ui.positive.button.active {\n  background-color: #66c17b !important;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.positive.buttons .button:active,\n.ui.positive.button:active {\n  background-color: #46ae5f !important;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.positive.buttons .button.active,\n.ui.positive.buttons .button.active:active,\n.ui.positive.button.active,\n.ui.positive.button .button.active:active {\n  background-color: #49b562;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/*---------------\n     Negative\n----------------*/\n\n.ui.negative.buttons .button,\n.ui.negative.button {\n  background-color: #d95c5c !important;\n  color: #ffffff;\n  text-shadow: none;\n  background-image: none;\n}\n\n.ui.negative.button {\n  box-shadow: 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.negative.buttons .button:hover,\n.ui.negative.button:hover,\n.ui.negative.buttons .active.button,\n.ui.negative.button.active {\n  background-color: #dc6868 !important;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.negative.buttons .button:active,\n.ui.negative.button:active {\n  background-color: #d23f3f !important;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n.ui.negative.buttons .button.active,\n.ui.negative.buttons .button.active:active,\n.ui.negative.button.active,\n.ui.negative.button .button.active:active {\n  background-color: #d44747;\n  color: #ffffff;\n  text-shadow: none;\n}\n\n/*******************************\n            Groups\n*******************************/\n\n.ui.buttons {\n  display: inline-block;\n  vertical-align: middle;\n  margin: 0em 0.25em 0em 0em;\n}\n\n.ui.buttons > .button:hover,\n.ui.buttons > .button.active {\n  position: relative;\n}\n\n.ui.buttons:after {\n  content: ".";\n  display: block;\n  height: 0;\n  clear: both;\n  visibility: hidden;\n}\n\n.ui.buttons .button:first-child {\n  border-left: none;\n}\n\n.ui.buttons:not(.basic):not(.inverted) {\n  box-shadow: none;\n}\n\n.ui.buttons > .ui.button:not(.basic):not(.inverted),\n.ui.buttons:not(.basic):not(.inverted) > .button {\n  box-shadow: 0px 0px 0px 1px transparent inset, 0px 0em 0px 0px rgba(39, 41, 43, 0.15) inset;\n}\n\n.ui.buttons .button {\n  margin: 0em;\n  float: left;\n  border-radius: 0em;\n  margin: 0px 0px 0px 0px;\n}\n\n.ui.buttons .button:first-child {\n  margin-left: 0em;\n  border-top-left-radius: 0.2857rem;\n  border-bottom-left-radius: 0.2857rem;\n}\n\n.ui.buttons .button:last-child {\n  border-top-right-radius: 0.2857rem;\n  border-bottom-right-radius: 0.2857rem;\n}\n\n/* Vertical  Style */\n\n.ui.vertical.buttons {\n  display: inline-block;\n}\n\n.ui.vertical.buttons .button {\n  display: block;\n  float: none;\n  margin: 0px 0px 0px 0px;\n  box-shadow: none;\n}\n\n.ui.vertical.buttons .button:first-child,\n.ui.vertical.buttons .mini.button:first-child,\n.ui.vertical.buttons .tiny.button:first-child,\n.ui.vertical.buttons .small.button:first-child,\n.ui.vertical.buttons .massive.button:first-child,\n.ui.vertical.buttons .huge.button:first-child {\n  border-radius: 0.2857rem 0.2857rem 0px 0px;\n}\n\n.ui.vertical.buttons .button:last-child,\n.ui.vertical.buttons .mini.button:last-child,\n.ui.vertical.buttons .tiny.button:last-child,\n.ui.vertical.buttons .small.button:last-child,\n.ui.vertical.buttons .massive.button:last-child,\n.ui.vertical.buttons .huge.button:last-child,\n.ui.vertical.buttons .gigantic.button:last-child {\n  margin-bottom: 0px;\n  border-radius: 0px 0px 0.2857rem 0.2857rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Divider\n*******************************/\n\n.ui.divider {\n  margin: 1rem 0rem;\n  line-height: 1;\n  height: 0em;\n  font-weight: bold;\n  text-transform: uppercase;\n  letter-spacing: 0.05em;\n  color: rgba(0, 0, 0, 0.85);\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);\n}\n\n/*--------------\n      Basic\n---------------*/\n\n.ui.divider:not(.vertical):not(.horizontal) {\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  border-bottom: 1px solid rgba(255, 255, 255, 0.2);\n}\n\n/*--------------\n    Coupling\n---------------*/\n\n.ui.grid > .ui.divider {\n  font-size: 1rem;\n}\n\n/*--------------\n   Horizontal\n---------------*/\n\n.ui.horizontal.divider {\n  position: relative;\n  height: auto;\n  margin: \'\';\n  overflow: hidden;\n  line-height: 1;\n  text-align: center;\n}\n\n.ui.horizontal.divider:before,\n.ui.horizontal.divider:after {\n  position: absolute;\n  content: \'\';\n  z-index: 3;\n  width: 50%;\n  top: 50%;\n  height: 0px;\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  border-bottom: 1px solid rgba(255, 255, 255, 0.2);\n}\n\n.ui.horizontal.divider:before {\n  margin-left: -webkit-calc(-50% -  1em );\n  margin-left: calc(-50% -  1em );\n}\n\n.ui.horizontal.divider:after {\n  margin-left: 1em;\n}\n\n/*--------------\n    Vertical\n---------------*/\n\n.ui.vertical.divider {\n  position: absolute;\n  z-index: 2;\n  top: 50%;\n  left: 50%;\n  margin: 0rem;\n  padding: 0em;\n  width: auto;\n  height: 50%;\n  line-height: 0em;\n  text-align: center;\n  -webkit-transform: translateX(-50%);\n  -ms-transform: translateX(-50%);\n  transform: translateX(-50%);\n}\n\n.ui.vertical.divider:before,\n.ui.vertical.divider:after {\n  position: absolute;\n  left: 50%;\n  content: \'\';\n  z-index: 3;\n  border-left: 1px solid rgba(0, 0, 0, 0.1);\n  border-right: 1px solid rgba(255, 255, 255, 0.2);\n  width: 0%;\n  height: -webkit-calc(100% -  1rem );\n  height: calc(100% -  1rem );\n}\n\n.ui.vertical.divider:before {\n  top: -100%;\n}\n\n.ui.vertical.divider:after {\n  top: auto;\n  bottom: 0px;\n}\n\n/* Inside grid */\n\n@media only screen and (max-width: 767px) {\n  .ui.stackable.grid .ui.vertical.divider,\n  .ui.grid .stackable.row .ui.vertical.divider {\n    position: relative;\n    margin: 1rem 0rem;\n    left: 50%;\n    height: auto;\n    overflow: hidden;\n    line-height: 1;\n    text-align: center;\n  }\n\n  .ui.stackable.grid .ui.vertical.divider:before,\n  .ui.grid .stackable.row .ui.vertical.divider:before,\n  .ui.stackable.grid .ui.vertical.divider:after,\n  .ui.grid .stackable.row .ui.vertical.divider:after {\n    position: absolute;\n    left: auto;\n    content: \'\';\n    z-index: 3;\n    width: 50%;\n    top: 50%;\n    height: 0px;\n    border-top: 1px solid rgba(0, 0, 0, 0.1);\n    border-bottom: 1px solid rgba(255, 255, 255, 0.2);\n  }\n\n  .ui.stackable.grid .ui.vertical.divider:before,\n  .ui.grid .stackable.row .ui.vertical.divider:before {\n    margin-left: -51%;\n  }\n\n  .ui.stackable.grid .ui.vertical.divider:after,\n  .ui.grid .stackable.row .ui.vertical.divider:after {\n    margin-left: 1em;\n  }\n}\n\n/*--------------\n      Icon\n---------------*/\n\n.ui.divider > .icon {\n  margin: 0rem;\n  font-size: 1rem;\n  height: 1em;\n  vertical-align: middle;\n}\n\n/*******************************\n          Variations\n*******************************/\n\n/*--------------\n    Hidden\n---------------*/\n\n.ui.hidden.divider {\n  border-color: transparent !important;\n}\n\n/*--------------\n    Inverted\n---------------*/\n\n.ui.divider.inverted {\n  color: #ffffff;\n}\n\n.ui.vertical.inverted.divider,\n.ui.horizontal.inverted.divider {\n  color: #ffffff;\n}\n\n.ui.divider.inverted,\n.ui.divider.inverted:after,\n.ui.divider.inverted:before {\n  border-top-color: rgba(0, 0, 0, 0.15) !important;\n  border-bottom-color: rgba(255, 255, 255, 0.15) !important;\n  border-left-color: rgba(0, 0, 0, 0.15) !important;\n  border-right-color: rgba(255, 255, 255, 0.15) !important;\n}\n\n/*--------------\n    Fitted\n---------------*/\n\n.ui.fitted.divider {\n  margin: 0em;\n}\n\n/*--------------\n    Clearing\n---------------*/\n\n.ui.clearing.divider {\n  clear: both;\n}\n\n/*--------------\n    Section\n---------------*/\n\n.ui.section.divider {\n  margin-top: 2rem;\n  margin-bottom: 2rem;\n}\n\n/*--------------\n     Sizes\n---------------*/\n\n.ui.divider {\n  font-size: 1rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Header\n*******************************/\n\n/* Standard */\n\n.ui.header {\n  border: none;\n  margin: -webkit-calc(2rem -  0.165em ) 0em 1rem;\n  margin: calc(2rem -  0.165em ) 0em 1rem;\n  padding: 0em 0em;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-weight: bold;\n  line-height: 1.33em;\n  text-transform: none;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.header .sub.header {\n  font-size: 1.0714rem;\n  font-weight: normal;\n  margin: 0em;\n  padding: 0em;\n  line-height: 1.2em;\n  color: rgba(0, 0, 0, 0.5);\n}\n\n.ui.header:first-child {\n  margin-top: -0.165em;\n}\n\n.ui.header:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------\n      Icon\n---------------*/\n\n.ui.header > .icon {\n  display: table-cell;\n  opacity: 1;\n  font-size: 1.5em;\n  padding-top: 0.165em;\n  vertical-align: middle;\n  padding-right: 0.5rem;\n}\n\n/* Only One */\n\n.ui.header .icon:only-child {\n  display: inline-block;\n  padding: 0em;\n  margin-right: 0.5rem;\n  vertical-align: baseline;\n}\n\n/*--------------\n     Content\n---------------*/\n\n.ui.header .content {\n  display: inline-block;\n  vertical-align: top;\n}\n\n.ui.header > .icon + .content {\n  padding-left: 0.5rem;\n  display: table-cell;\n  vertical-align: middle;\n}\n\n/*--------------\n Content Heading\n---------------*/\n\n.ui.tiny.header {\n  font-size: 1em;\n}\n\n.ui.small.header {\n  font-size: 1.071em;\n}\n\n.ui.medium.header {\n  font-size: 1.285em;\n}\n\n.ui.large.header {\n  font-size: 1.714em;\n}\n\n.ui.huge.header {\n  min-height: 1em;\n  font-size: 2em;\n}\n\n/*--------------\n Loose Coupling\n---------------*/\n\n.ui.header .ui.label {\n  margin: 0em 0em 0em 0.5rem;\n  vertical-align: middle;\n}\n\n/* Positioning */\n\n.ui.header + p {\n  margin-top: 0em;\n}\n\n/*******************************\n            Types\n*******************************/\n\n/*--------------\n     Page\n---------------*/\n\nh1.ui.header {\n  font-size: 2rem;\n}\n\nh2.ui.header {\n  font-size: 1.714rem;\n}\n\nh3.ui.header {\n  font-size: 1.28rem;\n}\n\nh4.ui.header {\n  font-size: 1.071rem;\n}\n\nh5.ui.header {\n  font-size: 1rem;\n}\n\n/*-------------------\n        Icon\n--------------------*/\n\n.ui.icon.header {\n  display: inline-block;\n  text-align: center;\n  margin: 2rem 0em 1rem;\n}\n\n.ui.icon.header:after {\n  content: \'\';\n  display: block;\n  height: 0px;\n  clear: both;\n  visibility: hidden;\n}\n\n.ui.icon.header:first-child {\n  margin-top: 0em;\n}\n\n.ui.icon.header .icon {\n  float: none;\n  display: block;\n  width: auto;\n  height: auto;\n  padding: 0em;\n  font-size: 3em;\n  margin: 0em auto 0.25rem;\n  opacity: 1;\n}\n\n.ui.icon.header .content {\n  display: block;\n}\n\n.ui.icon.header .circular.icon {\n  font-size: 2em;\n}\n\n.ui.icon.header .square.icon {\n  font-size: 2em;\n}\n\n.ui.block.icon.header .icon {\n  margin-bottom: 0em;\n}\n\n.ui.icon.header.aligned {\n  margin-left: auto;\n  margin-right: auto;\n  display: block;\n}\n\n/*******************************\n            States\n*******************************/\n\n.ui.disabled.header {\n  opacity: 0.3;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-------------------\n       Colors\n--------------------*/\n\n.ui.black.header {\n  color: #1b1c1d !important;\n}\n\na.ui.black.header:hover {\n  color: #1b1c1d !important;\n}\n\n.ui.blue.header {\n  color: #3b83c0 !important;\n}\n\na.ui.blue.header:hover {\n  color: #458ac6 !important;\n}\n\n.ui.green.header {\n  color: #5bbd72 !important;\n}\n\na.ui.green.header:hover {\n  color: #66c17b !important;\n}\n\n.ui.orange.header {\n  color: #e07b53 !important;\n}\n\na.ui.orange.header:hover {\n  color: #e28560 !important;\n}\n\n.ui.pink.header {\n  color: #d9499a !important;\n}\n\na.ui.pink.header:hover {\n  color: #dc56a1 !important;\n}\n\n.ui.purple.header {\n  color: #564f8a !important;\n}\n\na.ui.purple.header:hover {\n  color: #5c5594 !important;\n}\n\n.ui.red.header {\n  color: #d95c5c !important;\n}\n\na.ui.red.header:hover {\n  color: #dc6868 !important;\n}\n\n.ui.teal.header {\n  color: #00b5ad !important;\n}\n\na.ui.teal.header:hover {\n  color: #00c4bc !important;\n}\n\n.ui.yellow.header {\n  color: #f2c61f !important;\n}\n\na.ui.yellow.header:hover {\n  color: #f3ca2d !important;\n}\n\n.ui.black.dividing.header {\n  border-bottom: 2px solid #1b1c1d;\n}\n\n.ui.blue.dividing.header {\n  border-bottom: 2px solid #3b83c0;\n}\n\n.ui.green.dividing.header {\n  border-bottom: 2px solid #5bbd72;\n}\n\n.ui.orange.dividing.header {\n  border-bottom: 2px solid #e07b53;\n}\n\n.ui.pink.dividing.header {\n  border-bottom: 2px solid #d9499a;\n}\n\n.ui.purple.dividing.header {\n  border-bottom: 2px solid #564f8a;\n}\n\n.ui.red.dividing.header {\n  border-bottom: 2px solid #d95c5c;\n}\n\n.ui.teal.dividing.header {\n  border-bottom: 2px solid #00b5ad;\n}\n\n.ui.yellow.dividing.header {\n  border-bottom: 2px solid #f2c61f;\n}\n\n/*-------------------\n      Inverted\n--------------------*/\n\n.ui.inverted.header {\n  color: #ffffff;\n}\n\n.ui.inverted.header .sub.header {\n  color: rgba(255, 255, 255, 0.85);\n}\n\n.ui.inverted.attached.header {\n  background: #333333 -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  background: #333333 linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  box-shadow: none;\n}\n\n.ui.inverted.block.header {\n  background: #333333 -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  background: #333333 linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  box-shadow: none;\n}\n\n/*-------------------\n   Inverted Colors\n--------------------*/\n\n.ui.inverted.black.header {\n  color: #aaaaaa !important;\n}\n\na.ui.inverted.black.header:hover {\n  color: #b2b2b2 !important;\n}\n\n.ui.inverted.blue.header {\n  color: #54c8ff !important;\n}\n\na.ui.inverted.blue.header:hover {\n  color: #63cdff !important;\n}\n\n.ui.inverted.green.header {\n  color: #2ecc40 !important;\n}\n\na.ui.inverted.green.header:hover {\n  color: #37d249 !important;\n}\n\n.ui.inverted.orange.header {\n  color: #ff851b !important;\n}\n\na.ui.inverted.orange.header:hover {\n  color: #ff8d2a !important;\n}\n\n.ui.inverted.pink.header {\n  color: #ff8edf !important;\n}\n\na.ui.inverted.pink.header:hover {\n  color: #ff9de3 !important;\n}\n\n.ui.inverted.purple.header {\n  color: #cdc6ff !important;\n}\n\na.ui.inverted.purple.header:hover {\n  color: #dad5ff !important;\n}\n\n.ui.inverted.red.header {\n  color: #ff695e !important;\n}\n\na.ui.inverted.red.header:hover {\n  color: #ff776d !important;\n}\n\n.ui.inverted.teal.header {\n  color: #6dffff !important;\n}\n\na.ui.inverted.teal.header:hover {\n  color: #7cffff !important;\n}\n\n.ui.inverted.yellow.header {\n  color: #ffe21f !important;\n}\n\na.ui.inverted.yellow.header:hover {\n  color: #ffe42e !important;\n}\n\n.ui.inverted.block.header {\n  border-bottom: none;\n}\n\n/*-------------------\n       Aligned\n--------------------*/\n\n.ui.left.aligned.header {\n  text-align: left;\n}\n\n.ui.right.aligned.header {\n  text-align: right;\n}\n\n.ui.centered.header,\n.ui.center.aligned.header {\n  text-align: center;\n}\n\n.ui.justified.header {\n  text-align: justify;\n}\n\n.ui.justified.header:after {\n  display: inline-block;\n  content: \'\';\n  width: 100%;\n}\n\n/*-------------------\n       Floated\n--------------------*/\n\n.ui.floated.header,\n.ui[class*="left floated"].header {\n  float: left;\n  margin-top: 0em;\n  margin-right: 0.5em;\n}\n\n.ui[class*="right floated"].header {\n  float: right;\n  margin-top: 0em;\n  margin-left: 0.5em;\n}\n\n/*-------------------\n       Fittted\n--------------------*/\n\n.ui.fitted.header {\n  padding: 0em;\n}\n\n/*-------------------\n      Dividing\n--------------------*/\n\n.ui.dividing.header {\n  padding-bottom: 0.25rem;\n  border-bottom: 1px solid rgba(0, 0, 0, 0.1);\n}\n\n.ui.dividing.header .sub.header {\n  padding-bottom: 0.25rem;\n}\n\n.ui.dividing.header .icon {\n  margin-bottom: 0em;\n}\n\n.ui.inverted.dividing.header {\n  border-bottom-color: rgba(255, 255, 255, 0.2);\n}\n\n/*-------------------\n        Block\n--------------------*/\n\n.ui.block.header {\n  background: #f0f0f0;\n  padding: 0.75rem 1rem;\n  box-shadow: none;\n  border: 1px solid #d4d4d5;\n  border-radius: 0.3125rem;\n}\n\n.ui.tiny.block.header {\n  font-size: 1em;\n}\n\n.ui.small.block.header {\n  font-size: 1.071em;\n}\n\n.ui.block.header:not(h1):not(h2):not(h3):not(h4):not(h5):not(h6) {\n  font-size: 1.285em;\n}\n\n.ui.large.block.header {\n  font-size: 1.714em;\n}\n\n.ui.huge.block.header {\n  font-size: 2em;\n}\n\n/*-------------------\n       Attached\n--------------------*/\n\n.ui.attached.header {\n  background: #ffffff;\n  padding: 0.75rem 1rem;\n  margin-left: -1px;\n  margin-right: -1px;\n  box-shadow: none;\n  border: 1px solid #d4d4d5;\n}\n\n.ui.attached.block.header {\n  background: #f0f0f0;\n}\n\n.ui.attached:not(.top):not(.bottom).header {\n  margin-top: 0em;\n  margin-bottom: 0em;\n  border-top: none;\n  border-bottom: none;\n  border-radius: 0em;\n}\n\n.ui.top.attached.header {\n  margin-bottom: 0em;\n  border-bottom: none;\n  border-radius: 0.3125rem 0.3125rem 0em 0em;\n}\n\n.ui.bottom.attached.header {\n  margin-top: 0em;\n  border-top: none;\n  border-radius: 0em 0em 0.3125rem 0.3125rem;\n}\n\n/* Attached Sizes */\n\n.ui.tiny.attached.header {\n  font-size: 0.8571em;\n}\n\n.ui.small.attached.header {\n  font-size: 0.9285em;\n}\n\n.ui.attached.header:not(h1):not(h2):not(h3):not(h4):not(h5):not(h6) {\n  font-size: 1em;\n}\n\n.ui.large.attached.header {\n  font-size: 1.0714em;\n}\n\n.ui.huge.attached.header {\n  font-size: 1.1428em;\n}\n\n/*-------------------\n        Sizing\n--------------------*/\n\n.ui.header:not(h1):not(h2):not(h3):not(h4):not(h5):not(h6) {\n  font-size: 1.285em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Icon\n*******************************/\n\n@font-face {\n  font-family: \'Icons\';\n  src: url("themes/default/assets/fonts/icons.eot");\n  src: url("themes/default/assets/fonts/icons.eot?#iefix") format(\'embedded-opentype\'), url("themes/default/assets/fonts/icons.svg#icons") format(\'svg\'), url("themes/default/assets/fonts/icons.woff") format(\'woff\'), url("themes/default/assets/fonts/icons.ttf") format(\'truetype\');\n  font-style: normal;\n  font-weight: normal;\n  font-variant: normal;\n  text-decoration: inherit;\n  text-transform: none;\n}\n\ni.icon {\n  display: inline-block;\n  opacity: 1;\n  margin: 0em 0.25rem 0em 0em;\n  width: 1.23em;\n  height: 0.9em;\n  font-family: \'Icons\';\n  font-style: normal;\n  line-height: 1;\n  font-weight: normal;\n  text-decoration: inherit;\n  text-align: center;\n  speak: none;\n  font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n}\n\ni.icon:before {\n  background: none !important;\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*--------------\n    Loading\n---------------*/\n\ni.icon.loading {\n  height: 1em;\n  -webkit-animation: icon-loading 2s linear infinite;\n  animation: icon-loading 2s linear infinite;\n}\n\n@-webkit-keyframes icon-loading {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n@keyframes icon-loading {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n/*******************************\n             States\n*******************************/\n\ni.icon.hover {\n  opacity: 1;\n}\n\ni.icon.active {\n  opacity: 1;\n}\n\ni.emphasized.icon {\n  opacity: 1;\n}\n\ni.disabled.icon {\n  pointer-events: none;\n  opacity: 0.3 !important;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-------------------\n         Link\n--------------------*/\n\ni.link.icon {\n  cursor: pointer;\n  opacity: 0.8;\n  -webkit-transition: opacity 0.2s ease;\n  transition: opacity 0.2s ease;\n}\n\ni.link.icon:hover {\n  opacity: 1 !important;\n}\n\n/*-------------------\n      Circular\n--------------------*/\n\ni.circular.icon {\n  border-radius: 500em !important;\n  padding: 0.5em 0.5em !important;\n  box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  line-height: 1 !important;\n  width: 2em !important;\n  height: 2em !important;\n}\n\ni.circular.inverted.icon {\n  border: none;\n  box-shadow: none;\n}\n\n/*-------------------\n      Flipped\n--------------------*/\n\ni.flipped.icon,\ni.horizontally.flipped.icon {\n  -webkit-transform: scale(-1, 1);\n  -ms-transform: scale(-1, 1);\n  transform: scale(-1, 1);\n}\n\ni.vertically.flipped.icon {\n  -webkit-transform: scale(1, -1);\n  -ms-transform: scale(1, -1);\n  transform: scale(1, -1);\n}\n\n/*-------------------\n      Rotated\n--------------------*/\n\ni.rotated.icon,\ni.right.rotated.icon,\ni.clockwise.rotated.icon {\n  -webkit-transform: rotate(90deg);\n  -ms-transform: rotate(90deg);\n  transform: rotate(90deg);\n}\n\ni.left.rotated.icon,\ni.counterclockwise.rotated.icon {\n  -webkit-transform: rotate(-90deg);\n  -ms-transform: rotate(-90deg);\n  transform: rotate(-90deg);\n}\n\n/*-------------------\n      Bordered\n--------------------*/\n\ni.bordered.icon {\n  width: 2em;\n  height: 2em;\n  padding: 0.55em 0.385em !important;\n  box-shadow: 0em 0em 0em 0.1em rgba(0, 0, 0, 0.1) inset;\n  vertical-align: baseline;\n}\n\ni.bordered.inverted.icon {\n  border: none;\n  box-shadow: none;\n}\n\n/*-------------------\n       Colors\n--------------------*/\n\ni.white.icon {\n  color: #ffffff !important;\n}\n\ni.black.icon {\n  color: #1b1c1d !important;\n}\n\ni.blue.icon {\n  color: #3b83c0 !important;\n}\n\ni.green.icon {\n  color: #5bbd72 !important;\n}\n\ni.orange.icon {\n  color: #e07b53 !important;\n}\n\ni.pink.icon {\n  color: #d9499a !important;\n}\n\ni.purple.icon {\n  color: #564f8a !important;\n}\n\ni.red.icon {\n  color: #d95c5c !important;\n}\n\ni.teal.icon {\n  color: #00b5ad !important;\n}\n\ni.yellow.icon {\n  color: #f2c61f !important;\n}\n\n/*-------------------\n      Inverted\n--------------------*/\n\ni.inverted.icon {\n  color: #ffffff;\n}\n\ni.inverted.black.icon {\n  color: #333333 !important;\n}\n\ni.inverted.blue.icon {\n  color: #54c8ff !important;\n}\n\ni.inverted.green.icon {\n  color: #2ecc40 !important;\n}\n\ni.inverted.orange.icon {\n  color: #ff851b !important;\n}\n\ni.inverted.pink.icon {\n  color: #ff8edf !important;\n}\n\ni.inverted.purple.icon {\n  color: #cdc6ff !important;\n}\n\ni.inverted.red.icon {\n  color: #ff695e !important;\n}\n\ni.inverted.teal.icon {\n  color: #6dffff !important;\n}\n\ni.inverted.yellow.icon {\n  color: #ffe21f !important;\n}\n\n/* Inverted Shapes */\n\ni.inverted.bordered.icon,\ni.inverted.circular.icon {\n  background-color: #222222 !important;\n  color: #FFFFFF !important;\n}\n\ni.inverted.bordered.black.icon,\ni.inverted.circular.black.icon {\n  background-color: #1b1c1d !important;\n  color: #FFFFFF !important;\n}\n\ni.inverted.bordered.blue.icon,\ni.inverted.circular.blue.icon {\n  background-color: #3b83c0 !important;\n  color: #FFFFFF !important;\n}\n\ni.inverted.bordered.green.icon,\ni.inverted.circular.green.icon {\n  background-color: #5bbd72 !important;\n  color: #FFFFFF !important;\n}\n\ni.inverted.bordered.orange.icon,\ni.inverted.circular.orange.icon {\n  background-color: #e07b53 !important;\n  color: #FFFFFF !important;\n}\n\ni.inverted.bordered.pink.icon,\ni.inverted.circular.pink.icon {\n  background-color: #d9499a !important;\n  color: #FFFFFF !important;\n}\n\ni.inverted.bordered.purple.icon,\ni.inverted.circular.purple.icon {\n  background-color: #564f8a !important;\n  color: #FFFFFF !important;\n}\n\ni.inverted.bordered.red.icon,\ni.inverted.circular.red.icon {\n  background-color: #d95c5c !important;\n  color: #FFFFFF !important;\n}\n\ni.inverted.bordered.teal.icon,\ni.inverted.circular.teal.icon {\n  background-color: #00b5ad !important;\n  color: #FFFFFF !important;\n}\n\ni.inverted.bordered.yellow.icon,\ni.inverted.circular.yellow.icon {\n  background-color: #f2c61f !important;\n  color: #FFFFFF !important;\n}\n\n/*-------------------\n        Sizes\n--------------------*/\n\ni.small.icon {\n  font-size: 0.875em;\n}\n\ni.icon {\n  font-size: 1em;\n}\n\ni.large.icon {\n  font-size: 1.5em;\n  vertical-align: middle;\n}\n\ni.big.icon {\n  font-size: 2em;\n  vertical-align: middle;\n}\n\ni.huge.icon {\n  font-size: 4em;\n  vertical-align: middle;\n}\n\ni.massive.icon {\n  font-size: 8em;\n  vertical-align: middle;\n}\n\n/*\n * # Semantic - Icon\n * http://github.com/jlukic/semantic-ui/\n *\n *\n * Copyright 2014 Contributor\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*\n *  Font Awesome 4.0.3\n *  the iconic font designed for Bootstrap\n *  ------------------------------------------------------------------------------\n *  The full suite of pictographic icons, examples, and documentation can be\n *  found at http://fon.io.  Stay up to date on Twitter at\n *  http://twitter.com/fon.\n *\n *  License\n *  ------------------------------------------------------------------------------\n *  - The Font Awesome font is licensed under SIL OFL 1.1 -\n *    http://scripts.sil.org/OFL\n\n\n\n/*******************************\n\nSemantic-UI integration of font-awesome :\n\n///class names are separated\ni.icon.circle => i.icon.circle\ni.icon.circle-o => i.icon.circle.outline\n\n//abbreviation are replaced by full letters:\ni.icon.ellipsis-h => i.icon.ellipsis.horizontal\ni.icon.ellipsis-v => i.icon.ellipsis.vertical\n.alpha => .i.icon.alphabet\n.asc => .i.icon.ascending\n.desc => .i.icon.descending\n.alt =>.alternate\n\nASCII order is conserved for easier maintenance.\n\nIcons that only have one style \'outline\', \'square\' etc do not require this class\nfor instance `lemon icon` not `lemon outline icon` since there is only one lemon\n\n*******************************/\n\n/*******************************\n            Icons\n*******************************/\n\n/* Web Content */\n\ni.icon.search:before {\n  content: "\f002";\n}\n\ni.icon.mail.outline:before {\n  content: "\f003";\n}\n\ni.icon.external.link:before {\n  content: "\f08e";\n}\n\ni.icon.wifi:before {\n  content: "\f012";\n}\n\ni.icon.setting:before {\n  content: "\f013";\n}\n\ni.icon.home:before {\n  content: "\f015";\n}\n\ni.icon.inbox:before {\n  content: "\f01c";\n}\n\ni.icon.browser:before {\n  content: "\f022";\n}\n\ni.icon.tag:before {\n  content: "\f02b";\n}\n\ni.icon.tags:before {\n  content: "\f02c";\n}\n\ni.icon.calendar:before {\n  content: "\f073";\n}\n\ni.icon.comment:before {\n  content: "\f075";\n}\n\ni.icon.comments:before {\n  content: "\f086";\n}\n\ni.icon.shop:before {\n  content: "\f07a";\n}\n\ni.icon.privacy:before {\n  content: "\f084";\n}\n\ni.icon.settings:before {\n  content: "\f085";\n}\n\ni.icon.trophy:before {\n  content: "\f091";\n}\n\ni.icon.payment:before {\n  content: "\f09d";\n}\n\ni.icon.feed:before {\n  content: "\f09e";\n}\n\ni.icon.alarm.outline:before {\n  content: "\f0a2";\n}\n\ni.icon.tasks:before {\n  content: "\f0ae";\n}\n\ni.icon.cloud:before {\n  content: "\f0c2";\n}\n\ni.icon.lab:before {\n  content: "\f0c3";\n}\n\ni.icon.mail:before {\n  content: "\f0e0";\n}\n\ni.icon.idea:before {\n  content: "\f0eb";\n}\n\ni.icon.dashboard:before {\n  content: "\f0e4";\n}\n\ni.icon.sitemap:before {\n  content: "\f0e8";\n}\n\ni.icon.alarm:before {\n  content: "\f0f3";\n}\n\ni.icon.terminal:before {\n  content: "\f120";\n}\n\ni.icon.code:before {\n  content: "\f121";\n}\n\ni.icon.protect:before {\n  content: "\f132";\n}\n\ni.icon.calendar.outline:before {\n  content: "\f133";\n}\n\ni.icon.ticket:before {\n  content: "\f145";\n}\n\ni.icon.external.link.square:before {\n  content: "\f14c";\n}\n\ni.icon.map:before {\n  content: "\f14e";\n}\n\ni.icon.bug:before {\n  content: "\f188";\n}\n\ni.icon.mail.square:before {\n  content: "\f199";\n}\n\ni.icon.history:before {\n  content: "\f1da";\n}\n\ni.icon.options:before {\n  content: "\f1de";\n}\n\ni.icon.comment.outline:before {\n  content: "\f0e5";\n}\n\ni.icon.comments.outline:before {\n  content: "\f0e6";\n}\n\n/* User Actions */\n\ni.icon.download:before {\n  content: "\f019";\n}\n\ni.icon.repeat:before {\n  content: "\f01e";\n}\n\ni.icon.refresh:before {\n  content: "\f021";\n}\n\ni.icon.lock:before {\n  content: "\f023";\n}\n\ni.icon.bookmark:before {\n  content: "\f02e";\n}\n\ni.icon.print:before {\n  content: "\f02f";\n}\n\ni.icon.write:before {\n  content: "\f040";\n}\n\ni.icon.theme:before {\n  content: "\f043";\n}\n\ni.icon.adjust:before {\n  content: "\f042";\n}\n\ni.icon.edit:before {\n  content: "\f044";\n}\n\ni.icon.external.share:before {\n  content: "\f045";\n}\n\ni.icon.ban:before {\n  content: "\f05e";\n}\n\ni.icon.mail.forward:before {\n  content: "\f064";\n}\n\ni.icon.share:before {\n  content: "\f064";\n}\n\ni.icon.expand:before {\n  content: "\f065";\n}\n\ni.icon.compress:before {\n  content: "\f066";\n}\n\ni.icon.unhide:before {\n  content: "\f06e";\n}\n\ni.icon.hide:before {\n  content: "\f070";\n}\n\ni.icon.random:before {\n  content: "\f074";\n}\n\ni.icon.retweet:before {\n  content: "\f079";\n}\n\ni.icon.sign.out:before {\n  content: "\f08b";\n}\n\ni.icon.pin:before {\n  content: "\f08d";\n}\n\ni.icon.sign.in:before {\n  content: "\f090";\n}\n\ni.icon.upload:before {\n  content: "\f093";\n}\n\ni.icon.call:before {\n  content: "\f095";\n}\n\ni.icon.call.square:before {\n  content: "\f098";\n}\n\ni.icon.remove.bookmark:before {\n  content: "\f097";\n}\n\ni.icon.unlock:before {\n  content: "\f09c";\n}\n\ni.icon.configure:before {\n  content: "\f0ad";\n}\n\ni.icon.filter:before {\n  content: "\f0b0";\n}\n\ni.icon.wizard:before {\n  content: "\f0d0";\n}\n\ni.icon.undo:before {\n  content: "\f0e2";\n}\n\ni.icon.exchange:before {\n  content: "\f0ec";\n}\n\ni.icon.cloud.download:before {\n  content: "\f0ed";\n}\n\ni.icon.cloud.upload:before {\n  content: "\f0ee";\n}\n\ni.icon.reply:before {\n  content: "\f112";\n}\n\ni.icon.reply.all:before {\n  content: "\f122";\n}\n\ni.icon.erase:before {\n  content: "\f12d";\n}\n\ni.icon.unlock.alternate:before {\n  content: "\f13e";\n}\n\ni.icon.archive:before {\n  content: "\f187";\n}\n\ni.icon.translate:before {\n  content: "\f1ab";\n}\n\ni.icon.recycle:before {\n  content: "\f1b8";\n}\n\ni.icon.send:before {\n  content: "\f1d8";\n}\n\ni.icon.send.outline:before {\n  content: "\f1d9";\n}\n\ni.icon.share.alternate:before {\n  content: "\f1e0";\n}\n\ni.icon.share.alternate.square:before {\n  content: "\f1e1";\n}\n\ni.icon.wait:before {\n  content: "\f017";\n}\n\ni.icon.write.square:before {\n  content: "\f14b";\n}\n\ni.icon.share.square:before {\n  content: "\f14d";\n}\n\n/* Messages */\n\ni.icon.help.circle:before {\n  content: "\f059";\n}\n\ni.icon.info.circle:before {\n  content: "\f05a";\n}\n\ni.icon.warning:before {\n  content: "\f12a";\n}\n\ni.icon.warning.circle:before {\n  content: "\f06a";\n}\n\ni.icon.warning.sign:before {\n  content: "\f071";\n}\n\ni.icon.help:before {\n  content: "\f128";\n}\n\ni.icon.info:before {\n  content: "\f129";\n}\n\ni.icon.announcement:before {\n  content: "\f0a1";\n}\n\n/* Users */\n\ni.icon.users:before {\n  content: "\f0c0";\n}\n\ni.icon.doctor:before {\n  content: "\f0f0";\n}\n\ni.icon.female:before {\n  content: "\f182";\n}\n\ni.icon.male:before {\n  content: "\f183";\n}\n\ni.icon.child:before {\n  content: "\f1ae";\n}\n\ni.icon.user:before {\n  content: "\f007";\n}\n\ni.icon.handicap:before {\n  content: "\f193";\n}\n\ni.icon.student:before {\n  content: "\f19d";\n}\n\n/* View Adjustment */\n\ni.icon.grid.layout:before {\n  content: "\f00a";\n}\n\ni.icon.list.layout:before {\n  content: "\f00b";\n}\n\ni.icon.block.layout:before {\n  content: "\f009";\n}\n\ni.icon.zoom:before {\n  content: "\f00e";\n}\n\ni.icon.zoom.out:before {\n  content: "\f010";\n}\n\ni.icon.resize.vertical:before {\n  content: "\f07d";\n}\n\ni.icon.resize.horizontal:before {\n  content: "\f07e";\n}\n\ni.icon.maximize:before {\n  content: "\f0b2";\n}\n\ni.icon.crop:before {\n  content: "\f125";\n}\n\n/* Literal Objects */\n\ni.icon.cocktail:before {\n  content: "\f000";\n}\n\ni.icon.road:before {\n  content: "\f018";\n}\n\ni.icon.flag:before {\n  content: "\f024";\n}\n\ni.icon.book:before {\n  content: "\f02d";\n}\n\ni.icon.gift:before {\n  content: "\f06b";\n}\n\ni.icon.leaf:before {\n  content: "\f06c";\n}\n\ni.icon.fire:before {\n  content: "\f06d";\n}\n\ni.icon.plane:before {\n  content: "\f072";\n}\n\ni.icon.magnet:before {\n  content: "\f076";\n}\n\ni.icon.legal:before {\n  content: "\f0e3";\n}\n\ni.icon.lemon:before {\n  content: "\f094";\n}\n\ni.icon.world:before {\n  content: "\f0ac";\n}\n\ni.icon.travel:before {\n  content: "\f0b1";\n}\n\ni.icon.shipping:before {\n  content: "\f0d1";\n}\n\ni.icon.money:before {\n  content: "\f0d6";\n}\n\ni.icon.lightning:before {\n  content: "\f0e7";\n}\n\ni.icon.rain:before {\n  content: "\f0e9";\n}\n\ni.icon.treatment:before {\n  content: "\f0f1";\n}\n\ni.icon.suitcase:before {\n  content: "\f0f2";\n}\n\ni.icon.bar:before {\n  content: "\f0fc";\n}\n\ni.icon.flag.outline:before {\n  content: "\f11d";\n}\n\ni.icon.flag.checkered:before {\n  content: "\f11e";\n}\n\ni.icon.puzzle:before {\n  content: "\f12e";\n}\n\ni.icon.fire.extinguisher:before {\n  content: "\f134";\n}\n\ni.icon.rocket:before {\n  content: "\f135";\n}\n\ni.icon.anchor:before {\n  content: "\f13d";\n}\n\ni.icon.bullseye:before {\n  content: "\f140";\n}\n\ni.icon.sun:before {\n  content: "\f185";\n}\n\ni.icon.moon:before {\n  content: "\f186";\n}\n\ni.icon.fax:before {\n  content: "\f1ac";\n}\n\ni.icon.life.ring:before {\n  content: "\f1cd";\n}\n\ni.icon.bomb:before {\n  content: "\f1e2";\n}\n\n/* Shapes */\n\ni.icon.crosshairs:before {\n  content: "\f05b";\n}\n\ni.icon.asterisk:before {\n  content: "\f069";\n}\n\ni.icon.certificate:before {\n  content: "\f0a3";\n}\n\ni.icon.circle:before {\n  content: "\f111";\n}\n\ni.icon.quote.left:before {\n  content: "\f10d";\n}\n\ni.icon.quote.right:before {\n  content: "\f10e";\n}\n\ni.icon.ellipsis.horizontal:before {\n  content: "\f141";\n}\n\ni.icon.ellipsis.vertical:before {\n  content: "\f142";\n}\n\ni.icon.cube:before {\n  content: "\f1b2";\n}\n\ni.icon.cubes:before {\n  content: "\f1b3";\n}\n\ni.icon.circle.notched:before {\n  content: "\f1ce";\n}\n\ni.icon.circle.thin:before {\n  content: "\f1db";\n}\n\n/* Item Selection */\n\ni.icon.checkmark:before {\n  content: "\f00c";\n}\n\ni.icon.remove:before {\n  content: "\f00d";\n}\n\ni.icon.checkmark.box:before {\n  content: "\f046";\n}\n\ni.icon.move:before {\n  content: "\f047";\n}\n\ni.icon.add.circle:before {\n  content: "\f055";\n}\n\ni.icon.minus.circle:before {\n  content: "\f056";\n}\n\ni.icon.remove.circle:before {\n  content: "\f057";\n}\n\ni.icon.check.circle:before {\n  content: "\f058";\n}\n\ni.icon.remove.circle.outline:before {\n  content: "\f05c";\n}\n\ni.icon.check.circle.outline:before {\n  content: "\f05d";\n}\n\ni.icon.plus:before {\n  content: "\f067";\n}\n\ni.icon.minus:before {\n  content: "\f068";\n}\n\ni.icon.add.square:before {\n  content: "\f0fe";\n}\n\ni.icon.radio:before {\n  content: "\f10c";\n}\n\ni.icon.selected.radio:before {\n  content: "\f192";\n}\n\ni.icon.minus.square:before {\n  content: "\f146";\n}\n\ni.icon.minus.square.outline:before {\n  content: "\f147";\n}\n\ni.icon.check.square:before {\n  content: "\f14a";\n}\n\ni.icon.plus.square.outline:before {\n  content: "\f196";\n}\n\n/* Media */\n\ni.icon.film:before {\n  content: "\f008";\n}\n\ni.icon.sound:before {\n  content: "\f025";\n}\n\ni.icon.photo:before {\n  content: "\f030";\n}\n\ni.icon.bar.chart:before {\n  content: "\f080";\n}\n\ni.icon.camera.retro:before {\n  content: "\f083";\n}\n\n/* Pointers */\n\ni.icon.arrow.circle.outline.down:before {\n  content: "\f01a";\n}\n\ni.icon.arrow.circle.outline.up:before {\n  content: "\f01b";\n}\n\ni.icon.chevron.left:before {\n  content: "\f053";\n}\n\ni.icon.chevron.right:before {\n  content: "\f054";\n}\n\ni.icon.arrow.left:before {\n  content: "\f060";\n}\n\ni.icon.arrow.right:before {\n  content: "\f061";\n}\n\ni.icon.arrow.up:before {\n  content: "\f062";\n}\n\ni.icon.arrow.down:before {\n  content: "\f063";\n}\n\ni.icon.chevron.up:before {\n  content: "\f077";\n}\n\ni.icon.chevron.down:before {\n  content: "\f078";\n}\n\ni.icon.pointing.right:before {\n  content: "\f0a4";\n}\n\ni.icon.pointing.left:before {\n  content: "\f0a5";\n}\n\ni.icon.pointing.up:before {\n  content: "\f0a6";\n}\n\ni.icon.pointing.down:before {\n  content: "\f0a7";\n}\n\ni.icon.arrow.circle.left:before {\n  content: "\f0a8";\n}\n\ni.icon.arrow.circle.right:before {\n  content: "\f0a9";\n}\n\ni.icon.arrow.circle.up:before {\n  content: "\f0aa";\n}\n\ni.icon.arrow.circle.down:before {\n  content: "\f0ab";\n}\n\ni.icon.caret.down:before {\n  content: "\f0d7";\n}\n\ni.icon.caret.up:before {\n  content: "\f0d8";\n}\n\ni.icon.caret.left:before {\n  content: "\f0d9";\n}\n\ni.icon.caret.right:before {\n  content: "\f0da";\n}\n\ni.icon.angle.double.left:before {\n  content: "\f100";\n}\n\ni.icon.angle.double.right:before {\n  content: "\f101";\n}\n\ni.icon.angle.double.up:before {\n  content: "\f102";\n}\n\ni.icon.angle.double.down:before {\n  content: "\f103";\n}\n\ni.icon.angle.left:before {\n  content: "\f104";\n}\n\ni.icon.angle.right:before {\n  content: "\f105";\n}\n\ni.icon.angle.up:before {\n  content: "\f106";\n}\n\ni.icon.angle.down:before {\n  content: "\f107";\n}\n\ni.icon.chevron.circle.left:before {\n  content: "\f137";\n}\n\ni.icon.chevron.circle.right:before {\n  content: "\f138";\n}\n\ni.icon.chevron.circle.up:before {\n  content: "\f139";\n}\n\ni.icon.chevron.circle.down:before {\n  content: "\f13a";\n}\n\ni.icon.toggle.down:before {\n  content: "\f150";\n}\n\ni.icon.toggle.up:before {\n  content: "\f151";\n}\n\ni.icon.toggle.right:before {\n  content: "\f152";\n}\n\ni.icon.long.arrow.down:before {\n  content: "\f175";\n}\n\ni.icon.long.arrow.up:before {\n  content: "\f176";\n}\n\ni.icon.long.arrow.left:before {\n  content: "\f177";\n}\n\ni.icon.long.arrow.right:before {\n  content: "\f178";\n}\n\ni.icon.arrow.circle.outline.right:before {\n  content: "\f18e";\n}\n\ni.icon.arrow.circle.outline.left:before {\n  content: "\f190";\n}\n\ni.icon.toggle.left:before {\n  content: "\f191";\n}\n\n/* Computer */\n\ni.icon.power:before {\n  content: "\f011";\n}\n\ni.icon.trash:before {\n  content: "\f014";\n}\n\ni.icon.disk.outline:before {\n  content: "\f0a0";\n}\n\ni.icon.desktop:before {\n  content: "\f108";\n}\n\ni.icon.laptop:before {\n  content: "\f109";\n}\n\ni.icon.tablet:before {\n  content: "\f10a";\n}\n\ni.icon.mobile:before {\n  content: "\f10b";\n}\n\ni.icon.game:before {\n  content: "\f11b";\n}\n\ni.icon.keyboard:before {\n  content: "\f11c";\n}\n\n/* File System */\n\ni.icon.folder:before {\n  content: "\f07b";\n}\n\ni.icon.folder.open:before {\n  content: "\f07c";\n}\n\ni.icon.level.up:before {\n  content: "\f148";\n}\n\ni.icon.level.down:before {\n  content: "\f149";\n}\n\ni.icon.file:before {\n  content: "\f15b";\n}\n\ni.icon.file.outline:before {\n  content: "\f016";\n}\n\ni.icon.file.text:before {\n  content: "\f15c";\n}\n\ni.icon.file.text.outline:before {\n  content: "\f0f6";\n}\n\ni.icon.folder.outline:before {\n  content: "\f114";\n}\n\ni.icon.folder.open.outline:before {\n  content: "\f115";\n}\n\ni.icon.file.pdf.outline:before {\n  content: "\f1c1";\n}\n\ni.icon.file.word.outline:before {\n  content: "\f1c2";\n}\n\ni.icon.file.excel.outline:before {\n  content: "\f1c3";\n}\n\ni.icon.file.powerpoint.outline:before {\n  content: "\f1c4";\n}\n\ni.icon.file.image.outline:before {\n  content: "\f1c5";\n}\n\ni.icon.file.archive.outline:before {\n  content: "\f1c6";\n}\n\ni.icon.file.audio.outline:before {\n  content: "\f1c7";\n}\n\ni.icon.file.video.outline:before {\n  content: "\f1c8";\n}\n\ni.icon.file.code.outline:before {\n  content: "\f1c9";\n}\n\n/* Technologies */\n\ni.icon.barcode:before {\n  content: "\f02a";\n}\n\ni.icon.qrcode:before {\n  content: "\f029";\n}\n\ni.icon.fork:before {\n  content: "\f126";\n}\n\ni.icon.html5:before {\n  content: "\f13b";\n}\n\ni.icon.css3:before {\n  content: "\f13c";\n}\n\ni.icon.rss.square:before {\n  content: "\f143";\n}\n\ni.icon.openid:before {\n  content: "\f19b";\n}\n\ni.icon.database:before {\n  content: "\f1c0";\n}\n\n/* Rating */\n\ni.icon.heart:before {\n  content: "\f004";\n}\n\ni.icon.star:before {\n  content: "\f005";\n}\n\ni.icon.empty.star:before {\n  content: "\f006";\n}\n\ni.icon.thumbs.outline.up:before {\n  content: "\f087";\n}\n\ni.icon.thumbs.outline.down:before {\n  content: "\f088";\n}\n\ni.icon.star.half:before {\n  content: "\f089";\n}\n\ni.icon.empty.heart:before {\n  content: "\f08a";\n}\n\ni.icon.smile:before {\n  content: "\f118";\n}\n\ni.icon.frown:before {\n  content: "\f119";\n}\n\ni.icon.meh:before {\n  content: "\f11a";\n}\n\ni.icon.star.half.empty:before {\n  content: "\f123";\n}\n\ni.icon.thumbs.up:before {\n  content: "\f164";\n}\n\ni.icon.thumbs.down:before {\n  content: "\f165";\n}\n\n/* Audio */\n\ni.icon.music:before {\n  content: "\f001";\n}\n\ni.icon.video.play.outline:before {\n  content: "\f01d";\n}\n\ni.icon.volume.off:before {\n  content: "\f026";\n}\n\ni.icon.volume.down:before {\n  content: "\f027";\n}\n\ni.icon.volume.up:before {\n  content: "\f028";\n}\n\ni.icon.record:before {\n  content: "\f03d";\n}\n\ni.icon.step.backward:before {\n  content: "\f048";\n}\n\ni.icon.fast.backward:before {\n  content: "\f049";\n}\n\ni.icon.backward:before {\n  content: "\f04a";\n}\n\ni.icon.play:before {\n  content: "\f04b";\n}\n\ni.icon.pause:before {\n  content: "\f04c";\n}\n\ni.icon.stop:before {\n  content: "\f04d";\n}\n\ni.icon.forward:before {\n  content: "\f04e";\n}\n\ni.icon.fast.forward:before {\n  content: "\f050";\n}\n\ni.icon.step.forward:before {\n  content: "\f051";\n}\n\ni.icon.eject:before {\n  content: "\f052";\n}\n\ni.icon.unmute:before {\n  content: "\f130";\n}\n\ni.icon.mute:before {\n  content: "\f131";\n}\n\ni.icon.video.play:before {\n  content: "\f144";\n}\n\n/* Map & Locations */\n\ni.icon.marker:before {\n  content: "\f041";\n}\n\ni.icon.coffee:before {\n  content: "\f0f4";\n}\n\ni.icon.food:before {\n  content: "\f0f5";\n}\n\ni.icon.building.outline:before {\n  content: "\f0f7";\n}\n\ni.icon.hospital:before {\n  content: "\f0f8";\n}\n\ni.icon.emergency:before {\n  content: "\f0f9";\n}\n\ni.icon.first.aid:before {\n  content: "\f0fa";\n}\n\ni.icon.military:before {\n  content: "\f0fb";\n}\n\ni.icon.h:before {\n  content: "\f0fd";\n}\n\ni.icon.location.arrow:before {\n  content: "\f124";\n}\n\ni.icon.space.shuttle:before {\n  content: "\f197";\n}\n\ni.icon.university:before {\n  content: "\f19c";\n}\n\ni.icon.building:before {\n  content: "\f1ad";\n}\n\ni.icon.paw:before {\n  content: "\f1b0";\n}\n\ni.icon.spoon:before {\n  content: "\f1b1";\n}\n\ni.icon.car:before {\n  content: "\f1b9";\n}\n\ni.icon.taxi:before {\n  content: "\f1ba";\n}\n\ni.icon.tree:before {\n  content: "\f1bb";\n}\n\n/* Tables */\n\ni.icon.table:before {\n  content: "\f0ce";\n}\n\ni.icon.columns:before {\n  content: "\f0db";\n}\n\ni.icon.sort:before {\n  content: "\f0dc";\n}\n\ni.icon.sort.ascending:before {\n  content: "\f0dd";\n}\n\ni.icon.sort.descending:before {\n  content: "\f0de";\n}\n\ni.icon.sort.alphabet.ascending:before {\n  content: "\f15d";\n}\n\ni.icon.sort.alphabet.descending:before {\n  content: "\f15e";\n}\n\ni.icon.sort.content.ascending:before {\n  content: "\f160";\n}\n\ni.icon.sort.content.descending:before {\n  content: "\f161";\n}\n\ni.icon.sort.numeric.ascending:before {\n  content: "\f162";\n}\n\ni.icon.sort.numeric.descending:before {\n  content: "\f163";\n}\n\n/* Text Editor */\n\ni.icon.font:before {\n  content: "\f031";\n}\n\ni.icon.bold:before {\n  content: "\f032";\n}\n\ni.icon.italic:before {\n  content: "\f033";\n}\n\ni.icon.text.height:before {\n  content: "\f034";\n}\n\ni.icon.text.width:before {\n  content: "\f035";\n}\n\ni.icon.align.left:before {\n  content: "\f036";\n}\n\ni.icon.align.center:before {\n  content: "\f037";\n}\n\ni.icon.align.right:before {\n  content: "\f038";\n}\n\ni.icon.align.justify:before {\n  content: "\f039";\n}\n\ni.icon.list:before {\n  content: "\f03a";\n}\n\ni.icon.outdent:before {\n  content: "\f03b";\n}\n\ni.icon.indent:before {\n  content: "\f03c";\n}\n\ni.icon.linkify:before {\n  content: "\f0c1";\n}\n\ni.icon.cut:before {\n  content: "\f0c4";\n}\n\ni.icon.copy:before {\n  content: "\f0c5";\n}\n\ni.icon.attach:before {\n  content: "\f0c6";\n}\n\ni.icon.save:before {\n  content: "\f0c7";\n}\n\ni.icon.content:before {\n  content: "\f0c9";\n}\n\ni.icon.unordered.list:before {\n  content: "\f0ca";\n}\n\ni.icon.ordered.list:before {\n  content: "\f0cb";\n}\n\ni.icon.strikethrough:before {\n  content: "\f0cc";\n}\n\ni.icon.underline:before {\n  content: "\f0cd";\n}\n\ni.icon.paste:before {\n  content: "\f0ea";\n}\n\ni.icon.unlink:before {\n  content: "\f127";\n}\n\ni.icon.superscript:before {\n  content: "\f12b";\n}\n\ni.icon.subscript:before {\n  content: "\f12c";\n}\n\ni.icon.header:before {\n  content: "\f1dc";\n}\n\ni.icon.paragraph:before {\n  content: "\f1dd";\n}\n\n/* Currency */\n\ni.icon.euro:before {\n  content: "\f153";\n}\n\ni.icon.pound:before {\n  content: "\f154";\n}\n\ni.icon.dollar:before {\n  content: "\f155";\n}\n\ni.icon.rupee:before {\n  content: "\f156";\n}\n\ni.icon.yen:before {\n  content: "\f157";\n}\n\ni.icon.ruble:before {\n  content: "\f158";\n}\n\ni.icon.won:before {\n  content: "\f159";\n}\n\ni.icon.lira:before {\n  content: "\f195";\n}\n\n/* Networks and Websites*/\n\ni.icon.twitter.square:before {\n  content: "\f081";\n}\n\ni.icon.facebook.square:before {\n  content: "\f082";\n}\n\ni.icon.linkedin.square:before {\n  content: "\f08c";\n}\n\ni.icon.github.square:before {\n  content: "\f092";\n}\n\ni.icon.twitter:before {\n  content: "\f099";\n}\n\ni.icon.facebook:before {\n  content: "\f09a";\n}\n\ni.icon.github:before {\n  content: "\f09b";\n}\n\ni.icon.pinterest:before {\n  content: "\f0d2";\n}\n\ni.icon.pinterest.square:before {\n  content: "\f0d3";\n}\n\ni.icon.google.plus.square:before {\n  content: "\f0d4";\n}\n\ni.icon.google.plus:before {\n  content: "\f0d5";\n}\n\ni.icon.linkedin:before {\n  content: "\f0e1";\n}\n\ni.icon.github.alternate:before {\n  content: "\f113";\n}\n\ni.icon.maxcdn:before {\n  content: "\f136";\n}\n\ni.icon.bitcoin:before {\n  content: "\f15a";\n}\n\ni.icon.youtube.square:before {\n  content: "\f166";\n}\n\ni.icon.youtube:before {\n  content: "\f167";\n}\n\ni.icon.xing:before {\n  content: "\f168";\n}\n\ni.icon.xing.square:before {\n  content: "\f169";\n}\n\ni.icon.youtube.play:before {\n  content: "\f16a";\n}\n\ni.icon.dropbox:before {\n  content: "\f16b";\n}\n\ni.icon.stack.overflow:before {\n  content: "\f16c";\n}\n\ni.icon.instagram:before {\n  content: "\f16d";\n}\n\ni.icon.flickr:before {\n  content: "\f16e";\n}\n\ni.icon.adn:before {\n  content: "\f170";\n}\n\ni.icon.bitbucket:before {\n  content: "\f171";\n}\n\ni.icon.bitbucket.square:before {\n  content: "\f172";\n}\n\ni.icon.tumblr:before {\n  content: "\f173";\n}\n\ni.icon.tumblr.square:before {\n  content: "\f174";\n}\n\ni.icon.apple:before {\n  content: "\f179";\n}\n\ni.icon.windows:before {\n  content: "\f17a";\n}\n\ni.icon.android:before {\n  content: "\f17b";\n}\n\ni.icon.linux:before {\n  content: "\f17c";\n}\n\ni.icon.dribbble:before {\n  content: "\f17d";\n}\n\ni.icon.skype:before {\n  content: "\f17e";\n}\n\ni.icon.foursquare:before {\n  content: "\f180";\n}\n\ni.icon.trello:before {\n  content: "\f181";\n}\n\ni.icon.gittip:before {\n  content: "\f184";\n}\n\ni.icon.vk:before {\n  content: "\f189";\n}\n\ni.icon.weibo:before {\n  content: "\f18a";\n}\n\ni.icon.renren:before {\n  content: "\f18b";\n}\n\ni.icon.pagelines:before {\n  content: "\f18c";\n}\n\ni.icon.stack.exchange:before {\n  content: "\f18d";\n}\n\ni.icon.vimeo:before {\n  content: "\f194";\n}\n\ni.icon.slack:before {\n  content: "\f198";\n}\n\ni.icon.wordpress:before {\n  content: "\f19a";\n}\n\ni.icon.yahoo:before {\n  content: "\f19e";\n}\n\ni.icon.google:before {\n  content: "\f1a0";\n}\n\ni.icon.reddit:before {\n  content: "\f1a1";\n}\n\ni.icon.reddit.square:before {\n  content: "\f1a2";\n}\n\ni.icon.stumbleupon.circle:before {\n  content: "\f1a3";\n}\n\ni.icon.stumbleupon:before {\n  content: "\f1a4";\n}\n\ni.icon.delicious:before {\n  content: "\f1a5";\n}\n\ni.icon.digg:before {\n  content: "\f1a6";\n}\n\ni.icon.pied.piper:before {\n  content: "\f1a7";\n}\n\ni.icon.pied.piper.alternate:before {\n  content: "\f1a8";\n}\n\ni.icon.drupal:before {\n  content: "\f1a9";\n}\n\ni.icon.joomla:before {\n  content: "\f1aa";\n}\n\ni.icon.behance:before {\n  content: "\f1b4";\n}\n\ni.icon.behance.square:before {\n  content: "\f1b5";\n}\n\ni.icon.steam:before {\n  content: "\f1b6";\n}\n\ni.icon.steam.square:before {\n  content: "\f1b7";\n}\n\ni.icon.spotify:before {\n  content: "\f1bc";\n}\n\ni.icon.deviantart:before {\n  content: "\f1bd";\n}\n\ni.icon.soundcloud:before {\n  content: "\f1be";\n}\n\ni.icon.vine:before {\n  content: "\f1ca";\n}\n\ni.icon.codepen:before {\n  content: "\f1cb";\n}\n\ni.icon.jsfiddle:before {\n  content: "\f1cc";\n}\n\ni.icon.rebel:before {\n  content: "\f1d0";\n}\n\ni.icon.empire:before {\n  content: "\f1d1";\n}\n\ni.icon.git.square:before {\n  content: "\f1d2";\n}\n\ni.icon.git:before {\n  content: "\f1d3";\n}\n\ni.icon.hacker.news:before {\n  content: "\f1d4";\n}\n\ni.icon.tencent.weibo:before {\n  content: "\f1d5";\n}\n\ni.icon.qq:before {\n  content: "\f1d6";\n}\n\ni.icon.wechat:before {\n  content: "\f1d7";\n}\n\n/*******************************\n            Aliases\n*******************************/\n\ni.icon.like:before {\n  content: "\f004";\n}\n\ni.icon.favorite:before {\n  content: "\f005";\n}\n\ni.icon.video:before {\n  content: "\f008";\n}\n\ni.icon.check:before {\n  content: "\f00c";\n}\n\ni.icon.remove:before {\n  content: "\f00d";\n}\n\ni.icon.close:before {\n  content: "\f00d";\n}\n\ni.icon.cancel:before {\n  content: "\f00d";\n}\n\ni.icon.delete:before {\n  content: "\f00d";\n}\n\ni.icon.x:before {\n  content: "\f00d";\n}\n\ni.icon.zoom.in:before {\n  content: "\f00e";\n}\n\ni.icon.magnify:before {\n  content: "\f00e";\n}\n\ni.icon.shutdown:before {\n  content: "\f011";\n}\n\ni.icon.signal:before {\n  content: "\f012";\n}\n\ni.icon.clock:before {\n  content: "\f017";\n}\n\ni.icon.time:before {\n  content: "\f017";\n}\n\ni.icon.play.circle.outline:before {\n  content: "\f01d";\n}\n\ni.icon.clockwise:before {\n  content: "\f01e";\n}\n\ni.icon.headphone:before {\n  content: "\f025";\n}\n\ni.icon.volume.off:before {\n  content: "\f026";\n}\n\ni.icon.camera:before {\n  content: "\f030";\n}\n\ni.icon.video.camera:before {\n  content: "\f03d";\n}\n\ni.icon.picture:before {\n  content: "\f03e";\n}\n\ni.icon.pencil:before {\n  content: "\f040";\n}\n\ni.icon.compose:before {\n  content: "\f040";\n}\n\ni.icon.point:before {\n  content: "\f041";\n}\n\ni.icon.tint:before {\n  content: "\f043";\n}\n\ni.icon.signup:before {\n  content: "\f044";\n}\n\ni.icon.plus.circle:before {\n  content: "\f055";\n}\n\ni.icon.minus.circle:before {\n  content: "\f056";\n}\n\ni.icon.dont:before {\n  content: "\f05e";\n}\n\ni.icon.minimize:before {\n  content: "\f066";\n}\n\ni.icon.add:before {\n  content: "\f067";\n}\n\ni.icon.eye:before {\n  content: "\f06e";\n}\n\ni.icon.attention:before {\n  content: "\f06a";\n}\n\ni.icon.cart:before {\n  content: "\f07a";\n}\n\ni.icon.plane:before {\n  content: "\f072";\n}\n\ni.icon.shuffle:before {\n  content: "\f074";\n}\n\ni.icon.talk:before {\n  content: "\f075";\n}\n\ni.icon.chat:before {\n  content: "\f075";\n}\n\ni.icon.shopping.cart:before {\n  content: "\f07a";\n}\n\ni.icon.bar.graph:before {\n  content: "\f080";\n}\n\ni.icon.key:before {\n  content: "\f084";\n}\n\ni.icon.privacy:before {\n  content: "\f084";\n}\n\ni.icon.cogs:before {\n  content: "\f085";\n}\n\ni.icon.discussions:before {\n  content: "\f086";\n}\n\ni.icon.like.outline:before {\n  content: "\f087";\n}\n\ni.icon.dislike.outline:before {\n  content: "\f088";\n}\n\ni.icon.heart.outline:before {\n  content: "\f08a";\n}\n\ni.icon.log.out:before {\n  content: "\f08b";\n}\n\ni.icon.thumb.tack:before {\n  content: "\f08d";\n}\n\ni.icon.winner:before {\n  content: "\f091";\n}\n\ni.icon.bookmark.outline:before {\n  content: "\f097";\n}\n\ni.icon.phone.square:before {\n  content: "\f098";\n}\n\ni.icon.phone.square:before {\n  content: "\f098";\n}\n\ni.icon.credit.card:before {\n  content: "\f09d";\n}\n\ni.icon.rss:before {\n  content: "\f09e";\n}\n\ni.icon.hdd.outline:before {\n  content: "\f0a0";\n}\n\ni.icon.bullhorn:before {\n  content: "\f0a1";\n}\n\ni.icon.bell:before {\n  content: "\f0f3";\n}\n\ni.icon.hand.outline.right:before {\n  content: "\f0a4";\n}\n\ni.icon.hand.outline.left:before {\n  content: "\f0a5";\n}\n\ni.icon.hand.outline.up:before {\n  content: "\f0a6";\n}\n\ni.icon.hand.outline.down:before {\n  content: "\f0a7";\n}\n\ni.icon.globe:before {\n  content: "\f0ac";\n}\n\ni.icon.wrench:before {\n  content: "\f0ad";\n}\n\ni.icon.briefcase:before {\n  content: "\f0b1";\n}\n\ni.icon.group:before {\n  content: "\f0c0";\n}\n\ni.icon.flask:before {\n  content: "\f0c3";\n}\n\ni.icon.sidebar:before {\n  content: "\f0c9";\n}\n\ni.icon.bars:before {\n  content: "\f0c9";\n}\n\ni.icon.list.ul:before {\n  content: "\f0ca";\n}\n\ni.icon.list.ol:before {\n  content: "\f0cb";\n}\n\ni.icon.numbered.list:before {\n  content: "\f0cb";\n}\n\ni.icon.magic:before {\n  content: "\f0d0";\n}\n\ni.icon.truck:before {\n  content: "\f0d1";\n}\n\ni.icon.currency:before {\n  content: "\f0d6";\n}\n\ni.icon.triangle.down:before {\n  content: "\f0d7";\n}\n\ni.icon.dropdown:before {\n  content: "\f0d7";\n}\n\ni.icon.triangle.up:before {\n  content: "\f0d8";\n}\n\ni.icon.triangle.left:before {\n  content: "\f0d9";\n}\n\ni.icon.triangle.right:before {\n  content: "\f0da";\n}\n\ni.icon.envelope:before {\n  content: "\f0e0";\n}\n\ni.icon.conversation:before {\n  content: "\f0e6";\n}\n\ni.icon.lightning:before {\n  content: "\f0e7";\n}\n\ni.icon.umbrella:before {\n  content: "\f0e9";\n}\n\ni.icon.lightbulb:before {\n  content: "\f0eb";\n}\n\ni.icon.suitcase:before {\n  content: "\f0f2";\n}\n\ni.icon.bell.outline:before {\n  content: "\f0a2";\n}\n\ni.icon.ambulance:before {\n  content: "\f0f9";\n}\n\ni.icon.medkit:before {\n  content: "\f0fa";\n}\n\ni.icon.fighter.jet:before {\n  content: "\f0fb";\n}\n\ni.icon.beer:before {\n  content: "\f0fc";\n}\n\ni.icon.plus.square:before {\n  content: "\f0fe";\n}\n\ni.icon.computer:before {\n  content: "\f108";\n}\n\ni.icon.circle.outline:before {\n  content: "\f10c";\n}\n\ni.icon.spinner:before {\n  content: "\f110";\n}\n\ni.icon.gamepad:before {\n  content: "\f11b";\n}\n\ni.icon.star.half.full:before {\n  content: "\f123";\n}\n\ni.icon.question:before {\n  content: "\f128";\n}\n\ni.icon.attention:before {\n  content: "\f12a";\n}\n\ni.icon.eraser:before {\n  content: "\f12d";\n}\n\ni.icon.microphone:before {\n  content: "\f130";\n}\n\ni.icon.microphone.slash:before {\n  content: "\f131";\n}\n\ni.icon.shield:before {\n  content: "\f132";\n}\n\ni.icon.target:before {\n  content: "\f140";\n}\n\ni.icon.play.circle:before {\n  content: "\f144";\n}\n\ni.icon.pencil.square:before {\n  content: "\f14b";\n}\n\ni.icon.compass:before {\n  content: "\f14e";\n}\n\ni.icon.eur:before {\n  content: "\f153";\n}\n\ni.icon.gbp:before {\n  content: "\f154";\n}\n\ni.icon.usd:before {\n  content: "\f155";\n}\n\ni.icon.inr:before {\n  content: "\f156";\n}\n\ni.icon.cny:before,\ni.icon.rmb:before,\ni.icon.jpy:before {\n  content: "\f157";\n}\n\ni.icon.rouble:before,\ni.icon.rub:before {\n  content: "\f158";\n}\n\ni.icon.won:before,\ni.icon.krw:before {\n  content: "\f159";\n}\n\ni.icon.btc:before {\n  content: "\f15a";\n}\n\ni.icon.try:before {\n  content: "\f195";\n}\n\ni.icon.zip:before {\n  content: "\f187";\n}\n\ni.icon.dot.circle.outline:before {\n  content: "\f192";\n}\n\ni.icon.sliders:before {\n  content: "\f1de";\n}\n\ni.icon.graduation:before {\n  content: "\f19d";\n}\n\ni.icon.\33d:before {\n  content: "\f1b2";\n}\n\ni.icon.weixin:before {\n  content: "\f1d7";\n}\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Image\n*******************************/\n\n.ui.image {\n  position: relative;\n  display: inline-block;\n  vertical-align: middle;\n  max-width: 100%;\n  background-color: transparent;\n}\n\nimg.ui.image {\n  display: block;\n  background: none;\n}\n\n.ui.image img {\n  display: block;\n  max-width: 100%;\n  height: auto;\n}\n\n/*******************************\n            States\n*******************************/\n\n.ui.disabled.image {\n  cursor: default;\n  opacity: 0.3;\n}\n\n/*******************************\n          Variations\n*******************************/\n\n/*--------------\n     Inline\n---------------*/\n\n.ui.inline.image,\n.ui.inline.image img {\n  display: inline-block;\n}\n\n/*------------------\n  Vertical Aligned\n-------------------*/\n\n.ui.top.aligned.images .image,\n.ui.top.aligned.image,\n.ui.top.aligned.image img {\n  display: inline-block;\n  vertical-align: top;\n}\n\n.ui.middle.aligned.images .image,\n.ui.middle.aligned.image,\n.ui.middle.aligned.image img {\n  display: inline-block;\n  vertical-align: middle;\n}\n\n.ui.bottom.aligned.images .image,\n.ui.bottom.aligned.image,\n.ui.bottom.aligned.image img {\n  display: inline-block;\n  vertical-align: bottom;\n}\n\n/*--------------\n     Rounded\n---------------*/\n\n.ui.rounded.images .image,\n.ui.rounded.images img,\n.ui.rounded.image img,\n.ui.rounded.image {\n  border-radius: 0.3125em;\n}\n\n/*--------------\n    Bordered\n---------------*/\n\n.ui.bordered.images .image,\n.ui.bordered.images img,\n.ui.bordered.image img,\nimg.ui.bordered.image {\n  border: 1px solid rgba(0, 0, 0, 0.1);\n}\n\n/*--------------\n    Circular\n---------------*/\n\n.ui.circular.images,\n.ui.circular.image {\n  overflow: hidden;\n}\n\n.ui.circular.images .image,\n.ui.circular.images img,\n.ui.circular.image img,\n.ui.circular.image {\n  border-radius: 500rem;\n}\n\n/*--------------\n     Fluid\n---------------*/\n\n.ui.fluid.images,\n.ui.fluid.image,\n.ui.fluid.images img,\n.ui.fluid.image img {\n  display: block;\n  width: 100%;\n}\n\n/*--------------\n     Avatar\n---------------*/\n\n.ui.avatar.images .image,\n.ui.avatar.images img,\n.ui.avatar.image img,\n.ui.avatar.image {\n  margin-right: 0.25em;\n  display: inline-block;\n  width: 2.5em;\n  height: 2.5em;\n  border-radius: 500rem;\n}\n\n/*-------------------\n       Floated\n--------------------*/\n\n.ui.floated.image,\n.ui.floated.images {\n  float: left;\n  margin-right: 1em;\n  margin-bottom: 1em;\n}\n\n.ui.right.floated.images,\n.ui.right.floated.image {\n  float: right;\n  margin-right: 0em;\n  margin-bottom: 1em;\n  margin-left: 1em;\n}\n\n.ui.floated.images:last-child,\n.ui.floated.image:last-child {\n  margin-bottom: 0em;\n}\n\n.ui.centered.images,\n.ui.centered.image {\n  margin-left: auto;\n  margin-right: auto;\n}\n\n/*--------------\n     Sizes\n---------------*/\n\n.ui.mini.images .image,\n.ui.mini.images img,\n.ui.mini.image {\n  width: 20px;\n  font-size: 0.71428571rem;\n}\n\n.ui.tiny.images .image,\n.ui.tiny.images img,\n.ui.tiny.image {\n  width: 80px;\n  font-size: 0.85714286rem;\n}\n\n.ui.small.images .image,\n.ui.small.images img,\n.ui.small.image {\n  width: 150px;\n  font-size: 0.92857143rem;\n}\n\n.ui.medium.images .image,\n.ui.medium.images img,\n.ui.medium.image {\n  width: 300px;\n  font-size: 1rem;\n}\n\n.ui.large.images .image,\n.ui.large.images img,\n.ui.large.image {\n  width: 450px;\n  font-size: 1.14285714rem;\n}\n\n.ui.big.images .image,\n.ui.big.images img,\n.ui.big.image {\n  width: 600px;\n  font-size: 1.28571429rem;\n}\n\n.ui.huge.images .image,\n.ui.huge.images img,\n.ui.huge.image {\n  width: 800px;\n  font-size: 1.42857143rem;\n}\n\n.ui.massive.images .image,\n.ui.massive.images img,\n.ui.massive.image {\n  width: 960px;\n  font-size: 1.71428571rem;\n}\n\n/*******************************\n              Groups\n*******************************/\n\n.ui.images {\n  font-size: 0em;\n  margin: 0em -0.25rem 0rem;\n}\n\n.ui.images .image,\n.ui.images img {\n  display: inline-block;\n  margin: 0em 0.25rem 0.5rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n           Standard\n*******************************/\n\n/*--------------------\n        Inputs\n---------------------*/\n\n.ui.input {\n  position: relative;\n  display: inline-block;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.input input {\n  margin: 0em;\n  width: 100%;\n  outline: none;\n  -webkit-tap-highlight-color: rgba(255, 255, 255, 0);\n  text-align: left;\n  line-height: 1.2142em;\n  font-family: "Helvetica Neue", "Helvetica", Arial;\n  padding: 0.67861em 1em;\n  background: #ffffff;\n  border: 1px solid rgba(0, 0, 0, 0.15);\n  color: rgba(0, 0, 0, 0.8);\n  border-radius: 0.2857rem;\n  -webkit-transition: background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  box-shadow: none;\n}\n\n/*--------------------\n      Placeholder\n---------------------*/\n\n/* browsers require these rules separate */\n\n.ui.input input::-webkit-input-placeholder {\n  color: rgba(0, 0, 0, 0.4);\n}\n\n.ui.input input::-moz-placeholder {\n  color: rgba(0, 0, 0, 0.4);\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------------\n        Active\n---------------------*/\n\n.ui.input input:active,\n.ui.input.down input {\n  border-color: rgba(0, 0, 0, 0.3);\n  background: #fafafa;\n  color: rgba(0, 0, 0, 0.8);\n  box-shadow: none;\n}\n\n/*--------------------\n       Loading\n---------------------*/\n\n.ui.loading.loading.input > .icon:before {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: 50%;\n  margin: -0.64285em 0em 0em -0.64285em;\n  width: 1.2857em;\n  height: 1.2857em;\n  border-radius: 500rem;\n  border: 0.2em solid rgba(0, 0, 0, 0.1);\n}\n\n.ui.loading.loading.input > .icon:after {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: 50%;\n  margin: -0.64285em 0em 0em -0.64285em;\n  width: 1.2857em;\n  height: 1.2857em;\n  -webkit-animation: button-spin 0.6s linear;\n  animation: button-spin 0.6s linear;\n  -webkit-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n  border-radius: 500rem;\n  border-color: #aaaaaa transparent transparent;\n  border-style: solid;\n  border-width: 0.2em;\n  box-shadow: 0px 0px 0px 1px transparent;\n}\n\n/*--------------------\n        Focus\n---------------------*/\n\n.ui.input.focus input,\n.ui.input input:focus {\n  border-color: rgba(39, 41, 43, 0.3);\n  background: \'\';\n  color: rgba(0, 0, 0, 0.8);\n  box-shadow: none;\n}\n\n.ui.input.focus input input::-webkit-input-placeholder,\n.ui.input input:focus input::-webkit-input-placeholder {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.input.focus input input::-moz-placeholder,\n.ui.input input:focus input::-moz-placeholder {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------------\n        Error\n---------------------*/\n\n.ui.input.error input {\n  background-color: #fff0f0;\n  border-color: #dbb1b1;\n  color: #d95c5c;\n  box-shadow: none;\n}\n\n/* Error Placeholder */\n\n.ui.input.error input ::-webkit-input-placeholder {\n  color: rgba(255, 80, 80, 0.4);\n}\n\n.ui.input.error input ::-moz-placeholder {\n  color: rgba(255, 80, 80, 0.4);\n}\n\n/* Focused Error Placeholder */\n\n.ui.input.error input :focus::-webkit-input-placeholder {\n  color: rgba(255, 80, 80, 0.7);\n}\n\n.ui.input.error input :focus::-moz-placeholder {\n  color: rgba(255, 80, 80, 0.7);\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------------\n      Transparent\n---------------------*/\n\n.ui.transparent.input input {\n  border-color: transparent;\n  background-color: transparent;\n  padding: 0em;\n}\n\n/* Transparent Icon */\n\n.ui.transparent.icon.input > .icon {\n  width: 1.25em;\n}\n\n.ui.transparent.icon.input > input {\n  padding-left: 0em !important;\n  padding-right: 2em !important;\n}\n\n.ui.transparent[class*="left icon"].input > input {\n  padding-left: 0em !important;\n  padding-left: 2em !important;\n}\n\n/* Transparent Inverted */\n\n.ui.transparent.inverted.input input::-moz-placeholder {\n  color: rgba(255, 255, 255, 0.5);\n}\n\n.ui.transparent.inverted.input {\n  color: #ffffff;\n}\n\n.ui.transparent.inverted.input input {\n  color: inherit;\n}\n\n/*--------------------\n         Icon\n---------------------*/\n\n.ui.icon.input > .icon {\n  cursor: default;\n  position: absolute;\n  text-align: center;\n  top: 0px;\n  right: 0px;\n  margin: 0em;\n  height: 100%;\n  width: 2.82142em;\n  opacity: 0.5;\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n  -webkit-transition: opacity 0.3s ease;\n  transition: opacity 0.3s ease;\n}\n\n.ui.icon.input > .icon:before,\n.ui.icon.input > .icon:after {\n  left: 0;\n  position: absolute;\n  text-align: center;\n  top: 50%;\n  width: 100%;\n  margin-top: -0.5em;\n}\n\n.ui.icon.input > .link.icon {\n  cursor: pointer;\n}\n\n.ui.icon.input input {\n  padding-right: 2.82142em !important;\n}\n\n.ui.icon.input > .circular.icon {\n  top: 0.35em;\n  right: 0.5em;\n}\n\n/* Left Icon Input */\n\n.ui[class*="left icon"].input > .icon {\n  right: auto;\n  left: 1px;\n  border-radius: 0.2857rem 0em 0em 0.2857rem;\n}\n\n.ui[class*="left icon"].input > .circular.icon {\n  right: auto;\n  left: 0.5em;\n}\n\n.ui[class*="left icon"].input > input {\n  padding-left: 2.82142em !important;\n  padding-right: 1em !important;\n}\n\n/* Focus */\n\n.ui.icon.input > input:focus ~ .icon {\n  opacity: 1;\n}\n\n/*--------------------\n        Labeled\n---------------------*/\n\n/* Adjacent Label */\n\n.ui.labeled.input {\n  display: table;\n}\n\n.ui.labeled.input > input {\n  display: table-cell;\n  vertical-align: top;\n}\n\n.ui.labeled.input > .label {\n  display: table-cell;\n  vertical-align: middle;\n  white-space: nowrap;\n  font-size: 1em;\n}\n\n.ui.labeled.input > .label > .icon {\n  display: inline;\n  vertical-align: top;\n}\n\n/* Fluid Labeled */\n\n.ui.fluid.labeled.input {\n  display: table;\n  width: 100%;\n}\n\n.ui.fluid.labeled.input > .label {\n  width: 0.01%;\n}\n\n/* Label on Left */\n\n.ui.labeled.input:not([class*="corner labeled"]):not([class*="right labeled"]) > input {\n  border-left: none;\n  border-top-left-radius: 0px;\n  border-bottom-left-radius: 0px;\n}\n\n.ui.labeled.input:not([class*="corner labeled"]):not([class*="right labeled"]) > .label {\n  border-top-right-radius: 0px;\n  border-bottom-right-radius: 0px;\n}\n\n/* Label on Right */\n\n.ui[class*="right labeled"].input > input {\n  border-right: none;\n  border-top-right-radius: 0px !important;\n  border-bottom-right-radius: 0px !important;\n}\n\n.ui[class*="right labeled"].input > .label {\n  border-top-left-radius: 0px;\n  border-bottom-left-radius: 0px;\n}\n\n/* Corner Label */\n\n.ui.labeled.input .corner.label {\n  top: 1px;\n  right: 1px;\n  font-size: 0.75em;\n  border-radius: 0em 0.2857rem 0em 0em;\n}\n\n.ui.labeled.input input {\n  padding-right: 2.5em !important;\n}\n\n/* Spacing with corner label */\n\n.ui[class*="corner labeled"].input {\n  display: inline-block;\n}\n\n.ui[class*="corner labeled"].input > input {\n  display: block;\n}\n\n.ui[class*="corner labeled"].icon.input:not(.left) > input {\n  padding-right: 3.25em !important;\n}\n\n.ui[class*="corner labeled"].icon.input:not(.left) > .icon {\n  margin-right: 1.25em;\n}\n\n/*--------------------\n        Action\n---------------------*/\n\n.ui.action.input {\n  display: table;\n}\n\n.ui.action.input > input {\n  display: table-cell;\n  vertical-align: top;\n}\n\n.ui.action.input > .button,\n.ui.action.input > .buttons {\n  display: table-cell;\n  vertical-align: middle;\n  white-space: nowrap;\n  padding-top: 0.78571em;\n  padding-bottom: 0.78571em;\n}\n\n.ui.action.input > .button > .icon,\n.ui.action.input > .buttons > .button > .icon {\n  display: inline;\n  vertical-align: top;\n}\n\n.ui.fluid.action.input {\n  display: table;\n  width: 100%;\n}\n\n.ui.fluid.action.input > .button {\n  width: 0.01%;\n}\n\n/* Button on Right */\n\n.ui.action.input:not([class*="left action"]) > input {\n  border-right: none;\n  border-top-right-radius: 0px !important;\n  border-bottom-right-radius: 0px !important;\n}\n\n.ui.action.input:not([class*="left action"]) > .button,\n.ui.action.input:not([class*="left action"]) > .buttons {\n  border-top-left-radius: 0px;\n  border-bottom-left-radius: 0px;\n}\n\n/* Button on Left */\n\n.ui[class*="left action"].input > .button,\n.ui[class*="left action"].input > .buttons {\n  border-top-right-radius: 0px;\n  border-bottom-right-radius: 0px;\n}\n\n.ui[class*="left action"].input > input {\n  border-left: none;\n  border-top-left-radius: 0px;\n  border-bottom-left-radius: 0px;\n}\n\n/*--------------------\n       Inverted\n---------------------*/\n\n/* Standard */\n\n.ui.inverted.input input {\n  border: none;\n}\n\n/*--------------------\n        Fluid\n---------------------*/\n\n.ui.fluid.input {\n  display: block;\n}\n\n/*--------------------\n        Size\n---------------------*/\n\n.ui.mini.input {\n  font-size: 0.8125rem;\n}\n\n.ui.small.input {\n  font-size: 0.875rem;\n}\n\n.ui.input {\n  font-size: 1rem;\n}\n\n.ui.large.input {\n  font-size: 1.125rem;\n}\n\n.ui.big.input {\n  font-size: 1.25rem;\n}\n\n.ui.huge.input {\n  font-size: 1.375rem;\n}\n\n.ui.massive.input {\n  font-size: 1.5rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Label\n*******************************/\n\n.ui.label {\n  display: inline-block;\n  vertical-align: baseline;\n  line-height: 1;\n  margin: 0em 0.125em;\n  background-color: #e8e8e8;\n  border-color: #e8e8e8;\n  background-image: none;\n  padding: 0.6em 0.8em;\n  color: rgba(0, 0, 0, 0.6);\n  text-transform: none;\n  font-weight: bold;\n  border-radius: 0.2857rem;\n  box-sizing: border-box;\n  -webkit-transition: background 0.2s ease;\n  transition: background 0.2s ease;\n}\n\n.ui.label:first-child {\n  margin-left: 0em;\n}\n\n.ui.label:last-child {\n  margin-right: 0em;\n}\n\n/* Link */\n\na.ui.label {\n  cursor: pointer;\n}\n\n/* Inside Link */\n\n.ui.label a {\n  cursor: pointer;\n  color: inherit;\n  opacity: 0.8;\n  -webkit-transition: 0.2s opacity ease;\n  transition: 0.2s opacity ease;\n}\n\n.ui.label a:hover {\n  opacity: 1;\n}\n\n/* Icon */\n\n.ui.label .icon {\n  width: auto;\n  margin: 0em 0.75em 0em 0em;\n}\n\n/* Detail */\n\n.ui.label .detail {\n  display: inline-block;\n  vertical-align: top;\n  font-weight: bold;\n  margin-left: 1em;\n  opacity: 0.8;\n}\n\n.ui.label .detail .icon {\n  margin: 0em 0.25em 0em 0em;\n}\n\n/* Removable label */\n\n.ui.label .close.icon,\n.ui.label .delete.icon {\n  cursor: pointer;\n  margin-right: 0em;\n  margin-left: 0.5em;\n  opacity: 0.8;\n  -webkit-transition: background 0.2s ease;\n  transition: background 0.2s ease;\n}\n\n.ui.label .delete.icon:hover {\n  opacity: 1;\n}\n\n/*-------------------\n       Group\n--------------------*/\n\n.ui.labels .label {\n  margin: 0em 0.5em 0.75em 0em;\n}\n\n/*-------------------\n       Coupling\n--------------------*/\n\n/* Padding on next content after a label */\n\n.ui.top.attached.label:first-child + :not(.attached) {\n  margin-top: 2rem !important;\n}\n\n.ui.bottom.attached.label:first-child ~ :last-child:not(.attached) {\n  margin-top: 0em;\n  margin-bottom: 2rem !important;\n}\n\n/*******************************\n             Types\n*******************************/\n\n.ui.image.label {\n  width: auto !important;\n  margin-top: 0em;\n  margin-bottom: 0em;\n  max-width: 9999px;\n  vertical-align: baseline;\n  text-transform: none;\n  background: #e8e8e8;\n  padding: 0.6em 0.8em 0.6em 0.5em;\n  border-radius: 0.2857rem;\n  box-shadow: none;\n}\n\n.ui.image.label img {\n  display: inline-block;\n  vertical-align: top;\n  height: 2.2em;\n  margin: -0.6em 0.5em -0.6em -0.5em;\n  border-radius: 0.2857rem;\n}\n\n.ui.image.label .detail {\n  background: rgba(0, 0, 0, 0.1);\n  margin: -0.6em -0.8em -0.6em 0.5em;\n  padding: 0.6em 0.8em;\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n}\n\n/*-------------------\n         Tag\n--------------------*/\n\n.ui.tag.labels .label,\n.ui.tag.label {\n  margin-left: 1em;\n  position: relative;\n  padding-left: 1.5em;\n  padding-right: 1.5em;\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n}\n\n.ui.tag.labels .label:before,\n.ui.tag.label:before {\n  position: absolute;\n  -webkit-transform: translateY(-50%) translateX(50%) rotate(-45deg);\n  -ms-transform: translateY(-50%) translateX(50%) rotate(-45deg);\n  transform: translateY(-50%) translateX(50%) rotate(-45deg);\n  top: 50%;\n  right: 100%;\n  content: \'\';\n  background-color: #e8e8e8;\n  background-image: none;\n  width: 1.56em;\n  height: 1.56em;\n  -webkit-transition: background 0.2s ease;\n  transition: background 0.2s ease;\n}\n\n.ui.tag.labels .label:after,\n.ui.tag.label:after {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: -0.25em;\n  margin-top: -0.25em;\n  background-color: #ffffff !important;\n  width: 0.5em;\n  height: 0.5em;\n  box-shadow: 0 -1px 1px 0 rgba(0, 0, 0, 0.3);\n  border-radius: 500rem;\n}\n\n/*-------------------\n    Corner Label\n--------------------*/\n\n.ui.corner.label {\n  position: absolute;\n  top: 0em;\n  right: 0em;\n  margin: 0em;\n  padding: 0em;\n  text-align: center;\n  width: 3.25em;\n  height: 3.25em;\n  z-index: 10;\n  -webkit-transition: border-color 0.2s ease;\n  transition: border-color 0.2s ease;\n}\n\n/* Icon Label */\n\n.ui.corner.label {\n  background-color: transparent !important;\n}\n\n.ui.corner.label:after {\n  position: absolute;\n  content: "";\n  right: 0em;\n  top: 0em;\n  z-index: -1;\n  width: 0em;\n  height: 0em;\n  background-color: transparent !important;\n  border-top: 0em solid transparent;\n  border-right: 3.25em solid transparent;\n  border-bottom: 3.25em solid transparent;\n  border-left: 0em solid transparent;\n  border-right-color: inherit;\n  -webkit-transition: border-color 0.2s ease;\n  transition: border-color 0.2s ease;\n}\n\n.ui.corner.label .icon {\n  position: relative;\n  top: 0.4em;\n  left: 0.75em;\n  font-size: 1em;\n  margin: 0em;\n}\n\n/* Text Label\n.ui.text.corner.label {\n  font-weight: @cornerTextWeight;\n  text-align: center;\n  padding: 0.25em 0;\n  top: 1.1em;\n  transform: rotate(45deg);\n  width: 4em;\n  height: auto;\n}\n.ui.left.text.corner.label {\n  transform: rotate(-45deg);\n}\n.ui.text.corner.label:before,\n.ui.text.corner.label:after {\n  position: absolute;\n  content: \'\';\n  top: 0em;\n  width: 0em;\n  height: 0em;\n}\n.ui.text.corner.label:before {\n  left: auto;\n  right: 100%;\n  border-top: 0em solid transparent;\n  border-right-width: @ribbonTriangleSize;\n  border-right-color: inherit;\n  border-right-style: solid;\n  border-bottom: @ribbonTriangleSize solid transparent;\n  border-left: 0em solid transparent;\n}\n.ui.text.corner.label:after {\n  left: 100%;\n  right: auto;\n  border-top: 0em solid transparent;\n  border-right-width: @ribbonTriangleSize;\n  border-right-color: inherit;\n  border-right-style: solid;\n  border-bottom: @ribbonTriangleSize solid transparent;\n  border-left: 0em solid transparent;\n}\n*/\n\n/* Left Corner */\n\n.ui.left.corner.label,\n.ui.left.corner.label:after {\n  right: auto;\n  left: 0em;\n}\n\n.ui.left.corner.label:after {\n  border-top: 3.25em solid transparent;\n  border-right: 3.25em solid transparent;\n  border-bottom: 0em solid transparent;\n  border-left: 0em solid transparent;\n  border-top-color: inherit;\n}\n\n.ui.left.corner.label .icon {\n  left: -0.75em;\n}\n\n/* Segment */\n\n.ui.segment > .ui.corner.label {\n  top: -1px;\n  right: -1px;\n}\n\n.ui.segment > .ui.left.corner.label {\n  right: auto;\n  left: -1px;\n}\n\n/* Input */\n\n.ui.input > .ui.corner.label {\n  top: 1px;\n  right: 1px;\n}\n\n.ui.input > .ui.right.corner.label {\n  right: auto;\n  left: 1px;\n}\n\n/*-------------------\n       Ribbon\n--------------------*/\n\n.ui.ribbon.label {\n  position: relative;\n  margin: 0em;\n  left: -2rem;\n  padding-left: 2rem;\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n  border-color: rgba(0, 0, 0, 0.15);\n}\n\n.ui.ribbon.label:after {\n  position: absolute;\n  content: "";\n  top: 100%;\n  left: 0%;\n  background-color: transparent !important;\n  border-top: 0em solid transparent;\n  border-right-width: 1.2em;\n  border-right-color: inherit;\n  border-right-style: solid;\n  border-bottom: 1.2em solid transparent;\n  border-left: 0em solid transparent;\n  width: 0em;\n  height: 0em;\n}\n\n/*-------------------\n       Attached\n--------------------*/\n\n.ui.top.attached.label,\n.ui.attached.label {\n  width: 100%;\n  position: absolute;\n  margin: 0em;\n  top: 0em;\n  left: 0em;\n  padding: 0.75em 1em;\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n}\n\n.ui.bottom.attached.label {\n  top: auto;\n  bottom: 0em;\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n.ui.top.left.attached.label {\n  width: auto;\n  margin-top: 0em !important;\n  border-radius: 0.2857rem 0em 0.2857rem 0em;\n}\n\n.ui.top.right.attached.label {\n  width: auto;\n  left: auto;\n  right: 0em;\n  border-radius: 0em 0.2857rem 0em 0.2857rem;\n}\n\n.ui.bottom.left.attached.label {\n  width: auto;\n  top: auto;\n  bottom: 0em;\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n.ui.bottom.right.attached.label {\n  top: auto;\n  bottom: 0em;\n  left: auto;\n  right: 0em;\n  width: auto;\n  border-radius: 0.2857rem 0em 0.2857rem 0em;\n}\n\n/*******************************\n             States\n*******************************/\n\n/*-------------------\n      Disabled\n--------------------*/\n\n.ui.label.disabled {\n  opacity: 0.5;\n}\n\n/*-------------------\n        Hover\n--------------------*/\n\na.ui.labels .label:hover,\na.ui.label:hover {\n  background-color: #e0e0e0;\n  border-color: #e0e0e0;\n  background-image: none;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.labels a.label:hover:before,\na.ui.label:hover:before {\n  background-color: #e0e0e0;\n  background-image: none;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*-------------------\n      Visible\n--------------------*/\n\n.ui.labels.visible .label,\n.ui.label.visible {\n  display: inline-block !important;\n}\n\n/*-------------------\n      Hidden\n--------------------*/\n\n.ui.labels.hidden .label,\n.ui.label.hidden {\n  display: none !important;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-------------------\n       Colors\n--------------------*/\n\n/*--- Black ---*/\n\n.ui.black.labels .label,\n.ui.black.label {\n  background-color: #1b1c1d !important;\n  border-color: #1b1c1d !important;\n  color: #ffffff !important;\n}\n\n.ui.labels .black.label:before,\n.ui.black.labels .label:before,\n.ui.black.label:before {\n  background-color: #1b1c1d !important;\n}\n\na.ui.black.labels .label:hover,\na.ui.black.label:hover {\n  background-color: #1b1c1d !important;\n  border-color: #1b1c1d !important;\n}\n\n.ui.labels a.black.label:hover:before,\n.ui.black.labels a.label:hover:before,\na.ui.black.label:hover:before {\n  background-color: #1b1c1d !important;\n}\n\n.ui.black.corner.label,\n.ui.black.corner.label:hover {\n  background-color: transparent !important;\n}\n\n.ui.black.ribbon.label {\n  border-color: #020203 !important;\n}\n\n/*--- Blue ---*/\n\n.ui.blue.labels .label,\n.ui.blue.label {\n  background-color: #3b83c0 !important;\n  border-color: #3b83c0 !important;\n  color: #ffffff !important;\n}\n\n.ui.labels .blue.label:before,\n.ui.blue.labels .label:before,\n.ui.blue.label:before {\n  background-color: #3b83c0 !important;\n}\n\na.ui.blue.labels .label:hover,\n.ui.blue.labels a.label:hover,\na.ui.blue.label:hover {\n  background-color: #458ac6 !important;\n  border-color: #458ac6 !important;\n  color: #ffffff !important;\n}\n\n.ui.labels a.blue.label:hover:before,\n.ui.blue.labels a.label:hover:before,\na.ui.blue.label:hover:before {\n  background-color: #458ac6 !important;\n}\n\n.ui.blue.corner.label,\n.ui.blue.corner.label:hover {\n  background-color: transparent !important;\n}\n\n.ui.blue.ribbon.label {\n  border-color: #2f6899 !important;\n}\n\n/*--- Green ---*/\n\n.ui.green.labels .label,\n.ui.green.label {\n  background-color: #5bbd72 !important;\n  border-color: #5bbd72 !important;\n  color: #ffffff !important;\n}\n\n.ui.labels .green.label:before,\n.ui.green.labels .label:before,\n.ui.green.label:before {\n  background-color: #5bbd72 !important;\n}\n\na.ui.green.labels .label:hover,\na.ui.green.label:hover {\n  background-color: #66c17b !important;\n  border-color: #66c17b !important;\n}\n\n.ui.labels a.green.label:hover:before,\n.ui.green.labels a.label:hover:before,\na.ui.green.label:hover:before {\n  background-color: #66c17b !important;\n}\n\n.ui.green.corner.label,\n.ui.green.corner.label:hover {\n  background-color: transparent !important;\n}\n\n.ui.green.ribbon.label {\n  border-color: #42a359 !important;\n}\n\n/*--- Orange ---*/\n\n.ui.orange.labels .label,\n.ui.orange.label {\n  background-color: #e07b53 !important;\n  border-color: #e07b53 !important;\n  color: #ffffff !important;\n}\n\n.ui.labels .orange.label:before,\n.ui.orange.labels .label:before,\n.ui.orange.label:before {\n  background-color: #e07b53 !important;\n}\n\na.ui.orange.labels .label:hover,\n.ui.orange.labels a.label:hover,\na.ui.orange.label:hover {\n  background-color: #e28560 !important;\n  border-color: #e28560 !important;\n  color: #ffffff !important;\n}\n\n.ui.labels a.orange.label:hover:before,\n.ui.orange.labels a.label:hover:before,\na.ui.orange.label:hover:before {\n  background-color: #e28560 !important;\n}\n\n.ui.orange.corner.label,\n.ui.orange.corner.label:hover {\n  background-color: transparent !important;\n}\n\n.ui.orange.ribbon.label {\n  border-color: #d85a28 !important;\n}\n\n/*--- Pink ---*/\n\n.ui.pink.labels .label,\n.ui.pink.label {\n  background-color: #d9499a !important;\n  border-color: #d9499a !important;\n  color: #ffffff !important;\n}\n\n.ui.labels .pink.label:before,\n.ui.pink.labels .label:before,\n.ui.pink.label:before {\n  background-color: #d9499a !important;\n}\n\na.ui.pink.labels .label:hover,\n.ui.pink.labels a.label:hover,\na.ui.pink.label:hover {\n  background-color: #dc56a1 !important;\n  border-color: #dc56a1 !important;\n  color: #ffffff !important;\n}\n\n.ui.labels a.pink.label:hover:before,\n.ui.pink.labels a.label:hover:before,\na.ui.pink.label:hover:before {\n  background-color: #dc56a1 !important;\n}\n\n.ui.pink.corner.label,\n.ui.pink.corner.label:hover {\n  background-color: transparent !important;\n}\n\n.ui.pink.ribbon.label {\n  border-color: #c62981 !important;\n}\n\n/*--- Purple ---*/\n\n.ui.purple.labels .label,\n.ui.purple.label {\n  background-color: #564f8a !important;\n  border-color: #564f8a !important;\n  color: #ffffff !important;\n}\n\n.ui.labels .purple.label:before,\n.ui.purple.labels .label:before,\n.ui.purple.label:before {\n  background-color: #564f8a !important;\n}\n\na.ui.purple.labels .label:hover,\n.ui.purple.labels a.label:hover,\na.ui.purple.label:hover {\n  background-color: #5c5594 !important;\n  border-color: #5c5594 !important;\n  color: #ffffff !important;\n}\n\n.ui.labels a.purple.label:hover:before,\n.ui.purple.labels a.label:hover:before,\na.ui.purple.label:hover:before {\n  background-color: #5c5594 !important;\n}\n\n.ui.purple.corner.label,\n.ui.purple.corner.label:hover {\n  background-color: transparent !important;\n}\n\n.ui.purple.ribbon.label {\n  border-color: #423c6a !important;\n}\n\n/*--- Red ---*/\n\n.ui.red.labels .label,\n.ui.red.label {\n  background-color: #d95c5c !important;\n  border-color: #d95c5c !important;\n  color: #ffffff !important;\n}\n\n.ui.labels .red.label:before,\n.ui.red.labels .label:before,\n.ui.red.label:before {\n  background-color: #d95c5c !important;\n}\n\n.ui.red.corner.label,\n.ui.red.corner.label:hover {\n  background-color: transparent !important;\n}\n\na.ui.red.labels .label:hover,\na.ui.red.label:hover {\n  background-color: #dc6868 !important;\n  border-color: #dc6868 !important;\n  color: #ffffff !important;\n}\n\n.ui.labels a.red.label:hover:before,\n.ui.red.labels a.label:hover:before,\na.ui.red.label:hover:before {\n  background-color: #dc6868 !important;\n}\n\n.ui.red.ribbon.label {\n  border-color: #cf3333 !important;\n}\n\n/*--- Teal ---*/\n\n.ui.teal.labels .label,\n.ui.teal.label {\n  background-color: #00b5ad !important;\n  border-color: #00b5ad !important;\n  color: #ffffff !important;\n}\n\n.ui.labels .teal.label:before,\n.ui.teal.labels .label:before,\n.ui.teal.label:before {\n  background-color: #00b5ad !important;\n}\n\na.ui.teal.labels .label:hover,\n.ui.teal.labels a.label:hover,\na.ui.teal.label:hover {\n  background-color: #00c4bc !important;\n  border-color: #00c4bc !important;\n  color: #ffffff !important;\n}\n\n.ui.labels a.teal.label:hover:before,\n.ui.teal.labels a.label:hover:before,\na.ui.teal.label:hover:before {\n  background-color: #00c4bc !important;\n}\n\n.ui.teal.corner.label,\n.ui.teal.corner.label:hover {\n  background-color: transparent !important;\n}\n\n.ui.teal.ribbon.label {\n  border-color: #00827c !important;\n}\n\n/*--- Yellow ---*/\n\n.ui.yellow.labels .label,\n.ui.yellow.label {\n  background-color: #f2c61f !important;\n  border-color: #f2c61f !important;\n  color: #ffffff !important;\n}\n\n.ui.labels .yellow.label:before,\n.ui.yellow.labels .label:before,\n.ui.yellow.label:before {\n  background-color: #f2c61f !important;\n}\n\na.ui.yellow.labels .label:hover,\n.ui.yellow.labels a.label:hover,\na.ui.yellow.label:hover {\n  background-color: #f3ca2d !important;\n  border-color: #f3ca2d !important;\n  color: #ffffff !important;\n}\n\n.ui.labels a.yellow.label:hover:before,\n.ui.yellow.labels a.label:hover:before,\na.ui.yellow.label:hover:before {\n  background-color: #f3ca2d !important;\n}\n\n.ui.yellow.corner.label,\n.ui.yellow.corner.label:hover {\n  background-color: transparent !important;\n}\n\n.ui.yellow.ribbon.label {\n  border-color: #d2a90c !important;\n}\n\n/*-------------------\n       Fluid\n--------------------*/\n\n.ui.label.fluid,\n.ui.fluid.labels > .label {\n  width: 100%;\n  box-sizing: border-box;\n}\n\n/*-------------------\n       Inverted\n--------------------*/\n\n.ui.inverted.labels .label,\n.ui.inverted.label {\n  color: #ffffff !important;\n}\n\n/*-------------------\n     Horizontal\n--------------------*/\n\n.ui.horizontal.labels .label,\n.ui.horizontal.label {\n  margin: 0em 0.5em 0em 0em;\n  padding: 0.4em 0.8em;\n  min-width: 3em;\n  text-align: center;\n}\n\n/*-------------------\n       Circular\n--------------------*/\n\n.ui.circular.labels .label,\n.ui.circular.label {\n  min-width: 2em;\n  min-height: 2em;\n  padding: 0.5em !important;\n  line-height: 1em;\n  text-align: center;\n  border-radius: 500rem;\n}\n\n.ui.empty.circular.labels .label,\n.ui.empty.circular.label {\n  min-width: 0em;\n  min-height: 0em;\n  overflow: hidden;\n  width: 0.5em;\n  height: 0.5em;\n  vertical-align: baseline;\n}\n\n/*-------------------\n       Pointing\n--------------------*/\n\n.ui.pointing.label {\n  position: relative;\n}\n\n.ui.attached.pointing.label {\n  position: absolute;\n}\n\n.ui.pointing.label:before {\n  position: absolute;\n  content: \'\';\n  -webkit-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n  background-image: none;\n  z-index: 2;\n  width: 0.6em;\n  height: 0.6em;\n  -webkit-transition: background 0.2s ease;\n  transition: background 0.2s ease;\n}\n\n/*--- Above ---*/\n\n.ui.pointing.label:before {\n  background-color: #e8e8e8;\n  background-image: none;\n}\n\n.ui.pointing.label,\n.ui.pointing.above.label {\n  margin-top: 1em;\n}\n\n.ui.pointing.label:before,\n.ui.pointing.above.label:before {\n  margin-left: -0.3em;\n  top: -0.3em;\n  left: 50%;\n}\n\n/*--- Below ---*/\n\n.ui.pointing.bottom.label,\n.ui.pointing.below.label {\n  margin-top: 0em;\n  margin-bottom: 1em;\n}\n\n.ui.pointing.bottom.label:before,\n.ui.pointing.below.label:before {\n  margin-left: -0.3em;\n  top: auto;\n  right: auto;\n  bottom: -0.3em;\n  left: 50%;\n}\n\n/*--- Left ---*/\n\n.ui.pointing.left.label {\n  margin-top: 0em;\n  margin-left: 0em;\n}\n\n.ui.pointing.left.label:before {\n  margin-top: -0.3em;\n  bottom: auto;\n  right: auto;\n  top: 50%;\n  left: 0em;\n}\n\n/*--- Right ---*/\n\n.ui.pointing.right.label {\n  margin-top: 0em;\n  margin-right: 0em;\n}\n\n.ui.pointing.right.label:before {\n  margin-top: -0.3em;\n  right: -0.3em;\n  top: 50%;\n  bottom: auto;\n  left: auto;\n}\n\n/*------------------\n   Floating Label\n-------------------*/\n\n.ui.floating.label {\n  position: absolute;\n  z-index: 100;\n  top: -1em;\n  left: 100%;\n  margin: 0em 0em 0em -1.5em !important;\n}\n\n/*-------------------\n        Sizes\n--------------------*/\n\n.ui.mini.labels .label,\n.ui.mini.label {\n  font-size: 0.6428rem;\n}\n\n.ui.tiny.labels .label,\n.ui.tiny.label {\n  font-size: 0.7142rem;\n}\n\n.ui.small.labels .label,\n.ui.small.label {\n  font-size: 0.7857rem;\n}\n\n.ui.labels .label,\n.ui.label {\n  font-size: 0.8571rem;\n}\n\n.ui.large.labels .label,\n.ui.large.label {\n  font-size: 1rem;\n}\n\n.ui.big.labels .label,\n.ui.big.label {\n  font-size: 1.1428rem;\n}\n\n.ui.huge.labels .label,\n.ui.huge.label {\n  font-size: 1.2857rem;\n}\n\n.ui.massive.labels .label,\n.ui.massive.label {\n  font-size: 1.4285rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            List\n*******************************/\n\nul.ui.list,\nol.ui.list,\n.ui.list {\n  list-style-type: none;\n  margin: 1em 0em;\n  padding: 0em 0em;\n}\n\nul.ui.list:first-child,\nol.ui.list:first-child,\n.ui.list:first-child {\n  margin-top: 0em;\n  padding-top: 0em;\n}\n\nul.ui.list:last-child,\nol.ui.list:last-child,\n.ui.list:last-child {\n  margin-bottom: 0em;\n  padding-bottom: 0em;\n}\n\n/*******************************\n            Content\n*******************************/\n\n/* List Item */\n\nul.ui.list li,\nol.ui.list li,\n.ui.list > .item,\n.ui.list .list > .item {\n  display: list-item;\n  table-layout: fixed;\n  list-style-type: none;\n  list-style-position: outside;\n  padding: 0.3em 0em;\n  line-height: 1.2;\n}\n\nul.ui.list > li:first-child:after,\nol.ui.list > li:first-child:after,\n.ui.list > .list > .item,\n.ui.list > .item:after {\n  content: \'\';\n  display: block;\n  height: 0;\n  clear: both;\n  visibility: hidden;\n}\n\nul.ui.list li:first-child,\nol.ui.list li:first-child,\n.ui.list .list > .item:first-child,\n.ui.list > .item:first-child {\n  padding-top: 0em;\n}\n\nul.ui.list li:last-child,\nol.ui.list li:last-child,\n.ui.list .list > .item:last-child,\n.ui.list > .item:last-child {\n  padding-bottom: 0em;\n}\n\n/* Child List */\n\nul.ui.list ul,\nol.ui.list ol,\n.ui.list .list {\n  clear: both;\n  margin: 0em;\n  padding: 0.75em 0em 0.25em 0.5em;\n}\n\n/* Icon */\n\n.ui.list .list > .item > .icon,\n.ui.list > .item > .icon {\n  display: table-cell;\n  margin: 0em;\n  padding-top: 0.1rem;\n  padding-right: 0.3em;\n  vertical-align: middle;\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n.ui.list .list > .item [class*="top aligned"].icon,\n.ui.list > .item > [class*="top aligned"].icon {\n  vertical-align: top;\n}\n\n.ui.list .list > .item > .icon:only-child,\n.ui.list > .item > .icon:only-child {\n  display: inline-block;\n  vertical-align: top;\n}\n\n/* Image */\n\n.ui.list .list > .item > .image,\n.ui.list > .item > .image {\n  display: table-cell;\n  background-color: transparent;\n  margin: 0em;\n  padding-right: 0.5em;\n  vertical-align: middle;\n}\n\n.ui.list .list > .item > [class*="top aligned"].image,\n.ui.list > .item > [class*="top aligned"].image {\n  vertical-align: top;\n}\n\n.ui.list .list > .item > .image img,\n.ui.list > .item > .image img {\n  vertical-align: middle;\n}\n\n.ui.list .list > .item > img.image,\n.ui.list .list > .item > .image:only-child,\n.ui.list > .item > img.image,\n.ui.list > .item > .image:only-child {\n  display: inline-block;\n  padding-right: 0em;\n}\n\n/* Content */\n\n.ui.list .list > .item > .content,\n.ui.list > .item > .content {\n  line-height: 1.2em;\n}\n\n.ui.list .list > .item > .image + .content,\n.ui.list .list > .item > .icon + .content .ui.list > .item > .image + .content,\n.ui.list > .item > .icon + .content {\n  display: table-cell;\n  padding-left: 0.5em;\n  vertical-align: middle;\n}\n\n.ui.list .list > .item > .image + .content,\n.ui.list .list > .item > .icon + .content,\n.ui.list > .item > .image + .content,\n.ui.list > .item > .icon + .content {\n  display: table-cell;\n  padding-left: 0.5em;\n  vertical-align: middle;\n}\n\n.ui.list .list > .item > img.image + .content,\n.ui.list > .item > img.image + .content {\n  display: inline-block;\n}\n\n.ui.list .list > .item [class*="top aligned"].content,\n.ui.list > .item > [class*="top aligned"].content {\n  vertical-align: top;\n}\n\n.ui.list .list > .item > .content > .list,\n.ui.list > .item > .content > .list {\n  margin-left: 0em;\n  padding-left: 0em;\n}\n\n/* Item Link */\n\n.ui.list .list > a.item,\n.ui.list > a.item {\n  cursor: pointer;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.list .list > a.item:hover,\n.ui.list > a.item:hover {\n  color: #00b2f3;\n}\n\n/* Linked Item Icons */\n\n.ui.list .list > a.item .icon,\n.ui.list > a.item .icon {\n  color: rgba(0, 0, 0, 0.4);\n}\n\n/* Linking Content */\n\n.ui.list .item a {\n  cursor: pointer;\n  color: rgba(0, 0, 0, 0.8) !important;\n}\n\n.ui.list .item a:hover {\n  color: #00b2f3 !important;\n}\n\n/* Header */\n\n.ui.list .list > .item .header,\n.ui.list > .item .header {\n  display: block;\n  margin: 0em;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.list .list > .item .description,\n.ui.list > .item .description {\n  display: block;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Floated Content */\n\n.ui.list .list > .item [class*="left floated"],\n.ui.list > .item [class*="left floated"] {\n  float: left;\n  margin: 0em 1em 0em 0em;\n}\n\n.ui.list .list > .item [class*="right floated"],\n.ui.list > .item [class*="right floated"] {\n  float: right;\n  margin: 0em 0em 0em 1em;\n}\n\n/*******************************\n            Coupling\n*******************************/\n\n.ui.menu .ui.list > .item,\n.ui.menu .ui.list .list > .item {\n  display: list-item;\n  table-layout: fixed;\n  list-style-type: none;\n  list-style-position: outside;\n  padding: 0.3em 0em;\n  line-height: 1.2;\n}\n\n.ui.menu .ui.list .list > .item:before,\n.ui.menu .ui.list > .item:before {\n  border: none;\n  background: none;\n}\n\n.ui.menu .ui.list .list > .item:first-child,\n.ui.menu .ui.list > .item:first-child {\n  padding-top: 0em;\n}\n\n.ui.menu .ui.list .list > .item:last-child,\n.ui.menu .ui.list > .item:last-child {\n  padding-bottom: 0em;\n}\n\n/*******************************\n            Types\n*******************************/\n\n/*-------------------\n      Horizontal\n--------------------*/\n\n.ui.horizontal.list {\n  display: inline-block;\n  font-size: 0em;\n}\n\n.ui.horizontal.list > .item {\n  display: inline-block;\n  margin-left: 1em;\n  font-size: 1rem;\n}\n\n.ui.horizontal.list > .item:first-child {\n  margin-left: 0em !important;\n  padding-left: 0em !important;\n}\n\n.ui.horizontal.list .list {\n  padding-left: 0em;\n  padding-bottom: 0em;\n}\n\n/* Padding on all elements */\n\n.ui.horizontal.list > .item:first-child,\n.ui.horizontal.list > .item:last-child {\n  padding-top: 0.3em;\n  padding-bottom: 0.3em;\n}\n\n/* Horizontal List */\n\n.ui.horizontal.list > .item > .icon {\n  margin: 0em;\n  padding: 0em 0.25em 0em 0em;\n}\n\n.ui.horizontal.list > .item > .icon,\n.ui.horizontal.list > .item > .icon + .content {\n  float: none;\n  display: inline-block;\n}\n\n/*******************************\n             States\n*******************************/\n\n/*-------------------\n       Disabled\n--------------------*/\n\n.ui.list .list > .disabled.item,\n.ui.list > .disabled.item {\n  pointer-events: none;\n  color: rgba(40, 40, 40, 0.3) !important;\n}\n\n.ui.inverted.list .list > .disabled.item,\n.ui.inverted.list > .disabled.item {\n  color: rgba(225, 225, 225, 0.3) !important;\n}\n\n/*-------------------\n        Hover\n--------------------*/\n\n.ui.list .list > a.item:hover .icon,\n.ui.list > a.item:hover .icon {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-------------------\n       Inverted\n--------------------*/\n\n.ui.inverted.list .list > a.item > .icon,\n.ui.inverted.list > a.item > .icon {\n  color: rgba(255, 255, 255, 0.8);\n}\n\n.ui.inverted.list .list > .item .header,\n.ui.inverted.list > .item .header {\n  color: #ffffff;\n}\n\n.ui.inverted.list .list > .item .description,\n.ui.inverted.list > .item .description {\n  color: rgba(255, 255, 255, 0.8);\n}\n\n/* Item Link */\n\n.ui.inverted.list .list > a.item,\n.ui.inverted.list > a.item {\n  cursor: pointer;\n  color: #ffffff;\n}\n\n.ui.inverted.list .list > a.item:hover,\n.ui.inverted.list > a.item:hover {\n  color: #00b2f3;\n}\n\n/* Linking Content */\n\n.ui.inverted.list .item a {\n  cursor: pointer;\n  color: #ffffff !important;\n}\n\n.ui.inverted.list .item a:hover {\n  color: #00b2f3 !important;\n}\n\n/*-------------------\n       Link\n--------------------*/\n\n.ui.link.list .item,\n.ui.link.list a.item,\n.ui.link.list .item a {\n  color: rgba(0, 0, 0, 0.4);\n  -webkit-transition: 0.2s color ease;\n  transition: 0.2s color ease;\n}\n\n.ui.link.list a.item:hover,\n.ui.link.list .item a:hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.link.list a.item:active,\n.ui.link.list .item a:active {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.link.list .active.item,\n.ui.link.list .active.item a {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Inverted */\n\n.ui.inverted.link.list .item,\n.ui.inverted.link.list a.item,\n.ui.inverted.link.list .item a {\n  color: rgba(255, 255, 255, 0.5);\n}\n\n.ui.inverted.link.list a.item:hover,\n.ui.inverted.link.list .item a:hover {\n  color: #ffffff;\n}\n\n.ui.inverted.link.list a.item:active,\n.ui.inverted.link.list .item a:active {\n  color: #ffffff;\n}\n\n.ui.inverted.link.list a.active.item,\n.ui.inverted.link.list .active.item a {\n  color: #ffffff;\n}\n\n/*-------------------\n      Selection\n--------------------*/\n\n.ui.selection.list .list > .item,\n.ui.selection.list > .item {\n  cursor: pointer;\n  background: transparent;\n  padding: 0.5em 0.5em;\n  margin: 0em;\n  color: rgba(0, 0, 0, 0.4);\n  border-radius: 0.5em;\n  -webkit-transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n  transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n}\n\n.ui.selection.list .list > .item:last-child,\n.ui.selection.list > .item:last-child {\n  margin-bottom: 0em;\n}\n\n.ui.selection.list.list > .item:hover,\n.ui.selection.list > .item:hover {\n  background: rgba(0, 0, 0, 0.03);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.selection.list .list > .item:active,\n.ui.selection.list > .item:active {\n  background: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.selection.list .list > .item.active,\n.ui.selection.list > .item.active {\n  background: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Inverted */\n\n.ui.inverted.selection.list > .item,\n.ui.inverted.selection.list > .item {\n  background: transparent;\n  color: rgba(255, 255, 255, 0.5);\n}\n\n.ui.inverted.selection.list > .item:hover,\n.ui.inverted.selection.list > .item:hover {\n  background: rgba(255, 255, 255, 0.02);\n  color: #ffffff;\n}\n\n.ui.inverted.selection.list > .item:active,\n.ui.inverted.selection.list > .item:active {\n  background: rgba(255, 255, 255, 0.05);\n  color: #ffffff;\n}\n\n.ui.inverted.selection.list > .item.active,\n.ui.inverted.selection.list > .item.active {\n  background: rgba(255, 255, 255, 0.05);\n  color: #ffffff;\n}\n\n/* Celled / Divided Selection List */\n\n.ui.celled.selection.list .list > .item,\n.ui.divided.selection.list .list > .item,\n.ui.celled.selection.list > .item,\n.ui.divided.selection.list > .item {\n  border-radius: 0em;\n}\n\n/*-------------------\n       Animated\n--------------------*/\n\n.ui.animated.list > .item {\n  -webkit-transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n  transition: 0.2s color ease, 0.2s padding-left ease, 0.2s background-color ease;\n}\n\n.ui.animated.list:not(.horizontal) > .item:hover {\n  padding-left: 1em;\n}\n\n/*-------------------\n       Fitted\n--------------------*/\n\n.ui.fitted.list:not(.selection) .list > .item,\n.ui.fitted.list:not(.selection) > .item {\n  padding-left: 0em;\n  padding-right: 0em;\n}\n\n.ui.fitted.selection.list .list > .item,\n.ui.fitted.selection.list > .item {\n  margin-left: -0.5em;\n  margin-right: -0.5em;\n}\n\n/*-------------------\n      Bulleted\n--------------------*/\n\nul.ui.list,\n.ui.bulleted.list {\n  margin-left: 1rem;\n}\n\nul.ui.list li,\n.ui.bulleted.list .list > .item,\n.ui.bulleted.list > .item {\n  position: relative;\n}\n\nul.ui.list li:before,\n.ui.bulleted.list .list > .item:before,\n.ui.bulleted.list > .item:before {\n  position: absolute;\n  top: auto;\n  left: auto;\n  margin-left: -1rem;\n  content: \'•\';\n  opacity: 1;\n  color: rgba(0, 0, 0, 0.8);\n  vertical-align: top;\n}\n\nul.ui.list ul,\n.ui.bulleted.list .list {\n  padding-left: 1rem;\n}\n\n/* Horizontal Bulleted */\n\nul.ui.horizontal.bulleted.list,\n.ui.horizontal.bulleted.list {\n  margin-left: 0em;\n}\n\nul.ui.horizontal.bulleted.list li,\n.ui.horizontal.bulleted.list > .item {\n  margin-left: 1.5rem;\n}\n\nul.ui.horizontal.bulleted.list li:first-child,\n.ui.horizontal.bulleted.list > .item:first-child {\n  margin-left: 0em;\n}\n\nul.ui.horizontal.bulleted.list li:first-child::before,\n.ui.horizontal.bulleted.list > .item:first-child::before {\n  display: none;\n}\n\n/*-------------------\n       Ordered\n--------------------*/\n\nol.ui.list,\n.ui.ordered.list,\n.ui.ordered.list .list,\nol.ui.list ol {\n  counter-reset: ordered;\n  margin-left: 1.25rem;\n  list-style-type: none;\n}\n\nol.ui.list li,\n.ui.ordered.list .list > .item,\n.ui.ordered.list > .item {\n  list-style-type: none;\n  position: relative;\n}\n\nol.ui.list li:before,\n.ui.ordered.list .list > .item:before,\n.ui.ordered.list > .item:before {\n  position: absolute;\n  top: auto;\n  left: auto;\n  margin-left: -1.25rem;\n  counter-increment: ordered;\n  content: counters(ordered, ".") " ";\n  text-align: right;\n  color: rgba(0, 0, 0, 0.8);\n  vertical-align: middle;\n  opacity: 0.8;\n}\n\n/* Child Lists */\n\nol.ui.list ol,\n.ui.ordered.list .list {\n  margin-left: 1em;\n}\n\nol.ui.list ol li:before,\n.ui.ordered.list .list > .item:before {\n  margin-left: -2em;\n}\n\n/* Horizontal Ordered */\n\nol.ui.horizontal.list,\n.ui.ordered.horizontal.list {\n  margin-left: 0em;\n}\n\nol.ui.horizontal.list li:before,\n.ui.ordered.horizontal.list .list > .item:before,\n.ui.ordered.horizontal.list > .item:before {\n  position: static;\n  margin: 0em 0.5em 0em 0em;\n}\n\n/*-------------------\n       Divided\n--------------------*/\n\n.ui.divided.list > .item {\n  border-top: 1px solid rgba(39, 41, 43, 0.15);\n}\n\n.ui.divided.list .list > .item {\n  border-top: none;\n}\n\n.ui.divided.list .item .list > .item {\n  border-top: none;\n}\n\n.ui.divided.list .list > .item:first-child,\n.ui.divided.list > .item:first-child {\n  border-top: none;\n}\n\n/* Sub Menu */\n\n.ui.divided.list:not(.horizontal) .list > .item:first-child {\n  border-top-width: 1px;\n}\n\n/* Divided bulleted */\n\n.ui.divided.bulleted.list:not(.horizontal),\n.ui.divided.bulleted.list .list {\n  margin-left: 0em;\n  padding-left: 0em;\n}\n\n.ui.divided.bulleted.list .list > .item:not(.horizontal),\n.ui.divided.bulleted.list > .item:not(.horizontal) {\n  padding-left: 1rem;\n}\n\n/* Divided Ordered */\n\n.ui.divided.ordered.list {\n  margin-left: 0em;\n}\n\n.ui.divided.ordered.list .list > .item,\n.ui.divided.ordered.list > .item {\n  padding-left: 1.25rem;\n}\n\n.ui.divided.ordered.list .item .list {\n  margin-left: 0em;\n  margin-right: 0em;\n  padding-bottom: 0.3em;\n}\n\n.ui.divided.ordered.list .item .list > .item {\n  padding-left: 1em;\n}\n\n/* Divided Selection */\n\n.ui.divided.selection.list .list > .item,\n.ui.divided.selection.list > .item {\n  margin: 0em;\n  border-radius: 0em;\n}\n\n/* Divided horizontal */\n\n.ui.divided.horizontal.list {\n  margin-left: 0em;\n}\n\n.ui.divided.horizontal.list > .item {\n  border-top: none;\n  border-left: 1px solid rgba(39, 41, 43, 0.15);\n  margin: 0em;\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n  line-height: 0.6;\n}\n\n.ui.horizontal.divided.list > .item:first-child {\n  border-left: none;\n}\n\n/* Inverted */\n\n.ui.divided.inverted.list > .item,\n.ui.divided.inverted.list > .list,\n.ui.divided.inverted.horizontal.list > .item {\n  border-color: rgba(255, 255, 255, 0.2);\n}\n\n/*-------------------\n        Celled\n--------------------*/\n\n.ui.celled.list > .item,\n.ui.celled.list > .list {\n  border-top: 1px solid rgba(39, 41, 43, 0.15);\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n}\n\n.ui.celled.list > .item:last-child {\n  border-bottom: 1px solid rgba(39, 41, 43, 0.15);\n}\n\n/* Padding on all elements */\n\n.ui.celled.list > .item:first-child,\n.ui.celled.list > .item:last-child {\n  padding-top: 0.3em;\n  padding-bottom: 0.3em;\n}\n\n/* Sub Menu */\n\n.ui.celled.list .item .list > .item {\n  border-width: 0px;\n}\n\n.ui.celled.list .list > .item:first-child {\n  border-top-width: 0px;\n}\n\n/* Celled Bulleted */\n\n.ui.celled.bulleted.list {\n  margin-left: 0em;\n}\n\n.ui.celled.bulleted.list .list > .item,\n.ui.celled.bulleted.list > .item {\n  padding-left: 1rem;\n}\n\n.ui.celled.bulleted.list .item .list {\n  margin-left: -1rem;\n  margin-right: -1rem;\n  padding-bottom: 0.3em;\n}\n\n/* Celled Ordered */\n\n.ui.celled.ordered.list {\n  margin-left: 0em;\n}\n\n.ui.celled.ordered.list .list > .item,\n.ui.celled.ordered.list > .item {\n  padding-left: 1.25rem;\n}\n\n.ui.celled.ordered.list .item .list {\n  margin-left: 0em;\n  margin-right: 0em;\n  padding-bottom: 0.3em;\n}\n\n.ui.celled.ordered.list .list > .item {\n  padding-left: 1em;\n}\n\n/* Celled Horizontal */\n\n.ui.horizontal.celled.list {\n  margin-left: 0em;\n}\n\n.ui.horizontal.celled.list .list > .item,\n.ui.horizontal.celled.list > .item {\n  border-top: none;\n  border-left: 1px solid rgba(39, 41, 43, 0.15);\n  margin: 0em;\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n  line-height: 0.6;\n}\n\n.ui.horizontal.celled.list .list > .item:last-child,\n.ui.horizontal.celled.list > .item:last-child {\n  border-bottom: none;\n  border-right: 1px solid rgba(39, 41, 43, 0.15);\n}\n\n/* Inverted */\n\n.ui.celled.inverted.list > .item,\n.ui.celled.inverted.list > .list {\n  border-color: 1px solid rgba(255, 255, 255, 0.2);\n}\n\n.ui.celled.inverted.horizontal.list .list > .item,\n.ui.celled.inverted.horizontal.list > .item {\n  border-color: 1px solid rgba(255, 255, 255, 0.2);\n}\n\n/*-------------------\n       Relaxed\n--------------------*/\n\n.ui.relaxed.list:not(.horizontal) .list > .item,\n.ui.relaxed.list:not(.horizontal) > .item {\n  padding-top: 0.5rem;\n  padding-bottom: 0.5rem;\n}\n\n.ui.relaxed.list .list > .item .header,\n.ui.relaxed.list > .item .header {\n  /*margin-bottom: @relaxedHeaderMargin;*/\n}\n\n.ui.horizontal.relaxed.list > .item {\n  padding-left: 1.25rem;\n  padding-right: 1.25rem;\n}\n\n/* Very Relaxed */\n\n.ui[class*="very relaxed"].list:not(.horizontal) .list > .item,\n.ui[class*="very relaxed"].list:not(.horizontal) > .item {\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui[class*="very relaxed"].list .list > .item .header,\n.ui[class*="very relaxed"].list > .item .header {\n  /*margin-bottom: @veryRelaxedHeaderMargin;*/\n}\n\n.ui.horizontal[class*="very relaxed"].list .list > .item,\n.ui.horizontal[class*="very relaxed"].list > .item {\n  padding-left: 2rem;\n  padding-right: 2rem;\n}\n\n/*-------------------\n      Sizes\n--------------------*/\n\n.ui.mini.list .list > .item,\n.ui.mini.list > .item {\n  font-size: 0.71428571em;\n}\n\n.ui.tiny.list .list > .item,\n.ui.tiny.list > .item {\n  font-size: 0.85714286em;\n}\n\n.ui.small.list .list > .item,\n.ui.small.list > .item {\n  font-size: 0.92857143em;\n}\n\n.ui.list .list > .item,\n.ui.list > .item {\n  font-size: 1em;\n}\n\n.ui.large.list .list > .item,\n.ui.large.list > .item {\n  font-size: 1.14285714em;\n}\n\n.ui.big.list .list > .item,\n.ui.big.list > .item {\n  font-size: 1.28571429em;\n}\n\n.ui.huge.list .list > .item,\n.ui.huge.list > .item {\n  font-size: 1.42857143em;\n}\n\n.ui.massive.list .list > .item,\n.ui.massive.list > .item {\n  font-size: 1.71428571em;\n}\n\n.ui.mini.horizontal.list .list > .item,\n.ui.mini.horizontal.list > .item {\n  font-size: 0.71428571rem;\n}\n\n.ui.tiny.horizontal.list .list > .item,\n.ui.tiny.horizontal.list > .item {\n  font-size: 0.85714286rem;\n}\n\n.ui.small.horizontal.list .list > .item,\n.ui.small.horizontal.list > .item {\n  font-size: 0.92857143rem;\n}\n\n.ui.horizontal.list .list > .item,\n.ui.horizontal.list > .item {\n  font-size: 1rem;\n}\n\n.ui.large.horizontal.list .list > .item,\n.ui.large.horizontal.list > .item {\n  font-size: 1.14285714rem;\n}\n\n.ui.big.horizontal.list .list > .item,\n.ui.big.horizontal.list > .item {\n  font-size: 1.28571429rem;\n}\n\n.ui.huge.horizontal.list .list > .item,\n.ui.huge.horizontal.list > .item {\n  font-size: 1.42857143rem;\n}\n\n.ui.massive.horizontal.list .list > .item,\n.ui.massive.horizontal.list > .item {\n  font-size: 1.71428571rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n    User Variable Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Loader\n*******************************/\n\n/* Standard Size */\n\n.ui.loader {\n  display: none;\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  margin: 0px;\n  text-align: center;\n  z-index: 1000;\n  -webkit-transform: translateX(-50%) translateY(-50%);\n  -ms-transform: translateX(-50%) translateY(-50%);\n  transform: translateX(-50%) translateY(-50%);\n}\n\n/* Static Shape */\n\n.ui.loader:before {\n  position: absolute;\n  content: \'\';\n  top: 0%;\n  left: 50%;\n  width: 100%;\n  height: 100%;\n  border-radius: 500rem;\n  border: 0.2em solid rgba(0, 0, 0, 0.1);\n}\n\n/* Active Shape */\n\n.ui.loader:after {\n  position: absolute;\n  content: \'\';\n  top: 0%;\n  left: 50%;\n  width: 100%;\n  height: 100%;\n  -webkit-animation: loader 0.6s linear;\n  animation: loader 0.6s linear;\n  -webkit-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n  border-radius: 500rem;\n  border-color: #aaaaaa transparent transparent;\n  border-style: solid;\n  border-width: 0.2em;\n  box-shadow: 0px 0px 0px 1px transparent;\n}\n\n/* Active Animation */\n\n@-webkit-keyframes loader {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n@keyframes loader {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n/* Sizes */\n\n.ui.loader:before,\n.ui.loader:after {\n  width: 2.2585em;\n  height: 2.2585em;\n  margin: 0em 0em 0em -1.12925em;\n}\n\n.ui.mini.loader:before,\n.ui.mini.loader:after {\n  width: 1.2857em;\n  height: 1.2857em;\n  margin: 0em 0em 0em -0.64285em;\n}\n\n.ui.small.loader:before,\n.ui.small.loader:after {\n  width: 1.7142em;\n  height: 1.7142em;\n  margin: 0em 0em 0em -0.8571em;\n}\n\n.ui.large.loader:before,\n.ui.large.loader:after {\n  width: 4.5714em;\n  height: 4.5714em;\n  margin: 0em 0em 0em -2.2857em;\n}\n\n/*-------------------\n      Coupling\n--------------------*/\n\n/* Show inside active dimmer */\n\n.ui.dimmer .loader {\n  display: block;\n}\n\n/* Black Dimmer */\n\n.ui.dimmer .ui.loader {\n  color: #ffffff;\n}\n\n.ui.dimmer .ui.loader:before {\n  border-color: rgba(255, 255, 255, 0.15);\n}\n\n.ui.dimmer .ui.loader:after {\n  border-color: #ffffff transparent transparent;\n}\n\n/* White Dimmer (Inverted) */\n\n.ui.inverted.dimmer .ui.loader {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.inverted.dimmer .ui.loader:before {\n  border-color: rgba(0, 0, 0, 0.1);\n}\n\n.ui.inverted.dimmer .ui.loader:after {\n  border-color: #aaaaaa transparent transparent;\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*-------------------\n        Text\n--------------------*/\n\n.ui.text.loader {\n  width: auto !important;\n  height: auto !important;\n  text-align: center;\n  font-style: normal;\n}\n\n/*******************************\n            States\n*******************************/\n\n.ui.indeterminate.loader:after {\n  -webkit-animation-direction: reverse;\n  animation-direction: reverse;\n  -webkit-animation-duration: 1.2s;\n  animation-duration: 1.2s;\n}\n\n.ui.loader.active,\n.ui.loader.visible {\n  display: block;\n}\n\n.ui.loader.disabled,\n.ui.loader.hidden {\n  display: none;\n}\n\n/*******************************\n            Variations\n*******************************/\n\n/*-------------------\n        Sizes\n--------------------*/\n\n/* Loader */\n\n.ui.inverted.dimmer .ui.mini.loader,\n.ui.mini.loader {\n  width: 1.2857em;\n  height: 1.2857em;\n  font-size: 0.7857em;\n}\n\n.ui.inverted.dimmer .ui.small.loader,\n.ui.small.loader {\n  width: 1.7142em;\n  height: 1.7142em;\n  font-size: 0.9285em;\n}\n\n.ui.inverted.dimmer .ui.loader,\n.ui.loader {\n  width: 2.2585em;\n  height: 2.2585em;\n  font-size: 1em;\n}\n\n.ui.inverted.dimmer .ui.loader.large,\n.ui.loader.large {\n  width: 4.5714em;\n  height: 4.5714em;\n  font-size: 1.1428em;\n}\n\n/* Text Loader */\n\n.ui.mini.text.loader {\n  min-width: 1.2857em;\n  padding-top: 1.9857em;\n}\n\n.ui.small.text.loader {\n  min-width: 1.7142em;\n  padding-top: 2.4142em;\n}\n\n.ui.text.loader {\n  min-width: 2.2585em;\n  padding-top: 2.9585em;\n}\n\n.ui.large.text.loader {\n  min-width: 4.5714em;\n  padding-top: 5.2714em;\n}\n\n/*-------------------\n       Inverted\n--------------------*/\n\n.ui.inverted.loader {\n  color: #ffffff;\n}\n\n.ui.inverted.loader:before {\n  border-color: rgba(255, 255, 255, 0.15);\n}\n\n.ui.inverted.loader:after {\n  border-top-color: #ffffff;\n}\n\n/*-------------------\n       Inline\n--------------------*/\n\n.ui.inline.loader {\n  position: relative;\n  vertical-align: middle;\n  margin: 0em;\n  left: 0em;\n  top: 0em;\n  -webkit-transform: none;\n  -ms-transform: none;\n  transform: none;\n}\n\n.ui.inline.loader.active,\n.ui.inline.loader.visible {\n  display: inline-block;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Rails\n*******************************/\n\n.ui.rail {\n  font-size: 1em;\n  position: absolute;\n  top: 0%;\n  width: 300px;\n  box-sizing: content-box;\n}\n\n.ui.left.rail {\n  left: auto;\n  right: 100%;\n  padding: 0em 2rem 0em 0em;\n  margin: 0em 2rem 0em 0em;\n}\n\n.ui.right.rail {\n  left: 100%;\n  right: auto;\n  padding: 0em 0em 0em 2rem;\n  margin: 0em 0em 0em 2rem;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------\n     Internal\n---------------*/\n\n.ui.left.internal.rail {\n  left: 0%;\n  right: auto;\n  padding: 0em 0em 0em 2rem;\n  margin: 0em 0em 0em 2rem;\n}\n\n.ui.right.internal.rail {\n  left: auto;\n  right: 0%;\n  padding: 0em 2rem 0em 0em;\n  margin: 0em 2rem 0em 0em;\n}\n\n/*--------------\n     Divided\n---------------*/\n\n.ui.left.dividing.rail {\n  padding: 0em 2.5rem 0em 0em;\n  margin: 0em 2.5rem 0em 0em;\n  border-right: 1px solid rgba(39, 41, 43, 0.15);\n}\n\n.ui.right.dividing.rail {\n  border-left: 1px solid rgba(39, 41, 43, 0.15);\n  padding: 0em 0em 0em 2.5rem;\n  margin: 0em 0em 0em 2.5rem;\n}\n\n/*--------------\n    Distance\n---------------*/\n\n.ui.close.left.rail {\n  padding: 0em 1em 0em 0em;\n  margin: 0em 1em 0em 0em;\n}\n\n.ui.close.right.rail {\n  padding: 0em 0em 0em 1em;\n  margin: 0em 0em 0em 1em;\n}\n\n.ui.very.close.left.rail {\n  padding: 0em 0.5em 0em 0em;\n  margin: 0em 0.5em 0em 0em;\n}\n\n.ui.very.close.right.rail {\n  padding: 0em 0em 0em 0.5em;\n  margin: 0em 0em 0em 0.5em;\n}\n\n/*--------------\n    Attached\n---------------*/\n\n.ui.attached.left.rail,\n.ui.attached.right.rail {\n  padding: 0em;\n  margin: 0em;\n}\n\n/*--------------\n     Sizing\n---------------*/\n\n.ui.rail {\n  font-size: 1em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Reveal\n*******************************/\n\n.ui.reveal {\n  display: inline-block;\n  position: relative !important;\n  font-size: 0em !important;\n}\n\n.ui.reveal > .visible.content {\n  position: absolute !important;\n  top: 0em !important;\n  left: 0em !important;\n  z-index: 3 !important;\n  -webkit-transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n}\n\n.ui.reveal > .hidden.content {\n  position: relative !important;\n  z-index: 2 !important;\n}\n\n/* Make sure hovered element is on top of other reveal */\n\n.ui.reveal:hover .visible.content {\n  z-index: 4 !important;\n}\n\n/*******************************\n              Types\n*******************************/\n\n/*--------------\n      Slide\n---------------*/\n\n.ui.slide.reveal {\n  position: relative !important;\n  overflow: hidden !important;\n  white-space: nowrap;\n}\n\n.ui.slide.reveal > .content {\n  display: block;\n  float: left;\n  margin: 0em;\n  -webkit-transition: -webkit-transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n}\n\n.ui.slide.reveal > .visible.content {\n  position: relative !important;\n}\n\n.ui.slide.reveal > .hidden.content {\n  position: absolute !important;\n  left: 0% !important;\n  width: 100% !important;\n  -webkit-transform: translateX(100%) !important;\n  -ms-transform: translateX(100%) !important;\n  transform: translateX(100%) !important;\n}\n\n.ui.slide.reveal:hover > .visible.content {\n  -webkit-transform: translateX(-100%) !important;\n  -ms-transform: translateX(-100%) !important;\n  transform: translateX(-100%) !important;\n}\n\n.ui.slide.reveal:hover > .hidden.content {\n  -webkit-transform: translateX(0%) !important;\n  -ms-transform: translateX(0%) !important;\n  transform: translateX(0%) !important;\n}\n\n.ui.slide.right.reveal > .visible.content {\n  -webkit-transform: translateX(0%) !important;\n  -ms-transform: translateX(0%) !important;\n  transform: translateX(0%) !important;\n}\n\n.ui.slide.right.reveal > .hidden.content {\n  -webkit-transform: translateX(-100%) !important;\n  -ms-transform: translateX(-100%) !important;\n  transform: translateX(-100%) !important;\n}\n\n.ui.slide.right.reveal:hover > .visible.content {\n  -webkit-transform: translateX(100%) !important;\n  -ms-transform: translateX(100%) !important;\n  transform: translateX(100%) !important;\n}\n\n.ui.slide.right.reveal:hover > .hidden.content {\n  -webkit-transform: translateX(0%) !important;\n  -ms-transform: translateX(0%) !important;\n  transform: translateX(0%) !important;\n}\n\n.ui.slide.up.reveal > .hidden.content {\n  -webkit-transform: translateY(100%) !important;\n  -ms-transform: translateY(100%) !important;\n  transform: translateY(100%) !important;\n}\n\n.ui.slide.up.reveal:hover > .visible.content {\n  -webkit-transform: translateY(-100%) !important;\n  -ms-transform: translateY(-100%) !important;\n  transform: translateY(-100%) !important;\n}\n\n.ui.slide.up.reveal:hover > .hidden.content {\n  -webkit-transform: translateY(0%) !important;\n  -ms-transform: translateY(0%) !important;\n  transform: translateY(0%) !important;\n}\n\n.ui.slide.down.reveal > .hidden.content {\n  -webkit-transform: translateY(-100%) !important;\n  -ms-transform: translateY(-100%) !important;\n  transform: translateY(-100%) !important;\n}\n\n.ui.slide.down.reveal:hover > .visible.content {\n  -webkit-transform: translateY(100%) !important;\n  -ms-transform: translateY(100%) !important;\n  transform: translateY(100%) !important;\n}\n\n.ui.slide.down.reveal:hover > .hidden.content {\n  -webkit-transform: translateY(0%) !important;\n  -ms-transform: translateY(0%) !important;\n  transform: translateY(0%) !important;\n}\n\n/*--------------\n      Fade\n---------------*/\n\n.ui.fade.reveal > .visible.content {\n  opacity: 1;\n}\n\n.ui.fade.reveal:hover > .visible.content {\n  opacity: 0;\n}\n\n/*--------------\n      Move\n---------------*/\n\n.ui.move.reveal {\n  position: relative !important;\n  overflow: hidden !important;\n  white-space: nowrap;\n}\n\n.ui.move.reveal > .content {\n  display: block;\n  float: left;\n  margin: 0em;\n  -webkit-transition: -webkit-transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n  transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1) 0.15s;\n}\n\n.ui.move.reveal > .visible.content {\n  position: relative !important;\n}\n\n.ui.move.reveal > .hidden.content {\n  position: absolute !important;\n  left: 0% !important;\n  width: 100% !important;\n}\n\n.ui.move.reveal:hover > .visible.content {\n  -webkit-transform: translateX(-100%) !important;\n  -ms-transform: translateX(-100%) !important;\n  transform: translateX(-100%) !important;\n}\n\n.ui.move.right.reveal:hover > .visible.content {\n  -webkit-transform: translateX(100%) !important;\n  -ms-transform: translateX(100%) !important;\n  transform: translateX(100%) !important;\n}\n\n.ui.move.up.reveal:hover > .visible.content {\n  -webkit-transform: translateY(-100%) !important;\n  -ms-transform: translateY(-100%) !important;\n  transform: translateY(-100%) !important;\n}\n\n.ui.move.down.reveal:hover > .visible.content {\n  -webkit-transform: translateY(100%) !important;\n  -ms-transform: translateY(100%) !important;\n  transform: translateY(100%) !important;\n}\n\n/*--------------\n     Rotate\n---------------*/\n\n.ui.rotate.reveal > .visible.content {\n  -webkit-transition-duration: 0.8s;\n  transition-duration: 0.8s;\n  -webkit-transform: rotate(0deg);\n  -ms-transform: rotate(0deg);\n  transform: rotate(0deg);\n}\n\n.ui.rotate.reveal > .visible.content,\n.ui.rotate.right.reveal > .visible.content {\n  -webkit-transform-origin: bottom right;\n  -ms-transform-origin: bottom right;\n  transform-origin: bottom right;\n}\n\n.ui.rotate.reveal:hover > .visible.content,\n.ui.rotate.right.reveal:hover > .visible.content {\n  -webkit-transform: rotate(110deg);\n  -ms-transform: rotate(110deg);\n  transform: rotate(110deg);\n}\n\n.ui.rotate.left.reveal > .visible.content {\n  -webkit-transform-origin: bottom left;\n  -ms-transform-origin: bottom left;\n  transform-origin: bottom left;\n}\n\n.ui.rotate.left.reveal:hover > .visible.content {\n  -webkit-transform: rotate(-110deg);\n  -ms-transform: rotate(-110deg);\n  transform: rotate(-110deg);\n}\n\n/*******************************\n              States\n*******************************/\n\n.ui.disabled.reveal {\n  opacity: 1 !important;\n}\n\n.ui.disabled.reveal > .content {\n  -webkit-transition: none !important;\n  transition: none !important;\n}\n\n.ui.disabled.reveal:hover > .visible.content {\n  position: static !important;\n  display: block !important;\n  opacity: 1 !important;\n  top: 0 !important;\n  left: 0 !important;\n  right: auto !important;\n  bottom: auto !important;\n  -webkit-transform: none !important;\n  -ms-transform: none !important;\n  transform: none !important;\n}\n\n.ui.disabled.reveal:hover > .hidden.content {\n  display: none !important;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------\n     Masked\n---------------*/\n\n.ui.masked.reveal {\n  overflow: hidden;\n}\n\n/*--------------\n     Instant\n---------------*/\n\n.ui.instant.reveal > .content {\n  -webkit-transition-delay: 0s !important;\n  transition-delay: 0s !important;\n}\n\n/*--------------\n     Sizing\n---------------*/\n\n.ui.reveal > .content {\n  font-size: 1rem !important;\n}\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Segment\n*******************************/\n\n.ui.segment {\n  position: relative;\n  background-color: #ffffff;\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15), 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n  margin: 1rem 0em;\n  padding: 1em 1em;\n  border-radius: 0.2857rem;\n  border: none;\n}\n\n.ui.segment:first-child {\n  margin-top: 0em;\n}\n\n.ui.segment:last-child {\n  margin-bottom: 0em;\n}\n\n.ui.segment:after {\n  content: \'\';\n  display: block;\n  height: 0px;\n  clear: both;\n  visibility: hidden;\n}\n\n/* Vertical */\n\n.ui[class*="vertical segment"] {\n  margin: 0em;\n  padding-left: 0em;\n  padding-right: 0em;\n  background-color: transparent;\n  border-radius: 0px;\n  border: none;\n  box-shadow: 0px 1px 0px rgba(39, 41, 43, 0.15);\n}\n\n.ui[class*="vertical segment"]:first-child {\n  padding-top: 0em;\n}\n\n.ui[class*="vertical segment"]:last-child {\n  padding-bottom: 0em;\n  box-shadow: none;\n}\n\n/* Horizontal */\n\n.ui[class*="horizontal segment"] {\n  margin: 0em;\n  padding-top: 0em;\n  padding-bottom: 0em;\n  background-color: transparent;\n  border-radius: 0px;\n  border: none;\n  box-shadow: 1px 0px 0px rgba(39, 41, 43, 0.15);\n}\n\n/*-------------------\n    Loose Coupling\n--------------------*/\n\n/* Header */\n\n.ui.inverted.segment > .ui.header {\n  color: #ffffff;\n}\n\n/* Label */\n\n.ui[class*="bottom attached"].segment > [class*="top attached"].label {\n  border-top-left-radius: 0em;\n  border-top-right-radius: 0em;\n}\n\n.ui[class*="top attached"].segment > [class*="bottom attached"].label {\n  border-bottom-left-radius: 0em;\n  border-bottom-right-radius: 0em;\n}\n\n.ui.attached.segment:not(.top):not(.bottom) > [class*="top attached"].label {\n  border-top-left-radius: 0em;\n  border-top-right-radius: 0em;\n}\n\n.ui.attached.segment:not(.top):not(.bottom) > [class*="bottom attached"].label {\n  border-bottom-left-radius: 0em;\n  border-bottom-right-radius: 0em;\n}\n\n/* Grid */\n\n.ui.page.grid.segment,\n.ui.grid .ui.segment.column {\n  padding-top: 2em;\n  padding-bottom: 2em;\n}\n\n.ui.grid.segment {\n  margin: 1rem 0rem;\n  border-radius: 0.2857rem;\n}\n\n/* Table */\n\n.ui.basic.table.segment {\n  background: #ffffff;\n  border: none;\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15), 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n}\n\n.ui[class*="very basic"].table.segment {\n  padding: 1em 1em;\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*-------------------\n        Piled\n--------------------*/\n\n.ui.piled.segment {\n  margin: 3em 0em;\n  box-shadow: 0px 0px 1px 1px rgba(39, 41, 43, 0.15);\n  z-index: auto;\n}\n\n.ui.piled.segment:first-child {\n  margin-top: 0em;\n}\n\n.ui.piled.segment:last-child {\n  margin-bottom: 0em;\n}\n\n.ui.piled.segment:after,\n.ui.piled.segment:before {\n  background-color: #ffffff;\n  visibility: visible;\n  content: \'\';\n  display: block;\n  height: 100%;\n  left: 0px;\n  position: absolute;\n  width: 100%;\n  box-shadow: 0px 0px 1px 1px rgba(39, 41, 43, 0.15);\n}\n\n.ui.piled.segment:after {\n  -webkit-transform: rotate(1.2deg);\n  -ms-transform: rotate(1.2deg);\n  transform: rotate(1.2deg);\n  top: 0;\n  z-index: -1;\n}\n\n.ui.piled.segment:before {\n  -webkit-transform: rotate(-1.2deg);\n  -ms-transform: rotate(-1.2deg);\n  transform: rotate(-1.2deg);\n  top: 0;\n  z-index: -2;\n}\n\n/* Piled Attached */\n\n.ui[class*="top attached"].piled.segment {\n  margin-top: 3em;\n  margin-bottom: 0em;\n}\n\n.ui.piled.segment[class*="top attached"]:first-child {\n  margin-top: 0em;\n}\n\n.ui.piled.segment[class*="bottom attached"] {\n  margin-top: 0em;\n  margin-bottom: 3em;\n}\n\n.ui.piled.segment[class*="bottom attached"]:last-child {\n  margin-bottom: 0em;\n}\n\n/*-------------------\n       Stacked\n--------------------*/\n\n.ui.stacked.segment {\n  padding-bottom: 1.4em;\n}\n\n.ui.stacked.segment:after,\n.ui.stacked.segment:before {\n  content: \'\';\n  position: absolute;\n  bottom: -3px;\n  left: 0%;\n  border-top: 1px solid rgba(39, 41, 43, 0.15);\n  background-color: rgba(0, 0, 0, 0.03);\n  width: 100%;\n  height: 6px;\n  visibility: visible;\n}\n\n.ui.stacked.segment:before {\n  display: none;\n}\n\n/* Add additional page */\n\n.ui.tall.stacked.segment:before {\n  display: block;\n  bottom: 0px;\n}\n\n/* Inverted */\n\n.ui.stacked.inverted.segment:after,\n.ui.stacked.inverted.segment:before {\n  background-color: rgba(0, 0, 0, 0.03);\n  border-top: 1px solid rgba(39, 41, 43, 0.3);\n}\n\n/*-------------------\n       Compact\n--------------------*/\n\n.ui.compact.segment {\n  display: table;\n}\n\n/*-------------------\n       Circular\n--------------------*/\n\n.ui.circular.segment {\n  display: table-cell;\n  padding: 2em;\n  text-align: center;\n  vertical-align: middle;\n  border-radius: 500em;\n}\n\n/*-------------------\n       Raised\n--------------------*/\n\n.ui.raised.segment {\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15), 0px 1px 4px 0px rgba(0, 0, 0, 0.15);\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------\n    Disabled\n---------------*/\n\n.ui.disabled.segment {\n  opacity: 0.3;\n  color: rgba(40, 40, 40, 0.3);\n}\n\n/*--------------\n    Loading\n---------------*/\n\n.ui.loading.segment {\n  position: relative;\n  cursor: default;\n  point-events: none;\n  text-shadow: none !important;\n  color: transparent !important;\n  -webkit-transition: all 0s linear;\n  transition: all 0s linear;\n}\n\n.ui.loading.segment:before {\n  position: absolute;\n  content: \'\';\n  top: 0%;\n  left: 0%;\n  background: rgba(255, 255, 255, 0.8);\n  width: 100%;\n  height: 100%;\n  border-radius: 0.2857rem;\n  z-index: 100;\n}\n\n.ui.loading.segment:after {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: 50%;\n  margin: -1.5em 0em 0em -1.5em;\n  width: 3em;\n  height: 3em;\n  -webkit-animation: segment-spin 0.6s linear;\n  animation: segment-spin 0.6s linear;\n  -webkit-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n  border-radius: 500rem;\n  border-color: #aaaaaa rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1);\n  border-style: solid;\n  border-width: 0.2em;\n  box-shadow: 0px 0px 0px 1px transparent;\n  visibility: visible;\n  z-index: 101;\n}\n\n@-webkit-keyframes segment-spin {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n@keyframes segment-spin {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-------------------\n       Basic\n--------------------*/\n\n.ui.basic.segment {\n  position: relative;\n  background-color: transparent;\n  box-shadow: none;\n  border-radius: 0px;\n}\n\n.ui.basic.segment:first-child {\n  padding-top: 0em;\n}\n\n.ui.basic.segment:last-child {\n  padding-bottom: 0em;\n}\n\n/*-------------------\n       Fittted\n--------------------*/\n\n.ui.fitted.segment {\n  padding: 0em;\n}\n\n/*-------------------\n       Colors\n--------------------*/\n\n.ui.black.segment:not(.inverted) {\n  border-top: 2px solid #1b1c1d;\n}\n\n.ui.blue.segment:not(.inverted) {\n  border-top: 2px solid #3b83c0;\n}\n\n.ui.green.segment:not(.inverted) {\n  border-top: 2px solid #5bbd72;\n}\n\n.ui.orange.segment:not(.inverted) {\n  border-top: 2px solid #e07b53;\n}\n\n.ui.pink.segment:not(.inverted) {\n  border-top: 2px solid #d9499a;\n}\n\n.ui.purple.segment:not(.inverted) {\n  border-top: 2px solid #564f8a;\n}\n\n.ui.red.segment:not(.inverted) {\n  border-top: 2px solid #d95c5c;\n}\n\n.ui.teal.segment:not(.inverted) {\n  border-top: 2px solid #00b5ad;\n}\n\n.ui.yellow.segment:not(.inverted) {\n  border-top: 2px solid #f2c61f;\n}\n\n.ui.black.segment:not(.inverted):not(.attached) {\n  border-top-left-radius: 0.2857rem !important;\n  border-top-right-radius: 0.2857rem !important;\n}\n\n.ui.blue.segment:not(.inverted):not(.attached) {\n  border-top-left-radius: 0.2857rem !important;\n  border-top-right-radius: 0.2857rem !important;\n}\n\n.ui.green.segment:not(.inverted):not(.attached) {\n  border-top-left-radius: 0.2857rem !important;\n  border-top-right-radius: 0.2857rem !important;\n}\n\n.ui.orange.segment:not(.inverted):not(.attached) {\n  border-top-left-radius: 0.2857rem !important;\n  border-top-right-radius: 0.2857rem !important;\n}\n\n.ui.pink.segment:not(.inverted):not(.attached) {\n  border-top-left-radius: 0.2857rem !important;\n  border-top-right-radius: 0.2857rem !important;\n}\n\n.ui.purple.segment:not(.inverted):not(.attached) {\n  border-top-left-radius: 0.2857rem !important;\n  border-top-right-radius: 0.2857rem !important;\n}\n\n.ui.red.segment:not(.inverted):not(.attached) {\n  border-top-left-radius: 0.2857rem !important;\n  border-top-right-radius: 0.2857rem !important;\n}\n\n.ui.teal.segment:not(.inverted):not(.attached) {\n  border-top-left-radius: 0.2857rem !important;\n  border-top-right-radius: 0.2857rem !important;\n}\n\n.ui.yellow.segment:not(.inverted):not(.attached) {\n  border-top-left-radius: 0.2857rem !important;\n  border-top-right-radius: 0.2857rem !important;\n}\n\n/*-------------------\n   Inverted Colors\n--------------------*/\n\n.ui.inverted.segment,\n.ui.inverted.black.segment {\n  background-color: #1b1c1d !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.blue.segment {\n  background-color: #3b83c0 !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.green.segment {\n  background-color: #5bbd72 !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.orange.segment {\n  background-color: #e07b53 !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.pink.segment {\n  background-color: #d9499a !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.purple.segment {\n  background-color: #564f8a !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.red.segment {\n  background-color: #d95c5c !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.teal.segment {\n  background-color: #00b5ad !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.yellow.segment {\n  background-color: #f2c61f !important;\n  color: #ffffff !important;\n}\n\n/*-------------------\n       Aligned\n--------------------*/\n\n.ui[class*="left aligned"].segment {\n  text-align: left;\n}\n\n.ui[class*="right aligned"].segment {\n  text-align: right;\n}\n\n.ui[class*="center aligned"].segment {\n  text-align: center;\n}\n\n/*-------------------\n       Floated\n--------------------*/\n\n.ui.floated.segment,\n.ui[class*="left floated"].segment {\n  float: left;\n  margin-right: 1rem;\n}\n\n.ui[class*="right floated"].segment {\n  float: right;\n  margin-left: 1rem;\n}\n\n/*-------------------\n      Inverted\n--------------------*/\n\n.ui.inverted.segment {\n  border: none;\n  box-shadow: none;\n}\n\n.ui.inverted.segment .segment {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.inverted.segment .inverted.segment {\n  color: #ffffff;\n}\n\n.ui.inverted.segment,\n.ui.primary.inverted.segment {\n  background-color: #1b1c1d;\n  color: #ffffff;\n}\n\n.ui.inverted.block.segment,\n.ui.inverted.attached.segment {\n  border-color: #555555;\n}\n\n/*-------------------\n     Ordinality\n--------------------*/\n\n.ui.secondary.segment {\n  background: #faf9fa;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.tertiary.segment {\n  background: #ebebeb;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.secondary.inverted.segment {\n  background: -webkit-linear-gradient(rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.3) 100%);\n  background: linear-gradient(rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.3) 100%);\n  color: #fafafa;\n}\n\n.ui.tertiary.inverted.segment {\n  background: -webkit-linear-gradient(rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.5) 100%);\n  background: linear-gradient(rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.5) 100%);\n  color: #f0f0f0;\n}\n\n/*-------------------\n      Attached\n--------------------*/\n\n.ui.segment.attached {\n  top: 0px;\n  bottom: 0px;\n  margin: 0em -1px;\n  width: -webkit-calc(100% +  2px );\n  width: calc(100% +  2px );\n  max-width: -webkit-calc(100% +  2px );\n  max-width: calc(100% +  2px );\n  border-radius: 0px;\n  box-shadow: none;\n  border: 1px solid #d4d4d5;\n}\n\n.ui.segment.attached + .ui.segment.attached:not(.top) {\n  border-top: none;\n}\n\n/* Top */\n\n.ui[class*="top attached"].segment {\n  top: 0px;\n  bottom: 0px;\n  margin-top: 1rem;\n  margin-bottom: 0em;\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n}\n\n.ui.segment[class*="top attached"]:first-child {\n  margin-top: 0em;\n}\n\n/* Bottom */\n\n.ui.segment[class*="bottom attached"] {\n  top: 0px;\n  bottom: 0px;\n  margin-top: 0em;\n  margin-bottom: 1rem;\n  box-shadow: none, 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n.ui.segment[class*="bottom attached"]:last-child {\n  margin-bottom: 0em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Step\n*******************************/\n\n.ui.steps .step {\n  display: inline-block;\n  position: relative;\n  margin: 0em 0em;\n  padding: 0.9285em 1.5em 0.9285em 2.25em;\n  vertical-align: top;\n  background: #ffffff;\n  color: rgba(0, 0, 0, 0.8);\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15);\n  border-radius: 0em;\n}\n\n.ui.steps .step:after {\n  position: absolute;\n  z-index: 2;\n  content: \'\';\n  top: 50%;\n  right: 0em;\n  border: medium none;\n  background-color: #ffffff;\n  width: 1.5em;\n  height: 1.5em;\n  border-bottom: 1px solid rgba(39, 41, 43, 0.15);\n  border-right: 1px solid rgba(39, 41, 43, 0.15);\n  -webkit-transform: translateY(-50%) translateX(50%) rotate(-45deg);\n  -ms-transform: translateY(-50%) translateX(50%) rotate(-45deg);\n  transform: translateY(-50%) translateX(50%) rotate(-45deg);\n}\n\n.ui.steps .step,\n.ui.steps .step:after {\n  -webkit-transition: background-color 0.2s ease, opacity 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;\n  transition: background-color 0.2s ease, opacity 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;\n}\n\n/*******************************\n            Content\n*******************************/\n\n/* Title */\n\n.ui.steps .step .title {\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-size: 1.0714em;\n  font-weight: bold;\n}\n\n/* Description */\n\n.ui.steps .step .description {\n  font-weight: normal;\n  font-size: 0.9285em;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.steps .step .title ~ .description {\n  margin-top: 0.1em;\n}\n\n/* Icon */\n\n.ui.steps .step > .icon,\n.ui.steps .step > .icon ~ .content {\n  display: table-cell;\n  vertical-align: middle;\n}\n\n.ui.steps .step > .icon {\n  font-size: 2em;\n  margin: 0em;\n  padding-right: 0.6em;\n}\n\n/* Link */\n\n.ui.steps .link.step,\n.ui.steps a.step {\n  cursor: pointer;\n}\n\n/*******************************\n            Types\n*******************************/\n\n/*--------------\n     Ordered\n---------------*/\n\n.ui.ordered.steps {\n  counter-reset: ordered;\n}\n\n.ui.ordered.steps .step:before {\n  display: table-cell;\n  position: static;\n  padding-right: 0.6em;\n  font-size: 2em;\n  counter-increment: ordered;\n  content: counters(ordered, ".");\n}\n\n.ui.ordered.steps .step > * {\n  display: table-cell;\n  vertical-align: middle;\n}\n\n/*--------------\n    Vertical\n---------------*/\n\n.ui.vertical.steps {\n  overflow: visible;\n}\n\n.ui.vertical.steps .step {\n  display: block;\n  border-radius: 0em;\n  padding: 0.9285em 1.5em;\n}\n\n.ui.vertical.steps .step:first-child {\n  padding: 0.9285em 1.5em;\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n}\n\n.ui.vertical.steps .step:last-child {\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n/* Arrow */\n\n.ui.vertical.steps .step:after {\n  display: none;\n}\n\n/* Active Arrow */\n\n.ui.vertical.steps .active.step:after {\n  display: block;\n}\n\n/*******************************\n            Group\n*******************************/\n\n.ui.steps {\n  display: inline-block;\n  font-size: 0em;\n  background: \'\';\n  box-shadow: \'\';\n  line-height: 1.142rem;\n  box-sizing: border-box;\n  border-radius: 0.2857rem;\n}\n\n.ui.steps .step:first-child {\n  padding-left: 1.5em;\n  border-radius: 0.2857rem 0em 0em 0.2857rem;\n}\n\n.ui.steps .step:last-child {\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n}\n\n.ui.steps .step:only-child {\n  border-radius: 0.2857rem;\n}\n\n.ui.steps .step:last-child {\n  margin-right: 0em;\n}\n\n.ui.steps .step:last-child:after {\n  display: none;\n}\n\n/*******************************\n             States\n*******************************/\n\n/* Link Hover */\n\n.ui.steps .link.step:hover::after,\n.ui.steps .link.step:hover,\n.ui.steps a.step:hover::after,\n.ui.steps a.step:hover {\n  background: #fafafa;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Link Down */\n\n.ui.steps .link.step:active::after,\n.ui.steps .link.step:active,\n.ui.steps a.step:active::after,\n.ui.steps a.step:active {\n  background: #f0f0f0;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Active */\n\n.ui.steps .step.active {\n  cursor: auto;\n  background: #f0f0f0;\n}\n\n.ui.steps .step.active:after {\n  background: #f0f0f0;\n}\n\n.ui.steps .step.active .title {\n  color: #009fda;\n}\n\n.ui.ordered.steps .step.active:before,\n.ui.steps .active.step .icon {\n  color: rgba(0, 0, 0, 0.85);\n}\n\n/* Active Hover */\n\n.ui.steps .link.active.step:hover::after,\n.ui.steps .link.active.step:hover,\n.ui.steps a.active.step:hover::after,\n.ui.steps a.active.step:hover {\n  cursor: pointer;\n  background: #ececec;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Completed */\n\n.ui.steps .step.completed > .icon:before,\n.ui.ordered.steps .step.completed:before {\n  color: #5bbd72;\n}\n\n/* Disabled */\n\n.ui.steps .disabled.step {\n  cursor: auto;\n  background: #ffffff;\n  pointer-events: none;\n}\n\n.ui.steps .disabled.step,\n.ui.steps .disabled.step .title,\n.ui.steps .disabled.step .description {\n  color: rgba(40, 40, 40, 0.3);\n}\n\n.ui.steps .disabled.step:after {\n  background: #ffffff;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/* Fluid */\n\n.ui.fluid.steps {\n  width: 100%;\n}\n\n/* Attached */\n\n.attached.ui.steps {\n  margin: 0em;\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n}\n\n.attached.ui.steps .step:first-child {\n  border-radius: 0.2857rem 0em 0em 0em;\n}\n\n.attached.ui.steps .step:last-child {\n  border-radius: 0em 0.2857rem 0em 0em;\n}\n\n/* Bottom Side */\n\n.bottom.attached.ui.steps {\n  margin-top: -1px;\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n.bottom.attached.ui.steps .step:first-child {\n  border-radius: 0em 0em 0em 0.2857rem;\n}\n\n.bottom.attached.ui.steps .step:last-child {\n  border-radius: 0em 0em 0.2857rem 0em;\n}\n\n/* Evenly divided  */\n\n.ui.one.steps,\n.ui.two.steps,\n.ui.three.steps,\n.ui.four.steps,\n.ui.five.steps,\n.ui.six.steps,\n.ui.seven.steps,\n.ui.eight.steps {\n  display: block;\n}\n\n.ui.one.steps > .step {\n  width: 100%;\n}\n\n.ui.two.steps > .step {\n  width: 50%;\n}\n\n.ui.three.steps > .step {\n  width: 33.333%;\n}\n\n.ui.four.steps > .step {\n  width: 25%;\n}\n\n.ui.five.steps > .step {\n  width: 20%;\n}\n\n.ui.six.steps > .step {\n  width: 16.666%;\n}\n\n.ui.seven.steps > .step {\n  width: 14.285%;\n}\n\n.ui.eight.steps > .step {\n  width: 12.500%;\n}\n\n/*******************************\n             Sizes\n*******************************/\n\n.ui.small.step,\n.ui.small.steps .step {\n  font-size: 0.92857143rem;\n}\n\n.ui.step,\n.ui.steps .step {\n  font-size: 1rem;\n}\n\n.ui.large.step,\n.ui.large.steps .step {\n  font-size: 1.14285714rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n@font-face {\n  font-family: \'Step\';\n  src: url(data:application/x-font-ttf;charset=utf-8;;base64,AAEAAAAOAIAAAwBgT1MvMj3hSQEAAADsAAAAVmNtYXDQEhm3AAABRAAAAUpjdnQgBkn/lAAABuwAAAAcZnBnbYoKeDsAAAcIAAAJkWdhc3AAAAAQAAAG5AAAAAhnbHlm32cEdgAAApAAAAC2aGVhZAErPHsAAANIAAAANmhoZWEHUwNNAAADgAAAACRobXR4CykAAAAAA6QAAAAMbG9jYQA4AFsAAAOwAAAACG1heHAApgm8AAADuAAAACBuYW1lzJ0aHAAAA9gAAALNcG9zdK69QJgAAAaoAAAAO3ByZXCSoZr/AAAQnAAAAFYAAQO4AZAABQAIAnoCvAAAAIwCegK8AAAB4AAxAQIAAAIABQMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUGZFZABA6ADoAQNS/2oAWgMLAE8AAAABAAAAAAAAAAAAAwAAAAMAAAAcAAEAAAAAAEQAAwABAAAAHAAEACgAAAAGAAQAAQACAADoAf//AAAAAOgA//8AABgBAAEAAAAAAAAAAAEGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAADpAKYABUAHEAZDwEAAQFCAAIBAmoAAQABagAAAGEUFxQDEisBFAcBBiInASY0PwE2Mh8BATYyHwEWA6QP/iAQLBD+6g8PTBAsEKQBbhAsEEwPAhYWEP4gDw8BFhAsEEwQEKUBbxAQTBAAAAH//f+xA18DCwAMABJADwABAQpDAAAACwBEFRMCESsBFA4BIi4CPgEyHgEDWXLG6MhuBnq89Lp+AV51xHR0xOrEdHTEAAAAAAEAAAABAADDeRpdXw889QALA+gAAAAAzzWYjQAAAADPNWBN//3/sQOkAwsAAAAIAAIAAAAAAAAAAQAAA1L/agBaA+gAAP/3A6QAAQAAAAAAAAAAAAAAAAAAAAMD6AAAA+gAAANZAAAAAAAAADgAWwABAAAAAwAWAAEAAAAAAAIABgATAG4AAAAtCZEAAAAAAAAAEgDeAAEAAAAAAAAANQAAAAEAAAAAAAEACAA1AAEAAAAAAAIABwA9AAEAAAAAAAMACABEAAEAAAAAAAQACABMAAEAAAAAAAUACwBUAAEAAAAAAAYACABfAAEAAAAAAAoAKwBnAAEAAAAAAAsAEwCSAAMAAQQJAAAAagClAAMAAQQJAAEAEAEPAAMAAQQJAAIADgEfAAMAAQQJAAMAEAEtAAMAAQQJAAQAEAE9AAMAAQQJAAUAFgFNAAMAAQQJAAYAEAFjAAMAAQQJAAoAVgFzAAMAAQQJAAsAJgHJQ29weXJpZ2h0IChDKSAyMDE0IGJ5IG9yaWdpbmFsIGF1dGhvcnMgQCBmb250ZWxsby5jb21mb250ZWxsb1JlZ3VsYXJmb250ZWxsb2ZvbnRlbGxvVmVyc2lvbiAxLjBmb250ZWxsb0dlbmVyYXRlZCBieSBzdmcydHRmIGZyb20gRm9udGVsbG8gcHJvamVjdC5odHRwOi8vZm9udGVsbG8uY29tAEMAbwBwAHkAcgBpAGcAaAB0ACAAKABDACkAIAAyADAAMQA0ACAAYgB5ACAAbwByAGkAZwBpAG4AYQBsACAAYQB1AHQAaABvAHIAcwAgAEAAIABmAG8AbgB0AGUAbABsAG8ALgBjAG8AbQBmAG8AbgB0AGUAbABsAG8AUgBlAGcAdQBsAGEAcgBmAG8AbgB0AGUAbABsAG8AZgBvAG4AdABlAGwAbABvAFYAZQByAHMAaQBvAG4AIAAxAC4AMABmAG8AbgB0AGUAbABsAG8ARwBlAG4AZQByAGEAdABlAGQAIABiAHkAIABzAHYAZwAyAHQAdABmACAAZgByAG8AbQAgAEYAbwBuAHQAZQBsAGwAbwAgAHAAcgBvAGoAZQBjAHQALgBoAHQAdABwADoALwAvAGYAbwBuAHQAZQBsAGwAbwAuAGMAbwBtAAAAAAIAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAQIBAwljaGVja21hcmsGY2lyY2xlAAAAAAEAAf//AA8AAAAAAAAAAAAAAAAAAAAAADIAMgML/7EDC/+xsAAssCBgZi2wASwgZCCwwFCwBCZasARFW1ghIyEbilggsFBQWCGwQFkbILA4UFghsDhZWSCwCkVhZLAoUFghsApFILAwUFghsDBZGyCwwFBYIGYgiophILAKUFhgGyCwIFBYIbAKYBsgsDZQWCGwNmAbYFlZWRuwACtZWSOwAFBYZVlZLbACLCBFILAEJWFkILAFQ1BYsAUjQrAGI0IbISFZsAFgLbADLCMhIyEgZLEFYkIgsAYjQrIKAAIqISCwBkMgiiCKsAArsTAFJYpRWGBQG2FSWVgjWSEgsEBTWLAAKxshsEBZI7AAUFhlWS2wBCywB0MrsgACAENgQi2wBSywByNCIyCwACNCYbCAYrABYLAEKi2wBiwgIEUgsAJFY7ABRWJgRLABYC2wBywgIEUgsAArI7ECBCVgIEWKI2EgZCCwIFBYIbAAG7AwUFiwIBuwQFlZI7AAUFhlWbADJSNhRESwAWAtsAgssQUFRbABYUQtsAkssAFgICCwCUNKsABQWCCwCSNCWbAKQ0qwAFJYILAKI0JZLbAKLCC4BABiILgEAGOKI2GwC0NgIIpgILALI0IjLbALLEtUWLEHAURZJLANZSN4LbAMLEtRWEtTWLEHAURZGyFZJLATZSN4LbANLLEADENVWLEMDEOwAWFCsAorWbAAQ7ACJUKxCQIlQrEKAiVCsAEWIyCwAyVQWLEBAENgsAQlQoqKIIojYbAJKiEjsAFhIIojYbAJKiEbsQEAQ2CwAiVCsAIlYbAJKiFZsAlDR7AKQ0dgsIBiILACRWOwAUViYLEAABMjRLABQ7AAPrIBAQFDYEItsA4ssQAFRVRYALAMI0IgYLABYbUNDQEACwBCQopgsQ0FK7BtKxsiWS2wDyyxAA4rLbAQLLEBDistsBEssQIOKy2wEiyxAw4rLbATLLEEDistsBQssQUOKy2wFSyxBg4rLbAWLLEHDistsBcssQgOKy2wGCyxCQ4rLbAZLLAIK7EABUVUWACwDCNCIGCwAWG1DQ0BAAsAQkKKYLENBSuwbSsbIlktsBossQAZKy2wGyyxARkrLbAcLLECGSstsB0ssQMZKy2wHiyxBBkrLbAfLLEFGSstsCAssQYZKy2wISyxBxkrLbAiLLEIGSstsCMssQkZKy2wJCwgPLABYC2wJSwgYLANYCBDI7ABYEOwAiVhsAFgsCQqIS2wJiywJSuwJSotsCcsICBHICCwAkVjsAFFYmAjYTgjIIpVWCBHICCwAkVjsAFFYmAjYTgbIVktsCgssQAFRVRYALABFrAnKrABFTAbIlktsCkssAgrsQAFRVRYALABFrAnKrABFTAbIlktsCosIDWwAWAtsCssALADRWOwAUVisAArsAJFY7ABRWKwACuwABa0AAAAAABEPiM4sSoBFSotsCwsIDwgRyCwAkVjsAFFYmCwAENhOC2wLSwuFzwtsC4sIDwgRyCwAkVjsAFFYmCwAENhsAFDYzgtsC8ssQIAFiUgLiBHsAAjQrACJUmKikcjRyNhIFhiGyFZsAEjQrIuAQEVFCotsDAssAAWsAQlsAQlRyNHI2GwBkUrZYouIyAgPIo4LbAxLLAAFrAEJbAEJSAuRyNHI2EgsAQjQrAGRSsgsGBQWCCwQFFYswIgAyAbswImAxpZQkIjILAIQyCKI0cjRyNhI0ZgsARDsIBiYCCwACsgiophILACQ2BkI7ADQ2FkUFiwAkNhG7ADQ2BZsAMlsIBiYSMgILAEJiNGYTgbI7AIQ0awAiWwCENHI0cjYWAgsARDsIBiYCMgsAArI7AEQ2CwACuwBSVhsAUlsIBisAQmYSCwBCVgZCOwAyVgZFBYIRsjIVkjICCwBCYjRmE4WS2wMiywABYgICCwBSYgLkcjRyNhIzw4LbAzLLAAFiCwCCNCICAgRiNHsAArI2E4LbA0LLAAFrADJbACJUcjRyNhsABUWC4gPCMhG7ACJbACJUcjRyNhILAFJbAEJUcjRyNhsAYlsAUlSbACJWGwAUVjIyBYYhshWWOwAUViYCMuIyAgPIo4IyFZLbA1LLAAFiCwCEMgLkcjRyNhIGCwIGBmsIBiIyAgPIo4LbA2LCMgLkawAiVGUlggPFkusSYBFCstsDcsIyAuRrACJUZQWCA8WS6xJgEUKy2wOCwjIC5GsAIlRlJYIDxZIyAuRrACJUZQWCA8WS6xJgEUKy2wOSywMCsjIC5GsAIlRlJYIDxZLrEmARQrLbA6LLAxK4ogIDywBCNCijgjIC5GsAIlRlJYIDxZLrEmARQrsARDLrAmKy2wOyywABawBCWwBCYgLkcjRyNhsAZFKyMgPCAuIzixJgEUKy2wPCyxCAQlQrAAFrAEJbAEJSAuRyNHI2EgsAQjQrAGRSsgsGBQWCCwQFFYswIgAyAbswImAxpZQkIjIEewBEOwgGJgILAAKyCKimEgsAJDYGQjsANDYWRQWLACQ2EbsANDYFmwAyWwgGJhsAIlRmE4IyA8IzgbISAgRiNHsAArI2E4IVmxJgEUKy2wPSywMCsusSYBFCstsD4ssDErISMgIDywBCNCIzixJgEUK7AEQy6wJistsD8ssAAVIEewACNCsgABARUUEy6wLCotsEAssAAVIEewACNCsgABARUUEy6wLCotsEEssQABFBOwLSotsEIssC8qLbBDLLAAFkUjIC4gRoojYTixJgEUKy2wRCywCCNCsEMrLbBFLLIAADwrLbBGLLIAATwrLbBHLLIBADwrLbBILLIBATwrLbBJLLIAAD0rLbBKLLIAAT0rLbBLLLIBAD0rLbBMLLIBAT0rLbBNLLIAADkrLbBOLLIAATkrLbBPLLIBADkrLbBQLLIBATkrLbBRLLIAADsrLbBSLLIAATsrLbBTLLIBADsrLbBULLIBATsrLbBVLLIAAD4rLbBWLLIAAT4rLbBXLLIBAD4rLbBYLLIBAT4rLbBZLLIAADorLbBaLLIAATorLbBbLLIBADorLbBcLLIBATorLbBdLLAyKy6xJgEUKy2wXiywMiuwNistsF8ssDIrsDcrLbBgLLAAFrAyK7A4Ky2wYSywMysusSYBFCstsGIssDMrsDYrLbBjLLAzK7A3Ky2wZCywMyuwOCstsGUssDQrLrEmARQrLbBmLLA0K7A2Ky2wZyywNCuwNystsGgssDQrsDgrLbBpLLA1Ky6xJgEUKy2waiywNSuwNistsGsssDUrsDcrLbBsLLA1K7A4Ky2wbSwrsAhlsAMkUHiwARUwLQAAAEu4AMhSWLEBAY5ZuQgACABjILABI0SwAyNwsgQoCUVSRLIKAgcqsQYBRLEkAYhRWLBAiFixBgNEsSYBiFFYuAQAiFixBgFEWVlZWbgB/4WwBI2xBQBEAAA=) format(\'truetype\'), url(data:application/font-woff;charset=utf-8;base64,d09GRgABAAAAAAoUAA4AAAAAEPQAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABPUy8yAAABRAAAAEQAAABWPeFJAWNtYXAAAAGIAAAAOgAAAUrQEhm3Y3Z0IAAAAcQAAAAUAAAAHAZJ/5RmcGdtAAAB2AAABPkAAAmRigp4O2dhc3AAAAbUAAAACAAAAAgAAAAQZ2x5ZgAABtwAAACuAAAAtt9nBHZoZWFkAAAHjAAAADUAAAA2ASs8e2hoZWEAAAfEAAAAIAAAACQHUwNNaG10eAAAB+QAAAAMAAAADAspAABsb2NhAAAH8AAAAAgAAAAIADgAW21heHAAAAf4AAAAIAAAACAApgm8bmFtZQAACBgAAAF3AAACzcydGhxwb3N0AAAJkAAAACoAAAA7rr1AmHByZXAAAAm8AAAAVgAAAFaSoZr/eJxjYGTewTiBgZWBg6mKaQ8DA0MPhGZ8wGDIyMTAwMTAysyAFQSkuaYwOLxgeMHIHPQ/iyGKmZvBHyjMCJIDAPe9C2B4nGNgYGBmgGAZBkYGEHAB8hjBfBYGDSDNBqQZGZgYGF4w/v8PUvCCAURLMELVAwEjG8OIBwBk5AavAAB4nGNgQANGDEbM3P83gjAAELQD4XicnVXZdtNWFJU8ZHASOmSgoA7X3DhQ68qEKRgwaSrFdiEdHAitBB2kDHTkncc+62uOQrtWH/m07n09JLR0rbYsls++R1tn2DrnRhwjKn0aiGvUoZKXA6msPZZK90lc13Uvj5UMBnFdthJPSZuonSRKat3sUC7xWOsqWSdYJ+PlIFZPVZ5noAziFB5lSUQbRBuplyZJ4onjJ4kWZxAfJUkgJaMQp9LIUEI1GsRS1aFM6dCr1xNx00DKRqMedVhU90PFJ8c1p9SsA0YqVznCFevVRr4bpwMve5DEOsGzrYcxHnisfpQqkIqR6cg/dkpOlIaBVHHUoVbi6DCTX/eRTCrNQKaMYkWl7oG43f102xYxPXQ6vi5KlUaqurnOKJrt0fGogygP2cbppNzQ2fbw5RlTVKtdcbPtQGYNXErJbHSfRAAdJlLj6QFONZwCqRn1R8XZ588BEslclKo8VTKHegOZMzt7cTHtbiersnCknwcyb3Z2452HQ6dXh3/R+hdM4cxHj+Jifj5C+lBqfiJOJKVGWMzyp4YfcVcgQrkxiAsXyuBThDl0RdrZZl3jtTH2hs/5SqlhPQna6KP4fgr9TiQrHGdRo/VInM1j13Wt3GdQS7W7Fzsyr0OVIu7vCwuuM+eEYZ4WC1VfnvneBTT/Bohn/EDeNIVL+5YpSrRvm6JMu2iKCu0SVKVdNsUU7YoppmnPmmKG9h1TzNKeMzLj/8vc55H7HN7xkJv2XeSmfQ+5ad9HbtoPkJtWITdtHblpLyA3rUZu2lWjOnYEGgZpF1IVQdA0svph3Fab9UDWjDR8aWDyLmLI+upER521tcofxX914gsHcmmip7siF5viLq/bFj483e6rj5pG3bDV+MaR8jAeRnocmtBZ+c3hv+1N3S6a7jKqMugBFUwKwABl7UAC0zrbCaT1mqf48gdgXIZ4zkpDtVSfO4am7+V5X/exOfG+x+3GLrdcd3kJWdYNcmP28N9SZKrrH+UtrVQnR6wrJ49VaxhDKrwour6SlHu0tRu/KKmy8l6U1srnk5CbPYMbQlu27mGwI0xpyiUeXlOlKD3UUo6yQyxvKco84JSLC1qGxLgOdQ9qa8TpoXoYGwshhqG0vRBwSCldFd+0ynfxHqtr2Oj4xRXh6XpyEhGf4ir7UfBU10b96A7avGbdMoMpVaqn+4xPsa/b9lFZaaSOsxe3VAfXNOsaORXTT+Rr4HRvOGjdAz1UfDRBI1U1x+jGKGM0ljXl3wR0MVZ+w2jVYvs93E+dpFWsuUuY7JsT9+C0u/0q+7WcW0bW/dcGvW3kip8jMb8tCvw7B2K3ZA3UO5OBGAvIWdAYxhYmdxiug23EbfY/Jqf/34aFRXJXOxq7eerD1ZNRJXfZ8rjLTXZZ16M2R9VOGvsIjS0PN+bY4XIstsRgQbb+wf8x7gF3aVEC4NDIZZiI2nShnurh6h6rsW04VxIBds2x43QAegAuQd8cu9bzCYD13CPnLsB9cgh2yCH4lByCz8i5BfA5OQRfkEMwIIdgl5w7AA/IIXhIDsEeOQSPyNkE+JIcgq/IIYjJIUjIuQ3wmByCJ+QQfE0OwTdGrk5k/pYH2QD6zqKbQKmdGhzaOGRGrk3Y+zxY9oFFZB9aROqRkesT6lMeLPV7i0j9wSJSfzRyY0L9iQdL/dkiUn+xiNRnxpeZIymvDp7zjg7+BJfqrV4AAAAAAQAB//8AD3icY2BkAALmJUwzGEQZZBwk+RkZGBmdGJgYmbIYgMwsoGSiiLgIs5A2owg7I5uSOqOaiT2jmZE8I5gQY17C/09BQEfg3yt+fh8gvYQxD0j68DOJiQn8U+DnZxQDcQUEljLmCwBpBgbG/3//b2SOZ+Zm4GEQcuAH2sblDLSEm8FFVJhJEGgLH6OSHpMdo5EcI3Nk0bEXJ/LYqvZ82VXHGFd6pKTkyCsQwQAAq+QkqAAAeJxjYGRgYADiw5VSsfH8Nl8ZuJlfAEUYzpvO6IXQCb7///7fyLyEmRvI5WBgAokCAFb/DJAAAAB4nGNgZGBgDvqfxRDF/IKB4f935iUMQBEUwAwAi5YFpgPoAAAD6AAAA1kAAAAAAAAAOABbAAEAAAADABYAAQAAAAAAAgAGABMAbgAAAC0JkQAAAAB4nHWQy2rCQBSG//HSi0JbWui2sypKabxgN4IgWHTTbqS4LTHGJBIzMhkFX6Pv0IfpS/RZ+puMpShNmMx3vjlz5mQAXOMbAvnzxJGzwBmjnAs4Rc9ykf7Zcon8YrmMKt4sn9C/W67gAYHlKm7wwQqidM5ogU/LAlfi0nIBF+LOcpH+0XKJ3LNcxq14tXxC71muYCJSy1Xci6+BWm11FIRG1gZ12W62OnK6lYoqStxYumsTKp3KvpyrxPhxrBxPLfc89oN17Op9uJ8nvk4jlciW09yrkZ/42jX+bFc93QRtY+ZyrtVSDm2GXGm18D3jhMasuo3G3/MwgMIKW2hEvKoQBhI12jrnNppooUOaMkMyM8+KkMBFTONizR1htpIy7nPMGSW0PjNisgOP3+WRH5MC7o9ZRR+tHsYT0u6MKPOSfTns7jBrREqyTDezs9/eU2x4WpvWcNeuS511JTE8qCF5H7u1BY1H72S3Ymi7aPD95/9+AN1fhEsAeJxjYGKAAC4G7ICZgYGRiZGZMzkjNTk7N7Eomy05syg5J5WBAQBE1QZBAABLuADIUlixAQGOWbkIAAgAYyCwASNEsAMjcLIEKAlFUkSyCgIHKrEGAUSxJAGIUViwQIhYsQYDRLEmAYhRWLgEAIhYsQYBRFlZWVm4Af+FsASNsQUARAAA) format(\'woff\');\n}\n\n.ui.steps .step.completed > .icon:before,\n.ui.ordered.steps .step.completed:before {\n  font-family: \'Step\';\n  content: \'\e800\';\n}\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n           Breadcrumb\n*******************************/\n\n.ui.breadcrumb {\n  margin: 1em 0em;\n  display: inline-block;\n  vertical-align: middle;\n}\n\n.ui.breadcrumb:first-child {\n  margin-top: 0em;\n}\n\n.ui.breadcrumb:last-child {\n  margin-bottom: 0em;\n}\n\n/*******************************\n          Content\n*******************************/\n\n/* Divider */\n\n.ui.breadcrumb .divider {\n  display: inline-block;\n  opacity: 0.5;\n  margin: 0em 0.2rem 0em;\n  font-size: 0.9em;\n  color: rgba(0, 0, 0, 0.4);\n  vertical-align: baseline;\n}\n\n/* Link */\n\n.ui.breadcrumb a {\n  color: #009fda;\n}\n\n.ui.breadcrumb a:hover {\n  color: #00b2f3;\n}\n\n/* Icon Divider */\n\n.ui.breadcrumb .icon.divider {\n  font-size: 0.7em;\n  vertical-align: middle;\n}\n\n/* Section */\n\n.ui.breadcrumb a.section {\n  cursor: pointer;\n}\n\n.ui.breadcrumb .section {\n  display: inline-block;\n  margin: 0em;\n  padding: 0em;\n}\n\n/* Loose Coupling */\n\n.ui.breadcrumb.segment {\n  display: inline-block;\n  padding: 0.5em 1em;\n}\n\n/*******************************\n            States\n*******************************/\n\n.ui.breadcrumb .active.section {\n  font-weight: bold;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n.ui.mini.breadcrumb {\n  font-size: 0.65em;\n}\n\n.ui.tiny.breadcrumb {\n  font-size: 0.7em;\n}\n\n.ui.small.breadcrumb {\n  font-size: 0.75em;\n}\n\n.ui.breadcrumb {\n  font-size: 1em;\n}\n\n.ui.large.breadcrumb {\n  font-size: 1.1em;\n}\n\n.ui.big.breadcrumb {\n  font-size: 1.05em;\n}\n\n.ui.huge.breadcrumb {\n  font-size: 1.3em;\n}\n\n.ui.massive.breadcrumb {\n  font-size: 1.5em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Elements\n*******************************/\n\n/*--------------------\n        Form\n---------------------*/\n\n.ui.form {\n  position: relative;\n  max-width: 100%;\n}\n\n/*--------------------\n        Content\n---------------------*/\n\n.ui.form > p {\n  margin: 1em 0em;\n}\n\n/*--------------------\n        Field\n---------------------*/\n\n.ui.form .field {\n  clear: both;\n  margin: 0em 0em 1em;\n}\n\n.ui.form .fields:last-child .field,\n.ui.form :not(.fields) .field:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------------\n        Labels\n---------------------*/\n\n.ui.form .field > label {\n  display: block;\n  margin: 0em 0em 0.2857rem 0em;\n  color: rgba(0, 0, 0, 0.8);\n  font-size: 0.9285em;\n  font-weight: bold;\n  text-transform: none;\n}\n\n.ui.form .grouped.fields > label {\n  margin: 0em 0em 0.2857rem 0em;\n  color: rgba(0, 0, 0, 0.8);\n  font-size: 0.9285em;\n  font-weight: bold;\n  text-transform: none;\n}\n\n.ui.form .inline.fields > label {\n  display: inline-block;\n  vertical-align: middle;\n  margin: 0em 1em 0em 0em;\n  color: rgba(0, 0, 0, 0.8);\n  font-size: 0.9285em;\n  font-weight: bold;\n  text-transform: none;\n}\n\n/*--------------------\n    Standard Inputs\n---------------------*/\n\n.ui.form textarea,\n.ui.form input[type="text"],\n.ui.form input[type="email"],\n.ui.form input[type="date"],\n.ui.form input[type="password"],\n.ui.form input[type="number"],\n.ui.form input[type="url"],\n.ui.form input[type="tel"],\n.ui.form .ui.input {\n  width: 100%;\n  vertical-align: top;\n}\n\n.ui.form input[type="text"],\n.ui.form input[type="email"],\n.ui.form input[type="date"],\n.ui.form input[type="password"],\n.ui.form input[type="number"],\n.ui.form input[type="url"],\n.ui.form input[type="tel"] {\n  margin: 0em;\n  outline: none;\n  -webkit-appearance: none;\n  -webkit-tap-highlight-color: rgba(255, 255, 255, 0);\n  line-height: 1.2142em;\n  padding: 0.67861em 1em;\n  font-size: 1em;\n  background: #ffffff;\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  color: rgba(0, 0, 0, 0.8);\n  border-radius: 0.2857rem;\n  box-shadow: 0em 0em 0em 0em transparent inset;\n  -webkit-transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n}\n\n.ui.textarea,\n.ui.form textarea {\n  margin: 0em;\n  -webkit-appearance: none;\n  -webkit-tap-highlight-color: rgba(255, 255, 255, 0);\n  padding: 0.78571em 1em;\n  background: #ffffff;\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  outline: none;\n  color: rgba(0, 0, 0, 0.8);\n  border-radius: 0.2857rem;\n  box-shadow: 0em 0em 0em 0em transparent inset;\n  -webkit-transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  font-size: 1em;\n  height: 12em;\n  min-height: 8em;\n  max-height: 24em;\n  line-height: 1.2857;\n  resize: vertical;\n}\n\n.ui.form textarea,\n.ui.form input[type="checkbox"] {\n  vertical-align: top;\n}\n\n/*--------------------------\n  Input w/ attached Button\n---------------------------*/\n\n.ui.form input.attached {\n  width: auto;\n}\n\n/*--------------------\n     Basic Select\n---------------------*/\n\n.ui.form select {\n  display: block;\n  height: auto;\n  width: 100%;\n  background: #ffffff;\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  border-radius: 0.2857rem;\n  box-shadow: 0em 0em 0em 0em transparent inset;\n  padding: 0.62em 1em;\n  color: rgba(0, 0, 0, 0.8);\n  -webkit-transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n}\n\n/*--------------------\n       Dropdown\n---------------------*/\n\n.ui.form .field > .selection.dropdown {\n  width: 100%;\n}\n\n.ui.form .field > .selection.dropdown > .dropdown.icon {\n  float: right;\n}\n\n.ui.form .inline.field > .selection.dropdown {\n  width: auto;\n}\n\n.ui.form .inline.field > .selection.dropdown > .dropdown.icon {\n  float: none;\n}\n\n/*--------------------\n       Dividers\n---------------------*/\n\n.ui.form .divider {\n  clear: both;\n  margin: 1em 0em;\n}\n\n/*--------------------\n   Types of Messages\n---------------------*/\n\n.ui.form .info.message,\n.ui.form .success.message,\n.ui.form .warning.message,\n.ui.form .error.message {\n  display: none;\n}\n\n/* Assumptions */\n\n.ui.form .message:first-child {\n  margin-top: 0px;\n}\n\n/*--------------------\n   Validation Prompt\n---------------------*/\n\n.ui.form .field .prompt.label {\n  white-space: nowrap;\n}\n\n.ui.form .inline.field .prompt {\n  margin: 0em 0em 0em 1em;\n}\n\n.ui.form .inline.field .prompt:before {\n  margin-top: -0.3em;\n  bottom: auto;\n  right: auto;\n  top: 50%;\n  left: 0em;\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------------\n      Placeholder\n---------------------*/\n\n/* browsers require these rules separate */\n\n.ui.form ::-webkit-input-placeholder {\n  color: rgba(140, 140, 140, 0.8);\n}\n\n.ui.form ::-moz-placeholder {\n  color: rgba(140, 140, 140, 0.8);\n}\n\n.ui.form :focus::-webkit-input-placeholder {\n  color: rgba(89, 89, 89, 0.8);\n}\n\n.ui.form :focus::-moz-placeholder {\n  color: rgba(89, 89, 89, 0.8);\n}\n\n/* Error Placeholder */\n\n.ui.form .error ::-webkit-input-placeholder {\n  color: #e38585;\n}\n\n.ui.form .error ::-moz-placeholder {\n  color: #e38585;\n}\n\n.ui.form .error :focus::-webkit-input-placeholder {\n  color: #de7171;\n}\n\n.ui.form .error :focus::-moz-placeholder {\n  color: #de7171;\n}\n\n/*--------------------\n        Focus\n---------------------*/\n\n.ui.form input[type="text"]:focus,\n.ui.form input[type="email"]:focus,\n.ui.form input[type="date"]:focus,\n.ui.form input[type="password"]:focus,\n.ui.form input[type="number"]:focus,\n.ui.form input[type="url"]:focus,\n.ui.form input[type="tel"]:focus {\n  color: rgba(0, 0, 0, 0.85);\n  border-color: rgba(39, 41, 43, 0.3);\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n  background: #ffffff;\n  box-shadow: 1px 0em 0em 0em rgba(39, 41, 43, 0.3) inset;\n}\n\n.ui.form textarea:focus {\n  color: rgba(0, 0, 0, 0.85);\n  border-color: rgba(39, 41, 43, 0.3);\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n  background: #ffffff;\n  box-shadow: 1px 0em 0em 0em rgba(39, 41, 43, 0.3) inset;\n  -webkit-appearance: none;\n}\n\n/*--------------------\n        Success\n---------------------*/\n\n/* On Form */\n\n.ui.form.success .success.message {\n  display: block;\n}\n\n/*--------------------\n        Error\n---------------------*/\n\n/* On Form */\n\n.ui.form.warning .warning.message {\n  display: block;\n}\n\n/*--------------------\n        Warning\n---------------------*/\n\n/* On Form */\n\n.ui.form.error .error.message {\n  display: block;\n}\n\n/* On Field(s) */\n\n.ui.form .fields.error .field label,\n.ui.form .field.error label,\n.ui.form .fields.error .field .input,\n.ui.form .field.error .input {\n  color: #d95c5c;\n}\n\n.ui.form .fields.error .field .corner.label,\n.ui.form .field.error .corner.label {\n  border-color: #d95c5c;\n  color: #ffffff;\n}\n\n.ui.form .fields.error .field textarea,\n.ui.form .fields.error .field input[type="text"],\n.ui.form .fields.error .field input[type="email"],\n.ui.form .fields.error .field input[type="date"],\n.ui.form .fields.error .field input[type="password"],\n.ui.form .fields.error .field input[type="number"],\n.ui.form .fields.error .field input[type="url"],\n.ui.form .fields.error .field input[type="tel"],\n.ui.form .field.error textarea,\n.ui.form .field.error input[type="text"],\n.ui.form .field.error input[type="email"],\n.ui.form .field.error input[type="date"],\n.ui.form .field.error input[type="password"],\n.ui.form .field.error input[type="number"],\n.ui.form .field.error input[type="url"],\n.ui.form .field.error input[type="tel"] {\n  background: #fff0f0;\n  border-color: #dbb1b1;\n  color: #d95c5c;\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n  box-shadow: 2px 0em 0em 0em #d95c5c inset;\n}\n\n.ui.form .field.error textarea:focus,\n.ui.form .field.error input[type="text"]:focus,\n.ui.form .field.error input[type="email"]:focus,\n.ui.form .field.error input[type="date"]:focus,\n.ui.form .field.error input[type="password"]:focus,\n.ui.form .field.error input[type="number"]:focus,\n.ui.form .field.error input[type="url"]:focus,\n.ui.form .field.error input[type="tel"]:focus {\n  background: #fff0f0;\n  border-color: #dbb1b1;\n  color: #dc6868;\n  -webkit-appearance: none;\n  box-shadow: 2px 0em 0em 0em #dc6868 inset;\n}\n\n/*------------------\n    Dropdown Error\n--------------------*/\n\n.ui.form .fields.error .field .ui.dropdown,\n.ui.form .fields.error .field .ui.dropdown .item,\n.ui.form .field.error .ui.dropdown,\n.ui.form .field.error .ui.dropdown .text,\n.ui.form .field.error .ui.dropdown .item {\n  background: #fff0f0;\n  color: #d95c5c;\n}\n\n.ui.form .fields.error .field .ui.dropdown,\n.ui.form .field.error .ui.dropdown {\n  border-color: #dbb1b1 !important;\n}\n\n.ui.form .fields.error .field .ui.dropdown:hover,\n.ui.form .field.error .ui.dropdown:hover {\n  border-color: #dbb1b1 !important;\n}\n\n.ui.form .fields.error .field .ui.dropdown:hover .menu,\n.ui.form .field.error .ui.dropdown:hover .menu {\n  border-color: #dbb1b1;\n}\n\n/* Hover */\n\n.ui.form .fields.error .field .ui.dropdown .menu .item:hover,\n.ui.form .field.error .ui.dropdown .menu .item:hover {\n  background-color: #fff2f2;\n}\n\n/* Active */\n\n.ui.form .fields.error .field .ui.dropdown .menu .active.item,\n.ui.form .field.error .ui.dropdown .menu .active.item {\n  background-color: #fdcfcf !important;\n}\n\n/*--------------------\n    Checkbox Error\n---------------------*/\n\n.ui.form .fields.error .field .checkbox:not(.toggle):not(.slider) label,\n.ui.form .field.error .checkbox:not(.toggle):not(.slider) label,\n.ui.form .fields.error .field .checkbox:not(.toggle):not(.slider) .box,\n.ui.form .field.error .checkbox:not(.toggle):not(.slider) .box {\n  color: #d95c5c;\n}\n\n.ui.form .fields.error .field .checkbox:not(.toggle):not(.slider) label:before,\n.ui.form .field.error .checkbox:not(.toggle):not(.slider) label:before,\n.ui.form .fields.error .field .checkbox:not(.toggle):not(.slider) .box:before,\n.ui.form .field.error .checkbox:not(.toggle):not(.slider) .box:before {\n  background: #fff0f0;\n  border-color: #dbb1b1;\n}\n\n.ui.form .fields.error .field .checkbox label:after,\n.ui.form .field.error .checkbox label:after,\n.ui.form .fields.error .field .checkbox .box:after,\n.ui.form .field.error .checkbox .box:after {\n  color: #d95c5c;\n}\n\n/*--------------------\n       Disabled\n---------------------*/\n\n.ui.form .field :disabled,\n.ui.form .field.disabled {\n  opacity: 0.5;\n}\n\n.ui.form .field.disabled label {\n  opacity: 0.5;\n}\n\n.ui.form .field.disabled :disabled {\n  opacity: 1;\n}\n\n/*--------------\n    Loading\n---------------*/\n\n.ui.loading.form {\n  position: relative;\n  cursor: default;\n  point-events: none;\n  text-shadow: none !important;\n  color: transparent !important;\n  -webkit-transition: all 0s linear;\n  transition: all 0s linear;\n  z-index: 100;\n}\n\n.ui.loading.form:before {\n  position: absolute;\n  content: \'\';\n  top: 0%;\n  left: 0%;\n  background: rgba(255, 255, 255, 0.8);\n  width: 100%;\n  height: 100%;\n  z-index: 100;\n}\n\n.ui.loading.form:after {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: 50%;\n  margin: -1.5em 0em 0em -1.5em;\n  width: 3em;\n  height: 3em;\n  -webkit-animation: form-spin 0.6s linear;\n  animation: form-spin 0.6s linear;\n  -webkit-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n  border-radius: 500rem;\n  border-color: #aaaaaa rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1);\n  border-style: solid;\n  border-width: 0.2em;\n  box-shadow: 0px 0px 0px 1px transparent;\n  visibility: visible;\n  z-index: 101;\n}\n\n@-webkit-keyframes form-spin {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n@keyframes form-spin {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n/*******************************\n         Element Types\n*******************************/\n\n/*--------------------\n     Required Field\n---------------------*/\n\n.ui.form .required.fields > .field > label:after,\n.ui.form .required.field > label:after,\n.ui.form .required.fields > .field > .checkbox:after,\n.ui.form .required.field > .checkbox:after {\n  margin: -0.2em 0em 0em 0.2em;\n  content: \'*\';\n  color: #d95c5c;\n}\n\n.ui.form .required.fields > .field > label:after,\n.ui.form .required.field > label:after {\n  display: inline-block;\n  vertical-align: top;\n}\n\n.ui.form .required.fields > .field > .checkbox:after,\n.ui.form .required.field > .checkbox:after {\n  position: absolute;\n  top: 0%;\n  left: 100%;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------------\n    Inverted Colors\n---------------------*/\n\n.ui.inverted.form label,\n.ui.form .inverted.segment label,\n.ui.form .inverted.segment .ui.checkbox label,\n.ui.form .inverted.segment .ui.checkbox .box,\n.ui.inverted.form .ui.checkbox label,\n.ui.inverted.form .ui.checkbox .box {\n  color: #ffffff;\n}\n\n/*--------------------\n     Field Groups\n---------------------*/\n\n/* Grouped Vertically */\n\n.ui.form .grouped.fields {\n  margin: 0em 0em 1em;\n}\n\n.ui.form .grouped.fields:last-child {\n  margin-bottom: 0em;\n}\n\n.ui.form .grouped.fields > label {\n  font-size: 0.9285em;\n}\n\n.ui.form .grouped.fields .field {\n  display: block;\n  float: none;\n  margin: 0.5em 0em;\n  padding: 0em;\n}\n\n/*--------------------\n        Fields\n---------------------*/\n\n/* Split fields */\n\n.ui.form .fields {\n  clear: both;\n}\n\n.ui.form .fields:after {\n  content: \' \';\n  display: block;\n  clear: both;\n  visibility: hidden;\n  line-height: 0;\n  height: 0;\n}\n\n.ui.form .fields > .field {\n  clear: none;\n  float: left;\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n}\n\n.ui.form .fields > .field:first-child {\n  border-left: none;\n  box-shadow: none;\n}\n\n/* Other Combinations */\n\n.ui.form .two.fields > .fields,\n.ui.form .two.fields > .field {\n  width: 50%;\n}\n\n.ui.form .three.fields > .fields,\n.ui.form .three.fields > .field {\n  width: 33.33333333%;\n}\n\n.ui.form .four.fields > .fields,\n.ui.form .four.fields > .field {\n  width: 25%;\n}\n\n.ui.form .five.fields > .fields,\n.ui.form .five.fields > .field {\n  width: 20%;\n}\n\n.ui.form .six.fields > .fields,\n.ui.form .six.fields > .field {\n  width: 16.66666667%;\n}\n\n.ui.form .seven.fields > .fields,\n.ui.form .seven.fields > .field {\n  width: 14.28571429%;\n}\n\n.ui.form .eight.fields > .fields,\n.ui.form .eight.fields > .field {\n  width: 12.5%;\n}\n\n.ui.form .nine.fields > .fields,\n.ui.form .nine.fields > .field {\n  width: 11.11111111%;\n}\n\n.ui.form .ten.fields > .fields,\n.ui.form .ten.fields > .field {\n  width: 10%;\n}\n\n/* Swap to full width on mobile */\n\n@media only screen and (max-width: 767px) {\n  .ui.form .two.fields > .fields,\n  .ui.form .two.fields > .field,\n  .ui.form .three.fields > .fields,\n  .ui.form .three.fields > .field,\n  .ui.form .four.fields > .fields,\n  .ui.form .four.fields > .field,\n  .ui.form .five.fields > .fields,\n  .ui.form .five.fields > .field {\n    width: 100%;\n    padding-left: 0%;\n    padding-right: 0%;\n  }\n}\n\n.ui.form .fields .field:first-child {\n  padding-left: 0%;\n}\n\n.ui.form .fields .field:last-child {\n  padding-right: 0%;\n}\n\n/* Sizing Combinations */\n\n.ui.form .fields .wide.field {\n  width: 6.25%;\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n}\n\n.ui.form .fields .wide.field:first-child {\n  padding-left: 0%;\n}\n\n.ui.form .fields .wide.field:last-child {\n  padding-right: 0%;\n}\n\n.ui.form .one.wide.field {\n  width: 6.25% !important;\n}\n\n.ui.form .two.wide.field {\n  width: 12.5% !important;\n}\n\n.ui.form .three.wide.field {\n  width: 18.75% !important;\n}\n\n.ui.form .four.wide.field {\n  width: 25% !important;\n}\n\n.ui.form .five.wide.field {\n  width: 31.25% !important;\n}\n\n.ui.form .six.wide.field {\n  width: 37.5% !important;\n}\n\n.ui.form .seven.wide.field {\n  width: 43.75% !important;\n}\n\n.ui.form .eight.wide.field {\n  width: 50% !important;\n}\n\n.ui.form .nine.wide.field {\n  width: 56.25% !important;\n}\n\n.ui.form .ten.wide.field {\n  width: 62.5% !important;\n}\n\n.ui.form .eleven.wide.field {\n  width: 68.75% !important;\n}\n\n.ui.form .twelve.wide.field {\n  width: 75% !important;\n}\n\n.ui.form .thirteen.wide.field {\n  width: 81.25% !important;\n}\n\n.ui.form .fourteen.wide.field {\n  width: 87.5% !important;\n}\n\n.ui.form .fifteen.wide.field {\n  width: 93.75% !important;\n}\n\n.ui.form .sixteen.wide.field {\n  width: 100% !important;\n}\n\n/* Swap to full width on mobile */\n\n@media only screen and (max-width: 767px) {\n  .ui.form .two.fields > .fields,\n  .ui.form .two.fields > .field,\n  .ui.form .three.fields > .fields,\n  .ui.form .three.fields > .field,\n  .ui.form .four.fields > .fields,\n  .ui.form .four.fields > .field,\n  .ui.form .five.fields > .fields,\n  .ui.form .five.fields > .field,\n  .ui.form .fields > .two.wide.field,\n  .ui.form .fields > .three.wide.field,\n  .ui.form .fields > .four.wide.field,\n  .ui.form .fields > .five.wide.field,\n  .ui.form .fields > .six.wide.field,\n  .ui.form .fields > .seven.wide.field,\n  .ui.form .fields > .eight.wide.field,\n  .ui.form .fields > .nine.wide.field,\n  .ui.form .fields > .ten.wide.field,\n  .ui.form .fields > .eleven.wide.field,\n  .ui.form .fields > .twelve.wide.field,\n  .ui.form .fields > .thirteen.wide.field,\n  .ui.form .fields > .fourteen.wide.field,\n  .ui.form .fields > .fifteen.wide.field,\n  .ui.form .fields > .sixteen.wide.field {\n    width: 100%;\n    padding-left: 0%;\n    padding-right: 0%;\n  }\n}\n\n/*--------------------\n    Inline Fields\n---------------------*/\n\n.ui.form .inline.fields {\n  margin: 0em 0em 1em;\n}\n\n.ui.form .inline.fields .field {\n  display: inline-block;\n  float: none;\n  margin: 0em 1em 0em 0em;\n  padding: 0em;\n}\n\n.ui.form .inline.fields .field > label,\n.ui.form .inline.fields .field > p,\n.ui.form .inline.fields .field > input,\n.ui.form .inline.field > label,\n.ui.form .inline.field > p,\n.ui.form .inline.field > input {\n  display: inline-block;\n  width: auto;\n  margin-top: 0em;\n  margin-bottom: 0em;\n  vertical-align: middle;\n  font-size: 0.9285em;\n}\n\n.ui.form .inline.fields .field > input,\n.ui.form .inline.field > input {\n  font-size: 0.9285em;\n}\n\n.ui.form .inline.fields .field > .ui.checkbox label {\n  padding-left: 1.75em;\n}\n\n/* Label */\n\n.ui.form .inline.fields .field > :first-child,\n.ui.form .inline.field > :first-child {\n  margin: 0em 0.2857rem 0em 0em;\n}\n\n.ui.form .inline.fields .field > :only-child,\n.ui.form .inline.field > :only-child {\n  margin: 0em;\n}\n\n/*--------------------\n        Sizes\n---------------------*/\n\n/* Standard */\n\n.ui.small.form {\n  font-size: 0.875em;\n}\n\n/* Medium */\n\n.ui.form {\n  font-size: auto;\n}\n\n/* Large */\n\n.ui.large.form {\n  font-size: 1.125em;\n}\n\n/* Huge */\n\n.ui.huge.form {\n  font-size: 1.2em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Standard\n*******************************/\n\n.ui.grid {\n  display: block;\n  text-align: left;\n  font-size: 0em;\n  padding: 0em;\n}\n\n.ui.grid:after,\n.ui.grid > .row:after {\n  content: \'\';\n  display: block;\n  height: 0px;\n  clear: both;\n  visibility: hidden;\n}\n\n/*----------------------\n      Remove Gutters\n-----------------------*/\n\n.ui.grid {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  margin-left: -1rem;\n  margin-right: -1rem;\n}\n\n.ui.relaxed.grid {\n  margin-left: -1.5rem;\n  margin-right: -1.5rem;\n}\n\n.ui[class*="very relaxed"].grid {\n  margin-left: -2.5rem;\n  margin-right: -2.5rem;\n}\n\n/* Collapse Margins on Consecutive Grids */\n\n.ui.grid + .grid {\n  margin-top: 1rem;\n}\n\n/*-------------------\n       Columns\n--------------------*/\n\n/* Standard 16 column */\n\n.ui.grid > .column:not(.row),\n.ui.grid > .row > .column {\n  position: relative;\n  display: inline-block;\n  text-align: left;\n  font-size: 1rem;\n  width: 6.25%;\n  padding-left: 1rem;\n  padding-right: 1rem;\n  vertical-align: top;\n}\n\n.ui.grid > * {\n  padding-left: 1rem;\n  padding-right: 1rem;\n}\n\n/*-------------------\n        Rows\n--------------------*/\n\n.ui.grid > .row {\n  position: relative;\n  display: block;\n  width: auto !important;\n  padding: 0rem;\n  font-size: 0rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n/*-------------------\n       Columns\n--------------------*/\n\n/* Vertical padding when no rows */\n\n.ui.grid > .column:not(.row) {\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .row > .column {\n  margin-top: 0em;\n  margin-bottom: 0em;\n}\n\n/*-------------------\n      Content\n--------------------*/\n\n.ui.grid > .row > img,\n.ui.grid > .row > .column > img {\n  max-width: 100%;\n}\n\n/*-------------------\n    Loose Coupling\n--------------------*/\n\n.ui.grid .row + .ui.divider {\n  margin: 1rem 1rem;\n}\n\n/* remove Border on last horizontal segment */\n\n.ui.grid > .row > .column:last-child > .horizontal.segment,\n.ui.grid > .column:last-child > .horizontal.segment {\n  box-shadow: none;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-----------------------\n       Page Grid\n-------------------------*/\n\n.ui.page.grid {\n  padding-left: 8%;\n  padding-right: 8%;\n  width: auto;\n}\n\n/* Collapse Margin */\n\n.ui.grid > .ui.grid:first-child {\n  margin-top: 0em;\n}\n\n.ui.grid > .ui.grid:last-child {\n  margin-bottom: 0em;\n}\n\n@media only screen and (max-width: 767px) {\n  .ui.page.grid {\n    width: auto;\n    padding-left: 0em;\n    padding-right: 0em;\n    margin-left: 0em;\n    margin-right: 0em;\n  }\n}\n\n@media only screen and (min-width: 768px) {\n  .ui.page.grid {\n    width: auto;\n    margin-left: 0em;\n    margin-right: 0em;\n    padding-left: 4em;\n    padding-right: 4em;\n  }\n}\n\n@media only screen and (min-width: 992px) {\n  .ui.page.grid {\n    width: auto;\n    margin-left: 0em;\n    margin-right: 0em;\n    padding-left: 8%;\n    padding-right: 8%;\n  }\n}\n\n@media only screen and (min-width: 1400px) {\n  .ui.page.grid {\n    width: auto;\n    margin-left: 0em;\n    margin-right: 0em;\n    padding-left: 15%;\n    padding-right: 15%;\n  }\n}\n\n@media only screen and (min-width: 1920px) {\n  .ui.page.grid {\n    width: auto;\n    margin-left: 0em;\n    margin-right: 0em;\n    padding-left: 23%;\n    padding-right: 23%;\n  }\n}\n\n/*-------------------\n     Column Count\n--------------------*/\n\n/* Assume full width with one column */\n\n.ui.grid > .column:only-child,\n.ui.grid > .row > .column:only-child {\n  width: 100%;\n}\n\n/* Grid Based */\n\n.ui[class*="one column"].grid > .row > .column,\n.ui[class*="one column"].grid > .column {\n  width: 100%;\n}\n\n.ui[class*="two column"].grid > .row > .column,\n.ui[class*="two column"].grid > .column {\n  width: 50%;\n}\n\n.ui[class*="three column"].grid > .row > .column,\n.ui[class*="three column"].grid > .column {\n  width: 33.33333333%;\n}\n\n.ui[class*="four column"].grid > .row > .column,\n.ui[class*="four column"].grid > .column {\n  width: 25%;\n}\n\n.ui[class*="five column"].grid > .row > .column,\n.ui[class*="five column"].grid > .column {\n  width: 20%;\n}\n\n.ui[class*="six column"].grid > .row > .column,\n.ui[class*="six column"].grid > .column {\n  width: 16.66666667%;\n}\n\n.ui[class*="seven column"].grid > .row > .column,\n.ui[class*="seven column"].grid > .column {\n  width: 14.28571429%;\n}\n\n.ui[class*="eight column"].grid > .row > .column,\n.ui[class*="eight column"].grid > .column {\n  width: 12.5%;\n}\n\n.ui[class*="nine column"].grid > .row > .column,\n.ui[class*="nine column"].grid > .column {\n  width: 11.11111111%;\n}\n\n.ui[class*="ten column"].grid > .row > .column,\n.ui[class*="ten column"].grid > .column {\n  width: 10%;\n}\n\n.ui[class*="eleven column"].grid > .row > .column,\n.ui[class*="eleven column"].grid > .column {\n  width: 9.09090909%;\n}\n\n.ui[class*="twelve column"].grid > .row > .column,\n.ui[class*="twelve column"].grid > .column {\n  width: 8.33333333%;\n}\n\n.ui[class*="thirteen column"].grid > .row > .column,\n.ui[class*="thirteen column"].grid > .column {\n  width: 7.69230769%;\n}\n\n.ui[class*="fourteen column"].grid > .row > .column,\n.ui[class*="fourteen column"].grid > .column {\n  width: 7.14285714%;\n}\n\n.ui[class*="fifteen column"].grid > .row > .column,\n.ui[class*="fifteen column"].grid > .column {\n  width: 6.66666667%;\n}\n\n.ui[class*="sixteen column"].grid > .row > .column,\n.ui[class*="sixteen column"].grid > .column {\n  width: 6.25%;\n}\n\n/* Row Based Overrides */\n\n.ui.grid > [class*="one column"].row > .column {\n  width: 100% !important;\n}\n\n.ui.grid > [class*="two column"].row > .column {\n  width: 50% !important;\n}\n\n.ui.grid > [class*="three column"].row > .column {\n  width: 33.33333333% !important;\n}\n\n.ui.grid > [class*="four column"].row > .column {\n  width: 25% !important;\n}\n\n.ui.grid > [class*="five column"].row > .column {\n  width: 20% !important;\n}\n\n.ui.grid > [class*="six column"].row > .column {\n  width: 16.66666667% !important;\n}\n\n.ui.grid > [class*="seven column"].row > .column {\n  width: 14.28571429% !important;\n}\n\n.ui.grid > [class*="eight column"].row > .column {\n  width: 12.5% !important;\n}\n\n.ui.grid > [class*="nine column"].row > .column {\n  width: 11.11111111% !important;\n}\n\n.ui.grid > [class*="ten column"].row > .column {\n  width: 10% !important;\n}\n\n.ui.grid > [class*="eleven column"].row > .column {\n  width: 9.09090909% !important;\n}\n\n.ui.grid > [class*="twelve column"].row > .column {\n  width: 8.33333333% !important;\n}\n\n.ui.grid > [class*="thirteen column"].row > .column {\n  width: 7.69230769% !important;\n}\n\n.ui.grid > [class*="fourteen column"].row > .column {\n  width: 7.14285714% !important;\n}\n\n.ui.grid > [class*="fifteen column"].row > .column {\n  width: 6.66666667% !important;\n}\n\n.ui.grid > [class*="sixteen column"].row > .column {\n  width: 6.25% !important;\n}\n\n/*-------------------\n    Column Width\n--------------------*/\n\n/* Sizing Combinations */\n\n.ui.grid > .row > [class*="one wide"].column,\n.ui.grid > .column.row > [class*="one wide"].column,\n.ui.grid > [class*="one wide"].column,\n.ui.column.grid > [class*="one wide"].column {\n  width: 6.25% !important;\n}\n\n.ui.grid > .row > [class*="two wide"].column,\n.ui.grid > .column.row > [class*="two wide"].column,\n.ui.grid > [class*="two wide"].column,\n.ui.column.grid > [class*="two wide"].column {\n  width: 12.5% !important;\n}\n\n.ui.grid > .row > [class*="three wide"].column,\n.ui.grid > .column.row > [class*="three wide"].column,\n.ui.grid > [class*="three wide"].column,\n.ui.column.grid > [class*="three wide"].column {\n  width: 18.75% !important;\n}\n\n.ui.grid > .row > [class*="four wide"].column,\n.ui.grid > .column.row > [class*="four wide"].column,\n.ui.grid > [class*="four wide"].column,\n.ui.column.grid > [class*="four wide"].column {\n  width: 25% !important;\n}\n\n.ui.grid > .row > [class*="five wide"].column,\n.ui.grid > .column.row > [class*="five wide"].column,\n.ui.grid > [class*="five wide"].column,\n.ui.column.grid > [class*="five wide"].column {\n  width: 31.25% !important;\n}\n\n.ui.grid > .row > [class*="six wide"].column,\n.ui.grid > .column.row > [class*="six wide"].column,\n.ui.grid > [class*="six wide"].column,\n.ui.column.grid > [class*="six wide"].column {\n  width: 37.5% !important;\n}\n\n.ui.grid > .row > [class*="seven wide"].column,\n.ui.grid > .column.row > [class*="seven wide"].column,\n.ui.grid > [class*="seven wide"].column,\n.ui.column.grid > [class*="seven wide"].column {\n  width: 43.75% !important;\n}\n\n.ui.grid > .row > [class*="eight wide"].column,\n.ui.grid > .column.row > [class*="eight wide"].column,\n.ui.grid > [class*="eight wide"].column,\n.ui.column.grid > [class*="eight wide"].column {\n  width: 50% !important;\n}\n\n.ui.grid > .row > [class*="nine wide"].column,\n.ui.grid > .column.row > [class*="nine wide"].column,\n.ui.grid > [class*="nine wide"].column,\n.ui.column.grid > [class*="nine wide"].column {\n  width: 56.25% !important;\n}\n\n.ui.grid > .row > [class*="ten wide"].column,\n.ui.grid > .column.row > [class*="ten wide"].column,\n.ui.grid > [class*="ten wide"].column,\n.ui.column.grid > [class*="ten wide"].column {\n  width: 62.5% !important;\n}\n\n.ui.grid > .row > [class*="eleven wide"].column,\n.ui.grid > .column.row > [class*="eleven wide"].column,\n.ui.grid > [class*="eleven wide"].column,\n.ui.column.grid > [class*="eleven wide"].column {\n  width: 68.75% !important;\n}\n\n.ui.grid > .row > [class*="twelve wide"].column,\n.ui.grid > .column.row > [class*="twelve wide"].column,\n.ui.grid > [class*="twelve wide"].column,\n.ui.column.grid > [class*="twelve wide"].column {\n  width: 75% !important;\n}\n\n.ui.grid > .row > [class*="thirteen wide"].column,\n.ui.grid > .column.row > [class*="thirteen wide"].column,\n.ui.grid > [class*="thirteen wide"].column,\n.ui.column.grid > [class*="thirteen wide"].column {\n  width: 81.25% !important;\n}\n\n.ui.grid > .row > [class*="fourteen wide"].column,\n.ui.grid > .column.row > [class*="fourteen wide"].column,\n.ui.grid > [class*="fourteen wide"].column,\n.ui.column.grid > [class*="fourteen wide"].column {\n  width: 87.5% !important;\n}\n\n.ui.grid > .row > [class*="fifteen wide"].column,\n.ui.grid > .column.row > [class*="fifteen wide"].column,\n.ui.grid > [class*="fifteen wide"].column,\n.ui.column.grid > [class*="fifteen wide"].column {\n  width: 93.75% !important;\n}\n\n.ui.grid > .row > [class*="sixteen wide"].column,\n.ui.grid > .column.row > [class*="sixteen wide"].column,\n.ui.grid > [class*="sixteen wide"].column,\n.ui.column.grid > [class*="sixteen wide"].column {\n  width: 100% !important;\n}\n\n/*----------------------\n    Width per Device\n-----------------------*/\n\n/* Mobile Sizing Combinations */\n\n.ui.grid > .row > [class*="one wide mobile"].column,\n.ui.grid > .column.row > [class*="one wide mobile"].column,\n.ui.grid > [class*="one wide mobile"].column,\n.ui.column.grid > [class*="one wide mobile"].column {\n  width: 6.25% !important;\n}\n\n.ui.grid > .row > [class*="two wide mobile"].column,\n.ui.grid > .column.row > [class*="two wide mobile"].column,\n.ui.grid > [class*="two wide mobile"].column,\n.ui.column.grid > [class*="two wide mobile"].column {\n  width: 12.5% !important;\n}\n\n.ui.grid > .row > [class*="three wide mobile"].column,\n.ui.grid > .column.row > [class*="three wide mobile"].column,\n.ui.grid > [class*="three wide mobile"].column,\n.ui.column.grid > [class*="three wide mobile"].column {\n  width: 18.75% !important;\n}\n\n.ui.grid > .row > [class*="four wide mobile"].column,\n.ui.grid > .column.row > [class*="four wide mobile"].column,\n.ui.grid > [class*="four wide mobile"].column,\n.ui.column.grid > [class*="four wide mobile"].column {\n  width: 25% !important;\n}\n\n.ui.grid > .row > [class*="five wide mobile"].column,\n.ui.grid > .column.row > [class*="five wide mobile"].column,\n.ui.grid > [class*="five wide mobile"].column,\n.ui.column.grid > [class*="five wide mobile"].column {\n  width: 31.25% !important;\n}\n\n.ui.grid > .row > [class*="six wide mobile"].column,\n.ui.grid > .column.row > [class*="six wide mobile"].column,\n.ui.grid > [class*="six wide mobile"].column,\n.ui.column.grid > [class*="six wide mobile"].column {\n  width: 37.5% !important;\n}\n\n.ui.grid > .row > [class*="seven wide mobile"].column,\n.ui.grid > .column.row > [class*="seven wide mobile"].column,\n.ui.grid > [class*="seven wide mobile"].column,\n.ui.column.grid > [class*="seven wide mobile"].column {\n  width: 43.75% !important;\n}\n\n.ui.grid > .row > [class*="eight wide mobile"].column,\n.ui.grid > .column.row > [class*="eight wide mobile"].column,\n.ui.grid > [class*="eight wide mobile"].column,\n.ui.column.grid > [class*="eight wide mobile"].column {\n  width: 50% !important;\n}\n\n.ui.grid > .row > [class*="nine wide mobile"].column,\n.ui.grid > .column.row > [class*="nine wide mobile"].column,\n.ui.grid > [class*="nine wide mobile"].column,\n.ui.column.grid > [class*="nine wide mobile"].column {\n  width: 56.25% !important;\n}\n\n.ui.grid > .row > [class*="ten wide mobile"].column,\n.ui.grid > .column.row > [class*="ten wide mobile"].column,\n.ui.grid > [class*="ten wide mobile"].column,\n.ui.column.grid > [class*="ten wide mobile"].column {\n  width: 62.5% !important;\n}\n\n.ui.grid > .row > [class*="eleven wide mobile"].column,\n.ui.grid > .column.row > [class*="eleven wide mobile"].column,\n.ui.grid > [class*="eleven wide mobile"].column,\n.ui.column.grid > [class*="eleven wide mobile"].column {\n  width: 68.75% !important;\n}\n\n.ui.grid > .row > [class*="twelve wide mobile"].column,\n.ui.grid > .column.row > [class*="twelve wide mobile"].column,\n.ui.grid > [class*="twelve wide mobile"].column,\n.ui.column.grid > [class*="twelve wide mobile"].column {\n  width: 75% !important;\n}\n\n.ui.grid > .row > [class*="thirteen wide mobile"].column,\n.ui.grid > .column.row > [class*="thirteen wide mobile"].column,\n.ui.grid > [class*="thirteen wide mobile"].column,\n.ui.column.grid > [class*="thirteen wide mobile"].column {\n  width: 81.25% !important;\n}\n\n.ui.grid > .row > [class*="fourteen wide mobile"].column,\n.ui.grid > .column.row > [class*="fourteen wide mobile"].column,\n.ui.grid > [class*="fourteen wide mobile"].column,\n.ui.column.grid > [class*="fourteen wide mobile"].column {\n  width: 87.5% !important;\n}\n\n.ui.grid > .row > [class*="fifteen wide mobile"].column,\n.ui.grid > .column.row > [class*="fifteen wide mobile"].column,\n.ui.grid > [class*="fifteen wide mobile"].column,\n.ui.column.grid > [class*="fifteen wide mobile"].column {\n  width: 93.75% !important;\n}\n\n.ui.grid > .row > [class*="sixteen wide mobile"].column,\n.ui.grid > .column.row > [class*="sixteen wide mobile"].column,\n.ui.grid > [class*="sixteen wide mobile"].column,\n.ui.column.grid > [class*="sixteen wide mobile"].column {\n  width: 100% !important;\n}\n\n/* Tablet Sizing Combinations */\n\n@media only screen and (min-width: 768px) {\n  .ui.grid > .row > [class*="one wide tablet"].column,\n  .ui.grid > .column.row > [class*="one wide tablet"].column,\n  .ui.grid > [class*="one wide tablet"].column,\n  .ui.column.grid > [class*="one wide tablet"].column {\n    width: 6.25% !important;\n  }\n\n  .ui.grid > .row > [class*="two wide tablet"].column,\n  .ui.grid > .column.row > [class*="two wide tablet"].column,\n  .ui.grid > [class*="two wide tablet"].column,\n  .ui.column.grid > [class*="two wide tablet"].column {\n    width: 12.5% !important;\n  }\n\n  .ui.grid > .row > [class*="three wide tablet"].column,\n  .ui.grid > .column.row > [class*="three wide tablet"].column,\n  .ui.grid > [class*="three wide tablet"].column,\n  .ui.column.grid > [class*="three wide tablet"].column {\n    width: 18.75% !important;\n  }\n\n  .ui.grid > .row > [class*="four wide tablet"].column,\n  .ui.grid > .column.row > [class*="four wide tablet"].column,\n  .ui.grid > [class*="four wide tablet"].column,\n  .ui.column.grid > [class*="four wide tablet"].column {\n    width: 25% !important;\n  }\n\n  .ui.grid > .row > [class*="five wide tablet"].column,\n  .ui.grid > .column.row > [class*="five wide tablet"].column,\n  .ui.grid > [class*="five wide tablet"].column,\n  .ui.column.grid > [class*="five wide tablet"].column {\n    width: 31.25% !important;\n  }\n\n  .ui.grid > .row > [class*="six wide tablet"].column,\n  .ui.grid > .column.row > [class*="six wide tablet"].column,\n  .ui.grid > [class*="six wide tablet"].column,\n  .ui.column.grid > [class*="six wide tablet"].column {\n    width: 37.5% !important;\n  }\n\n  .ui.grid > .row > [class*="seven wide tablet"].column,\n  .ui.grid > .column.row > [class*="seven wide tablet"].column,\n  .ui.grid > [class*="seven wide tablet"].column,\n  .ui.column.grid > [class*="seven wide tablet"].column {\n    width: 43.75% !important;\n  }\n\n  .ui.grid > .row > [class*="eight wide tablet"].column,\n  .ui.grid > .column.row > [class*="eight wide tablet"].column,\n  .ui.grid > [class*="eight wide tablet"].column,\n  .ui.column.grid > [class*="eight wide tablet"].column {\n    width: 50% !important;\n  }\n\n  .ui.grid > .row > [class*="nine wide tablet"].column,\n  .ui.grid > .column.row > [class*="nine wide tablet"].column,\n  .ui.grid > [class*="nine wide tablet"].column,\n  .ui.column.grid > [class*="nine wide tablet"].column {\n    width: 56.25% !important;\n  }\n\n  .ui.grid > .row > [class*="ten wide tablet"].column,\n  .ui.grid > .column.row > [class*="ten wide tablet"].column,\n  .ui.grid > [class*="ten wide tablet"].column,\n  .ui.column.grid > [class*="ten wide tablet"].column {\n    width: 62.5% !important;\n  }\n\n  .ui.grid > .row > [class*="eleven wide tablet"].column,\n  .ui.grid > .column.row > [class*="eleven wide tablet"].column,\n  .ui.grid > [class*="eleven wide tablet"].column,\n  .ui.column.grid > [class*="eleven wide tablet"].column {\n    width: 68.75% !important;\n  }\n\n  .ui.grid > .row > [class*="twelve wide tablet"].column,\n  .ui.grid > .column.row > [class*="twelve wide tablet"].column,\n  .ui.grid > [class*="twelve wide tablet"].column,\n  .ui.column.grid > [class*="twelve wide tablet"].column {\n    width: 75% !important;\n  }\n\n  .ui.grid > .row > [class*="thirteen wide tablet"].column,\n  .ui.grid > .column.row > [class*="thirteen wide tablet"].column,\n  .ui.grid > [class*="thirteen wide tablet"].column,\n  .ui.column.grid > [class*="thirteen wide tablet"].column {\n    width: 81.25% !important;\n  }\n\n  .ui.grid > .row > [class*="fourteen wide tablet"].column,\n  .ui.grid > .column.row > [class*="fourteen wide tablet"].column,\n  .ui.grid > [class*="fourteen wide tablet"].column,\n  .ui.column.grid > [class*="fourteen wide tablet"].column {\n    width: 87.5% !important;\n  }\n\n  .ui.grid > .row > [class*="fifteen wide tablet"].column,\n  .ui.grid > .column.row > [class*="fifteen wide tablet"].column,\n  .ui.grid > [class*="fifteen wide tablet"].column,\n  .ui.column.grid > [class*="fifteen wide tablet"].column {\n    width: 93.75% !important;\n  }\n\n  .ui.grid > .row > [class*="sixteen wide tablet"].column,\n  .ui.grid > .column.row > [class*="sixteen wide tablet"].column,\n  .ui.grid > [class*="sixteen wide tablet"].column,\n  .ui.column.grid > [class*="sixteen wide tablet"].column {\n    width: 100% !important;\n  }\n}\n\n/* Computer/Desktop Sizing Combinations */\n\n@media only screen and (min-width: 992px) {\n  .ui.grid > .row > [class*="one wide computer"].column,\n  .ui.grid > .column.row > [class*="one wide computer"].column,\n  .ui.grid > [class*="one wide computer"].column,\n  .ui.column.grid > [class*="one wide computer"].column {\n    width: 6.25% !important;\n  }\n\n  .ui.grid > .row > [class*="two wide computer"].column,\n  .ui.grid > .column.row > [class*="two wide computer"].column,\n  .ui.grid > [class*="two wide computer"].column,\n  .ui.column.grid > [class*="two wide computer"].column {\n    width: 12.5% !important;\n  }\n\n  .ui.grid > .row > [class*="three wide computer"].column,\n  .ui.grid > .column.row > [class*="three wide computer"].column,\n  .ui.grid > [class*="three wide computer"].column,\n  .ui.column.grid > [class*="three wide computer"].column {\n    width: 18.75% !important;\n  }\n\n  .ui.grid > .row > [class*="four wide computer"].column,\n  .ui.grid > .column.row > [class*="four wide computer"].column,\n  .ui.grid > [class*="four wide computer"].column,\n  .ui.column.grid > [class*="four wide computer"].column {\n    width: 25% !important;\n  }\n\n  .ui.grid > .row > [class*="five wide computer"].column,\n  .ui.grid > .column.row > [class*="five wide computer"].column,\n  .ui.grid > [class*="five wide computer"].column,\n  .ui.column.grid > [class*="five wide computer"].column {\n    width: 31.25% !important;\n  }\n\n  .ui.grid > .row > [class*="six wide computer"].column,\n  .ui.grid > .column.row > [class*="six wide computer"].column,\n  .ui.grid > [class*="six wide computer"].column,\n  .ui.column.grid > [class*="six wide computer"].column {\n    width: 37.5% !important;\n  }\n\n  .ui.grid > .row > [class*="seven wide computer"].column,\n  .ui.grid > .column.row > [class*="seven wide computer"].column,\n  .ui.grid > [class*="seven wide computer"].column,\n  .ui.column.grid > [class*="seven wide computer"].column {\n    width: 43.75% !important;\n  }\n\n  .ui.grid > .row > [class*="eight wide computer"].column,\n  .ui.grid > .column.row > [class*="eight wide computer"].column,\n  .ui.grid > [class*="eight wide computer"].column,\n  .ui.column.grid > [class*="eight wide computer"].column {\n    width: 50% !important;\n  }\n\n  .ui.grid > .row > [class*="nine wide computer"].column,\n  .ui.grid > .column.row > [class*="nine wide computer"].column,\n  .ui.grid > [class*="nine wide computer"].column,\n  .ui.column.grid > [class*="nine wide computer"].column {\n    width: 56.25% !important;\n  }\n\n  .ui.grid > .row > [class*="ten wide computer"].column,\n  .ui.grid > .column.row > [class*="ten wide computer"].column,\n  .ui.grid > [class*="ten wide computer"].column,\n  .ui.column.grid > [class*="ten wide computer"].column {\n    width: 62.5% !important;\n  }\n\n  .ui.grid > .row > [class*="eleven wide computer"].column,\n  .ui.grid > .column.row > [class*="eleven wide computer"].column,\n  .ui.grid > [class*="eleven wide computer"].column,\n  .ui.column.grid > [class*="eleven wide computer"].column {\n    width: 68.75% !important;\n  }\n\n  .ui.grid > .row > [class*="twelve wide computer"].column,\n  .ui.grid > .column.row > [class*="twelve wide computer"].column,\n  .ui.grid > [class*="twelve wide computer"].column,\n  .ui.column.grid > [class*="twelve wide computer"].column {\n    width: 75% !important;\n  }\n\n  .ui.grid > .row > [class*="thirteen wide computer"].column,\n  .ui.grid > .column.row > [class*="thirteen wide computer"].column,\n  .ui.grid > [class*="thirteen wide computer"].column,\n  .ui.column.grid > [class*="thirteen wide computer"].column {\n    width: 81.25% !important;\n  }\n\n  .ui.grid > .row > [class*="fourteen wide computer"].column,\n  .ui.grid > .column.row > [class*="fourteen wide computer"].column,\n  .ui.grid > [class*="fourteen wide computer"].column,\n  .ui.column.grid > [class*="fourteen wide computer"].column {\n    width: 87.5% !important;\n  }\n\n  .ui.grid > .row > [class*="fifteen wide computer"].column,\n  .ui.grid > .column.row > [class*="fifteen wide computer"].column,\n  .ui.grid > [class*="fifteen wide computer"].column,\n  .ui.column.grid > [class*="fifteen wide computer"].column {\n    width: 93.75% !important;\n  }\n\n  .ui.grid > .row > [class*="sixteen wide computer"].column,\n  .ui.grid > .column.row > [class*="sixteen wide computer"].column,\n  .ui.grid > [class*="sixteen wide computer"].column,\n  .ui.column.grid > [class*="sixteen wide computer"].column {\n    width: 100% !important;\n  }\n}\n\n/* Large Monitor Sizing Combinations */\n\n@media only screen and (min-width: 1400px) {\n  .ui.grid > .row > [class*="one wide large screen"].column,\n  .ui.grid > .column.row > [class*="one wide large screen"].column,\n  .ui.grid > [class*="one wide large screen"].column,\n  .ui.column.grid > [class*="one wide large screen"].column {\n    width: 6.25% !important;\n  }\n\n  .ui.grid > .row > [class*="two wide large screen"].column,\n  .ui.grid > .column.row > [class*="two wide large screen"].column,\n  .ui.grid > [class*="two wide large screen"].column,\n  .ui.column.grid > [class*="two wide large screen"].column {\n    width: 12.5% !important;\n  }\n\n  .ui.grid > .row > [class*="three wide large screen"].column,\n  .ui.grid > .column.row > [class*="three wide large screen"].column,\n  .ui.grid > [class*="three wide large screen"].column,\n  .ui.column.grid > [class*="three wide large screen"].column {\n    width: 18.75% !important;\n  }\n\n  .ui.grid > .row > [class*="four wide large screen"].column,\n  .ui.grid > .column.row > [class*="four wide large screen"].column,\n  .ui.grid > [class*="four wide large screen"].column,\n  .ui.column.grid > [class*="four wide large screen"].column {\n    width: 25% !important;\n  }\n\n  .ui.grid > .row > [class*="five wide large screen"].column,\n  .ui.grid > .column.row > [class*="five wide large screen"].column,\n  .ui.grid > [class*="five wide large screen"].column,\n  .ui.column.grid > [class*="five wide large screen"].column {\n    width: 31.25% !important;\n  }\n\n  .ui.grid > .row > [class*="six wide large screen"].column,\n  .ui.grid > .column.row > [class*="six wide large screen"].column,\n  .ui.grid > [class*="six wide large screen"].column,\n  .ui.column.grid > [class*="six wide large screen"].column {\n    width: 37.5% !important;\n  }\n\n  .ui.grid > .row > [class*="seven wide large screen"].column,\n  .ui.grid > .column.row > [class*="seven wide large screen"].column,\n  .ui.grid > [class*="seven wide large screen"].column,\n  .ui.column.grid > [class*="seven wide large screen"].column {\n    width: 43.75% !important;\n  }\n\n  .ui.grid > .row > [class*="eight wide large screen"].column,\n  .ui.grid > .column.row > [class*="eight wide large screen"].column,\n  .ui.grid > [class*="eight wide large screen"].column,\n  .ui.column.grid > [class*="eight wide large screen"].column {\n    width: 50% !important;\n  }\n\n  .ui.grid > .row > [class*="nine wide large screen"].column,\n  .ui.grid > .column.row > [class*="nine wide large screen"].column,\n  .ui.grid > [class*="nine wide large screen"].column,\n  .ui.column.grid > [class*="nine wide large screen"].column {\n    width: 56.25% !important;\n  }\n\n  .ui.grid > .row > [class*="ten wide large screen"].column,\n  .ui.grid > .column.row > [class*="ten wide large screen"].column,\n  .ui.grid > [class*="ten wide large screen"].column,\n  .ui.column.grid > [class*="ten wide large screen"].column {\n    width: 62.5% !important;\n  }\n\n  .ui.grid > .row > [class*="eleven wide large screen"].column,\n  .ui.grid > .column.row > [class*="eleven wide large screen"].column,\n  .ui.grid > [class*="eleven wide large screen"].column,\n  .ui.column.grid > [class*="eleven wide large screen"].column {\n    width: 68.75% !important;\n  }\n\n  .ui.grid > .row > [class*="twelve wide large screen"].column,\n  .ui.grid > .column.row > [class*="twelve wide large screen"].column,\n  .ui.grid > [class*="twelve wide large screen"].column,\n  .ui.column.grid > [class*="twelve wide large screen"].column {\n    width: 75% !important;\n  }\n\n  .ui.grid > .row > [class*="thirteen wide large screen"].column,\n  .ui.grid > .column.row > [class*="thirteen wide large screen"].column,\n  .ui.grid > [class*="thirteen wide large screen"].column,\n  .ui.column.grid > [class*="thirteen wide large screen"].column {\n    width: 81.25% !important;\n  }\n\n  .ui.grid > .row > [class*="fourteen wide large screen"].column,\n  .ui.grid > .column.row > [class*="fourteen wide large screen"].column,\n  .ui.grid > [class*="fourteen wide large screen"].column,\n  .ui.column.grid > [class*="fourteen wide large screen"].column {\n    width: 87.5% !important;\n  }\n\n  .ui.grid > .row > [class*="fifteen wide large screen"].column,\n  .ui.grid > .column.row > [class*="fifteen wide large screen"].column,\n  .ui.grid > [class*="fifteen wide large screen"].column,\n  .ui.column.grid > [class*="fifteen wide large screen"].column {\n    width: 93.75% !important;\n  }\n\n  .ui.grid > .row > [class*="sixteen wide large screen"].column,\n  .ui.grid > .column.row > [class*="sixteen wide large screen"].column,\n  .ui.grid > [class*="sixteen wide large screen"].column,\n  .ui.column.grid > [class*="sixteen wide large screen"].column {\n    width: 100% !important;\n  }\n}\n\n/* Widescreen Sizing Combinations */\n\n@media only screen and (min-width: 1920px) {\n  .ui.grid > .row > [class*="one wide widescreen"].column,\n  .ui.grid > .column.row > [class*="one wide widescreen"].column,\n  .ui.grid > [class*="one wide widescreen"].column,\n  .ui.column.grid > [class*="one wide widescreen"].column {\n    width: 6.25% !important;\n  }\n\n  .ui.grid > .row > [class*="two wide widescreen"].column,\n  .ui.grid > .column.row > [class*="two wide widescreen"].column,\n  .ui.grid > [class*="two wide widescreen"].column,\n  .ui.column.grid > [class*="two wide widescreen"].column {\n    width: 12.5% !important;\n  }\n\n  .ui.grid > .row > [class*="three wide widescreen"].column,\n  .ui.grid > .column.row > [class*="three wide widescreen"].column,\n  .ui.grid > [class*="three wide widescreen"].column,\n  .ui.column.grid > [class*="three wide widescreen"].column {\n    width: 18.75% !important;\n  }\n\n  .ui.grid > .row > [class*="four wide widescreen"].column,\n  .ui.grid > .column.row > [class*="four wide widescreen"].column,\n  .ui.grid > [class*="four wide widescreen"].column,\n  .ui.column.grid > [class*="four wide widescreen"].column {\n    width: 25% !important;\n  }\n\n  .ui.grid > .row > [class*="five wide widescreen"].column,\n  .ui.grid > .column.row > [class*="five wide widescreen"].column,\n  .ui.grid > [class*="five wide widescreen"].column,\n  .ui.column.grid > [class*="five wide widescreen"].column {\n    width: 31.25% !important;\n  }\n\n  .ui.grid > .row > [class*="six wide widescreen"].column,\n  .ui.grid > .column.row > [class*="six wide widescreen"].column,\n  .ui.grid > [class*="six wide widescreen"].column,\n  .ui.column.grid > [class*="six wide widescreen"].column {\n    width: 37.5% !important;\n  }\n\n  .ui.grid > .row > [class*="seven wide widescreen"].column,\n  .ui.grid > .column.row > [class*="seven wide widescreen"].column,\n  .ui.grid > [class*="seven wide widescreen"].column,\n  .ui.column.grid > [class*="seven wide widescreen"].column {\n    width: 43.75% !important;\n  }\n\n  .ui.grid > .row > [class*="eight wide widescreen"].column,\n  .ui.grid > .column.row > [class*="eight wide widescreen"].column,\n  .ui.grid > [class*="eight wide widescreen"].column,\n  .ui.column.grid > [class*="eight wide widescreen"].column {\n    width: 50% !important;\n  }\n\n  .ui.grid > .row > [class*="nine wide widescreen"].column,\n  .ui.grid > .column.row > [class*="nine wide widescreen"].column,\n  .ui.grid > [class*="nine wide widescreen"].column,\n  .ui.column.grid > [class*="nine wide widescreen"].column {\n    width: 56.25% !important;\n  }\n\n  .ui.grid > .row > [class*="ten wide widescreen"].column,\n  .ui.grid > .column.row > [class*="ten wide widescreen"].column,\n  .ui.grid > [class*="ten wide widescreen"].column,\n  .ui.column.grid > [class*="ten wide widescreen"].column {\n    width: 62.5% !important;\n  }\n\n  .ui.grid > .row > [class*="eleven wide widescreen"].column,\n  .ui.grid > .column.row > [class*="eleven wide widescreen"].column,\n  .ui.grid > [class*="eleven wide widescreen"].column,\n  .ui.column.grid > [class*="eleven wide widescreen"].column {\n    width: 68.75% !important;\n  }\n\n  .ui.grid > .row > [class*="twelve wide widescreen"].column,\n  .ui.grid > .column.row > [class*="twelve wide widescreen"].column,\n  .ui.grid > [class*="twelve wide widescreen"].column,\n  .ui.column.grid > [class*="twelve wide widescreen"].column {\n    width: 75% !important;\n  }\n\n  .ui.grid > .row > [class*="thirteen wide widescreen"].column,\n  .ui.grid > .column.row > [class*="thirteen wide widescreen"].column,\n  .ui.grid > [class*="thirteen wide widescreen"].column,\n  .ui.column.grid > [class*="thirteen wide widescreen"].column {\n    width: 81.25% !important;\n  }\n\n  .ui.grid > .row > [class*="fourteen wide widescreen"].column,\n  .ui.grid > .column.row > [class*="fourteen wide widescreen"].column,\n  .ui.grid > [class*="fourteen wide widescreen"].column,\n  .ui.column.grid > [class*="fourteen wide widescreen"].column {\n    width: 87.5% !important;\n  }\n\n  .ui.grid > .row > [class*="fifteen wide widescreen"].column,\n  .ui.grid > .column.row > [class*="fifteen wide widescreen"].column,\n  .ui.grid > [class*="fifteen wide widescreen"].column,\n  .ui.column.grid > [class*="fifteen wide widescreen"].column {\n    width: 93.75% !important;\n  }\n\n  .ui.grid > .row > [class*="sixteen wide widescreen"].column,\n  .ui.grid > .column.row > [class*="sixteen wide widescreen"].column,\n  .ui.grid > [class*="sixteen wide widescreen"].column,\n  .ui.column.grid > [class*="sixteen wide widescreen"].column {\n    width: 100% !important;\n  }\n}\n\n/*----------------------\n        Centered\n-----------------------*/\n\n.ui.centered.grid,\n.ui.centered.grid > .row,\n.ui.grid .centered.row {\n  text-align: center;\n}\n\n.ui.centered.grid > .column:not(.aligned),\n.ui.centered.grid > .row > .column:not(.aligned),\n.ui.grid .centered.row > .column:not(.aligned) {\n  text-align: left;\n}\n\n.ui.grid > .centered.column,\n.ui.grid > .row > .centered.column {\n  display: block;\n  margin-left: auto;\n  margin-right: auto;\n}\n\n/*----------------------\n        Relaxed\n-----------------------*/\n\n.ui.relaxed.grid > .column:not(.row),\n.ui.relaxed.grid > .row > .column,\n.ui.grid > .relaxed.row > .column {\n  padding-left: 1.5rem;\n  padding-right: 1.5rem;\n}\n\n.ui[class*="very relaxed"].grid > .column:not(.row),\n.ui[class*="very relaxed"].grid > .row > .column,\n.ui.grid > [class*="very relaxed"].row > .column {\n  padding-left: 2.5rem;\n  padding-right: 2.5rem;\n}\n\n/* Coupling with UI Divider */\n\n.ui.relaxed.grid .row + .ui.divider,\n.ui.grid .relaxed.row + .ui.divider {\n  margin-left: 1.5rem;\n  margin-right: 1.5rem;\n}\n\n.ui[class*="very relaxed"].grid .row + .ui.divider,\n.ui.grid [class*="very relaxed"].row + .ui.divider {\n  margin-left: 2.5rem;\n  margin-right: 2.5rem;\n}\n\n/*----------------------\n        Padded\n-----------------------*/\n\n.ui.padded.grid:not(.vertically):not(.horizontally) {\n  margin: 0em !important;\n}\n\n[class*="horizontally padded"].ui.grid {\n  margin-left: 0em !important;\n  margin-right: 0em !important;\n}\n\n[class*="vertically padded"].ui.grid {\n  margin-top: 0em !important;\n  margin-bottom: 0em !important;\n}\n\n/*----------------------\n       "Floated"\n-----------------------*/\n\n.ui.grid [class*="left floated"].column {\n  float: left;\n}\n\n.ui.grid [class*="right floated"].column {\n  float: right;\n}\n\n/*----------------------\n        Divided\n-----------------------*/\n\n.ui.divided.grid:not([class*="vertically divided"]) > .column:not(.row),\n.ui.divided.grid:not([class*="vertically divided"]) > .row > .column {\n  box-shadow: -1px 0px 0px 0px rgba(39, 41, 43, 0.15);\n}\n\n/* Swap from padding to margin on columns to have dividers align */\n\n.ui[class*="vertically divided"].grid > .column:not(.row),\n.ui[class*="vertically divided"].grid > .row > .column {\n  margin-top: 1rem;\n  margin-bottom: 1rem;\n  padding-top: 0rem;\n  padding-bottom: 0rem;\n}\n\n.ui[class*="vertically divided"].grid > .row {\n  margin-top: 0em;\n  margin-bottom: 0em;\n  padding-top: 0em;\n  padding-bottom: 0em;\n}\n\n/* No divider on first column on row */\n\n.ui.divided.grid:not([class*="vertically divided"]) > .column:first-child,\n.ui.divided.grid:not([class*="vertically divided"]) > .row > .column:first-child {\n  box-shadow: none;\n}\n\n/* Divided Row */\n\n.ui.grid > .divided.row > .column {\n  box-shadow: -1px 0px 0px 0px rgba(39, 41, 43, 0.15);\n}\n\n.ui.grid > .divided.row > .column:first-child {\n  box-shadow: none;\n}\n\n/* Vertically Divided */\n\n.ui[class*="vertically divided"].grid > .row {\n  position: relative;\n}\n\n.ui[class*="vertically divided"].grid > .row:before {\n  position: absolute;\n  content: "";\n  top: 0em;\n  left: 0px;\n  width: -webkit-calc(100% -  2rem );\n  width: calc(100% -  2rem );\n  height: 1px;\n  margin: 0% 1rem;\n  box-shadow: 0px -1px 0px 0px rgba(39, 41, 43, 0.15);\n}\n\n/* Padded Horizontally Divided */\n\n[class*="horizontally padded"].ui.divided.grid,\n.ui.padded.divided.grid:not(.vertically):not(.horizontally) {\n  width: 100%;\n}\n\n/* First Row Vertically Divided */\n\n.ui[class*="vertically divided"].grid > .row:first-child:before {\n  box-shadow: none;\n}\n\n/* Inverted Divided */\n\n.ui.inverted.divided.grid:not([class*="vertically divided"]) > .column:not(.row),\n.ui.inverted.divided.grid:not([class*="vertically divided"]) > .row > .column {\n  box-shadow: -1px 0px 0px 0px rgba(255, 255, 255, 0.2);\n}\n\n.ui.inverted.divided.grid:not([class*="vertically divided"]) > .column:not(.row):first-child,\n.ui.inverted.divided.grid:not([class*="vertically divided"]) > .row > .column:first-child {\n  box-shadow: none;\n}\n\n.ui.inverted[class*="vertically divided"].grid > .row:before {\n  box-shadow: 0px -1px 0px 0px rgba(255, 255, 255, 0.2);\n}\n\n/* Relaxed */\n\n.ui.relaxed[class*="vertically divided"].grid > .row:before {\n  margin-left: 1.5rem;\n  margin-right: 1.5rem;\n  width: -webkit-calc(100% -  3rem );\n  width: calc(100% -  3rem );\n}\n\n.ui[class*="very relaxed"][class*="vertically divided"].grid > .row:before {\n  margin-left: 5rem;\n  margin-right: 5rem;\n  width: -webkit-calc(100% -  5rem );\n  width: calc(100% -  5rem );\n}\n\n/*----------------------\n         Celled\n-----------------------*/\n\n.ui.celled.grid {\n  display: table;\n  table-layout: fixed;\n  width: 100%;\n  margin: 1em 0em;\n  box-shadow: 0px 0px 0px 1px #d4d4d5;\n}\n\n.ui.celled.grid > .row,\n.ui.celled.grid > .column.row,\n.ui.celled.grid > .column.row:first-child {\n  display: table;\n  table-layout: fixed;\n  width: 100% !important;\n  margin: 0em;\n  padding: 0em;\n  box-shadow: 0px -1px 0px 0px #d4d4d5;\n}\n\n.ui.celled.grid > .column:not(.row),\n.ui.celled.grid > .row > .column {\n  display: table-cell;\n  box-shadow: -1px 0px 0px 0px #d4d4d5;\n}\n\n.ui.celled.grid > .column:first-child,\n.ui.celled.grid > .row > .column:first-child {\n  box-shadow: none;\n}\n\n.ui.celled.page.grid {\n  box-shadow: none;\n}\n\n.ui.celled.grid > .column:not(.row),\n.ui.celled.grid > .row > .column {\n  padding: 0.75em;\n}\n\n.ui.relaxed.celled.grid > .column:not(.row),\n.ui.relaxed.celled.grid > .row > .column {\n  padding: 1em;\n}\n\n.ui[class*="very relaxed"].celled.grid > .column:not(.row),\n.ui[class*="very relaxed"].celled.grid > .row > .column {\n  padding: 2em;\n}\n\n/* Internally Celled */\n\n.ui[class*="internally celled"].grid {\n  box-shadow: none;\n}\n\n.ui[class*="internally celled"].grid > .row:first-child {\n  box-shadow: none;\n}\n\n.ui[class*="internally celled"].grid > .row > .column:first-child {\n  box-shadow: none;\n}\n\n/*----------------------\n  Horizontally Centered\n-----------------------*/\n\n/* Left Aligned */\n\n.ui[class*="left aligned"].grid,\n.ui[class*="left aligned"].grid > .row > .column,\n.ui[class*="left aligned"].grid > .column,\n.ui.grid [class*="left aligned"].column,\n.ui.grid > [class*="left aligned"].aligned.row > .column {\n  text-align: left;\n}\n\n.ui.grid [class*="left aligned"].column {\n  text-align: left !important;\n}\n\n/* Center Aligned */\n\n.ui[class*="center aligned"].grid,\n.ui[class*="center aligned"].grid > .row > .column,\n.ui[class*="center aligned"].grid > .column,\n.ui.grid > [class*="center aligned"].aligned.row > .column {\n  text-align: center;\n}\n\n.ui.grid [class*="center aligned"].column {\n  text-align: center !important;\n}\n\n/* Right Aligned */\n\n.ui[class*="right aligned"].grid,\n.ui[class*="right aligned"].grid > .row > .column,\n.ui[class*="right aligned"].grid > .column,\n.ui.grid > [class*="right aligned"].aligned.row > .column {\n  text-align: right;\n}\n\n.ui.grid [class*="right aligned"].column {\n  text-align: right !important;\n}\n\n/* Justified */\n\n.ui.justified.grid,\n.ui.justified.grid > .row > .column,\n.ui.justified.grid > .column,\n.ui.grid .justified.column,\n.ui.grid > .justified.row > .column {\n  text-align: justify;\n  -webkit-hyphens: auto;\n  -moz-hyphens: auto;\n  -ms-hyphens: auto;\n  hyphens: auto;\n}\n\n.ui.grid .justified.column {\n  text-align: justify !important;\n  -webkit-hyphens: auto !important;\n  -moz-hyphens: auto !important;\n  -ms-hyphens: auto !important;\n  hyphens: auto !important;\n}\n\n/*----------------------\n   Vertically Aligned\n-----------------------*/\n\n/* Top Aligned */\n\n.ui[class*="top aligned"].grid,\n.ui[class*="top aligned"].grid > .row > .column,\n.ui[class*="top aligned"].grid > .column,\n.ui.grid [class*="top aligned"].column,\n.ui.grid > [class*="top aligned"].aligned.row > .column {\n  vertical-align: top;\n}\n\n.ui.grid [class*="top aligned"].column {\n  vertical-align: top !important;\n}\n\n/* Middle Aligned */\n\n.ui[class*="center aligned"].grid,\n.ui[class*="middle aligned"].grid > .row > .column,\n.ui[class*="middle aligned"].grid > .column,\n.ui.grid > [class*="middle aligned"].aligned.row > .column {\n  vertical-align: middle;\n}\n\n.ui.grid [class*="middle aligned"].column {\n  vertical-align: middle !important;\n}\n\n/* Bottom Aligned */\n\n.ui[class*="bottom aligned"].grid,\n.ui[class*="bottom aligned"].grid > .row > .column,\n.ui[class*="bottom aligned"].grid > .column,\n.ui.grid > [class*="bottom aligned"].aligned.row > .column {\n  vertical-align: bottom;\n}\n\n.ui.grid [class*="bottom aligned"].column {\n  vertical-align: bottom !important;\n}\n\n/*----------------------\n         Colored\n-----------------------*/\n\n.ui.grid > .white.row,\n.ui.grid .white.column {\n  background-color: #ffffff !important;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.grid > .row > .white.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .black.row,\n.ui.grid .black.column {\n  background-color: #1b1c1d !important;\n  color: #ffffff;\n}\n\n.ui.grid > .row > .black.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .blue.row,\n.ui.grid .blue.column {\n  background-color: #3b83c0 !important;\n  color: #ffffff;\n}\n\n.ui.grid > .row > .blue.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .green.row,\n.ui.grid .green.column {\n  background-color: #5bbd72 !important;\n  color: #ffffff;\n}\n\n.ui.grid > .row > .green.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .orange.row,\n.ui.grid .orange.column {\n  background-color: #e07b53 !important;\n  color: #ffffff;\n}\n\n.ui.grid > .row > .orange.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .pink.row,\n.ui.grid .pink.column {\n  background-color: #d9499a !important;\n  color: #ffffff;\n}\n\n.ui.grid > .row > .pink.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .purple.row,\n.ui.grid .purple.column {\n  background-color: #564f8a !important;\n  color: #ffffff;\n}\n\n.ui.grid > .row > .purple.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .red.row,\n.ui.grid .red.column {\n  background-color: #d95c5c !important;\n  color: #ffffff;\n}\n\n.ui.grid > .row > .red.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .teal.row,\n.ui.grid .teal.column {\n  background-color: #00b5ad !important;\n  color: #ffffff;\n}\n\n.ui.grid > .row > .teal.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n.ui.grid > .yellow.row,\n.ui.grid .yellow.column {\n  background-color: #f2c61f !important;\n  color: #ffffff;\n}\n\n.ui.grid > .row > .yellow.column {\n  margin-top: -1rem;\n  margin-bottom: -1rem;\n  padding-top: 1rem;\n  padding-bottom: 1rem;\n}\n\n/*----------------------\n  Equal Height Columns\n-----------------------*/\n\n.ui[class*="equal height"].grid {\n  display: table;\n  table-layout: fixed;\n}\n\n.ui[class*="equal height"].grid > .row,\n.ui[class*="equal height"].row {\n  display: table;\n  table-layout: fixed;\n  width: 100% !important;\n}\n\n.ui[class*="equal height"].grid > .column,\n.ui[class*="equal height"].grid > .row > .column,\n.ui.grid > [class*="equal height"].row > .column {\n  display: table-cell;\n}\n\n/*-------------------\n      Doubling\n--------------------*/\n\n/* Tablet Only */\n\n@media only screen and (min-width: 768px) and (max-width: 991px) {\n  .ui.doubling.grid {\n    width: 100% !important;\n  }\n\n  .ui.grid > .doubling.row,\n  .ui.doubling.grid > .row {\n    margin: 0em !important;\n    padding: 0em !important;\n  }\n\n  .ui.grid > .doubling.row > .column,\n  .ui.doubling.grid > .row > .column {\n    display: inline-block !important;\n    padding-top: 1rem !important;\n    padding-bottom: 1rem !important;\n    margin: 0em;\n  }\n\n  .ui[class*="two column"].doubling.grid > .row > .column,\n  .ui[class*="two column"].doubling.grid > .column,\n  .ui.grid > [class*="two column"].doubling.row > .column {\n    width: 100% !important;\n  }\n\n  .ui[class*="three column"].doubling.grid > .row > .column,\n  .ui[class*="three column"].doubling.grid > .column,\n  .ui.grid > [class*="three column"].doubling.row > .column {\n    width: 50% !important;\n  }\n\n  .ui[class*="four column"].doubling.grid > .row > .column,\n  .ui[class*="four column"].doubling.grid > .column,\n  .ui.grid > [class*="four column"].doubling.row > .column {\n    width: 50% !important;\n  }\n\n  .ui[class*="five column"].doubling.grid > .row > .column,\n  .ui[class*="five column"].doubling.grid > .column,\n  .ui.grid > [class*="five column"].doubling.row > .column {\n    width: 33.33333333% !important;\n  }\n\n  .ui[class*="six column"].doubling.grid > .row > .column,\n  .ui[class*="six column"].doubling.grid > .column,\n  .ui.grid > [class*="six column"].doubling.row > .column {\n    width: 33.33333333% !important;\n  }\n\n  .ui[class*="eight column"].doubling.grid > .row > .column,\n  .ui[class*="eight column"].doubling.grid > .column,\n  .ui.grid > [class*="eight column"].doubling.row > .column {\n    width: 33.33333333% !important;\n  }\n\n  .ui[class*="eight column"].doubling.grid > .row > .column,\n  .ui[class*="eight column"].doubling.grid > .column,\n  .ui.grid > [class*="eight column"].doubling.row > .column {\n    width: 25% !important;\n  }\n\n  .ui[class*="nine column"].doubling.grid > .row > .column,\n  .ui[class*="nine column"].doubling.grid > .column,\n  .ui.grid > [class*="nine column"].doubling.row > .column {\n    width: 25% !important;\n  }\n\n  .ui[class*="ten column"].doubling.grid > .row > .column,\n  .ui[class*="ten column"].doubling.grid > .column,\n  .ui.grid > [class*="ten column"].doubling.row > .column {\n    width: 20% !important;\n  }\n\n  .ui[class*="twelve column"].doubling.grid > .row > .column,\n  .ui[class*="twelve column"].doubling.grid > .column,\n  .ui.grid > [class*="twelve column"].doubling.row > .column {\n    width: 16.66666667% !important;\n  }\n\n  .ui[class*="fourteen column"].doubling.grid > .row > .column,\n  .ui[class*="fourteen column"].doubling.grid > .column,\n  .ui.grid > [class*="fourteen column"].doubling.row > .column {\n    width: 14.28571429% !important;\n  }\n\n  .ui[class*="sixteen column"].doubling.grid > .row > .column,\n  .ui[class*="sixteen column"].doubling.grid > .column,\n  .ui.grid > [class*="sixteen column"].doubling.row > .column {\n    width: 12.5% !important;\n  }\n}\n\n/* Mobily Only */\n\n@media only screen and (max-width: 767px) {\n  .ui.doubling.grid {\n    width: 100% !important;\n  }\n\n  .ui.grid > .doubling.row,\n  .ui.doubling.grid > .row {\n    display: block !important;\n    margin: 0em !important;\n    padding: 0em !important;\n  }\n\n  .ui.grid > .doubling.row > .column,\n  .ui.doubling.grid > .row > .column {\n    display: inline-block !important;\n    padding-top: 1rem !important;\n    padding-bottom: 1rem !important;\n    margin: 0em !important;\n  }\n\n  .ui[class*="two column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="two column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="two column"].doubling:not(.stackable).row > .column {\n    width: 100% !important;\n  }\n\n  .ui[class*="three column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="three column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="three column"].doubling:not(.stackable).row > .column {\n    width: 50% !important;\n  }\n\n  .ui[class*="four column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="four column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="four column"].doubling:not(.stackable).row > .column {\n    width: 50% !important;\n  }\n\n  .ui[class*="five column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="five column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="five column"].doubling:not(.stackable).row > .column {\n    width: 50% !important;\n  }\n\n  .ui[class*="six column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="six column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="six column"].doubling:not(.stackable).row > .column {\n    width: 50% !important;\n  }\n\n  .ui[class*="seven column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="seven column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="seven column"].doubling:not(.stackable).row > .column {\n    width: 50% !important;\n  }\n\n  .ui[class*="eight column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="eight column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="eight column"].doubling:not(.stackable).row > .column {\n    width: 50% !important;\n  }\n\n  .ui[class*="nine column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="nine column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="nine column"].doubling:not(.stackable).row > .column {\n    width: 33.33333333% !important;\n  }\n\n  .ui[class*="ten column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="ten column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="ten column"].doubling:not(.stackable).row > .column {\n    width: 33.33333333% !important;\n  }\n\n  .ui[class*="twelve column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="twelve column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="twelve column"].doubling:not(.stackable).row > .column {\n    width: 33.33333333% !important;\n  }\n\n  .ui[class*="fourteen column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="fourteen column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="fourteen column"].doubling:not(.stackable).row > .column {\n    width: 25% !important;\n  }\n\n  .ui[class*="sixteen column"].doubling:not(.stackable).grid > .row > .column,\n  .ui[class*="sixteen column"].doubling:not(.stackable).grid > .column,\n  .ui.grid > [class*="sixteen column"].doubling:not(.stackable).row > .column {\n    width: 25% !important;\n  }\n}\n\n/*-------------------\n      Stackable\n--------------------*/\n\n@media only screen and (max-width: 767px) {\n  .ui.stackable.grid {\n    display: block !important;\n    width: auto;\n    margin-left: -1rem;\n    margin-right: -1rem;\n    padding: 0em;\n  }\n\n  .ui.stackable.grid > .row > .wide.column,\n  .ui.stackable.grid > .wide.column,\n  .ui.stackable.grid > .column.grid > .column,\n  .ui.stackable.grid > .column.row > .column,\n  .ui.stackable.grid > .row > .column,\n  .ui.stackable.grid > .column:not(.row) {\n    display: block !important;\n    width: auto !important;\n    margin: 0em 0em !important;\n    padding: 1rem 2rem !important;\n    box-shadow: none !important;\n  }\n\n  .ui.stackable.grid > .row {\n    margin: 0em;\n    padding: 0em;\n  }\n\n  .ui.stackable.celled.grid > .column:not(.row),\n  .ui.stackable.divided.grid > .column:not(.row),\n  .ui.stackable.celled.grid > .row > .column,\n  .ui.stackable.divided.grid > .row > .column {\n    border-top: 1px solid rgba(39, 41, 43, 0.15);\n    box-shadow: none !important;\n  }\n\n  .ui.inverted.stackable.celled.grid > .column:not(.row),\n  .ui.inverted.stackable.divided.grid > .column:not(.row),\n  .ui.inverted.stackable.celled.grid > .row > .column,\n  .ui.inverted.stackable.divided.grid > .row > .column {\n    border-top: 1px solid rgba(255, 255, 255, 0.2);\n  }\n\n  .ui.stackable.divided.grid > .row:first-child > .column:first-child,\n  .ui.stackable.celled.grid > .row:first-child > .column:first-child,\n  .ui.stackable.divided.grid > .column:not(.row):first-child,\n  .ui.stackable.celled.grid > .column:not(.row):first-child {\n    border-top: none !important;\n  }\n\n  .ui[class*="equal height"].stackable.page.grid {\n    display: block !important;\n    width: 100% !important;\n  }\n\n  /* Remove pointers from vertical menus */\n\n  .ui.stackable.grid .vertical.pointing.menu .item:after {\n    display: none;\n  }\n}\n\n/*----------------------\n     Only (Device)\n-----------------------*/\n\n/* These include arbitrary class repetitions for forced specificity */\n\n/* Mobile Only Hide */\n\n@media only screen and (max-width: 767px) {\n  .ui.tablet:not(.mobile).only.grid.grid.grid,\n  .ui.grid.grid.grid > [class*="tablet only"].row:not(.mobile),\n  .ui.grid.grid.grid > [class*="tablet only"].column:not(.mobile),\n  .ui.grid.grid.grid > .row > [class*="tablet only"].column:not(.mobile) {\n    display: none !important;\n  }\n\n  .ui[class*="computer only"].grid.grid.grid:not(.mobile),\n  .ui.grid.grid.grid > [class*="computer only"].row:not(.mobile),\n  .ui.grid.grid.grid > [class*="computer only"].column:not(.mobile),\n  .ui.grid.grid.grid > .row > [class*="computer only"].column:not(.mobile) {\n    display: none !important;\n  }\n}\n\n/* Tablet Only Hide */\n\n@media only screen and (min-width: 768px) and (max-width: 991px) {\n  .ui[class*="mobile only"].grid.grid.grid:not(.tablet),\n  .ui.grid.grid.grid > [class*="mobile only"].row:not(.tablet),\n  .ui.grid.grid.grid > [class*="mobile only"].column:not(.tablet),\n  .ui.grid.grid.grid > .row > [class*="mobile only"].column:not(.tablet) {\n    display: none !important;\n  }\n\n  .ui[class*="computer only"].grid.grid.grid:not(.tablet),\n  .ui.grid.grid.grid > [class*="computer only"].row:not(.tablet),\n  .ui.grid.grid.grid > [class*="computer only"].column:not(.tablet),\n  .ui.grid.grid.grid > .row > [class*="computer only"].column:not(.tablet) {\n    display: none !important;\n  }\n}\n\n/* Computer Only Hide */\n\n@media only screen and (min-width: 992px) {\n  .ui[class*="mobile only"].grid.grid.grid:not(.computer),\n  .ui.grid.grid.grid > [class*="mobile only"].row:not(.computer),\n  .ui.grid.grid.grid > [class*="mobile only"].column:not(.computer),\n  .ui.grid.grid.grid > .row > [class*="mobile only"].column:not(.computer) {\n    display: none !important;\n  }\n\n  .ui[class*="tablet only"].grid.grid.grid:not(.computer),\n  .ui.grid.grid.grid > [class*="tablet only"].row:not(.computer),\n  .ui.grid.grid.grid > [class*="tablet only"].column:not(.computer),\n  .ui.grid.grid.grid > .row > [class*="tablet only"].column:not(.computer) {\n    display: none !important;\n  }\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Standard\n*******************************/\n\n/*--------------\n      Menu\n---------------*/\n\n.ui.menu {\n  margin: 1rem 0rem;\n  background: #ffffff;\n  font-size: 0px;\n  font-weight: normal;\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15), 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n  border-radius: 0.2857rem;\n}\n\n.ui.menu:after {\n  content: \'\';\n  display: block;\n  height: 0px;\n  clear: both;\n  visibility: hidden;\n}\n\n.ui.menu:first-child {\n  margin-top: 0rem;\n}\n\n.ui.menu:last-child {\n  margin-bottom: 0rem;\n}\n\n/*--------------\n     Colors\n---------------*/\n\n/* Text Color */\n\n.ui.menu .item {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.menu .item .item {\n  color: rgba(0, 0, 0, 0.5);\n}\n\n/* Hover */\n\n.ui.menu .item .menu a.item:hover,\n.ui.menu .item .menu .link.item:hover {\n  color: rgba(0, 0, 0, 0.85);\n}\n\n/*--------------\n      Items\n---------------*/\n\n.ui.menu .item {\n  position: relative;\n  display: inline-block;\n  padding: 0.78571em 0.95em;\n  border-top: 0em solid transparent;\n  background: none;\n  vertical-align: middle;\n  line-height: 1;\n  text-decoration: none;\n  box-sizing: border-box;\n  -webkit-tap-highlight-color: transparent;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n  -webkit-transition: opacity 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;\n  transition: opacity 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;\n}\n\n.ui.menu .menu {\n  margin: 0em;\n}\n\n/* Floated Content */\n\n.ui.menu > .item:first-child {\n  border-radius: 0.2857rem 0px 0px 0.2857rem;\n}\n\n.ui.menu:not(.vertical) .item.left,\n.ui.menu:not(.vertical) .menu.left {\n  float: left;\n}\n\n.ui.menu:not(.vertical) .item.right,\n.ui.menu:not(.vertical) .menu.right {\n  float: right;\n}\n\n/*--------------\n    Borders\n---------------*/\n\n.ui.menu .item:before {\n  position: absolute;\n  content: \'\';\n  top: 0%;\n  right: 0px;\n  width: 1px;\n  height: 100%;\n  background: -webkit-linear-gradient(rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.1) 50%, rgba(0, 0, 0, 0.05) 100%);\n  background: linear-gradient(rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.1) 50%, rgba(0, 0, 0, 0.05) 100%);\n}\n\n.ui.menu > .right.menu:first-child {\n  display: none;\n}\n\n.ui.menu .menu.right .item:before,\n.ui.menu .item.right:before {\n  right: auto;\n  left: 0px;\n}\n\n/*--------------\n  Text Content\n---------------*/\n\n.ui.menu .text.item > *,\n.ui.menu .item > a:not(.ui),\n.ui.menu .item > p:only-child {\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n  line-height: 1.3;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.menu .item > p:first-child {\n  margin-top: 0;\n}\n\n.ui.menu .item > p:last-child {\n  margin-bottom: 0;\n}\n\n/*--------------\n      Icons\n---------------*/\n\n.ui.menu .item > i.icon {\n  opacity: 0.75;\n  float: none;\n  margin: 0em 0.25em 0em 0em;\n}\n\n.ui.menu .item > i.dropdown.icon {\n  float: right;\n  margin-left: 1em;\n}\n\n/*--------------\n     Button\n---------------*/\n\n.ui.menu:not(.vertical) .item > .button {\n  position: relative;\n  top: -0.05em;\n  margin: -0.55em 0;\n  padding-bottom: 0.55em;\n  padding-top: 0.55em;\n  font-size: 0.875em;\n}\n\n/*--------------\n     Inputs\n---------------*/\n\n.ui.menu .item > .input {\n  width: 100%;\n}\n\n.ui.menu:not(.vertical) .item > .input {\n  position: relative;\n  top: 0em;\n  margin: -0.6em 0em;\n}\n\n.ui.menu .item > .input input {\n  font-size: 1em;\n  padding-top: 0.4em;\n  padding-bottom: 0.4em;\n}\n\n.ui.menu .item > .input .button,\n.ui.menu .item > .input .label {\n  padding-top: 0.4em;\n  padding-bottom: 0.4em;\n}\n\n/* Resizes */\n\n.ui.small.menu .item > .input input {\n  top: 0em;\n  padding-top: 0.4em;\n  padding-bottom: 0.4em;\n}\n\n.ui.small.menu .item > .input .button,\n.ui.small.menu .item > .input .label {\n  padding-top: 0.4em;\n  padding-bottom: 0.4em;\n}\n\n.ui.large.menu .item > .input input {\n  top: -0.125em;\n  padding-bottom: 0.6em;\n  padding-top: 0.6em;\n}\n\n.ui.large.menu .item > .input .button,\n.ui.large.menu .item > .input .label {\n  padding-top: 0.6em;\n  padding-bottom: 0.6em;\n}\n\n/*--------------\n     Header\n---------------*/\n\n.ui.menu .header.item,\n.ui.vertical.menu .header.item {\n  background: rgba(0, 0, 0, 0.04);\n  margin: 0em;\n  text-transform: normal;\n  font-weight: bold;\n}\n\n/*--------------\n    Dropdowns\n---------------*/\n\n/* Dropdown */\n\n.ui.menu .ui.dropdown.visible {\n  background: rgba(0, 0, 0, 0.03);\n  border-bottom-right-radius: 0em;\n  border-bottom-left-radius: 0em;\n}\n\n.ui.menu .ui.dropdown.active {\n  box-shadow: none;\n}\n\n/* Menu Position */\n\n.ui.menu .dropdown.item .menu {\n  background: #ffffff;\n  left: 0px;\n  margin: 0px 0px 0px;\n  min-width: -webkit-calc(100% - 1px);\n  min-width: calc(100% - 1px);\n  box-shadow: 0px 1px 3px 0px rgba(0, 0, 0, 0.08);\n}\n\n.ui.menu:not(.secondary) .pointing.dropdown.item .menu {\n  margin-top: 0px;\n  border-top-left-radius: 0em;\n  border-top-right-radius: 0em;\n}\n\n.ui.menu .simple.dropdown.item .menu {\n  margin: 0px !important;\n}\n\n/* Secondary Menu Dropdown */\n\n.ui.secondary.menu > .menu > .active.dropdown.item {\n  background-color: transparent;\n}\n\n.ui.secondary.menu .dropdown.item .menu {\n  left: 0px;\n  min-width: 100%;\n}\n\n/* Even Width Menu Dropdown */\n\n.ui.item.menu .dropdown .menu .item {\n  width: 100%;\n}\n\n/*--------------\n     Labels\n---------------*/\n\n.ui.menu .item > .label {\n  background: rgba(0, 0, 0, 0.35);\n  color: #ffffff;\n  margin: -0.15em 0em -0.15em 0.5em;\n  padding: 0.3em 0.8em;\n  vertical-align: baseline;\n}\n\n.ui.menu .item > .floating.label {\n  padding: 0.3em 0.8em;\n}\n\n/*--------------\n     Images\n---------------*/\n\n.ui.menu .item > img:only-child {\n  display: block;\n  max-width: 100%;\n  margin: 0em auto;\n}\n\n/*******************************\n             States\n*******************************/\n\n/*--------------\n      Hover\n---------------*/\n\n.ui.link.menu > .item:hover,\n.ui.menu > .link.item:hover,\n.ui.menu > a.item:hover,\n.ui.link.menu .menu > .item:hover,\n.ui.menu .menu > .link.item:hover,\n.ui.menu .menu > a.item:hover {\n  cursor: pointer;\n  background: rgba(0, 0, 0, 0.03);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------\n     Pressed\n---------------*/\n\n.ui.link.menu .item:active,\n.ui.menu .link.item:active,\n.ui.menu a.item:active {\n  background: rgba(0, 0, 0, 0.03);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------\n     Active\n---------------*/\n\n.ui.menu .active.item {\n  background: rgba(0, 0, 0, 0.03);\n  color: rgba(0, 0, 0, 0.8);\n  font-weight: normal;\n  box-shadow: 0em 2px 0em inset;\n}\n\n.ui.menu .active.item > i.icon {\n  opacity: 1;\n}\n\n/* Vertical */\n\n.ui.vertical.menu .active.item {\n  background: rgba(0, 0, 0, 0.03);\n  border-radius: 0em;\n  box-shadow: 2px 0em 0em inset;\n}\n\n.ui.vertical.menu > .active.item:first-child {\n  border-radius: 0em 0.2857rem 0em 0em;\n}\n\n.ui.vertical.menu > .active.item:last-child {\n  border-radius: 0em 0em 0.2857rem 0em;\n}\n\n.ui.vertical.menu > .active.item:only-child {\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n}\n\n.ui.vertical.menu .active.item .menu .active.item {\n  border-left: none;\n}\n\n.ui.vertical.menu .item .menu .active.item {\n  background-color: transparent;\n  box-shadow: none;\n}\n\n/*--------------\n  Active Hover\n---------------*/\n\n.ui.vertical.menu .active.item:hover,\n.ui.menu .active.item:hover {\n  background-color: rgba(0, 0, 0, 0.03);\n}\n\n/*--------------\n     Disabled\n---------------*/\n\n.ui.menu .item.disabled,\n.ui.menu .item.disabled:hover {\n  cursor: default;\n  color: rgba(40, 40, 40, 0.3);\n  background-color: transparent !important;\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*--------------\n    Vertical\n---------------*/\n\n.ui.vertical.menu {\n  background: #ffffff;\n}\n\n/*--- Item ---*/\n\n.ui.vertical.menu .item {\n  background: none;\n  display: block;\n  height: auto !important;\n  border-top: none;\n  border-left: 0em solid transparent;\n  border-right: none;\n}\n\n.ui.vertical.menu > .item:first-child {\n  border-radius: 0.2857rem 0.2857rem 0px 0px;\n}\n\n.ui.vertical.menu > .item:last-child {\n  border-radius: 0px 0px 0.2857rem 0.2857rem;\n}\n\n/*--- Label ---*/\n\n.ui.vertical.menu .item > .label {\n  float: right;\n  text-align: center;\n}\n\n/*--- Icon ---*/\n\n.ui.vertical.menu .item > i.icon {\n  width: 1.18em;\n  float: right;\n  margin: 0em 0em 0em 0.5em;\n}\n\n.ui.vertical.menu .item > .label + i.icon {\n  float: none;\n  margin: 0em 0.5em 0em 0em;\n}\n\n/*--- Border ---*/\n\n.ui.vertical.menu .item:before {\n  position: absolute;\n  content: \'\';\n  top: 0%;\n  left: 0px;\n  width: 100%;\n  background: -webkit-linear-gradient(left, rgba(0, 0, 0, 0.03) 0%, rgba(0, 0, 0, 0.1) 1.5em, rgba(0, 0, 0, 0.03) 100%);\n  background: linear-gradient(to right, rgba(0, 0, 0, 0.03) 0%, rgba(0, 0, 0, 0.1) 1.5em, rgba(0, 0, 0, 0.03) 100%);\n  height: 1px;\n}\n\n.ui.vertical.menu .item:first-child:before {\n  background: none !important;\n}\n\n/*--- Dropdown ---*/\n\n.ui.vertical.menu .dropdown.item > .icon {\n  float: right;\n  content: "\f0da";\n  margin-left: 1em;\n}\n\n.ui.vertical.menu .dropdown.item .menu {\n  top: 0% !important;\n  left: 100%;\n  margin: 0px 0px 0px 0px;\n  box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.08);\n}\n\n.ui.vertical.menu .dropdown.item.active {\n  border-top-right-radius: 0em;\n  border-bottom-right-radius: 0em;\n}\n\n.ui.vertical.menu .dropdown.item .menu .item {\n  font-size: 1rem;\n}\n\n.ui.vertical.menu .dropdown.item .menu .item i.icon {\n  margin-right: 0em;\n}\n\n.ui.vertical.menu .dropdown.item.active {\n  box-shadow: none;\n}\n\n/*--- Sub Menu ---*/\n\n.ui.vertical.menu .item:not(.dropdown) > .menu {\n  margin: 0.5em -0.95em 0em;\n}\n\n.ui.vertical.menu .item:not(.dropdown) > .menu > .item {\n  background: none;\n  padding: 0.5rem 1.5rem;\n  font-size: 0.875rem;\n}\n\n.ui.vertical.menu .item > .menu > .item:before {\n  display: none;\n}\n\n/*--------------\n     Tiered\n---------------*/\n\n.ui.tiered.menu > .menu > .item:hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.tiered.menu .active.item {\n  background: #fcfcfc;\n}\n\n.ui.tiered.menu > .menu .item.active:after {\n  position: absolute;\n  content: \'\';\n  margin-top: -1px;\n  top: 100%;\n  left: 0px;\n  width: 100%;\n  height: 2px;\n  background-color: #fcfcfc;\n}\n\n/* Sub Menu */\n\n.ui.tiered.menu .sub.menu {\n  background-color: #fcfcfc;\n  border-radius: 0em;\n  border-top: 1px solid rgba(39, 41, 43, 0.15);\n  box-shadow: none;\n}\n\n.ui.tiered.menu > .sub.menu > .item {\n  color: rgba(0, 0, 0, 0.4);\n  font-weight: normal;\n  text-transform: normal;\n  font-size: 0.875rem;\n}\n\n/* Sub Menu Divider */\n\n.ui.tiered.menu .sub.menu .item:before {\n  background: none;\n}\n\n/* Sub Menu Hover */\n\n.ui.tiered.menu .sub.menu .item:hover {\n  background: none transparent;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Sub Menu Active */\n\n.ui.tiered.menu .sub.menu .active.item {\n  padding-top: 0.78571em;\n  background: none transparent;\n  border-radius: 0;\n  border-top: medium none;\n  box-shadow: none;\n  color: rgba(0, 0, 0, 0.8) !important;\n}\n\n.ui.tiered.menu .sub.menu .active.item:after {\n  display: none;\n}\n\n/* Inverted Tiered Menu */\n\n.ui.inverted.tiered.menu > .menu > .item {\n  color: rgba(255, 255, 255, 0.5);\n}\n\n.ui.inverted.tiered.menu .sub.menu {\n  background-color: rgba(0, 0, 0, 0.2);\n}\n\n.ui.inverted.tiered.menu .sub.menu .item {\n  color: rgba(255, 255, 255, 0.8);\n}\n\n.ui.inverted.tiered.menu > .menu > .item:hover {\n  color: #ffffff;\n}\n\n.ui.inverted.tiered.menu .active.item:after {\n  display: none;\n}\n\n.ui.inverted.tiered.menu > .sub.menu > .active.item,\n.ui.inverted.tiered.menu > .menu > .active.item {\n  color: #ffffff !important;\n  box-shadow: none;\n}\n\n/* Tiered Pointing */\n\n.ui.pointing.tiered.menu > .menu > .item:after {\n  display: none;\n}\n\n.ui.pointing.tiered.menu > .sub.menu > .item:after {\n  display: block;\n}\n\n/*--------------\n     Tabular\n---------------*/\n\n.ui.tabular.menu {\n  background-color: transparent;\n  border-bottom: 1px solid #d4d4d5;\n  border-radius: 0em;\n  box-shadow: none !important;\n}\n\n.ui.tabular.menu .item {\n  background-color: transparent;\n  border-left: 1px solid transparent;\n  border-right: 1px solid transparent;\n  border-top: 1px solid transparent;\n  padding-left: 1.4em;\n  padding-right: 1.4em;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.tabular.menu .item:before {\n  display: none;\n}\n\n/* Hover */\n\n.ui.tabular.menu .item:hover {\n  background-color: transparent;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Active */\n\n.ui.tabular.menu .active.item {\n  position: relative;\n  background-color: #ffffff;\n  color: rgba(0, 0, 0, 0.8);\n  border-color: #d4d4d5;\n  font-weight: bold;\n  margin-bottom: -1px;\n  border-bottom: 1px solid #ffffff;\n  box-shadow: none;\n  border-radius: 5px 5px 0px 0px;\n}\n\n/* Coupling with segment for attachment */\n\n.ui.attached.tabular.menu {\n  position: relative;\n  z-index: 2;\n}\n\n.ui.tabular.menu ~ .bottom.attached.segment {\n  margin: -1px 0px 0px;\n}\n\n/*--------------\n   Pagination\n---------------*/\n\n.ui.pagination.menu {\n  margin: 0em;\n  display: inline-block;\n  vertical-align: middle;\n}\n\n.ui.pagination.menu .item {\n  min-width: 3em;\n  text-align: center;\n}\n\n.ui.pagination.menu .icon.item i.icon {\n  vertical-align: top;\n}\n\n.ui.pagination.menu.floated {\n  display: block;\n}\n\n/* Active */\n\n.ui.pagination.menu .active.item {\n  border-top: none;\n  padding-top: 0.78571em;\n  background-color: rgba(0, 0, 0, 0.03);\n  box-shadow: none;\n}\n\n/*--------------\n   Secondary\n---------------*/\n\n.ui.secondary.menu {\n  background: none;\n  border-radius: 0em;\n  box-shadow: none;\n}\n\n.ui.secondary.menu > .menu > .item,\n.ui.secondary.menu > .item {\n  box-shadow: none;\n  border: none;\n  height: auto !important;\n  background: none;\n  margin: 0em 0.25em;\n  padding: 0.5em 0.8em;\n  border-radius: 0.2857rem;\n}\n\n.ui.secondary.menu > .menu > .item:before,\n.ui.secondary.menu > .item:before {\n  display: none !important;\n}\n\n.ui.secondary.menu .item > .input input {\n  background-color: transparent;\n  border: none;\n}\n\n.ui.secondary.menu .link.item,\n.ui.secondary.menu a.item {\n  opacity: 0.8;\n  -webkit-transition: none;\n  transition: none;\n}\n\n.ui.secondary.menu .header.item {\n  border-right: 0.1em solid rgba(0, 0, 0, 0.1);\n  background: none transparent;\n  border-radius: 0em;\n}\n\n/* Hover */\n\n.ui.secondary.menu .link.item:hover,\n.ui.secondary.menu a.item:hover {\n  opacity: 1;\n}\n\n/* Active */\n\n.ui.secondary.menu > .menu > .active.item,\n.ui.secondary.menu > .active.item {\n  background: rgba(0, 0, 0, 0.05);\n  opacity: 1;\n  box-shadow: none;\n}\n\n.ui.secondary.vertical.menu > .active.item {\n  border-radius: 0.2857rem;\n}\n\n/* Inverted */\n\n.ui.secondary.inverted.menu .link.item,\n.ui.secondary.inverted.menu a.item {\n  color: rgba(255, 255, 255, 0.8);\n}\n\n.ui.secondary.inverted.menu .link.item:hover,\n.ui.secondary.inverted.menu a.item:hover {\n  color: #ffffff;\n}\n\n.ui.secondary.inverted.menu .active.item {\n  background-color: rgba(255, 255, 255, 0.05);\n}\n\n/* Disable variations */\n\n.ui.secondary.item.menu > .item {\n  margin: 0em;\n}\n\n.ui.secondary.attached.menu {\n  box-shadow: none;\n}\n\n/*---------------------\n   Secondary Vertical\n-----------------------*/\n\n.ui.secondary.vertical.menu > .item {\n  border: none;\n  margin: 0em 0em 0.3em;\n  border-radius: 0.2857rem;\n}\n\n.ui.secondary.vertical.menu > .header.item {\n  border-radius: 0em;\n}\n\n/* Inverted */\n\n.ui.secondary.inverted.menu {\n  background-color: transparent;\n}\n\n.ui.secondary.inverted.pointing.menu {\n  border-bottom: 3px solid rgba(255, 255, 255, 0.1);\n}\n\n.ui.secondary.inverted.pointing.menu > .item {\n  color: rgba(255, 255, 255, 0.7);\n}\n\n.ui.secondary.inverted.pointing.menu > .header.item {\n  color: #FFFFFF !important;\n}\n\n/* Hover */\n\n.ui.secondary.inverted.pointing.menu > .menu > .item:hover,\n.ui.secondary.inverted.pointing.menu > .item:hover {\n  color: rgba(255, 255, 255, 0.85);\n}\n\n/* Pressed */\n\n.ui.secondary.inverted.pointing.menu > .menu > .item:active,\n.ui.secondary.inverted.pointing.menu > .item:active {\n  border-color: rgba(255, 255, 255, 0.4);\n}\n\n/* Active */\n\n.ui.secondary.inverted.pointing.menu > .menu > .item.active,\n.ui.secondary.inverted.pointing.menu > .item.active {\n  border-color: rgba(255, 255, 255, 0.8);\n  color: #ffffff;\n}\n\n/*---------------------\n   Secondary Pointing\n-----------------------*/\n\n.ui.secondary.pointing.menu {\n  border-bottom: 3px solid rgba(0, 0, 0, 0.1);\n}\n\n.ui.secondary.pointing.menu > .menu > .item,\n.ui.secondary.pointing.menu > .item {\n  margin: 0em 0em -3px;\n  padding: 0.6em 0.95em;\n  border-bottom: 3px solid transparent;\n  border-radius: 0em;\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n/* Item Types */\n\n.ui.secondary.pointing.menu .header.item {\n  margin-bottom: -3px;\n  background-color: transparent !important;\n  border-right-width: 0px !important;\n  font-weight: bold !important;\n  color: rgba(0, 0, 0, 0.85) !important;\n}\n\n.ui.secondary.pointing.menu .text.item {\n  box-shadow: none !important;\n}\n\n.ui.secondary.pointing.menu > .menu > .item:after,\n.ui.secondary.pointing.menu > .item:after {\n  display: none;\n}\n\n/* Hover */\n\n.ui.secondary.pointing.menu > .menu > .link.item:hover,\n.ui.secondary.pointing.menu > .link.item:hover,\n.ui.secondary.pointing.menu > .menu > a.item:hover,\n.ui.secondary.pointing.menu > a.item:hover {\n  background-color: transparent;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Pressed */\n\n.ui.secondary.pointing.menu > .menu > .link.item:active,\n.ui.secondary.pointing.menu > .link.item:active,\n.ui.secondary.pointing.menu > .menu > a.item:active,\n.ui.secondary.pointing.menu > a.item:active {\n  background-color: transparent;\n  border-color: rgba(0, 0, 0, 0.2);\n}\n\n/* Active */\n\n.ui.secondary.pointing.menu > .menu > .item.active,\n.ui.secondary.pointing.menu > .item.active {\n  background-color: transparent;\n  border-color: rgba(0, 0, 0, 0.4);\n  box-shadow: none;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Secondary Vertical Pointing */\n\n.ui.secondary.vertical.pointing.menu {\n  border: none;\n  border-right: 3px solid rgba(0, 0, 0, 0.1);\n}\n\n.ui.secondary.vertical.pointing.menu > .item {\n  margin: 0em -3px 0em 0em;\n  border-bottom: none;\n  border-right: 3px solid transparent;\n  border-radius: 0em;\n}\n\n/* Hover */\n\n.ui.secondary.vertical.pointing.menu > .item:hover {\n  background-color: transparent;\n  color: rgba(0, 0, 0, 0.7);\n}\n\n/* Pressed */\n\n.ui.secondary.vertical.pointing.menu > .item:active {\n  background-color: transparent;\n  border-color: rgba(0, 0, 0, 0.2);\n}\n\n/* Active */\n\n.ui.secondary.vertical.pointing.menu > .item.active {\n  background-color: transparent;\n  border-color: rgba(0, 0, 0, 0.4);\n  color: rgba(0, 0, 0, 0.85);\n}\n\n/* Inverted Vertical Pointing Secondary */\n\n.ui.secondary.inverted.vertical.pointing.menu {\n  border-right: 3px solid rgba(255, 255, 255, 0.1);\n  border-bottom: none;\n}\n\n/*--------------\n    Text Menu\n---------------*/\n\n.ui.text.menu {\n  display: inline-block;\n  background: none transparent;\n  margin: 1rem -1rem;\n  border-radius: 0px;\n  box-shadow: none;\n}\n\n.ui.text.menu > .item {\n  opacity: 0.8;\n  margin: 0em 1em;\n  padding: 0em;\n  height: auto !important;\n  border-radius: 0px;\n  box-shadow: none;\n  -webkit-transition: opacity 0.2s ease;\n  transition: opacity 0.2s ease;\n}\n\n.ui.text.menu > .item:before {\n  display: none !important;\n}\n\n.ui.text.menu .header.item {\n  background-color: transparent;\n  opacity: 1;\n  color: rgba(50, 50, 50, 0.8);\n  font-size: 0.875rem;\n  padding: 0em;\n  text-transform: uppercase;\n  font-weight: bold;\n}\n\n.ui.text.menu .text.item {\n  opacity: 1;\n  color: rgba(50, 50, 50, 0.8);\n  font-weight: bold;\n}\n\n/*--- fluid text ---*/\n\n.ui.text.item.menu .item {\n  margin: 0em;\n}\n\n/*--- vertical text ---*/\n\n.ui.vertical.text.menu {\n  margin: 1rem 0em;\n}\n\n.ui.vertical.text.menu:first-child {\n  margin-top: 0rem;\n}\n\n.ui.vertical.text.menu:last-child {\n  margin-bottom: 0rem;\n}\n\n.ui.vertical.text.menu .item {\n  float: left;\n  clear: left;\n  margin: 0.5em 0em;\n}\n\n.ui.vertical.text.menu .item > i.icon {\n  float: none;\n  margin: 0em 0.78571em 0em 0em;\n}\n\n.ui.vertical.text.menu .header.item {\n  margin: 0.8em 0em;\n}\n\n/*--- hover ---*/\n\n.ui.text.menu .item:hover {\n  opacity: 1;\n  background-color: transparent;\n}\n\n/*--- active ---*/\n\n.ui.text.menu .active.item {\n  background-color: transparent;\n  padding: 0em;\n  border: none;\n  opacity: 1;\n  font-weight: bold;\n  box-shadow: none;\n}\n\n/* disable variations */\n\n.ui.text.pointing.menu .active.item:after {\n  box-shadow: none;\n}\n\n.ui.text.attached.menu {\n  box-shadow: none;\n}\n\n.ui.inverted.text.menu,\n.ui.inverted.text.menu .item,\n.ui.inverted.text.menu .item:hover,\n.ui.inverted.text.menu .item.active {\n  background-color: transparent;\n}\n\n/*--------------\n    Icon Only\n---------------*/\n\n.ui.icon.menu,\n.ui.vertical.icon.menu {\n  width: auto;\n  display: inline-block;\n  height: auto;\n}\n\n.ui.icon.menu > .item {\n  height: auto;\n  text-align: center;\n  color: rgba(60, 60, 60, 0.7);\n}\n\n.ui.icon.menu > .item > .icon {\n  display: block;\n  float: none !important;\n  opacity: 1;\n  margin: 0em auto !important;\n}\n\n.ui.icon.menu .icon:before {\n  opacity: 1;\n}\n\n/* Item Icon Only */\n\n.ui.menu .icon.item .icon {\n  margin: 0em;\n}\n\n.ui.vertical.icon.menu {\n  float: none;\n}\n\n/*--- inverted ---*/\n\n.ui.inverted.icon.menu .item {\n  color: rgba(255, 255, 255, 0.8);\n}\n\n.ui.inverted.icon.menu .icon {\n  color: #ffffff;\n}\n\n/*--------------\n   Labeled Icon\n---------------*/\n\n.ui.labeled.icon.menu {\n  text-align: center;\n}\n\n.ui.labeled.icon.menu > .item {\n  min-width: 6em;\n}\n\n.ui.labeled.icon.menu > .item > .icon {\n  display: block;\n  font-size: 1.5em !important;\n  margin: 0em auto 0.5em !important;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------\n    Colors\n---------------*/\n\n/*--- Light Colors  ---*/\n\n.ui.menu .blue.active.item,\n.ui.blue.menu .active.item {\n  border-color: #3b83c0 !important;\n  color: #3b83c0 !important;\n}\n\n.ui.menu .green.active.item,\n.ui.green.menu .active.item {\n  border-color: #5bbd72 !important;\n  color: #5bbd72 !important;\n}\n\n.ui.menu .orange.active.item,\n.ui.orange.menu .active.item {\n  border-color: #e07b53 !important;\n  color: #e07b53 !important;\n}\n\n.ui.menu .pink.active.item,\n.ui.pink.menu .active.item {\n  border-color: #d9499a !important;\n  color: #d9499a !important;\n}\n\n.ui.menu .purple.active.item,\n.ui.purple.menu .active.item {\n  border-color: #564f8a !important;\n  color: #564f8a !important;\n}\n\n.ui.menu .red.active.item,\n.ui.red.menu .active.item {\n  border-color: #d95c5c !important;\n  color: #d95c5c !important;\n}\n\n.ui.menu .teal.active.item,\n.ui.teal.menu .active.item {\n  border-color: #00b5ad !important;\n  color: #00b5ad !important;\n}\n\n.ui.menu .yellow.active.item,\n.ui.yellow.menu .active.item {\n  border-color: #f2c61f !important;\n  color: #f2c61f !important;\n}\n\n/*--------------\n    Inverted\n---------------*/\n\n.ui.inverted.menu {\n  background: #1b1c1d;\n  box-shadow: none;\n}\n\n.ui.inverted.menu .header.item {\n  margin: 0em;\n  background: rgba(0, 0, 0, 0.3);\n  box-shadow: none;\n}\n\n.ui.inverted.menu .item,\n.ui.inverted.menu .item > a:not(.ui) {\n  color: #ffffff;\n}\n\n.ui.inverted.menu .item:not(.dropdown).menu {\n  background: transparent;\n}\n\n.ui.inverted.menu .item .item,\n.ui.inverted.menu .item .item > a:not(.ui) {\n  color: rgba(255, 255, 255, 0.5);\n}\n\n.ui.inverted.menu .dropdown .menu .item {\n  color: rgba(0, 0, 0, 0.8) !important;\n}\n\n.ui.inverted.menu .item.disabled,\n.ui.inverted.menu .item.disabled:hover {\n  color: rgba(225, 225, 225, 0.3);\n}\n\n/*--- Border ---*/\n\n.ui.inverted.menu .item:before {\n  background: -webkit-linear-gradient(rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n  background: linear-gradient(rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n}\n\n.ui.vertical.inverted.menu .item:before {\n  background: -webkit-linear-gradient(left, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n  background: linear-gradient(to right, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.03) 100%);\n}\n\n/*--- Hover ---*/\n\n.ui.link.inverted.menu .item:hover,\n.ui.inverted.menu .link.item:hover,\n.ui.inverted.menu a.item:hover,\n.ui.inverted.menu .dropdown.item:hover {\n  background: rgba(255, 255, 255, 0.1);\n  color: #ffffff;\n}\n\n.ui.inverted.menu .item .menu a.item:hover,\n.ui.inverted.menu .item .menu .link.item:hover {\n  background: transparent;\n  color: #ffffff;\n}\n\n/*--- Pressed ---*/\n\n.ui.inverted.menu a.item:active,\n.ui.inverted.menu .dropdown.item:active,\n.ui.inverted.menu .link.item:active,\n.ui.inverted.menu a.item:active {\n  background: rgba(255, 255, 255, 0.15);\n  color: #ffffff;\n}\n\n/*--- Active ---*/\n\n.ui.inverted.menu .active.item {\n  box-shadow: none !important;\n  background: rgba(255, 255, 255, 0.2);\n  color: #ffffff !important;\n}\n\n.ui.inverted.vertical.menu .item .menu .active.item {\n  background: transparent;\n  color: #ffffff;\n}\n\n/*--- Pointers ---*/\n\n.ui.inverted.pointing.menu .active.item:after {\n  background: #5B5B5B;\n  box-shadow: none;\n}\n\n.ui.inverted.pointing.menu .active.item:hover:after {\n  background: #4A4A4A;\n}\n\n/*--------------\n    Selection\n---------------*/\n\n.ui.selection.menu > .item {\n  color: rgba(0, 0, 0, 0.4);\n}\n\n.ui.selection.menu > .item:hover {\n  color: rgba(0, 0, 0, 0.6);\n}\n\n.ui.selection.menu > .item.active {\n  color: rgba(0, 0, 0, 0.85);\n}\n\n.ui.inverted.selection.menu > .item {\n  color: rgba(255, 255, 255, 0.4);\n}\n\n.ui.inverted.selection.menu > .item:hover {\n  color: rgba(255, 255, 255, 0.9);\n}\n\n.ui.inverted.selection.menu > .item.active {\n  color: #FFFFFF;\n}\n\n/*--------------\n     Floated\n---------------*/\n\n.ui.floated.menu {\n  float: left;\n  margin: 0rem 0.5rem 0rem 0rem;\n}\n\n.ui.right.floated.menu {\n  float: right;\n  margin: 0rem 0rem 0rem 0.5rem;\n}\n\n/*--------------\n Inverted Colors\n---------------*/\n\n/*--- Light Colors  ---*/\n\n.ui.grey.menu {\n  background-color: #fafafa;\n}\n\n/*--- Inverted Colors  ---*/\n\n/* Blue */\n\n.ui.inverted.blue.menu {\n  background-color: #3b83c0;\n}\n\n.ui.inverted.blue.pointing.menu .active.item:after {\n  background-color: #3b83c0;\n}\n\n/* Green */\n\n.ui.inverted.green.menu {\n  background-color: #5bbd72;\n}\n\n.ui.inverted.green.pointing.menu .active.item:after {\n  background-color: #5bbd72;\n}\n\n/* Orange */\n\n.ui.inverted.orange.menu {\n  background-color: #e07b53;\n}\n\n.ui.inverted.orange.pointing.menu .active.item:after {\n  background-color: #e07b53;\n}\n\n/* Pink */\n\n.ui.inverted.pink.menu {\n  background-color: #d9499a;\n}\n\n.ui.inverted.pink.pointing.menu .active.item:after {\n  background-color: #d9499a;\n}\n\n/* Purple */\n\n.ui.inverted.purple.menu {\n  background-color: #564f8a;\n}\n\n.ui.inverted.purple.pointing.menu .active.item:after {\n  background-color: #564f8a;\n}\n\n/* Red */\n\n.ui.inverted.red.menu {\n  background-color: #d95c5c;\n}\n\n.ui.inverted.red.pointing.menu .active.item:after {\n  background-color: #d95c5c;\n}\n\n/* Teal */\n\n.ui.inverted.teal.menu {\n  background-color: #00b5ad;\n}\n\n.ui.inverted.teal.pointing.menu .active.item:after {\n  background-color: #00b5ad;\n}\n\n/* Yellow */\n\n.ui.inverted.yellow.menu {\n  background-color: #f2c61f;\n}\n\n.ui.inverted.yellow.pointing.menu .active.item:after {\n  background-color: #f2c61f;\n}\n\n/*--------------\n     Fitted\n---------------*/\n\n.ui.fitted.menu .item,\n.ui.fitted.menu .item .menu .item,\n.ui.menu .fitted.item {\n  padding: 0em;\n}\n\n.ui.horizontally.fitted.menu .item,\n.ui.horizontally.fitted.menu .item .menu .item,\n.ui.menu .horizontally.fitted.item {\n  padding-top: 0.78571em;\n  padding-bottom: 0.78571em;\n}\n\n.ui.vertically.fitted.menu .item,\n.ui.vertically.fitted.menu .item .menu .item,\n.ui.menu .vertically.fitted.item {\n  padding-left: 0.95em;\n  padding-right: 0.95em;\n}\n\n/*--------------\n   Borderless\n---------------*/\n\n.ui.borderless.menu .item:before,\n.ui.borderless.menu .item .menu .item:before,\n.ui.menu .borderless.item:before {\n  background: none !important;\n}\n\n/*-------------------\n       Compact\n--------------------*/\n\n.ui.compact.menu {\n  display: inline-block;\n  margin: 0em;\n  vertical-align: middle;\n}\n\n.ui.compact.vertical.menu {\n  width: auto !important;\n}\n\n.ui.compact.vertical.menu .item:last-child::before {\n  display: block;\n}\n\n/*-------------------\n        Fluid\n--------------------*/\n\n.ui.menu.fluid,\n.ui.vertical.menu.fluid {\n  display: block;\n  width: 100% !important;\n}\n\n/*-------------------\n      Evenly Sized\n--------------------*/\n\n.ui.item.menu,\n.ui.item.menu .item {\n  width: 100%;\n  padding-left: 0px !important;\n  padding-right: 0px !important;\n  text-align: center;\n}\n\n.ui.item.menu > .item:last-child {\n  border-radius: 0px 0.2857rem 0.2857rem 0px;\n}\n\n.ui.menu.two.item .item {\n  width: 50%;\n}\n\n.ui.menu.three.item .item {\n  width: 33.333%;\n}\n\n.ui.menu.four.item .item {\n  width: 25%;\n}\n\n.ui.menu.five.item .item {\n  width: 20%;\n}\n\n.ui.menu.six.item .item {\n  width: 16.666%;\n}\n\n.ui.menu.seven.item .item {\n  width: 14.285%;\n}\n\n.ui.menu.eight.item .item {\n  width: 12.500%;\n}\n\n.ui.menu.nine.item .item {\n  width: 11.11%;\n}\n\n.ui.menu.ten.item .item {\n  width: 10.0%;\n}\n\n.ui.menu.eleven.item .item {\n  width: 9.09%;\n}\n\n.ui.menu.twelve.item .item {\n  width: 8.333%;\n}\n\n/*--------------\n     Fixed\n---------------*/\n\n.ui.menu.fixed {\n  position: fixed;\n  z-index: 101;\n  margin: 0em;\n  border: none;\n  width: 100%;\n}\n\n.ui.menu.fixed,\n.ui.menu.fixed .item:first-child,\n.ui.menu.fixed .item:last-child {\n  border-radius: 0px !important;\n}\n\n.ui.menu.fixed.top {\n  top: 0px;\n  left: 0px;\n  right: auto;\n  bottom: auto;\n}\n\n.ui.menu.fixed.right {\n  top: 0px;\n  right: 0px;\n  left: auto;\n  bottom: auto;\n  width: auto;\n  height: 100%;\n}\n\n.ui.menu.fixed.bottom {\n  bottom: 0px;\n  left: 0px;\n  top: auto;\n  right: auto;\n}\n\n.ui.menu.fixed.left {\n  top: 0px;\n  left: 0px;\n  right: auto;\n  bottom: auto;\n  width: auto;\n  height: 100%;\n}\n\n/* Coupling with Grid */\n\n.ui.fixed.menu + .ui.grid {\n  padding-top: 2.75rem;\n}\n\n/*-------------------\n       Pointing\n--------------------*/\n\n.ui.pointing.menu .active.item:after {\n  position: absolute;\n  bottom: -0.3em;\n  left: 50%;\n  content: \'\';\n  margin-left: -0.3em;\n  width: 0.6em;\n  height: 0.6em;\n  border: none;\n  border-bottom: 1px solid rgba(0, 0, 0, 0.1);\n  border-right: 1px solid rgba(0, 0, 0, 0.1);\n  background: none;\n  -webkit-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n  z-index: 2;\n  -webkit-transition: background 0.2s ease;\n  transition: background 0.2s ease;\n}\n\n/* Don\'t double up pointers */\n\n.ui.pointing.menu .active.item .menu .active.item:after {\n  display: none;\n}\n\n.ui.vertical.pointing.menu .active.item:after {\n  position: absolute;\n  top: 50%;\n  margin-top: -0.3em;\n  right: -0.3em;\n  bottom: auto;\n  left: auto;\n  border: none;\n  border-top: 1px solid rgba(0, 0, 0, 0.1);\n  border-right: 1px solid rgba(0, 0, 0, 0.1);\n}\n\n/* Colors */\n\n.ui.pointing.menu .active.item:hover:after {\n  background-color: #fafafa;\n}\n\n.ui.pointing.menu .active.item:after {\n  background-color: #f6f6f6;\n}\n\n.ui.vertical.pointing.menu .item:hover:after {\n  background-color: #fafafa;\n}\n\n.ui.vertical.pointing.menu .active.item:after {\n  background-color: #fcfcfc;\n}\n\n/*--------------\n    Attached\n---------------*/\n\n.ui.menu.attached {\n  margin: 0rem;\n  border-radius: 0px;\n  /* avoid rgba multiplying */\n  box-shadow: 0px 0px 0px 1px #dddddd;\n}\n\n.ui.top.attached.menu {\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n}\n\n.ui.menu.bottom.attached {\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n/*--------------\n     Sizes\n---------------*/\n\n/* Small */\n\n.ui.small.menu .item {\n  font-size: 0.875rem;\n}\n\n.ui.small.vertical.menu {\n  width: 13rem;\n}\n\n/* Medium */\n\n.ui.menu .item {\n  font-size: 1rem;\n}\n\n.ui.vertical.menu {\n  width: 15rem;\n}\n\n/* Large */\n\n.ui.large.menu .item {\n  font-size: 1.125rem;\n}\n\n.ui.large.menu .item .item {\n  font-size: 0.875rem;\n}\n\n.ui.large.menu .dropdown .item {\n  font-size: 1rem;\n}\n\n.ui.large.vertical.menu {\n  width: 18rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Message\n*******************************/\n\n.ui.message {\n  position: relative;\n  min-height: 1em;\n  margin: 1em 0em;\n  background: #efefef;\n  padding: 1em 1.5em;\n  line-height: 1.3;\n  color: rgba(0, 0, 0, 0.8);\n  -webkit-transition: opacity 0.2s ease, color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;\n  transition: opacity 0.2s ease, color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;\n  border-radius: 0.2857rem;\n  box-shadow: 0px 0px 0px 1px rgba(39, 41, 43, 0.15) inset, 0px 0px 0px 0px transparent;\n}\n\n.ui.message:first-child {\n  margin-top: 0em;\n}\n\n.ui.message:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------\n     Content\n---------------*/\n\n/* Header */\n\n.ui.message .header {\n  display: block;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-weight: bold;\n  margin: 0em 0em 0.5rem 0em;\n}\n\n/* Default font size */\n\n.ui.message .header:not(.ui) {\n  font-size: 1.1em;\n}\n\n/* Paragraph */\n\n.ui.message p {\n  opacity: 0.85;\n  margin: 0.75em 0em;\n}\n\n.ui.message p:first-child {\n  margin-top: 0em;\n}\n\n.ui.message p:last-child {\n  margin-bottom: 0em;\n}\n\n.ui.message .header + p {\n  margin-top: 0.25em;\n}\n\n/* List */\n\n.ui.message ul.list {\n  opacity: 0.85;\n  list-style-position: inside;\n  margin: 0.5em 0em 0em;\n  padding: 0em;\n}\n\n.ui.message ul.list:first-child {\n  margin-top: 0em;\n}\n\n.ui.message ul.list:last-child {\n  margin-bottom: 0em;\n}\n\n.ui.message ul.list li {\n  position: relative;\n  list-style-type: none;\n  margin: 0em 0em 0.3em 1em;\n  padding: 0em;\n}\n\n.ui.message ul.list li:before {\n  position: absolute;\n  content: \'•\';\n  left: -1em;\n  height: 100%;\n  vertical-align: baseline;\n}\n\n.ui.message ul.list li:last-child {\n  margin-bottom: 0em;\n}\n\n/* Icon */\n\n.ui.message > .icon {\n  margin-right: 0.6em;\n}\n\n/* Close Icon */\n\n.ui.message > .close.icon {\n  cursor: pointer;\n  position: absolute;\n  margin: 0em;\n  top: 1.15em;\n  right: 0.5em;\n  opacity: 0.7;\n  -webkit-transition: opacity 0.1s linear;\n  transition: opacity 0.1s linear;\n}\n\n.ui.message > .close.icon:hover {\n  opacity: 1;\n}\n\n/* First / Last Element */\n\n.ui.message > :first-child {\n  margin-top: 0em;\n}\n\n.ui.message > :last-child {\n  margin-bottom: 0em;\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------\n    Visible\n---------------*/\n\n.ui.message.visible {\n  display: block;\n}\n\n.ui.icon.message.visible {\n  display: table;\n}\n\n/*--------------\n     Hidden\n---------------*/\n\n.ui.message.hidden {\n  display: none;\n}\n\n/*******************************\n            Variations\n*******************************/\n\n/*--------------\n    Compact\n---------------*/\n\n.ui.compact.message {\n  display: inline-block;\n}\n\n/*--------------\n    Attached\n---------------*/\n\n.ui.attached.message {\n  margin-bottom: -1px;\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n  box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.1) inset;\n  margin-left: -1px;\n  margin-right: -1px;\n}\n\n.ui.attached + .ui.attached.message:not(.top):not(.bottom) {\n  margin-top: -1px;\n  border-radius: 0em;\n}\n\n.ui.bottom.attached.message {\n  margin-top: -1px;\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n  box-shadow: 0em 0em 0em 1px rgba(0, 0, 0, 0.1) inset, 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n}\n\n.ui.bottom.attached.message:not(:last-child) {\n  margin-bottom: 1em;\n}\n\n.ui.attached.icon.message {\n  display: block;\n  width: auto;\n}\n\n/*--------------\n      Icon\n---------------*/\n\n.ui.icon.message {\n  display: table;\n  width: 100%;\n}\n\n.ui.icon.message > .icon:not(.close) {\n  display: table-cell;\n  width: auto;\n  vertical-align: middle;\n  font-size: 3em;\n  opacity: 0.8;\n}\n\n.ui.icon.message > .content {\n  display: table-cell;\n  width: 100%;\n  vertical-align: middle;\n}\n\n.ui.icon.message .icon:not(.close) + .content {\n  padding-left: 1.5rem;\n}\n\n.ui.icon.message .circular.icon {\n  width: 1em;\n}\n\n.ui.icon.message .circular.icon + .content {\n  width: auto;\n  padding-left: 2em;\n}\n\n/*--------------\n    Floating\n---------------*/\n\n.ui.floating.message {\n  box-shadow: 0 1px 4px 0 rgba(0, 0, 0, 0.15), 0px 0px 0px 1px rgba(39, 41, 43, 0.15) inset;\n}\n\n/*--------------\n     Colors\n---------------*/\n\n.ui.black.message {\n  background-color: #1b1c1d;\n  color: #ffffff;\n}\n\n/*--------------\n     Types\n---------------*/\n\n/* Positive */\n\n.ui.positive.message {\n  background-color: #eeffe7;\n  color: #3c763d;\n}\n\n.ui.positive.message,\n.ui.attached.positive.message {\n  box-shadow: 0px 0px 0px 1px #b7caa7 inset, 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n}\n\n.ui.positive.message .header {\n  color: #356e36;\n}\n\n/* Negative */\n\n.ui.negative.message {\n  background-color: #fff0f0;\n  color: #a94442;\n}\n\n.ui.negative.message,\n.ui.attached.negative.message {\n  box-shadow: 0px 0px 0px 1px #dbb1b1 inset, 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n}\n\n.ui.negative.message .header {\n  color: #912d2b;\n}\n\n/* Info */\n\n.ui.info.message {\n  background-color: #e9faff;\n  color: #337b92;\n}\n\n.ui.info.message,\n.ui.attached.info.message {\n  box-shadow: 0px 0px 0px 1px #aad6df inset, 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n}\n\n.ui.info.message .header {\n  color: #297187;\n}\n\n/* Warning */\n\n.ui.warning.message {\n  background-color: #fffbe6;\n  color: #876a38;\n}\n\n.ui.warning.message,\n.ui.attached.warning.message {\n  box-shadow: 0px 0px 0px 1px #d9caab inset, 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n}\n\n.ui.warning.message .header {\n  color: #825c01;\n}\n\n/* Error */\n\n.ui.error.message {\n  background-color: #fff0f0;\n  color: #a94442;\n}\n\n.ui.error.message,\n.ui.attached.error.message {\n  box-shadow: 0px 0px 0px 1px #dbb1b1 inset, 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n}\n\n.ui.error.message .header {\n  color: #912d2b;\n}\n\n/* Success */\n\n.ui.success.message {\n  background-color: #eeffe7;\n  color: #3c763d;\n}\n\n.ui.success.message,\n.ui.attached.success.message {\n  box-shadow: 0px 0px 0px 1px #b7caa7 inset, 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n}\n\n.ui.success.message .header {\n  color: #356e36;\n}\n\n/* Colors */\n\n.ui.inverted.message,\n.ui.black.message {\n  background-color: #1b1c1d;\n  color: #ffffff;\n}\n\n.ui.blue.message {\n  background-color: #dff0ff;\n  color: #3b83c0;\n}\n\n.ui.blue.message .header {\n  color: #3576ac;\n}\n\n.ui.green.message {\n  background-color: #ebffed;\n  color: #1ebc30;\n}\n\n.ui.green.message .header {\n  color: #1aa62a;\n}\n\n.ui.orange.message {\n  background-color: #ffedde;\n  color: #e07b53;\n}\n\n.ui.orange.message .header {\n  color: #dc6a3d;\n}\n\n.ui.pink.message {\n  background-color: #ffe3fb;\n  color: #d9499a;\n}\n\n.ui.pink.message .header {\n  color: #d5348e;\n}\n\n.ui.purple.message {\n  background-color: #eae7ff;\n  color: #564f8a;\n}\n\n.ui.purple.message .header {\n  color: #4c467a;\n}\n\n.ui.red.message {\n  background-color: #ffe8e6;\n  color: #d95c5c;\n}\n\n.ui.red.message .header {\n  color: #d44747;\n}\n\n.ui.teal.message {\n  background-color: #e9ffff;\n  color: #10a3a3;\n}\n\n.ui.teal.message .header {\n  color: #0e8c8c;\n}\n\n.ui.yellow.message {\n  background-color: #fff8db;\n  color: #b58105;\n}\n\n.ui.yellow.message .header {\n  color: #9c6f04;\n}\n\n/*--------------\n     Sizes\n---------------*/\n\n.ui.small.message {\n  font-size: 0.92857143em;\n}\n\n.ui.message {\n  font-size: 1em;\n}\n\n.ui.large.message {\n  font-size: 1.14285714em;\n}\n\n.ui.huge.message {\n  font-size: 1.42857143em;\n}\n\n.ui.massive.message {\n  font-size: 1.71428571em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n    User Variable Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Table\n*******************************/\n\n/* Prototype */\n\n.ui.table {\n  width: 100%;\n  background: #ffffff;\n  margin: 1em 0em;\n  border: 1px solid #d0d0d0;\n  box-shadow: none;\n  border-radius: 0.25rem;\n  color: rgba(0, 0, 0, 0.8);\n  border-collapse: separate;\n  border-spacing: 0px;\n}\n\n.ui.table:first-child {\n  margin-top: 0em;\n}\n\n.ui.table:last-child {\n  margin-bottom: 0em;\n}\n\n/*******************************\n             Parts\n*******************************/\n\n/* Table Content */\n\n.ui.table th,\n.ui.table td {\n  -webkit-transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;\n  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;\n}\n\n/* Headers */\n\n.ui.table thead {\n  box-shadow: none;\n}\n\n.ui.table thead th {\n  cursor: auto;\n  background: #f0f0f0;\n  text-align: left;\n  color: rgba(0, 0, 0, 0.8);\n  padding: 0.7em 0.8em;\n  vertical-align: middle;\n  font-style: none;\n  font-weight: bold;\n  text-transform: none;\n  border-bottom: 1px solid #d4d4d5;\n  border-left: none;\n}\n\n.ui.table thead th:first-child {\n  border-radius: 0.25rem 0em 0em 0em;\n  border-left: none;\n}\n\n.ui.table thead th:last-child {\n  border-radius: 0em 0.25rem 0em 0em;\n}\n\n.ui.table thead th:only-child {\n  border-radius: 0.25rem 0.25rem 0em 0em;\n}\n\n/* Footer */\n\n.ui.table tfoot {\n  box-shadow: none;\n}\n\n.ui.table tfoot th {\n  cursor: auto;\n  border-top: 1px solid #d4d4d5;\n  background: #ffffff;\n  text-align: left;\n  color: rgba(0, 0, 0, 0.8);\n  padding: 0.7em 0.8em;\n  vertical-align: middle;\n  font-style: normal;\n  font-weight: normal;\n  text-transform: none;\n}\n\n.ui.table tfoot th:first-child {\n  border-radius: 0em 0em 0em 0.25rem;\n}\n\n.ui.table tfoot th:last-child {\n  border-radius: 0em 0em 0.25rem 0em;\n}\n\n.ui.table tfoot th:only-child {\n  border-radius: 0em 0em 0.25rem 0.25rem;\n}\n\n/* Table Row */\n\n.ui.table tr td {\n  border-top: 1px solid #d4d4d5;\n}\n\n.ui.table tr:first-child td {\n  border-top: none;\n}\n\n/* Table Cells */\n\n.ui.table td {\n  padding: 0.7em 0.8em;\n  text-align: left;\n  vertical-align: middle;\n}\n\n/* Icons */\n\n.ui.table > .icon {\n  vertical-align: baseline;\n}\n\n.ui.table > .icon:only-child {\n  margin: 0em;\n}\n\n/* Table Segment */\n\n.ui.table.segment {\n  padding: 0em;\n}\n\n.ui.table.segment:after {\n  display: none;\n}\n\n.ui.table.segment.stacked:after {\n  display: block;\n}\n\n/* Responsive */\n\n@media only screen and (max-width: 768px) {\n  .ui.table {\n    display: block;\n    padding: 0em;\n  }\n\n  .ui.table thead {\n    display: block;\n  }\n\n  .ui.table tfoot {\n    display: block;\n  }\n\n  .ui.table tbody {\n    display: block;\n  }\n\n  .ui.table tr {\n    display: block;\n  }\n\n  .ui.table tr > th,\n  .ui.table tr > td {\n    background: none;\n    width: 100% !important;\n    display: block;\n    border: none !important;\n    padding: 0.25em 0.75em;\n    box-shadow: none;\n  }\n\n  .ui.table th:first-child,\n  .ui.table td:first-child {\n    font-weight: bold;\n    padding-top: 1em;\n  }\n\n  .ui.table th:last-child,\n  .ui.table td:last-child {\n    box-shadow: 0px -1px 0px 0px rgba(0, 0, 0, 0.1) inset;\n    padding-bottom: 1em;\n  }\n\n  /* Clear BG Colors */\n\n  .ui.table tr > td.warning,\n  .ui.table tr > td.error,\n  .ui.table tr > td.active,\n  .ui.table tr > td.positive,\n  .ui.table tr > td.negative {\n    background-color: transparent !important;\n  }\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*--------------\n   Definition\n---------------*/\n\n.ui.definition.table thead:not(.full-width) th:first-child {\n  pointer-events: none;\n  background: transparent;\n  font-weight: normal;\n  color: rgba(0, 0, 0, 0.4);\n  box-shadow: -1px -1px 0px 1px #ffffff;\n}\n\n.ui.definition.table tfoot:not(.full-width) th:first-child {\n  pointer-events: none;\n  background: transparent;\n  font-weight: rgba(0, 0, 0, 0.4);\n  color: normal;\n  box-shadow: 1px 1px 0px 1px #ffffff;\n}\n\n/* Remove Border */\n\n.ui.celled.definition.table thead:not(.full-width) th:first-child {\n  box-shadow: 0px -1px 0px 1px #ffffff;\n}\n\n.ui.celled.definition.table tfoot:not(.full-width) th:first-child {\n  box-shadow: 0px 1px 0px 1px #ffffff;\n}\n\n/* Highlight Defining Column */\n\n.ui.definition.table tr td:first-child {\n  background: rgba(0, 0, 0, 0.03);\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Fix 2nd Column */\n\n.ui.definition.table thead:not(.full-width) th:nth-child(2) {\n  border-left: 1px solid #d0d0d0;\n}\n\n.ui.definition.table tfoot:not(.full-width) th:nth-child(2) {\n  border-left: 1px solid #d0d0d0;\n}\n\n.ui.definition.table td:nth-child(2) {\n  border-left: 1px solid #d0d0d0;\n}\n\n/*******************************\n             States\n*******************************/\n\n/*--------------\n    Positive\n---------------*/\n\n.ui.table tr.positive,\n.ui.table td.positive {\n  box-shadow: 0px 0px 0px #b7caa7 inset;\n}\n\n.ui.table tr.positive td,\n.ui.table td.positive {\n  background: #eeffe7 !important;\n  color: #3c763d !important;\n}\n\n.ui.celled.table tr.positive:hover td,\n.ui.celled.table tr:hover td.positive {\n  background: #e3ffd8 !important;\n  color: #376c38 !important;\n}\n\n/*--------------\n     Negative\n---------------*/\n\n.ui.table tr.negative,\n.ui.table td.negative {\n  box-shadow: 0px 0px 0px #dbb1b1 inset;\n}\n\n.ui.table tr.negative td,\n.ui.table td.negative {\n  background: #fff0f0 !important;\n  color: #cd2929 !important;\n}\n\n.ui.celled.table tr.negative:hover td,\n.ui.celled.table tr:hover td.negative {\n  background: #ffe1e1 !important;\n  color: #c02626 !important;\n}\n\n/*--------------\n      Error\n---------------*/\n\n.ui.table tr.error,\n.ui.table td.error {\n  box-shadow: 0px 0px 0px #dbb1b1 inset;\n}\n\n.ui.table tr.error td,\n.ui.table td.error {\n  background: #fff0f0 !important;\n  color: #cd2929 !important;\n}\n\n.ui.celled.table tr.error:hover td,\n.ui.celled.table tr:hover td.error {\n  background: #ffe1e1 !important;\n  color: #c02626 !important;\n}\n\n/*--------------\n     Warning\n---------------*/\n\n.ui.table tr.warning,\n.ui.table td.warning {\n  box-shadow: 0px 0px 0px #d9caab inset;\n}\n\n.ui.table tr.warning td,\n.ui.table td.warning {\n  background: #fffbe6 !important;\n  color: #7d6c00 !important;\n}\n\n.ui.celled.table tr.warning:hover td,\n.ui.celled.table tr:hover td.warning {\n  background: #fff9d7 !important;\n  color: #6e5f00 !important;\n}\n\n/*--------------\n     Active\n---------------*/\n\n.ui.table tr.active,\n.ui.table td.active {\n  box-shadow: 0px 0px 0px rgba(50, 50, 50, 0.9) inset;\n}\n\n.ui.table tr.active td,\n.ui.table td.active {\n  background: #e0e0e0 !important;\n  color: rgba(50, 50, 50, 0.9) !important;\n}\n\n.ui.celled.table tr.active:hover td,\n.ui.celled.table tr:hover td.active {\n  background: #e0e0e0 !important;\n  color: rgba(50, 50, 50, 0.9) !important;\n}\n\n/*--------------\n     Disabled\n---------------*/\n\n.ui.table tr.disabled td,\n.ui.table tr td.disabled,\n.ui.table tr.disabled:hover td,\n.ui.table tr:hover td.disabled {\n  pointer-events: none;\n  color: rgba(40, 40, 40, 0.3);\n}\n\n/*******************************\n          Variations\n*******************************/\n\n/*--------------\n     Aligned\n---------------*/\n\n.ui.table[class*="left aligned"],\n.ui.table [class*="left aligned"] {\n  text-align: left;\n}\n\n.ui.table[class*="center aligned"],\n.ui.table [class*="center aligned"] {\n  text-align: center;\n}\n\n.ui.table[class*="right aligned"],\n.ui.table [class*="right aligned"] {\n  text-align: right;\n}\n\n/*--------------\n    Collapsing\n---------------*/\n\n.ui.table th.collapsing,\n.ui.table td.collapsing {\n  width: 1px;\n  white-space: nowrap;\n}\n\n/*--------------\n     Attached\n---------------*/\n\n/* All */\n\n.ui.attached.table {\n  width: -webkit-calc(100% +  2px );\n  width: calc(100% +  2px );\n  margin: 0em -1px;\n  border-radius: 0px;\n  box-shadow: none;\n}\n\n/* Top */\n\n.ui[class*="top attached"].table {\n  margin-top: 1em 0em;\n  border-radius: 0.25rem 0.25rem 0em 0em;\n}\n\n.ui.table[class*="top attached"]:first-child {\n  margin-top: 0em;\n}\n\n/* Bottom */\n\n.ui.table[class*="bottom attached"] {\n  margin-top: 0em;\n  margin-bottom: 1em 0em;\n  border-radius: 0em 0em 0.25rem 0.25rem;\n}\n\n.ui.table[class*="bottom attached"]:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------\n     Striped\n---------------*/\n\n/* Table Striping */\n\n.ui.striped.table > tr:nth-child(2n),\n.ui.striped.table tbody tr:nth-child(2n) {\n  background-color: rgba(0, 0, 50, 0.03);\n}\n\n/* Stripes */\n\n.ui.inverted.striped.table > tr:nth-child(2n),\n.ui.inverted.striped.table tbody tr:nth-child(2n) {\n  background-color: rgba(255, 255, 255, 0.06);\n}\n\n/*-------------------\n       Colors\n--------------------*/\n\n.ui.black.table {\n  border-top: 0.2em solid #1b1c1d;\n}\n\n.ui.blue.table {\n  border-top: 0.2em solid #3b83c0;\n}\n\n.ui.green.table {\n  border-top: 0.2em solid #5bbd72;\n}\n\n.ui.orange.table {\n  border-top: 0.2em solid #e07b53;\n}\n\n.ui.pink.table {\n  border-top: 0.2em solid #d9499a;\n}\n\n.ui.purple.table {\n  border-top: 0.2em solid #564f8a;\n}\n\n.ui.red.table {\n  border-top: 0.2em solid #d95c5c;\n}\n\n.ui.teal.table {\n  border-top: 0.2em solid #00b5ad;\n}\n\n.ui.yellow.table {\n  border-top: 0.2em solid #f2c61f;\n}\n\n/*-------------------\n   Inverted Colors\n--------------------*/\n\n.ui.inverted.table,\n.ui.inverted.black.table {\n  background-color: #1b1c1d !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.blue.table {\n  background-color: #3b83c0 !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.green.table {\n  background-color: #5bbd72 !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.orange.table {\n  background-color: #e07b53 !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.pink.table {\n  background-color: #d9499a !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.purple.table {\n  background-color: #564f8a !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.red.table {\n  background-color: #d95c5c !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.teal.table {\n  background-color: #00b5ad !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.yellow.table {\n  background-color: #f2c61f !important;\n  color: #ffffff !important;\n}\n\n/*--------------\n  Column Count\n---------------*/\n\n/* Grid Based */\n\n.ui.one.column.table td {\n  width: 100%;\n}\n\n.ui.two.column.table td {\n  width: 50%;\n}\n\n.ui.three.column.table td {\n  width: 33.33333333%;\n}\n\n.ui.four.column.table td {\n  width: 25%;\n}\n\n.ui.five.column.table td {\n  width: 20%;\n}\n\n.ui.six.column.table td {\n  width: 16.66666667%;\n}\n\n.ui.seven.column.table td {\n  width: 14.28571429%;\n}\n\n.ui.eight.column.table td {\n  width: 12.5%;\n}\n\n.ui.nine.column.table td {\n  width: 11.11111111%;\n}\n\n.ui.ten.column.table td {\n  width: 10%;\n}\n\n.ui.eleven.column.table td {\n  width: 9.09090909%;\n}\n\n.ui.twelve.column.table td {\n  width: 8.33333333%;\n}\n\n.ui.thirteen.column.table td {\n  width: 7.69230769%;\n}\n\n.ui.fourteen.column.table td {\n  width: 7.14285714%;\n}\n\n.ui.fifteen.column.table td {\n  width: 6.66666667%;\n}\n\n.ui.sixteen.column.table td {\n  width: 6.25%;\n}\n\n/* Column Width */\n\n.ui.table th.one.wide,\n.ui.table td.one.wide {\n  width: 6.25%;\n}\n\n.ui.table th.two.wide,\n.ui.table td.two.wide {\n  width: 12.5%;\n}\n\n.ui.table th.three.wide,\n.ui.table td.three.wide {\n  width: 18.75%;\n}\n\n.ui.table th.four.wide,\n.ui.table td.four.wide {\n  width: 25%;\n}\n\n.ui.table th.five.wide,\n.ui.table td.five.wide {\n  width: 31.25%;\n}\n\n.ui.table th.six.wide,\n.ui.table td.six.wide {\n  width: 37.5%;\n}\n\n.ui.table th.seven.wide,\n.ui.table td.seven.wide {\n  width: 43.75%;\n}\n\n.ui.table th.eight.wide,\n.ui.table td.eight.wide {\n  width: 50%;\n}\n\n.ui.table th.nine.wide,\n.ui.table td.nine.wide {\n  width: 56.25%;\n}\n\n.ui.table th.ten.wide,\n.ui.table td.ten.wide {\n  width: 62.5%;\n}\n\n.ui.table th.eleven.wide,\n.ui.table td.eleven.wide {\n  width: 68.75%;\n}\n\n.ui.table th.twelve.wide,\n.ui.table td.twelve.wide {\n  width: 75%;\n}\n\n.ui.table th.thirteen.wide,\n.ui.table td.thirteen.wide {\n  width: 81.25%;\n}\n\n.ui.table th.fourteen.wide,\n.ui.table td.fourteen.wide {\n  width: 87.5%;\n}\n\n.ui.table th.fifteen.wide,\n.ui.table td.fifteen.wide {\n  width: 93.75%;\n}\n\n.ui.table th.sixteen.wide,\n.ui.table td.sixteen.wide {\n  width: 100%;\n}\n\n/*--------------\n    Sortable\n---------------*/\n\n.ui.sortable.table thead th {\n  cursor: pointer;\n  white-space: nowrap;\n  border-left: 1px solid #d0d0d0;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.sortable.table thead th:first-child {\n  border-left: none;\n}\n\n.ui.sortable.table thead th.sorted,\n.ui.sortable.table thead th.sorted:hover {\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n}\n\n.ui.sortable.table thead th:after {\n  display: inline-block;\n  content: \'\';\n  width: 1em;\n  height: 1em;\n  opacity: 0.8;\n  margin: 0em 0em 0em 0.5em;\n  font-family: \'Icons\';\n  font-style: normal;\n  font-weight: normal;\n  text-decoration: inherit;\n}\n\n.ui.sortable.table thead th.ascending:after {\n  content: \'\f0d7\';\n}\n\n.ui.sortable.table thead th.descending:after {\n  content: \'\f0d8\';\n}\n\n/* Hover */\n\n.ui.sortable.table th.disabled:hover {\n  cursor: auto;\n  color: rgba(40, 40, 40, 0.3);\n}\n\n.ui.sortable.table thead th:hover {\n  background: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Sorted */\n\n.ui.sortable.table thead th.sorted {\n  background: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Sorted Hover */\n\n.ui.sortable.table thead th.sorted:hover {\n  background: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Inverted */\n\n.ui.inverted.sortable.table thead th.sorted {\n  background: rgba(255, 255, 255, 0.07) -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  background: rgba(255, 255, 255, 0.07) linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  color: #ffffff;\n}\n\n.ui.inverted.sortable.table thead th:hover {\n  background: rgba(255, 255, 255, 0.05) -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  background: rgba(255, 255, 255, 0.05) linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  color: #ffffff;\n}\n\n.ui.inverted.sortable.table thead th {\n  border-left-color: transparent;\n}\n\n/*--------------\n    Inverted\n---------------*/\n\n/* Text Color */\n\n.ui.inverted.table {\n  background: #333333;\n  color: #ffffff;\n  border: none;\n}\n\n.ui.inverted.table th {\n  background-color: rgba(0, 0, 0, 0.15);\n  border-color: rgba(0, 0, 0, 0.2) !important;\n  color: rgba(255, 255, 255, 0.9);\n}\n\n.ui.inverted.table tr td {\n  border-color: rgba(0, 0, 0, 0.2) !important;\n}\n\n.ui.inverted.table tr.disabled td,\n.ui.inverted.table tr td.disabled,\n.ui.inverted.table tr.disabled:hover td,\n.ui.inverted.table tr:hover td.disabled {\n  pointer-events: none;\n  color: rgba(225, 225, 225, 0.3);\n}\n\n/* Definition */\n\n.ui.inverted.definition.table tfoot:not(.full-width) th:first-child,\n.ui.inverted.definition.table thead:not(.full-width) th:first-child {\n  background: #ffffff;\n}\n\n.ui.inverted.definition.table tr td:first-child {\n  background: rgba(255, 255, 255, 0.02);\n  color: #ffffff;\n}\n\n/*--------------\n   Collapsing\n---------------*/\n\n.ui.collapsing.table {\n  width: auto;\n}\n\n/*--------------\n      Basic\n---------------*/\n\n.ui.basic.table {\n  background: transparent;\n  border: 1px solid #d0d0d0;\n  box-shadow: none;\n}\n\n.ui.basic.table thead,\n.ui.basic.table tfoot {\n  box-shadow: none;\n}\n\n.ui.basic.table th {\n  background: transparent;\n  border-left: none;\n}\n\n.ui.basic.table tbody tr {\n  border-bottom: 1px solid rgba(0, 0, 0, 0.1);\n}\n\n.ui.basic.table td {\n  background: transparent;\n}\n\n.ui.basic.striped.table tbody tr:nth-child(2n) {\n  background-color: rgba(0, 0, 0, 0.05) !important;\n}\n\n/* Very Basic */\n\n.ui[class*="very basic"].table {\n  border: none;\n}\n\n.ui[class*="very basic"].table:not(.sortable):not(.striped) th,\n.ui[class*="very basic"].table:not(.sortable):not(.striped) td {\n  padding: 0.8em 0em;\n}\n\n.ui[class*="very basic"].table:not(.sortable):not(.striped) thead th {\n  padding-top: 0em;\n}\n\n.ui[class*="very basic"].table:not(.sortable):not(.striped) tbody tr:last-child td {\n  padding-bottom: 0em;\n}\n\n/*--------------\n     Celled\n---------------*/\n\n.ui.celled.table th,\n.ui.celled.table td {\n  border-left: 1px solid #d4d4d5;\n}\n\n.ui.celled.table th:first-child,\n.ui.celled.table td:first-child {\n  border-left: none;\n}\n\n/*--------------\n     Padded\n---------------*/\n\n.ui.padded.table th {\n  padding-left: 1em;\n  padding-right: 1em;\n}\n\n.ui.padded.table th,\n.ui.padded.table td {\n  padding: 1em 1em;\n}\n\n/* Very */\n\n.ui[class*="very padded"].table th {\n  padding-left: 1.5em;\n  padding-right: 1.5em;\n}\n\n.ui[class*="very padded"].table td {\n  padding: 1.5em 1.5em;\n}\n\n/*--------------\n     Compact\n---------------*/\n\n.ui.compact.table th {\n  padding-left: 0.7em;\n  padding-right: 0.7em;\n}\n\n.ui.compact.table td {\n  padding: 0.5em 0.7em;\n}\n\n/* Very */\n\n.ui[class*="very compact"].table th {\n  padding-left: 0.6em;\n  padding-right: 0.6em;\n}\n\n.ui[class*="very compact"].table td {\n  padding: 0.4em 0.6em;\n}\n\n/*--------------\n      Sizes\n---------------*/\n\n/* Small */\n\n.ui.small.table {\n  font-size: 0.9em;\n}\n\n/* Standard */\n\n.ui.table {\n  font-size: 1em;\n}\n\n/* Large */\n\n.ui.large.table {\n  font-size: 1.1em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Standard\n*******************************/\n\n/*--------------\n      Cards\n---------------*/\n\n.ui.cards {\n  margin: 1em -0.5em 0em;\n}\n\n.ui.cards > .card {\n  display: block;\n  margin: 0em 0.5em 1.5em;\n  float: left;\n}\n\n.ui.cards:first-child,\n.ui.card:first-child {\n  margin-top: 0em;\n}\n\n.ui.cards:last-child,\n.ui.card:last-child {\n  margin-bottom: 0em;\n}\n\n/* Clearing */\n\n.ui.cards:after,\n.ui.card:after {\n  display: block;\n  content: \' \';\n  height: 0px;\n  clear: both;\n  overflow: hidden;\n  visibility: hidden;\n}\n\n/*--------------\n      Card\n---------------*/\n\n.ui.cards > .card,\n.ui.card {\n  max-width: 100%;\n  position: relative;\n  display: block;\n  width: 290px;\n  min-height: 0px;\n  background: #ffffff;\n  padding: 0em;\n  border: none;\n  border-radius: 0.2857rem;\n  box-shadow: 0px 0.2em 0px 0px #d4d4d5, 0px 0px 0px 1px #d4d4d5;\n  -webkit-transition: box-shadow 0.2s ease;\n  transition: box-shadow 0.2s ease;\n  z-index: \'\';\n}\n\n.ui.card {\n  margin: 1em 0em;\n}\n\n.ui.cards > .card a,\n.ui.card a {\n  cursor: pointer;\n}\n\n/*--------------\n  Rounded Edges\n---------------*/\n\n.ui.cards > .card > :first-child,\n.ui.card > :first-child {\n  border-radius: 0.2857rem 0.2857rem 0em 0em !important;\n}\n\n.ui.cards > .card > :last-child,\n.ui.card > :last-child {\n  border-radius: 0em 0em 0.2857rem 0.2857rem !important;\n}\n\n/*--------------\n     Images\n---------------*/\n\n.ui.cards > .card > .image,\n.ui.card > .image {\n  display: block;\n  position: relative;\n  padding: 0em;\n  background: rgba(0, 0, 0, 0.05);\n}\n\n.ui.cards > .card > .image > img,\n.ui.card > .image > img {\n  display: block;\n  width: 100%;\n  height: auto;\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n  border: none;\n}\n\n.ui.cards > .card > .image:only-child > img,\n.ui.card > .image:only-child > img {\n  border-radius: 0.2857rem;\n}\n\n/*--------------\n     Content\n---------------*/\n\n.ui.cards > .card > .content,\n.ui.card > .content {\n  background: none;\n  margin: 0em;\n  padding: 1em 1em;\n  box-shadow: none;\n  font-size: 1em;\n  border: none;\n  border-radius: 0em;\n}\n\n.ui.cards > .card > .content:after,\n.ui.card > .content:after {\n  display: block;\n  content: \' \';\n  height: 0px;\n  clear: both;\n  overflow: hidden;\n  visibility: hidden;\n}\n\n.ui.cards > .card > .content > .header,\n.ui.card > .content > .header {\n  display: block;\n  margin: 0em;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  color: rgba(0, 0, 0, 0.85);\n}\n\n/* Default Header Size */\n\n.ui.cards > .card > .content > .header:not(.ui),\n.ui.card > .content > .header:not(.ui) {\n  font-weight: bold;\n  font-size: 1.2em;\n  margin-top: -0.165em;\n  line-height: 1.33em;\n}\n\n.ui.cards > .card > .content > .meta + .description,\n.ui.cards > .card > .content > .header + .description,\n.ui.card > .content > .meta + .description,\n.ui.card > .content > .header + .description {\n  margin-top: 0.5em;\n}\n\n/*--------------\n     Floated\n---------------*/\n\n.ui.cards > .card [class*="left floated"],\n.ui.card [class*="left floated"] {\n  float: left;\n}\n\n.ui.cards > .card [class*="right floated"],\n.ui.card [class*="right floated"] {\n  float: right;\n}\n\n/*--------------\n  Content Image\n---------------*/\n\n.ui.cards > .card .content img,\n.ui.card .content img {\n  display: inline-block;\n  vertical-align: middle;\n  width: 2em;\n}\n\n.ui.cards > .card img.avatar,\n.ui.cards > .card .avatar img,\n.ui.card img.avatar,\n.ui.card .avatar img {\n  width: 2em;\n  height: 2em;\n  border-radius: 500rem;\n}\n\n/*--------------\n   Description\n---------------*/\n\n.ui.cards > .card > .content > .description,\n.ui.card > .content > .description {\n  clear: both;\n  color: rgba(0, 0, 0, 0.5);\n}\n\n/*--------------\n    Paragraph\n---------------*/\n\n.ui.cards > .card > .content p,\n.ui.card > .content p {\n  margin: 0em 0em 0.5em;\n}\n\n.ui.cards > .card > .content p:last-child,\n.ui.card > .content p:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------\n      Meta\n---------------*/\n\n.ui.cards > .card .meta,\n.ui.card .meta {\n  font-size: 0.9em;\n  color: rgba(0, 0, 0, 0.4);\n}\n\n.ui.cards > .card .meta *,\n.ui.card .meta * {\n  margin-right: 0.3em;\n}\n\n.ui.cards > .card .meta :last-child,\n.ui.card .meta :last-child {\n  margin-right: 0em;\n}\n\n.ui.cards > .card .meta [class*="right floated"],\n.ui.card .meta [class*="right floated"] {\n  margin-right: 0em;\n  margin-left: 0.3em;\n}\n\n/*--------------\n      Links\n---------------*/\n\n/* Generic */\n\n.ui.cards > .card > .content a:not(.ui),\n.ui.card > .content a:not(.ui) {\n  color: \'\';\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n.ui.cards > .card > .content a:not(.ui):hover,\n.ui.card > .content a:not(.ui):hover {\n  color: \'\';\n}\n\n/* Header */\n\n.ui.cards > .card > .content > a.header,\n.ui.card > .content > a.header {\n  color: rgba(0, 0, 0, 0.85);\n}\n\n.ui.cards > .card > .content > a.header:hover,\n.ui.card > .content > a.header:hover {\n  color: #00b2f3;\n}\n\n/* Meta */\n\n.ui.cards > .card .meta > a:not(.ui),\n.ui.card .meta > a:not(.ui) {\n  color: rgba(0, 0, 0, 0.4);\n}\n\n.ui.cards > .card .meta > a:not(.ui):hover,\n.ui.card .meta > a:not(.ui):hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------\n     Buttons\n---------------*/\n\n.ui.cards > .card > .buttons:last-child,\n.ui.card > .buttons:last-child,\n.ui.cards > .card > .button:last-child,\n.ui.card > .button:last-child {\n  margin: 0em -1px -0.2em;\n  width: -webkit-calc(100% +  2px );\n  width: calc(100% +  2px );\n}\n\n/*--------------\n     Labels\n---------------*/\n\n/*-----Star----- */\n\n/* Icon */\n\n.ui.cards > .card > .content .star.icon,\n.ui.card > .content .star.icon {\n  cursor: pointer;\n  opacity: 0.75;\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n.ui.cards > .card > .content .star.icon:hover,\n.ui.card > .content .star.icon:hover {\n  opacity: 1;\n  color: #ac9400;\n}\n\n.ui.cards > .card > .content .active.star.icon,\n.ui.card > .content .active.star.icon {\n  color: #e9b539;\n}\n\n/*-----Like----- */\n\n/* Icon */\n\n.ui.cards > .card > .content .like.icon,\n.ui.card > .content .like.icon {\n  cursor: pointer;\n  opacity: 0.75;\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n.ui.cards > .card > .content .like.icon:hover,\n.ui.card > .content .like.icon:hover {\n  opacity: 1;\n  color: #ffadae;\n}\n\n.ui.cards > .card > .content .active.like.icon,\n.ui.card > .content .active.like.icon {\n  color: #ef404a;\n}\n\n/*----------------\n  Extra Content\n-----------------*/\n\n.ui.cards > .card > .extra,\n.ui.card > .extra {\n  max-width: 100%;\n  min-height: 0em !important;\n  position: static;\n  background: none;\n  width: auto;\n  margin: 0em 0em;\n  padding: 0.75em 1em;\n  top: 0em;\n  left: 0em;\n  color: rgba(0, 0, 0, 0.4);\n  box-shadow: none;\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n  border-top: 1px solid rgba(0, 0, 0, 0.05);\n}\n\n.ui.cards > .card > .extra a:not(.ui),\n.ui.card > .extra a:not(.ui) {\n  color: rgba(0, 0, 0, 0.4);\n}\n\n.ui.cards > .card > .extra a:not(.ui):hover,\n.ui.card > .extra a:not(.ui):hover {\n  color: #00b2f3;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-------------------\n        Fluid\n--------------------*/\n\n.ui.fluid.card {\n  width: 100%;\n  max-width: 9999px;\n}\n\n/*-------------------\n        Link\n--------------------*/\n\n.ui.cards a.card:hover,\n.ui.link.cards .card:hover,\na.ui.card:hover,\n.ui.link.card:hover {\n  cursor: pointer;\n  z-index: 5;\n  background: \'\';\n  border: none;\n  box-shadow: 0px 0.2em 0px 0px #bebebf, 0px 0px 0px 1px rgba(39, 41, 43, 0.3);\n}\n\n/*--------------\n   Card Count\n---------------*/\n\n.ui.one.cards {\n  margin-left: 0em;\n  margin-right: 0em;\n}\n\n.ui.one.cards > .card {\n  width: 100%;\n}\n\n.ui.two.cards {\n  margin-left: -1em;\n  margin-right: -1em;\n}\n\n.ui.two.cards > .card {\n  width: -webkit-calc( 50%  -  2em );\n  width: calc( 50%  -  2em );\n  margin-left: 1em;\n  margin-right: 1em;\n}\n\n.ui.two.cards > .card:nth-child(2n+1) {\n  clear: left;\n}\n\n.ui.three.cards {\n  margin-left: -1em;\n  margin-right: -1em;\n}\n\n.ui.three.cards > .card {\n  width: -webkit-calc( 33.33333333%  -  2em );\n  width: calc( 33.33333333%  -  2em );\n  margin-left: 1em;\n  margin-right: 1em;\n}\n\n.ui.three.cards > .card:nth-child(3n+1) {\n  clear: left;\n}\n\n.ui.four.cards {\n  margin-left: -0.75em;\n  margin-right: -0.75em;\n}\n\n.ui.four.cards > .card {\n  width: -webkit-calc( 25%  -  1.5em );\n  width: calc( 25%  -  1.5em );\n  margin-left: 0.75em;\n  margin-right: 0.75em;\n}\n\n.ui.four.cards > .card:nth-child(4n+1) {\n  clear: left;\n}\n\n.ui.five.cards {\n  margin-left: -0.75em;\n  margin-right: -0.75em;\n}\n\n.ui.five.cards > .card {\n  width: -webkit-calc( 20%  -  1.5em );\n  width: calc( 20%  -  1.5em );\n  margin-left: 0.75em;\n  margin-right: 0.75em;\n}\n\n.ui.five.cards > .card:nth-child(5n+1) {\n  clear: left;\n}\n\n.ui.six.cards {\n  margin-left: -0.75em;\n  margin-right: -0.75em;\n}\n\n.ui.six.cards > .card {\n  width: -webkit-calc( 16.66666667%  -  1.5em );\n  width: calc( 16.66666667%  -  1.5em );\n  margin-left: 0.75em;\n  margin-right: 0.75em;\n}\n\n.ui.six.cards > .card:nth-child(6n+1) {\n  clear: left;\n}\n\n.ui.seven.cards {\n  margin-left: -0.5em;\n  margin-right: -0.5em;\n}\n\n.ui.seven.cards > .card {\n  width: -webkit-calc( 14.28571429%  -  1em );\n  width: calc( 14.28571429%  -  1em );\n  margin-left: 0.5em;\n  margin-right: 0.5em;\n}\n\n.ui.seven.cards > .card:nth-child(7n+1) {\n  clear: left;\n}\n\n.ui.eight.cards {\n  margin-left: -0.5em;\n  margin-right: -0.5em;\n}\n\n.ui.eight.cards > .card {\n  width: -webkit-calc( 12.5%  -  1em );\n  width: calc( 12.5%  -  1em );\n  margin-left: 0.5em;\n  margin-right: 0.5em;\n  font-size: 11px;\n}\n\n.ui.eight.cards > .card:nth-child(8n+1) {\n  clear: left;\n}\n\n.ui.nine.cards {\n  margin-left: -0.5em;\n  margin-right: -0.5em;\n}\n\n.ui.nine.cards > .card {\n  width: -webkit-calc( 11.11111111%  -  1em );\n  width: calc( 11.11111111%  -  1em );\n  margin-left: 0.5em;\n  margin-right: 0.5em;\n  font-size: 10px;\n}\n\n.ui.nine.cards > .card:nth-child(9n+1) {\n  clear: left;\n}\n\n.ui.ten.cards {\n  margin-left: -0.5em;\n  margin-right: -0.5em;\n}\n\n.ui.ten.cards > .card {\n  width: -webkit-calc( 10%  -  1em );\n  width: calc( 10%  -  1em );\n  margin-left: 0.5em;\n  margin-right: 0.5em;\n}\n\n.ui.ten.cards > .card:nth-child(10n+1) {\n  clear: left;\n}\n\n/*-------------------\n      Doubling\n--------------------*/\n\n/* Mobily Only */\n\n@media only screen and (max-width: 767px) {\n  .ui.two.doubling.cards {\n    margin-left: 0em;\n    margin-right: 0em;\n  }\n\n  .ui.two.doubling.cards .card {\n    width: 100%;\n    margin-left: 0em;\n    margin-right: 0em;\n  }\n\n  .ui.three.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.three.doubling.cards .card {\n    width: -webkit-calc( 50%  -  2em );\n    width: calc( 50%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.four.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.four.doubling.cards .card {\n    width: -webkit-calc( 50%  -  2em );\n    width: calc( 50%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.five.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.five.doubling.cards .card {\n    width: -webkit-calc( 50%  -  2em );\n    width: calc( 50%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.six.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.six.doubling.cards .card {\n    width: -webkit-calc( 50%  -  2em );\n    width: calc( 50%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.seven.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.seven.doubling.cards .card {\n    width: -webkit-calc( 33.33333333%  -  2em );\n    width: calc( 33.33333333%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.eight.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.eight.doubling.cards .card {\n    width: -webkit-calc( 33.33333333%  -  2em );\n    width: calc( 33.33333333%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.nine.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.nine.doubling.cards .card {\n    width: -webkit-calc( 33.33333333%  -  2em );\n    width: calc( 33.33333333%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.ten.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.ten.doubling.cards .card {\n    width: -webkit-calc( 33.33333333%  -  2em );\n    width: calc( 33.33333333%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n}\n\n/* Tablet Only */\n\n@media only screen and (min-width: 768px) and (max-width: 991px) {\n  .ui.two.doubling.cards {\n    margin-left: 0em;\n    margin-right: 0em;\n  }\n\n  .ui.two.doubling.cards .card {\n    width: 100%;\n    margin-left: 0em;\n    margin-right: 0em;\n  }\n\n  .ui.three.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.three.doubling.cards .card {\n    width: -webkit-calc( 50%  -  2em );\n    width: calc( 50%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.four.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.four.doubling.cards .card {\n    width: -webkit-calc( 50%  -  2em );\n    width: calc( 50%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.five.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.five.doubling.cards .card {\n    width: -webkit-calc( 33.33333333%  -  2em );\n    width: calc( 33.33333333%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.six.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.six.doubling.cards .card {\n    width: -webkit-calc( 33.33333333%  -  2em );\n    width: calc( 33.33333333%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.eight.doubling.cards {\n    margin-left: -1em;\n    margin-right: -1em;\n  }\n\n  .ui.eight.doubling.cards .card {\n    width: -webkit-calc( 33.33333333%  -  2em );\n    width: calc( 33.33333333%  -  2em );\n    margin-left: 1em;\n    margin-right: 1em;\n  }\n\n  .ui.eight.doubling.cards {\n    margin-left: -0.75em;\n    margin-right: -0.75em;\n  }\n\n  .ui.eight.doubling.cards .card {\n    width: -webkit-calc( 25%  -  1.5em );\n    width: calc( 25%  -  1.5em );\n    margin-left: 0.75em;\n    margin-right: 0.75em;\n  }\n\n  .ui.nine.doubling.cards {\n    margin-left: -0.75em;\n    margin-right: -0.75em;\n  }\n\n  .ui.nine.doubling.cards .card {\n    width: -webkit-calc( 25%  -  1.5em );\n    width: calc( 25%  -  1.5em );\n    margin-left: 0.75em;\n    margin-right: 0.75em;\n  }\n\n  .ui.ten.doubling.cards {\n    margin-left: -0.75em;\n    margin-right: -0.75em;\n  }\n\n  .ui.ten.doubling.cards .card {\n    width: -webkit-calc( 20%  -  1.5em );\n    width: calc( 20%  -  1.5em );\n    margin-left: 0.75em;\n    margin-right: 0.75em;\n  }\n}\n\n/*-------------------\n      Stackable\n--------------------*/\n\n@media only screen and (max-width: 767px) {\n  .ui.stackable.cards {\n    display: block !important;\n  }\n\n  .ui.stackable.cards .card:first-child {\n    margin-top: 0em !important;\n  }\n\n  .ui.stackable.cards > .card {\n    display: block !important;\n    height: auto !important;\n    margin: 1em 1em;\n    padding: 0 !important;\n    width: -webkit-calc( 100%  -  2em ) !important;\n    width: calc( 100%  -  2em ) !important;\n  }\n}\n\n/*--------------\n      Size\n---------------*/\n\n.ui.cards > .card {\n  font-size: 1em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n    User Variable Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Standard\n*******************************/\n\n/*--------------\n    Comments\n---------------*/\n\n.ui.comments {\n  margin: 1.5em 0em;\n  max-width: 650px;\n}\n\n.ui.comments:first-child {\n  margin-top: 0em;\n}\n\n.ui.comments:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------\n     Comment\n---------------*/\n\n.ui.comments .comment {\n  position: relative;\n  background: none;\n  margin: 0.5em 0em 0em;\n  padding: 0.5em 0em 0em;\n  border: none;\n  border-top: none;\n  line-height: 1.2;\n}\n\n.ui.comments .comment:first-child {\n  margin-top: 0em;\n  padding-top: 0em;\n}\n\n/*--------------------\n    Nested Comments\n---------------------*/\n\n.ui.comments .comment .comments {\n  margin: 0em 0em 0.5em 0.5em;\n  padding: 1em 0em 1em 1em;\n}\n\n.ui.comments .comment .comments:before {\n  position: absolute;\n  top: 0px;\n  left: 0px;\n}\n\n.ui.comments .comment .comments .comment {\n  border: none;\n  border-top: none;\n  background: none;\n}\n\n/*--------------\n     Avatar\n---------------*/\n\n.ui.comments .comment .avatar {\n  display: block;\n  width: 2.5em;\n  height: auto;\n  float: left;\n  margin: 0.2em 0em 0em;\n}\n\n.ui.comments .comment img.avatar,\n.ui.comments .comment .avatar img {\n  display: block;\n  margin: 0em auto;\n  width: 100%;\n  height: 100%;\n  border-radius: 0.25rem;\n}\n\n/*--------------\n     Content\n---------------*/\n\n.ui.comments .comment > .content {\n  display: block;\n}\n\n/* If there is an avatar move content over */\n\n.ui.comments .comment > .avatar ~ .content {\n  margin-left: 3.5em;\n}\n\n/*--------------\n     Author\n---------------*/\n\n.ui.comments .comment .author {\n  font-size: 1em;\n  color: rgba(0, 0, 0, 0.8);\n  font-weight: bold;\n}\n\n.ui.comments .comment a.author {\n  cursor: pointer;\n}\n\n.ui.comments .comment a.author:hover {\n  color: #00b2f3;\n}\n\n/*--------------\n     Metadata\n---------------*/\n\n.ui.comments .comment .metadata {\n  display: inline-block;\n  margin-left: 0.5em;\n  color: rgba(0, 0, 0, 0.4);\n  font-size: 0.875em;\n}\n\n.ui.comments .comment .metadata > * {\n  display: inline-block;\n  margin: 0em 0.5em 0em 0em;\n}\n\n.ui.comments .comment .metadata > :last-child {\n  margin-right: 0em;\n}\n\n/*--------------------\n     Comment Text\n---------------------*/\n\n.ui.comments .comment .text {\n  margin: 0.25em 0em 0.5em;\n  font-size: 1em;\n  word-wrap: break-word;\n  color: rgba(0, 0, 0, 0.8);\n  line-height: 1.3;\n}\n\n/*--------------------\n     User Actions\n---------------------*/\n\n.ui.comments .comment .actions {\n  font-size: 0.875em;\n}\n\n.ui.comments .comment .actions a {\n  cursor: pointer;\n  display: inline-block;\n  margin: 0em 0.75em 0em 0em;\n  color: rgba(0, 0, 0, 0.4);\n}\n\n.ui.comments .comment .actions a:last-child {\n  margin-right: 0em;\n}\n\n.ui.comments .comment .actions a.active,\n.ui.comments .comment .actions a:hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------------\n      Reply Form\n---------------------*/\n\n.ui.comments > .reply.form {\n  margin-top: 1em;\n}\n\n.ui.comments .comment .reply.form {\n  width: 100%;\n  margin-top: 1em;\n}\n\n.ui.comments .reply.form textarea {\n  font-size: 1em;\n  height: 12em;\n}\n\n/*******************************\n            State\n*******************************/\n\n.ui.collapsed.comments,\n.ui.comments .collapsed.comments,\n.ui.comments .collapsed.comment {\n  display: none;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------------\n        Threaded\n---------------------*/\n\n.ui.threaded.comments .comment .comments {\n  margin: -1.5em 0 -1em 1.25em;\n  padding: 3em 0em 2em 2.25em;\n  box-shadow: -1px 0px 0px rgba(39, 41, 43, 0.15);\n}\n\n/*--------------------\n        Minimal\n---------------------*/\n\n.ui.minimal.comments .comment .actions {\n  opacity: 0;\n  position: absolute;\n  top: 0px;\n  right: 0px;\n  left: auto;\n  -webkit-transition: opacity 0.2s ease;\n  transition: opacity 0.2s ease;\n  -webkit-transition-delay: 0.1s;\n  transition-delay: 0.1s;\n}\n\n.ui.minimal.comments .comment > .content:hover > .actions {\n  opacity: 1;\n}\n\n/*--------------------\n       Sizes\n---------------------*/\n\n.ui.small.comments {\n  font-size: 0.9em;\n}\n\n.ui.comments {\n  font-size: 1em;\n}\n\n.ui.large.comments {\n  font-size: 1.1em;\n}\n\n.ui.huge.comments {\n  font-size: 1.2em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n    User Variable Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n         Activity Feed\n*******************************/\n\n.ui.feed {\n  margin: 1em 0em;\n}\n\n.ui.feed:first-child {\n  margin-top: 0em;\n}\n\n.ui.feed:last-child {\n  margin-top: 0em;\n}\n\n/*******************************\n            Content\n*******************************/\n\n/* Event */\n\n.ui.feed > .event {\n  display: table;\n  width: 100%;\n  padding: 0.5rem 0em;\n  margin: 0em;\n  background: none;\n  border-top: none;\n}\n\n.ui.feed > .event:first-child {\n  border-top: 0px;\n  padding-top: 0em;\n}\n\n.ui.feed > .event:last-child {\n  padding-bottom: 0em;\n}\n\n/* Event Label */\n\n.ui.feed > .event > .label {\n  display: table-cell;\n  width: 2.5em;\n  height: 2.5em;\n  vertical-align: top;\n  text-align: left;\n}\n\n.ui.feed > .event > .label .icon {\n  opacity: 1;\n  font-size: 1.5em;\n  width: 100%;\n  padding: 0.25em;\n  background: none;\n  border: none;\n  border-radius: none;\n  color: rgba(0, 0, 0, 0.6);\n}\n\n.ui.feed > .event > .label img {\n  width: 100%;\n  height: auto;\n  border-radius: 500rem;\n}\n\n.ui.feed > .event > .label + .content {\n  padding: 0.5em 0em 0.5em 1.25em;\n}\n\n/* Content */\n\n.ui.feed > .event > .content {\n  display: table-cell;\n  vertical-align: top;\n  text-align: left;\n  word-wrap: break-word;\n}\n\n.ui.feed > .event:last-child > .content {\n  padding-bottom: 0em;\n}\n\n/* Link */\n\n.ui.feed > .event > .content a {\n  cursor: pointer;\n}\n\n/*--------------\n      Date\n---------------*/\n\n.ui.feed > .event > .content .date {\n  margin: -0.5rem 0em 0em;\n  padding: 0em;\n  font-weight: normal;\n  font-size: 1em;\n  font-style: normal;\n  color: rgba(0, 0, 0, 0.4);\n}\n\n/*--------------\n     Summary\n---------------*/\n\n.ui.feed > .event > .content .summary {\n  margin: 0em;\n  font-size: 1em;\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Summary Image */\n\n.ui.feed > .event > .content .summary img {\n  display: inline-block;\n  width: auto;\n  height: 2em;\n  margin: -0.25em 0.25em 0em 0em;\n  border-radius: 0.25em;\n  vertical-align: middle;\n}\n\n/*--------------\n      User\n---------------*/\n\n.ui.feed > .event > .content .user {\n  display: inline-block;\n  font-weight: bold;\n  margin-right: 0em;\n  vertical-align: baseline;\n}\n\n.ui.feed > .event > .content .user img {\n  margin: -0.25em 0.25em 0em 0em;\n  width: auto;\n  height: 2em;\n  vertical-align: middle;\n}\n\n/*--------------\n   Inline Date\n---------------*/\n\n/* Date inside Summary */\n\n.ui.feed > .event > .content .summary > .date {\n  display: inline-block;\n  float: none;\n  font-weight: normal;\n  font-size: 0.875em;\n  font-style: normal;\n  margin: 0em 0em 0em 0.5em;\n  padding: 0em;\n  color: rgba(0, 0, 0, 0.4);\n}\n\n/*--------------\n  Extra Summary\n---------------*/\n\n.ui.feed > .event > .content .extra {\n  margin: 0.5em 0em 0em;\n  background: none;\n  padding: 0em;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Images */\n\n.ui.feed > .event > .content .extra.images img {\n  display: inline-block;\n  margin: 0em 0.25em 0em 0em;\n  width: 6em;\n}\n\n/* Text */\n\n.ui.feed > .event > .content .extra.text {\n  padding: 0.5em 1em;\n  border-left: 3px solid rgba(0, 0, 0, 0.2);\n  font-size: 1em;\n  max-width: 500px;\n  line-height: 1.33;\n}\n\n/*--------------\n      Meta\n---------------*/\n\n.ui.feed > .event > .content .meta {\n  display: inline-block;\n  font-size: 0.875em;\n  margin: 0.5em 0em 0em;\n  background: none;\n  border: none;\n  border-radius: 0;\n  box-shadow: none;\n  padding: 0em;\n  color: rgba(0, 0, 0, 0.6);\n}\n\n.ui.feed > .event > .content .meta > * {\n  position: relative;\n  margin-left: 0.75em;\n}\n\n.ui.feed > .event > .content .meta > *:after {\n  content: \'\';\n  color: rgba(0, 0, 0, 0.2);\n  top: 0em;\n  left: -1em;\n  opacity: 1;\n  position: absolute;\n  vertical-align: top;\n}\n\n.ui.feed > .event > .content .meta .like {\n  color: \'\';\n  -webkit-transition: 0.2s color ease;\n  transition: 0.2s color ease;\n}\n\n.ui.feed > .event > .content .meta .like:hover .icon {\n  color: #ff2733;\n}\n\n.ui.feed > .event > .content .meta .active.like .icon {\n  color: #ef404a;\n}\n\n/* First element */\n\n.ui.feed > .event > .content .meta > :first-child {\n  margin-left: 0em;\n}\n\n.ui.feed > .event > .content .meta > :first-child::after {\n  display: none;\n}\n\n/* Action */\n\n.ui.feed > .event > .content .meta a,\n.ui.feed > .event > .content .meta > .icon {\n  cursor: pointer;\n  opacity: 1;\n  color: rgba(0, 0, 0, 0.5);\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n.ui.feed > .event > .content .meta a:hover,\n.ui.feed > .event > .content .meta a:hover .icon,\n.ui.feed > .event > .content .meta > .icon:hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*******************************\n            Variations\n*******************************/\n\n.ui.small.feed {\n  font-size: 0.9em;\n}\n\n.ui.feed {\n  font-size: 1em;\n}\n\n.ui.large.feed {\n  font-size: 1.1em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n    User Variable Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Standard\n*******************************/\n\n/*--------------\n      Item\n---------------*/\n\n.ui.items > .item {\n  table-layout: fixed;\n  display: table;\n  margin: 1em 0em;\n  width: 100%;\n  min-height: 0px;\n  background: transparent;\n  padding: 0em;\n  border: none;\n  border-radius: 0rem;\n  box-shadow: none;\n  -webkit-transition: box-shadow 0.2s ease;\n  transition: box-shadow 0.2s ease;\n  z-index: \'\';\n}\n\n.ui.items > .item a {\n  cursor: pointer;\n}\n\n/*--------------\n      Items\n---------------*/\n\n.ui.items {\n  margin: 1.5em 0em;\n}\n\n.ui.items:first-child {\n  margin-top: 0em !important;\n}\n\n.ui.items:last-child {\n  margin-bottom: 0em !important;\n}\n\n/*--------------\n      Item\n---------------*/\n\n.ui.items > .item {\n  min-width: 100%;\n}\n\n.ui.items > .item:after {\n  display: block;\n  content: \' \';\n  height: 0px;\n  clear: both;\n  overflow: hidden;\n  visibility: hidden;\n}\n\n.ui.items > .item:first-child {\n  margin-top: 0em;\n}\n\n.ui.items > .item:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------\n     Images\n---------------*/\n\n.ui.items > .item > .image {\n  position: relative;\n  display: table-cell;\n  float: none;\n  margin: 0em;\n  padding: 0em;\n  max-height: \'\';\n  vertical-align: top;\n}\n\n.ui.items > .item > .image > img {\n  display: block;\n  width: 100%;\n  height: auto;\n  border-radius: 0.125rem;\n  border: none;\n}\n\n.ui.items > .item > .image:only-child > img {\n  border-radius: 0rem;\n}\n\n/*--------------\n     Content\n---------------*/\n\n.ui.items > .item > .content {\n  display: block;\n  background: none;\n  margin: 0em;\n  padding: 0em;\n  box-shadow: none;\n  font-size: 1em;\n  border: none;\n  border-radius: 0em;\n}\n\n.ui.items > .item > .content:after {\n  display: block;\n  content: \' \';\n  height: 0px;\n  clear: both;\n  overflow: hidden;\n  visibility: hidden;\n}\n\n.ui.items > .item > .image + .content {\n  width: 100%;\n  display: table-cell;\n  margin-left: 0em;\n  vertical-align: top;\n  padding-left: 1.5em;\n}\n\n.ui.items > .item > .content > .header {\n  display: inline-block;\n  margin: -0.165em 0em 0em;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.85);\n}\n\n/* Default Header Size */\n\n.ui.items > .item > .content > .header:not(.ui) {\n  font-size: 1.2em;\n}\n\n/*--------------\n     Floated\n---------------*/\n\n.ui.items > .item [class*="left floated"] {\n  float: left;\n}\n\n.ui.items > .item [class*="right floated"] {\n  float: right;\n}\n\n/*--------------\n  Content Image\n---------------*/\n\n.ui.items > .item .content img {\n  display: inline-block;\n  vertical-align: middle;\n  width: 2em;\n}\n\n.ui.items > .item img.avatar,\n.ui.items > .item .avatar img {\n  width: 2em;\n  height: 2em;\n  border-radius: 500rem;\n}\n\n/*--------------\n   Description\n---------------*/\n\n.ui.items > .item > .content > .description {\n  margin-top: 0.6em;\n  max-width: 550px;\n  font-size: 1em;\n  line-height: 1.33;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------\n    Paragraph\n---------------*/\n\n.ui.items > .item > .content p {\n  margin: 0em 0em 0.5em;\n}\n\n.ui.items > .item > .content p:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------\n      Meta\n---------------*/\n\n.ui.items > .item .meta {\n  font-size: 1em;\n  line-height: 1em;\n  color: rgba(0, 0, 0, 0.6);\n}\n\n.ui.items > .item .meta * {\n  margin-right: 0.3em;\n}\n\n.ui.items > .item .meta :last-child {\n  margin-right: 0em;\n}\n\n.ui.items > .item .meta [class*="right floated"] {\n  margin-right: 0em;\n  margin-left: 0.3em;\n}\n\n/*--------------\n      Links\n---------------*/\n\n/* Generic */\n\n.ui.items > .item > .content a:not(.ui) {\n  color: \'\';\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n.ui.items > .item > .content a:not(.ui):hover {\n  color: \'\';\n}\n\n/* Header */\n\n.ui.items > .item > .content > a.header {\n  color: rgba(0, 0, 0, 0.85);\n}\n\n.ui.items > .item > .content > a.header:hover {\n  color: #00b2f3;\n}\n\n/* Meta */\n\n.ui.items > .item .meta > a:not(.ui) {\n  color: rgba(0, 0, 0, 0.4);\n}\n\n.ui.items > .item .meta > a:not(.ui):hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------\n     Labels\n---------------*/\n\n/*-----Star----- */\n\n/* Icon */\n\n.ui.items > .item > .content .favorite.icon {\n  cursor: pointer;\n  opacity: 0.75;\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n.ui.items > .item > .content .favorite.icon:hover {\n  opacity: 1;\n  color: #ffb70a;\n}\n\n.ui.items > .item > .content .active.favorite.icon {\n  color: #ffb70a;\n}\n\n/*-----Like----- */\n\n/* Icon */\n\n.ui.items > .item > .content .like.icon {\n  cursor: pointer;\n  opacity: 0.75;\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n.ui.items > .item > .content .like.icon:hover {\n  opacity: 1;\n  color: #ff2733;\n}\n\n.ui.items > .item > .content .active.like.icon {\n  color: #ff2733;\n}\n\n/*----------------\n  Extra Content\n-----------------*/\n\n.ui.items > .item .extra {\n  display: block;\n  position: relative;\n  background: none;\n  margin: 0.5rem 0em 0em;\n  width: 100%;\n  padding: 0em 0em 0em;\n  top: 0em;\n  left: 0em;\n  color: rgba(0, 0, 0, 0.4);\n  box-shadow: none;\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n  border-top: none;\n}\n\n.ui.items > .item .extra > * {\n  margin: 0.25rem 0.5rem 0.25rem 0em;\n}\n\n.ui.items > .item .extra > [class*="right floated"] {\n  margin: 0.25rem 0em 0.25rem 0.5rem;\n}\n\n.ui.items > .item .extra:after {\n  display: block;\n  content: \' \';\n  height: 0px;\n  clear: both;\n  overflow: hidden;\n  visibility: hidden;\n}\n\n/*******************************\n          Responsive\n*******************************/\n\n/* Default Image Width */\n\n.ui.items > .item > .image:not(.ui) {\n  width: 175px;\n}\n\n/* Tablet Only */\n\n@media only screen and (min-width: 768px) and (max-width: 991px) {\n  .ui.items > .item {\n    margin: 1em 0em;\n  }\n\n  .ui.items > .item > .image:not(.ui) {\n    width: 150px;\n  }\n\n  .ui.items > .item > .image + .content {\n    display: block;\n    padding: 0em 0em 0em 1em;\n  }\n}\n\n/* Mobily Only */\n\n@media only screen and (max-width: 767px) {\n  .ui.items > .item {\n    margin: 2em 0em;\n  }\n\n  .ui.items > .item > .image {\n    display: block;\n    margin-left: auto;\n    margin-right: auto;\n  }\n\n  .ui.items > .item > .image,\n  .ui.items > .item > .image > img {\n    max-width: 100% !important;\n    width: auto !important;\n    max-height: 250px !important;\n  }\n\n  .ui.items > .item > .image + .content {\n    display: block;\n    padding: 1.5em 0em 0em;\n  }\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-------------------\n       Aligned\n--------------------*/\n\n.ui.items > .item > .image + [class*="top aligned"].content {\n  vertical-align: top;\n}\n\n.ui.items > .item > .image + [class*="middle aligned"].content {\n  vertical-align: middle;\n}\n\n.ui.items > .item > .image + [class*="bottom aligned"].content {\n  vertical-align: bottom;\n}\n\n/*--------------\n     Relaxed\n---------------*/\n\n.ui.relaxed.items > .item {\n  margin: 1.5em 0em;\n}\n\n.ui[class*="very relaxed"].items > .item {\n  margin: 2em 0em;\n}\n\n/*-------------------\n      Divided\n--------------------*/\n\n.ui.divided.items > .item {\n  border-top: 1px solid rgba(39, 41, 43, 0.15);\n  margin: 0em;\n  padding: 1em 0em;\n}\n\n.ui.divided.items > .item:first-child {\n  border-top: none;\n  margin-top: 0em !important;\n  padding-top: 0em !important;\n}\n\n.ui.divided.items > .item:last-child {\n  margin-bottom: 0em !important;\n  padding-bottom: 0em !important;\n}\n\n/* Relaxed Divided */\n\n.ui.relaxed.divided.items > .item {\n  margin: 0em;\n  padding: 1.5em 0em;\n}\n\n.ui[class*="very relaxed"].divided.items > .item {\n  margin: 0em;\n  padding: 2em 0em;\n}\n\n/*-------------------\n        Link\n--------------------*/\n\n.ui.items a.item:hover,\n.ui.link.items > .item:hover {\n  cursor: pointer;\n}\n\n.ui.items a.item:hover .content .header,\n.ui.link.items > .item:hover .content .header {\n  color: #00b2f3;\n}\n\n/*--------------\n      Size\n---------------*/\n\n.ui.items > .item {\n  font-size: 1em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n    User Variable Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n           Statistic\n*******************************/\n\n/* Standalone */\n\n.ui.statistic {\n  display: inline-block;\n  margin: 1em 0em;\n  max-width: 175px;\n}\n\n.ui.statistic + .ui.statistic {\n  margin: 0em 0em 0em 1em;\n}\n\n.ui.statistic:first-child {\n  margin-top: 0em;\n}\n\n.ui.statistic:last-child {\n  margin-bottom: 0em;\n}\n\n/* Grouped */\n\n.ui.statistics > .statistic {\n  display: block;\n  float: left;\n  margin: 0em 1em 2em;\n  max-width: 175px;\n}\n\n/*******************************\n            Group\n*******************************/\n\n.ui.statistics {\n  display: block;\n  margin: 1em -1em;\n}\n\n/* Clearing */\n\n.ui.statistics:after {\n  display: block;\n  content: \' \';\n  height: 0px;\n  clear: both;\n  overflow: hidden;\n  visibility: hidden;\n}\n\n.ui.statistics:first-child {\n  margin-top: 0em;\n}\n\n.ui.statistics:last-child {\n  margin-bottom: 0em;\n}\n\n/*******************************\n            Content\n*******************************/\n\n/*--------------\n      Value\n---------------*/\n\n.ui.statistics .statistic > .value,\n.ui.statistic > .value {\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-size: 4rem;\n  font-weight: normal;\n  line-height: 1em;\n  color: #1b1c1d;\n  text-transform: uppercase;\n  text-align: center;\n}\n\n/*--------------\n     Label\n---------------*/\n\n.ui.statistics .statistic > .label,\n.ui.statistic > .label {\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-size: 1rem;\n  font-weight: normal;\n  color: rgba(0, 0, 0, 0.4);\n  text-transform: none;\n  text-align: center;\n}\n\n/* Top Label */\n\n.ui.statistics .statistic > .label ~ .value,\n.ui.statistic > .label ~ .value {\n  margin-top: 0rem;\n}\n\n/* Bottom Label */\n\n.ui.statistics .statistic > .value ~ .label,\n.ui.statistic > .value ~ .label {\n  margin-top: 0.25rem;\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*--------------\n   Icon Value\n---------------*/\n\n.ui.statistics .statistic > .value .icon,\n.ui.statistic > .value .icon {\n  opacity: 1;\n  width: auto;\n  margin: 0em;\n}\n\n/*--------------\n   Text Value\n---------------*/\n\n.ui.statistics .statistic > .text.value,\n.ui.statistic > .text.value {\n  line-height: 1em;\n  min-height: 2em;\n  text-align: center;\n}\n\n.ui.statistics .statistic > .text.value + .label,\n.ui.statistic > .text.value + .label {\n  text-align: center;\n}\n\n/*--------------\n   Image Value\n---------------*/\n\n.ui.statistics .statistic > .value img,\n.ui.statistic > .value img {\n  max-height: 3rem;\n  vertical-align: baseline;\n}\n\n/*******************************\n            Variations\n*******************************/\n\n/*--------------\n   Horizontal\n---------------*/\n\n.ui.horizontal.statistics,\n.ui.horizontal.statistic {\n  display: block;\n  margin: 0em;\n  max-width: 9999px;\n}\n\n.ui.horizontal.statistics .statistic {\n  float: none;\n  margin: 1em 0em;\n  max-width: 9999px;\n}\n\n.ui.horizontal.statistic > .text.value,\n.ui.horizontal.statistics > .statistic > .text.value {\n  min-height: 0em !important;\n}\n\n.ui.horizontal.statistics .statistic > .value .icon,\n.ui.horizontal.statistic > .value .icon {\n  width: 1.18em;\n}\n\n.ui.horizontal.statistics .statistic > .value,\n.ui.horizontal.statistic > .value {\n  display: inline-block;\n  vertical-align: middle;\n}\n\n.ui.horizontal.statistics .statistic > .label,\n.ui.horizontal.statistic > .label {\n  display: inline-block;\n  vertical-align: middle;\n  margin: 0em 0em 0em 0.75em;\n}\n\n/*--------------\n     Colors\n---------------*/\n\n.ui.blue.statistics .statistic > .value,\n.ui.statistics .blue.statistic > .value,\n.ui.blue.statistic > .value {\n  color: #3b83c0;\n}\n\n.ui.green.statistics .statistic > .value,\n.ui.statistics .green.statistic > .value,\n.ui.green.statistic > .value {\n  color: #5bbd72;\n}\n\n.ui.orange.statistics .statistic > .value,\n.ui.statistics .orange.statistic > .value,\n.ui.orange.statistic > .value {\n  color: #e07b53;\n}\n\n.ui.pink.statistics .statistic > .value,\n.ui.statistics .pink.statistic > .value,\n.ui.pink.statistic > .value {\n  color: #d9499a;\n}\n\n.ui.purple.statistics .statistic > .value,\n.ui.statistics .purple.statistic > .value,\n.ui.purple.statistic > .value {\n  color: #564f8a;\n}\n\n.ui.red.statistics .statistic > .value,\n.ui.statistics .red.statistic > .value,\n.ui.red.statistic > .value {\n  color: #d95c5c;\n}\n\n.ui.teal.statistics .statistic > .value,\n.ui.statistics .teal.statistic > .value,\n.ui.teal.statistic > .value {\n  color: #00b5ad;\n}\n\n.ui.yellow.statistics .statistic > .value,\n.ui.statistics .yellow.statistic > .value,\n.ui.yellow.statistic > .value {\n  color: #f2c61f;\n}\n\n/*--------------\n    Floated\n---------------*/\n\n.ui[class*="left floated"].statistic {\n  float: left;\n  margin: 0em 2em 1em 0em;\n}\n\n.ui[class*="right floated"].statistic {\n  float: right;\n  margin: 0em 0em 1em 2em;\n}\n\n.ui.floated.statistic:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------\n    Inverted\n---------------*/\n\n.ui.inverted.statistic .value {\n  color: #ffffff;\n}\n\n.ui.inverted.statistic .label {\n  color: rgba(255, 255, 255, 0.8);\n}\n\n.ui.inverted.blue.statistics .statistic > .value,\n.ui.statistics .inverted.blue.statistic > .value,\n.ui.inverted.blue.statistic > .value {\n  color: #54c8ff;\n}\n\n.ui.inverted.green.statistics .statistic > .value,\n.ui.statistics .inverted.green.statistic > .value,\n.ui.inverted.green.statistic > .value {\n  color: #2ecc40;\n}\n\n.ui.inverted.orange.statistics .statistic > .value,\n.ui.statistics .inverted.orange.statistic > .value,\n.ui.inverted.orange.statistic > .value {\n  color: #ff851b;\n}\n\n.ui.inverted.pink.statistics .statistic > .value,\n.ui.statistics .inverted.pink.statistic > .value,\n.ui.inverted.pink.statistic > .value {\n  color: #ff8edf;\n}\n\n.ui.inverted.purple.statistics .statistic > .value,\n.ui.statistics .inverted.purple.statistic > .value,\n.ui.inverted.purple.statistic > .value {\n  color: #cdc6ff;\n}\n\n.ui.inverted.red.statistics .statistic > .value,\n.ui.statistics .inverted.red.statistic > .value,\n.ui.inverted.red.statistic > .value {\n  color: #ff695e;\n}\n\n.ui.inverted.teal.statistics .statistic > .value,\n.ui.statistics .inverted.teal.statistic > .value,\n.ui.inverted.teal.statistic > .value {\n  color: #6dffff;\n}\n\n.ui.inverted.yellow.statistics .statistic > .value,\n.ui.statistics .inverted.yellow.statistic > .value,\n.ui.inverted.yellow.statistic > .value {\n  color: #ffe21f;\n}\n\n/*--------------\n     Sizes\n---------------*/\n\n/* Mini */\n\n.ui.mini.statistics .statistic > .value,\n.ui.mini.statistic > .value {\n  font-size: 1.5rem;\n}\n\n.ui.mini.horizontal.statistics .statistic > .value,\n.ui.mini.horizontal.statistic > .value {\n  font-size: 1.5rem;\n}\n\n.ui.mini.statistics .statistic > .text.value,\n.ui.mini.statistic > .text.value {\n  font-size: 1rem;\n}\n\n/* Tiny */\n\n.ui.tiny.statistics .statistic > .value,\n.ui.tiny.statistic > .value {\n  font-size: 2rem;\n}\n\n.ui.tiny.horizontal.statistics .statistic > .value,\n.ui.tiny.horizontal.statistic > .value {\n  font-size: 2rem;\n}\n\n.ui.tiny.statistics .statistic > .text.value,\n.ui.tiny.statistic > .text.value {\n  font-size: 1rem;\n}\n\n/* Small */\n\n.ui.small.statistics .statistic > .value,\n.ui.small.statistic > .value {\n  font-size: 3rem;\n}\n\n.ui.small.horizontal.statistics .statistic > .value,\n.ui.small.horizontal.statistic > .value {\n  font-size: 2rem;\n}\n\n.ui.small.statistics .statistic > .text.value,\n.ui.small.statistic > .text.value {\n  font-size: 1.5rem;\n}\n\n/* Medium */\n\n.ui.statistics .statistic > .value,\n.ui.statistic > .value {\n  font-size: 4rem;\n}\n\n.ui.horizontal.statistics .statistic > .value,\n.ui.horizontal.statistic > .value {\n  font-size: 3rem;\n}\n\n.ui.statistics .statistic > .text.value,\n.ui.statistic > .text.value {\n  font-size: 2rem;\n}\n\n/* Large */\n\n.ui.large.statistics .statistic > .value,\n.ui.large.statistic > .value {\n  font-size: 5rem;\n}\n\n.ui.large.horizontal.statistics .statistic > .value,\n.ui.large.horizontal.statistic > .value {\n  font-size: 4rem;\n}\n\n.ui.large.statistics .statistic > .text.value,\n.ui.large.statistic > .text.value {\n  font-size: 2.5rem;\n}\n\n/* Huge */\n\n.ui.huge.statistics .statistic > .value,\n.ui.huge.statistic > .value {\n  font-size: 6rem;\n}\n\n.ui.huge.horizontal.statistics .statistic > .value,\n.ui.huge.horizontal.statistic > .value {\n  font-size: 5rem;\n}\n\n.ui.huge.statistics .statistic > .text.value,\n.ui.huge.statistic > .text.value {\n  font-size: 2.5rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n    User Variable Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Accordion\n*******************************/\n\n.ui.accordion,\n.ui.accordion .accordion {\n  max-width: 100%;\n  font-size: 1em;\n}\n\n.ui.accordion .accordion {\n  margin: 1em 0em 0em;\n  padding: 0em;\n}\n\n/* Title */\n\n.ui.accordion .title,\n.ui.accordion .accordion .title {\n  cursor: pointer;\n}\n\n/* Default Styling */\n\n.ui.accordion .title:not(.ui) {\n  padding: 0.5em 0em;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-size: 1em;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Content */\n\n.ui.accordion .title ~ .content,\n.ui.accordion .accordion .title ~ .content {\n  display: none;\n}\n\n/* Default Styling */\n\n.ui.accordion:not(.styled) .title ~ .content:not(.ui),\n.ui.accordion:not(.styled) .accordion .title ~ .content:not(.ui) {\n  margin: 0em;\n  padding: 0.5em 0em 1em;\n}\n\n.ui.accordion:not(.styled) .title ~ .content:not(.ui):last-child {\n  padding-bottom: 0em;\n}\n\n/* Arrow */\n\n.ui.accordion .title .dropdown.icon,\n.ui.accordion .accordion .title .dropdown.icon {\n  display: inline-block;\n  float: none;\n  opacity: 0.75;\n  width: 1.25em;\n  height: 1em;\n  margin: 0em 0.25rem 0em 0rem;\n  padding: 0em;\n  font-size: 1em;\n  -webkit-transition: -webkit-transform 0.2s ease, opacity 0.2s ease;\n  transition: transform 0.2s ease, opacity 0.2s ease;\n  vertical-align: baseline;\n  -webkit-transform: rotate(0deg);\n  -ms-transform: rotate(0deg);\n  transform: rotate(0deg);\n}\n\n/*--------------\n    Coupling\n---------------*/\n\n/* Menu */\n\n.ui.accordion.menu .item .title {\n  display: block;\n  padding: 0em;\n}\n\n.ui.accordion.menu .item .title > .dropdown.icon {\n  float: right;\n  margin: 0.165em 0em 0em 1em;\n  -webkit-transform: rotate(180deg);\n  -ms-transform: rotate(180deg);\n  transform: rotate(180deg);\n}\n\n/* Header */\n\n.ui.accordion .ui.header .dropdown.icon {\n  font-size: 1em;\n  margin: 0em 0.25rem 0em 0rem;\n}\n\n/*******************************\n            States\n*******************************/\n\n.ui.accordion .active.title .dropdown.icon,\n.ui.accordion .accordion .active.title .dropdown.icon {\n  -webkit-transform: rotate(90deg);\n  -ms-transform: rotate(90deg);\n  transform: rotate(90deg);\n}\n\n.ui.accordion.menu .item .active.title > .dropdown.icon {\n  -webkit-transform: rotate(90deg);\n  -ms-transform: rotate(90deg);\n  transform: rotate(90deg);\n}\n\n/*******************************\n            Types\n*******************************/\n\n/*--------------\n     Styled\n---------------*/\n\n.ui.styled.accordion {\n  width: 600px;\n}\n\n.ui.styled.accordion,\n.ui.styled.accordion .accordion {\n  border-radius: 0.2857rem;\n  background: #ffffff;\n  box-shadow: 0px 1px 2px 0 rgba(0, 0, 0, 0.05), 0px 0px 0px 1px rgba(39, 41, 43, 0.15);\n}\n\n.ui.styled.accordion .title,\n.ui.styled.accordion .accordion .title {\n  margin: 0em;\n  padding: 0.75em 1em;\n  color: rgba(0, 0, 0, 0.4);\n  font-weight: bold;\n  border-top: 1px solid rgba(39, 41, 43, 0.15);\n  -webkit-transition: background 0.2s ease, color 0.2s ease;\n  transition: background 0.2s ease, color 0.2s ease;\n}\n\n.ui.styled.accordion > .title:first-child,\n.ui.styled.accordion > .accordion .title:first-child {\n  border-top: none;\n}\n\n/* Content */\n\n.ui.styled.accordion .content,\n.ui.styled.accordion .accordion .content {\n  margin: 0em;\n  padding: 0.5em 1em 1.5em;\n}\n\n.ui.styled.accordion .accordion .content {\n  padding: 0em;\n  padding: 0.5em 1em 1.5em;\n}\n\n/* Hover */\n\n.ui.styled.accordion .title:hover,\n.ui.styled.accordion .active.title,\n.ui.styled.accordion .accordion .title:hover,\n.ui.styled.accordion .accordion .active.title {\n  background: transparent;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.styled.accordion .accordion .title:hover,\n.ui.styled.accordion .accordion .active.title {\n  background: transparent;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Active */\n\n.ui.styled.accordion .active.title {\n  background: transparent;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.styled.accordion .accordion .active.title {\n  background: transparent;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------\n     Active\n---------------*/\n\n.ui.accordion .active.content,\n.ui.accordion .accordion .active.content {\n  display: block;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------\n     Fluid\n---------------*/\n\n.ui.fluid.accordion,\n.ui.fluid.accordion .accordion {\n  width: 100%;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n@font-face {\n  font-family: \'Accordion\';\n  src: url(data:application/x-font-ttf;charset=utf-8;base64,AAEAAAALAIAAAwAwT1MvMggjB5AAAAC8AAAAYGNtYXAPfOIKAAABHAAAAExnYXNwAAAAEAAAAWgAAAAIZ2x5Zryj6HgAAAFwAAAAyGhlYWT/0IhHAAACOAAAADZoaGVhApkB5wAAAnAAAAAkaG10eAJuABIAAAKUAAAAGGxvY2EAjABWAAACrAAAAA5tYXhwAAgAFgAAArwAAAAgbmFtZfC1n04AAALcAAABPHBvc3QAAwAAAAAEGAAAACAAAwIAAZAABQAAAUwBZgAAAEcBTAFmAAAA9QAZAIQAAAAAAAAAAAAAAAAAAAABEAAAAAAAAAAAAAAAAAAAAABAAADw2gHg/+D/4AHgACAAAAABAAAAAAAAAAAAAAAgAAAAAAACAAAAAwAAABQAAwABAAAAFAAEADgAAAAKAAgAAgACAAEAIPDa//3//wAAAAAAIPDZ//3//wAB/+MPKwADAAEAAAAAAAAAAAAAAAEAAf//AA8AAQAAAAAAAAAAAAIAADc5AQAAAAABAAAAAAAAAAAAAgAANzkBAAAAAAEAAAAAAAAAAAACAAA3OQEAAAAAAQASAEkAtwFuABMAADc0PwE2FzYXFh0BFAcGJwYvASY1EgaABQgHBQYGBQcIBYAG2wcGfwcBAQcECf8IBAcBAQd/BgYAAAAAAQAAAEkApQFuABMAADcRNDc2MzIfARYVFA8BBiMiJyY1AAUGBwgFgAYGgAUIBwYFWwEACAUGBoAFCAcFgAYGBQcAAAABAAAAAQAAqWYls18PPPUACwIAAAAAAM/9o+4AAAAAz/2j7gAAAAAAtwFuAAAACAACAAAAAAAAAAEAAAHg/+AAAAIAAAAAAAC3AAEAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAQAAAAC3ABIAtwAAAAAAAAAKABQAHgBCAGQAAAABAAAABgAUAAEAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAADgCuAAEAAAAAAAEADAAAAAEAAAAAAAIADgBAAAEAAAAAAAMADAAiAAEAAAAAAAQADABOAAEAAAAAAAUAFgAMAAEAAAAAAAYABgAuAAEAAAAAAAoANABaAAMAAQQJAAEADAAAAAMAAQQJAAIADgBAAAMAAQQJAAMADAAiAAMAAQQJAAQADABOAAMAAQQJAAUAFgAMAAMAAQQJAAYADAA0AAMAAQQJAAoANABaAHIAYQB0AGkAbgBnAFYAZQByAHMAaQBvAG4AIAAxAC4AMAByAGEAdABpAG4AZ3JhdGluZwByAGEAdABpAG4AZwBSAGUAZwB1AGwAYQByAHIAYQB0AGkAbgBnAEYAbwBuAHQAIABnAGUAbgBlAHIAYQB0AGUAZAAgAGIAeQAgAEkAYwBvAE0AbwBvAG4ALgADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA) format(\'truetype\'), url(data:application/font-woff;charset=utf-8;base64,d09GRk9UVE8AAASwAAoAAAAABGgAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABDRkYgAAAA9AAAAS0AAAEtFpovuE9TLzIAAAIkAAAAYAAAAGAIIweQY21hcAAAAoQAAABMAAAATA984gpnYXNwAAAC0AAAAAgAAAAIAAAAEGhlYWQAAALYAAAANgAAADb/0IhHaGhlYQAAAxAAAAAkAAAAJAKZAedobXR4AAADNAAAABgAAAAYAm4AEm1heHAAAANMAAAABgAAAAYABlAAbmFtZQAAA1QAAAE8AAABPPC1n05wb3N0AAAEkAAAACAAAAAgAAMAAAEABAQAAQEBB3JhdGluZwABAgABADr4HAL4GwP4GAQeCgAZU/+Lix4KABlT/4uLDAeLa/iU+HQFHQAAAHkPHQAAAH4RHQAAAAkdAAABJBIABwEBBw0PERQZHnJhdGluZ3JhdGluZ3UwdTF1MjB1RjBEOXVGMERBAAACAYkABAAGAQEEBwoNVp38lA78lA78lA77lA773Z33bxWLkI2Qj44I9xT3FAWOj5CNkIuQi4+JjoePiI2Gi4YIi/uUBYuGiYeHiIiHh4mGi4aLho2Ijwj7FPcUBYeOiY+LkAgO+92L5hWL95QFi5CNkI6Oj4+PjZCLkIuQiY6HCPcU+xQFj4iNhouGi4aJh4eICPsU+xQFiIeGiYaLhouHjYePiI6Jj4uQCA74lBT4lBWLDAoAAAAAAwIAAZAABQAAAUwBZgAAAEcBTAFmAAAA9QAZAIQAAAAAAAAAAAAAAAAAAAABEAAAAAAAAAAAAAAAAAAAAABAAADw2gHg/+D/4AHgACAAAAABAAAAAAAAAAAAAAAgAAAAAAACAAAAAwAAABQAAwABAAAAFAAEADgAAAAKAAgAAgACAAEAIPDa//3//wAAAAAAIPDZ//3//wAB/+MPKwADAAEAAAAAAAAAAAAAAAEAAf//AA8AAQAAAAEAADfYOJZfDzz1AAsCAAAAAADP/aPuAAAAAM/9o+4AAAAAALcBbgAAAAgAAgAAAAAAAAABAAAB4P/gAAACAAAAAAAAtwABAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAEAAAAAtwASALcAAAAAUAAABgAAAAAADgCuAAEAAAAAAAEADAAAAAEAAAAAAAIADgBAAAEAAAAAAAMADAAiAAEAAAAAAAQADABOAAEAAAAAAAUAFgAMAAEAAAAAAAYABgAuAAEAAAAAAAoANABaAAMAAQQJAAEADAAAAAMAAQQJAAIADgBAAAMAAQQJAAMADAAiAAMAAQQJAAQADABOAAMAAQQJAAUAFgAMAAMAAQQJAAYADAA0AAMAAQQJAAoANABaAHIAYQB0AGkAbgBnAFYAZQByAHMAaQBvAG4AIAAxAC4AMAByAGEAdABpAG4AZ3JhdGluZwByAGEAdABpAG4AZwBSAGUAZwB1AGwAYQByAHIAYQB0AGkAbgBnAEYAbwBuAHQAIABnAGUAbgBlAHIAYQB0AGUAZAAgAGIAeQAgAEkAYwBvAE0AbwBvAG4ALgADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA) format(\'woff\');\n  font-weight: normal;\n  font-style: normal;\n}\n\n/* Dropdown Icon */\n\n.ui.accordion .title .dropdown.icon,\n.ui.accordion .accordion .title .dropdown.icon {\n  font-family: Accordion;\n  line-height: 1;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  font-weight: normal;\n  font-style: normal;\n  text-align: center;\n}\n\n.ui.accordion .title .dropdown.icon:before,\n.ui.accordion .accordion .title .dropdown.icon:before {\n  content: \'\f0da\';\n}\n\n/*******************************\n        User Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n           Checkbox\n*******************************/\n\n/*--------------\n    Content\n---------------*/\n\n.ui.checkbox {\n  position: relative;\n  display: inline-block;\n  height: 17px;\n  font-size: 1rem;\n  line-height: 15px;\n  min-width: 17px;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  outline: none;\n  vertical-align: middle;\n}\n\n.ui.checkbox input {\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  opacity: 0 !important;\n  outline: none;\n  z-index: -1;\n}\n\n/*--------------\n      Box\n---------------*/\n\n.ui.checkbox .box,\n.ui.checkbox label {\n  display: block;\n  cursor: pointer;\n  padding-left: 1.75em;\n  outline: none;\n}\n\n.ui.checkbox label {\n  font-size: 1em;\n}\n\n.ui.checkbox .box:before,\n.ui.checkbox label:before {\n  position: absolute;\n  line-height: 1;\n  width: 17px;\n  height: 17px;\n  top: 0em;\n  left: 0em;\n  content: \'\';\n  background: #ffffff;\n  border-radius: 0.25em;\n  -webkit-transition: background-color 0.3s ease, border 0.3s ease, box-shadow 0.3s ease;\n  transition: background-color 0.3s ease, border 0.3s ease, box-shadow 0.3s ease;\n  border: 1px solid #d4d4d5;\n}\n\n/*--------------\n    Checkmark\n---------------*/\n\n.ui.checkbox .box:after,\n.ui.checkbox label:after {\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  line-height: 17px;\n  width: 17px;\n  height: 17px;\n  text-align: center;\n  opacity: 0;\n  color: rgba(0, 0, 0, 0.8);\n  -webkit-transition: all 0.1s ease;\n  transition: all 0.1s ease;\n}\n\n/*--------------\n      Label\n---------------*/\n\n/* Inside */\n\n.ui.checkbox label,\n.ui.checkbox + label {\n  cursor: pointer;\n  color: rgba(0, 0, 0, 0.8);\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n}\n\n/* Outside */\n\n.ui.checkbox + label {\n  vertical-align: middle;\n}\n\n/*******************************\n           States\n*******************************/\n\n/*--------------\n      Hover\n---------------*/\n\n.ui.checkbox .box:hover::before,\n.ui.checkbox label:hover::before {\n  background: #ffffff;\n  border: 1px solid rgba(39, 41, 43, 0.3);\n}\n\n.ui.checkbox label:hover,\n.ui.checkbox + label:hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------\n      Down\n---------------*/\n\n.ui.checkbox .box:active::before,\n.ui.checkbox label:active::before {\n  background: #f5f5f5;\n  border: 1px solid 1px solid rgba(39, 41, 43, 0.3);\n}\n\n.ui.checkbox input:active ~ label {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------\n      Focus\n---------------*/\n\n.ui.checkbox input:focus ~ .box:before,\n.ui.checkbox input:focus ~ label:before {\n  background: #f5f5f5;\n  border: 1px solid 1px solid rgba(39, 41, 43, 0.3);\n}\n\n.ui.checkbox input:focus ~ label {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------\n     Active\n---------------*/\n\n.ui.checkbox input:checked ~ .box:after,\n.ui.checkbox input:checked ~ label:after {\n  opacity: 1;\n}\n\n/*--------------\n    Read-Only\n---------------*/\n\n.ui.read-only.checkbox,\n.ui.read-only.checkbox label {\n  cursor: default;\n}\n\n/*--------------\n     Disabled\n---------------*/\n\n.ui.disabled.checkbox .box:after,\n.ui.disabled.checkbox label,\n.ui.checkbox input[disabled] ~ .box:after,\n.ui.checkbox input[disabled] ~ label {\n  cursor: default;\n  opacity: 0.5;\n  color: #000000;\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*--------------\n     Radio\n---------------*/\n\n.ui.radio.checkbox {\n  height: 14px;\n}\n\n/* Box */\n\n.ui.radio.checkbox .box:before,\n.ui.radio.checkbox label:before {\n  width: 14px;\n  height: 14px;\n  border-radius: 500rem;\n  top: 1px;\n  left: 0px;\n  -webkit-transform: none;\n  -ms-transform: none;\n  transform: none;\n}\n\n/* Circle */\n\n.ui.radio.checkbox .box:after,\n.ui.radio.checkbox label:after {\n  border: none;\n  width: 14px;\n  height: 14px;\n  line-height: 14px;\n  top: 1px;\n  left: 0px;\n  font-size: 9px;\n}\n\n/* Radio Checkbox */\n\n.ui.radio.checkbox .box:after,\n.ui.radio.checkbox label:after {\n  width: 14px;\n  height: 14px;\n  border-radius: 500rem;\n  -webkit-transform: scale(0.42857143);\n  -ms-transform: scale(0.42857143);\n  transform: scale(0.42857143);\n  background-color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------\n     Slider\n---------------*/\n\n.ui.slider.checkbox {\n  cursor: pointer;\n  height: 1.25rem;\n}\n\n.ui.slider.checkbox .box,\n.ui.slider.checkbox label {\n  padding-left: 4.5rem;\n  line-height: 1rem;\n  color: rgba(0, 0, 0, 0.4);\n}\n\n/* Line */\n\n.ui.slider.checkbox .box:before,\n.ui.slider.checkbox label:before {\n  cursor: pointer;\n  display: block;\n  position: absolute;\n  content: \'\';\n  top: 0.4rem;\n  left: 0em;\n  z-index: 1;\n  border: none !important;\n  background-color: rgba(0, 0, 0, 0.05);\n  width: 3.5rem;\n  height: 0.25rem;\n  -webkit-transform: none;\n  -ms-transform: none;\n  transform: none;\n  border-radius: 500rem;\n  -webkit-transition: background 0.3s ease;\n  transition: background 0.3s ease;\n}\n\n/* Handle */\n\n.ui.slider.checkbox .box:after,\n.ui.slider.checkbox label:after {\n  background: #ffffff -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  background: #ffffff linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  position: absolute;\n  content: \'\';\n  opacity: 1;\n  z-index: 2;\n  border: none;\n  box-shadow: 0px 1px 2px 0 rgba(0, 0, 0, 0.05), 0px 0px 0px 1px rgba(39, 41, 43, 0.15) inset;\n  width: 1.5rem;\n  height: 1.5rem;\n  top: -0.25rem;\n  left: 0em;\n  -webkit-transform: none;\n  -ms-transform: none;\n  transform: none;\n  border-radius: 500rem;\n  -webkit-transition: left 0.3s ease 0s;\n  transition: left 0.3s ease 0s;\n}\n\n/* Focus */\n\n.ui.slider.checkbox input:focus ~ .box:before,\n.ui.slider.checkbox input:focus ~ label:before {\n  background-color: rgba(0, 0, 0, 0.1);\n  border: none;\n}\n\n/* Hover */\n\n.ui.slider.checkbox .box:hover,\n.ui.slider.checkbox label:hover {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.slider.checkbox .box:hover::before,\n.ui.slider.checkbox label:hover::before {\n  background: rgba(0, 0, 0, 0.1);\n}\n\n/* Active */\n\n.ui.slider.checkbox input:checked ~ .box,\n.ui.slider.checkbox input:checked ~ label {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.slider.checkbox input:checked ~ .box:before,\n.ui.slider.checkbox input:checked ~ label:before {\n  background-color: rgba(0, 0, 0, 0.1);\n}\n\n.ui.slider.checkbox input:checked ~ .box:after,\n.ui.slider.checkbox input:checked ~ label:after {\n  left: 2rem;\n}\n\n/*--------------\n     Toggle\n---------------*/\n\n.ui.toggle.checkbox {\n  cursor: pointer;\n  height: 1.5rem;\n}\n\n.ui.toggle.checkbox .box,\n.ui.toggle.checkbox label {\n  height: 1.5rem;\n  padding-left: 4.5rem;\n  line-height: 1.5rem;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Switch */\n\n.ui.toggle.checkbox .box:before,\n.ui.toggle.checkbox label:before {\n  cursor: pointer;\n  display: block;\n  position: absolute;\n  content: \'\';\n  top: 0rem;\n  z-index: 1;\n  border: none;\n  background-color: rgba(0, 0, 0, 0.05);\n  width: 3.5rem;\n  height: 1.5rem;\n  border-radius: 500rem;\n}\n\n/* Handle */\n\n.ui.toggle.checkbox .box:after,\n.ui.toggle.checkbox label:after {\n  background: #ffffff -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  background: #ffffff linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  position: absolute;\n  content: \'\';\n  opacity: 1;\n  z-index: 2;\n  border: none;\n  box-shadow: 0px 1px 2px 0 rgba(0, 0, 0, 0.05), 0px 0px 0px 1px rgba(39, 41, 43, 0.15) inset;\n  width: 1.5rem;\n  height: 1.5rem;\n  top: 0rem;\n  left: 0em;\n  border-radius: 500rem;\n  -webkit-transition: background 0.3s ease 0s,\n    left 0.3s ease 0s;\n  transition: background 0.3s ease 0s,\n    left 0.3s ease 0s;\n}\n\n.ui.toggle.checkbox input ~ .box:after,\n.ui.toggle.checkbox input ~ label:after {\n  left: -0.05rem;\n}\n\n/* Focus */\n\n.ui.toggle.checkbox input:focus ~ .box:before,\n.ui.toggle.checkbox input:focus ~ label:before {\n  background-color: rgba(0, 0, 0, 0.1);\n  border: none;\n}\n\n/* Hover */\n\n.ui.toggle.checkbox .box:hover::before,\n.ui.toggle.checkbox label:hover::before {\n  background-color: rgba(0, 0, 0, 0.1);\n  border: none;\n}\n\n/* Active */\n\n.ui.toggle.checkbox input:checked ~ .box,\n.ui.toggle.checkbox input:checked ~ label {\n  color: #5bbd72;\n}\n\n.ui.toggle.checkbox input:checked ~ .box:before,\n.ui.toggle.checkbox input:checked ~ label:before {\n  background-color: #5bbd72;\n}\n\n.ui.toggle.checkbox input:checked ~ .box:after,\n.ui.toggle.checkbox input:checked ~ label:after {\n  left: 2.05rem;\n}\n\n/*******************************\n            Variations\n*******************************/\n\n/*--------------\n     Fitted\n---------------*/\n\n.ui.fitted.checkbox .box,\n.ui.fitted.checkbox label {\n  padding-left: 0em !important;\n}\n\n.ui.fitted.toggle.checkbox,\n.ui.fitted.toggle.checkbox {\n  width: 3.5rem;\n}\n\n.ui.fitted.slider.checkbox,\n.ui.fitted.slider.checkbox {\n  width: 3.5rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n@font-face {\n  font-family: \'Checkbox\';\n  src: url(data:application/x-font-ttf;charset=utf-8;base64,AAEAAAAOAIAAAwBgT1MvMj3hSQEAAADsAAAAVmNtYXDQEhm3AAABRAAAAUpjdnQgBkn/lAAABuwAAAAcZnBnbYoKeDsAAAcIAAAJkWdhc3AAAAAQAAAG5AAAAAhnbHlm32cEdgAAApAAAAC2aGVhZAErPHsAAANIAAAANmhoZWEHUwNNAAADgAAAACRobXR4CykAAAAAA6QAAAAMbG9jYQA4AFsAAAOwAAAACG1heHAApgm8AAADuAAAACBuYW1lzJ0aHAAAA9gAAALNcG9zdK69QJgAAAaoAAAAO3ByZXCSoZr/AAAQnAAAAFYAAQO4AZAABQAIAnoCvAAAAIwCegK8AAAB4AAxAQIAAAIABQMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUGZFZABA6ADoAQNS/2oAWgMLAE8AAAABAAAAAAAAAAAAAwAAAAMAAAAcAAEAAAAAAEQAAwABAAAAHAAEACgAAAAGAAQAAQACAADoAf//AAAAAOgA//8AABgBAAEAAAAAAAAAAAEGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAADpAKYABUAHEAZDwEAAQFCAAIBAmoAAQABagAAAGEUFxQDEisBFAcBBiInASY0PwE2Mh8BATYyHwEWA6QP/iAQLBD+6g8PTBAsEKQBbhAsEEwPAhYWEP4gDw8BFhAsEEwQEKUBbxAQTBAAAAH//f+xA18DCwAMABJADwABAQpDAAAACwBEFRMCESsBFA4BIi4CPgEyHgEDWXLG6MhuBnq89Lp+AV51xHR0xOrEdHTEAAAAAAEAAAABAADDeRpdXw889QALA+gAAAAAzzWYjQAAAADPNWBN//3/sQOkAwsAAAAIAAIAAAAAAAAAAQAAA1L/agBaA+gAAP/3A6QAAQAAAAAAAAAAAAAAAAAAAAMD6AAAA+gAAANZAAAAAAAAADgAWwABAAAAAwAWAAEAAAAAAAIABgATAG4AAAAtCZEAAAAAAAAAEgDeAAEAAAAAAAAANQAAAAEAAAAAAAEACAA1AAEAAAAAAAIABwA9AAEAAAAAAAMACABEAAEAAAAAAAQACABMAAEAAAAAAAUACwBUAAEAAAAAAAYACABfAAEAAAAAAAoAKwBnAAEAAAAAAAsAEwCSAAMAAQQJAAAAagClAAMAAQQJAAEAEAEPAAMAAQQJAAIADgEfAAMAAQQJAAMAEAEtAAMAAQQJAAQAEAE9AAMAAQQJAAUAFgFNAAMAAQQJAAYAEAFjAAMAAQQJAAoAVgFzAAMAAQQJAAsAJgHJQ29weXJpZ2h0IChDKSAyMDE0IGJ5IG9yaWdpbmFsIGF1dGhvcnMgQCBmb250ZWxsby5jb21mb250ZWxsb1JlZ3VsYXJmb250ZWxsb2ZvbnRlbGxvVmVyc2lvbiAxLjBmb250ZWxsb0dlbmVyYXRlZCBieSBzdmcydHRmIGZyb20gRm9udGVsbG8gcHJvamVjdC5odHRwOi8vZm9udGVsbG8uY29tAEMAbwBwAHkAcgBpAGcAaAB0ACAAKABDACkAIAAyADAAMQA0ACAAYgB5ACAAbwByAGkAZwBpAG4AYQBsACAAYQB1AHQAaABvAHIAcwAgAEAAIABmAG8AbgB0AGUAbABsAG8ALgBjAG8AbQBmAG8AbgB0AGUAbABsAG8AUgBlAGcAdQBsAGEAcgBmAG8AbgB0AGUAbABsAG8AZgBvAG4AdABlAGwAbABvAFYAZQByAHMAaQBvAG4AIAAxAC4AMABmAG8AbgB0AGUAbABsAG8ARwBlAG4AZQByAGEAdABlAGQAIABiAHkAIABzAHYAZwAyAHQAdABmACAAZgByAG8AbQAgAEYAbwBuAHQAZQBsAGwAbwAgAHAAcgBvAGoAZQBjAHQALgBoAHQAdABwADoALwAvAGYAbwBuAHQAZQBsAGwAbwAuAGMAbwBtAAAAAAIAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAQIBAwljaGVja21hcmsGY2lyY2xlAAAAAAEAAf//AA8AAAAAAAAAAAAAAAAAAAAAADIAMgML/7EDC/+xsAAssCBgZi2wASwgZCCwwFCwBCZasARFW1ghIyEbilggsFBQWCGwQFkbILA4UFghsDhZWSCwCkVhZLAoUFghsApFILAwUFghsDBZGyCwwFBYIGYgiophILAKUFhgGyCwIFBYIbAKYBsgsDZQWCGwNmAbYFlZWRuwACtZWSOwAFBYZVlZLbACLCBFILAEJWFkILAFQ1BYsAUjQrAGI0IbISFZsAFgLbADLCMhIyEgZLEFYkIgsAYjQrIKAAIqISCwBkMgiiCKsAArsTAFJYpRWGBQG2FSWVgjWSEgsEBTWLAAKxshsEBZI7AAUFhlWS2wBCywB0MrsgACAENgQi2wBSywByNCIyCwACNCYbCAYrABYLAEKi2wBiwgIEUgsAJFY7ABRWJgRLABYC2wBywgIEUgsAArI7ECBCVgIEWKI2EgZCCwIFBYIbAAG7AwUFiwIBuwQFlZI7AAUFhlWbADJSNhRESwAWAtsAgssQUFRbABYUQtsAkssAFgICCwCUNKsABQWCCwCSNCWbAKQ0qwAFJYILAKI0JZLbAKLCC4BABiILgEAGOKI2GwC0NgIIpgILALI0IjLbALLEtUWLEHAURZJLANZSN4LbAMLEtRWEtTWLEHAURZGyFZJLATZSN4LbANLLEADENVWLEMDEOwAWFCsAorWbAAQ7ACJUKxCQIlQrEKAiVCsAEWIyCwAyVQWLEBAENgsAQlQoqKIIojYbAJKiEjsAFhIIojYbAJKiEbsQEAQ2CwAiVCsAIlYbAJKiFZsAlDR7AKQ0dgsIBiILACRWOwAUViYLEAABMjRLABQ7AAPrIBAQFDYEItsA4ssQAFRVRYALAMI0IgYLABYbUNDQEACwBCQopgsQ0FK7BtKxsiWS2wDyyxAA4rLbAQLLEBDistsBEssQIOKy2wEiyxAw4rLbATLLEEDistsBQssQUOKy2wFSyxBg4rLbAWLLEHDistsBcssQgOKy2wGCyxCQ4rLbAZLLAIK7EABUVUWACwDCNCIGCwAWG1DQ0BAAsAQkKKYLENBSuwbSsbIlktsBossQAZKy2wGyyxARkrLbAcLLECGSstsB0ssQMZKy2wHiyxBBkrLbAfLLEFGSstsCAssQYZKy2wISyxBxkrLbAiLLEIGSstsCMssQkZKy2wJCwgPLABYC2wJSwgYLANYCBDI7ABYEOwAiVhsAFgsCQqIS2wJiywJSuwJSotsCcsICBHICCwAkVjsAFFYmAjYTgjIIpVWCBHICCwAkVjsAFFYmAjYTgbIVktsCgssQAFRVRYALABFrAnKrABFTAbIlktsCkssAgrsQAFRVRYALABFrAnKrABFTAbIlktsCosIDWwAWAtsCssALADRWOwAUVisAArsAJFY7ABRWKwACuwABa0AAAAAABEPiM4sSoBFSotsCwsIDwgRyCwAkVjsAFFYmCwAENhOC2wLSwuFzwtsC4sIDwgRyCwAkVjsAFFYmCwAENhsAFDYzgtsC8ssQIAFiUgLiBHsAAjQrACJUmKikcjRyNhIFhiGyFZsAEjQrIuAQEVFCotsDAssAAWsAQlsAQlRyNHI2GwBkUrZYouIyAgPIo4LbAxLLAAFrAEJbAEJSAuRyNHI2EgsAQjQrAGRSsgsGBQWCCwQFFYswIgAyAbswImAxpZQkIjILAIQyCKI0cjRyNhI0ZgsARDsIBiYCCwACsgiophILACQ2BkI7ADQ2FkUFiwAkNhG7ADQ2BZsAMlsIBiYSMgILAEJiNGYTgbI7AIQ0awAiWwCENHI0cjYWAgsARDsIBiYCMgsAArI7AEQ2CwACuwBSVhsAUlsIBisAQmYSCwBCVgZCOwAyVgZFBYIRsjIVkjICCwBCYjRmE4WS2wMiywABYgICCwBSYgLkcjRyNhIzw4LbAzLLAAFiCwCCNCICAgRiNHsAArI2E4LbA0LLAAFrADJbACJUcjRyNhsABUWC4gPCMhG7ACJbACJUcjRyNhILAFJbAEJUcjRyNhsAYlsAUlSbACJWGwAUVjIyBYYhshWWOwAUViYCMuIyAgPIo4IyFZLbA1LLAAFiCwCEMgLkcjRyNhIGCwIGBmsIBiIyAgPIo4LbA2LCMgLkawAiVGUlggPFkusSYBFCstsDcsIyAuRrACJUZQWCA8WS6xJgEUKy2wOCwjIC5GsAIlRlJYIDxZIyAuRrACJUZQWCA8WS6xJgEUKy2wOSywMCsjIC5GsAIlRlJYIDxZLrEmARQrLbA6LLAxK4ogIDywBCNCijgjIC5GsAIlRlJYIDxZLrEmARQrsARDLrAmKy2wOyywABawBCWwBCYgLkcjRyNhsAZFKyMgPCAuIzixJgEUKy2wPCyxCAQlQrAAFrAEJbAEJSAuRyNHI2EgsAQjQrAGRSsgsGBQWCCwQFFYswIgAyAbswImAxpZQkIjIEewBEOwgGJgILAAKyCKimEgsAJDYGQjsANDYWRQWLACQ2EbsANDYFmwAyWwgGJhsAIlRmE4IyA8IzgbISAgRiNHsAArI2E4IVmxJgEUKy2wPSywMCsusSYBFCstsD4ssDErISMgIDywBCNCIzixJgEUK7AEQy6wJistsD8ssAAVIEewACNCsgABARUUEy6wLCotsEAssAAVIEewACNCsgABARUUEy6wLCotsEEssQABFBOwLSotsEIssC8qLbBDLLAAFkUjIC4gRoojYTixJgEUKy2wRCywCCNCsEMrLbBFLLIAADwrLbBGLLIAATwrLbBHLLIBADwrLbBILLIBATwrLbBJLLIAAD0rLbBKLLIAAT0rLbBLLLIBAD0rLbBMLLIBAT0rLbBNLLIAADkrLbBOLLIAATkrLbBPLLIBADkrLbBQLLIBATkrLbBRLLIAADsrLbBSLLIAATsrLbBTLLIBADsrLbBULLIBATsrLbBVLLIAAD4rLbBWLLIAAT4rLbBXLLIBAD4rLbBYLLIBAT4rLbBZLLIAADorLbBaLLIAATorLbBbLLIBADorLbBcLLIBATorLbBdLLAyKy6xJgEUKy2wXiywMiuwNistsF8ssDIrsDcrLbBgLLAAFrAyK7A4Ky2wYSywMysusSYBFCstsGIssDMrsDYrLbBjLLAzK7A3Ky2wZCywMyuwOCstsGUssDQrLrEmARQrLbBmLLA0K7A2Ky2wZyywNCuwNystsGgssDQrsDgrLbBpLLA1Ky6xJgEUKy2waiywNSuwNistsGsssDUrsDcrLbBsLLA1K7A4Ky2wbSwrsAhlsAMkUHiwARUwLQAAAEu4AMhSWLEBAY5ZuQgACABjILABI0SwAyNwsgQoCUVSRLIKAgcqsQYBRLEkAYhRWLBAiFixBgNEsSYBiFFYuAQAiFixBgFEWVlZWbgB/4WwBI2xBQBEAAA=) format(\'truetype\'), url(data:application/font-woff;charset=utf-8;base64,d09GRgABAAAAAAoUAA4AAAAAEPQAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABPUy8yAAABRAAAAEQAAABWPeFJAWNtYXAAAAGIAAAAOgAAAUrQEhm3Y3Z0IAAAAcQAAAAUAAAAHAZJ/5RmcGdtAAAB2AAABPkAAAmRigp4O2dhc3AAAAbUAAAACAAAAAgAAAAQZ2x5ZgAABtwAAACuAAAAtt9nBHZoZWFkAAAHjAAAADUAAAA2ASs8e2hoZWEAAAfEAAAAIAAAACQHUwNNaG10eAAAB+QAAAAMAAAADAspAABsb2NhAAAH8AAAAAgAAAAIADgAW21heHAAAAf4AAAAIAAAACAApgm8bmFtZQAACBgAAAF3AAACzcydGhxwb3N0AAAJkAAAACoAAAA7rr1AmHByZXAAAAm8AAAAVgAAAFaSoZr/eJxjYGTewTiBgZWBg6mKaQ8DA0MPhGZ8wGDIyMTAwMTAysyAFQSkuaYwOLxgeMHIHPQ/iyGKmZvBHyjMCJIDAPe9C2B4nGNgYGBmgGAZBkYGEHAB8hjBfBYGDSDNBqQZGZgYGF4w/v8PUvCCAURLMELVAwEjG8OIBwBk5AavAAB4nGNgQANGDEbM3P83gjAAELQD4XicnVXZdtNWFJU8ZHASOmSgoA7X3DhQ68qEKRgwaSrFdiEdHAitBB2kDHTkncc+62uOQrtWH/m07n09JLR0rbYsls++R1tn2DrnRhwjKn0aiGvUoZKXA6msPZZK90lc13Uvj5UMBnFdthJPSZuonSRKat3sUC7xWOsqWSdYJ+PlIFZPVZ5noAziFB5lSUQbRBuplyZJ4onjJ4kWZxAfJUkgJaMQp9LIUEI1GsRS1aFM6dCr1xNx00DKRqMedVhU90PFJ8c1p9SsA0YqVznCFevVRr4bpwMve5DEOsGzrYcxHnisfpQqkIqR6cg/dkpOlIaBVHHUoVbi6DCTX/eRTCrNQKaMYkWl7oG43f102xYxPXQ6vi5KlUaqurnOKJrt0fGogygP2cbppNzQ2fbw5RlTVKtdcbPtQGYNXErJbHSfRAAdJlLj6QFONZwCqRn1R8XZ588BEslclKo8VTKHegOZMzt7cTHtbiersnCknwcyb3Z2452HQ6dXh3/R+hdM4cxHj+Jifj5C+lBqfiJOJKVGWMzyp4YfcVcgQrkxiAsXyuBThDl0RdrZZl3jtTH2hs/5SqlhPQna6KP4fgr9TiQrHGdRo/VInM1j13Wt3GdQS7W7Fzsyr0OVIu7vCwuuM+eEYZ4WC1VfnvneBTT/Bohn/EDeNIVL+5YpSrRvm6JMu2iKCu0SVKVdNsUU7YoppmnPmmKG9h1TzNKeMzLj/8vc55H7HN7xkJv2XeSmfQ+5ad9HbtoPkJtWITdtHblpLyA3rUZu2lWjOnYEGgZpF1IVQdA0svph3Fab9UDWjDR8aWDyLmLI+upER521tcofxX914gsHcmmip7siF5viLq/bFj483e6rj5pG3bDV+MaR8jAeRnocmtBZ+c3hv+1N3S6a7jKqMugBFUwKwABl7UAC0zrbCaT1mqf48gdgXIZ4zkpDtVSfO4am7+V5X/exOfG+x+3GLrdcd3kJWdYNcmP28N9SZKrrH+UtrVQnR6wrJ49VaxhDKrwour6SlHu0tRu/KKmy8l6U1srnk5CbPYMbQlu27mGwI0xpyiUeXlOlKD3UUo6yQyxvKco84JSLC1qGxLgOdQ9qa8TpoXoYGwshhqG0vRBwSCldFd+0ynfxHqtr2Oj4xRXh6XpyEhGf4ir7UfBU10b96A7avGbdMoMpVaqn+4xPsa/b9lFZaaSOsxe3VAfXNOsaORXTT+Rr4HRvOGjdAz1UfDRBI1U1x+jGKGM0ljXl3wR0MVZ+w2jVYvs93E+dpFWsuUuY7JsT9+C0u/0q+7WcW0bW/dcGvW3kip8jMb8tCvw7B2K3ZA3UO5OBGAvIWdAYxhYmdxiug23EbfY/Jqf/34aFRXJXOxq7eerD1ZNRJXfZ8rjLTXZZ16M2R9VOGvsIjS0PN+bY4XIstsRgQbb+wf8x7gF3aVEC4NDIZZiI2nShnurh6h6rsW04VxIBds2x43QAegAuQd8cu9bzCYD13CPnLsB9cgh2yCH4lByCz8i5BfA5OQRfkEMwIIdgl5w7AA/IIXhIDsEeOQSPyNkE+JIcgq/IIYjJIUjIuQ3wmByCJ+QQfE0OwTdGrk5k/pYH2QD6zqKbQKmdGhzaOGRGrk3Y+zxY9oFFZB9aROqRkesT6lMeLPV7i0j9wSJSfzRyY0L9iQdL/dkiUn+xiNRnxpeZIymvDp7zjg7+BJfqrV4AAAAAAQAB//8AD3icY2BkAALmJUwzGEQZZBwk+RkZGBmdGJgYmbIYgMwsoGSiiLgIs5A2owg7I5uSOqOaiT2jmZE8I5gQY17C/09BQEfg3yt+fh8gvYQxD0j68DOJiQn8U+DnZxQDcQUEljLmCwBpBgbG/3//b2SOZ+Zm4GEQcuAH2sblDLSEm8FFVJhJEGgLH6OSHpMdo5EcI3Nk0bEXJ/LYqvZ82VXHGFd6pKTkyCsQwQAAq+QkqAAAeJxjYGRgYADiw5VSsfH8Nl8ZuJlfAEUYzpvO6IXQCb7///7fyLyEmRvI5WBgAokCAFb/DJAAAAB4nGNgZGBgDvqfxRDF/IKB4f935iUMQBEUwAwAi5YFpgPoAAAD6AAAA1kAAAAAAAAAOABbAAEAAAADABYAAQAAAAAAAgAGABMAbgAAAC0JkQAAAAB4nHWQy2rCQBSG//HSi0JbWui2sypKabxgN4IgWHTTbqS4LTHGJBIzMhkFX6Pv0IfpS/RZ+puMpShNmMx3vjlz5mQAXOMbAvnzxJGzwBmjnAs4Rc9ykf7Zcon8YrmMKt4sn9C/W67gAYHlKm7wwQqidM5ogU/LAlfi0nIBF+LOcpH+0XKJ3LNcxq14tXxC71muYCJSy1Xci6+BWm11FIRG1gZ12W62OnK6lYoqStxYumsTKp3KvpyrxPhxrBxPLfc89oN17Op9uJ8nvk4jlciW09yrkZ/42jX+bFc93QRtY+ZyrtVSDm2GXGm18D3jhMasuo3G3/MwgMIKW2hEvKoQBhI12jrnNppooUOaMkMyM8+KkMBFTONizR1htpIy7nPMGSW0PjNisgOP3+WRH5MC7o9ZRR+tHsYT0u6MKPOSfTns7jBrREqyTDezs9/eU2x4WpvWcNeuS511JTE8qCF5H7u1BY1H72S3Ymi7aPD95/9+AN1fhEsAeJxjYGKAAC4G7ICZgYGRiZGZMzkjNTk7N7Eomy05syg5J5WBAQBE1QZBAABLuADIUlixAQGOWbkIAAgAYyCwASNEsAMjcLIEKAlFUkSyCgIHKrEGAUSxJAGIUViwQIhYsQYDRLEmAYhRWLgEAIhYsQYBRFlZWVm4Af+FsASNsQUARAAA) format(\'woff\');\n}\n\n.ui.checkbox label:before,\n.ui.checkbox .box:before,\n.ui.checkbox label:after,\n.ui.checkbox .box:after {\n  font-family: \'Checkbox\';\n}\n\n.ui.checkbox label:after,\n.ui.checkbox .box:after {\n  content: \'\e800\';\n}\n\n/*  UTF Reference\n.check:before { content: \'\e800\'; }  \'\'\n.circle:before { content: \'\e801\'; }\n.ok-circled:before { content: \'\e806\'; }\n.ok-circle:before { content: \'\e805\'; }\n.cancel-circle:before { content: \'\e807\'; }\n.cancel-circle-1:before { content: \'\e804\'; }\n.empty-circle:before { content: \'\e802\'; }\n.radio:before { content: \'\e803\'; }\n\n*/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Dimmer\n*******************************/\n\n.dimmable {\n  position: relative;\n}\n\n.ui.dimmer {\n  display: none;\n  position: absolute;\n  top: 0em !important;\n  left: 0em !important;\n  width: 100%;\n  height: 100%;\n  text-align: center;\n  vertical-align: middle;\n  background: rgba(0, 0, 0, 0.85);\n  opacity: 0;\n  line-height: 1;\n  -webkit-animation-fill-mode: both;\n  animation-fill-mode: both;\n  -webkit-animation-duration: 0.5s;\n  animation-duration: 0.5s;\n  -webkit-transition: background-color 0.5s linear;\n  transition: background-color 0.5s linear;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n  will-change: opacity;\n  z-index: 1000;\n}\n\n/* Dimmer Content */\n\n.ui.dimmer > .content {\n  width: 100%;\n  height: 100%;\n  display: table;\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n}\n\n.ui.dimmer > .content > div {\n  display: table-cell;\n  vertical-align: middle;\n  color: #ffffff;\n}\n\n/* Loose Coupling */\n\n.ui.segment > .ui.dimmer {\n  border-radius: inherit !important;\n}\n\n/*******************************\n            States\n*******************************/\n\n.animating.dimmable:not(body),\n.dimmed.dimmable:not(body) {\n  overflow: hidden;\n}\n\n.dimmed.dimmable > .ui.animating.dimmer,\n.dimmed.dimmable > .ui.visible.dimmer,\n.ui.active.dimmer {\n  display: block;\n  opacity: 1;\n}\n\n.ui.disabled.dimmer {\n  width: 0 !important;\n  height: 0 !important;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------\n      Page\n---------------*/\n\n.ui.page.dimmer {\n  position: fixed;\n  -webkit-transform-style: preserve-3d;\n  transform-style: preserve-3d;\n  -webkit-perspective: 2000px;\n  perspective: 2000px;\n  -webkit-transform-origin: center center;\n  -ms-transform-origin: center center;\n  transform-origin: center center;\n}\n\nbody.animating.in.dimmable,\nbody.dimmed.dimmable {\n  overflow: hidden;\n}\n\nbody.dimmable > .dimmer {\n  position: fixed;\n}\n\n/*\nbody.dimmable > :not(.dimmer) {\n  filter: @elementStartFilter;\n}\nbody.dimmed.dimmable > :not(.dimmer) {\n  filter: @elementEndFilter;\n  transition: @elementTransition;\n}\n*/\n\n/*--------------\n    Aligned\n---------------*/\n\n.ui.dimmer > .top.aligned.content > * {\n  vertical-align: top;\n}\n\n.ui.dimmer > .bottom.aligned.content > * {\n  vertical-align: bottom;\n}\n\n/*--------------\n    Inverted\n---------------*/\n\n.ui.inverted.dimmer {\n  background: rgba(255, 255, 255, 0.85);\n}\n\n.ui.inverted.dimmer > .content > * {\n  color: #ffffff;\n}\n\n/*--------------\n     Simple\n---------------*/\n\n/* Displays without javascript */\n\n.ui.simple.dimmer {\n  display: block;\n  overflow: hidden;\n  opacity: 1;\n  width: 0%;\n  height: 0%;\n  z-index: -100;\n  background-color: rgba(0, 0, 0, 0);\n}\n\n.dimmed.dimmable > .ui.simple.dimmer {\n  overflow: visible;\n  opacity: 1;\n  width: 100%;\n  height: 100%;\n  background: rgba(0, 0, 0, 0.85);\n  z-index: 1;\n}\n\n.ui.simple.inverted.dimmer {\n  background: rgba(255, 255, 255, 0);\n}\n\n.dimmed.dimmable > .ui.simple.inverted.dimmer {\n  background: rgba(255, 255, 255, 0.85);\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n        User Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Dropdown\n*******************************/\n\n.ui.dropdown {\n  cursor: pointer;\n  position: relative;\n  display: inline-block;\n  line-height: 1em;\n  tap-highlight-color: rgba(0, 0, 0, 0);\n  outline: none;\n  text-align: left;\n  -webkit-transition: border-radius 0.1s ease, width 0.2s ease;\n  transition: border-radius 0.1s ease, width 0.2s ease;\n}\n\n/*******************************\n            Content\n*******************************/\n\n/*--------------\n     Menu\n---------------*/\n\n.ui.dropdown .menu {\n  cursor: auto;\n  position: absolute;\n  display: none;\n  outline: none;\n  top: 100%;\n  margin: 0em;\n  padding: 0em 0em;\n  background: #ffffff;\n  min-width: 100%;\n  white-space: nowrap;\n  font-size: 1rem;\n  text-shadow: none;\n  text-align: left;\n  box-shadow: 0px 1px 4px 0px rgba(0, 0, 0, 0.15);\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n  -webkit-transition: opacity 0.2s ease;\n  transition: opacity 0.2s ease;\n  z-index: 11;\n  will-change: transform, opacity;\n}\n\n/*--------------\n  Hidden Input\n---------------*/\n\n.ui.dropdown > input[type="hidden"],\n.ui.dropdown > select {\n  display: none !important;\n}\n\n/*--------------\n Dropdown Icon\n---------------*/\n\n.ui.dropdown > .dropdown.icon {\n  width: auto;\n  margin: 0em 0em 0em 1em;\n}\n\n.ui.dropdown .menu > .item .dropdown.icon {\n  width: auto;\n  float: right;\n  margin: 0.2em 0em 0em 0.75em;\n}\n\n/*--------------\n      Text\n---------------*/\n\n.ui.dropdown > .text {\n  display: inline-block;\n  -webkit-transition: color 0.2s ease;\n  transition: color 0.2s ease;\n}\n\n/*--------------\n    Menu Item\n---------------*/\n\n.ui.dropdown .menu > .item {\n  position: relative;\n  cursor: pointer;\n  display: block;\n  border: none;\n  height: auto;\n  border-top: none;\n  line-height: 1.2em;\n  color: rgba(0, 0, 0, 0.8);\n  padding: 0.65rem 1.25rem !important;\n  font-size: 1rem;\n  text-transform: none;\n  font-weight: normal;\n  box-shadow: none;\n  -webkit-touch-callout: none;\n}\n\n.ui.dropdown .menu > .item:first-child {\n  border-top: none;\n}\n\n/*--------------\n  Floated Content\n---------------*/\n\n.ui.dropdown > .text > [class*="right floated"],\n.ui.dropdown .menu .item > [class*="right floated"] {\n  float: right;\n  margin-right: 0em;\n  margin-left: 1em;\n}\n\n.ui.dropdown > .text > [class*="left floated"],\n.ui.dropdown .menu .item > [class*="left floated"] {\n  float: right;\n  margin-left: 0em;\n  margin-right: 1em;\n}\n\n.ui.dropdown .menu .item > .icon.floated,\n.ui.dropdown .menu .item > .flag.floated,\n.ui.dropdown .menu .item > .image.floated,\n.ui.dropdown .menu .item > img.floated {\n  margin-top: 0.2em;\n}\n\n/*--------------\n  Menu Divider\n---------------*/\n\n.ui.dropdown .menu > .header {\n  margin: 1rem 0rem 0.75rem;\n  padding: 0em 1.25rem;\n  color: rgba(0, 0, 0, 0.85);\n  font-size: 0.8em;\n  font-weight: bold;\n  text-transform: uppercase;\n}\n\n.ui.dropdown .menu > .divider {\n  border-top: 1px solid rgba(0, 0, 0, 0.05);\n  height: 0em;\n  margin: 0.5em 0em;\n}\n\n.ui.dropdown .menu > .input {\n  margin: 0.75rem 1.25rem;\n  min-width: 200px;\n}\n\n.ui.dropdown .menu > .header + .input {\n  margin-top: 0em;\n}\n\n.ui.dropdown .menu > .input:not(.transparent) input {\n  padding: 0.5em 1em;\n}\n\n.ui.dropdown .menu > .input:not(.transparent) .button,\n.ui.dropdown .menu > .input:not(.transparent) .icon,\n.ui.dropdown .menu > .input:not(.transparent) .label {\n  padding-top: 0.5em;\n  padding-bottom: 0.5em;\n}\n\n/*-----------------\n  Item Description\n-------------------*/\n\n.ui.dropdown > .text > .description,\n.ui.dropdown .menu > .item > .description {\n  margin: 0em 0em 0em 1em;\n  color: rgba(0, 0, 0, 0.4);\n}\n\n/*--------------\n    Sub Menu\n---------------*/\n\n.ui.dropdown .menu .menu {\n  top: 0% !important;\n  left: 100% !important;\n  right: auto !important;\n  margin: 0em 0em 0em -0.5em !important;\n  border-radius: 0em 0.2857rem 0.2857rem 0em !important;\n  z-index: 21 !important;\n}\n\n/* Hide Arrow */\n\n.ui.dropdown .menu .menu:after {\n  display: none;\n}\n\n/*******************************\n            Coupling\n*******************************/\n\n/*--------------\n   Sub Elements\n---------------*/\n\n/* Icons / Flags / Labels / Image */\n\n.ui.dropdown > .text > .icon,\n.ui.dropdown > .text > .label,\n.ui.dropdown > .text > .flag,\n.ui.dropdown > .text > img,\n.ui.dropdown > .text > .image {\n  margin-top: 0em;\n}\n\n.ui.dropdown .menu > .item > .icon,\n.ui.dropdown .menu > .item > .label,\n.ui.dropdown .menu > .item > .flag,\n.ui.dropdown .menu > .item > .image,\n.ui.dropdown .menu > .item > img {\n  margin-top: 0.2em;\n}\n\n.ui.dropdown > .text > .icon,\n.ui.dropdown > .text > .label,\n.ui.dropdown > .text > .flag,\n.ui.dropdown > .text > img,\n.ui.dropdown > .text > .image,\n.ui.dropdown .menu > .item > .icon,\n.ui.dropdown .menu > .item > .label,\n.ui.dropdown .menu > .item > .flag,\n.ui.dropdown .menu > .item > .image,\n.ui.dropdown .menu > .item > img {\n  margin-left: 0em;\n  margin-right: 0.75em;\n}\n\n/*--------------\n     Image\n---------------*/\n\n.ui.dropdown > .text > img,\n.ui.dropdown > .text > .image,\n.ui.dropdown .menu > .item > .image,\n.ui.dropdown .menu > .item > img {\n  display: inline-block;\n  vertical-align: middle;\n  width: auto;\n  max-height: 2.5em;\n}\n\n/*--------------\n      Menu\n---------------*/\n\n/* Remove Menu Item Divider */\n\n.ui.dropdown .ui.menu > .item:before,\n.ui.menu .ui.dropdown .menu > .item:before {\n  display: none;\n}\n\n/* Prevent Menu Item Border */\n\n.ui.menu .ui.dropdown .menu .active.item {\n  border-left: none;\n}\n\n/* Automatically float dropdown menu right on last menu item */\n\n.ui.menu .right.menu .dropdown:last-child .menu,\n.ui.menu .right.dropdown.item .menu,\n.ui.buttons > .ui.dropdown:last-child .menu {\n  left: auto;\n  right: 0em;\n}\n\n/*--------------\n     Button\n---------------*/\n\n/* No Margin On Icon Button */\n\n.ui.dropdown.icon.button > .dropdown.icon {\n  margin: 0em;\n}\n\n.ui.dropdown.button:not(.pointing):not(.floating).active,\n.ui.dropdown.button:not(.pointing):not(.floating).visible {\n  border-bottom-left-radius: 0em;\n  border-bottom-right-radius: 0em;\n}\n\n/*******************************\n              Types\n*******************************/\n\n/*--------------\n    Selection\n---------------*/\n\n/* Displays like a select box */\n\n.ui.selection.dropdown {\n  cursor: pointer;\n  word-wrap: break-word;\n  white-space: normal;\n  outline: 0;\n  -webkit-transform: rotateZ(0deg);\n  transform: rotateZ(0deg);\n  min-width: 180px;\n  background: #ffffff;\n  display: inline-block;\n  padding: 0.8em 1.1em;\n  color: rgba(0, 0, 0, 0.8);\n  box-shadow: none;\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  border-radius: 0.2857rem;\n  -webkit-transition: border-radius 0.1s ease, width 0.2s ease, box-shadow 0.2s ease, border 0.2s ease;\n  transition: border-radius 0.1s ease, width 0.2s ease, box-shadow 0.2s ease, border 0.2s ease;\n}\n\n.ui.selection.dropdown.visible,\n.ui.selection.dropdown.active {\n  z-index: 10;\n}\n\nselect.ui.dropdown {\n  height: 38px;\n  padding: 0em;\n  margin: 0em;\n  visibility: hidden;\n}\n\n.ui.selection.dropdown > .text {\n  margin-right: 2em;\n}\n\n.ui.selection.dropdown > .search.icon,\n.ui.selection.dropdown > .delete.icon,\n.ui.selection.dropdown > .dropdown.icon {\n  position: absolute;\n  top: auto;\n  margin: 0em;\n  width: auto;\n  right: 1.1em;\n  opacity: 0.8;\n  -webkit-transition: opacity 0.2s ease;\n  transition: opacity 0.2s ease;\n}\n\n/* Compact */\n\n.ui.compact.selection.dropdown {\n  min-width: 0px;\n}\n\n/* Remove Selection */\n\n.ui.selection.dropdown > .delete.icon {\n  opacity: 0.6;\n}\n\n.ui.selection.dropdown > .delete.icon:hover {\n  opacity: 1;\n}\n\n/*  Selection Menu */\n\n.ui.selection.dropdown .menu {\n  overflow-x: hidden;\n  overflow-y: auto;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  -webkit-overflow-scrolling: touch;\n  border-top: none !important;\n  width: auto;\n  margin: 0px -1px;\n  min-width: -webkit-calc(100% + 2px);\n  min-width: calc(100% + 2px);\n  outline: none;\n  box-shadow: 0px 2px 4px 0px rgba(0, 0, 0, 0.08);\n  -webkit-transition: box-shadow 0.2s ease, border 0.2s ease;\n  transition: box-shadow 0.2s ease, border 0.2s ease;\n}\n\n.ui.selection.dropdown .menu:after,\n.ui.selection.dropdown .menu:before {\n  display: none;\n}\n\n@media only screen and (max-width: 767px) {\n  .ui.selection.dropdown .menu {\n    max-height: 7.7142rem;\n  }\n}\n\n@media only screen and (min-width: 768px) {\n  .ui.selection.dropdown .menu {\n    max-height: 10.2856rem;\n  }\n}\n\n@media only screen and (min-width: 992px) {\n  .ui.selection.dropdown .menu {\n    max-height: 15.4284rem;\n  }\n}\n\n@media only screen and (min-width: 1920px) {\n  .ui.selection.dropdown .menu {\n    max-height: 20.5712rem;\n  }\n}\n\n/* Menu Item */\n\n.ui.selection.dropdown .menu > .item {\n  border-top: 1px solid rgba(0, 0, 0, 0.05);\n  padding-left: 1.1em !important;\n  /* Add in spacing for scroll bar */\n  padding-right: -webkit-calc(2.1em) !important;\n  padding-right: calc(2.1em) !important;\n  white-space: normal;\n  word-wrap: normal;\n}\n\n/* Hover */\n\n.ui.selection.dropdown:hover {\n  border-color: rgba(39, 41, 43, 0.3);\n  box-shadow: 0px 0px 2px 0px rgba(0, 0, 0, 0.05);\n}\n\n/* Visible Hover */\n\n.ui.selection.visible.dropdown:hover {\n  border-color: rgba(39, 41, 43, 0.3);\n  box-shadow: 0px 0px 4px 0px rgba(0, 0, 0, 0.08);\n}\n\n.ui.selection.visible.dropdown:hover .menu {\n  border: 1px solid rgba(39, 41, 43, 0.3);\n  box-shadow: 0px 4px 6px 0px rgba(0, 0, 0, 0.08);\n}\n\n/* Visible */\n\n.ui.selection.dropdown.visible {\n  border-color: rgba(39, 41, 43, 0.15);\n  box-shadow: 0px 0px 4px 0px rgba(0, 0, 0, 0.08);\n}\n\n.ui.visible.selection.dropdown > .dropdown.icon {\n  opacity: 1;\n}\n\n/* Active Item */\n\n.ui.selection.active.dropdown > .text:not(.default),\n.ui.selection.visible.dropdown > .text:not(.default) {\n  font-weight: normal;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Connecting Border */\n\n.ui.active.selection.dropdown,\n.ui.visible.selection.dropdown {\n  border-bottom-left-radius: 0em !important;\n  border-bottom-right-radius: 0em !important;\n}\n\n/*--------------\n   Searchable\n---------------*/\n\n/* Search Selection */\n\n.ui.search.dropdown {\n  min-width: \'\';\n}\n\n/* Search Dropdown */\n\n.ui.search.dropdown > input.search {\n  background: none transparent;\n  border: none;\n  cursor: pointer;\n  position: absolute;\n  border-radius: 0em !important;\n  top: 0em;\n  left: 0em;\n  width: 100%;\n  outline: none;\n  -webkit-tap-highlight-color: rgba(255, 255, 255, 0);\n  padding: inherit;\n}\n\n/* Search Selection */\n\n.ui.search.selection.dropdown > input.search {\n  line-height: 1.2em;\n}\n\n.ui.search.dropdown.active > input.search,\n.ui.search.dropdown.visible > input.search {\n  cursor: auto;\n}\n\n.ui.active.search.dropdown > input.search:focus + .text {\n  color: rgba(0, 0, 0, 0.4) !important;\n}\n\n/* Search Menu */\n\n.ui.search.dropdown .menu {\n  overflow-x: hidden;\n  overflow-y: auto;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  -webkit-overflow-scrolling: touch;\n}\n\n@media only screen and (max-width: 767px) {\n  .ui.search.dropdown .menu {\n    max-height: 7.7142rem;\n  }\n}\n\n@media only screen and (min-width: 768px) {\n  .ui.search.dropdown .menu {\n    max-height: 10.2856rem;\n  }\n}\n\n@media only screen and (min-width: 992px) {\n  .ui.search.dropdown .menu {\n    max-height: 15.4284rem;\n  }\n}\n\n@media only screen and (min-width: 1920px) {\n  .ui.search.dropdown .menu {\n    max-height: 20.5712rem;\n  }\n}\n\n/*--------------\n     Inline\n---------------*/\n\n.ui.inline.dropdown {\n  cursor: pointer;\n  display: inline-block;\n  color: inherit;\n}\n\n.ui.inline.dropdown .dropdown.icon {\n  margin: 0em 0.5em 0em 0.25em;\n  vertical-align: top;\n}\n\n.ui.inline.dropdown > .text {\n  font-weight: bold;\n}\n\n.ui.inline.dropdown .menu {\n  cursor: auto;\n  margin-top: 0.25em;\n  border-radius: 0.2857rem;\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------------\n        Hover\n----------------------*/\n\n/* Menu Item Hover */\n\n.ui.dropdown .menu > .item:hover {\n  background: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.8);\n  z-index: 12;\n}\n\n/*--------------------\n        Active\n----------------------*/\n\n/* Menu Item Active */\n\n.ui.dropdown .menu .active.item {\n  background: transparent;\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.8);\n  box-shadow: none;\n  z-index: 12;\n}\n\n/*--------------------\n     Default Text\n----------------------*/\n\n.ui.dropdown > .default.text,\n.ui.default.dropdown > .text {\n  color: rgba(179, 179, 179, 0.7);\n}\n\n.ui.dropdown:hover > .default.text,\n.ui.default.dropdown:hover > .text {\n  color: rgba(140, 140, 140, 0.7);\n}\n\n/*--------------------\n        Loading\n----------------------*/\n\n.ui.loading.dropdown > .text {\n  -webkit-transition: none;\n  transition: none;\n}\n\n/*--------------------\n    Keyboard Select\n----------------------*/\n\n/* Selected Item */\n\n.ui.dropdown.selected,\n.ui.dropdown .menu .selected.item {\n  background: rgba(0, 0, 0, 0.03);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*--------------------\n    Search Filtered\n----------------------*/\n\n/* Filtered Item */\n\n.ui.dropdown > .filtered.text {\n  visibility: hidden;\n}\n\n.ui.dropdown .filtered.item {\n  display: none;\n}\n\n/*--------------------\n        Error\n----------------------*/\n\n.ui.dropdown.error,\n.ui.dropdown.error > .text,\n.ui.dropdown.error > .default.text {\n  color: #a94442;\n}\n\n.ui.selection.dropdown.error {\n  background: #fff0f0;\n  border-color: #dbb1b1;\n}\n\n.ui.selection.dropdown.error:hover {\n  border-color: #dbb1b1;\n}\n\n.ui.dropdown.error > .menu,\n.ui.dropdown.error > .menu .menu {\n  border-color: #dbb1b1;\n}\n\n.ui.dropdown.error > .menu > .item {\n  color: #d95c5c;\n}\n\n/* Item Hover */\n\n.ui.dropdown.error > .menu > .item:hover {\n  background-color: #fff2f2;\n}\n\n/* Item Active */\n\n.ui.dropdown.error > .menu .active.item {\n  background-color: #fdcfcf;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------\n    Direction\n---------------*/\n\n/* Flyout Direction */\n\n.ui.dropdown .menu {\n  left: 0px;\n}\n\n/*--------------\n     Simple\n---------------*/\n\n/* Displays without javascript */\n\n.ui.simple.dropdown .menu:before,\n.ui.simple.dropdown .menu:after {\n  display: none;\n}\n\n.ui.simple.dropdown .menu {\n  position: absolute;\n  display: block;\n  overflow: hidden;\n  top: -9999px !important;\n  opacity: 0;\n  width: 0;\n  height: 0;\n  -webkit-transition: opacity 0.2s ease;\n  transition: opacity 0.2s ease;\n}\n\n.ui.simple.active.dropdown,\n.ui.simple.dropdown:hover {\n  border-bottom-left-radius: 0em !important;\n  border-bottom-right-radius: 0em !important;\n}\n\n.ui.simple.active.dropdown > .menu,\n.ui.simple.dropdown:hover > .menu {\n  overflow: visible;\n  width: auto;\n  height: auto;\n  top: 100% !important;\n  opacity: 1;\n}\n\n.ui.simple.dropdown > .menu > .item:active > .menu,\n.ui.simple.dropdown:hover > .menu > .item:hover > .menu {\n  overflow: visible;\n  width: auto;\n  height: auto;\n  top: 0% !important;\n  left: 100% !important;\n  opacity: 1;\n}\n\n.ui.simple.disabled.dropdown:hover .menu {\n  display: none;\n  height: 0px;\n  width: 0px;\n  overflow: hidden;\n}\n\n/* Visible */\n\n.ui.simple.visible.dropdown > .menu {\n  display: block;\n}\n\n/*--------------\n      Fluid\n---------------*/\n\n.ui.fluid.dropdown {\n  display: block;\n  width: 100%;\n  min-width: 0em;\n}\n\n.ui.fluid.dropdown > .dropdown.icon {\n  float: right;\n}\n\n/*--------------\n    Floating\n---------------*/\n\n.ui.floating.dropdown .menu {\n  left: 0;\n  right: auto;\n  margin-top: 0.5em !important;\n  box-shadow: 0px 2px 5px 0px rgba(0, 0, 0, 0.15);\n  border-radius: 0.2857rem;\n}\n\n/*--------------\n     Pointing\n---------------*/\n\n.ui.pointing.dropdown > .menu {\n  top: 100%;\n  margin-top: 0.75em;\n  border-radius: 0.2857rem;\n}\n\n.ui.pointing.dropdown > .menu:after {\n  display: block;\n  position: absolute;\n  pointer-events: none;\n  content: \'\';\n  visibility: visible;\n  -webkit-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n  width: 0.5em;\n  height: 0.5em;\n  box-shadow: -1px -1px 0px 1px rgba(0, 0, 0, 0.1);\n  background: #ffffff;\n  z-index: 2;\n}\n\n.ui.pointing.dropdown > .menu:after {\n  top: -0.25em;\n  left: 50%;\n  margin: 0em 0em 0em -0.25em;\n}\n\n/* Top Left Pointing */\n\n.ui.top.left.pointing.dropdown > .menu {\n  top: 100%;\n  bottom: auto;\n  left: 0%;\n  right: auto;\n  margin: 1em 0em 0em;\n}\n\n.ui.top.left.pointing.dropdown > .menu {\n  top: 100%;\n  bottom: auto;\n  left: 0%;\n  right: auto;\n  margin: 1em 0em 0em;\n}\n\n.ui.top.left.pointing.dropdown > .menu:after {\n  top: -0.25em;\n  left: 1em;\n  right: auto;\n  margin: 0em;\n  -webkit-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n}\n\n/* Top Right  Pointing */\n\n.ui.top.right.pointing.dropdown > .menu {\n  top: 100%;\n  bottom: auto;\n  right: 0%;\n  left: auto;\n  margin: 1em 0em 0em;\n}\n\n.ui.top.right.pointing.dropdown > .menu:after {\n  top: -0.25em;\n  left: auto;\n  right: 1em;\n  margin: 0em;\n  -webkit-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n}\n\n/* Left Pointing */\n\n.ui.left.pointing.dropdown > .menu {\n  top: 0%;\n  left: 100%;\n  right: auto;\n  margin: 0em 0em 0em 1em;\n}\n\n.ui.left.pointing.dropdown > .menu:after {\n  top: 1em;\n  left: -0.25em;\n  margin: 0em 0em 0em 0em;\n  -webkit-transform: rotate(-45deg);\n  -ms-transform: rotate(-45deg);\n  transform: rotate(-45deg);\n}\n\n/* Right Pointing */\n\n.ui.right.pointing.dropdown > .menu {\n  top: 0%;\n  left: auto;\n  right: 100%;\n  margin: 0em 1em 0em 0em;\n}\n\n.ui.right.pointing.dropdown > .menu:after {\n  top: 1em;\n  left: auto;\n  right: -0.25em;\n  margin: 0em 0em 0em 0em;\n  -webkit-transform: rotate(135deg);\n  -ms-transform: rotate(135deg);\n  transform: rotate(135deg);\n}\n\n/* Bottom Pointing */\n\n.ui.bottom.pointing.dropdown > .menu {\n  top: auto;\n  bottom: 100%;\n  left: 0%;\n  right: auto;\n  margin: 0em 0em 1em;\n}\n\n.ui.bottom.pointing.dropdown > .menu:after {\n  top: auto;\n  bottom: -0.25em;\n  right: auto;\n  margin: 0em;\n  -webkit-transform: rotate(-135deg);\n  -ms-transform: rotate(-135deg);\n  transform: rotate(-135deg);\n}\n\n/* Reverse Sub-Menu Direction */\n\n.ui.bottom.pointing.dropdown > .menu .menu {\n  top: auto !important;\n  bottom: 0px !important;\n}\n\n/* Bottom Left */\n\n.ui.bottom.left.pointing.dropdown > .menu {\n  left: 0%;\n  right: auto;\n}\n\n.ui.bottom.left.pointing.dropdown > .menu:after {\n  left: 1em;\n  right: auto;\n}\n\n/* Bottom Right */\n\n.ui.bottom.right.pointing.dropdown > .menu {\n  right: 0%;\n  left: auto;\n}\n\n.ui.bottom.right.pointing.dropdown > .menu:after {\n  left: auto;\n  right: 1em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/* Dropdown Carets */\n\n@font-face {\n  font-family: \'Dropdown\';\n  src: url(data:application/x-font-ttf;charset=utf-8;base64,AAEAAAALAIAAAwAwT1MvMggjB5AAAAC8AAAAYGNtYXAPfuIIAAABHAAAAExnYXNwAAAAEAAAAWgAAAAIZ2x5Zjo82LgAAAFwAAABVGhlYWQAQ88bAAACxAAAADZoaGVhAwcB6QAAAvwAAAAkaG10eAS4ABIAAAMgAAAAIGxvY2EBNgDeAAADQAAAABJtYXhwAAoAFgAAA1QAAAAgbmFtZVcZpu4AAAN0AAABRXBvc3QAAwAAAAAEvAAAACAAAwIAAZAABQAAAUwBZgAAAEcBTAFmAAAA9QAZAIQAAAAAAAAAAAAAAAAAAAABEAAAAAAAAAAAAAAAAAAAAABAAADw2gHg/+D/4AHgACAAAAABAAAAAAAAAAAAAAAgAAAAAAACAAAAAwAAABQAAwABAAAAFAAEADgAAAAKAAgAAgACAAEAIPDa//3//wAAAAAAIPDX//3//wAB/+MPLQADAAEAAAAAAAAAAAAAAAEAAf//AA8AAQAAAAAAAAAAAAIAADc5AQAAAAABAAAAAAAAAAAAAgAANzkBAAAAAAEAAAAAAAAAAAACAAA3OQEAAAAAAQAAAIABJQElABMAABM0NzY3BTYXFhUUDwEGJwYvASY1AAUGBwEACAUGBoAFCAcGgAUBEgcGBQEBAQcECQYHfwYBAQZ/BwYAAQAAAG4BJQESABMAADc0PwE2MzIfARYVFAcGIyEiJyY1AAWABgcIBYAGBgUI/wAHBgWABwaABQWABgcHBgUFBgcAAAABABIASQC3AW4AEwAANzQ/ATYXNhcWHQEUBwYnBi8BJjUSBoAFCAcFBgYFBwgFgAbbBwZ/BwEBBwQJ/wgEBwEBB38GBgAAAAABAAAASQClAW4AEwAANxE0NzYzMh8BFhUUDwEGIyInJjUABQYHCAWABgaABQgHBgVbAQAIBQYGgAUIBwWABgYFBwAAAAEAAAABAADZuaKOXw889QALAgAAAAAA0ABHWAAAAADQAEdYAAAAAAElAW4AAAAIAAIAAAAAAAAAAQAAAeD/4AAAAgAAAAAAASUAAQAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAABAAAAASUAAAElAAAAtwASALcAAAAAAAAACgAUAB4AQgBkAIgAqgAAAAEAAAAIABQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAOAK4AAQAAAAAAAQAOAAAAAQAAAAAAAgAOAEcAAQAAAAAAAwAOACQAAQAAAAAABAAOAFUAAQAAAAAABQAWAA4AAQAAAAAABgAHADIAAQAAAAAACgA0AGMAAwABBAkAAQAOAAAAAwABBAkAAgAOAEcAAwABBAkAAwAOACQAAwABBAkABAAOAFUAAwABBAkABQAWAA4AAwABBAkABgAOADkAAwABBAkACgA0AGMAaQBjAG8AbQBvAG8AbgBWAGUAcgBzAGkAbwBuACAAMQAuADAAaQBjAG8AbQBvAG8Abmljb21vb24AaQBjAG8AbQBvAG8AbgBSAGUAZwB1AGwAYQByAGkAYwBvAG0AbwBvAG4ARgBvAG4AdAAgAGcAZQBuAGUAcgBhAHQAZQBkACAAYgB5ACAASQBjAG8ATQBvAG8AbgAuAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=) format(\'truetype\'), url(data:application/font-woff;charset=utf-8;base64,d09GRk9UVE8AAAVwAAoAAAAABSgAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABDRkYgAAAA9AAAAdkAAAHZLDXE/09TLzIAAALQAAAAYAAAAGAIIweQY21hcAAAAzAAAABMAAAATA9+4ghnYXNwAAADfAAAAAgAAAAIAAAAEGhlYWQAAAOEAAAANgAAADYAQ88baGhlYQAAA7wAAAAkAAAAJAMHAelobXR4AAAD4AAAACAAAAAgBLgAEm1heHAAAAQAAAAABgAAAAYACFAAbmFtZQAABAgAAAFFAAABRVcZpu5wb3N0AAAFUAAAACAAAAAgAAMAAAEABAQAAQEBCGljb21vb24AAQIAAQA6+BwC+BsD+BgEHgoAGVP/i4seCgAZU/+LiwwHi2v4lPh0BR0AAACIDx0AAACNER0AAAAJHQAAAdASAAkBAQgPERMWGyAlKmljb21vb25pY29tb29udTB1MXUyMHVGMEQ3dUYwRDh1RjBEOXVGMERBAAACAYkABgAIAgABAAQABwAKAA0AVgCfAOgBL/yUDvyUDvyUDvuUDvtvi/emFYuQjZCOjo+Pj42Qiwj3lIsFkIuQiY6Hj4iNhouGi4aJh4eHCPsU+xQFiIiGiYaLhouHjYeOCPsU9xQFiI+Jj4uQCA77b4v3FBWLkI2Pjo8I9xT3FAWPjo+NkIuQi5CJjogI9xT7FAWPh42Hi4aLhomHh4eIiIaJhosI+5SLBYaLh42HjoiPiY+LkAgO+92d928Vi5CNkI+OCPcU9xQFjo+QjZCLkIuPiY6Hj4iNhouGCIv7lAWLhomHh4iIh4eJhouGi4aNiI8I+xT3FAWHjomPi5AIDvvdi+YVi/eUBYuQjZCOjo+Pj42Qi5CLkImOhwj3FPsUBY+IjYaLhouGiYeHiAj7FPsUBYiHhomGi4aLh42Hj4iOiY+LkAgO+JQU+JQViwwKAAAAAAMCAAGQAAUAAAFMAWYAAABHAUwBZgAAAPUAGQCEAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAAQAAA8NoB4P/g/+AB4AAgAAAAAQAAAAAAAAAAAAAAIAAAAAAAAgAAAAMAAAAUAAMAAQAAABQABAA4AAAACgAIAAIAAgABACDw2v/9//8AAAAAACDw1//9//8AAf/jDy0AAwABAAAAAAAAAAAAAAABAAH//wAPAAEAAAABAAA5emozXw889QALAgAAAAAA0ABHWAAAAADQAEdYAAAAAAElAW4AAAAIAAIAAAAAAAAAAQAAAeD/4AAAAgAAAAAAASUAAQAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAABAAAAASUAAAElAAAAtwASALcAAAAAUAAACAAAAAAADgCuAAEAAAAAAAEADgAAAAEAAAAAAAIADgBHAAEAAAAAAAMADgAkAAEAAAAAAAQADgBVAAEAAAAAAAUAFgAOAAEAAAAAAAYABwAyAAEAAAAAAAoANABjAAMAAQQJAAEADgAAAAMAAQQJAAIADgBHAAMAAQQJAAMADgAkAAMAAQQJAAQADgBVAAMAAQQJAAUAFgAOAAMAAQQJAAYADgA5AAMAAQQJAAoANABjAGkAYwBvAG0AbwBvAG4AVgBlAHIAcwBpAG8AbgAgADEALgAwAGkAYwBvAG0AbwBvAG5pY29tb29uAGkAYwBvAG0AbwBvAG4AUgBlAGcAdQBsAGEAcgBpAGMAbwBtAG8AbwBuAEYAbwBuAHQAIABnAGUAbgBlAHIAYQB0AGUAZAAgAGIAeQAgAEkAYwBvAE0AbwBvAG4ALgAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA) format(\'woff\');\n  font-weight: normal;\n  font-style: normal;\n}\n\n.ui.dropdown > .dropdown.icon {\n  font-family: \'Dropdown\';\n  line-height: 1;\n  height: 1em;\n  width: 1.23em;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  font-weight: normal;\n  font-style: normal;\n  text-align: center;\n}\n\n.ui.dropdown > .dropdown.icon {\n  width: auto;\n}\n\n.ui.dropdown > .dropdown.icon:before {\n  content: \'\f0d7\';\n}\n\n/* Sub Menu */\n\n.ui.dropdown .menu .item .dropdown.icon:before {\n  content: \'\f0da\';\n}\n\n/* Vertical Menu Dropdown */\n\n.ui.vertical.menu .dropdown.item > .dropdown.icon:before {\n  content: "\f0da";\n}\n\n/* Icons for Reference\n.dropdown.down.icon {\n  content: "\f0d7";\n}\n.dropdown.up.icon {\n  content: "\f0d8";\n}\n.dropdown.left.icon {\n  content: "\f0d9";\n}\n.dropdown.icon.icon {\n  content: "\f0da";\n}\n*/\n\n/*******************************\n        User Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Modal\n*******************************/\n\n.ui.modal {\n  display: none;\n  position: fixed;\n  z-index: 1001;\n  top: 50%;\n  left: 50%;\n  text-align: left;\n  width: 90%;\n  margin-left: -45%;\n  background: #ffffff;\n  border: none;\n  box-shadow: 0 1px 4px 1px rgba(0, 0, 0, 0.3);\n  border-radius: 0.2857rem;\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n  will-change: top, left, margin, transform, opacity;\n}\n\n.ui.modal > :first-child:not(.icon),\n.ui.modal > .icon:first-child + * {\n  border-top-left-radius: 0.2857rem;\n  border-top-right-radius: 0.2857rem;\n}\n\n.ui.modal > :last-child {\n  border-bottom-left-radius: 0.2857rem;\n  border-bottom-right-radius: 0.2857rem;\n}\n\n/*******************************\n            Content\n*******************************/\n\n/*--------------\n     Close\n---------------*/\n\n.ui.modal > .close {\n  cursor: pointer;\n  position: absolute;\n  top: -2.5rem;\n  right: -2.5rem;\n  z-index: 1;\n  opacity: 0.8;\n  font-size: 1.25em;\n  color: #ffffff;\n  width: 2.25rem;\n  height: 2.25rem;\n  padding: 0.625rem 0rem 0rem 0rem;\n}\n\n.ui.modal > .close:hover {\n  opacity: 1;\n}\n\n/*--------------\n     Header\n---------------*/\n\n.ui.modal > .header {\n  display: block;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  background: -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.05)) #ffffff;\n  background: linear-gradient(transparent, rgba(0, 0, 0, 0.05)) #ffffff;\n  margin: 0em;\n  padding: 1.2rem 2rem;\n  box-shadow: 0px 1px 2px 0 rgba(0, 0, 0, 0.05);\n  font-size: 1.6em;\n  line-height: 1.3em;\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.85);\n  border-bottom: 1px solid rgba(39, 41, 43, 0.15);\n}\n\n/*--------------\n     Content\n---------------*/\n\n.ui.modal > .content {\n  display: table;\n  table-layout: fixed;\n  width: 100%;\n  font-size: 1em;\n  line-height: 1.4;\n  padding: 2rem;\n  background: #ffffff;\n}\n\n/* Image */\n\n.ui.modal > .content > .image {\n  display: table-cell;\n  width: \'\';\n  vertical-align: top;\n}\n\n.ui.modal > .content > .image[class*="top aligned"] {\n  vertical-align: top;\n}\n\n.ui.modal > .content > .image[class*="top aligned"] {\n  vertical-align: middle;\n}\n\n/* Description */\n\n.ui.modal > .content > .description {\n  display: table-cell;\n  vertical-align: top;\n}\n\n.ui.modal > .content > .icon + .description,\n.ui.modal > .content > .image + .description {\n  min-width: \'\';\n  width: 80%;\n  padding-left: 2em;\n}\n\n/*rtl:ignore*/\n\n.ui.modal > .content > .image > i.icon {\n  font-size: 8rem;\n  margin: 0em;\n  opacity: 1;\n  width: auto;\n}\n\n/*--------------\n     Actions\n---------------*/\n\n.ui.modal .actions {\n  background: #efefef;\n  padding: 1rem 2rem;\n  border-top: 1px solid rgba(39, 41, 43, 0.15);\n  text-align: right;\n}\n\n.ui.modal .actions > .button {\n  margin-left: 0.75em;\n}\n\n/*-------------------\n       Responsive\n--------------------*/\n\n/* Modal Width */\n\n@media only screen and (max-width: 767px) {\n  .ui.modal {\n    width: 95%;\n    margin: 0em 0em 0em -47.5%;\n  }\n}\n\n@media only screen and (min-width: 768px) {\n  .ui.modal {\n    width: 88%;\n    margin: 0em 0em 0em -44%;\n  }\n}\n\n@media only screen and (min-width: 992px) {\n  .ui.modal {\n    width: 74%;\n    margin: 0em 0em 0em -37%;\n  }\n}\n\n@media only screen and (min-width: 1400px) {\n  .ui.modal {\n    width: 56%;\n    margin: 0em 0em 0em -28%;\n  }\n}\n\n@media only screen and (min-width: 1920px) {\n  .ui.modal {\n    width: 42%;\n    margin: 0em 0em 0em -21%;\n  }\n}\n\n/* Tablet and Mobile */\n\n@media only screen and (max-width: 992px) {\n  .ui.modal > .header {\n    padding-right: 2.25rem;\n  }\n\n  .ui.modal > .close {\n    top: 0.905rem;\n    right: 1rem;\n    color: rgba(0, 0, 0, 0.8);\n  }\n}\n\n/* Mobile */\n\n@media only screen and (max-width: 767px) {\n  .ui.modal > .header {\n    padding: 0.75rem 1rem !important;\n    padding-right: 2.25rem !important;\n  }\n\n  .ui.modal > .content {\n    display: block;\n    padding: 1rem !important;\n  }\n\n  .ui.modal > .close {\n    top: 0.5rem !important;\n    right: 0.5rem !important;\n  }\n\n  /*rtl:ignore*/\n\n  .ui.modal .content > .image {\n    display: block;\n    max-width: 100%;\n    margin: 0em auto !important;\n    text-align: center;\n    padding: 0rem 0rem 1rem !important;\n  }\n\n  .ui.modal > .content > .image > i.icon {\n    font-size: 5rem;\n    text-align: center;\n  }\n\n  /*rtl:ignore*/\n\n  .ui.modal .content > .description {\n    display: block;\n    width: 100% !important;\n    margin: 0em !important;\n    padding: 1rem 0rem !important;\n    box-shadow: none;\n  }\n\n  .ui.modal > .actions {\n    padding: 1rem 1rem -1rem !important;\n  }\n\n  .ui.modal .actions > .buttons,\n  .ui.modal .actions > .button {\n    margin-bottom: 2rem;\n  }\n}\n\n/*******************************\n             Types\n*******************************/\n\n.ui.basic.modal {\n  background-color: transparent;\n  border: none;\n  box-shadow: 0px 0px 0px 0px;\n  color: #ffffff;\n}\n\n.ui.basic.modal > .header,\n.ui.basic.modal > .content,\n.ui.basic.modal > .actions {\n  background-color: transparent;\n}\n\n.ui.basic.modal > .header {\n  color: #ffffff;\n}\n\n.ui.basic.modal > .close {\n  top: 1rem;\n  right: 1.5rem;\n}\n\n/* Tablet and Mobile */\n\n@media only screen and (max-width: 992px) {\n  .ui.basic.modal > .close {\n    color: #ffffff;\n  }\n}\n\n/*******************************\n            Variations\n*******************************/\n\n/* A modal that cannot fit on the page */\n\n.scrolling.dimmable.dimmed {\n  overflow: hidden;\n}\n\n.scrolling.dimmable.dimmed > .dimmer {\n  overflow: auto;\n  -webkit-overflow-scrolling: touch;\n}\n\n.scrolling.dimmable > .dimmer {\n  position: fixed;\n}\n\n.ui.scrolling.modal {\n  position: static;\n  margin: 3.5rem auto !important;\n}\n\n@media only screen and (max-width: 992px) {\n  .ui.scrolling.modal {\n    margin-top: 1rem;\n    margin-bottom: 1rem;\n  }\n}\n\n/*******************************\n             States\n*******************************/\n\n.ui.active.modal {\n  display: block;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------\n   Full Screen\n---------------*/\n\n.ui.fullscreen.modal {\n  width: 95% !important;\n  left: 2.5% !important;\n  margin: 1em auto;\n}\n\n.ui.fullscreen.scrolling.modal {\n  left: 0em !important;\n}\n\n.ui.fullscreen.modal > .header {\n  padding-right: 2.25rem;\n}\n\n.ui.fullscreen.modal > .close {\n  top: 0.905rem;\n  right: 1rem;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n@media only screen and (max-width: 767px) {\n  .ui.fullscreen.modal {\n    width: auto !important;\n    margin: 1em !important;\n  }\n}\n\n/*--------------\n      Size\n---------------*/\n\n.ui.modal {\n  font-size: 1rem;\n}\n\n/* Small */\n\n.ui.small.modal > .header {\n  font-size: 1.3em;\n}\n\n/* Small Modal Width */\n\n@media only screen and (max-width: 767px) {\n  .ui.small.modal {\n    width: 95%;\n    margin: 0em 0em 0em -47.5%;\n  }\n}\n\n@media only screen and (min-width: 768px) {\n  .ui.small.modal {\n    width: 52.8%;\n    margin: 0em 0em 0em -26.4%;\n  }\n}\n\n@media only screen and (min-width: 992px) {\n  .ui.small.modal {\n    width: 44.4%;\n    margin: 0em 0em 0em -22.2%;\n  }\n}\n\n@media only screen and (min-width: 1400px) {\n  .ui.small.modal {\n    width: 33.6%;\n    margin: 0em 0em 0em -16.8%;\n  }\n}\n\n@media only screen and (min-width: 1920px) {\n  .ui.small.modal {\n    width: 25.2%;\n    margin: 0em 0em 0em -12.6%;\n  }\n}\n\n/* Large Modal Width */\n\n.ui.large.modal > .header {\n  font-size: 1.6em;\n}\n\n@media only screen and (max-width: 767px) {\n  .ui.large.modal {\n    width: 95%;\n    margin: 0em 0em 0em -47.5%;\n  }\n}\n\n@media only screen and (min-width: 768px) {\n  .ui.large.modal {\n    width: 88%;\n    margin: 0em 0em 0em -44%;\n  }\n}\n\n@media only screen and (min-width: 992px) {\n  .ui.large.modal {\n    width: 88.8%;\n    margin: 0em 0em 0em -44.4%;\n  }\n}\n\n@media only screen and (min-width: 1400px) {\n  .ui.large.modal {\n    width: 67.2%;\n    margin: 0em 0em 0em -33.6%;\n  }\n}\n\n@media only screen and (min-width: 1920px) {\n  .ui.large.modal {\n    width: 50.4%;\n    margin: 0em 0em 0em -25.2%;\n  }\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Nag\n*******************************/\n\n.ui.nag {\n  display: none;\n  opacity: 0.95;\n  position: relative;\n  top: 0em;\n  left: 0px;\n  z-index: 999;\n  min-height: 0em;\n  width: 100%;\n  margin: 0em;\n  padding: 0.75em 1em;\n  background: #555555;\n  box-shadow: 0px 1px 2px 0px rgba(0, 0, 0, 0.2);\n  font-size: 1rem;\n  text-align: center;\n  color: rgba(0, 0, 0, 0.8);\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n  -webkit-transition: 0.2s background ease;\n  transition: 0.2s background ease;\n}\n\na.ui.nag {\n  cursor: pointer;\n}\n\n.ui.nag > .title {\n  display: inline-block;\n  margin: 0em 0.5em;\n  color: #ffffff;\n}\n\n.ui.nag > .close.icon {\n  cursor: pointer;\n  opacity: 0.4;\n  position: absolute;\n  top: 50%;\n  right: 1em;\n  font-size: 1em;\n  margin: -0.5em 0em 0em;\n  color: #ffffff;\n  -webkit-transition: opacity 0.2s ease;\n  transition: opacity 0.2s ease;\n}\n\n/*******************************\n             States\n*******************************/\n\n/* Hover */\n\n.ui.nag:hover {\n  background: #555555;\n  opacity: 1;\n}\n\n.ui.nag .close:hover {\n  opacity: 1;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------\n     Static\n---------------*/\n\n.ui.overlay.nag {\n  position: absolute;\n  display: block;\n}\n\n/*--------------\n     Fixed\n---------------*/\n\n.ui.fixed.nag {\n  position: fixed;\n}\n\n/*--------------\n     Bottom\n---------------*/\n\n.ui.bottom.nags,\n.ui.bottom.nag {\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n  top: auto;\n  bottom: 0em;\n}\n\n/*--------------\n     White\n---------------*/\n\n.ui.inverted.nags .nag,\n.ui.inverted.nag {\n  background-color: #f0f0f0;\n  color: rgba(0, 0, 0, 0.85);\n}\n\n.ui.inverted.nags .nag .close,\n.ui.inverted.nags .nag .title,\n.ui.inverted.nag .close,\n.ui.inverted.nag .title {\n  color: rgba(0, 0, 0, 0.4);\n}\n\n/*******************************\n           Groups\n*******************************/\n\n.ui.nags .nag {\n  border-radius: 0em !important;\n}\n\n.ui.nags .nag:last-child {\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n.ui.bottom.nags .nag:last-child {\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n        User Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Popup\n*******************************/\n\n.ui.popup {\n  display: none;\n  position: absolute;\n  top: 0px;\n  right: 0px;\n  z-index: 900;\n  border: 1px solid #cccccc;\n  max-width: 250px;\n  background-color: #ffffff;\n  padding: 0.833em 1em;\n  font-weight: normal;\n  font-style: normal;\n  color: rgba(0, 0, 0, 0.8);\n  border-radius: 0.2857rem;\n  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.1);\n}\n\n.ui.popup > .header {\n  padding: 0em;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-size: 1.125em;\n  line-height: 1.2;\n  font-weight: bold;\n}\n\n.ui.popup > .header + .content {\n  padding-top: 0.5em;\n}\n\n.ui.popup:before {\n  position: absolute;\n  content: \'\';\n  width: 0.75em;\n  height: 0.75em;\n  background: #ffffff;\n  -webkit-transform: rotate(45deg);\n  -ms-transform: rotate(45deg);\n  transform: rotate(45deg);\n  z-index: 2;\n  box-shadow: 1px 1px 0px 0px #b3b3b3;\n}\n\n/*******************************\n            Types\n*******************************/\n\n/*--------------\n     Spacing\n---------------*/\n\n.ui.popup {\n  margin: 0em;\n}\n\n.ui.popup.bottom {\n  margin: 0.75em 0em 0em;\n}\n\n.ui.popup.top {\n  margin: 0em 0em 0.75em;\n}\n\n.ui.popup.left.center {\n  margin: 0em 0.75em 0em 0em;\n}\n\n.ui.popup.right.center {\n  margin: 0em 0em 0em 0.75em;\n}\n\n/*--------------\n     Pointer\n---------------*/\n\n/*--- Below ---*/\n\n.ui.bottom.center.popup:before {\n  margin-left: -0.325em;\n  top: -0.325em;\n  left: 50%;\n  right: auto;\n  bottom: auto;\n  box-shadow: -1px -1px 0px 0px #b3b3b3;\n}\n\n.ui.bottom.left.popup {\n  margin-left: 0em;\n}\n\n.ui.bottom.left.popup:before {\n  top: -0.325em;\n  left: 1em;\n  right: auto;\n  bottom: auto;\n  margin-left: 0em;\n  box-shadow: -1px -1px 0px 0px #b3b3b3;\n}\n\n.ui.bottom.right.popup {\n  margin-right: 0em;\n}\n\n.ui.bottom.right.popup:before {\n  top: -0.325em;\n  right: 1em;\n  bottom: auto;\n  left: auto;\n  margin-left: 0em;\n  box-shadow: -1px -1px 0px 0px #b3b3b3;\n}\n\n/*--- Above ---*/\n\n.ui.top.center.popup:before {\n  top: auto;\n  right: auto;\n  bottom: -0.325em;\n  left: 50%;\n  margin-left: -0.325em;\n}\n\n.ui.top.left.popup {\n  margin-left: 0em;\n}\n\n.ui.top.left.popup:before {\n  bottom: -0.325em;\n  left: 1em;\n  top: auto;\n  right: auto;\n  margin-left: 0em;\n}\n\n.ui.top.right.popup {\n  margin-right: 0em;\n}\n\n.ui.top.right.popup:before {\n  bottom: -0.325em;\n  right: 1em;\n  top: auto;\n  left: auto;\n  margin-left: 0em;\n}\n\n/*--- Left Center ---*/\n\n.ui.left.center.popup:before {\n  top: 50%;\n  right: -0.325em;\n  bottom: auto;\n  left: auto;\n  margin-top: -0.325em;\n  box-shadow: 1px -1px 0px 0px #b3b3b3;\n}\n\n/*--- Right Center  ---*/\n\n.ui.right.center.popup:before {\n  top: 50%;\n  left: -0.325em;\n  bottom: auto;\n  right: auto;\n  margin-top: -0.325em;\n  box-shadow: -1px 1px 0px 0px #b3b3b3;\n}\n\n/*******************************\n            Coupling\n*******************************/\n\n/* Immediate Nested Grid */\n\n.ui.popup > .ui.grid:not(.padded) {\n  width: -webkit-calc(100% + 1.75rem);\n  width: calc(100% + 1.75rem);\n  margin: -0.7rem -0.875rem;\n}\n\n/*******************************\n            States\n*******************************/\n\n.ui.loading.popup {\n  display: block;\n  visibility: hidden;\n  z-index: -1;\n}\n\n.ui.animating.popup,\n.ui.visible.popup {\n  display: block;\n}\n\n/*******************************\n            Variations\n*******************************/\n\n/*--------------\n     Basic\n---------------*/\n\n.ui.basic.popup:before {\n  display: none;\n}\n\n/*--------------\n     Wide\n---------------*/\n\n.ui.wide.popup {\n  width: 350px;\n  max-width: 350px;\n}\n\n.ui[class*="very wide"].popup {\n  width: 550px;\n  max-width: 550px;\n}\n\n/*--------------\n     Fluid\n---------------*/\n\n.ui.fluid.popup {\n  width: 100%;\n  max-width: none;\n}\n\n/*--------------\n     Colors\n---------------*/\n\n/* Inverted colors  */\n\n.ui.inverted.popup {\n  background: #1b1c1d;\n  color: #ffffff;\n  border: none;\n  box-shadow: none;\n}\n\n.ui.inverted.popup .header {\n  background-color: none;\n  color: #ffffff;\n}\n\n.ui.inverted.popup:before {\n  background-color: #1b1c1d;\n  box-shadow: none !important;\n}\n\n/*--------------\n     Flowing\n---------------*/\n\n.ui.flowing.popup {\n  max-width: none;\n}\n\n/*--------------\n     Sizes\n---------------*/\n\n.ui.small.popup {\n  font-size: 0.785714rem;\n}\n\n.ui.popup {\n  font-size: 0.85714rem;\n}\n\n.ui.large.popup {\n  font-size: 1rem;\n}\n\n.ui.huge.popup {\n  font-size: 1.14285rem;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n        User Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Progress\n*******************************/\n\n.ui.progress {\n  position: relative;\n  display: block;\n  max-width: 100%;\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  margin: 1em 0em 2.5em;\n  box-shadow: none;\n  background: rgba(0, 0, 0, 0.03);\n  padding: 0.2857em;\n  border-radius: 0.2857rem;\n}\n\n.ui.progress:first-child {\n  margin: 0em 0em 2.5em;\n}\n\n.ui.progress:last-child {\n  margin: 0em 0em 1.5em;\n}\n\n/* Indicating */\n\n.ui.indicating.progress .bar[style^="width: 1%"],\n.ui.indicating.progress .bar[style^="width: 2%"],\n.ui.indicating.progress .bar[style^="width: 3%"],\n.ui.indicating.progress .bar[style^="width: 4%"],\n.ui.indicating.progress .bar[style^="width: 5%"],\n.ui.indicating.progress .bar[style^="width: 6%"],\n.ui.indicating.progress .bar[style^="width: 7%"],\n.ui.indicating.progress .bar[style^="width: 8%"],\n.ui.indicating.progress .bar[style^="width: 9%"],\n.ui.indicating.progress .bar[style^="width: 1"],\n.ui.indicating.progress .bar[style^="width: 2"] {\n  background-color: #d95c5c;\n}\n\n.ui.indicating.progress .bar[style^="width: 3"] {\n  background-color: #d9a65c;\n}\n\n.ui.indicating.progress .bar[style^="width: 4"],\n.ui.indicating.progress .bar[style^="width: 5"] {\n  background-color: #e6bb48;\n}\n\n.ui.indicating.progress .bar[style^="width: 6"] {\n  background-color: #ddc928;\n}\n\n.ui.indicating.progress .bar[style^="width: 7"],\n.ui.indicating.progress .bar[style^="width: 8"] {\n  background-color: #b4d95c;\n}\n\n.ui.indicating.progress .bar[style^="width: 9"],\n.ui.indicating.progress .bar[style^="width: 100"] {\n  background-color: #66da81;\n}\n\n/* Single Digits Last */\n\n.ui.indicating.progress .bar[style^="width: 1%"] + .label,\n.ui.indicating.progress .bar[style^="width: 2%"] + .label,\n.ui.indicating.progress .bar[style^="width: 3%"] + .label,\n.ui.indicating.progress .bar[style^="width: 4%"] + .label,\n.ui.indicating.progress .bar[style^="width: 5%"] + .label,\n.ui.indicating.progress .bar[style^="width: 6%"] + .label,\n.ui.indicating.progress .bar[style^="width: 7%"] + .label,\n.ui.indicating.progress .bar[style^="width: 8%"] + .label,\n.ui.indicating.progress .bar[style^="width: 9%"] + .label,\n.ui.indicating.progress .bar[style^="width: 1"] + .label,\n.ui.indicating.progress .bar[style^="width: 2"] + .label {\n  color: #d95c5c;\n}\n\n.ui.indicating.progress .bar[style^="width: 3"] + .label {\n  color: #d9a65c;\n}\n\n.ui.indicating.progress .bar[style^="width: 4"] + .label,\n.ui.indicating.progress .bar[style^="width: 5"] + .label {\n  color: #e6bb48;\n}\n\n.ui.indicating.progress .bar[style^="width: 6"] + .label {\n  color: #ddc928;\n}\n\n.ui.indicating.progress .bar[style^="width: 7"] + .label,\n.ui.indicating.progress .bar[style^="width: 8"] + .label {\n  color: #b4d95c;\n}\n\n.ui.indicating.progress .bar[style^="width: 9"] + .label,\n.ui.indicating.progress .bar[style^="width: 100"] + .label {\n  color: #66da81;\n}\n\n.ui.indicating.progress.success .bar + .label {\n  color: #356e36;\n}\n\n/*******************************\n            Content\n*******************************/\n\n/* Activity Bar */\n\n.ui.progress .bar {\n  display: block;\n  line-height: 1;\n  position: relative;\n  width: 0%;\n  min-width: 2em;\n  background: #888888;\n  border-radius: 0.2857rem;\n  -webkit-transition: width 0.2s linear, background-color 0.2s linear;\n  transition: width 0.2s linear, background-color 0.2s linear;\n}\n\n/* Percent Complete */\n\n.ui.progress .bar > .progress {\n  white-space: nowrap;\n  position: absolute;\n  width: auto;\n  font-size: 0.9em;\n  top: 50%;\n  right: 0.5em;\n  left: auto;\n  bottom: auto;\n  color: rgba(255, 255, 255, 0.8);\n  text-shadow: none;\n  margin-top: -0.5em;\n  font-weight: bold;\n  text-align: left;\n}\n\n/* Label */\n\n.ui.progress > .label {\n  position: absolute;\n  width: 100%;\n  font-size: 1em;\n  top: 100%;\n  right: auto;\n  left: 0%;\n  bottom: auto;\n  color: rgba(0, 0, 0, 0.8);\n  font-weight: bold;\n  text-shadow: none;\n  margin-top: 0.2em;\n  text-align: center;\n  -webkit-transition: color 0.4s ease;\n  transition: color 0.4s ease;\n}\n\n/*******************************\n             States\n*******************************/\n\n/*--------------\n     Success\n---------------*/\n\n.ui.progress.success .bar {\n  background-color: #5bbd72 !important;\n}\n\n.ui.progress.success .bar,\n.ui.progress.success .bar::after {\n  -webkit-animation: none !important;\n  animation: none !important;\n}\n\n.ui.progress.success > .label {\n  color: #356e36;\n}\n\n/*--------------\n     Warning\n---------------*/\n\n.ui.progress.warning .bar {\n  background-color: #f2c037 !important;\n}\n\n.ui.progress.warning .bar,\n.ui.progress.warning .bar::after {\n  -webkit-animation: none !important;\n  animation: none !important;\n}\n\n.ui.progress.warning > .label {\n  color: #825c01;\n}\n\n/*--------------\n     Error\n---------------*/\n\n.ui.progress.error .bar {\n  background-color: #d95c5c !important;\n}\n\n.ui.progress.error .bar,\n.ui.progress.error .bar::after {\n  -webkit-animation: none !important;\n  animation: none !important;\n}\n\n.ui.progress.error > .label {\n  color: #912d2b;\n}\n\n/*--------------\n     Active\n---------------*/\n\n.ui.active.progress .bar {\n  position: relative;\n  min-width: 2em;\n}\n\n.ui.active.progress .bar::after {\n  content: \'\';\n  opacity: 0;\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  right: 0px;\n  bottom: 0px;\n  background: #ffffff;\n  border-radius: 0.2857rem;\n  -webkit-animation: progress-active 2s ease infinite;\n  animation: progress-active 2s ease infinite;\n}\n\n@-webkit-keyframes progress-active {\n  0% {\n    opacity: 0.3;\n    width: 0;\n  }\n\n  100% {\n    opacity: 0;\n    width: 100%;\n  }\n}\n\n@keyframes progress-active {\n  0% {\n    opacity: 0.3;\n    width: 0;\n  }\n\n  100% {\n    opacity: 0;\n    width: 100%;\n  }\n}\n\n/*--------------\n    Disabled\n---------------*/\n\n.ui.disabled.progress {\n  opacity: 0.35;\n}\n\n.ui.disabled.progress .bar,\n.ui.disabled.progress .bar::after {\n  -webkit-animation: none !important;\n  animation: none !important;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------\n    Inverted\n---------------*/\n\n.ui.inverted.progress {\n  background: rgba(255, 255, 255, 0.05);\n  border: none;\n}\n\n.ui.inverted.progress .bar {\n  background: #888888;\n}\n\n.ui.inverted.progress .bar > .progress {\n  color: #fafafa;\n}\n\n.ui.inverted.progress > .label {\n  color: #ffffff;\n}\n\n.ui.inverted.progress.success > .label {\n  color: #5bbd72;\n}\n\n.ui.inverted.progress.warning > .label {\n  color: #f2c037;\n}\n\n.ui.inverted.progress.error > .label {\n  color: #d95c5c;\n}\n\n/*--------------\n    Attached\n---------------*/\n\n/* bottom attached */\n\n.ui.progress.attached {\n  background: transparent;\n  position: relative;\n  border: none;\n  margin: 0em;\n}\n\n.ui.progress.attached,\n.ui.progress.attached .bar {\n  display: block;\n  height: 3px;\n  padding: 0px;\n  overflow: hidden;\n  border-radius: 0em 0em 0.2857rem 0.2857rem;\n}\n\n.ui.progress.attached .bar {\n  border-radius: 0em;\n}\n\n/* top attached */\n\n.ui.progress.top.attached,\n.ui.progress.top.attached .bar {\n  top: 0px;\n  border-radius: 0.2857rem 0.2857rem 0em 0em;\n}\n\n.ui.progress.top.attached .bar {\n  border-radius: 0em;\n}\n\n/*--------------\n     Colors\n---------------*/\n\n.ui.black.progress .bar {\n  background-color: #1b1c1d;\n}\n\n.ui.blue.progress .bar {\n  background-color: #3b83c0;\n}\n\n.ui.green.progress .bar {\n  background-color: #5bbd72;\n}\n\n.ui.orange.progress .bar {\n  background-color: #e07b53;\n}\n\n.ui.pink.progress .bar {\n  background-color: #d9499a;\n}\n\n.ui.purple.progress .bar {\n  background-color: #564f8a;\n}\n\n.ui.red.progress .bar {\n  background-color: #d95c5c;\n}\n\n.ui.teal.progress .bar {\n  background-color: #00b5ad;\n}\n\n.ui.yellow.progress .bar {\n  background-color: #f2c61f;\n}\n\n.ui.black.inverted.progress .bar {\n  background-color: #333333;\n}\n\n.ui.blue.inverted.progress .bar {\n  background-color: #54c8ff;\n}\n\n.ui.green.inverted.progress .bar {\n  background-color: #2ecc40;\n}\n\n.ui.orange.inverted.progress .bar {\n  background-color: #ff851b;\n}\n\n.ui.pink.inverted.progress .bar {\n  background-color: #ff8edf;\n}\n\n.ui.purple.inverted.progress .bar {\n  background-color: #cdc6ff;\n}\n\n.ui.red.inverted.progress .bar {\n  background-color: #ff695e;\n}\n\n.ui.teal.inverted.progress .bar {\n  background-color: #6dffff;\n}\n\n.ui.yellow.inverted.progress .bar {\n  background-color: #ffe21f;\n}\n\n/*--------------\n     Sizes\n---------------*/\n\n.ui.tiny.progress {\n  font-size: 0.85714286rem;\n}\n\n.ui.tiny.progress .bar {\n  height: 0.5em;\n}\n\n.ui.small.progress {\n  font-size: 0.92857143rem;\n}\n\n.ui.small.progress .bar {\n  height: 1em;\n}\n\n.ui.progress {\n  font-size: 1rem;\n}\n\n.ui.progress .bar {\n  height: 1.75em;\n}\n\n.ui.large.progress {\n  font-size: 1.14285714rem;\n}\n\n.ui.large.progress .bar {\n  height: 2.5em;\n}\n\n.ui.big.progress {\n  font-size: 1.28571429rem;\n}\n\n.ui.big.progress .bar {\n  height: 3.5em;\n}\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n           Rating\n*******************************/\n\n.ui.rating {\n  display: inline-block;\n  font-size: 0em;\n  vertical-align: baseline;\n}\n\n.ui.rating:last-child {\n  margin-right: 0em;\n}\n\n.ui.rating:before {\n  display: block;\n  content: \'\';\n  visibility: hidden;\n  clear: both;\n  height: 0;\n}\n\n/* Icon */\n\n.ui.rating .icon {\n  cursor: pointer;\n  margin: 0em;\n  width: 1.1em;\n  text-align: center;\n  height: auto;\n  padding: 0em;\n  font-weight: normal;\n  font-style: normal;\n  vertical-align: baseline;\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*-------------------\n        Star\n--------------------*/\n\n/* Inactive */\n\n.ui.star.rating .icon {\n  width: 1.1em;\n  color: rgba(0, 0, 0, 0.15);\n}\n\n/* Active Star */\n\n.ui.star.rating .active.icon {\n  color: #ffe623 !important;\n  text-shadow: 0px -1px 0px #cfa300, -1px 0px 0px #cfa300, 0px 1px 0px #cfa300, 1px 0px 0px #cfa300;\n}\n\n/* Selected Star */\n\n.ui.star.rating .icon.selected,\n.ui.star.rating .icon.selected.active {\n  color: #ffb70a !important;\n}\n\n.ui.star.rating.partial {\n  position: relative;\n  z-index: 1;\n}\n\n.ui.star.rating.partial:before {\n  position: absolute;\n  z-index: -1;\n}\n\n/*-------------------\n        Heart\n--------------------*/\n\n.ui.heart.rating .icon {\n  width: 1.25em;\n  color: rgba(0, 0, 0, 0.15);\n}\n\n/* Active Heart */\n\n.ui.heart.rating .active.icon {\n  color: #ff2733 !important;\n  text-shadow: 0px -1px 0px #9e0000, -1px 0px 0px #9e0000, 0px 1px 0px #9e0000, 1px 0px 0px #9e0000;\n}\n\n/* Selected Heart */\n\n.ui.heart.rating .icon.selected,\n.ui.heart.rating .icon.selected.active {\n  color: #ff2733 !important;\n}\n\n/*******************************\n             States\n*******************************/\n\n/* Inactive Icon */\n\n.ui.rating .icon {\n  color: rgba(0, 0, 0, 0.15);\n}\n\n/* Active Icon */\n\n.ui.rating .active.icon {\n  color: rgba(0, 0, 0, 0.85);\n}\n\n/* Selected Icon */\n\n.ui.rating .icon.selected,\n.ui.rating .icon.selected.active {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/*-------------------\n       Disabled\n--------------------*/\n\n/* disabled rating */\n\n.ui.disabled.rating .icon {\n  cursor: default;\n}\n\n/*-------------------\n     Interacting (Active)\n--------------------*/\n\n/* Selected Rating */\n\n.ui.rating.selected .active.icon {\n  opacity: 0.5;\n}\n\n.ui.rating.selected .icon.selected,\n.ui.rating .icon.selected {\n  opacity: 1;\n}\n\n/*******************************\n          Variations\n*******************************/\n\n.ui.mini.rating .icon {\n  font-size: 0.7rem;\n}\n\n.ui.tiny.rating .icon {\n  font-size: 0.8rem;\n}\n\n.ui.small.rating .icon {\n  font-size: 0.875rem;\n}\n\n.ui.rating .icon {\n  font-size: 1rem;\n}\n\n.ui.large.rating .icon {\n  font-size: 1.1rem;\n}\n\n.ui.huge.rating .icon {\n  font-size: 1.5rem;\n}\n\n.ui.massive.rating .icon {\n  font-size: 2rem;\n}\n\n/* Realign */\n\n.ui.large.rating,\n.ui.huge.rating,\n.ui.massive.rating {\n  vertical-align: middle;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n@font-face {\n  font-family: \'Rating\';\n  src: url(data:application/x-font-ttf;charset=utf-8;base64,AAEAAAALAIAAAwAwT1MvMggjCBsAAAC8AAAAYGNtYXCj2pm8AAABHAAAAKRnYXNwAAAAEAAAAcAAAAAIZ2x5ZlJbXMYAAAHIAAARnGhlYWQBGAe5AAATZAAAADZoaGVhA+IB/QAAE5wAAAAkaG10eCzgAEMAABPAAAAAcGxvY2EwXCxOAAAUMAAAADptYXhwACIAnAAAFGwAAAAgbmFtZfC1n04AABSMAAABPHBvc3QAAwAAAAAVyAAAACAAAwIAAZAABQAAAUwBZgAAAEcBTAFmAAAA9QAZAIQAAAAAAAAAAAAAAAAAAAABEAAAAAAAAAAAAAAAAAAAAABAAADxZQHg/+D/4AHgACAAAAABAAAAAAAAAAAAAAAgAAAAAAACAAAAAwAAABQAAwABAAAAFAAEAJAAAAAgACAABAAAAAEAIOYF8AbwDfAj8C7wbvBw8Irwl/Cc8SPxZf/9//8AAAAAACDmAPAE8AzwI/Au8G7wcPCH8JfwnPEj8WT//f//AAH/4xoEEAYQAQ/sD+IPow+iD4wPgA98DvYOtgADAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAH//wAPAAEAAAAAAAAAAAACAAA3OQEAAAAAAQAAAAAAAAAAAAIAADc5AQAAAAABAAAAAAAAAAAAAgAANzkBAAAAAAIAAP/tAgAB0wAKABUAAAEvAQ8BFwc3Fyc3BQc3Jz8BHwEHFycCALFPT7GAHp6eHoD/AHAWW304OH1bFnABGRqgoBp8sFNTsHyyOnxYEnFxElh8OgAAAAACAAD/7QIAAdMACgASAAABLwEPARcHNxcnNwUxER8BBxcnAgCxT0+xgB6enh6A/wA4fVsWcAEZGqCgGnywU1OwfLIBHXESWHw6AAAAAQAA/+0CAAHTAAoAAAEvAQ8BFwc3Fyc3AgCxT0+xgB6enh6AARkaoKAafLBTU7B8AAAAAAEAAAAAAgABwAArAAABFA4CBzEHDgMjIi4CLwEuAzU0PgIzMh4CFz4DMzIeAhUCAAcMEgugBgwMDAYGDAwMBqALEgwHFyg2HhAfGxkKChkbHxAeNigXAS0QHxsZCqAGCwkGBQkLBqAKGRsfEB42KBcHDBILCxIMBxcoNh4AAAAAAgAAAAACAAHAACsAWAAAATQuAiMiDgIHLgMjIg4CFRQeAhcxFx4DMzI+Aj8BPgM1DwEiFCIGMTAmIjQjJy4DNTQ+AjMyHgIfATc+AzMyHgIVFA4CBwIAFyg2HhAfGxkKChkbHxAeNigXBwwSC6AGDAwMBgYMDAwGoAsSDAdbogEBAQEBAaIGCgcEDRceEQkREA4GLy8GDhARCREeFw0EBwoGAS0eNigXBwwSCwsSDAcXKDYeEB8bGQqgBgsJBgUJCwagChkbHxA+ogEBAQGiBg4QEQkRHhcNBAcKBjQ0BgoHBA0XHhEJERAOBgABAAAAAAIAAcAAMQAAARQOAgcxBw4DIyIuAi8BLgM1ND4CMzIeAhcHFwc3Jzc+AzMyHgIVAgAHDBILoAYMDAwGBgwMDAagCxIMBxcoNh4KFRMSCC9wQLBwJwUJCgkFHjYoFwEtEB8bGQqgBgsJBgUJCwagChkbHxAeNigXAwUIBUtAoMBAOwECAQEXKDYeAAABAAAAAAIAAbcAKgAAEzQ3NjMyFxYXFhcWFzY3Njc2NzYzMhcWFRQPAQYjIi8BJicmJyYnJicmNQAkJUARExIQEAsMCgoMCxAQEhMRQCUkQbIGBwcGsgMFBQsKCQkGBwExPyMkBgYLCgkKCgoKCQoLBgYkIz8/QawFBawCBgUNDg4OFRQTAAAAAQAAAA0B2wHSACYAABM0PwI2FzYfAhYVFA8BFxQVFAcGByYvAQcGByYnJjU0PwEnJjUAEI9BBQkIBkCPEAdoGQMDBgUGgIEGBQYDAwEYaAcBIwsCFoEMAQEMgRYCCwYIZJABBQUFAwEBAkVFAgEBAwUFAwOQZAkFAAAAAAIAAAANAdsB0gAkAC4AABM0PwI2FzYfAhYVFA8BFxQVFAcmLwEHBgcmJyY1ND8BJyY1HwEHNxcnNy8BBwAQj0EFCQgGQI8QB2gZDAUGgIEGBQYDAwEYaAc/WBVsaxRXeDY2ASMLAhaBDAEBDIEWAgsGCGSQAQUNAQECRUUCAQEDBQUDA5BkCQURVXg4OHhVEW5uAAABACMAKQHdAXwAGgAANzQ/ATYXNh8BNzYXNh8BFhUUDwEGByYvASY1IwgmCAwLCFS8CAsMCCYICPUIDAsIjgjSCwkmCQEBCVS7CQEBCSYJCg0H9gcBAQePBwwAAAEAHwAfAXMBcwAsAAA3ND8BJyY1ND8BNjMyHwE3NjMyHwEWFRQPARcWFRQPAQYjIi8BBwYjIi8BJjUfCFRUCAgnCAwLCFRUCAwLCCcICFRUCAgnCAsMCFRUCAsMCCcIYgsIVFQIDAsIJwgIVFQICCcICwwIVFQICwwIJwgIVFQICCcIDAAAAAACAAAAJQFJAbcAHwArAAA3NTQ3NjsBNTQ3NjMyFxYdATMyFxYdARQHBiMhIicmNTczNTQnJiMiBwYdAQAICAsKJSY1NCYmCQsICAgIC/7tCwgIW5MWFR4fFRZApQsICDc0JiYmJjQ3CAgLpQsICAgIC8A3HhYVFRYeNwAAAQAAAAcBbgG3ACEAADcRNDc2NzYzITIXFhcWFREUBwYHBiMiLwEHBiMiJyYnJjUABgUKBgYBLAYGCgUGBgUKBQcOCn5+Cg4GBgoFBicBcAoICAMDAwMICAr+kAoICAQCCXl5CQIECAgKAAAAAwAAACUCAAFuABgAMQBKAAA3NDc2NzYzMhcWFxYVFAcGBwYjIicmJyY1MxYXFjMyNzY3JicWFRQHBiMiJyY1NDcGBzcUFxYzMjc2NTQ3NjMyNzY1NCcmIyIHBhUABihDREtLREMoBgYoQ0RLS0RDKAYlJjk5Q0M5OSYrQREmJTU1JSYRQSuEBAQGBgQEEREZBgQEBAQGJBkayQoKQSgoKChBCgoKCkEoJycoQQoKOiMjIyM6RCEeIjUmJSUmNSIeIUQlBgQEBAQGGBIRBAQGBgQEGhojAAAABQAAAAkCAAGJACwAOABRAGgAcAAANzQ3Njc2MzIXNzYzMhcWFxYXFhcWFxYVFDEGBwYPAQYjIicmNTQ3JicmJyY1MxYXNyYnJjU0NwYHNxQXFjMyNzY1NDc2MzI3NjU0JyYjIgcGFRc3Njc2NyYnNxYXFhcWFRQHBgcGBwYjPwEWFRQHBgcABitBQU0ZGhADBQEEBAUFBAUEBQEEHjw8Hg4DBQQiBQ0pIyIZBiUvSxYZDg4RQSuEBAQGBgQEEREZBgQEBAQGJBkaVxU9MzQiIDASGxkZEAYGCxQrODk/LlACFxYlyQsJQycnBRwEAgEDAwIDAwIBAwUCNmxsNhkFFAMFBBUTHh8nCQtKISgSHBsfIh4hRCUGBAQEBAYYEhEEBAYGBAQaGiPJJQUiIjYzISASGhkbCgoKChIXMRsbUZANCyghIA8AAAMAAAAAAbcB2wA5AEoAlAAANzU0NzY7ATY3Njc2NzY3Njc2MzIXFhcWFRQHMzIXFhUUBxYVFAcUFRQHFgcGKwEiJyYnJisBIicmNTcUFxYzMjc2NTQnJiMiBwYVFzMyFxYXFhcWFxYXFhcWOwEyNTQnNjc2NTQnNjU0JyYnNjc2NTQnJisBNDc2NTQnJiMGBwYHBgcGBwYHBgcGBwYHBgcGBwYrARUACwoQTgodEQ4GBAMFBgwLDxgTEwoKDjMdFhYOAgoRARkZKCUbGxsjIQZSEAoLJQUFCAcGBQUGBwgFBUkJBAUFBAQHBwMDBwcCPCUjNwIJBQUFDwMDBAkGBgsLDmUODgoJGwgDAwYFDAYQAQUGAwQGBgYFBgUGBgQJSbcPCwsGJhUPCBERExMMCgkJFBQhGxwWFR4ZFQoKFhMGBh0WKBcXBgcMDAoLDxIHBQYGBQcIBQYGBQgSAQEBAQICAQEDAgEULwgIBQoLCgsJDhQHCQkEAQ0NCg8LCxAdHREcDQ4IEBETEw0GFAEHBwUECAgFBQUFAgO3AAADAAD/2wG3AbcAPABNAJkAADc1NDc2OwEyNzY3NjsBMhcWBxUWFRQVFhUUBxYVFAcGKwEWFRQHBgcGIyInJicmJyYnJicmJyYnIyInJjU3FBcWMzI3NjU0JyYjIgcGFRczMhcWFxYXFhcWFxYXFhcWFxYXFhcWFzI3NjU0JyY1MzI3NjU0JyYjNjc2NTQnNjU0JyYnNjU0JyYrASIHIgcGBwYHBgcGIwYrARUACwoQUgYhJRsbHiAoGRkBEQoCDhYWHTMOCgoTExgPCwoFBgIBBAMFDhEdCk4QCgslBQUIBwYFBQYHCAUFSQkEBgYFBgUGBgYEAwYFARAGDAUGAwMIGwkKDg5lDgsLBgYJBAMDDwUFBQkCDg4ZJSU8AgcHAwMHBwQEBQUECbe3DwsKDAwHBhcWJwIWHQYGExYKChUZHhYVHRoiExQJCgsJDg4MDAwNBg4WJQcLCw+kBwUGBgUHCAUGBgUIpAMCBQYFBQcIBAUHBwITBwwTExERBw0OHBEdHRALCw8KDQ0FCQkHFA4JCwoLCgUICBgMCxUDAgEBAgMBAQG3AAAAAQAAAA0A7gHSABQAABM0PwI2FxEHBgcmJyY1ND8BJyY1ABCPQQUJgQYFBgMDARhoBwEjCwIWgQwB/oNFAgEBAwUFAwOQZAkFAAAAAAIAAAAAAgABtwAqAFkAABM0NzYzMhcWFxYXFhc2NzY3Njc2MzIXFhUUDwEGIyIvASYnJicmJyYnJjUzFB8BNzY1NCcmJyYnJicmIyIHBgcGBwYHBiMiJyYnJicmJyYjIgcGBwYHBgcGFQAkJUARExIQEAsMCgoMCxAQEhMRQCUkQbIGBwcGsgMFBQsKCQkGByU1pqY1BgYJCg4NDg0PDhIRDg8KCgcFCQkFBwoKDw4REg4PDQ4NDgoJBgYBMT8jJAYGCwoJCgoKCgkKCwYGJCM/P0GsBQWsAgYFDQ4ODhUUEzA1oJ82MBcSEgoLBgcCAgcHCwsKCQgHBwgJCgsLBwcCAgcGCwoSEhcAAAACAAAABwFuAbcAIQAoAAA3ETQ3Njc2MyEyFxYXFhURFAcGBwYjIi8BBwYjIicmJyY1PwEfAREhEQAGBQoGBgEsBgYKBQYGBQoFBw4Kfn4KDgYGCgUGJZIZef7cJwFwCggIAwMDAwgICv6QCggIBAIJeXkJAgQICAoIjRl0AWP+nQAAAAABAAAAJQHbAbcAMgAANzU0NzY7ATU0NzYzMhcWHQEUBwYrASInJj0BNCcmIyIHBh0BMzIXFh0BFAcGIyEiJyY1AAgIC8AmJjQ1JiUFBQgSCAUFFhUfHhUWHAsICAgIC/7tCwgIQKULCAg3NSUmJiU1SQgFBgYFCEkeFhUVFh43CAgLpQsICAgICwAAAAIAAQANAdsB0gAiAC0AABM2PwI2MzIfAhYXFg8BFxYHBiMiLwEHBiMiJyY/AScmNx8CLwE/AS8CEwEDDJBABggJBUGODgIDCmcYAgQCCAMIf4IFBgYEAgEZaQgC7hBbEgINSnkILgEBJggCFYILC4IVAggICWWPCgUFA0REAwUFCo9lCQipCTBmEw1HEhFc/u0AAAADAAAAAAHJAbcAFAAlAHkAADc1NDc2OwEyFxYdARQHBisBIicmNTcUFxYzMjc2NTQnJiMiBwYVFzU0NzYzNjc2NzY3Njc2NzY3Njc2NzY3NjMyFxYXFhcWFxYXFhUUFRQHBgcGBxQHBgcGBzMyFxYVFAcWFRYHFgcGBxYHBgcjIicmJyYnJiciJyY1AAUGB1MHBQYGBQdTBwYFJQUFCAcGBQUGBwgFBWQFBQgGDw8OFAkFBAQBAQMCAQIEBAYFBw4KCgcHBQQCAwEBAgMDAgYCAgIBAU8XEBAQBQEOBQUECwMREiYlExYXDAwWJAoHBQY3twcGBQUGB7cIBQUFBQgkBwYFBQYHCAUGBgUIJLcHBQYBEBATGQkFCQgGBQwLBgcICQUGAwMFBAcHBgYICQQEBwsLCwYGCgIDBAMCBBEQFhkSDAoVEhAREAsgFBUBBAUEBAcMAQUFCAAAAAADAAD/2wHJAZIAFAAlAHkAADcUFxYXNxY3Nj0BNCcmBycGBwYdATc0NzY3FhcWFRQHBicGJyY1FzU0NzY3Fjc2NzY3NjcXNhcWBxYXFgcWBxQHFhUUBwYHJxYXFhcWFRYXFhcWFRQVFAcGBwYHBgcGBwYnBicmJyYnJicmJyYnJicmJyYnJiciJyY1AAUGB1MHBQYGBQdTBwYFJQUFCAcGBQUGBwgFBWQGBQcKJBYMDBcWEyUmEhEDCwQFBQ4BBRAQEBdPAQECAgIGAgMDAgEBAwIEBQcHCgoOBwUGBAQCAQIDAQEEBAUJFA4PDwYIBQWlBwYFAQEBBwQJtQkEBwEBAQUGB7eTBwYEAQEEBgcJBAYBAQYECZS4BwYEAgENBwUCBgMBAQEXEyEJEhAREBcIDhAaFhEPAQEFAgQCBQELBQcKDAkIBAUHCgUGBwgDBgIEAQEHBQkIBwUMCwcECgcGCRoREQ8CBgQIAAAAAQAAAAEAAJth57dfDzz1AAsCAAAAAADP/GODAAAAAM/8Y4MAAP/bAgAB2wAAAAgAAgAAAAAAAAABAAAB4P/gAAACAAAAAAACAAABAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAEAAAACAAAAAgAAAAIAAAACAAAAAgAAAAIAAAACAAAAAdwAAAHcAAACAAAjAZMAHwFJAAABbgAAAgAAAAIAAAACAAAAAgAAAAEAAAACAAAAAW4AAAHcAAAB3AABAdwAAAHcAAAAAAAAAAoAFAAeAEoAcACKAMoBQAGIAcwCCgJUAoICxgMEAzoDpgRKBRgF7AYSBpgG2gcgB2oIGAjOAAAAAQAAABwAmgAFAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAA4ArgABAAAAAAABAAwAAAABAAAAAAACAA4AQAABAAAAAAADAAwAIgABAAAAAAAEAAwATgABAAAAAAAFABYADAABAAAAAAAGAAYALgABAAAAAAAKADQAWgADAAEECQABAAwAAAADAAEECQACAA4AQAADAAEECQADAAwAIgADAAEECQAEAAwATgADAAEECQAFABYADAADAAEECQAGAAwANAADAAEECQAKADQAWgByAGEAdABpAG4AZwBWAGUAcgBzAGkAbwBuACAAMQAuADAAcgBhAHQAaQBuAGdyYXRpbmcAcgBhAHQAaQBuAGcAUgBlAGcAdQBsAGEAcgByAGEAdABpAG4AZwBGAG8AbgB0ACAAZwBlAG4AZQByAGEAdABlAGQAIABiAHkAIABJAGMAbwBNAG8AbwBuAC4AAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==) format(\'truetype\'), url(data:application/font-woff;charset=utf-8;base64,d09GRk9UVE8AABcUAAoAAAAAFswAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABDRkYgAAAA9AAAEuEAABLho6TvIE9TLzIAABPYAAAAYAAAAGAIIwgbY21hcAAAFDgAAACkAAAApKPambxnYXNwAAAU3AAAAAgAAAAIAAAAEGhlYWQAABTkAAAANgAAADYBGAe5aGhlYQAAFRwAAAAkAAAAJAPiAf1obXR4AAAVQAAAAHAAAABwLOAAQ21heHAAABWwAAAABgAAAAYAHFAAbmFtZQAAFbgAAAE8AAABPPC1n05wb3N0AAAW9AAAACAAAAAgAAMAAAEABAQAAQEBB3JhdGluZwABAgABADr4HAL4GwP4GAQeCgAZU/+Lix4KABlT/4uLDAeLZviU+HQFHQAAAP0PHQAAAQIRHQAAAAkdAAAS2BIAHQEBBw0PERQZHiMoLTI3PEFGS1BVWl9kaW5zeH2Ch4xyYXRpbmdyYXRpbmd1MHUxdTIwdUU2MDB1RTYwMXVFNjAydUU2MDN1RTYwNHVFNjA1dUYwMDR1RjAwNXVGMDA2dUYwMEN1RjAwRHVGMDIzdUYwMkV1RjA2RXVGMDcwdUYwODd1RjA4OHVGMDg5dUYwOEF1RjA5N3VGMDlDdUYxMjN1RjE2NHVGMTY1AAACAYkAGgAcAgABAAQABwAKAA0AVgCWAL0BAgGMAeQCbwLwA4cD5QR0BQMFdgZgB8MJkQtxC7oM2Q1jDggOmRAYEZr8lA78lA78lA77lA74lPetFftFpTz3NDz7NPtFcfcU+xBt+0T3Mt73Mjht90T3FPcQBfuU+0YV+wRRofcQMOP3EZ3D9wXD+wX3EXkwM6H7EPsExQUO+JT3rRX7RaU89zQ8+zT7RXH3FPsQbftE9zLe9zI4bfdE9xT3EAX7lPtGFYuLi/exw/sF9xF5MDOh+xD7BMUFDviU960V+0WlPPc0PPs0+0Vx9xT7EG37RPcy3vcyOG33RPcU9xAFDviU98EVi2B4ZG5wCIuL+zT7NAV7e3t7e4t7i3ube5sI+zT3NAVupniyi7aL3M3N3Iu2i7J4pm6mqLKetovci81JizoIDviU98EVi9xJzTqLYItkeHBucKhknmCLOotJSYs6i2CeZKhwCIuL9zT7NAWbe5t7m4ubi5ubm5sI9zT3NAWopp6yi7YIME0V+zb7NgWKioqKiouKi4qMiowI+zb3NgV6m4Ghi6OLubCwuYuji6GBm3oIule6vwWbnKGVo4u5i7Bmi12Lc4F1ensIDviU98EVi2B4ZG5wCIuL+zT7NAV7e3t7e4t7i3ube5sI+zT3NAVupniyi7aL3M3N3Iuni6WDoX4IXED3BEtL+zT3RPdU+wTLssYFl46YjZiL3IvNSYs6CA6L98UVi7WXrKOio6Otl7aLlouXiZiHl4eWhZaEloSUhZKFk4SShZKEkpKSkZOSkpGUkZaSCJaSlpGXj5iPl42Wi7aLrX+jc6N0l2qLYYthdWBgYAj7RvtABYeIh4mGi4aLh42Hjgj7RvdABYmNiY2Hj4iOhpGDlISUhZWFlIWVhpaHmYaYiZiLmAgOZ4v3txWLkpCPlo0I9yOgzPcWBY6SkI+Ri5CLkIePhAjL+xb3I3YFlomQh4uEi4aJh4aGCCMmpPsjBYuKi4mLiIuHioiJiImIiIqHi4iLh4yHjQj7FM/7FUcFh4mHioiLh4uIjImOiY6KjouPi4yLjYyOCKP3IyPwBYaQiZCLjwgOZ4v3txWLkpCPlo0I9yOgzPcWBY6SkI+Ri5CLkIePhAjL+xb3I3YFlomQh4uEi4aJh4aGCCMmpPsjBYuKi4mLiIuCh4aDi4iLh4yHjQj7FM/7FUcFh4mHioiLh4uIjImOiY6KjouPi4yLjYyOCKP3IyPwBYaQiZCLjwjKeRXjN3b7DfcAxPZSd/cN4t/7DJ1V9wFV+wEFDq73ZhWLk42RkZEIsbIFkZCRjpOLkouSiJCGCN8291D3UAWQkJKOkouTi5GIkYYIsWQFkYaNhIuEi4OJhYWFCPuJ+4kFhYWFiYOLhIuEjYaRCPsi9yIFhZCJkouSCA77AartFYuSjpKQkAjf3zffBYaQiJKLk4uSjpKQkAiysgWRkJGOk4uSi5KIkIYI3zff3wWQkJKOk4uSi5KIkIYIsmQFkIaOhIuEi4OIhIaGCDc33zcFkIaOhIuEi4OIhYaFCGRkBYaGhIiEi4OLhI6GkAg33zc3BYaGhIiEi4OLhY6FkAhksgWGkYiRi5MIDvtLi8sVi/c5BYuSjpKQkJCQko6SiwiVi4vCBYuul6mkpKSkqpiui66LqX6kcqRymG2LaAiLVJSLBZKLkoiQhpCGjoSLhAiL+zkFi4OIhYaGhoWEiYSLCPuniwWEi4SNhpGGkIiRi5MI5vdUFfcni4vCBYufhJx8mn2ZepJ3i3aLeoR9fX18g3qLdwiLVAUO+yaLshWL+AQFi5GNkY+RjpCQj5KNj42PjI+LCPfAiwWPi4+Kj4mRiZCHj4aPhY2Fi4UIi/wEBYuEiYWHhoeGhoeFiIiKhoqHi4GLhI6EkQj7EvcN+xL7DQWEhYOIgouHi4eLh42EjoaPiJCHkImRi5IIDov3XRWLko2Rj5Kltq+vuKW4pbuZvYu9i7t9uHG4ca9npWCPhI2Fi4SLhYmEh4RxYGdoXnAIXnFbflmLWYtbmF6lXqZnrnG2h5KJkouRCLCLFaRkq2yxdLF0tH+4i7iLtJexorGiq6qksm64Z61goZZ3kXaLdItnfm1ycnJybX9oiwhoi22XcqRypH6pi6+LopGglp9gdWdpbl4I9xiwFYuHjIiOiI6IjoqPi4+LjoyOjo2OjY6Lj4ubkJmXl5eWmZGbi4+LjoyOjo2OjY6LjwiLj4mOiY6IjYiNh4tzi3eCenp6eoJ3i3MIDov3XRWLko2Sj5GouK+utqW3pbqYvouci5yJnIgIm6cFjY6NjI+LjIuNi42JjYqOio+JjomOiY6KjomOiY6JjoqNioyKjomMiYuHi4qLiouLCHdnbVVjQ2NDbVV3Zwh9cgWJiIiJiIuJi36SdJiIjYmOi46LjY+UlJlvl3KcdJ90oHeie6WHkYmSi5IIsIsVqlq0Z711CKGzBXqXfpqCnoKdhp6LoIuikaCWn2B1Z2luXgj3GLAVi4eMiI6IjoiOio+Lj4uOjI6OjY6NjouPi5uQmZeXl5aZkZuLj4uOjI6OjY6NjouPCIuPiY6JjoiNiI2Hi3OLd4J6enp6gneLcwji+10VoLAFtI+wmK2hrqKnqKKvdq1wp2uhCJ2rBZ1/nHycepx6mHqWeY+EjYWLhIuEiYWHhIR/gH1+fG9qaXJmeWV5Y4Jhiwi53BXb9yQFjIKMg4uEi3CDc3x1fHV3fHOBCA6L1BWL90sFi5WPlJKSkpKTj5aLCNmLBZKPmJqepJaZlZeVlY+Qj5ONl42WjpeOmI+YkZWTk5OSk46Vi5uLmYiYhZiFlIGSfgiSfo55i3WLeYd5gXgIvosFn4uchJl8mn2Seot3i3qGfIJ9jYSLhYuEi3yIfoR+i4eLh4uHi3eGen99i3CDdnt8CHt8dYNwiwhmiwV5i3mNeY95kHeRc5N1k36Ph4sIOYsFgIuDjoSShJKHlIuVCLCdFYuGjIePiI+Hj4mQi5CLj42Pj46OjY+LkIuQiZCIjoePh42Gi4aLh4mHh4eIioaLhgjUeRWUiwWNi46Lj4qOi4+KjYqOi4+Kj4mQio6KjYqNio+Kj4mQio6KjIqzfquEpIsIrosFr4uemouri5CKkYqQkY6QkI6SjpKNkouSi5KJkoiRlZWQlouYi5CKkImRiZGJj4iOCJGMkI+PlI+UjZKLkouViJODk4SSgo+CiwgmiwWLlpCalJ6UnpCbi5aLnoiYhJSFlH+QeYuGhoeDiYCJf4h/h3+IfoWBg4KHh4SCgH4Ii4qIiYiGh4aIh4mIiIiIh4eGh4aHh4eHiIiHiIeHiIiHiIeKh4mIioiLCIKLi/tLBQ6L90sVi/dLBYuVj5OSk5KSk46WiwjdiwWPi5iPoZOkk6CRnZCdj56Nn4sIq4sFpougg5x8m3yTd4txCIuJBZd8kHuLd4uHi4eLh5J+jn6LfIuEi4SJhZR9kHyLeot3hHp8fH19eoR3iwhYiwWVeI95i3mLdIh6hH6EfoKBfoV+hX2He4uBi4OPg5KFkYaTh5SHlYiTipOKk4qTiJMIiZSIkYiPgZSBl4CaeKR+moSPCD2LBYCLg4+EkoSSh5SLlQiw9zgVi4aMh4+Ij4ePiZCLkIuPjY+Pjo6Nj4uQi5CJkIiOh4+HjYaLhouHiYeHh4iKhouGCNT7OBWUiwWOi46Kj4mPio+IjoiPh4+IjoePiI+Hj4aPho6HjoiNiI6Hj4aOho6Ii4qWfpKDj4YIk4ORgY5+j36OgI1/jYCPg5CGnYuXj5GUkpSOmYuei5aGmoKfgp6GmouWCPCLBZSLlI+SkpOTjpOLlYuSiZKHlIeUho+Fi46PjY+NkY2RjJCLkIuYhpaBlY6RjZKLkgiLkomSiJKIkoaQhY6MkIyRi5CLm4aXgpOBkn6Pe4sIZosFcotrhGN9iouIioaJh4qHiomKiYqIioaKh4mHioiKiYuHioiLh4qIi4mLCIKLi/tLBQ77lIv3txWLkpCPlo0I9yOgzPcWBY6SkI+RiwiL/BL7FUcFh4mHioiLh4uIjImOiY6KjouPi4yLjYyOCKP3IyPwBYaQiZCLjwgOi/fFFYu1l6yjoqOjrZe2i5aLl4mYh5eHloWWhJaElIWShZOEkoWShJKSkpGTkpKRlJGWkgiWkpaRl4+Yj5eNlou2i61/o3OjdJdqi2GLYXVgYGAI+0b7QAWHiIeJhouGi4eNh44I+0b3QAWJjYmNh4+IjoaRg5SElIWVhZSFlYaWh5mGmImYi5gIsIsVi2ucaa9oCPc6+zT3OvczBa+vnK2Lq4ubiZiHl4eXhpSFkoSSg5GCj4KQgo2CjYONgYuBi4KLgIl/hoCGgIWChAiBg4OFhISEhYaFhoaIhoaJhYuFi4aNiJCGkIaRhJGEkoORgZOCkoCRgJB/kICNgosIgYuBi4OJgomCiYKGgoeDhYSEhYSGgod/h3+Jfot7CA77JouyFYv4BAWLkY2Rj5GOkJCPko2PjY+Mj4sI98CLBY+Lj4qPiZGJkIePho+FjYWLhQiL/AQFi4SJhYeGh4aGh4WIiIqGioeLgYuEjoSRCPsS9w37EvsNBYSFg4iCi4eLh4uHjYSOho+IkIeQiZGLkgiwkxX3JvchpHL3DfsIi/f3+7iLi/v3BQ5ni8sVi/c5BYuSjpKQkJCQko6Siwj3VIuLwgWLrpippKSkpKmYrouvi6l+pHKkcpdti2gIi0IFi4aKhoeIh4eHiYaLCHmLBYaLh42Hj4eOipCLkAiL1AWLn4OcfZp9mXqSdot3i3qEfX18fIR6i3cIi1SniwWSi5KIkIaQho6Ei4QIi/s5BYuDiIWGhoaFhImEiwj7p4sFhIuEjYaRhpCIkYuTCA5njPe6FYyQkI6UjQj3I6DM9xYFj5KPj5GLkIuQh4+ECMv7FvcjdgWUiZCIjYaNhoiFhYUIIyak+yMFjIWKhomHiYiIiYaLiIuHjIeNCPsUz/sVRwWHiYeKiIuHi4eNiY6Jj4uQjJEIo/cjI/AFhZGJkY2QCPeB+z0VnILlW3rxiJ6ZmNTS+wydgpxe54v7pwUOZ4vCFYv3SwWLkI2Pjo+Pjo+NkIsI3osFkIuPiY6Ij4eNh4uGCIv7SwWLhomHh4eIh4eKhosIOIsFhouHjIePiI+Jj4uQCLCvFYuGjIePh46IkImQi5CLj42Pjo6PjY+LkIuQiZCIjoePh42Gi4aLhomIh4eIioaLhgjvZxWL90sFi5CNj46Oj4+PjZCLj4ySkJWWlZaVl5SXmJuVl5GRjo6OkI6RjZCNkIyPjI6MkY2TCIySjJGMj4yPjZCOkY6RjpCPjo6Pj42Qi5SLk4qSiZKJkYiPiJCIjoiPho6GjYeMhwiNh4yGjIaMhYuHi4iLiIuHi4eLg4uEiYSJhImFiYeJh4mFh4WLioqJiomJiIqJiokIi4qKiIqJCNqLBZqLmIWWgJaAkH+LfIt6hn2Af46DjYSLhIt9h36Cf4+Bi3+HgImAhYKEhI12hnmAfgh/fXiDcosIZosFfot+jHyOfI5/joOOg41/j32Qc5N8j4SMhouHjYiOh4+Jj4uQCA5ni/c5FYuGjYaOiI+Hj4mQiwjeiwWQi4+Njo+Pjo2Qi5AIi/dKBYuQiZCHjoiPh42Giwg4iwWGi4eJh4eIiImGi4YIi/tKBbD3JhWLkIyPj4+OjpCNkIuQi4+Jj4iOh42Hi4aLhomHiIeHh4eKhouGi4aMiI+Hj4qPi5AI7/snFYv3SwWLkI2Qj46Oj4+NkIuSi5qPo5OZkJePk46TjZeOmo6ajpiMmIsIsIsFpIueg5d9ln6Qeol1koSRgo2Aj4CLgIeAlH+Pfot9i4WJhIiCloCQfIt7i3yFfoGACICAfoZ8iwg8iwWMiIyJi4mMiYyJjYmMiIyKi4mPhI2GjYeNh42GjYOMhIyEi4SLhouHi4iLiYuGioYIioWKhomHioeJh4iGh4eIh4aIh4iFiISJhImDioKLhouHjYiPh4+Ij4iRiJGJkIqPCIqPipGKkomTipGKj4qOiZCJkYiQiJCIjoWSgZZ+nIKXgZaBloGWhJGHi4aLh42HjwiIjomQi48IDviUFPiUFYsMCgAAAAADAgABkAAFAAABTAFmAAAARwFMAWYAAAD1ABkAhAAAAAAAAAAAAAAAAAAAAAEQAAAAAAAAAAAAAAAAAAAAAEAAAPFlAeD/4P/gAeAAIAAAAAEAAAAAAAAAAAAAACAAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAkAAAACAAIAAEAAAAAQAg5gXwBvAN8CPwLvBu8HDwivCX8JzxI/Fl//3//wAAAAAAIOYA8ATwDPAj8C7wbvBw8Ifwl/Cc8SPxZP/9//8AAf/jGgQQBhABD+wP4g+jD6IPjA+AD3wO9g62AAMAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAf//AA8AAQAAAAEAAJrVlLJfDzz1AAsCAAAAAADP/GODAAAAAM/8Y4MAAP/bAgAB2wAAAAgAAgAAAAAAAAABAAAB4P/gAAACAAAAAAACAAABAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAEAAAACAAAAAgAAAAIAAAACAAAAAgAAAAIAAAACAAAAAdwAAAHcAAACAAAjAZMAHwFJAAABbgAAAgAAAAIAAAACAAAAAgAAAAEAAAACAAAAAW4AAAHcAAAB3AABAdwAAAHcAAAAAFAAABwAAAAAAA4ArgABAAAAAAABAAwAAAABAAAAAAACAA4AQAABAAAAAAADAAwAIgABAAAAAAAEAAwATgABAAAAAAAFABYADAABAAAAAAAGAAYALgABAAAAAAAKADQAWgADAAEECQABAAwAAAADAAEECQACAA4AQAADAAEECQADAAwAIgADAAEECQAEAAwATgADAAEECQAFABYADAADAAEECQAGAAwANAADAAEECQAKADQAWgByAGEAdABpAG4AZwBWAGUAcgBzAGkAbwBuACAAMQAuADAAcgBhAHQAaQBuAGdyYXRpbmcAcgBhAHQAaQBuAGcAUgBlAGcAdQBsAGEAcgByAGEAdABpAG4AZwBGAG8AbgB0ACAAZwBlAG4AZQByAGEAdABlAGQAIABiAHkAIABJAGMAbwBNAG8AbwBuAC4AAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==) format(\'woff\');\n  font-weight: normal;\n  font-style: normal;\n}\n\n.ui.rating .icon {\n  font-family: \'Rating\';\n  line-height: 1;\n  height: 1em;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  font-weight: normal;\n  font-style: normal;\n  text-align: center;\n}\n\n/* Empty Star */\n\n.ui.rating .icon:before {\n  content: \'\f006\';\n}\n\n/* Active Star */\n\n.ui.rating .active.icon:before {\n  content: \'\f005\';\n}\n\n/*-------------------\n        Star\n--------------------*/\n\n/* Unfilled Star */\n\n.ui.star.rating .icon:before {\n  content: \'\f005\';\n}\n\n/* Active Star */\n\n.ui.star.rating .active.icon:before {\n  content: \'\f005\';\n}\n\n/* Partial */\n\n.ui.star.rating .partial.icon:before {\n  content: \'\f006\';\n}\n\n.ui.star.rating .partial.icon {\n  content: \'\f005\';\n}\n\n/*-------------------\n        Heart\n--------------------*/\n\n/* Empty Heart\n.ui.heart.rating .icon:before {\n  content: \'\f08a\';\n}\n*/\n\n.ui.heart.rating .icon:before {\n  content: \'\f004\';\n}\n\n/* Active */\n\n.ui.heart.rating .active.icon:before {\n  content: \'\f004\';\n}\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Search\n*******************************/\n\n.ui.search {\n  position: relative;\n}\n\n.ui.search > .prompt {\n  margin: 0em;\n  outline: none;\n  -webkit-appearance: none;\n  -webkit-tap-highlight-color: rgba(255, 255, 255, 0);\n  text-shadow: none;\n  font-style: normal;\n  font-weight: normal;\n  line-height: 1.2;\n  padding: 0.68571em 1em;\n  font-size: 1em;\n  background: #ffffff;\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  color: rgba(0, 0, 0, 0.8);\n  box-shadow: 0em 0em 0em 0em transparent inset;\n  -webkit-transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n}\n\n.ui.search .prompt {\n  border-radius: 500rem;\n}\n\n/*--------------\n     Icon\n---------------*/\n\n.ui.search .prompt ~ .search.icon {\n  cursor: pointer;\n}\n\n/*--------------\n    Results\n---------------*/\n\n.ui.search > .results {\n  display: none;\n  position: absolute;\n  top: 100%;\n  left: 0%;\n  background: #ffffff;\n  margin-top: 0.5em;\n  width: 16em;\n  border-radius: 0.25em;\n  box-shadow: 0px 1px 3px 1px rgba(0, 0, 0, 0.2);\n  z-index: 998;\n}\n\n/*--------------\n    Result\n---------------*/\n\n.ui.search > .results .result {\n  cursor: pointer;\n  display: block;\n  overflow: hidden;\n  font-size: 1em;\n  padding: 0.5em 1em;\n  color: rgba(0, 0, 0, 0.8);\n  line-height: 1.33;\n  border-bottom: 1px solid rgba(39, 41, 43, 0.15);\n}\n\n.ui.search > .results .result:last-child {\n  border-bottom: none;\n}\n\n/* Image */\n\n.ui.search > .results .result .image {\n  float: right;\n  overflow: hidden;\n  background: none;\n  width: 5em;\n  height: 3em;\n  border-radius: 0.25em;\n}\n\n.ui.search > .results .result .image img {\n  display: block;\n  width: auto;\n  height: 100%;\n}\n\n/*--------------\n      Info\n---------------*/\n\n.ui.search > .results .result .image + .content {\n  margin: 0em 6em 0em 0em;\n}\n\n.ui.search > .results .result .title {\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-weight: bold;\n  font-size: 1em;\n  color: rgba(0, 0, 0, 0.85);\n}\n\n.ui.search > .results .result .description {\n  margin-top: 0em;\n  font-size: 0.9285em;\n  color: rgba(0, 0, 0, 0.4);\n}\n\n.ui.search > .results .result .price {\n  float: right;\n  color: #5bbd72;\n}\n\n/*--------------\n    Message\n---------------*/\n\n.ui.search > .results > .message {\n  padding: 1em 1em;\n}\n\n.ui.search > .results > .message .header {\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-size: 1.1428em;\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.search > .results > .message .description {\n  margin-top: 0.25rem;\n  font-size: 1em;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* View All Results */\n\n.ui.search > .results > .action {\n  display: block;\n  border-top: none;\n  background: #f0f0f0;\n  padding: 0.5em 1em;\n  color: rgba(0, 0, 0, 0.8);\n  font-weight: bold;\n  text-align: center;\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------------\n       Loading\n---------------------*/\n\n.ui.loading.search .input > .icon:before {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: 50%;\n  margin: -0.64285em 0em 0em -0.64285em;\n  width: 1.2857em;\n  height: 1.2857em;\n  border-radius: 500rem;\n  border: 0.2em solid rgba(0, 0, 0, 0.1);\n}\n\n.ui.loading.search .input > .icon:after {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: 50%;\n  margin: -0.64285em 0em 0em -0.64285em;\n  width: 1.2857em;\n  height: 1.2857em;\n  -webkit-animation: button-spin 0.6s linear;\n  animation: button-spin 0.6s linear;\n  -webkit-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n  border-radius: 500rem;\n  border-color: #aaaaaa transparent transparent;\n  border-style: solid;\n  border-width: 0.2em;\n  box-shadow: 0px 0px 0px 1px transparent;\n}\n\n/*--------------\n      Hover\n---------------*/\n\n.ui.search > .results .result:hover,\n.ui.category.search > .results .category .result:hover {\n  background: #fafafa;\n}\n\n.ui.search .action:hover {\n  background: #e0e0e0;\n}\n\n/*--------------\n      Active\n---------------*/\n\n.ui.search > .results .category.active {\n  background: #f0f0f0;\n}\n\n.ui.search > .results .category.active > .name {\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.search > .results .result.active,\n.ui.category.search > .results .category .result.active {\n  position: relative;\n  border-left-color: transparent;\n  background: #f0f0f0;\n  box-shadow: 3px 0px 3px 0px rgba(39, 41, 43, 0.15);\n}\n\n.ui.search > .results .result.active .title {\n  color: rgba(0, 0, 0, 0.85);\n}\n\n.ui.search > .results .result.active .description {\n  color: rgba(0, 0, 0, 0.85);\n}\n\n/*******************************\n           Types\n*******************************/\n\n/*--------------\n    Categories\n---------------*/\n\n.ui.category.search .results {\n  width: 28em;\n}\n\n/* Category */\n\n.ui.category.search > .results .category {\n  background: #f0f0f0;\n  box-shadow: none;\n  border-bottom: 1px solid rgba(39, 41, 43, 0.15);\n  -webkit-transition: background 0.2s ease, border-color 0.2s ease;\n  transition: background 0.2s ease, border-color 0.2s ease;\n}\n\n.ui.category.search > .results .category:last-child {\n  border-bottom: none;\n}\n\n/* Category Result */\n\n.ui.category.search > .results .category .result {\n  background: #ffffff;\n  margin-left: 100px;\n  border-left: 1px solid rgba(39, 41, 43, 0.15);\n  border-bottom: 1px solid rgba(39, 41, 43, 0.15);\n  -webkit-transition: background 0.2s ease, border-color 0.2s ease;\n  transition: background 0.2s ease, border-color 0.2s ease;\n}\n\n.ui.category.search > .results .category .result:last-child {\n  border-bottom: none;\n}\n\n/* Category Result Name */\n\n.ui.category.search > .results .category > .name {\n  width: 100px;\n  background: #f0f0f0;\n  font-family: \'Lato\', \'Helvetica Neue\', Arial, Helvetica, sans-serif;\n  font-size: 1em;\n  float: 1em;\n  float: left;\n  padding: 0.4em 1em;\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.4);\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*-------------------\n     Left / Right\n--------------------*/\n\n.ui[class*="left aligned"].search > .results {\n  right: auto;\n  left: 0%;\n}\n\n.ui[class*="right aligned"].search > .results {\n  right: 0%;\n  left: auto;\n}\n\n/*--------------\n    Fluid\n---------------*/\n\n.ui.fluid.search .results {\n  width: 100%;\n}\n\n/*--------------\n      Sizes\n---------------*/\n\n.ui.search {\n  font-size: 1em;\n}\n\n.ui.large.search {\n  font-size: 1.1em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n              Shape\n*******************************/\n\n.ui.shape {\n  position: relative;\n  display: inline-block;\n  -webkit-perspective: 2000px;\n  perspective: 2000px;\n}\n\n.ui.shape .sides {\n  -webkit-transform-style: preserve-3d;\n  transform-style: preserve-3d;\n}\n\n.ui.shape .side {\n  opacity: 1;\n  width: 100%;\n  margin: 0em !important;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n}\n\n.ui.shape .side {\n  display: none;\n}\n\n.ui.shape .side > * {\n  -webkit-backface-visibility: visible !important;\n  backface-visibility: visible !important;\n}\n\n/*******************************\n             Types\n*******************************/\n\n.ui.cube.shape .side {\n  min-width: 15em;\n  height: 15em;\n  padding: 2em;\n  background-color: #e6e6e6;\n  color: rgba(0, 0, 0, 0.8);\n  box-shadow: 0px 0px 2px rgba(0, 0, 0, 0.3);\n}\n\n.ui.cube.shape .side > .content {\n  width: 100%;\n  height: 100%;\n  display: table;\n  text-align: center;\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n}\n\n.ui.cube.shape .side > .content > div {\n  display: table-cell;\n  vertical-align: middle;\n  font-size: 2em;\n}\n\n/*******************************\n          Variations\n*******************************/\n\n.ui.text.shape.animating .sides {\n  position: static;\n}\n\n.ui.text.shape .side {\n  white-space: nowrap;\n}\n\n.ui.text.shape .side > * {\n  white-space: normal;\n}\n\n/*******************************\n             States\n*******************************/\n\n/*--------------\n    Loading\n---------------*/\n\n.ui.loading.shape {\n  position: absolute;\n  top: -9999px;\n  left: -9999px;\n}\n\n/*--------------\n    Animating\n---------------*/\n\n.ui.shape .animating.side {\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  z-index: 100;\n}\n\n.ui.shape .hidden.side {\n  opacity: 0.4;\n}\n\n/*--------------\n      CSS\n---------------*/\n\n.ui.shape.animating {\n  -webkit-transition: all 0.6s ease-in-out;\n  transition: all 0.6s ease-in-out;\n}\n\n.ui.shape.animating .sides {\n  position: absolute;\n}\n\n.ui.shape.animating .sides {\n  -webkit-transition: all 0.6s ease-in-out;\n  transition: all 0.6s ease-in-out;\n}\n\n.ui.shape.animating .side {\n  -webkit-transition: opacity 0.6s ease-in-out;\n  transition: opacity 0.6s ease-in-out;\n}\n\n/*--------------\n     Active\n---------------*/\n\n.ui.shape .active.side {\n  display: block;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n        User Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Sidebar\n*******************************/\n\n/* Sidebar Menu */\n\n.ui.sidebar {\n  position: fixed;\n  top: 0;\n  left: 0;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  -webkit-transition: none;\n  transition: none;\n  will-change: transform;\n  -webkit-transform: translate3d(0, 0, 0);\n  transform: translate3d(0, 0, 0);\n  visibility: hidden;\n  -webkit-overflow-scrolling: touch;\n  height: 100% !important;\n  border-radius: 0em !important;\n  margin: 0em !important;\n  overflow-y: auto !important;\n  z-index: 102;\n}\n\n/* 3D Rendering */\n\n.ui.sidebar * {\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  -webkit-transform: rotateZ(0deg);\n  transform: rotateZ(0deg);\n}\n\n/*--------------\n   Direction\n---------------*/\n\n.ui.left.sidebar {\n  right: auto;\n  left: 0px;\n  -webkit-transform: translate3d(-100%, 0, 0);\n  transform: translate3d(-100%, 0, 0);\n}\n\n.ui.right.sidebar {\n  right: 0px !important;\n  left: auto !important;\n  -webkit-transform: translate3d(100%, 0%, 0);\n  transform: translate3d(100%, 0%, 0);\n}\n\n.ui.top.sidebar,\n.ui.bottom.sidebar {\n  width: 100% !important;\n  height: auto !important;\n  overflow-y: visible !important;\n}\n\n.ui.top.sidebar {\n  top: 0px !important;\n  bottom: auto !important;\n  -webkit-transform: translate3d(0, -100%, 0);\n  transform: translate3d(0, -100%, 0);\n}\n\n.ui.bottom.sidebar {\n  top: auto !important;\n  bottom: 0px !important;\n  -webkit-transform: translate3d(0, 100%, 0);\n  transform: translate3d(0, 100%, 0);\n}\n\n/*--------------\n     Body\n---------------*/\n\n.pushable {\n  height: 100%;\n  overflow-x: hidden;\n  background: #333333 !important;\n}\n\n/*--------------\n     Fixed\n---------------*/\n\n.pushable > .fixed {\n  position: fixed;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  -webkit-transition: -webkit-transform 500ms ease;\n  transition: transform 500ms ease;\n  will-change: transform;\n  z-index: 101;\n}\n\n/*--------------\n     Page\n---------------*/\n\n.pushable > .pusher {\n  position: relative;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  min-height: 100%;\n  -webkit-transition: -webkit-transform 500ms ease;\n  transition: transform 500ms ease;\n  background: #f7f7f7;\n  z-index: 2;\n}\n\n/*--------------\n     Dimmer\n---------------*/\n\n.pushable > .pusher:after {\n  position: fixed;\n  top: 0px;\n  right: 0px;\n  content: \'\';\n  background-color: rgba(0, 0, 0, 0.4);\n  width: 0px;\n  height: 0px;\n  overflow: hidden;\n  opacity: 0;\n  -webkit-transition: -webkit-transform 500ms, opacity 500ms;\n  transition: transform 500ms, opacity 500ms;\n  will-change: opacity;\n  z-index: 1000;\n}\n\n/*--------------\n    Coupling\n---------------*/\n\n.ui.sidebar.menu .item {\n  border-radius: 0em !important;\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------\n     Dimmed\n---------------*/\n\n.pushable > .pusher.dimmed:after {\n  width: 100% !important;\n  height: 100% !important;\n  opacity: 1 !important;\n}\n\n/*--------------\n     Animating\n---------------*/\n\n.ui.animating.sidebar {\n  visibility: visible;\n}\n\n/*--------------\n     Visible\n---------------*/\n\n.ui.visible.sidebar {\n  visibility: visible;\n}\n\n.ui.left.visible.sidebar,\n.ui.right.visible.sidebar {\n  box-shadow: 0px 0px 20px rgba(39, 41, 43, 0.15);\n}\n\n.ui.top.visible.sidebar,\n.ui.bottom.visible.sidebar {\n  box-shadow: 0px 0px 20px rgba(39, 41, 43, 0.15);\n}\n\n/*--------------\n     Mobile\n---------------*/\n\n@media only screen and (max-width: 992px) {\n  html {\n    overflow-x: hidden;\n    -webkit-overflow-scrolling: touch;\n  }\n}\n\n/*******************************\n          Variations\n*******************************/\n\n/*--------------\n     Width\n---------------*/\n\n/* Left / Right */\n\n.ui[class*="very thin"].left.sidebar,\n.ui[class*="very thin"].right.sidebar {\n  width: 60px;\n}\n\n.ui.thin.left.sidebar,\n.ui.thin.right.sidebar {\n  width: 150px;\n}\n\n.ui.left.sidebar,\n.ui.right.sidebar {\n  width: 260px;\n}\n\n.ui.wide.left.sidebar,\n.ui.wide.right.sidebar {\n  width: 350px;\n}\n\n.ui[class*="very wide"].left.sidebar,\n.ui[class*="very wide"].right.sidebar {\n  width: 475px;\n}\n\n/*******************************\n          Animations\n*******************************/\n\n/*--------------\n    Overlay\n---------------*/\n\n/* Set-up */\n\n.ui.overlay.sidebar {\n  z-index: 102;\n}\n\n/* Animation */\n\n.animating.ui.overlay.sidebar,\n.ui.visible.overlay.sidebar {\n  -webkit-transition: -webkit-transform 500ms ease;\n  transition: transform 500ms ease;\n}\n\n/*--- Left ---*/\n\n/* Set-up */\n\n.ui.left.overlay.sidebar {\n  -webkit-transform: translate3d(-100%, 0%, 0);\n  transform: translate3d(-100%, 0%, 0);\n}\n\n.ui.right.overlay.sidebar {\n  -webkit-transform: translate3d(100%, 0%, 0);\n  transform: translate3d(100%, 0%, 0);\n}\n\n.ui.top.overlay.sidebar {\n  -webkit-transform: translate3d(0%, -100%, 0);\n  transform: translate3d(0%, -100%, 0);\n}\n\n.ui.bottom.overlay.sidebar {\n  -webkit-transform: translate3d(0%, 100%, 0);\n  transform: translate3d(0%, 100%, 0);\n}\n\n/* End */\n\n.ui.visible.left.overlay.sidebar {\n  -webkit-transform: translate3d(0%, 0%, 0);\n  transform: translate3d(0%, 0%, 0);\n}\n\n.ui.visible.right.overlay.sidebar {\n  -webkit-transform: translate3d(0%, 0%, 0);\n  transform: translate3d(0%, 0%, 0);\n}\n\n.ui.visible.top.overlay.sidebar {\n  -webkit-transform: translate3d(0%, 0%, 0);\n  transform: translate3d(0%, 0%, 0);\n}\n\n.ui.visible.bottom.overlay.sidebar {\n  -webkit-transform: translate3d(0%, 0%, 0);\n  transform: translate3d(0%, 0%, 0);\n}\n\n.ui.visible.overlay.sidebar ~ .fixed,\n.ui.visible.overlay.sidebar ~ .pusher {\n  -webkit-transform: none !important;\n  -ms-transform: none !important;\n  transform: none !important;\n}\n\n/*--------------\n      Push\n---------------*/\n\n/* Initial */\n\n.ui.push.sidebar {\n  -webkit-transition: -webkit-transform 500ms ease;\n  transition: transform 500ms ease;\n  z-index: 102;\n}\n\n.ui.left.push.sidebar {\n  -webkit-transform: translate3d(-100%, 0, 0);\n  transform: translate3d(-100%, 0, 0);\n}\n\n.ui.right.push.sidebar {\n  -webkit-transform: translate3d(100%, 0, 0);\n  transform: translate3d(100%, 0, 0);\n}\n\n.ui.top.push.sidebar {\n  -webkit-transform: translate3d(0%, -100%, 0);\n  transform: translate3d(0%, -100%, 0);\n}\n\n.ui.bottom.push.sidebar {\n  -webkit-transform: translate3d(0%, 100%, 0);\n  transform: translate3d(0%, 100%, 0);\n}\n\n/* End */\n\n.ui.visible.push.sidebar {\n  -webkit-transform: translate3d(0%, 0, 0);\n  transform: translate3d(0%, 0, 0);\n}\n\n/*--------------\n    Uncover\n---------------*/\n\n/* Initial */\n\n.ui.uncover.sidebar {\n  -webkit-transform: translate3d(0, 0, 0);\n  transform: translate3d(0, 0, 0);\n  z-index: 1;\n}\n\n/* End */\n\n.ui.visible.uncover.sidebar {\n  -webkit-transform: translate3d(0, 0, 0);\n  transform: translate3d(0, 0, 0);\n  -webkit-transition: -webkit-transform 500ms ease;\n  transition: transform 500ms ease;\n}\n\n/*--------------\n   Slide Along\n---------------*/\n\n/* Initial */\n\n.ui.slide.along.sidebar {\n  z-index: 1;\n}\n\n.ui.left.slide.along.sidebar {\n  -webkit-transform: translate3d(-50%, 0, 0);\n  transform: translate3d(-50%, 0, 0);\n}\n\n.ui.right.slide.along.sidebar {\n  -webkit-transform: translate3d(50%, 0, 0);\n  transform: translate3d(50%, 0, 0);\n}\n\n.ui.top.slide.along.sidebar {\n  -webkit-transform: translate3d(0, -50%, 0);\n  transform: translate3d(0, -50%, 0);\n}\n\n.ui.bottom.slide.along.sidebar {\n  -webkit-transform: translate3d(0%, 50%, 0);\n  transform: translate3d(0%, 50%, 0);\n}\n\n.ui.animating.slide.along.sidebar {\n  -webkit-transition: -webkit-transform 500ms ease;\n  transition: transform 500ms ease;\n}\n\n/* End */\n\n.ui.visible.slide.along.sidebar {\n  -webkit-transform: translate3d(0%, 0, 0);\n  transform: translate3d(0%, 0, 0);\n}\n\n/*--------------\n   Slide Out\n---------------*/\n\n/* Initial */\n\n.ui.slide.out.sidebar {\n  z-index: 1;\n}\n\n.ui.left.slide.out.sidebar {\n  -webkit-transform: translate3d(50%, 0, 0);\n  transform: translate3d(50%, 0, 0);\n}\n\n.ui.right.slide.out.sidebar {\n  -webkit-transform: translate3d(-50%, 0, 0);\n  transform: translate3d(-50%, 0, 0);\n}\n\n.ui.top.slide.out.sidebar {\n  -webkit-transform: translate3d(0%, 50%, 0);\n  transform: translate3d(0%, 50%, 0);\n}\n\n.ui.bottom.slide.out.sidebar {\n  -webkit-transform: translate3d(0%, -50%, 0);\n  transform: translate3d(0%, -50%, 0);\n}\n\n/* Animation */\n\n.ui.animating.slide.out.sidebar {\n  -webkit-transition: -webkit-transform 500ms ease;\n  transition: transform 500ms ease;\n}\n\n/* End */\n\n.ui.visible.slide.out.sidebar {\n  -webkit-transform: translate3d(0%, 0, 0);\n  transform: translate3d(0%, 0, 0);\n}\n\n/*--------------\n   Scale Down\n---------------*/\n\n/* Initial */\n\n.ui.scale.down.sidebar {\n  -webkit-transition: -webkit-transform 500ms ease;\n  transition: transform 500ms ease;\n  z-index: 102;\n}\n\n.ui.left.scale.down.sidebar {\n  -webkit-transform: translate3d(-100%, 0, 0);\n  transform: translate3d(-100%, 0, 0);\n}\n\n.ui.right.scale.down.sidebar {\n  -webkit-transform: translate3d(100%, 0, 0);\n  transform: translate3d(100%, 0, 0);\n}\n\n.ui.top.scale.down.sidebar {\n  -webkit-transform: translate3d(0%, -100%, 0);\n  transform: translate3d(0%, -100%, 0);\n}\n\n.ui.bottom.scale.down.sidebar {\n  -webkit-transform: translate3d(0%, 100%, 0);\n  transform: translate3d(0%, 100%, 0);\n}\n\n.ui.scale.down.left.sidebar ~ .pusher {\n  -webkit-transform-origin: 75% 50%;\n  -ms-transform-origin: 75% 50%;\n  transform-origin: 75% 50%;\n}\n\n.ui.scale.down.right.sidebar ~ .pusher {\n  -webkit-transform-origin: 25% 50%;\n  -ms-transform-origin: 25% 50%;\n  transform-origin: 25% 50%;\n}\n\n.ui.scale.down.top.sidebar ~ .pusher {\n  -webkit-transform-origin: 50% 75%;\n  -ms-transform-origin: 50% 75%;\n  transform-origin: 50% 75%;\n}\n\n.ui.scale.down.bottom.sidebar ~ .pusher {\n  -webkit-transform-origin: 50% 25%;\n  -ms-transform-origin: 50% 25%;\n  transform-origin: 50% 25%;\n}\n\n/* Animation */\n\n.ui.animating.scale.down > .visible.ui.sidebar {\n  -webkit-transition: -webkit-transform 500ms ease;\n  transition: transform 500ms ease;\n}\n\n.ui.visible.scale.down.sidebar ~ .pusher,\n.ui.animating.scale.down.sidebar ~ .pusher {\n  display: block !important;\n  width: 100%;\n  height: 100%;\n  overflow: hidden;\n}\n\n/* End */\n\n.ui.visible.scale.down.sidebar {\n  -webkit-transform: translate3d(0, 0, 0);\n  transform: translate3d(0, 0, 0);\n}\n\n.ui.visible.scale.down.sidebar ~ .pusher {\n  -webkit-transform: scale(0.75);\n  -ms-transform: scale(0.75);\n  transform: scale(0.75);\n}\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Sticky\n*******************************/\n\n.ui.sticky {\n  position: static;\n  -webkit-transition: width 0.2s ease, height 0.2s ease, top 0.2s ease, bottom 0.2s ease;\n  transition: width 0.2s ease, height 0.2s ease, top 0.2s ease, bottom 0.2s ease;\n  z-index: 800;\n}\n\n/*******************************\n            States\n*******************************/\n\n/* Bound */\n\n.ui.sticky.bound {\n  position: absolute;\n  left: auto;\n  right: auto;\n}\n\n/* Fixed */\n\n.ui.sticky.fixed {\n  position: fixed;\n  left: auto;\n  right: auto;\n}\n\n/* Bound/Fixed Position */\n\n.ui.sticky.bound.top,\n.ui.sticky.fixed.top {\n  top: 0px;\n  bottom: auto;\n}\n\n.ui.sticky.bound.bottom,\n.ui.sticky.fixed.bottom {\n  top: auto;\n  bottom: 0px;\n}\n\n/*******************************\n            Types\n*******************************/\n\n.ui.native.sticky {\n  position: -webkit-sticky;\n  position: -moz-sticky;\n  position: -ms-sticky;\n  position: -o-sticky;\n  position: sticky;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n           UI Tabs\n*******************************/\n\n.ui.tab {\n  display: none;\n}\n\n/*******************************\n             States\n*******************************/\n\n/*--------------------\n       Active\n---------------------*/\n\n.ui.tab.active,\n.ui.tab.open {\n  display: block;\n}\n\n/*--------------------\n       Loading\n---------------------*/\n\n.ui.tab.loading {\n  position: relative;\n  overflow: hidden;\n  display: block;\n  min-height: 250px;\n}\n\n.ui.tab.loading * {\n  position: relative !important;\n  left: -10000px !important;\n}\n\n.ui.tab.loading:before,\n.ui.tab.loading.segment:before {\n  position: absolute;\n  content: \'\';\n  top: 100px;\n  left: 50%;\n  margin: -1.25em 0em 0em -1.25em;\n  width: 2.5em;\n  height: 2.5em;\n  border-radius: 500rem;\n  border: 0.2em solid rgba(0, 0, 0, 0.1);\n}\n\n.ui.tab.loading:after,\n.ui.tab.loading.segment:after {\n  position: absolute;\n  content: \'\';\n  top: 100px;\n  left: 50%;\n  margin: -1.25em 0em 0em -1.25em;\n  width: 2.5em;\n  height: 2.5em;\n  -webkit-animation: button-spin 0.6s linear;\n  animation: button-spin 0.6s linear;\n  -webkit-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n  border-radius: 500rem;\n  border-color: #aaaaaa transparent transparent;\n  border-style: solid;\n  border-width: 0.2em;\n  box-shadow: 0px 0px 0px 1px transparent;\n}\n\n/*******************************\n         Tab Overrides\n*******************************/\n\n/*******************************\n        User Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n             Table\n*******************************/\n\n/* Prototype */\n\n.ui.table {\n  width: 100%;\n  background: #ffffff;\n  margin: 1em 0em;\n  border: 1px solid #d0d0d0;\n  box-shadow: none;\n  border-radius: 0.25rem;\n  color: rgba(0, 0, 0, 0.8);\n  border-collapse: separate;\n  border-spacing: 0px;\n}\n\n.ui.table:first-child {\n  margin-top: 0em;\n}\n\n.ui.table:last-child {\n  margin-bottom: 0em;\n}\n\n/*******************************\n             Parts\n*******************************/\n\n/* Table Content */\n\n.ui.table th,\n.ui.table td {\n  -webkit-transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;\n  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;\n}\n\n/* Headers */\n\n.ui.table thead {\n  box-shadow: none;\n}\n\n.ui.table thead th {\n  cursor: auto;\n  background: #f0f0f0;\n  text-align: left;\n  color: rgba(0, 0, 0, 0.8);\n  padding: 0.7em 0.8em;\n  vertical-align: middle;\n  font-style: none;\n  font-weight: bold;\n  text-transform: none;\n  border-bottom: 1px solid #d4d4d5;\n  border-left: none;\n}\n\n.ui.table thead th:first-child {\n  border-radius: 0.25rem 0em 0em 0em;\n  border-left: none;\n}\n\n.ui.table thead th:last-child {\n  border-radius: 0em 0.25rem 0em 0em;\n}\n\n.ui.table thead th:only-child {\n  border-radius: 0.25rem 0.25rem 0em 0em;\n}\n\n/* Footer */\n\n.ui.table tfoot {\n  box-shadow: none;\n}\n\n.ui.table tfoot th {\n  cursor: auto;\n  border-top: 1px solid #d4d4d5;\n  background: #ffffff;\n  text-align: left;\n  color: rgba(0, 0, 0, 0.8);\n  padding: 0.7em 0.8em;\n  vertical-align: middle;\n  font-style: normal;\n  font-weight: normal;\n  text-transform: none;\n}\n\n.ui.table tfoot th:first-child {\n  border-radius: 0em 0em 0em 0.25rem;\n}\n\n.ui.table tfoot th:last-child {\n  border-radius: 0em 0em 0.25rem 0em;\n}\n\n.ui.table tfoot th:only-child {\n  border-radius: 0em 0em 0.25rem 0.25rem;\n}\n\n/* Table Row */\n\n.ui.table tr td {\n  border-top: 1px solid #d4d4d5;\n}\n\n.ui.table tr:first-child td {\n  border-top: none;\n}\n\n/* Table Cells */\n\n.ui.table td {\n  padding: 0.7em 0.8em;\n  text-align: left;\n  vertical-align: middle;\n}\n\n/* Icons */\n\n.ui.table > .icon {\n  vertical-align: baseline;\n}\n\n.ui.table > .icon:only-child {\n  margin: 0em;\n}\n\n/* Table Segment */\n\n.ui.table.segment {\n  padding: 0em;\n}\n\n.ui.table.segment:after {\n  display: none;\n}\n\n.ui.table.segment.stacked:after {\n  display: block;\n}\n\n/* Responsive */\n\n@media only screen and (max-width: 768px) {\n  .ui.table {\n    display: block;\n    padding: 0em;\n  }\n\n  .ui.table thead {\n    display: block;\n  }\n\n  .ui.table tfoot {\n    display: block;\n  }\n\n  .ui.table tbody {\n    display: block;\n  }\n\n  .ui.table tr {\n    display: block;\n  }\n\n  .ui.table tr > th,\n  .ui.table tr > td {\n    background: none;\n    width: 100% !important;\n    display: block;\n    border: none !important;\n    padding: 0.25em 0.75em;\n    box-shadow: none;\n  }\n\n  .ui.table th:first-child,\n  .ui.table td:first-child {\n    font-weight: bold;\n    padding-top: 1em;\n  }\n\n  .ui.table th:last-child,\n  .ui.table td:last-child {\n    box-shadow: 0px -1px 0px 0px rgba(0, 0, 0, 0.1) inset;\n    padding-bottom: 1em;\n  }\n\n  /* Clear BG Colors */\n\n  .ui.table tr > td.warning,\n  .ui.table tr > td.error,\n  .ui.table tr > td.active,\n  .ui.table tr > td.positive,\n  .ui.table tr > td.negative {\n    background-color: transparent !important;\n  }\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*--------------\n   Definition\n---------------*/\n\n.ui.definition.table thead:not(.full-width) th:first-child {\n  pointer-events: none;\n  background: transparent;\n  font-weight: normal;\n  color: rgba(0, 0, 0, 0.4);\n  box-shadow: -1px -1px 0px 1px #ffffff;\n}\n\n.ui.definition.table tfoot:not(.full-width) th:first-child {\n  pointer-events: none;\n  background: transparent;\n  font-weight: rgba(0, 0, 0, 0.4);\n  color: normal;\n  box-shadow: 1px 1px 0px 1px #ffffff;\n}\n\n/* Remove Border */\n\n.ui.celled.definition.table thead:not(.full-width) th:first-child {\n  box-shadow: 0px -1px 0px 1px #ffffff;\n}\n\n.ui.celled.definition.table tfoot:not(.full-width) th:first-child {\n  box-shadow: 0px 1px 0px 1px #ffffff;\n}\n\n/* Highlight Defining Column */\n\n.ui.definition.table tr td:first-child {\n  background: rgba(0, 0, 0, 0.03);\n  font-weight: bold;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Fix 2nd Column */\n\n.ui.definition.table thead:not(.full-width) th:nth-child(2) {\n  border-left: 1px solid #d0d0d0;\n}\n\n.ui.definition.table tfoot:not(.full-width) th:nth-child(2) {\n  border-left: 1px solid #d0d0d0;\n}\n\n.ui.definition.table td:nth-child(2) {\n  border-left: 1px solid #d0d0d0;\n}\n\n/*******************************\n             States\n*******************************/\n\n/*--------------\n    Positive\n---------------*/\n\n.ui.table tr.positive,\n.ui.table td.positive {\n  box-shadow: 0px 0px 0px #b7caa7 inset;\n}\n\n.ui.table tr.positive td,\n.ui.table td.positive {\n  background: #eeffe7 !important;\n  color: #3c763d !important;\n}\n\n.ui.celled.table tr.positive:hover td,\n.ui.celled.table tr:hover td.positive {\n  background: #e3ffd8 !important;\n  color: #376c38 !important;\n}\n\n/*--------------\n     Negative\n---------------*/\n\n.ui.table tr.negative,\n.ui.table td.negative {\n  box-shadow: 0px 0px 0px #dbb1b1 inset;\n}\n\n.ui.table tr.negative td,\n.ui.table td.negative {\n  background: #fff0f0 !important;\n  color: #cd2929 !important;\n}\n\n.ui.celled.table tr.negative:hover td,\n.ui.celled.table tr:hover td.negative {\n  background: #ffe1e1 !important;\n  color: #c02626 !important;\n}\n\n/*--------------\n      Error\n---------------*/\n\n.ui.table tr.error,\n.ui.table td.error {\n  box-shadow: 0px 0px 0px #dbb1b1 inset;\n}\n\n.ui.table tr.error td,\n.ui.table td.error {\n  background: #fff0f0 !important;\n  color: #cd2929 !important;\n}\n\n.ui.celled.table tr.error:hover td,\n.ui.celled.table tr:hover td.error {\n  background: #ffe1e1 !important;\n  color: #c02626 !important;\n}\n\n/*--------------\n     Warning\n---------------*/\n\n.ui.table tr.warning,\n.ui.table td.warning {\n  box-shadow: 0px 0px 0px #d9caab inset;\n}\n\n.ui.table tr.warning td,\n.ui.table td.warning {\n  background: #fffbe6 !important;\n  color: #7d6c00 !important;\n}\n\n.ui.celled.table tr.warning:hover td,\n.ui.celled.table tr:hover td.warning {\n  background: #fff9d7 !important;\n  color: #6e5f00 !important;\n}\n\n/*--------------\n     Active\n---------------*/\n\n.ui.table tr.active,\n.ui.table td.active {\n  box-shadow: 0px 0px 0px rgba(50, 50, 50, 0.9) inset;\n}\n\n.ui.table tr.active td,\n.ui.table td.active {\n  background: #e0e0e0 !important;\n  color: rgba(50, 50, 50, 0.9) !important;\n}\n\n.ui.celled.table tr.active:hover td,\n.ui.celled.table tr:hover td.active {\n  background: #e0e0e0 !important;\n  color: rgba(50, 50, 50, 0.9) !important;\n}\n\n/*--------------\n     Disabled\n---------------*/\n\n.ui.table tr.disabled td,\n.ui.table tr td.disabled,\n.ui.table tr.disabled:hover td,\n.ui.table tr:hover td.disabled {\n  pointer-events: none;\n  color: rgba(40, 40, 40, 0.3);\n}\n\n/*******************************\n          Variations\n*******************************/\n\n/*--------------\n     Aligned\n---------------*/\n\n.ui.table[class*="left aligned"],\n.ui.table [class*="left aligned"] {\n  text-align: left;\n}\n\n.ui.table[class*="center aligned"],\n.ui.table [class*="center aligned"] {\n  text-align: center;\n}\n\n.ui.table[class*="right aligned"],\n.ui.table [class*="right aligned"] {\n  text-align: right;\n}\n\n/*--------------\n    Collapsing\n---------------*/\n\n.ui.table th.collapsing,\n.ui.table td.collapsing {\n  width: 1px;\n  white-space: nowrap;\n}\n\n/*--------------\n     Attached\n---------------*/\n\n/* All */\n\n.ui.attached.table {\n  width: -webkit-calc(100% +  2px );\n  width: calc(100% +  2px );\n  margin: 0em -1px;\n  border-radius: 0px;\n  box-shadow: none;\n}\n\n/* Top */\n\n.ui[class*="top attached"].table {\n  margin-top: 1em 0em;\n  border-radius: 0.25rem 0.25rem 0em 0em;\n}\n\n.ui.table[class*="top attached"]:first-child {\n  margin-top: 0em;\n}\n\n/* Bottom */\n\n.ui.table[class*="bottom attached"] {\n  margin-top: 0em;\n  margin-bottom: 1em 0em;\n  border-radius: 0em 0em 0.25rem 0.25rem;\n}\n\n.ui.table[class*="bottom attached"]:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------\n     Striped\n---------------*/\n\n/* Table Striping */\n\n.ui.striped.table > tr:nth-child(2n),\n.ui.striped.table tbody tr:nth-child(2n) {\n  background-color: rgba(0, 0, 50, 0.03);\n}\n\n/* Stripes */\n\n.ui.inverted.striped.table > tr:nth-child(2n),\n.ui.inverted.striped.table tbody tr:nth-child(2n) {\n  background-color: rgba(255, 255, 255, 0.06);\n}\n\n/*-------------------\n       Colors\n--------------------*/\n\n.ui.black.table {\n  border-top: 0.2em solid #1b1c1d;\n}\n\n.ui.blue.table {\n  border-top: 0.2em solid #3b83c0;\n}\n\n.ui.green.table {\n  border-top: 0.2em solid #5bbd72;\n}\n\n.ui.orange.table {\n  border-top: 0.2em solid #e07b53;\n}\n\n.ui.pink.table {\n  border-top: 0.2em solid #d9499a;\n}\n\n.ui.purple.table {\n  border-top: 0.2em solid #564f8a;\n}\n\n.ui.red.table {\n  border-top: 0.2em solid #d95c5c;\n}\n\n.ui.teal.table {\n  border-top: 0.2em solid #00b5ad;\n}\n\n.ui.yellow.table {\n  border-top: 0.2em solid #f2c61f;\n}\n\n/*-------------------\n   Inverted Colors\n--------------------*/\n\n.ui.inverted.table,\n.ui.inverted.black.table {\n  background-color: #1b1c1d !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.blue.table {\n  background-color: #3b83c0 !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.green.table {\n  background-color: #5bbd72 !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.orange.table {\n  background-color: #e07b53 !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.pink.table {\n  background-color: #d9499a !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.purple.table {\n  background-color: #564f8a !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.red.table {\n  background-color: #d95c5c !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.teal.table {\n  background-color: #00b5ad !important;\n  color: #ffffff !important;\n}\n\n.ui.inverted.yellow.table {\n  background-color: #f2c61f !important;\n  color: #ffffff !important;\n}\n\n/*--------------\n  Column Count\n---------------*/\n\n/* Grid Based */\n\n.ui.one.column.table td {\n  width: 100%;\n}\n\n.ui.two.column.table td {\n  width: 50%;\n}\n\n.ui.three.column.table td {\n  width: 33.33333333%;\n}\n\n.ui.four.column.table td {\n  width: 25%;\n}\n\n.ui.five.column.table td {\n  width: 20%;\n}\n\n.ui.six.column.table td {\n  width: 16.66666667%;\n}\n\n.ui.seven.column.table td {\n  width: 14.28571429%;\n}\n\n.ui.eight.column.table td {\n  width: 12.5%;\n}\n\n.ui.nine.column.table td {\n  width: 11.11111111%;\n}\n\n.ui.ten.column.table td {\n  width: 10%;\n}\n\n.ui.eleven.column.table td {\n  width: 9.09090909%;\n}\n\n.ui.twelve.column.table td {\n  width: 8.33333333%;\n}\n\n.ui.thirteen.column.table td {\n  width: 7.69230769%;\n}\n\n.ui.fourteen.column.table td {\n  width: 7.14285714%;\n}\n\n.ui.fifteen.column.table td {\n  width: 6.66666667%;\n}\n\n.ui.sixteen.column.table td {\n  width: 6.25%;\n}\n\n/* Column Width */\n\n.ui.table th.one.wide,\n.ui.table td.one.wide {\n  width: 6.25%;\n}\n\n.ui.table th.two.wide,\n.ui.table td.two.wide {\n  width: 12.5%;\n}\n\n.ui.table th.three.wide,\n.ui.table td.three.wide {\n  width: 18.75%;\n}\n\n.ui.table th.four.wide,\n.ui.table td.four.wide {\n  width: 25%;\n}\n\n.ui.table th.five.wide,\n.ui.table td.five.wide {\n  width: 31.25%;\n}\n\n.ui.table th.six.wide,\n.ui.table td.six.wide {\n  width: 37.5%;\n}\n\n.ui.table th.seven.wide,\n.ui.table td.seven.wide {\n  width: 43.75%;\n}\n\n.ui.table th.eight.wide,\n.ui.table td.eight.wide {\n  width: 50%;\n}\n\n.ui.table th.nine.wide,\n.ui.table td.nine.wide {\n  width: 56.25%;\n}\n\n.ui.table th.ten.wide,\n.ui.table td.ten.wide {\n  width: 62.5%;\n}\n\n.ui.table th.eleven.wide,\n.ui.table td.eleven.wide {\n  width: 68.75%;\n}\n\n.ui.table th.twelve.wide,\n.ui.table td.twelve.wide {\n  width: 75%;\n}\n\n.ui.table th.thirteen.wide,\n.ui.table td.thirteen.wide {\n  width: 81.25%;\n}\n\n.ui.table th.fourteen.wide,\n.ui.table td.fourteen.wide {\n  width: 87.5%;\n}\n\n.ui.table th.fifteen.wide,\n.ui.table td.fifteen.wide {\n  width: 93.75%;\n}\n\n.ui.table th.sixteen.wide,\n.ui.table td.sixteen.wide {\n  width: 100%;\n}\n\n/*--------------\n    Sortable\n---------------*/\n\n.ui.sortable.table thead th {\n  cursor: pointer;\n  white-space: nowrap;\n  border-left: 1px solid #d0d0d0;\n  color: rgba(0, 0, 0, 0.8);\n}\n\n.ui.sortable.table thead th:first-child {\n  border-left: none;\n}\n\n.ui.sortable.table thead th.sorted,\n.ui.sortable.table thead th.sorted:hover {\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n}\n\n.ui.sortable.table thead th:after {\n  display: inline-block;\n  content: \'\';\n  width: 1em;\n  height: 1em;\n  opacity: 0.8;\n  margin: 0em 0em 0em 0.5em;\n  font-family: \'Icons\';\n  font-style: normal;\n  font-weight: normal;\n  text-decoration: inherit;\n}\n\n.ui.sortable.table thead th.ascending:after {\n  content: \'\f0d7\';\n}\n\n.ui.sortable.table thead th.descending:after {\n  content: \'\f0d8\';\n}\n\n/* Hover */\n\n.ui.sortable.table th.disabled:hover {\n  cursor: auto;\n  color: rgba(40, 40, 40, 0.3);\n}\n\n.ui.sortable.table thead th:hover {\n  background: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Sorted */\n\n.ui.sortable.table thead th.sorted {\n  background: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Sorted Hover */\n\n.ui.sortable.table thead th.sorted:hover {\n  background: rgba(0, 0, 0, 0.05);\n  color: rgba(0, 0, 0, 0.8);\n}\n\n/* Inverted */\n\n.ui.inverted.sortable.table thead th.sorted {\n  background: rgba(255, 255, 255, 0.07) -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  background: rgba(255, 255, 255, 0.07) linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  color: #ffffff;\n}\n\n.ui.inverted.sortable.table thead th:hover {\n  background: rgba(255, 255, 255, 0.05) -webkit-linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  background: rgba(255, 255, 255, 0.05) linear-gradient(transparent, rgba(0, 0, 0, 0.05));\n  color: #ffffff;\n}\n\n.ui.inverted.sortable.table thead th {\n  border-left-color: transparent;\n}\n\n/*--------------\n    Inverted\n---------------*/\n\n/* Text Color */\n\n.ui.inverted.table {\n  background: #333333;\n  color: #ffffff;\n  border: none;\n}\n\n.ui.inverted.table th {\n  background-color: rgba(0, 0, 0, 0.15);\n  border-color: rgba(0, 0, 0, 0.2) !important;\n  color: rgba(255, 255, 255, 0.9);\n}\n\n.ui.inverted.table tr td {\n  border-color: rgba(0, 0, 0, 0.2) !important;\n}\n\n.ui.inverted.table tr.disabled td,\n.ui.inverted.table tr td.disabled,\n.ui.inverted.table tr.disabled:hover td,\n.ui.inverted.table tr:hover td.disabled {\n  pointer-events: none;\n  color: rgba(225, 225, 225, 0.3);\n}\n\n/* Definition */\n\n.ui.inverted.definition.table tfoot:not(.full-width) th:first-child,\n.ui.inverted.definition.table thead:not(.full-width) th:first-child {\n  background: #ffffff;\n}\n\n.ui.inverted.definition.table tr td:first-child {\n  background: rgba(255, 255, 255, 0.02);\n  color: #ffffff;\n}\n\n/*--------------\n   Collapsing\n---------------*/\n\n.ui.collapsing.table {\n  width: auto;\n}\n\n/*--------------\n      Basic\n---------------*/\n\n.ui.basic.table {\n  background: transparent;\n  border: 1px solid #d0d0d0;\n  box-shadow: none;\n}\n\n.ui.basic.table thead,\n.ui.basic.table tfoot {\n  box-shadow: none;\n}\n\n.ui.basic.table th {\n  background: transparent;\n  border-left: none;\n}\n\n.ui.basic.table tbody tr {\n  border-bottom: 1px solid rgba(0, 0, 0, 0.1);\n}\n\n.ui.basic.table td {\n  background: transparent;\n}\n\n.ui.basic.striped.table tbody tr:nth-child(2n) {\n  background-color: rgba(0, 0, 0, 0.05) !important;\n}\n\n/* Very Basic */\n\n.ui[class*="very basic"].table {\n  border: none;\n}\n\n.ui[class*="very basic"].table:not(.sortable):not(.striped) th,\n.ui[class*="very basic"].table:not(.sortable):not(.striped) td {\n  padding: 0.8em 0em;\n}\n\n.ui[class*="very basic"].table:not(.sortable):not(.striped) thead th {\n  padding-top: 0em;\n}\n\n.ui[class*="very basic"].table:not(.sortable):not(.striped) tbody tr:last-child td {\n  padding-bottom: 0em;\n}\n\n/*--------------\n     Celled\n---------------*/\n\n.ui.celled.table th,\n.ui.celled.table td {\n  border-left: 1px solid #d4d4d5;\n}\n\n.ui.celled.table th:first-child,\n.ui.celled.table td:first-child {\n  border-left: none;\n}\n\n/*--------------\n     Padded\n---------------*/\n\n.ui.padded.table th {\n  padding-left: 1em;\n  padding-right: 1em;\n}\n\n.ui.padded.table th,\n.ui.padded.table td {\n  padding: 1em 1em;\n}\n\n/* Very */\n\n.ui[class*="very padded"].table th {\n  padding-left: 1.5em;\n  padding-right: 1.5em;\n}\n\n.ui[class*="very padded"].table td {\n  padding: 1.5em 1.5em;\n}\n\n/*--------------\n     Compact\n---------------*/\n\n.ui.compact.table th {\n  padding-left: 0.7em;\n  padding-right: 0.7em;\n}\n\n.ui.compact.table td {\n  padding: 0.5em 0.7em;\n}\n\n/* Very */\n\n.ui[class*="very compact"].table th {\n  padding-left: 0.6em;\n  padding-right: 0.6em;\n}\n\n.ui[class*="very compact"].table td {\n  padding: 0.4em 0.6em;\n}\n\n/*--------------\n      Sizes\n---------------*/\n\n/* Small */\n\n.ui.small.table {\n  font-size: 0.9em;\n}\n\n/* Standard */\n\n.ui.table {\n  font-size: 1em;\n}\n\n/* Large */\n\n.ui.large.table {\n  font-size: 1.1em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n          Transitions\n*******************************/\n\n/*\n  Some transitions adapted from Animate CSS\n  https://github.com/daneden/animate.css\n*/\n\n.transition {\n  -webkit-animation-iteration-count: 1;\n  animation-iteration-count: 1;\n  -webkit-animation-duration: 500ms;\n  animation-duration: 500ms;\n  -webkit-animation-timing-function: ease;\n  animation-timing-function: ease;\n  -webkit-animation-fill-mode: both;\n  animation-fill-mode: both;\n}\n\n/*******************************\n            States\n*******************************/\n\n/* Animating */\n\n.animating.transition {\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  -webkit-transform: translateZ(0);\n  transform: translateZ(0);\n  visibility: visible !important;\n}\n\n/* Loading */\n\n.loading.transition {\n  position: absolute;\n  top: -99999px;\n  left: -99999px;\n}\n\n/* Hidden */\n\n.hidden.transition {\n  display: none;\n  visibility: hidden;\n}\n\n/* Visible */\n\n.visible.transition {\n  display: block !important;\n  visibility: visible !important;\n  -webkit-backface-visibility: hidden;\n  backface-visibility: hidden;\n  -webkit-transform: translateZ(0);\n  transform: translateZ(0);\n}\n\n/* Disabled */\n\n.disabled.transition {\n  -webkit-animation-play-state: paused;\n  animation-play-state: paused;\n}\n\n/*******************************\n          Variations\n*******************************/\n\n.looping.transition {\n  -webkit-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n}\n\n/*******************************\n             Types\n*******************************/\n\n/*******************************\n           Animations\n*******************************/\n\n/*--------------\n    Emphasis\n---------------*/\n\n.flash.transition {\n  -webkit-animation-name: flash;\n  animation-name: flash;\n}\n\n.shake.transition {\n  -webkit-animation-name: shake;\n  animation-name: shake;\n}\n\n.bounce.transition {\n  -webkit-animation-name: bounce;\n  animation-name: bounce;\n}\n\n.tada.transition {\n  -webkit-animation-name: tada;\n  animation-name: tada;\n}\n\n/* originally authored by Nick Pettit - https://github.com/nickpettit/glide */\n\n.pulse.transition {\n  -webkit-animation-name: pulse;\n  animation-name: pulse;\n}\n\n/* Flash */\n\n@-webkit-keyframes flash {\n  0%, 50%, 100% {\n    opacity: 1;\n  }\n\n  25%, 75% {\n    opacity: 0;\n  }\n}\n\n@keyframes flash {\n  0%, 50%, 100% {\n    opacity: 1;\n  }\n\n  25%, 75% {\n    opacity: 0;\n  }\n}\n\n/* Shake */\n\n@-webkit-keyframes shake {\n  0%, 100% {\n    -webkit-transform: translateX(0);\n    transform: translateX(0);\n  }\n\n  10%, 30%, 50%, 70%, 90% {\n    -webkit-transform: translateX(-10px);\n    transform: translateX(-10px);\n  }\n\n  20%, 40%, 60%, 80% {\n    -webkit-transform: translateX(10px);\n    transform: translateX(10px);\n  }\n}\n\n@keyframes shake {\n  0%, 100% {\n    -webkit-transform: translateX(0);\n    transform: translateX(0);\n  }\n\n  10%, 30%, 50%, 70%, 90% {\n    -webkit-transform: translateX(-10px);\n    transform: translateX(-10px);\n  }\n\n  20%, 40%, 60%, 80% {\n    -webkit-transform: translateX(10px);\n    transform: translateX(10px);\n  }\n}\n\n/* Bounce */\n\n@-webkit-keyframes bounce {\n  0%, 20%, 50%, 80%, 100% {\n    -webkit-transform: translateY(0);\n    transform: translateY(0);\n  }\n\n  40% {\n    -webkit-transform: translateY(-30px);\n    transform: translateY(-30px);\n  }\n\n  60% {\n    -webkit-transform: translateY(-15px);\n    transform: translateY(-15px);\n  }\n}\n\n@keyframes bounce {\n  0%, 20%, 50%, 80%, 100% {\n    -webkit-transform: translateY(0);\n    transform: translateY(0);\n  }\n\n  40% {\n    -webkit-transform: translateY(-30px);\n    transform: translateY(-30px);\n  }\n\n  60% {\n    -webkit-transform: translateY(-15px);\n    transform: translateY(-15px);\n  }\n}\n\n/* Tada */\n\n@-webkit-keyframes tada {\n  0% {\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n\n  10%, 20% {\n    -webkit-transform: scale(0.9) rotate(-3deg);\n    transform: scale(0.9) rotate(-3deg);\n  }\n\n  30%, 50%, 70%, 90% {\n    -webkit-transform: scale(1.1) rotate(3deg);\n    transform: scale(1.1) rotate(3deg);\n  }\n\n  40%, 60%, 80% {\n    -webkit-transform: scale(1.1) rotate(-3deg);\n    transform: scale(1.1) rotate(-3deg);\n  }\n\n  100% {\n    -webkit-transform: scale(1) rotate(0);\n    transform: scale(1) rotate(0);\n  }\n}\n\n@keyframes tada {\n  0% {\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n\n  10%, 20% {\n    -webkit-transform: scale(0.9) rotate(-3deg);\n    transform: scale(0.9) rotate(-3deg);\n  }\n\n  30%, 50%, 70%, 90% {\n    -webkit-transform: scale(1.1) rotate(3deg);\n    transform: scale(1.1) rotate(3deg);\n  }\n\n  40%, 60%, 80% {\n    -webkit-transform: scale(1.1) rotate(-3deg);\n    transform: scale(1.1) rotate(-3deg);\n  }\n\n  100% {\n    -webkit-transform: scale(1) rotate(0);\n    transform: scale(1) rotate(0);\n  }\n}\n\n/* Pulse */\n\n@-webkit-keyframes pulse {\n  0% {\n    -webkit-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n\n  50% {\n    -webkit-transform: scale(0.9);\n    transform: scale(0.9);\n    opacity: 0.7;\n  }\n\n  100% {\n    -webkit-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n}\n\n@keyframes pulse {\n  0% {\n    -webkit-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n\n  50% {\n    -webkit-transform: scale(0.9);\n    transform: scale(0.9);\n    opacity: 0.7;\n  }\n\n  100% {\n    -webkit-transform: scale(1);\n    transform: scale(1);\n    opacity: 1;\n  }\n}\n\n/*--------------\n     Slide\n---------------*/\n\n.slide.down.transition.in {\n  -webkit-animation-name: slideIn;\n  animation-name: slideIn;\n  transform-origin: 50% 0%;\n  -ms-transform-origin: 50% 0%;\n  -webkit-transform-origin: 50% 0%;\n}\n\n.slide.down.transition.out {\n  -webkit-animation-name: slideOut;\n  animation-name: slideOut;\n  -webkit-transform-origin: 50% 0%;\n  -ms-transform-origin: 50% 0%;\n  transform-origin: 50% 0%;\n}\n\n.slide.up.transition.in {\n  -webkit-animation-name: slideIn;\n  animation-name: slideIn;\n  -webkit-transform-origin: 50% 100%;\n  -ms-transform-origin: 50% 100%;\n  transform-origin: 50% 100%;\n}\n\n.slide.up.transition.out {\n  -webkit-animation-name: slideOut;\n  animation-name: slideOut;\n  -webkit-transform-origin: 50% 100%;\n  -ms-transform-origin: 50% 100%;\n  transform-origin: 50% 100%;\n}\n\n@-webkit-keyframes slideIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n}\n\n@keyframes slideIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n}\n\n@-webkit-keyframes slideOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n}\n\n@keyframes slideOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scaleY(1);\n    transform: scaleY(1);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: scaleY(0);\n    transform: scaleY(0);\n  }\n}\n\n/*--------------\n     Flips\n---------------*/\n\n.flip.transition.in,\n.flip.transition.out {\n  -webkit-perspective: 2000px;\n  perspective: 2000px;\n}\n\n.horizontal.flip.transition.in {\n  -webkit-animation-name: horizontalFlipIn;\n  animation-name: horizontalFlipIn;\n}\n\n.horizontal.flip.transition.out {\n  -webkit-animation-name: horizontalFlipOut;\n  animation-name: horizontalFlipOut;\n}\n\n.vertical.flip.transition.in {\n  -webkit-animation-name: verticalFlipIn;\n  animation-name: verticalFlipIn;\n}\n\n.vertical.flip.transition.out {\n  -webkit-animation-name: verticalFlipOut;\n  animation-name: verticalFlipOut;\n}\n\n/* Horizontal */\n\n@-webkit-keyframes horizontalFlipIn {\n  0% {\n    -webkit-transform: rotateY(-90deg);\n    transform: rotateY(-90deg);\n    opacity: 0;\n  }\n\n  100% {\n    -webkit-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n}\n\n@keyframes horizontalFlipIn {\n  0% {\n    -webkit-transform: rotateY(-90deg);\n    transform: rotateY(-90deg);\n    opacity: 0;\n  }\n\n  100% {\n    -webkit-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n}\n\n/* Horizontal */\n\n@-webkit-keyframes horizontalFlipOut {\n  0% {\n    -webkit-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n\n  100% {\n    -webkit-transform: rotateY(90deg);\n    transform: rotateY(90deg);\n    opacity: 0;\n  }\n}\n\n@keyframes horizontalFlipOut {\n  0% {\n    -webkit-transform: rotateY(0deg);\n    transform: rotateY(0deg);\n    opacity: 1;\n  }\n\n  100% {\n    -webkit-transform: rotateY(90deg);\n    transform: rotateY(90deg);\n    opacity: 0;\n  }\n}\n\n/* Vertical */\n\n@-webkit-keyframes verticalFlipIn {\n  0% {\n    -webkit-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n\n  100% {\n    -webkit-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n}\n\n@keyframes verticalFlipIn {\n  0% {\n    -webkit-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n\n  100% {\n    -webkit-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n}\n\n@-webkit-keyframes verticalFlipOut {\n  0% {\n    -webkit-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n\n  100% {\n    -webkit-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n}\n\n@keyframes verticalFlipOut {\n  0% {\n    -webkit-transform: rotateX(0deg);\n    transform: rotateX(0deg);\n    opacity: 1;\n  }\n\n  100% {\n    -webkit-transform: rotateX(-90deg);\n    transform: rotateX(-90deg);\n    opacity: 0;\n  }\n}\n\n/*--------------\n      Fades\n---------------*/\n\n.fade.transition.in {\n  -webkit-animation-name: fadeIn;\n  animation-name: fadeIn;\n}\n\n.fade.transition.out {\n  -webkit-animation-name: fadeOut;\n  animation-name: fadeOut;\n}\n\n.fade.up.transition.in {\n  -webkit-animation-name: fadeUpIn;\n  animation-name: fadeUpIn;\n}\n\n.fade.up.transition.out {\n  -webkit-animation-name: fadeUpOut;\n  animation-name: fadeUpOut;\n}\n\n.fade.down.transition.in {\n  -webkit-animation-name: fadeDownIn;\n  animation-name: fadeDownIn;\n}\n\n.fade.down.transition.out {\n  -webkit-animation-name: fadeDownOut;\n  animation-name: fadeDownOut;\n}\n\n/* Fade */\n\n@-webkit-keyframes fadeIn {\n  0% {\n    opacity: 0;\n  }\n\n  100% {\n    opacity: 1;\n  }\n}\n\n@keyframes fadeIn {\n  0% {\n    opacity: 0;\n  }\n\n  100% {\n    opacity: 1;\n  }\n}\n\n@-webkit-keyframes fadeOut {\n  0% {\n    opacity: 1;\n  }\n\n  100% {\n    opacity: 0;\n  }\n}\n\n@keyframes fadeOut {\n  0% {\n    opacity: 1;\n  }\n\n  100% {\n    opacity: 0;\n  }\n}\n\n/* Fade Up */\n\n@-webkit-keyframes fadeUpIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: translateY(10%);\n    transform: translateY(10%);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: translateY(0%);\n    transform: translateY(0%);\n  }\n}\n\n@keyframes fadeUpIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: translateY(10%);\n    transform: translateY(10%);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: translateY(0%);\n    transform: translateY(0%);\n  }\n}\n\n@-webkit-keyframes fadeUpOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: translateY(0%);\n    transform: translateY(0%);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: translateY(10%);\n    transform: translateY(10%);\n  }\n}\n\n@keyframes fadeUpOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: translateY(0%);\n    transform: translateY(0%);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: translateY(10%);\n    transform: translateY(10%);\n  }\n}\n\n/* Fade Down */\n\n@-webkit-keyframes fadeDownIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: translateY(-10%);\n    transform: translateY(-10%);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: translateY(0%);\n    transform: translateY(0%);\n  }\n}\n\n@keyframes fadeDownIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: translateY(-10%);\n    transform: translateY(-10%);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: translateY(0%);\n    transform: translateY(0%);\n  }\n}\n\n@-webkit-keyframes fadeDownOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: translateY(0%);\n    transform: translateY(0%);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: translateY(-10%);\n    transform: translateY(-10%);\n  }\n}\n\n@keyframes fadeDownOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: translateY(0%);\n    transform: translateY(0%);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: translateY(-10%);\n    transform: translateY(-10%);\n  }\n}\n\n/*--------------\n      Scale\n---------------*/\n\n.scale.transition.in {\n  -webkit-animation-name: scaleIn;\n  animation-name: scaleIn;\n}\n\n.scale.transition.out {\n  -webkit-animation-name: scaleOut;\n  animation-name: scaleOut;\n}\n\n/* Scale */\n\n@-webkit-keyframes scaleIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n}\n\n@keyframes scaleIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n}\n\n@-webkit-keyframes scaleOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n}\n\n@keyframes scaleOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: scale(0.7);\n    transform: scale(0.7);\n  }\n}\n\n/*--------------\n     Drop\n---------------*/\n\n.drop.transition {\n  -webkit-transform-origin: top center;\n  -ms-transform-origin: top center;\n  transform-origin: top center;\n  -webkit-animation-timing-function: cubic-bezier(0.34, 1.61, 0.7, 1);\n  animation-timing-function: cubic-bezier(0.34, 1.61, 0.7, 1);\n}\n\n.drop.transition.in {\n  -webkit-animation-name: dropIn;\n  animation-name: dropIn;\n}\n\n.drop.transition.out {\n  -webkit-animation-name: dropOut;\n  animation-name: dropOut;\n}\n\n/* Scale */\n\n@-webkit-keyframes dropIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: scale(0);\n    transform: scale(0);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n}\n\n@keyframes dropIn {\n  0% {\n    opacity: 0;\n    -webkit-transform: scale(0);\n    transform: scale(0);\n  }\n\n  100% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n}\n\n@-webkit-keyframes dropOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: scale(0);\n    transform: scale(0);\n  }\n}\n\n@keyframes dropOut {\n  0% {\n    opacity: 1;\n    -webkit-transform: scale(1);\n    transform: scale(1);\n  }\n\n  100% {\n    opacity: 0;\n    -webkit-transform: scale(0);\n    transform: scale(0);\n  }\n}\n\n/*--------------\n     Browse\n---------------*/\n\n.browse.transition.in {\n  -webkit-animation-name: browseIn;\n  animation-name: browseIn;\n  -webkit-animation-timing-function: ease;\n  animation-timing-function: ease;\n}\n\n.browse.transition.out,\n.browse.transition.out.left {\n  -webkit-animation-name: browseOutLeft;\n  animation-name: browseOutLeft;\n  -webkit-animation-timing-function: ease;\n  animation-timing-function: ease;\n}\n\n.browse.transition.out.right {\n  -webkit-animation-name: browseOutRight;\n  animation-name: browseOutRight;\n  -webkit-animation-timing-function: ease;\n  animation-timing-function: ease;\n}\n\n@-webkit-keyframes browseIn {\n  0% {\n    -webkit-transform: scale(0.8) translateZ(0px);\n    transform: scale(0.8) translateZ(0px);\n    z-index: -1;\n  }\n\n  10% {\n    -webkit-transform: scale(0.8) translateZ(0px);\n    transform: scale(0.8) translateZ(0px);\n    z-index: -1;\n    opacity: 0.7;\n  }\n\n  80% {\n    -webkit-transform: scale(1.05) translateZ(0px);\n    transform: scale(1.05) translateZ(0px);\n    opacity: 1;\n    z-index: 999;\n  }\n\n  100% {\n    -webkit-transform: scale(1) translateZ(0px);\n    transform: scale(1) translateZ(0px);\n    z-index: 999;\n  }\n}\n\n@keyframes browseIn {\n  0% {\n    -webkit-transform: scale(0.8) translateZ(0px);\n    transform: scale(0.8) translateZ(0px);\n    z-index: -1;\n  }\n\n  10% {\n    -webkit-transform: scale(0.8) translateZ(0px);\n    transform: scale(0.8) translateZ(0px);\n    z-index: -1;\n    opacity: 0.7;\n  }\n\n  80% {\n    -webkit-transform: scale(1.05) translateZ(0px);\n    transform: scale(1.05) translateZ(0px);\n    opacity: 1;\n    z-index: 999;\n  }\n\n  100% {\n    -webkit-transform: scale(1) translateZ(0px);\n    transform: scale(1) translateZ(0px);\n    z-index: 999;\n  }\n}\n\n@-webkit-keyframes browseOutLeft {\n  0% {\n    z-index: 999;\n    -webkit-transform: translateX(0%) rotateY(0deg) rotateX(0deg);\n    transform: translateX(0%) rotateY(0deg) rotateX(0deg);\n  }\n\n  50% {\n    z-index: -1;\n    -webkit-transform: translateX(-105%) rotateY(35deg) rotateX(10deg) translateZ(-10px);\n    transform: translateX(-105%) rotateY(35deg) rotateX(10deg) translateZ(-10px);\n  }\n\n  80% {\n    opacity: 1;\n  }\n\n  100% {\n    z-index: -1;\n    -webkit-transform: translateX(0%) rotateY(0deg) rotateX(0deg) translateZ(-10px);\n    transform: translateX(0%) rotateY(0deg) rotateX(0deg) translateZ(-10px);\n    opacity: 0;\n  }\n}\n\n@keyframes browseOutLeft {\n  0% {\n    z-index: 999;\n    -webkit-transform: translateX(0%) rotateY(0deg) rotateX(0deg);\n    transform: translateX(0%) rotateY(0deg) rotateX(0deg);\n  }\n\n  50% {\n    z-index: -1;\n    -webkit-transform: translateX(-105%) rotateY(35deg) rotateX(10deg) translateZ(-10px);\n    transform: translateX(-105%) rotateY(35deg) rotateX(10deg) translateZ(-10px);\n  }\n\n  80% {\n    opacity: 1;\n  }\n\n  100% {\n    z-index: -1;\n    -webkit-transform: translateX(0%) rotateY(0deg) rotateX(0deg) translateZ(-10px);\n    transform: translateX(0%) rotateY(0deg) rotateX(0deg) translateZ(-10px);\n    opacity: 0;\n  }\n}\n\n@-webkit-keyframes browseOutRight {\n  0% {\n    z-index: 999;\n    -webkit-transform: translateX(0%) rotateY(0deg) rotateX(0deg);\n    transform: translateX(0%) rotateY(0deg) rotateX(0deg);\n  }\n\n  50% {\n    z-index: 1;\n    -webkit-transform: translateX(105%) rotateY(35deg) rotateX(10deg) translateZ(-10px);\n    transform: translateX(105%) rotateY(35deg) rotateX(10deg) translateZ(-10px);\n  }\n\n  80% {\n    opacity: 1;\n  }\n\n  100% {\n    z-index: 1;\n    -webkit-transform: translateX(0%) rotateY(0deg) rotateX(0deg) translateZ(-10px);\n    transform: translateX(0%) rotateY(0deg) rotateX(0deg) translateZ(-10px);\n    opacity: 0;\n  }\n}\n\n@keyframes browseOutRight {\n  0% {\n    z-index: 999;\n    -webkit-transform: translateX(0%) rotateY(0deg) rotateX(0deg);\n    transform: translateX(0%) rotateY(0deg) rotateX(0deg);\n  }\n\n  50% {\n    z-index: 1;\n    -webkit-transform: translateX(105%) rotateY(35deg) rotateX(10deg) translateZ(-10px);\n    transform: translateX(105%) rotateY(35deg) rotateX(10deg) translateZ(-10px);\n  }\n\n  80% {\n    opacity: 1;\n  }\n\n  100% {\n    z-index: 1;\n    -webkit-transform: translateX(0%) rotateY(0deg) rotateX(0deg) translateZ(-10px);\n    transform: translateX(0%) rotateY(0deg) rotateX(0deg) translateZ(-10px);\n    opacity: 0;\n  }\n}\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Video\n*******************************/\n\n.ui.video {\n  background-color: #dddddd;\n  position: relative;\n  max-width: 100%;\n  padding-bottom: 56.25%;\n  height: 0px;\n  overflow: hidden;\n}\n\n/*--------------\n     Content\n---------------*/\n\n/* Placeholder Image */\n\n.ui.video .placeholder {\n  background-color: #333333;\n}\n\n/* Play Icon Overlay */\n\n.ui.video .play {\n  cursor: pointer;\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  z-index: 10;\n  width: 100%;\n  height: 100%;\n  opacity: 0.8;\n  -webkit-transition: opacity 0.3s;\n  transition: opacity 0.3s;\n}\n\n.ui.video .play.icon:before {\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  z-index: 11;\n  background: rgba(0, 0, 0, 0.3);\n  width: 8rem;\n  height: 8rem;\n  line-height: 8rem;\n  border-radius: 500rem;\n  color: #ffffff;\n  font-size: 8rem;\n  text-shadow: none;\n  -webkit-transform: translateX(-50%) translateY(-50%);\n  -ms-transform: translateX(-50%) translateY(-50%);\n  transform: translateX(-50%) translateY(-50%);\n}\n\n.ui.video .placeholder {\n  position: absolute;\n  top: 0px;\n  left: 0px;\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n\n/* IFrame Embed */\n\n.ui.video .embed iframe,\n.ui.video .embed embed,\n.ui.video .embed object {\n  position: absolute;\n  border: none;\n  width: 100%;\n  height: 100%;\n  top: 0px;\n  left: 0px;\n  margin: 0em;\n  padding: 0em;\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------\n    Hover\n---------------*/\n\n.ui.video .play:hover {\n  opacity: 1;\n}\n\n/*--------------\n     Active\n---------------*/\n\n.ui.video.active .play,\n.ui.video.active .placeholder {\n  display: none;\n}\n\n.ui.video.active .embed {\n  display: inline;\n}\n\n/*******************************\n        Video Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/\n\n/*\n * # Semantic UI\n * https://github.com/Semantic-Org/Semantic-UI\n * http://www.semantic-ui.com/\n *\n * Copyright 2014 Contributors\n * Released under the MIT license\n * http://opensource.org/licenses/MIT\n *\n */\n\n/*******************************\n            Elements\n*******************************/\n\n/*--------------------\n        Form\n---------------------*/\n\n.ui.form {\n  position: relative;\n  max-width: 100%;\n}\n\n/*--------------------\n        Content\n---------------------*/\n\n.ui.form > p {\n  margin: 1em 0em;\n}\n\n/*--------------------\n        Field\n---------------------*/\n\n.ui.form .field {\n  clear: both;\n  margin: 0em 0em 1em;\n}\n\n.ui.form .fields:last-child .field,\n.ui.form :not(.fields) .field:last-child {\n  margin-bottom: 0em;\n}\n\n/*--------------------\n        Labels\n---------------------*/\n\n.ui.form .field > label {\n  display: block;\n  margin: 0em 0em 0.2857rem 0em;\n  color: rgba(0, 0, 0, 0.8);\n  font-size: 0.9285em;\n  font-weight: bold;\n  text-transform: none;\n}\n\n.ui.form .grouped.fields > label {\n  margin: 0em 0em 0.2857rem 0em;\n  color: rgba(0, 0, 0, 0.8);\n  font-size: 0.9285em;\n  font-weight: bold;\n  text-transform: none;\n}\n\n.ui.form .inline.fields > label {\n  display: inline-block;\n  vertical-align: middle;\n  margin: 0em 1em 0em 0em;\n  color: rgba(0, 0, 0, 0.8);\n  font-size: 0.9285em;\n  font-weight: bold;\n  text-transform: none;\n}\n\n/*--------------------\n    Standard Inputs\n---------------------*/\n\n.ui.form textarea,\n.ui.form input[type="text"],\n.ui.form input[type="email"],\n.ui.form input[type="date"],\n.ui.form input[type="password"],\n.ui.form input[type="number"],\n.ui.form input[type="url"],\n.ui.form input[type="tel"],\n.ui.form .ui.input {\n  width: 100%;\n  vertical-align: top;\n}\n\n.ui.form input[type="text"],\n.ui.form input[type="email"],\n.ui.form input[type="date"],\n.ui.form input[type="password"],\n.ui.form input[type="number"],\n.ui.form input[type="url"],\n.ui.form input[type="tel"] {\n  margin: 0em;\n  outline: none;\n  -webkit-appearance: none;\n  -webkit-tap-highlight-color: rgba(255, 255, 255, 0);\n  line-height: 1.2142em;\n  padding: 0.67861em 1em;\n  font-size: 1em;\n  background: #ffffff;\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  color: rgba(0, 0, 0, 0.8);\n  border-radius: 0.2857rem;\n  box-shadow: 0em 0em 0em 0em transparent inset;\n  -webkit-transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n}\n\n.ui.textarea,\n.ui.form textarea {\n  margin: 0em;\n  -webkit-appearance: none;\n  -webkit-tap-highlight-color: rgba(255, 255, 255, 0);\n  padding: 0.78571em 1em;\n  background: #ffffff;\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  outline: none;\n  color: rgba(0, 0, 0, 0.8);\n  border-radius: 0.2857rem;\n  box-shadow: 0em 0em 0em 0em transparent inset;\n  -webkit-transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  font-size: 1em;\n  height: 12em;\n  min-height: 8em;\n  max-height: 24em;\n  line-height: 1.2857;\n  resize: vertical;\n}\n\n.ui.form textarea,\n.ui.form input[type="checkbox"] {\n  vertical-align: top;\n}\n\n/*--------------------------\n  Input w/ attached Button\n---------------------------*/\n\n.ui.form input.attached {\n  width: auto;\n}\n\n/*--------------------\n     Basic Select\n---------------------*/\n\n.ui.form select {\n  display: block;\n  height: auto;\n  width: 100%;\n  background: #ffffff;\n  border: 1px solid rgba(39, 41, 43, 0.15);\n  border-radius: 0.2857rem;\n  box-shadow: 0em 0em 0em 0em transparent inset;\n  padding: 0.62em 1em;\n  color: rgba(0, 0, 0, 0.8);\n  -webkit-transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;\n}\n\n/*--------------------\n       Dropdown\n---------------------*/\n\n.ui.form .field > .selection.dropdown {\n  width: 100%;\n}\n\n.ui.form .field > .selection.dropdown > .dropdown.icon {\n  float: right;\n}\n\n.ui.form .inline.field > .selection.dropdown {\n  width: auto;\n}\n\n.ui.form .inline.field > .selection.dropdown > .dropdown.icon {\n  float: none;\n}\n\n/*--------------------\n       Dividers\n---------------------*/\n\n.ui.form .divider {\n  clear: both;\n  margin: 1em 0em;\n}\n\n/*--------------------\n   Types of Messages\n---------------------*/\n\n.ui.form .info.message,\n.ui.form .success.message,\n.ui.form .warning.message,\n.ui.form .error.message {\n  display: none;\n}\n\n/* Assumptions */\n\n.ui.form .message:first-child {\n  margin-top: 0px;\n}\n\n/*--------------------\n   Validation Prompt\n---------------------*/\n\n.ui.form .field .prompt.label {\n  white-space: nowrap;\n}\n\n.ui.form .inline.field .prompt {\n  margin: 0em 0em 0em 1em;\n}\n\n.ui.form .inline.field .prompt:before {\n  margin-top: -0.3em;\n  bottom: auto;\n  right: auto;\n  top: 50%;\n  left: 0em;\n}\n\n/*******************************\n            States\n*******************************/\n\n/*--------------------\n      Placeholder\n---------------------*/\n\n/* browsers require these rules separate */\n\n.ui.form ::-webkit-input-placeholder {\n  color: rgba(140, 140, 140, 0.8);\n}\n\n.ui.form ::-moz-placeholder {\n  color: rgba(140, 140, 140, 0.8);\n}\n\n.ui.form :focus::-webkit-input-placeholder {\n  color: rgba(89, 89, 89, 0.8);\n}\n\n.ui.form :focus::-moz-placeholder {\n  color: rgba(89, 89, 89, 0.8);\n}\n\n/* Error Placeholder */\n\n.ui.form .error ::-webkit-input-placeholder {\n  color: #e38585;\n}\n\n.ui.form .error ::-moz-placeholder {\n  color: #e38585;\n}\n\n.ui.form .error :focus::-webkit-input-placeholder {\n  color: #de7171;\n}\n\n.ui.form .error :focus::-moz-placeholder {\n  color: #de7171;\n}\n\n/*--------------------\n        Focus\n---------------------*/\n\n.ui.form input[type="text"]:focus,\n.ui.form input[type="email"]:focus,\n.ui.form input[type="date"]:focus,\n.ui.form input[type="password"]:focus,\n.ui.form input[type="number"]:focus,\n.ui.form input[type="url"]:focus,\n.ui.form input[type="tel"]:focus {\n  color: rgba(0, 0, 0, 0.85);\n  border-color: rgba(39, 41, 43, 0.3);\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n  background: #ffffff;\n  box-shadow: 1px 0em 0em 0em rgba(39, 41, 43, 0.3) inset;\n}\n\n.ui.form textarea:focus {\n  color: rgba(0, 0, 0, 0.85);\n  border-color: rgba(39, 41, 43, 0.3);\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n  background: #ffffff;\n  box-shadow: 1px 0em 0em 0em rgba(39, 41, 43, 0.3) inset;\n  -webkit-appearance: none;\n}\n\n/*--------------------\n        Success\n---------------------*/\n\n/* On Form */\n\n.ui.form.success .success.message {\n  display: block;\n}\n\n/*--------------------\n        Error\n---------------------*/\n\n/* On Form */\n\n.ui.form.warning .warning.message {\n  display: block;\n}\n\n/*--------------------\n        Warning\n---------------------*/\n\n/* On Form */\n\n.ui.form.error .error.message {\n  display: block;\n}\n\n/* On Field(s) */\n\n.ui.form .fields.error .field label,\n.ui.form .field.error label,\n.ui.form .fields.error .field .input,\n.ui.form .field.error .input {\n  color: #d95c5c;\n}\n\n.ui.form .fields.error .field .corner.label,\n.ui.form .field.error .corner.label {\n  border-color: #d95c5c;\n  color: #ffffff;\n}\n\n.ui.form .fields.error .field textarea,\n.ui.form .fields.error .field input[type="text"],\n.ui.form .fields.error .field input[type="email"],\n.ui.form .fields.error .field input[type="date"],\n.ui.form .fields.error .field input[type="password"],\n.ui.form .fields.error .field input[type="number"],\n.ui.form .fields.error .field input[type="url"],\n.ui.form .fields.error .field input[type="tel"],\n.ui.form .field.error textarea,\n.ui.form .field.error input[type="text"],\n.ui.form .field.error input[type="email"],\n.ui.form .field.error input[type="date"],\n.ui.form .field.error input[type="password"],\n.ui.form .field.error input[type="number"],\n.ui.form .field.error input[type="url"],\n.ui.form .field.error input[type="tel"] {\n  background: #fff0f0;\n  border-color: #dbb1b1;\n  color: #d95c5c;\n  border-radius: 0em 0.2857rem 0.2857rem 0em;\n  box-shadow: 2px 0em 0em 0em #d95c5c inset;\n}\n\n.ui.form .field.error textarea:focus,\n.ui.form .field.error input[type="text"]:focus,\n.ui.form .field.error input[type="email"]:focus,\n.ui.form .field.error input[type="date"]:focus,\n.ui.form .field.error input[type="password"]:focus,\n.ui.form .field.error input[type="number"]:focus,\n.ui.form .field.error input[type="url"]:focus,\n.ui.form .field.error input[type="tel"]:focus {\n  background: #fff0f0;\n  border-color: #dbb1b1;\n  color: #dc6868;\n  -webkit-appearance: none;\n  box-shadow: 2px 0em 0em 0em #dc6868 inset;\n}\n\n/*------------------\n    Dropdown Error\n--------------------*/\n\n.ui.form .fields.error .field .ui.dropdown,\n.ui.form .fields.error .field .ui.dropdown .item,\n.ui.form .field.error .ui.dropdown,\n.ui.form .field.error .ui.dropdown .text,\n.ui.form .field.error .ui.dropdown .item {\n  background: #fff0f0;\n  color: #d95c5c;\n}\n\n.ui.form .fields.error .field .ui.dropdown,\n.ui.form .field.error .ui.dropdown {\n  border-color: #dbb1b1 !important;\n}\n\n.ui.form .fields.error .field .ui.dropdown:hover,\n.ui.form .field.error .ui.dropdown:hover {\n  border-color: #dbb1b1 !important;\n}\n\n.ui.form .fields.error .field .ui.dropdown:hover .menu,\n.ui.form .field.error .ui.dropdown:hover .menu {\n  border-color: #dbb1b1;\n}\n\n/* Hover */\n\n.ui.form .fields.error .field .ui.dropdown .menu .item:hover,\n.ui.form .field.error .ui.dropdown .menu .item:hover {\n  background-color: #fff2f2;\n}\n\n/* Active */\n\n.ui.form .fields.error .field .ui.dropdown .menu .active.item,\n.ui.form .field.error .ui.dropdown .menu .active.item {\n  background-color: #fdcfcf !important;\n}\n\n/*--------------------\n    Checkbox Error\n---------------------*/\n\n.ui.form .fields.error .field .checkbox:not(.toggle):not(.slider) label,\n.ui.form .field.error .checkbox:not(.toggle):not(.slider) label,\n.ui.form .fields.error .field .checkbox:not(.toggle):not(.slider) .box,\n.ui.form .field.error .checkbox:not(.toggle):not(.slider) .box {\n  color: #d95c5c;\n}\n\n.ui.form .fields.error .field .checkbox:not(.toggle):not(.slider) label:before,\n.ui.form .field.error .checkbox:not(.toggle):not(.slider) label:before,\n.ui.form .fields.error .field .checkbox:not(.toggle):not(.slider) .box:before,\n.ui.form .field.error .checkbox:not(.toggle):not(.slider) .box:before {\n  background: #fff0f0;\n  border-color: #dbb1b1;\n}\n\n.ui.form .fields.error .field .checkbox label:after,\n.ui.form .field.error .checkbox label:after,\n.ui.form .fields.error .field .checkbox .box:after,\n.ui.form .field.error .checkbox .box:after {\n  color: #d95c5c;\n}\n\n/*--------------------\n       Disabled\n---------------------*/\n\n.ui.form .field :disabled,\n.ui.form .field.disabled {\n  opacity: 0.5;\n}\n\n.ui.form .field.disabled label {\n  opacity: 0.5;\n}\n\n.ui.form .field.disabled :disabled {\n  opacity: 1;\n}\n\n/*--------------\n    Loading\n---------------*/\n\n.ui.loading.form {\n  position: relative;\n  cursor: default;\n  point-events: none;\n  text-shadow: none !important;\n  color: transparent !important;\n  -webkit-transition: all 0s linear;\n  transition: all 0s linear;\n  z-index: 100;\n}\n\n.ui.loading.form:before {\n  position: absolute;\n  content: \'\';\n  top: 0%;\n  left: 0%;\n  background: rgba(255, 255, 255, 0.8);\n  width: 100%;\n  height: 100%;\n  z-index: 100;\n}\n\n.ui.loading.form:after {\n  position: absolute;\n  content: \'\';\n  top: 50%;\n  left: 50%;\n  margin: -1.5em 0em 0em -1.5em;\n  width: 3em;\n  height: 3em;\n  -webkit-animation: form-spin 0.6s linear;\n  animation: form-spin 0.6s linear;\n  -webkit-animation-iteration-count: infinite;\n  animation-iteration-count: infinite;\n  border-radius: 500rem;\n  border-color: #aaaaaa rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1);\n  border-style: solid;\n  border-width: 0.2em;\n  box-shadow: 0px 0px 0px 1px transparent;\n  visibility: visible;\n  z-index: 101;\n}\n\n@-webkit-keyframes form-spin {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n@keyframes form-spin {\n  from {\n    -webkit-transform: rotate(0deg);\n    transform: rotate(0deg);\n  }\n\n  to {\n    -webkit-transform: rotate(360deg);\n    transform: rotate(360deg);\n  }\n}\n\n/*******************************\n         Element Types\n*******************************/\n\n/*--------------------\n     Required Field\n---------------------*/\n\n.ui.form .required.fields > .field > label:after,\n.ui.form .required.field > label:after,\n.ui.form .required.fields > .field > .checkbox:after,\n.ui.form .required.field > .checkbox:after {\n  margin: -0.2em 0em 0em 0.2em;\n  content: \'*\';\n  color: #d95c5c;\n}\n\n.ui.form .required.fields > .field > label:after,\n.ui.form .required.field > label:after {\n  display: inline-block;\n  vertical-align: top;\n}\n\n.ui.form .required.fields > .field > .checkbox:after,\n.ui.form .required.field > .checkbox:after {\n  position: absolute;\n  top: 0%;\n  left: 100%;\n}\n\n/*******************************\n           Variations\n*******************************/\n\n/*--------------------\n    Inverted Colors\n---------------------*/\n\n.ui.inverted.form label,\n.ui.form .inverted.segment label,\n.ui.form .inverted.segment .ui.checkbox label,\n.ui.form .inverted.segment .ui.checkbox .box,\n.ui.inverted.form .ui.checkbox label,\n.ui.inverted.form .ui.checkbox .box {\n  color: #ffffff;\n}\n\n/*--------------------\n     Field Groups\n---------------------*/\n\n/* Grouped Vertically */\n\n.ui.form .grouped.fields {\n  margin: 0em 0em 1em;\n}\n\n.ui.form .grouped.fields:last-child {\n  margin-bottom: 0em;\n}\n\n.ui.form .grouped.fields > label {\n  font-size: 0.9285em;\n}\n\n.ui.form .grouped.fields .field {\n  display: block;\n  float: none;\n  margin: 0.5em 0em;\n  padding: 0em;\n}\n\n/*--------------------\n        Fields\n---------------------*/\n\n/* Split fields */\n\n.ui.form .fields {\n  clear: both;\n}\n\n.ui.form .fields:after {\n  content: \' \';\n  display: block;\n  clear: both;\n  visibility: hidden;\n  line-height: 0;\n  height: 0;\n}\n\n.ui.form .fields > .field {\n  clear: none;\n  float: left;\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n}\n\n.ui.form .fields > .field:first-child {\n  border-left: none;\n  box-shadow: none;\n}\n\n/* Other Combinations */\n\n.ui.form .two.fields > .fields,\n.ui.form .two.fields > .field {\n  width: 50%;\n}\n\n.ui.form .three.fields > .fields,\n.ui.form .three.fields > .field {\n  width: 33.33333333%;\n}\n\n.ui.form .four.fields > .fields,\n.ui.form .four.fields > .field {\n  width: 25%;\n}\n\n.ui.form .five.fields > .fields,\n.ui.form .five.fields > .field {\n  width: 20%;\n}\n\n.ui.form .six.fields > .fields,\n.ui.form .six.fields > .field {\n  width: 16.66666667%;\n}\n\n.ui.form .seven.fields > .fields,\n.ui.form .seven.fields > .field {\n  width: 14.28571429%;\n}\n\n.ui.form .eight.fields > .fields,\n.ui.form .eight.fields > .field {\n  width: 12.5%;\n}\n\n.ui.form .nine.fields > .fields,\n.ui.form .nine.fields > .field {\n  width: 11.11111111%;\n}\n\n.ui.form .ten.fields > .fields,\n.ui.form .ten.fields > .field {\n  width: 10%;\n}\n\n/* Swap to full width on mobile */\n\n@media only screen and (max-width: 767px) {\n  .ui.form .two.fields > .fields,\n  .ui.form .two.fields > .field,\n  .ui.form .three.fields > .fields,\n  .ui.form .three.fields > .field,\n  .ui.form .four.fields > .fields,\n  .ui.form .four.fields > .field,\n  .ui.form .five.fields > .fields,\n  .ui.form .five.fields > .field {\n    width: 100%;\n    padding-left: 0%;\n    padding-right: 0%;\n  }\n}\n\n.ui.form .fields .field:first-child {\n  padding-left: 0%;\n}\n\n.ui.form .fields .field:last-child {\n  padding-right: 0%;\n}\n\n/* Sizing Combinations */\n\n.ui.form .fields .wide.field {\n  width: 6.25%;\n  padding-left: 0.5em;\n  padding-right: 0.5em;\n}\n\n.ui.form .fields .wide.field:first-child {\n  padding-left: 0%;\n}\n\n.ui.form .fields .wide.field:last-child {\n  padding-right: 0%;\n}\n\n.ui.form .one.wide.field {\n  width: 6.25% !important;\n}\n\n.ui.form .two.wide.field {\n  width: 12.5% !important;\n}\n\n.ui.form .three.wide.field {\n  width: 18.75% !important;\n}\n\n.ui.form .four.wide.field {\n  width: 25% !important;\n}\n\n.ui.form .five.wide.field {\n  width: 31.25% !important;\n}\n\n.ui.form .six.wide.field {\n  width: 37.5% !important;\n}\n\n.ui.form .seven.wide.field {\n  width: 43.75% !important;\n}\n\n.ui.form .eight.wide.field {\n  width: 50% !important;\n}\n\n.ui.form .nine.wide.field {\n  width: 56.25% !important;\n}\n\n.ui.form .ten.wide.field {\n  width: 62.5% !important;\n}\n\n.ui.form .eleven.wide.field {\n  width: 68.75% !important;\n}\n\n.ui.form .twelve.wide.field {\n  width: 75% !important;\n}\n\n.ui.form .thirteen.wide.field {\n  width: 81.25% !important;\n}\n\n.ui.form .fourteen.wide.field {\n  width: 87.5% !important;\n}\n\n.ui.form .fifteen.wide.field {\n  width: 93.75% !important;\n}\n\n.ui.form .sixteen.wide.field {\n  width: 100% !important;\n}\n\n/* Swap to full width on mobile */\n\n@media only screen and (max-width: 767px) {\n  .ui.form .two.fields > .fields,\n  .ui.form .two.fields > .field,\n  .ui.form .three.fields > .fields,\n  .ui.form .three.fields > .field,\n  .ui.form .four.fields > .fields,\n  .ui.form .four.fields > .field,\n  .ui.form .five.fields > .fields,\n  .ui.form .five.fields > .field,\n  .ui.form .fields > .two.wide.field,\n  .ui.form .fields > .three.wide.field,\n  .ui.form .fields > .four.wide.field,\n  .ui.form .fields > .five.wide.field,\n  .ui.form .fields > .six.wide.field,\n  .ui.form .fields > .seven.wide.field,\n  .ui.form .fields > .eight.wide.field,\n  .ui.form .fields > .nine.wide.field,\n  .ui.form .fields > .ten.wide.field,\n  .ui.form .fields > .eleven.wide.field,\n  .ui.form .fields > .twelve.wide.field,\n  .ui.form .fields > .thirteen.wide.field,\n  .ui.form .fields > .fourteen.wide.field,\n  .ui.form .fields > .fifteen.wide.field,\n  .ui.form .fields > .sixteen.wide.field {\n    width: 100%;\n    padding-left: 0%;\n    padding-right: 0%;\n  }\n}\n\n/*--------------------\n    Inline Fields\n---------------------*/\n\n.ui.form .inline.fields {\n  margin: 0em 0em 1em;\n}\n\n.ui.form .inline.fields .field {\n  display: inline-block;\n  float: none;\n  margin: 0em 1em 0em 0em;\n  padding: 0em;\n}\n\n.ui.form .inline.fields .field > label,\n.ui.form .inline.fields .field > p,\n.ui.form .inline.fields .field > input,\n.ui.form .inline.field > label,\n.ui.form .inline.field > p,\n.ui.form .inline.field > input {\n  display: inline-block;\n  width: auto;\n  margin-top: 0em;\n  margin-bottom: 0em;\n  vertical-align: middle;\n  font-size: 0.9285em;\n}\n\n.ui.form .inline.fields .field > input,\n.ui.form .inline.field > input {\n  font-size: 0.9285em;\n}\n\n.ui.form .inline.fields .field > .ui.checkbox label {\n  padding-left: 1.75em;\n}\n\n/* Label */\n\n.ui.form .inline.fields .field > :first-child,\n.ui.form .inline.field > :first-child {\n  margin: 0em 0.2857rem 0em 0em;\n}\n\n.ui.form .inline.fields .field > :only-child,\n.ui.form .inline.field > :only-child {\n  margin: 0em;\n}\n\n/*--------------------\n        Sizes\n---------------------*/\n\n/* Standard */\n\n.ui.small.form {\n  font-size: 0.875em;\n}\n\n/* Medium */\n\n.ui.form {\n  font-size: auto;\n}\n\n/* Large */\n\n.ui.large.form {\n  font-size: 1.125em;\n}\n\n/* Huge */\n\n.ui.huge.form {\n  font-size: 1.2em;\n}\n\n/*******************************\n         Theme Overrides\n*******************************/\n\n/*******************************\n         Site Overrides\n*******************************/';
},{}],79:[function(require,module,exports){
module.exports = {
  data: function() {
    return {
      schema: {},
      values: {}
    };
  },
  template: require('./template.html'),
  components: {
    'json-schema-property': {
      replace: true,
      template: require('./property-template.html'),
      methods: {
        getValue: function() {
          if (this.$parent.$key == undefined) {
            return this.$parent.values[this.$key];
          } else if (this.$parent.$parent.values
              && this.$parent.$parent.values[this.$parent.$key]
              && this.$parent.$parent.values[this.$parent.$key][this.$key]) {
            // TODO: make this recursive
            return this.$parent.$parent.values[this.$parent.$key][this.$key];
          }
        }
      }
    }
  },
  filters: {
    input_type: function(value) {
      var types = {
          string: 'text',
          integer: 'number'
      }
      return types[value];
    }
  },
  methods: {
    output: function() {
      var jsonDOM = this.$el.querySelectorAll('[data-json]');
      var json = {};
      function accumulate(obj, dom) {
        for (var i = 0; i < dom.length; i++) {
          if (dom[i].dataset['json'] == 'kvp') {
            obj[dom[i].querySelector('label').textContent] = dom[i].querySelector('input').value;
          } else if (dom[i].dataset['json'] == 'object') {
            var legend = dom[i].querySelector('legend').textContent;
            var sub_dom = dom[i].querySelectorAll('[data-json]');
            obj[legend] = accumulate({}, sub_dom);
            i += sub_dom.length;
          }
        }
        return obj;
      }
      return accumulate(json, jsonDOM);
    },
    outputString: function() {
      return JSON.stringify(this.output());
    }
  }
};

},{"./property-template.html":80,"./template.html":81}],80:[function(require,module,exports){
module.exports = '<div class="field" data-json="kvp"\n  v-if="type != \'object\'">\n  <label for="{{$key}}">{{$key}}</label>\n  <input name="{{$key}}" type="{{type | input_type}}" v-attr="value: getValue()" />\n  <p class="ui message"\n    v-if="description"><small>{{description}}</small></p>\n</div>\n<fieldset data-json="object" class="ui fields" v-if="type == \'object\' && $key != \'$ref\'">\n  <legend>{{$key}}</legend>\n  <div v-component="json-schema-property" v-repeat="properties"></div>\n</fieldset>\n';
},{}],81:[function(require,module,exports){
module.exports = '<form class="ui horizontal form">\n<h1 class="ui header" v-if="schema.title">{{schema.title}}</h1>\n<div class="ui message" v-if="schema.description"><small>{{schema.description}}</small></div>\n<div v-repeat="schema.properties" v-component="json-schema-property"></div>\n</form>\n';
},{}]},{},[65])