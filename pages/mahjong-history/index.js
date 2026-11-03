var storage = require('../../utils/storage.js');
var roster = require('../../utils/mahjong-roster.js');
var records = require('../../utils/mahjong-records.js');

function readSessions() {
  try {
    var value = wx.getStorageSync('mahjongSessions');
    if (value === '' || value === undefined || value === null) return [];
    return Array.isArray(value) ? value : null;
  } catch (error) { return null; }
}

function formatDate(value) {
  var date = new Date(value);
  if (!value || isNaN(date.getTime())) return '暂无更新时间';
  function pad(number) { return number < 10 ? '0' + number : String(number); }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

Page({
  data: { sessions: [], storageInvalid: false, creating: false, managing: false, deleteDialog: null },

  onShow: function () {
    var stored = readSessions();
    if (!Array.isArray(stored)) {
      this.setData({ sessions: [], storageInvalid: true });
      return;
    }
    var sessions = stored.slice().sort(function (a, b) {
      return (new Date(b.updatedAt).getTime() || 0) - (new Date(a.updatedAt).getTime() || 0);
    }).map(function (session) {
      var snapshots = Array.isArray(session.settlements) ? session.settlements : [];
      var latest = snapshots.length ? records.viewSnapshot(snapshots[snapshots.length - 1]) : null;
      return {
        id: session.id,
        title: session.title || '麻将对局',
        updatedLabel: formatDate(session.updatedAt),
        roundCount: Array.isArray(session.rounds) ? session.rounds.length : 0,
        recordCount: snapshots.length,
        latestRecordId: latest ? latest.id : '', latestDate: latest ? latest.dateLabel : '',
        latestScores: latest ? latest.players.map(function (player) { return player.name + ' ' + player.pointsLabel; }).join(' · ') : ''
      };
    });
    this.setData({ sessions: sessions, storageInvalid: false });
  },

  createSession: function () {
    if (this.data.creating) return;
    var stored = readSessions();
    if (!Array.isArray(stored)) {
      wx.showToast({ title: '对局记录读取异常', icon: 'none' });
      return;
    }
    var result;
    try {
      result = roster.createSession();
    } catch (error) {
      wx.showToast({ title: '创建失败，请重试', icon: 'none' });
      return;
    }
    if (!result.ok) {
      wx.showToast({ title: '玩家名单读取异常', icon: 'none' });
      return;
    }
    var session = result.session;
    if (!session || !session.id || !storage.saveState('mahjongSessions', [session].concat(stored))) {
      wx.showToast({ title: '保存失败，请检查存储空间', icon: 'none' });
      return;
    }
    this.openSession(session.id);
  },

  managePeople: function () { wx.navigateTo({ url: '/pages/mahjong-people/index' }); },

  selectSession: function (event) {
    if (this.data.managing) return;
    this.openSession(event.currentTarget.dataset.id);
  },
  selectRecord: function (event) {
    if (this.data.managing) return;
    this.openSession(event.currentTarget.dataset.id, event.currentTarget.dataset.record);
  },
  toggleManagement: function () {
    this.setData({ managing: !this.data.managing, deleteDialog: null });
  },
  requestDelete: function (event) {
    var id = event.currentTarget.dataset.id;
    var session = this.data.sessions.filter(function (item) { return item.id === id; })[0];
    if (!session) return;
    this.setData({ deleteDialog: { id: session.id, title: session.title, step: 1 } });
  },
  cancelDelete: function () { this.setData({ deleteDialog: null }); },
  nextDelete: function () {
    if (this.data.deleteDialog) this.setData({ 'deleteDialog.step': 2 });
  },
  confirmDelete: function () {
    var dialog = this.data.deleteDialog;
    if (!dialog || dialog.step !== 2) return;
    var sessions = readSessions();
    if (!sessions) return wx.showToast({ title: '读取失败，未删除对局', icon: 'none' });
    var remaining = sessions.filter(function (session) { return session.id !== dialog.id; });
    if (remaining.length === sessions.length) {
      this.setData({ deleteDialog: null });
      this.onShow();
      return wx.showToast({ title: '该对局已不存在', icon: 'none' });
    }
    if (!roster.preserve()) return wx.showToast({ title: '玩家名单保存失败，未删除', icon: 'none', duration: 3000 });
    if (!storage.saveState('mahjongSessions', remaining)) return wx.showToast({ title: '删除失败，请重试', icon: 'none' });
    this.setData({ deleteDialog: null });
    this.onShow();
    wx.showToast({ title: '对局已删除', icon: 'success' });
  },
  absorbTap: function () {},

  openSession: function (id, recordId) {
    if (!id || this.data.creating) return;
    this.setData({ creating: true });
    var page = this;
    wx.navigateTo({
      url: '/pages/mahjong-session/index?id=' + encodeURIComponent(id) + (recordId ? '&tab=settlement&record=' + encodeURIComponent(recordId) : ''),
      fail: function () { wx.showToast({ title: '打开失败，请重试', icon: 'none' }); },
      complete: function () { page.setData({ creating: false }); }
    });
  }
});
