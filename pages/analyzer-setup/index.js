var DEFAULTS = { smallBlind: '1', bigBlind: '1', totalChips: '1000', unitPrice: '0.1', players: 4 };
var storage = require('../../utils/storage.js');

Page({
  data: { settings: DEFAULTS },
  onLoad: function () {
    var saved = storage.loadState('analyzerSettings', null);
    if (saved) this.setData({ settings: Object.assign({}, DEFAULTS, saved) });
  },
  onInput: function (event) {
    var key = event.currentTarget.dataset.key;
    var settings = Object.assign({}, this.data.settings);
    settings[key] = event.detail.value;
    this.setData({ settings: settings });
  },
  adjustPlayers: function (delta) {
    var players = Math.max(2, Math.min(9, Number(this.data.settings.players) + delta));
    this.setData({ 'settings.players': players });
  },
  increasePlayers: function () { this.adjustPlayers(1); },
  decreasePlayers: function () { this.adjustPlayers(-1); },
  enterAnalyzer: function () {
    var settings = Object.assign({}, this.data.settings, { players: Number(this.data.settings.players) });
    storage.saveState('analyzerSettings', settings);
    wx.navigateTo({ url: '/pages/analyzer/index' });
  },
  openGuide: function () { wx.navigateTo({ url: '/pages/analyzer-guide/index' }); }
});
