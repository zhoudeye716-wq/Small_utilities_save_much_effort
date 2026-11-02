var test = require('node:test');
var assert = require('node:assert/strict');
var engine = require('../utils/offline-table.js');
var pageDefinition;
var saved = {};
var modal;
var backOptions;
global.Page = function (definition) { pageDefinition = definition; };
global.wx = {
  setStorageSync: function (key, value) { saved[key] = value; },
  showToast: function () {}, showModal: function (options) { modal = options; },
  navigateBack: function (options) { backOptions = options; }, redirectTo: function () {}
};
require('../pages/offline-table/index.js');

function makePage() {
  var page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.setData = function (values) { Object.assign(this.data, values); };
  page.updateTable(engine.createTable({ players: 4, smallBlind: 1, bigBlind: 2, totalChips: 100 }));
  return page;
}
function tapAmount(value) { return { currentTarget: { dataset: { amount: value } } }; }

test('快捷筹码先暂存，确认后才进入底池并切到下一位', function () {
  var page = makePage();
  page.addBet(tapAmount(5));
  assert.equal(page.data.pendingBet, 5);
  assert.equal(page.data.table.pot, 3);
  page.confirmBet();
  assert.equal(page.data.table.pot, 8);
  assert.equal(page.data.table.seats[3].totalBet, 5);
  assert.equal(page.data.table.currentSeat, 0);
  assert.equal(page.data.pendingBet, 0);
});

test('已选择筹码未确认时，跟注不会意外丢失该选择', function () {
  var page = makePage();
  page.addBet(tapAmount(5));
  page.nextSeat();
  assert.equal(page.data.pendingBet, 5);
  assert.equal(page.data.table.currentSeat, 3);
  assert.equal(page.data.table.pot, 3);
});

test('普通点选座位不会意外更换庄家', function () {
  var page = makePage();
  page.onSeatTap({ currentTarget: { dataset: { index: 2 } } });
  assert.equal(page.data.table.dealerSeat, 0);
  assert.equal(page.data.table.pot, 3);
});

test('可直接输入任意整数下注并确认', function () {
  var page = makePage();
  assert.equal(typeof page.setPendingBet, 'function');
  page.setPendingBet({ detail: { value: '7' } });
  assert.equal(page.data.pendingBet, 7);
  page.confirmBet();
  assert.equal(page.data.table.pot, 10);
  assert.equal(page.data.table.seats[3].totalBet, 7);
});

test('为主池和边池分别选择赢家并支持平分', function () {
  var page = makePage();
  var table = engine.createTable({ players: 3, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table.seats.forEach(function (seat, index) { seat.stack = 0; seat.totalBet = index === 0 ? 50 : 100; });
  table.pot = 250;
  table.stage = 'showdown';
  page.updateTable(table);
  page.choosePot({ currentTarget: { dataset: { index: 0 } } });
  page.onSeatTap({ currentTarget: { dataset: { index: 0 } } });
  page.cancelMode();
  page.choosePot({ currentTarget: { dataset: { index: 1 } } });
  page.onSeatTap({ currentTarget: { dataset: { index: 1 } } });
  page.onSeatTap({ currentTarget: { dataset: { index: 2 } } });
  page.cancelMode();
  page.settle();
  assert.equal(page.data.table.stage, 'preflop');
  assert.deepEqual(page.data.table.seats.map(function (seat) { return seat.stack; }), [150, 49, 48]);
  assert.equal(page.data.table.pot, 3);
});

test('摊牌时选中的赢家保存在牌局中并可恢复', function () {
  var page = makePage();
  var table = engine.createTable({ players: 3, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table.seats.forEach(function (seat) { seat.stack = 0; seat.totalBet = 100; });
  table.pot = 300;
  table.stage = 'showdown';
  page.updateTable(table);
  page.choosePot({ currentTarget: { dataset: { index: 0 } } });
  page.onSeatTap({ currentTarget: { dataset: { index: 1 } } });
  var restored = JSON.parse(JSON.stringify(saved.offlineTable));
  var reopened = makePage();
  reopened.updateTable(restored);
  assert.deepEqual(reopened.data.selections, [[1]]);
  assert.deepEqual(reopened.data.table.winnerSelections, [[1]]);
});

test('设置庄家后返回先确认，再跳过旧牌桌回到设置页并保留当前牌局', function () {
  var page = makePage();
  global.getCurrentPages = function () { return [
    { route: 'pages/home/index' }, { route: 'pages/offline-setup/index' },
    { route: 'pages/offline-table/index' }, { route: 'pages/offline-table/index' }
  ]; };
  modal = null;
  backOptions = null;
  page.changeDealer();
  page.onSeatTap({ currentTarget: { dataset: { index: 2 } } });
  assert.equal(saved.offlineTable.dealerSeat, 2);
  assert.equal(typeof page.returnToSetup, 'function');
  page.returnToSetup();
  assert.ok(modal);
  assert.equal(backOptions, null);
  modal.success({ confirm: false, cancel: true });
  assert.equal(backOptions, null);
  modal.success({ confirm: true });
  assert.equal(backOptions.delta, 2);
  assert.equal(saved.offlineTable.dealerSeat, 2);
});
