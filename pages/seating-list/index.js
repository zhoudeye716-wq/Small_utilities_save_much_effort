'use strict';
var model = require('../../utils/seating/model');
var wxStore = require('../../utils/seating/wx-store');
function error(message) { wx.showModal({ title: '操作未完成', content: message, showCancel: false }); }
Page({
  data: { projects: [] },
  getStore: function() { return wxStore.create(wx); },
  onShow: function() { this.refresh(); },
  refresh: function() { try { this.setData({ projects: this.getStore().list() }); } catch (e) { error('无法读取座位图，请检查设备存储。'); } },
  createProject: function() {
    try { var p = model.createProject('新座位图'); this.getStore().save(p); wx.navigateTo({ url: '/pages/seating-editor/index?id=' + encodeURIComponent(p.id) }); }
    catch (e) { error('无法创建座位图，请检查设备存储。'); }
  },
  openProject: function(e) { var id = e.currentTarget.dataset.id; wx.navigateTo({ url: '/pages/seating-editor/index?id=' + encodeURIComponent(id) }); },
  removeProject: function(e) {
    var page = this, id = e.currentTarget.dataset.id;
    wx.showModal({ title: '删除座位图', content: '删除后无法恢复，确定删除这个项目吗？', confirmText: '删除', success: function(result) {
      if (!result.confirm) return;
      try { page.getStore().remove(id); page.refresh(); } catch (errorValue) { page.refresh(); error(errorValue.message || '无法删除座位图。'); }
    } });
  }
});
