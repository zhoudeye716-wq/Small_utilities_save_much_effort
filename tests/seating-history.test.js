'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const history = require('../utils/seating/history');
test('撤回一次完整操作，恢复该操作前的场景快照', () => {
  const h = history.create(3), state = { objects: [] };
  h.record(state);
  state.objects.push({ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  assert.deepEqual(h.undo(), { objects: [] });
  assert.equal(h.undo(), null);
});
test('历史条数有上限', () => {
  const h = history.create(2);
  h.record({ n: 1 }); h.record({ n: 2 }); h.record({ n: 3 });
  assert.equal(h.undo().n, 3); assert.equal(h.undo().n, 2); assert.equal(h.undo(), null);
});
