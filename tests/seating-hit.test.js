'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');
const layout = require('../utils/seating/layout');
const hit = require('../utils/seating/hit');
test('点击座位优先选择座位而不是其下方桌子', () => {
  const p = model.createProject('p', 'p'), t = model.createTable('round', 't', { width: 100, height: 100, seatCount: 4 });
  p.tables.push(t); const seat = layout.seatPositions(t)[0];
  assert.deepEqual(hit.hitTest(p, seat.x, seat.y, 1), { type: 'seat', tableId: 't', seatId: seat.id });
});
test('空白区域不误选对象', () => {
  const p = model.createProject('p', 'p'); p.tables.push(model.createTable('rect', 't', { seatCount: 0 }));
  assert.equal(hit.hitTest(p, 500, 500, 1), null);
});
test('点击独立座位可以选中', () => {
  const p = model.createProject('p','p'), seat = model.createFreeSeat(p,300,200);
  assert.deepEqual(hit.hitTest(p,300,200,1), {type:'seat',tableId:null,seatId:seat.id});
});
test('旋转后的桌子按实际方向响应点击', () => {
  const p = model.createProject('p','p'), t = model.createTable('rect','t',{width:100,height:40,seatCount:0}); t.rotation = 90; p.tables.push(t);
  assert.deepEqual(hit.hitTest(p,50,65,1), {type:'table',tableId:'t'});
  assert.equal(hit.hitTest(p,5,20,1), null);
});
