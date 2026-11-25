'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../utils/seating/viewport');
test('缩放后屏幕坐标和画布坐标可以互相换算', () => {
  const v = { x: 23, y: -12, scale: 2.5 };
  const screen = view.toScreen(v, { x: 70, y: 35 });
  assert.deepEqual(view.toWorld(v, screen), { x: 70, y: 35 });
});
test('缩放以两指中心为锚点，不跳动', () => {
  const v = { x: 10, y: 20, scale: 1 };
  const point = { x: 100, y: 70 };
  const world = view.toWorld(v, point);
  const next = view.zoom(v, point, 2);
  assert.deepEqual(view.toScreen(next, world), point);
});
test('大型场地允许缩小到手机屏幕内', () => {
  const v = view.zoom({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0 }, 0.05);
  assert.equal(v.scale, 0.05);
});
