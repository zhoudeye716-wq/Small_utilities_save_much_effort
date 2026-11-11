var test = require('node:test');
var assert = require('node:assert/strict');
var Room = require('../utils/lan-test/room.js');

function network() {
  var sockets = [];
  var nextPort = 50000;
  function create(address) {
    return function () {
      var socket = { address: address };
      socket.onMessage = function (fn) { socket.message = fn; };
      socket.onError = function (fn) { socket.error = fn; };
      socket.bind = function (port) {
        socket.port = port || nextPort++;
        sockets.push(socket);
        return socket.port;
      };
      socket.send = function (data) {
        sockets.slice().forEach(function (peer) {
          if (peer !== socket && peer.port === data.port &&
              (data.address === '255.255.255.255' || data.address === peer.address)) {
            peer.message({ message: data.message, remoteInfo: { address: address, port: socket.port } });
          }
        });
      };
      socket.close = function () { sockets = sockets.filter(function (item) { return item !== socket; }); };
      return socket;
    };
  }
  return { create: create };
}

function room(factory, id) {
  return new Room({ createSocket: factory, id: id, name: id, onState: function () {}, onLog: function () {} });
}

test('广播搜索、去重、握手、双向消息和离开', function () {
  var net = network();
  var host = room(net.create('192.168.1.1'), 'host');
  var guest = room(net.create('192.168.1.2'), 'guest');
  var received;
  host.onPacket = function (packet) { received = packet; };
  host.createRoom();
  guest.searchRooms();
  guest.discover();
  guest.discover();
  assert.equal(guest.snapshot().rooms.length, 1);
  guest.joinRoom(guest.snapshot().rooms[0]);
  assert.equal(guest.snapshot().status, 'joined');
  assert.equal(host.snapshot().members.length, 1);
  guest.sendTo('host', { type: 'message', text: '你好' });
  assert.equal(received.text, '你好');
  guest.leaveRoom();
  assert.equal(host.snapshot().members.length, 0);
  host.close();
  guest.close();
});

test('手动加入不依赖广播，绑端口失败能报告错误', function () {
  var net = network();
  var host = room(net.create('192.168.1.1'), 'host');
  var guest = room(net.create('192.168.1.2'), 'guest');
  host.createRoom();
  guest.joinRoom({ address: '192.168.1.1', port: Room.PORT });
  assert.equal(guest.snapshot().status, 'joined');
  host.close();
  guest.close();
  var failing = room(function () { return { onMessage: function () {}, onError: function () {}, bind: function () { throw Error('occupied'); }, close: function () {} }; }, 'fail');
  assert.equal(failing.createRoom(), false);
  assert.equal(failing.snapshot().status, 'error');
});

test('异步 UDP 端口错误不能继续显示房间可用', function () {
  var handler;
  var host = room(function () { return { onMessage: function () {}, onError: function (fn) { handler = fn; }, bind: function () { return Room.PORT; }, close: function () {} }; }, 'host');
  host.createRoom();
  handler({ errMsg: 'bind EADDRINUSE' });
  assert.equal(host.snapshot().status, 'error');
  assert.equal(host.snapshot().roomId, '');
  host.close();
});

test('连接超时记录目标与时长并自动重新握手', function () {
  var net = network(), logs = [];
  var host = room(net.create('192.168.1.1'), 'host');
  var guest = room(net.create('192.168.1.2'), 'guest');
  guest.onLog = function (level, stage, detail) { logs.push({ level: level, stage: stage, detail: detail }); };
  host.createRoom();
  guest.joinRoom({ address: '192.168.1.1', port: Room.PORT });
  guest.host.seen = Date.now() - 13000;
  guest.tick();
  assert.equal(guest.status, 'disconnected');
  assert.match(logs.find(function (log) { return log.stage === '连接超时'; }).detail, /192\.168\.1\.1:43219.*原因未确认/);
  guest.reconnectAt = Date.now() - 1;
  guest.tick();
  assert.equal(guest.status, 'joined');
  assert.equal(logs.some(function (log) { return log.stage === '自动重连'; }), true);
  guest.close(); host.close();
});

test('房主 socket 报错后恢复时沿用房间编号', function () {
  var sockets = [];
  var host = room(function () {
    var socket = { onMessage: function () {}, onError: function (fn) { this.error = fn; }, bind: function () { return Room.PORT; }, close: function () {}, send: function () {} };
    sockets.push(socket);
    return socket;
  }, 'host');
  host.createRoom();
  var id = host.roomId;
  sockets[0].error({ errMsg: 'socket closed' });
  assert.equal(host.status, 'error');
  host.resume();
  assert.equal(host.status, 'hosting');
  assert.equal(host.roomId, id);
  host.close();
});

test('网络切换中断后可以使用原房间编号重新绑定', function () {
  var host = room(network().create('192.168.1.1'), 'host');
  host.createRoom();
  var id = host.roomId;
  host.networkInterrupted('Wi-Fi 切换');
  assert.equal(host.status, 'error');
  host.resume();
  assert.equal(host.status, 'hosting');
  assert.equal(host.roomId, id);
  host.close();
});

test('房主恢复检查只有收到成员回复后才记录成功', function () {
  var net = network(), logs = [];
  var host = room(net.create('192.168.1.1'), 'host');
  var guest = room(net.create('192.168.1.2'), 'guest');
  host.onLog = function (level, stage, detail) { logs.push({ level: level, stage: stage, detail: detail }); };
  host.createRoom();
  guest.joinRoom({ address: '192.168.1.1', port: Room.PORT });
  host.resume();
  assert.equal(logs.some(function (item) { return item.stage === '恢复检查成功' && item.detail.includes('192.168.1.2'); }), true);
  guest.close(); host.close();
});
