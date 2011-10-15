/**
 * @link https://gist.github.com/1259891
 */
exports.dateToArray = function(ts, length, utc) {
  var length = length || 6,
      d = new Date(ts),
      utc = Boolean(utc) || true;

  if (utc) {
    return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()].slice(0, length);
  } else {
    return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()].slice(0, length);
  }
};