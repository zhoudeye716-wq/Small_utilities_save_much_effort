'use strict';
var model = require('./model');

function outline(table) {
  var w = table.width, h = table.height, parts=table.parts||{};
  if (table.type === 't') {
    var head=parts.headDepth>0&&parts.headDepth<h?parts.headDepth:h*0.3, stem=parts.stemWidth>0&&parts.stemWidth<w?parts.stemWidth:w*0.3, left=(w-stem)/2, right=(w+stem)/2;
    return [[0,0],[w,0],[w,head],[right,head],[right,h],[left,h],[left,head],[0,head]];
  }
  if (table.type === 'u') {
    var leg=parts.legWidth>0&&parts.legWidth<w/2?parts.legWidth:w*0.3, base=parts.baseDepth>0&&parts.baseDepth<h?parts.baseDepth:h*0.3;
    return [[0,0],[leg,0],[leg,h-base],[w-leg,h-base],[w-leg,0],[w,0],[w,h],[0,h]];
  }
  return [[0,0],[w,0],[w,h],[0,h]];
}
function activeSegments(table) {
  var edges = table.edges || [], disabled = table.disabledSegments || [];
  if (table.type === 'round' || table.type === 'oval') return ['top','right','bottom','left'].map(function(edge,index) { return {index:index,edge:edge}; }).filter(function(item) { return edges.indexOf(item.edge) >= 0 && disabled.indexOf(item.index) < 0; });
  var polygon = outline(table);
  return polygon.map(function(a,index) {
    var b = polygon[(index+1)%polygon.length], dx = b[0]-a[0], dy = b[1]-a[1], length = Math.hypot(dx,dy), nx = length ? dy/length : 0, ny = length ? -dx/length : 0;
    return {index:index,edge:Math.abs(nx)>Math.abs(ny)?(nx>0?'right':'left'):(ny>0?'bottom':'top'),length:length};
  }).filter(function(item) { return item.length && edges.indexOf(item.edge) >= 0 && disabled.indexOf(item.index) < 0; });
}
function nearestSegment(table, x, y, threshold) {
  if (table.type === 'round' || table.type === 'oval') {
    var rx=table.width/2, ry=table.height/2, dx=(x-rx)/rx, dy=(y-ry)/ry, distance=Math.abs(Math.hypot(dx,dy)-1)*Math.min(rx,ry);
    if (distance > threshold) return null;
    var angle=Math.atan2(dy,dx), normalized=(angle+3*Math.PI/4+2*Math.PI)%(2*Math.PI);
    return Math.floor(normalized/(Math.PI/2));
  }
  var poly=outline(table), nearest=null, best=threshold;
  poly.forEach(function(a,index) {
    var b=poly[(index+1)%poly.length], dx=b[0]-a[0], dy=b[1]-a[1], length=dx*dx+dy*dy;
    if (!length) return;
    var t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length)), distance=Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
    if(distance<=best){best=distance;nearest=index;}
  });
  return nearest;
}

function seatPositions(table) {
  var width = table.width, height = table.height, edges = table.edges || [], segments = [];
  if (table.type === 'round' || table.type === 'oval') {
    var arcs = activeSegments(table).map(function(item) { return item.edge; });
    if (!arcs.length) return [];
    return table.seats.map(function(seat, index) {
      var offset = (index + 0.5) * arcs.length / table.seats.length;
      var quarter = ['top', 'right', 'bottom', 'left'].indexOf(arcs[Math.floor(offset)]);
      var angle = -Math.PI * 3 / 4 + quarter * Math.PI / 2 + (offset % 1) * Math.PI / 2;
      return { id: seat.id, personId: seat.personId, x: width / 2 + Math.cos(angle) * (width / 2 + 12) + (seat.offsetX || 0), y: height / 2 + Math.sin(angle) * (height / 2 + 12) + (seat.offsetY || 0) };
    });
  }
  var polygon = outline(table);
  var active = activeSegments(table);
  polygon.forEach(function(a, index) {
    var b = polygon[(index + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (!length) return;
    var nx = dy / length, ny = -dx / length, edge = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'bottom' : 'top');
    if (active.some(function(item) { return item.index === index; })) segments.push({ length: length, a:a, b:b, nx:nx, ny:ny, point: function(t) { return { x: a[0] + dx * t + nx * 12, y: a[1] + dy * t + ny * 12 }; } });
  });
  var total = segments.reduce(function(n, segment) { return n + segment.length; }, 0);
  if (!total) return [];
  if(table.type==='t'||table.type==='u'||table.type==='rect') {
    var groups=[],used=Object.create(null),epsilon=0.0001;
    function same(a,b){return Math.abs(a[0]-b[0])<epsilon&&Math.abs(a[1]-b[1])<epsilon;}
    segments.forEach(function(segment,index){
      if(used[index])return;used[index]=true;var mirrorA=[width-segment.a[0],segment.a[1]],mirrorB=[width-segment.b[0],segment.b[1]],pair=-1;
      for(var j=index+1;j<segments.length;j++)if(!used[j]&&((same(segments[j].a,mirrorA)&&same(segments[j].b,mirrorB))||(same(segments[j].a,mirrorB)&&same(segments[j].b,mirrorA))||(table.type==='rect'&&((same(segments[j].a,[segment.a[0],height-segment.a[1]])&&same(segments[j].b,[segment.b[0],height-segment.b[1]]))||(same(segments[j].a,[segment.b[0],height-segment.b[1]])&&same(segments[j].b,[segment.a[0],height-segment.a[1]])))))){pair=j;break;}
      var members=[index];if(pair>=0){members.push(pair);used[pair]=true;}groups.push({members:members,count:0,length:segment.length});
    });
    var remaining=table.seats.length;
    while(remaining){var best=null,bestScore=-Infinity;groups.forEach(function(group){if(group.members.length>remaining)return;var ideal=table.seats.length*group.length/total,score=ideal-group.count;if(score>bestScore){best=group;bestScore=score;}});if(!best)break;best.count++;remaining-=best.members.length;}
    var counts=segments.map(function(){return 0;});groups.forEach(function(group){group.members.forEach(function(index){counts[index]=group.count;});});
    if(remaining)counts[0]+=remaining;
    var positions=[];segments.forEach(function(segment,index){for(var i=0;i<counts[index];i++){var point=segment.point((i+0.5)/counts[index]);positions.push({x:point.x,y:point.y,angle:Math.atan2(segment.ny,segment.nx)+Math.PI/2});}});
    return table.seats.map(function(seat,index){var p=positions[index];return {id:seat.id,personId:seat.personId,x:p.x+(seat.offsetX||0),y:p.y+(seat.offsetY||0),angle:p.angle};});
  }
  return table.seats.map(function(seat, index) {
    var distance = total * (index + 0.5) / table.seats.length;
    var segment = segments[0];
    for (var i = 0; i < segments.length; i++) { segment = segments[i]; if (distance < segment.length || i === segments.length - 1) break; distance -= segment.length; }
    var point = segment.point(distance / segment.length);
    return { id: seat.id, personId: seat.personId, x: point.x + (seat.offsetX || 0), y: point.y + (seat.offsetY || 0) };
  });
}
function grid(source, rows, columns, horizontalGap, verticalGap) {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || rows * columns > 500 || !Number.isFinite(horizontalGap) || !Number.isFinite(verticalGap) || horizontalGap < 0 || verticalGap < 0) throw new Error('桌子数量或间距无效');
  var result = [],angle=(source.rotation||0)*Math.PI/180,rotatedWidth=Math.abs(Math.cos(angle))*source.width+Math.abs(Math.sin(angle))*source.height,rotatedHeight=Math.abs(Math.sin(angle))*source.width+Math.abs(Math.cos(angle))*source.height;
  for (var row = 0; row < rows; row++) for (var col = 0; col < columns; col++) {
    var copy = JSON.parse(JSON.stringify(source));
    copy.id = model.id('table'); copy.name=''; copy.x = source.x + col * (rotatedWidth + horizontalGap); copy.y = source.y + row * (rotatedHeight + verticalGap);
    copy.seats.forEach(function(seat) { seat.id = model.id('seat'); seat.personId = null; });
    result.push(copy);
  }
  return result;
}
function snap(table, others, threshold) {
  var x = table.x, y = table.y, dx = threshold + 1, dy = threshold + 1;
  others.forEach(function(other) {
    if (other === table || other.id && other.id === table.id || other.type !== table.type) return;
    var offX = other.x + other.width / 2 - (table.x + table.width / 2), offY = other.y + other.height / 2 - (table.y + table.height / 2);
    if (Math.abs(offX) <= threshold && Math.abs(offX) < Math.abs(dx)) dx = offX;
    if (Math.abs(offY) <= threshold && Math.abs(offY) < Math.abs(dy)) dy = offY;
  });
  return { x: x + (Math.abs(dx) <= threshold ? dx : 0), y: y + (Math.abs(dy) <= threshold ? dy : 0) };
}
module.exports = { seatPositions: seatPositions, grid: grid, snap: snap, outline: outline, activeSegments: activeSegments, nearestSegment: nearestSegment };
