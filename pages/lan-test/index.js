var Room = require('../../utils/lan-test/room.js');
var Runner = require('../../utils/lan-test/runner.js');
var Log = require('../../utils/lan-test/log.js');

var STATUS = { idle: '未连接', hosting: '房间已创建', searching: '正在搜索（约 15 秒）', search_done: '搜索结束', joining: '正在加入', joined: '已加入房间', disconnected: '连接已断开', error: '创建连接失败' };
var LABELS = { sent: '已发送', received: '已回复', timeouts: '未回复', average: '平均延迟 ms', median: '中位延迟 ms', p95: '95% 延迟 ms', maximum: '最大延迟 ms', retries: '重发次数', unique: '去重接收', duplicate: '重复包', outOfOrder: '乱序包', missing: '未收到', bytes: '有效载荷字节', elapsedMs: '接收间隔 ms', kibPerSecond: '有效载荷 KiB/s', reason: '说明', state: '状态' };
function renderReport(report) {
  if (!report || !report.result) return '';
  var result = report.result;
  return Object.keys(result).map(function (key) {
    var value = result[key];
    if (typeof value === 'number' && !Number.isInteger(value)) value = Math.round(value * 100) / 100;
    if (value === null) value = '无法计算';
    if (key === 'state') value = { complete: '完成', failed: '失败', interrupted: '中断', incomplete: '未收到完整报告' }[value] || value;
    return (LABELS[key] || key) + '：' + value;
  }).join('\n');
}
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

var definition = {
  data: {
    supported: true, name: '', status: '未连接', roomState: 'idle', role: '', roomName: '', roomId: '', port: Room.PORT,
    ip: '正在获取', network: '获取中', environment: '', rooms: [], peers: [], selected: '',
    address: '', manualPort: String(Room.PORT), message: '你好，这是一条联机测试消息', messageStatus: '',
    progress: null, requestStatus: '', report: null, reportText: '', reportBeforeClear: false, events: [], dropped: 0, storageError: false, reconnect: false, roomMembers: [],
    direction: 'local', logFilter: 'all'
  },
  onLoad: function () {
    var self = this;
    this.deviceId = makeId();
    this.store = new Log(wx);
    var name = '设备-' + this.deviceId.slice(-4).toUpperCase();
    this.setData({ name: name, supported: typeof wx.createUDPSocket === 'function' });
    this.room = new Room({
      id: this.deviceId, name: name, createSocket: function () { return wx.createUDPSocket(); },
      onState: function (state) { self.updateRoom(state); },
      onLog: function (level, stage, detail) { self.addLog(level, stage, detail); },
      onPacket: function (packet, peer) { self.receive(packet, peer); }
    });
    this.runner = new Runner({
      send: function (peer, packet) { return self.room.sendTo(peer, packet); },
      onLog: function (level, stage, detail) { self.addLog(level, stage, detail); },
      onUpdate: function (progress) { self.setData({ progress: progress }); },
      onResult: function (report) {
        self.showReport(report);
        self.room.sendTo(report.peer, { type: 'test_summary', run: report.id, report: report });
      }
    });
    this.restoreLog();
    this.inspectDevice();
    this.networkHandler = function (event) {
      var prior = self.data.network;
      self.setData({ network: event.isConnected ? event.networkType : '未连接' });
      self.addLog('info', '网络变化', JSON.stringify(event));
      if ((!event.isConnected || (prior !== '获取中' && prior !== event.networkType)) && self.room.status !== 'idle') self.room.networkInterrupted(JSON.stringify(event));
      if (event.isConnected && self.room.status === 'error' && self.room.recovery) {
        self.addLog('info', '网络恢复', '尝试恢复房间，IP 变化时可能需要重新搜索或手动加入');
        self.room.resume();
      }
    };
    if (wx.onNetworkStatusChange) wx.onNetworkStatusChange(this.networkHandler);
  },
  onShow: function () {
    this.visible = true;
    if (this.hiddenAt) {
      var elapsed = Date.now() - this.hiddenAt;
      this.addLog('info', '恢复连接检查', '页面隐藏约 ' + elapsed + ' 毫秒；开始检查房间，结果以对端回复为准');
      this.hiddenAt = 0;
      this.room.resume();
    }
  },
  onHide: function () {
    this.visible = false;
    if (!this.hiddenAt) this.hiddenAt = Date.now();
    this.addLog('info', '页面隐藏', '页面切换或小程序进入后台；保留房间并等待恢复，后台能否通信需真机验证');
    if (this.runner && (this.runner.active || Object.keys(this.runner.incoming).length)) {
      this.addLog('error', '测量中断', '页面隐藏，后台计时可能不准确；已停止本轮测量');
      this.runner.stop('页面隐藏，测量中断');
    }
  },
  onUnload: function () {
    if (!this.hiddenAt) this.onHide();
    this.addLog('info', '离开测试页面', '房间保留在当前小程序进程；可返回查看');
  },
  inspectDevice: function () {
    var self = this;
    try {
      var info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
      var app = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
      var environment = [info.model || '未知设备', info.system || '', '微信 ' + (app.version || '未知'), '基础库 ' + (app.SDKVersion || '未知')].join(' · ');
      this.setData({ environment: environment });
      this.addLog('info', '设备信息', environment);
    } catch (e) { this.addLog('error', '获取设备信息失败', String(e)); }
    if (wx.getNetworkType) wx.getNetworkType({ success: function (r) { self.setData({ network: r.networkType }); self.addLog('info', '网络类型', r.networkType); }, fail: function (e) { self.addLog('error', '获取网络类型失败', JSON.stringify(e)); } });
    if (wx.getLocalIPAddress) wx.getLocalIPAddress({ success: function (r) { self.setData({ ip: r.localip || r.localIP || '未返回地址' }); self.addLog('info', '本机局域网地址', JSON.stringify(r)); }, fail: function (e) { self.setData({ ip: '获取失败，请在系统 Wi-Fi 设置中查看' }); self.addLog('error', '获取局域网地址失败', JSON.stringify(e)); } });
    else { this.setData({ ip: '接口不可用，请在系统 Wi-Fi 设置中查看' }); this.addLog('error', '获取局域网地址', '当前环境不支持该接口'); }
  },
  restoreLog: function () {
    this.setData({ events: this.store.items.slice().reverse(), dropped: this.store.dropped, report: this.store.report, reportText: renderReport(this.store.report), reportBeforeClear: this.store.reportBeforeClear });
  },
  addLog: function (level, stage, detail) {
    this.store.add(level, stage, detail);
    this.updateLogs();
    if (!this.store.save()) this.setData({ storageError: true });
  },
  updateLogs: function () {
    var filter = this.data.logFilter;
    this.setData({ events: this.store.items.filter(function (item) { return filter === 'all' || item.level === 'error'; }).slice().reverse(), dropped: this.store.dropped });
  },
  showReport: function (report) {
    this.store.report = report;
    this.store.reportBeforeClear = false;
    this.setData({ report: report, reportText: renderReport(report), reportBeforeClear: false });
    if (!this.store.save()) this.setData({ storageError: true });
  },
  updateRoom: function (state) {
    var peers = state.role === 'host' ? state.members : state.host && state.status === 'joined' ? [state.host] : [];
    var selected = this.data.selected;
    if (!peers.some(function (p) { return p.id === selected; })) selected = peers.length ? peers[0].id : '';
    this.setData({ status: STATUS[state.status] || state.status, roomState: state.status, role: state.role, roomName: state.roomName, roomId: state.roomId, port: state.port || Room.PORT, rooms: state.rooms, peers: peers, selected: selected, roomMembers: state.role === 'guest' ? state.remoteMembers : [] });
    if ((state.status === 'disconnected' || state.status === 'error') && this.runner) this.runner.stop('连接断开或 UDP 出错');
    if (state.role === 'host' && this.runner && this.runner.active && !peers.some(function (p) { return p.id === this.runner.active.peer; }, this)) this.runner.stop('测试对象已离线');
    if (state.role === 'host' && this.runner && Object.keys(this.runner.incoming).some(function (key) { return !peers.some(function (p) { return p.id === this.runner.incoming[key].peer; }, this); }, this)) this.runner.stop('测试对象已离线');
  },
  editName: function (e) { this.setData({ name: e.detail.value }); this.room.name = e.detail.value.trim().slice(0, 24) || '设备'; },
  editAddress: function (e) { this.setData({ address: e.detail.value.trim() }); },
  editPort: function (e) { this.setData({ manualPort: e.detail.value }); },
  editMessage: function (e) { this.setData({ message: e.detail.value }); },
  createRoom: function () { this.runner.stop('重新创建房间'); this.room.createRoom(); },
  search: function () { this.runner.stop('重新搜索'); this.room.searchRooms(); },
  joinFound: function (e) { var room = this.data.rooms[Number(e.currentTarget.dataset.index)]; if (room) this.join(room); },
  joinManual: function () {
    var address = this.data.address, port = Number(this.data.manualPort);
    var parts = address.split('.');
    if (parts.length !== 4 || parts.some(function (part) { return !/^\d{1,3}$/.test(part) || Number(part) > 255; }) || !Number.isInteger(port) || port < 1 || port > 65535) {
      wx.showToast({ title: '请填写有效 IPv4 地址和端口', icon: 'none' }); return;
    }
    this.join({ address: address, port: port });
  },
  join: function (target) {
    this.runner.stop('切换房间');
    if (this.room.status === 'hosting' || this.room.status === 'joined' || this.room.status === 'joining') this.room.close();
    this.room.recovery = null;
    this.room.reconnectAttempts = 0;
    this.lastTarget = target;
    this.setData({ reconnect: true });
    this.room.joinRoom(target);
  },
  rejoin: function () { if (this.lastTarget) this.join(this.lastTarget); },
  leave: function () { this.stopConnection('主动退出房间'); },
  stopConnection: function (reason) {
    this.runner.stop(reason);
    if (this.messageId) {
      clearTimeout(this.messageTimer);
      this.messageId = '';
      this.setData({ messageStatus: '消息等待中断：' + reason });
    }
    if (this.requestTimer) clearTimeout(this.requestTimer);
    if (this.remoteRequest) this.setData({ requestStatus: '请求中断：' + reason });
    this.remoteRequest = null;
    this.room.leaveRoom();
    this.addLog('info', '连接关闭', reason);
  },
  selectPeer: function (e) { this.setData({ selected: e.currentTarget.dataset.id }); },
  setDirection: function (e) { this.setData({ direction: e.currentTarget.dataset.direction }); },
  sendMessage: function () {
    var self = this, peer = this.data.selected, content = this.data.message.trim(), run = makeId();
    if (!peer || !content) { wx.showToast({ title: '请选择设备并输入内容', icon: 'none' }); return; }
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageId = run;
    this.setData({ messageStatus: '已提交发送，等待回复…' });
    this.addLog('info', '发送消息', '编号 ' + run + '，目标 ' + peer + '，内容：' + content);
    if (!this.room.sendTo(peer, { type: 'message', run: run, text: content.slice(0, 80) })) { this.setData({ messageStatus: '发送失败' }); return; }
    this.messageTimer = setTimeout(function () { if (self.messageId === run) { self.messageId = ''; self.setData({ messageStatus: '回复超时' }); self.addLog('error', '消息回复超时', run); } }, 5000);
  },
  startTest: function (e) {
    var kind = e.currentTarget.dataset.kind, peer = this.data.selected;
    if (!peer) { wx.showToast({ title: '请先选择在线设备', icon: 'none' }); return; }
    if (this.runner.active || Object.keys(this.runner.incoming).length || this.remoteRequest) { wx.showToast({ title: '请等待当前测试完成', icon: 'none' }); return; }
    this.store.report = null;
    this.setData({ report: null, reportText: '' });
    if (this.data.direction === 'remote') {
      var run = makeId();
      this.addLog('info', '请求对方发起测试', kind + ' · ' + run);
      this.remoteRequest = { id: run, peer: peer };
      this.setData({ requestStatus: '已请求对方发起测试，等待回复…' });
      if (!this.room.sendTo(peer, { type: 'test_command', run: run, kind: kind })) { this.remoteRequest = null; this.setData({ requestStatus: '请求发送失败' }); }
      else {
        var self = this;
        this.requestTimer = setTimeout(function () {
          if (!self.remoteRequest || self.remoteRequest.id !== run) return;
          self.remoteRequest = null;
          self.setData({ requestStatus: '对方未开始测试，请查看两端日志或重试' });
          self.addLog('error', '反向测试请求超时', run);
        }, 6000);
      }
    } else this.runner.start(peer, kind);
  },
  receive: function (packet, peer) {
    if (packet.type === 'message') {
      this.addLog('info', '收到消息', peer.name + '：' + String(packet.text || '').slice(0, 80) + ' · ' + packet.run);
      this.setData({ messageStatus: '收到 ' + peer.name + '：' + String(packet.text || '').slice(0, 80) });
      this.room.sendTo(peer.id, { type: 'message_ack', run: packet.run });
    } else if (packet.type === 'message_ack') {
      if (packet.run === this.messageId) { this.messageId = ''; clearTimeout(this.messageTimer); this.setData({ messageStatus: '对方已收到并回复' }); this.addLog('info', '消息回复', packet.run); }
    } else if (packet.type === 'test_command') {
      if (!this.runner.start(peer.id, packet.kind, packet.run)) {
        this.addLog('error', '无法响应测试请求', '设备忙碌或测试类型无效');
        this.room.sendTo(peer.id, { type: 'test_command_ack', run: packet.run, accepted: false });
      }
    } else if (packet.type === 'test_command_ack' && this.remoteRequest && packet.run === this.remoteRequest.id && peer.id === this.remoteRequest.peer) {
      clearTimeout(this.requestTimer);
      this.remoteRequest = null;
      this.setData({ requestStatus: '对方忙碌，无法开始测试' });
      this.addLog('error', '反向测试被拒绝', packet.run);
    } else if (packet.type === 'test_summary') {
      if (packet.report && packet.report.result) {
        this.addLog('info', '收到对端报告', packet.run);
        var summary = packet.report;
        summary.label = '对端报告 · ' + String(summary.label || '测试').slice(0, 30);
        this.showReport(summary);
      }
    } else {
      if (packet.type === 'test_start' && this.remoteRequest && packet.command === this.remoteRequest.id && peer.id === this.remoteRequest.peer) {
        clearTimeout(this.requestTimer);
        this.remoteRequest = null;
        this.setData({ requestStatus: '对方已开始测试' });
      }
      this.runner.receive(packet, peer);
    }
  },
  setLogFilter: function (e) { this.setData({ logFilter: e.currentTarget.dataset.filter }); this.updateLogs(); },
  clearLogs: function () {
    this.store.clear();
    this.setData({ reportBeforeClear: this.store.reportBeforeClear });
    this.addLog('info', '日志已清空', '从此刻开始记录；清空前的测试结果不包含在复制内容中');
  },
  copyReport: function () {
    var state = this.room.snapshot();
    var text = '局域网联机测试报告\n设备：' + this.data.environment + '\n网络：' + this.data.network + '\n本机地址：' + this.data.ip + ':' + state.port + '\n房间：' + (state.roomId || '无') + '\n角色：' + (state.role || '未连接') + '\n测试：' + (this.store.report && !this.store.reportBeforeClear ? JSON.stringify(this.store.report) : '本次暂无结果') + '\n日志截断：' + this.store.dropped + ' 条\n\n' + this.store.items.map(function (item) { return '[' + item.time + '] [' + item.level + '] ' + item.stage + ' ' + item.detail; }).join('\n');
    wx.setClipboardData({ data: text, fail: function () { wx.showToast({ title: '复制失败', icon: 'none' }); } });
  }
};

// 房间属于小程序会话而非页面实例，返回首页后仍可在本次运行中继续检查。
var session;
var pageDefinition = { data: definition.data };
pageDefinition.onLoad = function () {
  if (!session) {
    session = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)), view: this });
    session.setData = function (updates) {
      Object.assign(this.data, updates);
      if (this.view) this.view.setData(updates);
    };
    session.onLoad();
  } else {
    session.view = this;
    this.setData(session.data);
  }
};
pageDefinition.onShow = function () { if (session) session.onShow(); };
pageDefinition.onHide = function () { if (session) session.onHide(); };
pageDefinition.onUnload = function () { if (session) { session.onUnload(); session.view = null; } };
Object.keys(definition).forEach(function (key) {
  if (key === 'onLoad' || key === 'onShow' || key === 'onHide' || key === 'onUnload' || typeof definition[key] !== 'function') return;
  pageDefinition[key] = function () { return session[key].apply(session, arguments); };
});
Page(pageDefinition);
