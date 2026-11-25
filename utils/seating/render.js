'use strict';
var layout = require('./layout');
var geometry = require('./geometry');
var contrast = require('./text-contrast');
function drawScene(ctx, project, options) {
  options = options || {};
  var textScale=Number(options.textScale)||1;
  var palette=options.palette||{},tableFill=palette.table||'#e7ded0',tableStroke=palette.tableStroke||'#796b5c',seatFill=palette.seat||'#fff',seatStroke=palette.seatStroke||'#537f69',textColor=palette.text||'#1f2f26';
  var people = Object.create(null);
  project.people.forEach(function(person) { people[person.id] = person; });
  var tableSeats = project.tables.map(layout.seatPositions);
  function drawSeat(seat, textOnly) {
    if (!textOnly) { ctx.save();ctx.translate(seat.x,seat.y);ctx.rotate(seat.angle||0);ctx.beginPath();ctx.fillStyle=seat.personId?seatStroke:seatFill;ctx.strokeStyle=seat.id===options.targetSeat?'#f4a438':seatStroke;ctx.lineWidth=seat.id===options.targetSeat?4:2;ctx.rect(-7,-5,14,10);ctx.fill();ctx.stroke();ctx.beginPath();ctx.rect(-7,-9,14,3);ctx.fill();ctx.stroke();ctx.restore(); }
    else if (seat.personId && people[seat.personId]) { ctx.fillStyle = textColor; ctx.font = (12*textScale)+'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; if (options.outlineText) { ctx.strokeStyle = contrast.outline(textColor); ctx.lineWidth = 3*textScale;ctx.lineJoin='round'; ctx.strokeText(people[seat.personId].name, seat.x, seat.y - 9); } ctx.fillText(people[seat.personId].name, seat.x, seat.y - 9); }
  }
  function tableTransform(table) { ctx.translate(table.x+table.width/2,table.y+table.height/2);ctx.rotate((table.rotation||0)*Math.PI/180);ctx.translate(-table.width/2,-table.height/2); }
  var venue = project.venue || {};
  if (venue.widthMetres > 0 && venue.heightMetres > 0 && venue.unitsPerMetre > 0) {
    ctx.save(); ctx.strokeStyle = '#becdc1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(0, 0, venue.widthMetres * venue.unitsPerMetre, venue.heightMetres * venue.unitsPerMetre); ctx.stroke(); ctx.restore();
    if(options.showVenueHandle){ctx.save();ctx.beginPath();ctx.fillStyle='#e19b32';ctx.arc(venue.widthMetres*venue.unitsPerMetre,venue.heightMetres*venue.unitsPerMetre,options.handleRadius||8,0,Math.PI*2);ctx.fill();ctx.restore();}
  }
  (project.objects || []).concat(options.draftStroke ? [options.draftStroke] : []).forEach(function(object) {
    if (!object.points || !object.points.length) return;
    ctx.save(); ctx.beginPath(); ctx.strokeStyle = object.color || '#46554d'; ctx.lineWidth = object.width || 2;
    object.points.forEach(function(p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    if(object.kind==='door'&&object.points.length>=2){var a=object.points[0],b=object.points[1],radius=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x);if(radius>0)ctx.arc(a.x,a.y,radius,angle,angle+Math.PI/2);}
    if (object.closed) { ctx.closePath(); ctx.fillStyle = object.fill || 'rgba(215,229,218,0.35)'; ctx.fill(); } ctx.stroke(); ctx.restore();
  });
  project.tables.forEach(function(table) {
    ctx.save(); tableTransform(table); ctx.fillStyle = tableFill; ctx.strokeStyle = tableStroke; ctx.lineWidth = 2; ctx.beginPath();
    if (table.type === 'round' || table.type === 'oval') ctx.ellipse(table.width / 2, table.height / 2, table.width / 2, table.height / 2, 0, 0, 2 * Math.PI);
    else { var outline = layout.outline(table); outline.forEach(function(point, i) { if (i) ctx.lineTo(point[0], point[1]); else ctx.moveTo(point[0], point[1]); }); ctx.closePath(); }
    ctx.fill(); ctx.stroke();
    ctx.restore();
  });
  function eachSeat(textOnly) {
    project.tables.forEach(function(table,index) { ctx.save();if(!textOnly)tableTransform(table);tableSeats[index].forEach(function(seat){if(textOnly){var pos=geometry.tableWorld(table,seat);drawSeat(Object.assign({},seat,pos),true);}else drawSeat(Object.assign({},seat,{angle:Number.isFinite(seat.angle)?seat.angle:Math.atan2(seat.y-table.height/2,seat.x-table.width/2)+Math.PI/2}),false);});ctx.restore(); });
    (project.freeSeats || []).forEach(function(seat) { ctx.save(); drawSeat(seat,textOnly); ctx.restore(); });
  }
  eachSeat(false);
  (project.objects||[]).forEach(function(object){if(!object.text||!object.points||!object.points.length)return;var left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;object.points.forEach(function(p){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);});var x=(left+right)/2,y=(top+bottom)/2;ctx.save();ctx.fillStyle=palette.text||'#263b32';ctx.font=(14*textScale)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';if(options.outlineText){ctx.strokeStyle=contrast.outline(palette.text||'#263b32');ctx.lineWidth=3*textScale;ctx.lineJoin='round';ctx.strokeText(object.text,x,y);}ctx.fillText(object.text,x,y);ctx.restore();});
  project.tables.forEach(function(table) { if(!table.name||!table.showName)return;ctx.save();ctx.translate(table.x,table.y);ctx.fillStyle=palette.text||'#352c25';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=(14*textScale)+'px sans-serif';if(options.outlineText){ctx.strokeStyle=contrast.outline(palette.text||'#352c25');ctx.lineWidth=3*textScale;ctx.lineJoin='round';ctx.strokeText(table.name,table.width/2,table.height/2);}ctx.fillText(table.name,table.width/2,table.height/2);ctx.restore(); });
  eachSeat(true);
}
module.exports = { drawScene: drawScene };
