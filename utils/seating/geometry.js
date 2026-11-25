'use strict';
function snapAngle(value) { if(!Number.isFinite(value))return value;var target=Math.round(value/90)*90;return Math.abs(value-target)<=6?target:value; }
function snapObjectToVenue(item,venue,threshold){
  if(!item||['wall','door'].indexOf(item.kind)<0||!Array.isArray(item.points)||!item.points.length||!venue||!(venue.widthMetres>0&&venue.heightMetres>0&&venue.unitsPerMetre>0)||!(threshold>=0))return null;
  var xs=item.points.map(function(p){return p.x;}),ys=item.points.map(function(p){return p.y;}),w=venue.widthMetres*venue.unitsPerMetre,h=venue.heightMetres*venue.unitsPerMetre;
  var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys),options=[];
  if(maxY>=0&&minY<=h)[0,w].forEach(function(edge){options.push({axis:'x',edge:edge,delta:edge-minX},{axis:'x',edge:edge,delta:edge-maxX});});
  if(maxX>=0&&minX<=w)[0,h].forEach(function(edge){options.push({axis:'y',edge:edge,delta:edge-minY},{axis:'y',edge:edge,delta:edge-maxY});});
  options.sort(function(a,b){return Math.abs(a.delta)-Math.abs(b.delta);});
  if(!options.length)return null;
  var best=options[0];if(Math.abs(best.delta)>threshold)return null;
  return {dx:best.axis==='x'?best.delta:0,dy:best.axis==='y'?best.delta:0,axis:best.axis,edge:best.edge};
}
function toMetres(value, unitsPerMetre) {
  if (!Number.isFinite(value) || !Number.isFinite(unitsPerMetre) || unitsPerMetre <= 0) return null;
  return value / unitsPerMetre;
}
function toWorld(value, unitsPerMetre) {
  if (!Number.isFinite(value) || !Number.isFinite(unitsPerMetre) || unitsPerMetre <= 0) return null;
  return value * unitsPerMetre;
}
function tableWorld(table, point) {
  var angle=(table.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=point.x-table.width/2,y=point.y-table.height/2;
  return {x:table.x+table.width/2+x*c-y*s,y:table.y+table.height/2+x*s+y*c};
}
function tableLocal(table, point) {
  var angle=-(table.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=point.x-table.x-table.width/2,y=point.y-table.y-table.height/2;
  return {x:table.width/2+x*c-y*s,y:table.height/2+x*s+y*c};
}
function transformPoints(points,width,height,rotation) {
  if(!Array.isArray(points)||!points.length||!Number.isFinite(width)||width<0||!Number.isFinite(height)||height<0||!Number.isFinite(rotation))throw new Error('元素尺寸无效');
  var left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;points.forEach(function(p){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);});
  if((right>left&&width<=0)||(bottom>top&&height<=0))throw new Error('元素尺寸必须大于零');
  var cx=(left+right)/2,cy=(top+bottom)/2,sx=right>left?width/(right-left):1,sy=bottom>top?height/(bottom-top):1,angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return points.map(function(p){var x=(p.x-cx)*sx,y=(p.y-cy)*sy;return {x:cx+x*c-y*s,y:cy+x*s+y*c};});
}
module.exports = { snapAngle:snapAngle,snapObjectToVenue:snapObjectToVenue,toMetres: toMetres, toWorld: toWorld, tableWorld:tableWorld,tableLocal:tableLocal,transformPoints:transformPoints };
