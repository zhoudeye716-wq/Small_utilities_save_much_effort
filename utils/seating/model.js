'use strict';

var nextId = 0;
function id(prefix) { nextId += 1; return prefix + '-' + Date.now().toString(36) + '-' + nextId.toString(36) + '-' + Math.random().toString(36).slice(2,10); }
function positive(value) { return Number.isFinite(value) && value > 0; }
function createProject(name, projectId) {
  return { version: 1, id: projectId || id('project'), name: String(name || '新座位图'), venue: { widthMetres: null, heightMetres: null }, tables: [], freeSeats: [], people: [], objects: [], assets: {}, exportSettings: {} };
}
function setVenue(project, width, height) {
  if (!positive(width) || !positive(height)) throw new Error('场地长宽必须大于零');
  project.venue = { widthMetres: width, heightMetres: height, unitsPerMetre: positive(project.venue.unitsPerMetre) ? project.venue.unitsPerMetre : 100 };
}
function clearVenue(project) { project.venue = { widthMetres: null, heightMetres: null }; }
function createSeat() { return { id: id('seat'), personId: null }; }
function createTable(type, tableId, options) {
  options = options || {};
  var count = options.seatCount == null ? 8 : options.seatCount;
  if (!Number.isInteger(count) || count < 0 || count > 500) throw new Error('座位数量无效');
  var table = { id: tableId || id('table'), type: type || 'round', name: '', showName: true, x: 0, y: 0, rotation: 0, width: positive(options.width) ? options.width : 160, height: positive(options.height) ? options.height : 100, edges: ['top', 'right', 'bottom', 'left'], seats: [] };
  if (table.type === 'round' && !positive(options.height)) table.height = table.width;
  for (var i = 0; i < count; i++) table.seats.push(createSeat());
  return table;
}
function addPeople(project, input) {
  var names = String(input || '').split(/[\s,，]+/).filter(Boolean), people = [];
  names.forEach(function(name) { var person = { id: id('person'), name: name, note: '' }; project.people.push(person); people.push(person); });
  return people;
}
function createFreeSeat(project, x, y) { if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('座位位置无效'); var seat = createSeat(); seat.x = x; seat.y = y; if (!project.freeSeats) project.freeSeats = []; project.freeSeats.push(seat); return seat; }
function createObject(project, kind, x, y, text) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || ['wall','door','stage','path','text','entry','exit','wc'].indexOf(kind)<0) throw new Error('场地元素无效');
  var labels={stage:'舞台',path:'通道',entry:'入口',exit:'出口',wc:'卫生间'},points;
  if(kind==='wall')points=[{x:x,y:y},{x:x+120,y:y},{x:x+120,y:y+16},{x:x,y:y+16}];
  else if(kind==='door')points=[{x:x,y:y},{x:x+40,y:y}];
  else if(kind==='stage'||kind==='path')points=[{x:x,y:y},{x:x+160,y:y},{x:x+160,y:y+60},{x:x,y:y+60}];
  else points=[{x:x,y:y}];
  var item={id:id('object'),kind:kind,points:points,closed:kind==='wall'||kind==='stage'||kind==='path',text:String(text||labels[kind]||(kind==='text'?'文字':'')),color:kind==='wall'?'#202020':'#46554d',width:2};if(kind==='wall')item.fill='#202020';
  project.objects.push(item);return item;
}
function allSeats(project) { return project.tables.reduce(function(out, table) { return out.concat(table.seats); }, []).concat(project.freeSeats || []); }
function autoAssign(project) {
  var seats = allSeats(project), assigned = Object.create(null), count = 0;
  seats.forEach(function(seat) { if (seat.personId) assigned[seat.personId] = true; });
  var waiting = project.people.filter(function(person) { return !assigned[person.id]; });
  seats.forEach(function(seat) { if (!seat.personId && count < waiting.length) { seat.personId = waiting[count].id; count++; } });
  return { assigned: count, remaining: waiting.length - count };
}
function setTableEdges(table, edges) {
  var valid = ['top', 'right', 'bottom', 'left'];
  if (!Array.isArray(edges) || !edges.length || edges.some(function(edge) { return valid.indexOf(edge) < 0; })) throw new Error('至少选择一条桌边');
  var old = table.edges; table.edges = valid.filter(function(edge) { return edges.indexOf(edge) >= 0; });
  if (!require('./layout').activeSegments(table).length) { table.edges = old; throw new Error('至少保留一条可坐的桌边'); }
}
function toggleSegment(table, index) {
  var shape = require('./layout'), count = table.type === 'round' || table.type === 'oval' ? 4 : shape.outline(table).length;
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error('桌边无效');
  var old = (table.disabledSegments || []).slice(), found = old.indexOf(index);
  table.disabledSegments = found < 0 ? old.concat(index) : old.filter(function(item) { return item !== index; });
  if (!shape.activeSegments(table).length) { table.disabledSegments = old; throw new Error('至少保留一条可坐的桌边'); }
}
function resizeSeats(table, count, confirmed) {
  if (!Number.isInteger(count) || count < 0 || count > 500) throw new Error('座位数量无效');
  var displaced = table.seats.slice(count).map(function(seat) { return seat.personId; }).filter(Boolean);
  if (displaced.length && !confirmed) return displaced;
  table.seats.length = Math.min(table.seats.length, count);
  while (table.seats.length < count) table.seats.push(createSeat());
  return displaced;
}
function movePerson(project, fromId, toId) {
  var seats = allSeats(project), from = seats.find(function(s) { return s.id === fromId; }), to = seats.find(function(s) { return s.id === toId; });
  if (!from || !to || !from.personId) throw new Error('座位无效');
  var current = to.personId; to.personId = from.personId; from.personId = current;
}
module.exports = { createProject: createProject, setVenue: setVenue, clearVenue: clearVenue, toggleSegment: toggleSegment, createFreeSeat: createFreeSeat, createObject:createObject, createTable: createTable, addPeople: addPeople, autoAssign: autoAssign, setTableEdges: setTableEdges, resizeSeats: resizeSeats, movePerson: movePerson, allSeats: allSeats, id: id };
