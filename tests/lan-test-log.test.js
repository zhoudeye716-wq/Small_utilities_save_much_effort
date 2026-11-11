const test = require('node:test');
const assert = require('node:assert/strict');
const Log = require('../utils/lan-test/log');

test('日志保留错误并标记截断，存储异常不影响当前报告', () => {
  const log = new Log({ getStorageSync() {}, setStorageSync() { throw new Error('full'); } }, 3);
  log.add('error', '连接失败', 'detail');
  assert.match(log.items[0].time, /\.\d{3}$/);
  for (let i = 0; i < 5; i++) log.add('info', '事件', String(i));
  log.report = { state: 'partial' };
  assert.equal(log.items.length, 3);
  assert.equal(log.items.some(item => item.level === 'error'), true);
  assert.equal(log.dropped, 3);
  assert.equal(log.save(), false);
  assert.equal(log.report.state, 'partial');
});

test('清空日志后保留旧结果供查看，但标为清理前的结果', () => {
  let saved;
  const storage = { getStorageSync() { return saved; }, setStorageSync(key, value) { saved = value; } };
  const log = new Log(storage);
  log.add('info', '旧日志', '之前的内容');
  log.report = { id: 'old' };
  log.clear();
  assert.equal(log.items.length, 0);
  assert.equal(log.report.id, 'old');
  assert.equal(log.reportBeforeClear, true);
  assert.equal(log.save(), true);
  assert.equal(new Log(storage).reportBeforeClear, true);
});
