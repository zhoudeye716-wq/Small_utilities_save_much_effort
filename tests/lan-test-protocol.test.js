var test = require('node:test');
var assert = require('node:assert/strict');
var protocol = require('../utils/lan-test/protocol.js');

test('报文支持中文并按 UTF-8 实际长度校验', function () {
  var packet = protocol.encode({ type: 'message', sender: 'a', text: '测试' });
  assert.equal(protocol.decode(packet).text, '测试');
  assert.throws(function () {
    protocol.encode({ type: 'message', sender: 'a', text: '字'.repeat(1400) });
  }, /4096/);
});

test('损坏、未知版本和未知类型不应进入业务', function () {
  assert.equal(protocol.decode(new Uint8Array([255]).buffer), null);
  assert.equal(protocol.decode(protocol.encode({ type: 'ping', sender: 'a' })).type, 'ping');
  assert.equal(protocol.decode(new TextEncoder().encode('{"v":9,"type":"ping","sender":"a"}').buffer), null);
  assert.equal(protocol.decode(new TextEncoder().encode('{"v":1,"type":"other","sender":"a"}').buffer), null);
});
