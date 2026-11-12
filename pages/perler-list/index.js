var local = require('../../utils/perler/wx-store');

function dateText(ms) {
  var d = new Date(ms || 0);
  function pad(v) { return v < 10 ? '0' + v : '' + v; }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

Page({
  data: { items: [] },
  onShow: function () {
    try {
      this.setData({items: local.store().list().map(function (p) { return {id:p.id,name:p.name || '未命名拼豆图',invalid:!!p.invalid,imagePath:p.imagePath,width:p.width || 0,height:p.height || 0,updatedText:p.invalid?'项目数据损坏':dateText(p.updatedAt)}; })});
    } catch (e) { wx.showToast({title:'读取项目失败，请重试',icon:'none'}); }
  },
  create: function () { wx.navigateTo({url:'/pages/perler-editor/index'}); },
  open: function (e) { wx.navigateTo({url:'/pages/perler-editor/index?id=' + encodeURIComponent(e.currentTarget.dataset.id)}); },
  remove: function (e) {
    var page = this, id = e.currentTarget.dataset.id;
    wx.showModal({title:'删除拼豆项目',content:'将删除本机保存的项目和原图副本，相册中的原图及已导出的图片不受影响。确定删除吗？',confirmColor:'#aa5d55',success:function (r) {
      if (!r.confirm) return;
      try { local.store().remove(id); page.onShow(); } catch (err) { wx.showModal({title:'删除未完成',content:'部分本机文件可能未能删除，请重试。',showCancel:false}); }
    }});
  }
});
