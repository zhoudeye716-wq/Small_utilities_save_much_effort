'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');

test('新场地未标定，修改场地尺寸不会改变已有桌子的真实尺寸', () => {
  const project = model.createProject('聚会', 'p1');
  assert.equal(project.venue.widthMetres, null);
  const table = model.createTable('rect', 't1', { width: 2, height: 1, seatCount: 4 });
  project.tables.push(table);
  model.setVenue(project, 20, 10);
  assert.ok(project.venue.unitsPerMetre > 0);
  model.setVenue(project, 30, 10);
  assert.equal(project.tables[0].width, 2);
});

test('批量导入允许同名人员，自动安排仅填空位且保留已有位置', () => {
  const project = model.createProject('聚会', 'p1');
  const table = model.createTable('rect', 't1', { seatCount: 2 });
  project.tables.push(table);
  const people = model.addPeople(project, '小王，小王 小李\n小陈');
  assert.equal(people.length, 4);
  assert.notEqual(people[0].id, people[1].id);
  table.seats[1].personId = people[1].id;
  assert.deepEqual(model.autoAssign(project), { assigned: 1, remaining: 2 });
  assert.equal(table.seats[1].personId, people[1].id);
  assert.equal(table.seats[0].personId, people[0].id);
});

test('关闭桌边重排保留人员，最后一边不能关闭', () => {
  const table = model.createTable('rect', 't1', { seatCount: 4 });
  table.seats[0].personId = 'person-1';
  model.setTableEdges(table, ['top']);
  assert.equal(table.seats.length, 4);
  assert.equal(table.seats[0].personId, 'person-1');
  assert.throws(() => model.setTableEdges(table, []));
});

test('人数减少前返回受影响人员，确认后人员仍在名单中', () => {
  const project = model.createProject('聚会', 'p1');
  const table = model.createTable('rect', 't1', { seatCount: 2 });
  project.tables.push(table);
  const people = model.addPeople(project, '甲 乙');
  table.seats[0].personId = people[0].id;
  table.seats[1].personId = people[1].id;
  assert.deepEqual(model.resizeSeats(table, 1, false), [people[1].id]);
  assert.equal(table.seats.length, 2);
  model.resizeSeats(table, 1, true);
  assert.equal(project.people.length, 2);
  assert.equal(table.seats.length, 1);
});

test('拖动到有人座位交换，拖到空座位移动', () => {
  const project = model.createProject('聚会', 'p1');
  const table = model.createTable('rect', 't1', { seatCount: 3 });
  project.tables.push(table);
  table.seats[0].personId = 'a'; table.seats[1].personId = 'b';
  model.movePerson(project, table.seats[0].id, table.seats[1].id);
  assert.deepEqual(table.seats.map(s => s.personId), ['b', 'a', null]);
  model.movePerson(project, table.seats[1].id, table.seats[2].id);
  assert.deepEqual(table.seats.map(s => s.personId), ['b', null, 'a']);
});
test('独立座位不属于桌子，仍可安排人员并与桌旁座位交换', () => {
  const project = model.createProject('聚会', 'p1');
  const table = model.createTable('rect', 't1', { seatCount: 1 }); project.tables.push(table);
  const free = model.createFreeSeat(project, 300, 200); const people = model.addPeople(project, '甲 乙');
  table.seats[0].personId = people[0].id; free.personId = people[1].id;
  model.movePerson(project, free.id, table.seats[0].id);
  assert.equal(free.personId, people[0].id);
  assert.equal(table.seats[0].personId, people[1].id);
  table.x += 100; assert.equal(free.x, 300);
});
test('可以取消场地标定而不改变已经布置的桌子', () => {
  const p=model.createProject('p','p'),t=model.createTable('rect','t',{width:200,height:100});p.tables.push(t);model.setVenue(p,20,10);model.clearVenue(p);
  assert.equal(p.venue.widthMetres,null);assert.equal(t.width,200);
});
test('桌旁座位可单独微调，旋转桌子时偏移仍随桌子转动', () => {
  const layout = require('../utils/seating/layout');
  const geometry = require('../utils/seating/geometry');
  const table = model.createTable('rect', 't', { seatCount: 1 });
  const before = layout.seatPositions(table)[0];
  table.seats[0].offsetX = 15; table.seats[0].offsetY = -7;
  const after = layout.seatPositions(table)[0];
  assert.equal(after.x - before.x, 15); assert.equal(after.y - before.y, -7);
  table.rotation = 90;
  const a = geometry.tableWorld(table, before), b = geometry.tableWorld(table, after);
  assert.ok(Math.abs(b.x-a.x-7)<1e-8); assert.ok(Math.abs(b.y-a.y-15)<1e-8);
});
