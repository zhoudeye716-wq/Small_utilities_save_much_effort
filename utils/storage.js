function loadState(key, fallback) {
  try {
    var value = wx.getStorageSync(key);
    return value === '' || value === undefined || value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function saveState(key, value) {
  try { wx.setStorageSync(key, value); } catch (error) { return false; }
  return true;
}

function clearState(key) {
  try { wx.removeStorageSync(key); } catch (error) { return false; }
  return true;
}

module.exports = { loadState: loadState, saveState: saveState, clearState: clearState };
