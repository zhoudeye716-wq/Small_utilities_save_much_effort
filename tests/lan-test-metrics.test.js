var test = require('node:test');
var assert = require('node:assert/strict');
var metrics = require('../utils/lan-test/metrics.js');

test('往返延迟的空结果、分位数和超时数', function () {
  assert.equal(metrics.latency(2, []).average, null);
  var result = metrics.latency(5, [40, 10, 20, 30]);
  assert.equal(result.average, 25);
  assert.equal(result.median, 25);
  assert.equal(result.p95, 40);
  assert.equal(result.timeouts, 1);
});

test('只统计目标测试的唯一序号，识别重复和乱序', function () {
  var receiver = metrics.createReceiver('run-a');
  receiver.receive({ run: 'other', seq: 0, bytes: 20 }, 100);
  receiver.receive({ run: 'run-a', seq: 2, bytes: 20 }, 110);
  receiver.receive({ run: 'run-a', seq: 0, bytes: 20 }, 120);
  receiver.receive({ run: 'run-a', seq: 0, bytes: 20 }, 125);
  receiver.receive({ run: 'run-a', seq: 1, bytes: 20 }, 130);
  var result = receiver.result(4);
  assert.equal(result.unique, 3);
  assert.equal(result.duplicate, 1);
  assert.equal(result.outOfOrder, 2);
  assert.equal(result.missing, 1);
  assert.equal(result.bytes, 60);
  assert.equal(result.elapsedMs, 20);
});
