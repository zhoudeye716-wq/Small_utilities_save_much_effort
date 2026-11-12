const test = require('node:test');
const assert = require('node:assert/strict');

function setup() {
  let definition, writes = [], navigated = '';
  const storage = new Map();
  global.Page = value => { definition = value; };
  global.getApp = () => ({});
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => { writes.push(key); storage.set(key, value); },
    navigateTo: options => { navigated = options.url; }, showToast() {}
  };
  delete require.cache[require.resolve('../pages/home/index.js')];
  require('../pages/home/index.js');
  function page() {
    const p = Object.assign({}, definition, {data: JSON.parse(JSON.stringify(definition.data))});
    p.setData = values => Object.assign(p.data, values);
    p.onLoad(); p.onShow(); return p;
  }
  return {page, storage, writes, getNavigated: () => navigated};
}

test('连续点五次版本号显示测试入口，点击一次隐藏，状态可跨重启保存', () => {
  const env = setup(); const home = env.page();
  assert.equal(home.data.showLanTest, false);
  for (let i = 0; i < 4; i++) home.onVersionTap();
  assert.equal(home.data.showLanTest, false);
  home.onVersionTap(); assert.equal(home.data.showLanTest, true);
  const reopened = env.page(); assert.equal(reopened.data.showLanTest, true);
  reopened.onVersionTap(); assert.equal(reopened.data.showLanTest, false);
  assert.equal(env.page().data.showLanTest, false);
  assert.equal(env.getNavigated(), '');
});

test('其他首页操作或离开页面会中断连续点击', () => {
  const env = setup(), home = env.page();
  for (let i = 0; i < 4; i++) home.onVersionTap();
  home.resetVersionTaps(); home.onVersionTap();
  assert.equal(home.data.showLanTest, false);
  home.onHide(); for (let i = 0; i < 4; i++) home.onVersionTap();
  assert.equal(home.data.showLanTest, false);
});

test('五次点击须在两秒内完成，超时后重新计数', () => {
  const env = setup(), home = env.page(), originalNow = Date.now;
  let now = 1000; Date.now = () => now;
  try {
    for (let i = 0; i < 4; i++) home.onVersionTap();
    now = 3001; home.onVersionTap();
    assert.equal(home.data.showLanTest, false);
    now = 5001; for (let i = 0; i < 4; i++) home.onVersionTap();
    assert.equal(home.data.showLanTest, true);
    now = 9000; home.onVersionTap();
    assert.equal(home.data.showLanTest, false);
  } finally { Date.now = originalNow; }
});

test('只展示或隐藏入口不会创建测试日志', () => {
  const env = setup(), home = env.page();
  for (let i = 0; i < 5; i++) home.onVersionTap();
  home.onVersionTap();
  assert.equal(env.writes.includes('lan-test-last-v1'), false);
  assert.equal(env.storage.has('lan-test-last-v1'), false);
});
