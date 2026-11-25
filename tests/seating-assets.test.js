'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const assets = require('../utils/seating/assets');
test('保存图片时使用安全的项目内相对标识', () => {
  const copies = [];
  const api = assets.create({ copy: (from, to) => copies.push([from, to]), remove: () => {} }, '/app/seating-projects', () => 'v1');
  const ref = api.save('/temp/photo.jpg', 'p1', 'background', 'jpg');
  assert.equal(ref, 'p1-background-v1.jpg');
  assert.deepEqual(copies, [['/temp/photo.jpg', '/app/seating-projects/p1-background-v1.jpg']]);
});
test('拒绝目录穿越或不支持的图片类型', () => {
  const api = assets.create({ copy: () => {}, remove: () => {} }, '/root');
  assert.throws(() => api.save('/tmp/p', '../other', 'logo', 'jpg'));
  assert.throws(() => api.save('/tmp/p', 'p1', 'logo', 'exe'));
  assert.throws(() => api.path('../other.jpg'));
});
