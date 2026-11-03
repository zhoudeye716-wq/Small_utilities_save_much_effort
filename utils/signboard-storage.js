'use strict';

var KEY = 'savedSignboards';

function read() {
  try {
    var value = wx.getStorageSync(KEY);
    if (value === '' || value === null || value === undefined) return { ok: true, items: [] };
    return Array.isArray(value) ? { ok: true, items: value } : { ok: false, items: [] };
  } catch (error) { return { ok: false, items: [] }; }
}

function save(items) {
  try { wx.setStorageSync(KEY, items); return true; } catch (error) { return false; }
}

module.exports = { read: read, save: save };
