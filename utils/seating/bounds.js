'use strict';
var layout = require('./layout');
var geometry = require('./geometry');
function rectangle(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }; }
function project(scene, options) {
  var textScale=options&&Number(options.textScale)>0?Number(options.textScale):1;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  var names = Object.create(null); (scene.people || []).forEach(function(person) { names[person.id] = person.name || ''; });
  function include(x, y, margin) { minX = Math.min(minX, x - margin); minY = Math.min(minY, y - margin); maxX = Math.max(maxX, x + margin); maxY = Math.max(maxY, y + margin); }
  var v = scene.venue || {};
  if (v.widthMetres > 0 && v.heightMetres > 0 && v.unitsPerMetre > 0) { include(0, 0, 10); include(v.widthMetres * v.unitsPerMetre, v.heightMetres * v.unitsPerMetre, 10); }
  scene.tables.forEach(function(table) {
    [[0,0],[table.width,0],[table.width,table.height],[0,table.height]].forEach(function(point){var p=geometry.tableWorld(table,{x:point[0],y:point[1]});include(p.x,p.y,4);});
    if(table.showName&&table.name)include(table.x+table.width/2,table.y+table.height/2,Math.max(14,table.name.length*8)*textScale);
    layout.seatPositions(table).forEach(function(seat) { var p=geometry.tableWorld(table,seat);include(p.x,p.y,Math.max(36, ((names[seat.personId] || '').length * 7 + 8)*textScale)); });
  });
  (scene.freeSeats||[]).forEach(function(seat) { include(seat.x,seat.y,Math.max(36,((names[seat.personId]||'').length*7+8)*textScale)); });
  (scene.objects || []).forEach(function(object) { var points=object.points||[],left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;points.forEach(function(point) { include(point.x, point.y, 4);left=Math.min(left,point.x);right=Math.max(right,point.x);top=Math.min(top,point.y);bottom=Math.max(bottom,point.y); });if(object.kind==='door'&&points.length>=2)include(points[0].x,points[0].y,Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y)+4);if(object.text&&points.length)include((left+right)/2,(top+bottom)/2,Math.max(14,object.text.length*8)*textScale); });
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 300, height: 200 };
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}
module.exports = { rectangle: rectangle, project: project };
