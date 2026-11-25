'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');
const bounds = require('../utils/seating/bounds');
test('全图范围包含桌子及周围座位，不按屏幕大小裁切', () => {
  const p = model.createProject('p', 'p'), t = model.createTable('round', 't', { width: 100, height: 100, seatCount: 8 });
  t.x = 500; t.y = 200; p.tables.push(t);
  const b = bounds.project(p);
  assert.ok(b.x < 500 && b.y < 200);
  assert.ok(b.x + b.width > 600 && b.y + b.height > 300);
});
test('框选从任意方向拖动，归一化后的宽高始终为正', () => {
  assert.deepEqual(bounds.rectangle({x:10,y:30},{x:-10,y:10}), {x:-10,y:10,width:20,height:20});
});
test('全图边界为长姓名保留足够空间', () => {
  const p = model.createProject('p', 'p'), t = model.createTable('rect', 't', { width: 100, height: 100, seatCount: 1 });
  p.tables.push(t); t.seats[0].personId = model.addPeople(p, '非常非常非常非常长的名字')[0].id;
  const b = bounds.project(p);
  const s = require('../utils/seating/layout').seatPositions(t)[0];
  assert.ok(b.x <= s.x - 60 && b.x + b.width >= s.x + 60);
});
test('全图导出范围包括远离桌子的独立座位', () => {
  const p = model.createProject('p','p'); model.createFreeSeat(p,1000,800);
  const b = bounds.project(p); assert.ok(b.x < 1000 && b.y < 800 && b.x+b.width > 1000);
});
test('旋转后的长桌不会被全图导出范围裁切', () => {
  const p=model.createProject('p','p'),t=model.createTable('rect','t',{width:300,height:40,seatCount:0});t.rotation=90;p.tables.push(t);
  const b=bounds.project(p);assert.ok(b.y < -100 && b.y+b.height > 140);
});
test('单独的文字元素导出时为文字留出足够宽度', () => {
  const p=model.createProject('p','p');model.createObject(p,'text',0,0,'这是一段比较长的说明文字');
  const b=bounds.project(p);assert.ok(b.width>100);
});
test('全图范围包含长桌名', () => {
  const p=model.createProject('p','p'),t=model.createTable('rect','t',{width:60,height:40,seatCount:0});
  t.name='这是一张名字特别特别长的聚会桌子';p.tables.push(t);
  const b=bounds.project(p);assert.ok(b.x<=t.x+t.width/2-t.name.length*7);assert.ok(b.x+b.width>=t.x+t.width/2+t.name.length*7);
});
test('门的开启弧线包含在全图导出范围', () => {
  const p=model.createProject('p','p');model.createObject(p,'door',0,0);
  const b=bounds.project(p);assert.ok(b.y+b.height>=40);
});
test('放大图中文字时全图范围为长桌名预留额外空间', () => {
  const p=model.createProject('p','p'),t=model.createTable('rect','t',{width:60,height:40,seatCount:0});t.name='非常长的聚会桌子';p.tables.push(t);
  assert.ok(bounds.project(p,{textScale:2}).width>bounds.project(p,{textScale:1}).width);
});
