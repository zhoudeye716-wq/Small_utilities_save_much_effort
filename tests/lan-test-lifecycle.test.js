const test = require('node:test');
const assert = require('node:assert/strict');

test('离开测试页面再进入时保留已创建房间并记录隐藏和恢复', () => {
  let definition, closed = 0, copied = '';
  const saved = new Map();
  global.Page = value => { definition = value; };
  global.wx = {
    getStorageSync: key => saved.get(key),
    setStorageSync: (key, value) => saved.set(key, value),
    createUDPSocket: () => ({ onMessage() {}, onError() {}, bind: () => 43219, send() {}, close() { closed++; } }),
    setClipboardData: ({ data }) => { copied = data; },
    getDeviceInfo: () => ({}), getAppBaseInfo: () => ({})
  };
  require('../pages/lan-test/index.js');
  function page() {
    const instance = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) });
    instance.setData = data => Object.assign(instance.data, data);
    return instance;
  }
  const first = page();
  try {
    first.onLoad(); first.onShow(); first.createRoom();
    const id = first.data.roomId;
    first.onHide(); first.onUnload();
    assert.equal(closed, 0);
    const second = page();
    second.onLoad(); second.onShow();
    assert.equal(second.data.roomId, id);
    assert.equal(second.data.roomState, 'hosting');
    assert.equal(second.data.events.some(e => e.stage === '页面隐藏'), true);
    assert.equal(second.data.events.some(e => e.stage === '恢复连接检查'), true);
    second.showReport({ id: 'old-report', result: { state: 'complete' } });
    second.clearLogs();
    assert.equal(second.data.events.some(e => e.stage === '页面隐藏'), false);
    assert.equal(second.data.reportBeforeClear, true);
    second.copyReport();
    assert.doesNotMatch(copied, /old-report/);
    assert.match(copied, /日志已清空/);
    second.leave();
  } finally {
    delete global.Page;
    delete global.wx;
  }
});
