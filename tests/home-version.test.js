const test = require('node:test');
const assert = require('node:assert/strict');

function loadHome(api) {
  let config;
  global.wx = api;
  global.getApp = () => ({});
  global.Page = page => { config = page; };
  delete require.cache[require.resolve('../pages/home/index.js')];
  require('../pages/home/index.js');
  const page = Object.assign({}, config, { data: Object.assign({}, config.data) });
  page.setData = values => Object.assign(page.data, values);
  page.onShow();
  return page.data.appVersion;
}

test('首页显示 Android 多端应用实际安装的版本', () => {
  assert.equal(loadHome({ getAppBaseInfo: () => ({ host: { env: 'SAAASDK', appVersion: '0.0.6' } }) }), '0.0.6');
});

test('首页显示正式小程序版本，缺少版本号时不显示', () => {
  assert.equal(loadHome({ getAccountInfoSync: () => ({ miniProgram: { version: '1.2.3' } }) }), '1.2.3');
  assert.equal(loadHome({ getAccountInfoSync: () => ({ miniProgram: {} }) }), '');
});

test('版本接口不可用时首页仍然能打开', () => {
  assert.equal(loadHome({ getAppBaseInfo() { throw new Error('not supported'); } }), '');
});
