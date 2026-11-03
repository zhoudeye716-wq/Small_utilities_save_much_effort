var storage = require('../../utils/signboard-storage.js');

Page({
  data: { items: [], invalid: false },
  onShow: function () {
    var result = storage.read();
    this.setData({ items: result.items, invalid: !result.ok });
  },
  create: function () { wx.navigateTo({ url: '/pages/signboard/index' }); },
  open: function (event) {
    wx.navigateTo({ url: '/pages/signboard/index?id=' + encodeURIComponent(event.currentTarget.dataset.id) });
  },
  remove: function (event) {
    var id = event.currentTarget.dataset.id;
    var page = this;
    wx.showModal({ title: '删除桌牌', content: '删除后无法恢复，确定删除这个桌牌吗？', confirmColor: '#bd5454', success: function (result) {
      if (!result.confirm) return;
      var stored = storage.read();
      if (!stored.ok || !storage.save(stored.items.filter(function (item) { return item.id !== id; }))) {
        wx.showToast({ title: '删除失败，请重试', icon: 'none' });
        return;
      }
      page.onShow();
    } });
  }
});
