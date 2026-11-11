var KEY = 'lan-test-last-v1';

function Log(storage, limit) {
  this.storage = storage;
  this.limit = limit || 300;
  this.items = [];
  this.dropped = 0;
  this.report = null;
  this.reportBeforeClear = false;
  try {
    var saved = storage.getStorageSync(KEY);
    if (saved && Array.isArray(saved.items)) {
      this.items = saved.items.slice(-this.limit);
      this.dropped = Number(saved.dropped) || 0;
      this.report = saved.report || null;
      this.reportBeforeClear = !!saved.reportBeforeClear;
    }
  } catch (ignored) {}
}

Log.prototype.add = function (level, stage, detail) {
  var now = new Date();
  this.items.push({ time: now.toLocaleString() + '.' + String(now.getMilliseconds()).padStart(3, '0'), level: level, stage: String(stage), detail: String(detail || '').slice(0, 2000) });
  if (this.items.length > this.limit) {
    var index = this.items.findIndex(function (item) { return item.level !== 'error'; });
    this.items.splice(index < 0 ? 0 : index, 1);
    this.dropped++;
  }
};

Log.prototype.clear = function () {
  this.items = [];
  this.dropped = 0;
  this.reportBeforeClear = !!this.report;
};

Log.prototype.save = function () {
  try {
    this.storage.setStorageSync(KEY, { items: this.items, dropped: this.dropped, report: this.report, reportBeforeClear: this.reportBeforeClear });
    return true;
  } catch (ignored) { return false; }
};

module.exports = Log;
