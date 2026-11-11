var protocol = require('./protocol.js');
var PORT = 43219;
var BROADCAST = '255.255.255.255';
var ROOM_TTL = 6000;
var PEER_TTL = 12000;

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function Room(options) {
  this.createSocket = options.createSocket;
  this.id = options.id || makeId();
  this.name = options.name || '设备';
  this.onState = options.onState || function () {};
  this.onLog = options.onLog || function () {};
  this.onPacket = options.onPacket || function () {};
  this.status = 'idle';
  this.role = '';
  this.rooms = {};
  this.members = {};
  this.host = null;
  this.socket = null;
}

Room.prototype.snapshot = function () {
  var self = this;
  return {
    status: this.status, role: this.role, roomId: this.roomId || '',
    roomName: this.roomName || '', port: this.port || 0,
    rooms: Object.keys(this.rooms).map(function (key) { return self.rooms[key]; }),
    members: Object.keys(this.members).map(function (key) { return self.members[key]; }),
    host: this.host, remoteMembers: this.remoteMembers || []
  };
};

Room.prototype.emit = function () { this.onState(this.snapshot()); };
Room.prototype.log = function (level, stage, detail) { this.onLog(level, stage, detail || ''); };

Room.prototype.open = function (port) {
  var self = this;
  try {
    this.socket = this.createSocket();
    if (!this.socket || typeof this.socket.onMessage !== 'function') throw new Error('UDP 接口未返回可用的 socket');
    var socket = this.socket;
    this.socket.onMessage(function (event) { self.receive(event); });
    this.socket.onError(function (event) {
      if (self.socket !== socket) return;
      self.log('error', 'UDP 接口错误', JSON.stringify(event));
      var recovery = { role: self.role, roomId: self.roomId, roomName: self.roomName, host: self.host && Object.assign({}, self.host) };
      self.close(false);
      self.recovery = recovery;
      self.status = 'error';
      self.emit();
    });
    this.port = this.socket.bind(port);
    if (!this.port) throw new Error('未能绑定 UDP 端口');
    this.log('info', 'UDP 绑定', '端口 ' + this.port);
    return true;
  } catch (error) {
    this.log('error', 'UDP 绑定失败', String(error.message || error));
    this.close();
    this.status = 'error';
    this.emit();
    return false;
  }
};

Room.prototype.send = function (packet, address, port) {
  if (!this.socket || !address || !port) return false;
  try {
    var message = protocol.encode(Object.assign({ sender: this.id }, packet));
    this.socket.send({ address: address, port: Number(port), message: message, setBroadcast: address === BROADCAST });
    return true;
  } catch (error) {
    this.log('error', '发送失败', address + ':' + port + ' ' + String(error.message || error));
    return false;
  }
};

Room.prototype.createRoom = function () {
  this.recovery = null;
  this.close();
  this.roomId = makeId();
  this.roomName = this.name + '的房间';
  this.role = 'host';
  if (!this.open(PORT)) return false;
  this.status = 'hosting';
  this.log('info', '创建房间', this.roomId);
  this.startMaintenance();
  this.emit();
  return true;
};

Room.prototype.searchRooms = function () {
  this.recovery = null;
  this.close();
  this.rooms = {};
  this.role = 'guest';
  if (!this.open()) return false;
  this.status = 'searching';
  this.searchUntil = Date.now() + 15000;
  this.log('info', '开始搜索', '广播端口 ' + PORT);
  this.startMaintenance();
  this.discover();
  this.emit();
  return true;
};

Room.prototype.discover = function () {
  if (this.socket) this.send({ type: 'discover' }, BROADCAST, PORT);
};

Room.prototype.joinRoom = function (target) {
  if (!target || !target.address || !Number(target.port)) return false;
  if (!this.socket) {
    this.close();
    this.role = 'guest';
    if (!this.open()) return false;
    this.startMaintenance();
  }
  this.host = { id: target.hostId || '', address: target.address, port: Number(target.port), name: target.name || '房主' };
  this.requestId = makeId();
  this.roomId = target.room || '';
  this.status = 'joining';
  this.joinDeadline = Date.now() + 5000;
  this.lastJoin = 0;
  this.log('info', '发起加入', target.address + ':' + target.port);
  this.emit();
  this.tryJoin();
  return true;
};

Room.prototype.tryJoin = function () {
  this.lastJoin = Date.now();
  this.send({ type: 'join', room: this.roomId || '', request: this.requestId, name: this.name }, this.host.address, this.host.port);
};

Room.prototype.sendTo = function (id, packet) {
  var peer = this.role === 'host' ? this.members[id] : this.host && this.host.id === id ? this.host : null;
  if (!peer) return false;
  return this.send(Object.assign({}, packet, { room: this.roomId }), peer.address, peer.port);
};

Room.prototype.broadcastMembers = function () {
  var self = this;
  var list = Object.keys(this.members).map(function (id) { return { id: id, name: self.members[id].name }; });
  Object.keys(this.members).forEach(function (id) {
    self.sendTo(id, { type: 'members', list: list });
  });
};

Room.prototype.receive = function (event) {
  var packet = protocol.decode(event.message);
  var remote = event.remoteInfo;
  if (!packet || !remote || packet.sender === this.id) return;
  var now = Date.now();
  if (packet.type === 'discover' && this.status === 'hosting') {
    this.send({ type: 'advertise', room: this.roomId, name: this.roomName }, remote.address, remote.port);
  } else if (packet.type === 'advertise' && this.status === 'searching' && packet.room) {
    this.rooms[packet.room] = { room: packet.room, hostId: packet.sender, name: String(packet.name || '房间').slice(0, 32), address: remote.address, port: remote.port, seen: now };
    this.emit();
  } else if (packet.type === 'join' && this.status === 'hosting') {
    if (packet.room && packet.room !== this.roomId) return;
    if (typeof packet.request !== 'string' || packet.request.length > 64) return;
    var exists = !!this.members[packet.sender];
    this.members[packet.sender] = { id: packet.sender, name: String(packet.name || '成员').slice(0, 24), address: remote.address, port: remote.port, seen: now };
    this.sendTo(packet.sender, { type: 'welcome', request: packet.request, name: this.roomName });
    if (!exists) this.log('info', '成员加入', packet.sender + ' ' + remote.address + ':' + remote.port);
    this.broadcastMembers();
    this.emit();
  } else if (packet.type === 'welcome' && this.status === 'joining') {
    if (packet.request !== this.requestId || remote.address !== this.host.address || Number(remote.port) !== this.host.port) return;
    if (this.roomId && packet.room !== this.roomId) return;
    this.roomId = packet.room;
    this.roomName = String(packet.name || '房间').slice(0, 32);
    this.host.id = packet.sender;
    this.host.seen = now;
    this.status = 'joined';
    this.reconnectAttempts = 0;
    this.reconnectAt = 0;
    this.log('info', '加入成功', '房间 ' + this.roomId + '，房主 ' + this.host.address + ':' + this.host.port);
    this.emit();
  } else if (this.status === 'joined' && packet.sender === this.host.id && packet.room === this.roomId &&
             remote.address === this.host.address && Number(remote.port) === this.host.port) {
    this.host.seen = now;
    if (packet.type === 'members' && Array.isArray(packet.list)) {
      this.remoteMembers = packet.list.slice(0, 30);
      this.emit();
    } else if (packet.type === 'heartbeat_probe') {
      this.sendTo(this.host.id, { type: 'heartbeat' });
    } else if (packet.type === 'bye') {
      this.status = 'disconnected';
      this.log('error', '房主已离开', '连接已断开');
      this.emit();
    } else if (packet.type !== 'heartbeat') this.onPacket(packet, this.host);
  } else if (this.status === 'hosting' && this.members[packet.sender] && packet.room === this.roomId) {
    var peer = this.members[packet.sender];
    if (remote.address !== peer.address || Number(remote.port) !== peer.port) return;
    peer.seen = now;
    if (packet.type === 'heartbeat') {
      if (peer.awaitingProbe) {
        this.log('info', '恢复检查成功', peer.name + ' ' + peer.address + ':' + peer.port + '，等待回复 ' + (now - peer.awaitingProbe) + ' 毫秒');
        delete peer.awaitingProbe;
      }
      this.sendTo(packet.sender, { type: 'heartbeat' });
    }
    else if (packet.type === 'bye') {
      delete this.members[packet.sender];
      this.log('info', '成员离开', packet.sender);
      this.broadcastMembers();
      this.emit();
    } else this.onPacket(packet, peer);
  }
};

Room.prototype.startMaintenance = function () {
  var self = this;
  clearInterval(this.maintenance);
  this.maintenance = setInterval(function () { self.tick(); }, 1000);
};

Room.prototype.networkInterrupted = function (detail) {
  if (this.role !== 'host' && !(this.role === 'guest' && this.host)) return;
  var saved = { role: this.role, roomId: this.roomId, roomName: this.roomName, host: this.host && Object.assign({}, this.host) };
  this.log('error', '网络中断', String(detail || '网络状态发生变化') + '；原房间信息已保留，等待网络恢复');
  this.close(false);
  this.recovery = saved;
  this.status = 'error';
  this.emit();
};

Room.prototype.resume = function () {
  var self = this;
  if (this.status === 'error' && this.recovery) {
    var saved = this.recovery;
    this.recovery = null;
    if (saved.role === 'host' && saved.roomId) {
      this.role = 'host'; this.roomId = saved.roomId; this.roomName = saved.roomName;
      this.log('info', '恢复房主连接', '尝试重新绑定端口并保留房间编号 ' + saved.roomId);
      if (this.open(PORT)) { this.status = 'hosting'; this.startMaintenance(); this.emit(); }
      else this.recovery = saved;
    } else if (saved.role === 'guest' && saved.host) {
      this.log('info', '恢复成员连接', '尝试重新连接 ' + saved.host.address + ':' + saved.host.port);
      if (!this.joinRoom({ address: saved.host.address, port: saved.host.port, hostId: saved.host.id, name: saved.host.name, room: saved.roomId })) this.recovery = saved;
    } else this.log('info', '恢复后房间状态', '没有可恢复的房间');
  } else if ((this.status === 'joined' || this.status === 'disconnected') && this.role === 'guest' && this.host) {
    var target = { address: this.host.address, port: this.host.port, hostId: this.host.id, name: this.host.name, room: this.roomId };
    this.reconnectAttempts = 0;
    this.log('info', '恢复后重新握手', '目标 ' + target.address + ':' + target.port + '，等待房主确认');
    this.joinRoom(target);
  } else if (this.status === 'hosting') {
    var now = Date.now();
    var ids = Object.keys(this.members);
    this.log('info', '恢复后检查成员', '向 ' + ids.length + ' 台设备发送检查，等待回复');
    ids.forEach(function (id) {
      self.members[id].seen = now;
      self.members[id].awaitingProbe = now;
      self.sendTo(id, { type: 'heartbeat_probe' });
    });
  } else {
    this.log('info', '恢复后房间状态', '当前状态：' + this.status + '；未确认存在可恢复的连接');
  }
};

Room.prototype.tick = function () {
  var now = Date.now();
  var self = this;
  if (this.status === 'searching') {
    Object.keys(this.rooms).forEach(function (id) { if (now - self.rooms[id].seen > ROOM_TTL) delete self.rooms[id]; });
    if (now < this.searchUntil) this.discover();
    else { this.status = 'search_done'; this.log('info', '搜索结束', '房间数 ' + Object.keys(this.rooms).length); }
    this.emit();
  } else if (this.status === 'joining') {
    if (now >= this.joinDeadline) {
      this.status = 'disconnected';
      this.reconnectAt = now + 2000;
      this.log('error', '加入超时', '等待约 5 秒未收到房主确认，目标 ' + this.host.address + ':' + this.host.port + '；原因未确认');
      this.emit();
    } else if (now - this.lastJoin >= 1000) this.tryJoin();
  } else if (this.status === 'joined') {
    if (now - this.host.seen > PEER_TTL) {
      this.status = 'disconnected';
      this.reconnectAt = now + 2000;
      this.log('error', '连接超时', '房主上次消息 ' + new Date(this.host.seen).toLocaleString() + '，已过 ' + (now - this.host.seen) + ' 毫秒，阈值 ' + PEER_TTL + ' 毫秒，目标 ' + this.host.address + ':' + this.host.port + '；原因未确认');
      this.emit();
    } else this.sendTo(this.host.id, { type: 'heartbeat' });
  } else if (this.status === 'hosting') {
    var changed = false;
    Object.keys(this.members).forEach(function (id) {
      if (now - self.members[id].seen > PEER_TTL) {
        self.log('error', '成员超时', id + ' ' + self.members[id].address + ':' + self.members[id].port + '，上次消息 ' + new Date(self.members[id].seen).toLocaleString() + '，已过 ' + (now - self.members[id].seen) + ' 毫秒，阈值 ' + PEER_TTL + ' 毫秒；原因未确认');
        delete self.members[id];
        changed = true;
      }
    });
    if (changed) { this.broadcastMembers(); this.emit(); }
  } else if (this.status === 'disconnected' && this.role === 'guest' && this.host && this.reconnectAt && now >= this.reconnectAt) {
    this.reconnectAt = 0;
    this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
    if (this.reconnectAttempts <= 3) {
      this.log('info', '自动重连', '第 ' + this.reconnectAttempts + ' 次，目标 ' + this.host.address + ':' + this.host.port);
      this.joinRoom({ address: this.host.address, port: this.host.port, hostId: this.host.id, name: this.host.name, room: this.roomId });
    } else this.log('error', '自动重连结束', '已尝试 3 次仍未收到确认，请手动重新加入');
  }
};

Room.prototype.leaveRoom = function () {
  this.recovery = null;
  this.close();
  this.emit();
};

Room.prototype.close = function (notify) {
  var self = this;
  if (notify !== false && this.status === 'hosting') Object.keys(this.members).forEach(function (id) { self.sendTo(id, { type: 'bye' }); });
  else if (notify !== false && this.status === 'joined' && this.host) this.sendTo(this.host.id, { type: 'bye' });
  clearInterval(this.maintenance);
  this.maintenance = null;
  if (this.socket) { try { this.socket.close(); } catch (ignored) {} }
  this.socket = null;
  this.port = 0;
  this.status = 'idle';
  this.role = '';
  this.host = null;
  this.members = {};
  this.remoteMembers = [];
  this.rooms = {};
  this.roomId = '';
  this.roomName = '';
  this.reconnectAt = 0;
  this.reconnectAttempts = 0;
};

Room.PORT = PORT;
module.exports = Room;
