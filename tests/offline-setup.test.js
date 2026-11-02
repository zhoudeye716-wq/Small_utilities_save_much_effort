var test = require('node:test');
var assert = require('node:assert/strict');
var definition;
var dataStore = {};
var navigated;
var modal;
global.Page = function (page) { definition = page; };
global.wx = {
  getStorageSync: function (key) { return dataStore[key]; },
  setStorageSync: function (key, value) { dataStore[key] = value; },
  removeStorageSync: function (key) { delete dataStore[key]; },
  navigateTo: function (options) { navigated = options.url; },
  showModal: function (options) { modal = options; }, showToast: function () {}
};
require('../pages/offline-setup/index.js');
function makePage(settings) {
  var page = Object.assign({}, definition);
  page.data = { settings: settings };
  page.setData = function (values) { Object.assign(this.data, values); };
  return page;
}
test('开始新局会先确认，确认后即使设置相同也创建新牌桌', function () {
  var settings = { smallBlind: '1', bigBlind: '2', totalChips: '1000', unitPrice: '0.1', players: 4 };
  dataStore = { offlineSettings: settings, offlineTable: { pot: 90, dealerSeat: 3 } };
  navigated = null;
  modal = null;
  makePage(settings).enterTable();
  assert.ok(modal);
  assert.equal(navigated, null);
  assert.equal(dataStore.offlineTable.pot, 90);
  modal.success({ confirm: true });
  assert.equal(navigated, '/pages/offline-table/index');
  assert.ok(dataStore.offlineTable);
  assert.equal(dataStore.offlineTable.pot, 3);
  assert.equal(dataStore.offlineTable.dealerSeat, 0);
});
test('继续上一局保留上次的庄家和筹码，不采用未保存的设置', function () {
  var settings = { smallBlind: '1', bigBlind: '2', totalChips: '1000', unitPrice: '0.1', players: 4 };
  dataStore = { offlineSettings: settings, offlineTable: { pot: 90, dealerSeat: 3, seats: [{ stack: 42 }] } };
  navigated = null;
  var page = makePage(Object.assign({}, settings, { players: 6 }));
  assert.equal(typeof page.continueTable, 'function');
  page.continueTable();
  assert.equal(navigated, '/pages/offline-table/index');
  assert.equal(dataStore.offlineTable.dealerSeat, 3);
  assert.equal(dataStore.offlineTable.seats[0].stack, 42);
  assert.equal(dataStore.offlineSettings.players, 4);
});
test('非法筹码设置不会创建牌桌', function () {
  dataStore = {};
  navigated = null;
  makePage({ smallBlind: '1', bigBlind: '2', totalChips: '0', unitPrice: '0.1', players: 4 }).enterTable();
  assert.equal(navigated, null);
  assert.equal(dataStore.offlineSettings, undefined);
});
test('全桌初始筹码超出安全整数范围时不会创建牌桌', function () {
  dataStore = {};
  navigated = null;
  makePage({ smallBlind: '1', bigBlind: '2', totalChips: '9007199254740991', unitPrice: '0.1', players: 2 }).enterTable();
  assert.equal(navigated, null);
  assert.equal(dataStore.offlineSettings, undefined);
});
