'use strict';

// Points and item rectangles use output-relative coordinates; outputRect uses screen pixels.
var MIN_VISIBLE_PIXELS = 24;

function finite(n) { return typeof n === 'number' && isFinite(n); }
function validPoint(p) { return p && finite(p.x) && finite(p.y); }
function validRect(r) {
  return r && finite(r.x) && finite(r.y) && finite(r.width) && finite(r.height) && r.width > 0 && r.height > 0;
}

function toLocalPoint(point, outputRect) {
  if (!validPoint(point) || !validRect(outputRect)) return null;
  return {x: (point.x - outputRect.x) / outputRect.width, y: (point.y - outputRect.y) / outputRect.height};
}

// Items follow paint order for equal z. A locked item can be selected, but not dragged.
function hitTest(items, point) {
  if (!Array.isArray(items) || !validPoint(point) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
  var selected = null, selectedZ = -Infinity;
  items.forEach(function(item) {
    if (!item || !validRect(item.rect)) return;
    var r = item.rect, z = finite(item.z) ? item.z : 0;
    if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height && z >= selectedZ) {
      selected = item;
      selectedZ = z;
    }
  });
  return selected;
}

function beginDrag(item, point) {
  if (!item || item.locked || !validRect(item.rect) || !validPoint(point)) return null;
  return {
    item: Object.assign({}, item, {rect: Object.assign({}, item.rect)}),
    offset: {x: point.x - item.rect.x, y: point.y - item.rect.y}
  };
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function moveDrag(drag, point, outputRect) {
  if (!drag || !drag.item || !validRect(drag.item.rect) || !validPoint(drag.offset) || !validPoint(point) || !validRect(outputRect)) return null;
  var rect = drag.item.rect;
  var visibleX = Math.min(rect.width, 1, MIN_VISIBLE_PIXELS / outputRect.width);
  var visibleY = Math.min(rect.height, 1, MIN_VISIBLE_PIXELS / outputRect.height);
  return Object.assign({}, drag.item, {rect: Object.assign({}, rect, {
    x: clamp(point.x - drag.offset.x, visibleX - rect.width, 1 - visibleX),
    y: clamp(point.y - drag.offset.y, visibleY - rect.height, 1 - visibleY)
  })});
}

module.exports = {toLocalPoint: toLocalPoint, hitTest: hitTest, beginDrag: beginDrag, moveDrag: moveDrag};
