var appUpdate = require('../../utils/app-update');
Page({
  data: {
    appVersion: '',
    update: null,
    updateStatus: 'ready',
    updateProgress: 0,
    updateError: '',
    comingSoon: [
      { icon: '📊', title: '数据看板' },
      { icon: '📝', title: '快捷笔记' }
    ]
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
  onHide: function () { var app = getApp(); if (app.updater) app.updater.subscribe(null); },
  onUnload: function () { var app = getApp(); if (app.updater) app.updater.subscribe(null); },
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
  openLanTest: function () {
    wx.navigateTo({ url: '/pages/lan-test/index' });
  }
});
