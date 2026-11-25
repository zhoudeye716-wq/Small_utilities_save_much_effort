'use strict';
function toScreen(view, point) { return { x: point.x * view.scale + view.x, y: point.y * view.scale + view.y }; }
function toWorld(view, point) { return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale }; }
function zoom(view, anchor, scale) {
  var nextScale = Math.max(0.01, Math.min(8, scale));
  var world = toWorld(view, anchor);
  return { x: anchor.x - world.x * nextScale, y: anchor.y - world.y * nextScale, scale: nextScale };
}
module.exports = { toScreen: toScreen, toWorld: toWorld, zoom: zoom };
