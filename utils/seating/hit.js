'use strict';
var layout = require('./layout');
var geometry = require('./geometry');
function polygonContains(poly, x, y) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function hitTest(project, x, y, scale) {
  var radius = Math.max(8, 18 / (scale || 1));
  var free=project.freeSeats||[];
  for(var n=free.length-1;n>=0;n--)if(Math.hypot(x-free[n].x,y-free[n].y)<=radius)return {type:'seat',tableId:null,seatId:free[n].id};
  for (var i = project.tables.length - 1; i >= 0; i--) {
    var table = project.tables[i], local=geometry.tableLocal(table,{x:x,y:y}),px=local.x,py=local.y,seats = layout.seatPositions(table);
    for (var j = 0; j < seats.length; j++) if (Math.hypot(px - seats[j].x, py - seats[j].y) <= radius) return { type: 'seat', tableId: table.id, seatId: seats[j].id };
  }
  for (var k = project.tables.length - 1; k >= 0; k--) {
    var t = project.tables[k], point=geometry.tableLocal(t,{x:x,y:y}),tx=point.x,ty=point.y;
    var contains = t.type === 'round' || t.type === 'oval' ? Math.pow((tx - t.width / 2) / (t.width / 2), 2) + Math.pow((ty - t.height / 2) / (t.height / 2), 2) <= 1 : polygonContains(layout.outline(t), tx, ty);
    if (contains) return { type: 'table', tableId: t.id };
  }
  var objects=project.objects||[];
  for(var n=objects.length-1;n>=0;n--){
    var object=objects[n],points=object.points||[];
    if(points.length===1&&Math.abs(x-points[0].x)<=Math.max(20,(object.text||'').length*7)&&Math.abs(y-points[0].y)<=radius)return {type:'object',objectId:object.id};
    if(object.closed&&points.length>2&&polygonContains(points.map(function(p){return [p.x,p.y];}),x,y))return {type:'object',objectId:object.id};
    for(var q=1;q<points.length;q++){var a=points[q-1],b=points[q],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len)):0;if(Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=radius)return {type:'object',objectId:object.id};}
  }
  return null;
}
module.exports = { hitTest: hitTest };
