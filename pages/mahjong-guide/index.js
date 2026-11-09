var roster = require('../../utils/mahjong-roster.js');
var engine = require('../../utils/mahjong.js');
var storage = require('../../utils/storage.js');

function makeId() { return 'player-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12); }
function defaultName(name) { return /^玩家\d+$/.test(String(name || '').trim()); }
function validMoney(value) {
  var text = String(value == null ? '' : value).trim();
  return /^\d+(?:\.\d{1,2})?$/.test(text) && Number.isSafeInteger(Math.round(Number(text) * 100));
}
function readSessions() {
  try {
    var data = wx.getStorageSync('mahjongSessions');
    if (data === '' || data === undefined || data === null) return [];
    return Array.isArray(data) ? data : null;
  } catch (error) { return null; }
}

Page({
  data: {
    step: 1, players: [], initialized: false, loadingError: '', dialog: null,
    initial: '50', price: '1', feeAmount: '', payerId: '',
    startAt: null, endAt: null, timeModified: false, saving: false, savedSessionId: '', playingInitialized: false, settingsInitialized: false
  },
  onLoad: function () {
    var library = roster.read();
    if (!library.ok) return this.setData({ loadingError: '玩家名单读取失败，请返回重试。' });
    var players = library.players.map(function (player, i) {
      return { id: player.id, name: player.name, groupId: player.groupId || '', present: i < 4, playing: i < 4, temporary: false };
    });
    var n = 1;
    while (players.length < 4) {
      var name = '玩家' + n++;
      if (players.some(function (player) { return player.name === name; })) continue;
      players.push({ id: makeId(), name: name, groupId: '', present: true, playing: true, temporary: true });
    }
    this.setData({ players: players, startAt: Date.now(), initialized: true });
  },
  togglePresent: function (event) {
    var players = this.data.players.map(function (player) { return Object.assign({}, player); });
    var selected = players.filter(function (player) { return player.id === event.currentTarget.dataset.id; })[0];
    if (!selected) return;
    selected.present = !selected.present;
    if (!selected.present) selected.playing = false;
    this.setData({ players: players, payerId: !selected.present && this.data.payerId === selected.id ? '' : this.data.payerId });
  },
  togglePlaying: function (event) {
    var players = this.data.players.map(function (player) { return Object.assign({}, player); });
    var selected = players.filter(function (player) { return player.id === event.currentTarget.dataset.id; })[0];
    if (!selected || !selected.present) return;
    if (!selected.playing && players.filter(function (player) { return player.playing; }).length >= 4) {
      return wx.showToast({ title: '最多 4 人上场，请先取消一位', icon: 'none' });
    }
    selected.playing = !selected.playing;
    this.setData({ players: players });
  },
  openAddPlayer: function () { this.setData({ dialog: { kind: 'player', title: '添加玩家', value: '', error: '' } }); },
  openRename: function (event) {
    var player = this.data.players.filter(function (item) { return item.id === event.currentTarget.dataset.id; })[0];
    if (player) this.setData({ dialog: { kind: 'player', id: player.id, title: '修改昵称', value: player.name, error: '' } });
  },
  changeDialogValue: function (event) { this.setData({ 'dialog.value': event.detail.value, 'dialog.error': '' }); },
  closeDialog: function () { this.setData({ dialog: null }); },
  absorbTap: function () {},
  savePlayer: function () {
    var dialog = this.data.dialog;
    if (!dialog || dialog.kind !== 'player') return;
    var name = String(dialog.value || '').trim();
    if (!name) return this.setData({ 'dialog.error': '请输入玩家昵称' });
    if (this.data.players.some(function (item) { return item.id !== dialog.id && item.name === name; })) return this.setData({ 'dialog.error': '昵称已存在，请换一个' });
    if (defaultName(name)) return this.setData({ 'dialog.error': '请使用其他昵称，玩家加数字留给临时占位' });
    var id = dialog.id || makeId();
    if (!roster.upsert(id, name)) return this.setData({ 'dialog.error': '昵称已存在或保存失败，请重试' });
    var players = this.data.players.map(function (player) { return Object.assign({}, player); });
    var selected = players.filter(function (player) { return player.id === id; })[0];
    if (selected) { selected.name = name; selected.temporary = false; }
    else players.push({ id: id, name: name, groupId: '', present: true, playing: false, temporary: false });
    this.setData({ players: players, dialog: null });
  },
  next: function () {
    if (this.data.step === 1) {
      var present = this.data.players.filter(function (p) { return p.present; });
      if (present.length < 3) return wx.showToast({ title: '至少选择 3 位在场玩家', icon: 'none' });
      if (present.some(function (p) { return defaultName(p.name); })) return this.setData({ dialog: { kind: 'defaultNames' } });
      return this.goToPlaying();
    }
    if (this.data.step === 2) {
      var count = this.data.players.filter(function (p) { return p.present && p.playing; }).length;
      if (count !== 3 && count !== 4) return wx.showToast({ title: '请选择 3 人或 4 人上场', icon: 'none' });
      return this.setData({ step: 3, startAt: this.data.settingsInitialized ? this.data.startAt : Date.now(), settingsInitialized: true });
    }
    this.finish();
  },
  goToPlaying: function () {
    var count = 0, initialize = !this.data.playingInitialized;
    var players = this.data.players.map(function (player) {
      var copy = Object.assign({}, player);
      if (initialize) copy.playing = copy.present && count++ < 4;
      else if (!copy.present) copy.playing = false;
      return copy;
    });
    this.setData({ players: players, step: 2, dialog: null, playingInitialized: true });
  },
  previous: function () { if (this.data.step > 1) this.setData({ step: this.data.step - 1 }); },
  updateInitial: function (event) { this.setData({ initial: event.detail.value }); },
  updatePrice: function (event) { this.setData({ price: event.detail.value }); },
  updateFee: function (event) { this.setData({ feeAmount: event.detail.value }); },
  choosePayer: function (event) {
    var id = event.currentTarget.dataset.id;
    this.setData({ payerId: this.data.payerId === id ? '' : id });
  },
  changeTime: function (event) {
    var value = event.detail || {};
    this.setData({ startAt: value.startAt, endAt: value.endAt, timeModified: this.data.timeModified || !!value.modified });
  },
  finish: function (ignoreFee) {
    if (this.data.saving) return;
    if (this.data.savedSessionId) return this.openCreated(this.data.savedSessionId);
    var initial = String(this.data.initial || '').trim(), price = String(this.data.price || '').trim();
    if (!/^\d+$/.test(initial) || !Number.isSafeInteger(Number(initial))) return wx.showToast({ title: '初始点数须为非负整数', icon: 'none' });
    if (!validMoney(price)) return wx.showToast({ title: '每点金额须为非负数，最多两位小数', icon: 'none' });
    var feeAmount = String(this.data.feeAmount || '').trim();
    var hasFee = !!feeAmount || !!this.data.payerId || this.data.timeModified;
    var missing = [];
    if (!feeAmount) missing.push('台费金额');
    else if (!validMoney(feeAmount)) missing.push('正确的台费金额');
    if (!this.data.payerId) missing.push('垫付人');
    if (!Number.isFinite(this.data.startAt) || !Number.isFinite(this.data.endAt) || this.data.endAt <= this.data.startAt) missing.push('有效的开始和结束时间');
    if (hasFee && missing.length && ignoreFee !== true) return this.setData({ dialog: { kind: 'incompleteFee', missing: missing.join('、') } });
    var library = roster.createSession();
    if (!library.ok || !library.session) return wx.showToast({ title: '玩家名单读取失败，请重试', icon: 'none' });
    var session = library.session;
    session.rulesVersion = 2;
    session.players = this.data.players.map(function (p) {
      return { id: p.id, name: p.name, groupId: p.groupId || '', active: p.present,
        attendance: p.present ? [{ start: null, end: null }] : [] };
    });
    var playing = this.data.players.filter(function (p) { return p.present && p.playing; }).map(function (p) { return p.id; });
    session.rounds = [engine.createRound(playing, initial)];
    session.price = price;
    session.fees = [];
    if (hasFee && !missing.length && ignoreFee !== true) {
      var presentIds = this.data.players.filter(function (p) { return p.present; }).map(function (p) { return p.id; });
      var fee = engine.createFee(presentIds, this.data.payerId);
      fee.amount = feeAmount; fee.mode = 'time'; fee.startAt = this.data.startAt; fee.endAt = this.data.endAt;
      session.fees.push(fee);
    }
    var sessions = readSessions();
    if (!sessions) return wx.showToast({ title: '读取对局失败，请重试', icon: 'none' });
    if (!storage.saveState('mahjongSessions', [session].concat(sessions))) return wx.showToast({ title: '保存失败，请检查存储空间', icon: 'none' });
    this.setData({ dialog: null, savedSessionId: session.id });
    this.openCreated(session.id);
  },
  ignoreIncompleteFee: function () { this.finish(true); },
  openCreated: function (id) {
    var page = this;
    this.setData({ saving: true });
    wx.redirectTo({ url: '/pages/mahjong-session/index?id=' + encodeURIComponent(id),
      fail: function () { wx.showToast({ title: '已保存，打开失败，请重试', icon: 'none' }); },
      complete: function () { page.setData({ saving: false }); } });
  }
});
