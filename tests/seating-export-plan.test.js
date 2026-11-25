'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const exp = require('../utils/seating/export-plan');

test('打印米数与 DPI 转像素，宽高保持比例', () => {
  assert.deepEqual(exp.printPixels(0.254, 0.127, 100), { width: 1000, height: 500 });
  assert.equal(exp.linkedHeight(20, 10, 1000), 500);
});

test('超出限制时切块，整数像素边界精确覆盖且无重叠', () => {
  const result = exp.tiles(8500, 4200, 4096, 16000000);
  assert.ok(result.length > 1);
  assert.equal(result.reduce((n, p) => n + p.width * p.height, 0), 8500 * 4200);
  assert.ok(result.every(p => p.width <= 4096 && p.height <= 4096 && p.width * p.height <= 16000000));
  for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
    const a = result[i], b = result[j];
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
});

test('完整适配后只能沿留白方向移动且不能裁掉画面', () => {
  const left = exp.fit(100, 100, 160, 90, 0);
  const right = exp.fit(100, 100, 160, 90, 1);
  assert.deepEqual(left, { x: 0, y: 0, width: 90, height: 90 });
  assert.deepEqual(right, { x: 70, y: 0, width: 90, height: 90 });
});
test('分块打印尺寸按全图比例计算且无间隔', () => {
  const parts=exp.tiles(8000,4000,4000,16000000);
  const descriptions=exp.describeTiles(parts,8000,4000,2,1,'米');
  assert.equal(descriptions.length,2);assert.equal(descriptions[0].printWidth,1);assert.equal(descriptions[1].printWidth,1);
  assert.equal(descriptions[0].printHeight,1);assert.equal(descriptions[0].unit,'米');
});
