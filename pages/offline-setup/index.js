var DEFAULTS = { smallBlind: '1', bigBlind: '1', totalChips: '1000', unitPrice: '0.1', players: 4 };
var storage = require('../../utils/storage.js');
var engine = require('../../utils/offline-table.js');

Page({
  data: { settings: DEFAULTS, hasSavedTable: false },
  onLoad: function () {
    var saved = storage.loadState('offlineSettings', null);
    if (saved) this.setData({ settings: Object.assign({}, DEFAULTS, saved) });
  },
  onShow: function () {
    var table = storage.loadState('offlineTable', null);
    this.setData({ hasSavedTable: Boolean(table && Array.isArray(table.seats) && table.seats.length) });
  },
  onInput: function (event) {
    var settings = Object.assign({}, this.data.settings);
    settings[event.currentTarget.dataset.key] = event.detail.value;
    this.setData({ settings: settings });
  },
  adjustPlayers: function (delta) {
    this.setData({ 'settings.players': Math.max(2, Math.min(9, Number(this.data.settings.players) + delta)) });
  },
  increasePlayers: function () { this.adjustPlayers(1); },
  decreasePlayers: function () { this.adjustPlayers(-1); },
  openGuide: function () { wx.navigateTo({ url: '/pages/offline-guide/index' }); },
  openTable: function () {
    if (this.openingTable) return;
    this.openingTable = true;
    var self = this;
    wx.navigateTo({ url: '/pages/offline-table/index', complete: function () { self.openingTable = false; } });
  },
  continueTable: function () {
    var table = storage.loadState('offlineTable', null);
    if (!table || !Array.isArray(table.seats) || !table.seats.length) {
      this.setData({ hasSavedTable: false });
      wx.showToast({ title: '暂无保存的牌局', icon: 'none' });
      return;
    }
    this.openTable();
  },
  enterTable: function () {
    var settings = Object.assign({}, this.data.settings, { players: Number(this.data.settings.players) });
    var small = Number(settings.smallBlind);
    var big = Number(settings.bigBlind);
    var chips = Number(settings.totalChips);
    var price = Number(settings.unitPrice);
    if (!Number.isSafeInteger(small) || small <= 0 || !Number.isSafeInteger(big) || big < small ||
        !Number.isSafeInteger(chips) || chips <= 0 || !Number.isSafeInteger(chips * settings.players) || !Number.isFinite(price) || price < 0 ||
        !Number.isInteger(settings.players) || settings.players < 2 || settings.players > 9) {
      wx.showModal({ title: '请检查牌桌设置', content: '盲注和筹码需要填写大于 0 的整数，大盲不能小于小盲；全桌筹码不能超出安全计算范围，单价不能小于 0，人数为 2 到 9 人。', showCancel: false });
      return;
    }
    var existing = storage.loadState('offlineTable', null);
    var self = this;
    function enter() {
      if (!storage.saveState('offlineSettings', settings) || !storage.saveState('offlineTable', engine.createTable(settings))) {
        wx.showModal({ title: '保存失败', content: '无法保存新牌桌，请检查设备存储后重试。', showCancel: false });
        return;
      }
      self.openTable();
    }
    if (existing) {
      wx.showModal({ title: '开始新牌桌', content: '开始新局会替换已保存的牌局，确定继续吗？', confirmText: '开始新局', success: function (result) { if (result.confirm) enter(); } });
    } else enter();
  }
});
