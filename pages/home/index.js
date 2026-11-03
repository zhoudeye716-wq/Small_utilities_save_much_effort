Page({
  data: {
    comingSoon: [
      { icon: '📊', title: '数据看板' },
      { icon: '📝', title: '快捷笔记' }
    ]
  },
  openAnalyzer: function () {
    wx.navigateTo({ url: '/pages/analyzer/index' });
  },
  openOffline: function () {
    wx.navigateTo({ url: '/pages/offline-setup/index' });
  },
  openMahjong: function () {
    wx.navigateTo({ url: '/pages/mahjong-history/index' });
  }
});
