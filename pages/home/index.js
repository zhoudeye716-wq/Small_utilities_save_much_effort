Page({
  data: {
    comingSoon: [
      { icon: '🔧', title: '更多工具' },
      { icon: '📊', title: '数据看板' },
      { icon: '📝', title: '快捷笔记' }
    ]
  },
  openAnalyzer: function () {
    wx.navigateTo({ url: '/pages/analyzer-setup/index' });
  },
  openOffline: function () {
    wx.navigateTo({ url: '/pages/offline-setup/index' });
  }
});
