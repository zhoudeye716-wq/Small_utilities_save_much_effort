'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const interaction = require('../utils/seating/style-interaction');

test('屏幕点按输出区域位置和各轴尺寸独立转换，不截断区域外的拖动', () => {
  assert.deepEqual(interaction.toLocalPoint({x: 160, y: 75}, {x: 60, y: 25, width: 200, height: 100}), {x: 0.5, y: 0.5});
  assert.deepEqual(interaction.toLocalPoint({x: 10, y: 175}, {x: 60, y: 25, width: 200, height: 100}), {x: -0.25, y: 1.5});
  assert.equal(interaction.toLocalPoint({x: 1, y: 2}, {x: 0, y: 0, width: 0, height: 1}), null);
});

test('重叠时按 z 和绘制顺序选中最上层，锁定项仍可选', () => {
  const items = [
    {id:'a', rect:{x:0, y:0, width:1, height:1}, z:3},
    {id:'b', rect:{x:0.2, y:0.2, width:0.5, height:0.5}, z:3, locked:true},
    {id:'c', rect:{x:0, y:0, width:1, height:1}, z:2}
  ];
  assert.equal(interaction.hitTest(items, {x:0.4, y:0.4}).id, 'b');
  assert.equal(interaction.hitTest(items, {x:1.1, y:0.4}), null);
  assert.equal(interaction.beginDrag(items[1], {x:0.4, y:0.4}), null);
});

test('拖动保留手指起始偏移并且不修改输入', () => {
  const item = {id:'logo', rect:{x:0.2, y:0.3, width:0.2, height:0.1}};
  const drag = interaction.beginDrag(item, {x:0.25, y:0.35});
  const result = interaction.moveDrag(drag, {x:0.45, y:0.55}, {x:20, y:10, width:400, height:200});
  assert.ok(Math.abs(result.rect.x - 0.4) < 1e-10);
  assert.ok(Math.abs(result.rect.y - 0.5) < 1e-10);
  assert.deepEqual(item.rect, {x:0.2, y:0.3, width:0.2, height:0.1});
  assert.notEqual(result, item);
});

test('极端拖动在非方形小画面中保留元素可见部分', () => {
  const item = {id:'map', rect:{x:0.2, y:0.2, width:0.4, height:0.6}};
  const drag = interaction.beginDrag(item, {x:0.3, y:0.3});
  const bounds = {x:100, y:40, width:120, height:60};
  const low = interaction.moveDrag(drag, {x:-3, y:-3}, bounds);
  const high = interaction.moveDrag(drag, {x:3, y:3}, bounds);
  assert.ok(Math.abs(low.rect.x - (-0.2)) < 1e-10);
  assert.ok(Math.abs(low.rect.y - (-0.2)) < 1e-10);
  assert.equal(high.rect.x, 0.8);
  assert.equal(high.rect.y, 0.6);
});

test('极小元素与画面不会被最小可见像素推出画面', () => {
  const drag = interaction.beginDrag({id:'tiny', rect:{x:0, y:0, width:0.1, height:0.2}}, {x:0, y:0});
  const result = interaction.moveDrag(drag, {x:4, y:-4}, {x:0, y:0, width:10, height:8});
  assert.equal(result.rect.x, 0.9);
  assert.equal(result.rect.y, 0);
});
