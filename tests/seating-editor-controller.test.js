'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');
const editor = require('../utils/seating/editor-controller');

test('编辑人员后撤回恢复上一个完整状态', () => {
  const p = model.createProject('a', 'p');
  const c = editor.create(p);
  c.addPeople('甲 乙');
  assert.equal(c.project().people.length, 2);
  c.undo();
  assert.equal(c.project().people.length, 0);
});
test('删除已安排人员时同时清除座位', () => {
  const p = model.createProject('a', 'p'), t = model.createTable('round', 't', { seatCount: 1 });
  p.tables.push(t); const person = model.addPeople(p, '甲')[0]; t.seats[0].personId = person.id;
  const c = editor.create(p);
  c.deletePerson(person.id);
  assert.equal(c.project().people.length, 0);
  assert.equal(c.project().tables[0].seats[0].personId, null);
});
test('选人列表把未入座人员放在前面，同时保留同名人员', () => {
  const p = model.createProject('a', 'p'), t = model.createTable('rect', 't', { seatCount: 1 });
  p.tables.push(t); const people = model.addPeople(p, '小王 小王'); t.seats[0].personId = people[0].id;
  const rows = editor.create(p).peopleList('小王');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, people[1].id);
  assert.equal(rows[1].id, people[0].id);
});

test('选择已入座人员不会静默覆盖已有人员', () => {
  const p = model.createProject('a', 'p'), t = model.createTable('rect', 't', { seatCount: 2 });
  p.tables.push(t); const people = model.addPeople(p, '甲 乙');
  t.seats[0].personId = people[0].id; t.seats[1].personId = people[1].id;
  const c = editor.create(p);
  assert.throws(() => c.assign(t.seats[1].id, people[0].id, false), /确认/);
  assert.deepEqual(t.seats.map(s => s.personId), [people[0].id, people[1].id]);
  c.assign(t.seats[1].id, people[0].id, true);
  assert.deepEqual(t.seats.map(s => s.personId), [people[1].id, people[0].id]);
});
test('50 桌 500 人可以安排与搜索，每人只安排一次', () => {
  const p = model.createProject('大聚会', 'p');
  for (let i = 0; i < 50; i++) p.tables.push(model.createTable('round', 't' + i, { seatCount: 10 }));
  model.addPeople(p, Array.from({ length: 500 }, (_, i) => '人员' + i).join(' '));
  assert.deepEqual(model.autoAssign(p), { assigned: 500, remaining: 0 });
  assert.equal(new Set(model.allSeats(p).map(s => s.personId)).size, 500);
  const rows = editor.create(p).peopleList('人员499');
  assert.equal(rows.length, 1); assert.equal(rows[0].tableId, 't49');
});
test('移出座位后人员仍在名单中', () => {
  const p = model.createProject('p', 'p'), t = model.createTable('round', 't', { seatCount: 1 });
  p.tables.push(t); const person = model.addPeople(p, '甲')[0]; t.seats[0].personId = person.id;
  editor.create(p).clearSeat(t.seats[0].id);
  assert.equal(t.seats[0].personId, null); assert.equal(p.people[0].id, person.id);
});
test('独立座位上的人员在名单中标记已入座，删除时清空位置', () => {
  const p = model.createProject('p', 'p'), seat = model.createFreeSeat(p, 10, 20), person = model.addPeople(p, '甲')[0]; seat.personId = person.id;
  const c = editor.create(p), rows = c.peopleList('甲');
  assert.equal(rows[0].seated, true); assert.equal(rows[0].tableName, '独立座位');
  c.deletePerson(person.id); assert.equal(seat.personId, null);
});
test('撤回场地编辑不会撤销之后更新的背景和导出设置', () => {
  const p=model.createProject('p','p'),c=editor.create(p);c.addPeople('甲');
  c.project().assets.background='p-background-new.jpg';c.project().exportSettings={position:80};
  c.undo();assert.equal(c.project().people.length,0);assert.equal(c.project().assets.background,'p-background-new.jpg');assert.equal(c.project().exportSettings.position,80);
});
