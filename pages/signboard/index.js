var storage = require('../../utils/signboard-storage.js');

var DEFAULTS = { text: '', color: '#ffffff', background: '#000000', colorMode: 'solid', speed: 50, fontRatio: null, orientation: 'landscape' };
var PRESETS = ['#ffffff', '#000000', '#ff4d4f', '#ffbf40', '#ffff66', '#68df96', '#63c5ff', '#ca91ff'];

function cleanHex(value) {
  var text = String(value || '').trim();
  if (text.charAt(0) !== '#') text = '#' + text;
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : '';
}
function makeId() { return 'sign-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
function distance(touches) {
  var x = touches[0].clientX - touches[1].clientX;
  var y = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(x * x + y * y);
}
function configOf(data) {
  return { text: data.text, color: data.color, background: data.background, colorMode: data.colorMode,
    speed: Number(data.speed), fontRatio: data.fontRatio, orientation: data.orientation };
}
function defaultName(text) {
  return (String(text).split('\n').filter(function (line) { return line.trim(); })[0] || '').trim().slice(0, 30);
}

Page({
  data: {
    id: '', name: '', text: '', lines: [], color: '#ffffff', background: '#000000',
    colorMode: 'solid', speed: 50, fontRatio: null, orientation: 'landscape', fontPx: 80, stageWidth: 0, stageHeight: 0,
    contentWidth: 0, scrolling: false, loopWidth: 0, duration: 10, safeTop: 0, settingsOpen: true,
    colorTarget: 'color', colorInput: '#ffffff', presets: PRESETS, dialog: null
  },
  onLoad: function (options) {
    var config = Object.assign({}, DEFAULTS), id = options.id || '', name = '';
    if (id) {
      var result = storage.read();
      var record = result.ok && result.items.filter(function (item) { return item.id === id; })[0];
      if (!record) {
        wx.showModal({ title: '无法打开桌牌', content: result.ok ? '桌牌可能已被删除。' : '暂时无法读取本机记录。', showCancel: false, success: function () { wx.navigateBack(); } });
        return;
      }
      config = Object.assign({}, DEFAULTS, record.config || {});
      name = record.name || '';
    }
    config.color = cleanHex(config.color) || DEFAULTS.color;
    config.background = cleanHex(config.background) || DEFAULTS.background;
    config.text = typeof config.text === 'string' ? config.text : '';
    config.colorMode = ['solid', 'shift', 'rainbow'].indexOf(config.colorMode) >= 0 ? config.colorMode : 'solid';
    config.orientation = config.orientation === 'auto' ? 'auto' : 'landscape';
    config.speed = Math.min(480, Math.max(15, Number(config.speed) || 50));
    config.fontRatio = typeof config.fontRatio === 'number' && isFinite(config.fontRatio) ? Math.max(0.05, Math.min(2, config.fontRatio)) : null;
    this.setData(Object.assign({}, config, { id: id, name: name, colorInput: config.color, settingsOpen: !id }));
    this.savedConfig = JSON.stringify(configOf(this.data));
    this.updateSize();
  },
  onShow: function () {
    if (wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn: true, fail: function () {
      wx.showToast({ title: '屏幕常亮未开启', icon: 'none' });
    } });
    if (this.data.text !== undefined) this.updateSize();
  },
  onHide: function () { if (wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn: false }); },
  onUnload: function () {
    clearTimeout(this.measureTimer);
    if (wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn: false });
    if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
  },
  onResize: function (event) { this.updateSize(event && event.size); },
  updateSize: function (size) {
    var info = size || (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
    var width = Number(info.windowWidth) || Number(info.screenWidth) || 640;
    var height = Number(info.windowHeight) || Number(info.screenHeight) || 360;
    var menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    var safeTop = menu && menu.bottom > 0 && menu.bottom < height / 2 ? Math.ceil(menu.bottom) : 0;
    this.setData({ stageWidth: width, stageHeight: height, safeTop: safeTop });
    this.updateLayout();
  },
  updateLayout: function () {
    var lines = this.data.text ? this.data.text.split('\n') : [];
    var count = Math.max(1, lines.length);
    var height = this.data.stageHeight || 360;
    var auto = Math.min(300, Math.max(1, height * 0.76 / (count * 1.16)));
    var font = this.data.fontRatio === null ? auto : Math.max(16, height * this.data.fontRatio);
    this.setData({ lines: lines.map(function (line, index) { return { id: index, text: line || '\u00a0' }; }), fontPx: Math.round(font) });
    this.scheduleMeasure();
  },
  scheduleMeasure: function () {
    var page = this;
    var revision = (this.measureRevision || 0) + 1;
    this.measureRevision = revision;
    clearTimeout(this.measureTimer);
    this.measureTimer = setTimeout(function () {
      if (!page.data.lines.length) return page.setData({ scrolling: false, contentWidth: 0 });
      wx.createSelectorQuery().in(page).selectAll('.measure-line').boundingClientRect(function (rects) {
        if (page.measureRevision !== revision || !rects || !rects.length) return;
        var width = rects.reduce(function (max, rect) { return Math.max(max, rect.width || 0); }, 0);
        var stage = page.data.stageWidth;
        var gap = Math.max(100, stage * 0.35);
        var loop = Math.ceil(width + gap);
        page.setData({ contentWidth: Math.ceil(width), scrolling: width > stage + 1,
          loopWidth: loop, duration: Math.max(0.1, loop / Number(page.data.speed)) });
      }).exec();
    }, 80);
  },
  markChanged: function () {
    var dirty = JSON.stringify(configOf(this.data)) !== this.savedConfig;
    if (dirty === this.alertEnabled) return;
    this.alertEnabled = dirty;
    if (wx.enableAlertBeforeUnload && dirty) {
      wx.enableAlertBeforeUnload({ message: '桌牌有未保存的修改，确定离开吗？' });
    } else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
  },
  updateText: function (event) {
    this.setData({ text: event.detail.value }); this.updateLayout(); this.markChanged();
  },
  setMode: function (event) { this.setData({ colorMode: event.currentTarget.dataset.mode }); this.markChanged(); },
  setOrientation: function (event) { this.setData({ orientation: event.currentTarget.dataset.orientation }); this.markChanged(); },
  setSpeed: function (event) {
    this.setData({ speed: Number(event.detail.value) }); this.scheduleMeasure(); this.markChanged();
  },
  setTarget: function (event) {
    var target = event.currentTarget.dataset.target;
    this.setData({ colorTarget: target, colorInput: this.data[target] });
  },
  setColor: function (event) {
    var color = event.currentTarget.dataset.color, changes = { colorInput: color };
    changes[this.data.colorTarget] = color;
    this.setData(changes); this.markChanged();
  },
  inputColor: function (event) {
    var raw = event.detail.value, value = cleanHex(raw), changes = { colorInput: raw };
    if (value) changes[this.data.colorTarget] = value;
    this.setData(changes);
    if (value) this.markChanged();
  },
  finishColor: function () {
    if (!cleanHex(this.data.colorInput)) {
      this.setData({ colorInput: this.data[this.data.colorTarget] });
      wx.showToast({ title: '请输入六位颜色值', icon: 'none' });
    }
  },
  toggleSettings: function () {
    if (Date.now() < (this.ignoreTapUntil || 0) || this.data.dialog) return;
    this.setData({ settingsOpen: !this.data.settingsOpen });
  },
  absorbTap: function () {},
  touchStart: function (event) {
    if (event.touches.length !== 2) return;
    this.pinch = { distance: distance(event.touches), font: this.data.fontPx };
    this.ignoreTapUntil = Date.now() + 500;
  },
  touchMove: function (event) {
    if (!this.pinch || event.touches.length !== 2 || !this.pinch.distance) return;
    var font = this.pinch.font * distance(event.touches) / this.pinch.distance;
    var ratio = Math.max(0.05, Math.min(2, font / this.data.stageHeight));
    this.setData({ fontRatio: ratio }); this.updateLayout(); this.markChanged();
    this.ignoreTapUntil = Date.now() + 500;
  },
  touchEnd: function () { if (this.pinch) { this.pinch = null; this.ignoreTapUntil = Date.now() + 500; } },
  resetSize: function () { this.setData({ fontRatio: null }); this.updateLayout(); this.markChanged(); },
  requestSave: function (exitAfter) {
    if (!this.data.text.trim()) return wx.showToast({ title: '请先输入桌牌文字', icon: 'none' });
    this.setData({ dialog: { kind: 'save', value: this.data.name || defaultName(this.data.text), exitAfter: exitAfter === true, error: '' } });
  },
  saveButton: function () { this.requestSave(false); },
  inputName: function (event) { this.setData({ 'dialog.value': event.detail.value, 'dialog.error': '' }); },
  closeDialog: function () { this.setData({ dialog: null }); },
  confirmSave: function () {
    var dialog = this.data.dialog, name = dialog && String(dialog.value || '').trim();
    if (!name) return this.setData({ 'dialog.error': '请输入桌牌名称' });
    var result = storage.read();
    if (!result.ok) return this.setData({ 'dialog.error': '读取失败，未覆盖已有记录' });
    var id = this.data.id || makeId();
    var record = { id: id, name: name, text: this.data.text, updatedAt: Date.now(), config: configOf(this.data) };
    var index = result.items.findIndex(function (item) { return item.id === id; });
    if (this.data.id && index < 0) return this.setData({ 'dialog.error': '原桌牌已不存在，请返回后新建' });
    if (index >= 0) result.items.splice(index, 1);
    result.items.unshift(record);
    if (!storage.save(result.items)) return this.setData({ 'dialog.error': '保存失败，请检查设备存储' });
    this.setData({ id: id, name: name, dialog: null });
    this.savedConfig = JSON.stringify(configOf(this.data));
    this.alertEnabled = false;
    if (dialog.exitAfter) this.leave();
    else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
    if (!dialog.exitAfter) wx.showToast({ title: '桌牌已保存', icon: 'success' });
  },
  requestBack: function () {
    if (JSON.stringify(configOf(this.data)) === this.savedConfig) return this.leave();
    this.setData({ dialog: { kind: 'exit' } });
  },
  leave: function () {
    if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload({ complete: function () { wx.navigateBack(); } });
    else wx.navigateBack();
  },
  saveAndLeave: function () { this.requestSave(true); }
});
