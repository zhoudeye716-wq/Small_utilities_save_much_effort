'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');
const layout = require('../utils/seating/layout');

test('自动座位只分布在可坐桌边，关闭桌边不改变人员', () => {
  const table = model.createTable('rect', 't', { width: 100, height: 50, seatCount: 4 });
  table.seats[0].personId = 'p';
  model.setTableEdges(table, ['top']);
  const seats = layout.seatPositions(table);
  assert.equal(seats.length, 4);
  assert.ok(seats.every(s => s.y < 0 && s.x >= 0 && s.x <= 100));
  assert.equal(table.seats[0].personId, 'p');
});

test('批量桌子间距以桌子边缘计算，副本不复制人员', () => {
  const table = model.createTable('rect', 't', { width: 100, height: 50, seatCount: 2 });
  table.name='主桌';table.seats[0].personId = 'person';
  const tables = layout.grid(table, 2, 2, 30, 20);
  assert.equal(tables.length, 4);
  assert.equal(tables[1].x - tables[0].x - 100, 30);
  assert.equal(tables[2].y - tables[0].y - 50, 20);
  assert.ok(tables.every(t => t.seats.every(s => s.personId === null)));
  assert.ok(tables.every(t => t.name === ''));
  assert.equal(new Set(tables.map(t => t.id)).size, 4);
});

test('只吸附同型桌子的水平和垂直中心', () => {
  const target = { type: 'rect', x: 0, y: 0, width: 100, height: 50 };
  const other = { type: 'rect', x: 104, y: 1, width: 100, height: 50 };
  const different = { type: 'round', x: 100, y: 100, width: 100, height: 50 };
  const result = layout.snap(target, [other, different], 5);
  assert.equal(result.x, 0);
  assert.equal(result.y, 1);
});

test('圆桌座位沿椭圆分布，不落在矩形四角', () => {
  const table = model.createTable('round', 't', { width: 100, height: 100, seatCount: 8 });
  const points = layout.seatPositions(table);
  assert.equal(points.length, 8);
  assert.ok(points.every(p => Math.abs(Math.hypot(p.x - 50, p.y - 50) - 62) < 1));
});

test('T 形桌座位按实际轮廓分布，窄桌腿侧边也有座位', () => {
  const table = model.createTable('t', 't', { width: 120, height: 120, seatCount: 24 });
  const points = layout.seatPositions(table);
  assert.ok(points.some(p => p.y > 50 && p.y < 110 && p.x > 20 && p.x < 100));
  assert.ok(points.some(p => p.y < 0));
});
test('T 形桌可单独关闭某一段桌边，保持座位和人员', () => {
  const table = model.createTable('t', 't', { width: 120, height: 120, seatCount: 24 });
  table.seats[0].personId = 'p';
  const before = layout.seatPositions(table);
  model.toggleSegment(table, 0);
  const after = layout.seatPositions(table);
  assert.equal(after.length, 24); assert.equal(table.seats[0].personId, 'p');
  assert.ok(before.some(p => p.y === -12));
  assert.ok(after.every(p => p.y !== -12));
});
test('关闭分段后切换方向不能使所有桌边失效', () => {
  const table = model.createTable('rect', 't', { seatCount: 4 });
  model.toggleSegment(table, 0);
  assert.throws(() => model.setTableEdges(table, ['top']), /桌边/);
  assert.deepEqual(table.edges, ['top', 'right', 'bottom', 'left']);
});
test('点击 T 形桌轮廓可以定位到具体桌边', () => {
  const table = model.createTable('t', 't', {width:120,height:120,seatCount:8});
  assert.equal(layout.nearestSegment(table, 60, 0, 10), 0);
  assert.equal(layout.nearestSegment(table, 42, 80, 10), 5);
  assert.equal(layout.nearestSegment(table, -100, -100, 10), null);
});
test('T 形桌横板厚度和桌腿宽度可以独立调整', () => {
  const table = model.createTable('t', 't', {width:120,height:100,seatCount:0});
  table.parts = { headDepth: 20, stemWidth: 40 };
  const shape = layout.outline(table);
  assert.deepEqual(shape[2], [120,20]);
  assert.deepEqual(shape[4], [80,100]);
  assert.deepEqual(shape[5], [40,100]);
});
test('旋转桌子的批量间距按旋转后外边缘计算', () => {
  const t=model.createTable('rect','t',{width:100,height:50,seatCount:0});t.rotation=90;
  const copies=layout.grid(t,1,2,20,10);
  assert.ok(Math.abs((copies[1].x-copies[0].x)-70)<1e-8);
});
test('T 型和 U 型桌偶数座位左右镜像，椅子垂直于各自桌边', () => {
  for (const type of ['t','u']) for (const count of [6,8,10,12,24]) {
    const table=model.createTable(type,'t',{width:160,height:120,seatCount:count});
    const seats=layout.seatPositions(table);
    assert.equal(seats.length,count);
    for(const seat of seats) {
      assert.ok(seats.some(other=>Math.abs(other.x-(table.width-seat.x))<1e-6&&Math.abs(other.y-seat.y)<1e-6),type+' 座位未镜像');
      assert.ok(Number.isFinite(seat.angle)&&Math.abs(seat.angle/(Math.PI/2)-Math.round(seat.angle/(Math.PI/2)))<1e-8);
    }
  }
});
test('方桌和长桌的座位围绕桌子两条中心线对称', () => {
  const table=model.createTable('rect','t',{width:160,height:100,seatCount:8}),seats=layout.seatPositions(table);
  for(const seat of seats){assert.ok(seats.some(other=>Math.abs(other.x-(160-seat.x))<1e-6&&Math.abs(other.y-seat.y)<1e-6));assert.ok(seats.some(other=>Math.abs(other.x-seat.x)<1e-6&&Math.abs(other.y-(100-seat.y))<1e-6));}
});
