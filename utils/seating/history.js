'use strict';
function create(limit) {
  var items = [], max = Number.isInteger(limit) && limit > 0 ? limit : 30;
  return {
    record: function(state) { items.push(JSON.stringify(state)); if (items.length > max) items.shift(); },
    undo: function() { return items.length ? JSON.parse(items.pop()) : null; }
  };
}
module.exports = { create: create };
