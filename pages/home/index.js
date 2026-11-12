var appUpdate = require('../../utils/app-update');
var LAN_TEST_VISIBILITY_KEY = 'lan-test-entry-visible-v1';
Page({
  data: {
    appVersion: '',
    showLanTest: false,
    update: null,
    updateStatus: 'ready',
    updateProgress: 0,
    updateError: '',
    comingSoon: [
      { icon: '📊', title: '数据看板' },
      { icon: '📝', title: '快捷笔记' }
    ]
  },
  onLoad: function () {
    var visible = false;
    try { visible = wx.getStorageSync(LAN_TEST_VISIBILITY_KEY) === true; } catch (e) {}
    this.setData({showLanTest:visible});
  },
  onShow: function () {
    var page = this, app = getApp();
    var host, version = '';
    try { host = wx.getAppBaseInfo && wx.getAppBaseInfo().host; } catch (e) {}
    if (host && host.env === 'SAAASDK') version = host.appVersion || '';
    else {
      try { var account = wx.getAccountInfoSync && wx.getAccountInfoSync(); version = account && account.miniProgram && account.miniProgram.version || ''; } catch (e) {}
    }
    this.setData({appVersion:version});
    if (app.updater) app.updater.subscribe(function (update) { page.setData({update:update}); });
  },
  onHide: function () { this.resetVersionTaps();var app = getApp(); if (app.updater) app.updater.subscribe(null); },
  onUnload: function () { this.resetVersionTaps();var app = getApp(); if (app.updater) app.updater.subscribe(null); },
  resetVersionTaps: function () { this.versionTaps = 0; this.versionTapStartedAt = 0; },
  onVersionTap: function () {
    var visible = this.data.showLanTest;
    if (!visible) {
      var now = Date.now();
      if (!this.versionTaps || now < this.versionTapStartedAt || now - this.versionTapStartedAt > 2000) {
        this.versionTaps = 0; this.versionTapStartedAt = now;
      }
      this.versionTaps = (this.versionTaps || 0) + 1;
      if (this.versionTaps < 5) return;
    }
    this.resetVersionTaps();
    visible = !visible;
    try { wx.setStorageSync(LAN_TEST_VISIBILITY_KEY, visible); } catch (e) {}
    this.setData({showLanTest:visible});
  },
  dismissUpdate: function () {
    if (this.data.updateStatus === 'downloading' || this.data.updateStatus === 'opening') return;
    getApp().updater.clear();
    this.setData({updateStatus:'ready',updateProgress:0,updateError:''});
  },
  startUpdate: function () {
    var page=this, update=this.data.update;
    if (!update || this.data.updateStatus === 'downloading' || this.data.updateStatus === 'opening') return;
    appUpdate.download(wx, update.url, function (state) {
      page.setData({updateStatus:state.status,updateProgress:state.progress || 0,updateError:state.message || ''});
    });
  },
  stopUpdateTap: function () {},
  openAnalyzer: function () {
    wx.navigateTo({ url: '/pages/analyzer/index' });
  },
  openOffline: function () {
    wx.navigateTo({ url: '/pages/offline-setup/index' });
  },
  openMahjong: function () {
    wx.navigateTo({ url: '/pages/mahjong-history/index' });
  },
  openSignboard: function () {
    wx.navigateTo({ url: '/pages/signboard-list/index' });
  },
  openTimer: function () {
    wx.navigateTo({ url: '/pages/timer/index' });
  },
  openGuessSize: function () {
    wx.navigateTo({ url: '/pages/guess-size/index' });
  },
  openPerler: function () {
    wx.navigateTo({ url: '/pages/perler-list/index' });
  },
  openLanTest: function () {
    wx.navigateTo({ url: '/pages/lan-test/index' });
  }
});
