var test = require('node:test');
var assert = require('node:assert/strict');
var engine = require('../utils/offline-table.js');
var settlement = require('../utils/poker-settlement.js');

test('盈亏预览扣除累计补筹并把底池临时归还给投入人', function () {
  var table = engine.createTable({ players: 2, smallBlind: 1, bigBlind: 2, totalChips: 1000, unitPrice: 0.1 });
  table = engine.addChips(table, 0, 500).state;
  table.seats[0].stack += 300;
  table.seats[1].stack -= 300;
  var before = JSON.stringify(table);
  var result = settlement.summarize(table);
  assert.equal(result.valid, true);
  assert.deepEqual(result.players.map(function (p) { return p.cents; }), [3000, -3000]);
  assert.deepEqual(result.transfers.map(function (t) { return [t.from, t.to, t.cents]; }), [['P2', 'P1', 3000]]);
  assert.equal(JSON.stringify(table), before);
});

test('补筹记录跨小局保留、重置后回到初始筹码', function () {
  var table = engine.createTable({players: 2, totalChips: 1000});
  table = engine.addChips(table, 0, 500).state;
  table = engine.startNewHand(table);
  assert.equal(table.seats[0].buyIn, 1500);
  table = engine.startNewHand(table, {resetStacks:true});
  assert.equal(table.seats[0].buyIn, 1000);
});

test('旧牌局账本缺失或金额无法以分表示时不能猜测结果', function () {
  var table = engine.createTable({players:2, totalChips:1000, unitPrice:0.1});
  delete table.seats[0].buyIn;
  assert.equal(settlement.summarize(table).valid, false);
  table = engine.createTable({players:2, totalChips:1000, unitPrice:0.015});
  assert.equal(settlement.summarize(table).valid, false);
});

test('底池与投入记录不一致时不能提供转账建议', function () {
  var table = engine.createTable({players:2, totalChips:1000, unitPrice:0.1});
  table.pot += 1;
  assert.equal(settlement.summarize(table).valid, false);
});
test('同名玩家在盈亏和转账里能被区分', function () {
  var table=engine.createTable({players:2,totalChips:100,unitPrice:0.1});
  table.seats[0].name='小王';table.seats[1].name='小王';table.seats[0].stack+=10;table.seats[1].stack-=10;
  var result=settlement.summarize(table);
  assert.equal(result.valid,true);assert.notEqual(result.players[0].name,result.players[1].name);
  assert.notEqual(result.transfers[0].from,result.transfers[0].to);
});
