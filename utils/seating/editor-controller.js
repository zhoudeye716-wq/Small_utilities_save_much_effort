'use strict';
var model = require('./model');
var history = require('./history');
function create(initial) {
  var project = initial, stack = history.create(30);
  function change(action) { stack.record(project); return action(); }
  function findSeat(personId) {
    for (var i = 0; i < project.tables.length; i++) {
      var table = project.tables[i];
      for (var j = 0; j < table.seats.length; j++) if (table.seats[j].personId === personId) return { table: table, seat: table.seats[j] };
    }
    var free = (project.freeSeats || []).find(function(seat) { return seat.personId === personId; });
    if (free) return { table: null, seat: free };
    return null;
  }
  return {
    project: function() { return project; },
    undo: function() { var previous = stack.undo(); if (previous) { previous.assets = project.assets; previous.exportSettings = project.exportSettings; project = previous; } return !!previous; },
    mutate: function(fn) { return change(function() { return fn(project); }); },
    addPeople: function(text) { return change(function() { return model.addPeople(project, text); }); },
    deletePerson: function(personId) { return change(function() { var found = findSeat(personId); if (found) found.seat.personId = null; project.people = project.people.filter(function(p) { return p.id !== personId; }); }); },
    clearSeat: function(seatId) { var seat = model.allSeats(project).find(function(s) { return s.id === seatId; }); if (!seat) throw new Error('座位不存在'); if (seat.personId) change(function() { seat.personId = null; }); },
    assign: function(seatId, personId, confirmed) {
      var target = model.allSeats(project).find(function(seat) { return seat.id === seatId; });
      if (!target || !project.people.some(function(person) { return person.id === personId; })) throw new Error('座位或人员不存在');
      if (target.personId === personId) return;
      var from = findSeat(personId);
      if ((from || target.personId) && !confirmed) throw new Error('需要确认移动或交换');
      return change(function() { var old = target.personId; target.personId = personId; if (from) from.seat.personId = old; });
    },
    peopleList: function(query) {
      var term = String(query || '').trim().toLowerCase(),occupied=Object.create(null);
      project.tables.forEach(function(table,index){table.seats.forEach(function(seat){if(seat.personId)occupied[seat.personId]={table:table,seat:seat,index:index};});});
      (project.freeSeats||[]).forEach(function(seat){if(seat.personId)occupied[seat.personId]={table:null,seat:seat};});
      return project.people.map(function(person, index) {
        var found = occupied[person.id];
        return { id: person.id, name: person.name, note: person.note || '', seated: !!found, tableId: found && found.table ? found.table.id : null, seatId: found ? found.seat.id : null, tableName: found ? (found.table ? (found.table.name || '桌子 ' + (found.index + 1)) : '独立座位') : '', order: index };
      }).filter(function(p) { return !term || (p.name + ' ' + p.note).toLowerCase().indexOf(term) >= 0; }).sort(function(a, b) { return Number(a.seated) - Number(b.seated) || a.order - b.order; });
    }
  };
}
module.exports = { create: create };
