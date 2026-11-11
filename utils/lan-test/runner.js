var metrics = require('./metrics.js');

var CONFIG = {
  latency: { count: 30, interval: 1000, label: '往返延迟' },
  series: { count: 100, interval: 100, label: '连续消息' },
  reliable: { count: 30, interval: 400, label: '可靠重发' },
  speed: { count: 250, interval: 20, label: '传输速度' }
};

function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function Runner(options) {
  this.send = options.send;
  this.onUpdate = options.onUpdate || function () {};
  this.onLog = options.onLog || function () {};
  this.onResult = options.onResult || function () {};
  this.clock = options.clock || {
    now: Date.now,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  this.incoming = {};
  this.completed = {};
  this.active = null;
}

Runner.prototype.log = function (level, stage, detail) { this.onLog(level, stage, detail || ''); };
Runner.prototype.emit = function () {
  var run = this.active;
  this.onUpdate(run ? {
    id: run.id, peer: run.peer, kind: run.kind, label: CONFIG[run.kind].label,
    status: run.status, sent: run.sent, total: run.count
  } : null);
};
Runner.prototype.transmit = function (peer, packet) {
  var ok = this.send(peer, packet);
  if (!ok) this.log('error', '发送未提交', packet.type + ' 序号 ' + (packet.seq === undefined ? '—' : packet.seq));
  return ok;
};

Runner.prototype.start = function (peer, kind, command) {
  if (!CONFIG[kind] || !peer || this.active || Object.keys(this.incoming).length) return false;
  var config = CONFIG[kind];
  this.active = {
    id: makeId(), peer: peer, kind: kind, count: config.count, sent: 0,
    status: 'starting', pending: {}, samples: [], acked: {}, retries: 0, timers: [], command: command || ''
  };
  this.log('info', '测试开始', config.label + ' · ' + this.active.id);
  this.emit();
  this.waitReady(this.active, 0);
  return true;
};

Runner.prototype.later = function (run, fn, delay) {
  var self = this;
  var id = this.clock.setTimeout(function () {
    run.timers = run.timers.filter(function (timer) { return timer !== id; });
    if (self.active === run) fn.call(self, run);
  }, delay);
  run.timers.push(id);
};

Runner.prototype.waitReady = function (run, attempt) {
  if (run.status !== 'starting') return;
  if (attempt >= 5) {
    this.finish(run, { state: 'failed', reason: '对方没有确认测试请求', sent: 0 });
    return;
  }
  this.transmit(run.peer, { type: 'test_start', run: run.id, kind: run.kind, count: run.count, command: run.command });
  if (this.active === run && run.status === 'starting') {
    this.later(run, function () { this.waitReady(run, attempt + 1); }, 1000);
  }
};

Runner.prototype.sendNext = function (run) {
  if (run.status !== 'running') return;
  if (run.sent >= run.count) {
    if (run.kind === 'latency' || run.kind === 'reliable') {
      this.later(run, function () {
        var result = metrics.latency(run.sent, run.samples);
        result.state = 'complete';
        if (run.kind === 'reliable') result.retries = run.retries;
        this.transmit(run.peer, { type: 'test_end', run: run.id, sent: run.sent });
        this.finish(run, result);
      }, 2500);
    } else {
      run.status = 'awaiting_report';
      this.emit();
      this.sendEnd(run, 0);
    }
    return;
  }
  var seq = run.sent++;
  run.pending[seq] = this.clock.now();
  if (run.kind === 'latency' || run.kind === 'reliable') {
    this.transmit(run.peer, { type: 'ping', run: run.id, seq: seq });
    if (run.kind === 'reliable') this.retry(run, seq, 1);
  } else {
    var payload = new Array(run.kind === 'speed' ? 901 : 33).join('x');
    this.transmit(run.peer, { type: 'test_data', run: run.id, seq: seq, payload: payload });
  }
  if (run.kind !== 'speed' || run.sent === run.count || !run.lastEmit || this.clock.now() - run.lastEmit >= 250) {
    run.lastEmit = this.clock.now();
    this.emit();
  }
  this.later(run, this.sendNext, CONFIG[run.kind].interval);
};

Runner.prototype.retry = function (run, seq, attempt) {
  if (attempt > 2) return;
  this.later(run, function () {
    if (run.acked[seq] || run.status !== 'running') return;
    run.retries++;
    this.transmit(run.peer, { type: 'ping', run: run.id, seq: seq, retry: attempt });
    this.retry(run, seq, attempt + 1);
  }, 350);
};

Runner.prototype.sendEnd = function (run, attempt) {
  if (run.status !== 'awaiting_report') return;
  if (attempt >= 5) {
    this.finish(run, { state: 'incomplete', reason: '未收到接收端报告', sent: run.sent });
    return;
  }
  this.transmit(run.peer, { type: 'test_end', run: run.id, sent: run.sent });
  if (this.active === run && run.status === 'awaiting_report') {
    this.later(run, function () { this.sendEnd(run, attempt + 1); }, 800);
  }
};

Runner.prototype.finish = function (run, result) {
  if (this.active !== run) return;
  var self = this;
  run.timers.forEach(function (id) { self.clock.clearTimeout(id); });
  this.active = null;
  var report = { id: run.id, kind: run.kind, label: CONFIG[run.kind].label, peer: run.peer, result: result };
  this.log(result.state === 'complete' ? 'info' : 'error', '测试结束', JSON.stringify(report));
  this.onResult(report);
  this.emit();
};

Runner.prototype.receive = function (packet, peer) {
  if (!packet.run || !peer || !peer.id) return;
  var key = peer.id + ':' + packet.run;
  var run = this.active;
  var incoming = this.incoming[key];
  if (packet.type === 'test_start') {
    if (!CONFIG[packet.kind] || packet.count !== CONFIG[packet.kind].count) return;
    if (!incoming && !this.completed[key] && (this.active || Object.keys(this.incoming).length)) {
      this.transmit(peer.id, { type: 'test_busy', run: packet.run });
      return;
    }
    if (!incoming && !this.completed[key]) {
      incoming = { peer: peer.id, id: packet.run, kind: packet.kind, receiver: metrics.createReceiver(packet.run) };
      this.incoming[key] = incoming;
      var self = this;
      incoming.timer = this.clock.setTimeout(function () {
        if (!self.incoming[key]) return;
        var partial = incoming.receiver.result(null);
        partial.state = 'incomplete';
        partial.reason = '未收到发送结束消息';
        self.onResult({ id: incoming.id, kind: incoming.kind, label: CONFIG[incoming.kind].label + '（接收端）', peer: peer.id, result: partial });
        delete self.incoming[key];
      }, packet.kind === 'latency' ? 40000 : 22000);
      this.log('info', '收到测试', CONFIG[packet.kind].label + ' · ' + packet.run);
    }
    this.transmit(peer.id, { type: 'test_ready', run: packet.run });
  } else if (packet.type === 'test_busy' && run && run.id === packet.run && run.peer === peer.id) {
    this.finish(run, { state: 'failed', reason: '对方正在进行其他测试', sent: run.sent });
  } else if (packet.type === 'test_ready' && run && run.id === packet.run && run.peer === peer.id && run.status === 'starting') {
    run.status = 'running';
    this.emit();
    this.sendNext(run);
  } else if (packet.type === 'ping' && incoming && (incoming.kind === 'latency' || incoming.kind === 'reliable')) {
    incoming.receiver.receive({ run: packet.run, seq: packet.seq, bytes: 0 }, this.clock.now());
    this.transmit(peer.id, { type: 'pong', run: packet.run, seq: packet.seq });
  } else if (packet.type === 'pong' && run && run.id === packet.run && run.peer === peer.id && run.pending[packet.seq] !== undefined && !run.acked[packet.seq]) {
    var elapsed = this.clock.now() - run.pending[packet.seq];
    if (elapsed >= 0 && elapsed <= 2500) {
      run.acked[packet.seq] = true;
      run.samples.push(elapsed);
      this.emit();
    }
  } else if (packet.type === 'test_data' && incoming && (incoming.kind === 'series' || incoming.kind === 'speed')) {
    if (typeof packet.payload !== 'string' || packet.payload.length > 1200 || packet.seq >= CONFIG[incoming.kind].count) return;
    incoming.receiver.receive({ run: packet.run, seq: packet.seq, bytes: packet.payload.length }, this.clock.now());
  } else if (packet.type === 'test_end') {
    if (incoming && !incoming.endTimer && Number.isInteger(packet.sent) && packet.sent >= 0 && packet.sent <= CONFIG[incoming.kind].count) {
      this.clock.clearTimeout(incoming.timer);
      var runner = this;
      incoming.endTimer = this.clock.setTimeout(function () {
        if (!runner.incoming[key]) return;
        var report = incoming.receiver.result(packet.sent);
        report.state = 'complete';
        runner.completed[key] = report;
        var completedKeys = Object.keys(runner.completed);
        if (completedKeys.length > 20) delete runner.completed[completedKeys[0]];
        delete runner.incoming[key];
        runner.onResult({ id: packet.run, kind: incoming.kind, label: CONFIG[incoming.kind].label + '（接收端）', peer: peer.id, result: report });
        runner.transmit(peer.id, { type: 'test_report', run: packet.run, report: report });
      }, 600);
    }
    if (this.completed[key]) this.transmit(peer.id, { type: 'test_report', run: packet.run, report: this.completed[key] });
  } else if (packet.type === 'test_report' && run && run.id === packet.run && run.peer === peer.id && run.status === 'awaiting_report') {
    if (!packet.report || !Number.isInteger(packet.report.unique) || packet.report.unique < 0 || packet.report.unique > run.sent) return;
    packet.report.state = 'complete';
    packet.report.sent = run.sent;
    this.finish(run, packet.report);
  }
};

Runner.prototype.stop = function (reason) {
  var self = this;
  if (this.active) this.finish(this.active, { state: 'interrupted', reason: reason || '已停止', sent: this.active.sent });
  Object.keys(this.incoming).forEach(function (key) {
    var incoming = self.incoming[key];
    self.clock.clearTimeout(incoming.timer);
    self.clock.clearTimeout(incoming.endTimer);
    var partial = incoming.receiver.result(null);
    partial.state = 'interrupted';
    partial.reason = reason || '已停止';
    self.onResult({ id: incoming.id, kind: incoming.kind, label: CONFIG[incoming.kind].label + '（接收端）', peer: incoming.peer, result: partial });
  });
  this.incoming = {};
  this.completed = {};
};

module.exports = Runner;
