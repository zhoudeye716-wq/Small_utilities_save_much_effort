var test = require('node:test');
var assert = require('node:assert/strict');
var engine = require('../utils/offline-table.js');

test('庄家在盲注发出后可重新选择，筹码总额不变', function () {
  var table = engine.createTable({ players: 4, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  var moved = engine.setDealer(table, 2);
  assert.equal(moved.dealerSeat, 2);
  assert.equal(moved.seats[3].streetBet, 1);
  assert.equal(moved.seats[0].streetBet, 2);
  assert.equal(moved.pot, 3);
  assert.equal(moved.seats.reduce(function (sum, seat) { return sum + seat.stack; }, moved.pot), 400);
});

test('下注行动开始后不允许改变庄家和盲注', function () {
  var table = engine.createTable({ players: 4, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table = engine.applyAction(table, { type: 'next' }).state;
  var before = JSON.parse(JSON.stringify(table));
  var moved = engine.setDealer(table, 2);
  assert.equal(moved.dealerSeat, before.dealerSeat);
  assert.deepEqual(moved.seats, before.seats);
  assert.equal(moved.pot, before.pot);
});

test('线下牌桌中任何当前玩家都可以弃牌', function () {
  var table = engine.createTable({ players: 4, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table = engine.setHero(table, table.currentSeat);
  var result = engine.applyAction(table, { type: 'fold' });
  assert.equal(result.error, undefined);
  assert.equal(result.state.seats[3].folded, true);
  assert.equal(result.state.currentSeat, 0);
});

test('补充筹码只增加选中玩家的余额，不改变底池', function () {
  assert.equal(typeof engine.addChips, 'function');
  var table = engine.createTable({ players: 4, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  var result = engine.addChips(table, 3, 50);
  assert.equal(result.error, undefined);
  assert.equal(result.state.seats[3].stack, 150);
  assert.equal(result.state.pot, 3);
  assert.equal(table.seats[3].stack, 100);
  assert.ok(engine.addChips(table, 3, -2).error);
});

test('补充筹码不能让全桌筹码超出安全整数范围', function () {
  var table = engine.createTable({ players: 2, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  var result = engine.addChips(table, 0, Number.MAX_SAFE_INTEGER);
  assert.ok(result.error);
  assert.equal(result.state.seats[0].stack, table.seats[0].stack);
});

test('筹码不足时跟注可以全下，之后跳过该玩家继续行动', function () {
  var table = engine.createTable({ players: 3, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table.seats[0].stack = 1;
  var result = engine.applyAction(table, { type: 'next' });
  assert.equal(result.error, undefined);
  assert.equal(result.state.seats[0].stack, 0);
  assert.equal(result.state.seats[0].totalBet, 1);
  assert.equal(result.state.currentSeat, 1);
});

test('按各人投入划分主池边池并允许平分', function () {
  assert.equal(typeof engine.getPots, 'function');
  assert.equal(typeof engine.settlePots, 'function');
  var table = engine.createTable({ players: 3, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table.seats.forEach(function (seat, index) {
    seat.stack = 0;
    seat.totalBet = index === 0 ? 50 : 100;
    seat.folded = false;
  });
  table.pot = 250;
  table.stage = 'showdown';
  var pots = engine.getPots(table);
  assert.deepEqual(pots.map(function (pot) { return { amount: pot.amount, eligible: pot.eligible }; }), [
    { amount: 150, eligible: [0, 1, 2] },
    { amount: 100, eligible: [1, 2] }
  ]);
  var result = engine.settlePots(table, [[0], [1, 2]]);
  assert.equal(result.error, undefined);
  assert.equal(result.state.seats[0].stack, 150);
  assert.equal(result.state.seats[1].stack, 49);
  assert.equal(result.state.seats[2].stack, 48);
  assert.equal(result.state.pot, 3);
});

test('盲注不足时的全下玩家被跳过，其余玩家仍需行动', function () {
  var table = engine.createTable({ players: 3, smallBlind: 1, bigBlind: 5, totalChips: 2 });
  assert.equal(table.currentSeat, 0);
  assert.equal(table.currentBet, 5);
  table = engine.applyAction(table, { type: 'next' }).state;
  assert.equal(table.currentSeat, 1);
  table = engine.applyAction(table, { type: 'next' }).state;
  assert.equal(table.stage, 'showdown');
  assert.equal(table.pot, 6);
});

test('进行中的牌局不允许临时补充筹码', function () {
  var table = engine.createTable({ players: 4, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table = engine.applyAction(table, { type: 'next' }).state;
  var result = engine.addChips(table, 0, 50);
  assert.ok(result.error);
  assert.equal(result.state.seats[0].stack, table.seats[0].stack);
});

test('短额全下不会让已经行动过的玩家重新获得加注权', function () {
  var table = engine.createTable({ players: 4, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table.seats.forEach(function (seat) { seat.streetBet = 10; seat.totalBet = 10; seat.stack = 90; seat.acted = true; });
  table.seats[1].stack = 2;
  table.seats[1].acted = false;
  table.currentBet = 10;
  table.lastRaise = 10;
  table.currentSeat = 1;
  table.pot = 40;
  table.stage = 'flop';
  var added = engine.applyAction(table, { type: 'add', amount: 2 });
  assert.equal(added.error, undefined);
  var advanced = engine.applyAction(added.state, { type: 'next' });
  assert.equal(advanced.state.currentSeat, 2);
  assert.ok(engine.applyAction(advanced.state, { type: 'add', amount: 12 }).error);
  var called = engine.applyAction(advanced.state, { type: 'next' });
  assert.equal(called.state.seats[2].streetBet, 12);
});

test('多次短额全下累计达到完整加注后重新开放加注', function () {
  var table = engine.createTable({ players: 4, smallBlind: 1, bigBlind: 2, totalChips: 400 });
  table.seats.forEach(function (seat) { seat.streetBet = 100; seat.totalBet = 100; seat.stack = 300; seat.acted = true; seat.lastActedBet = 100; });
  table.seats[1].stack = 50;
  table.seats[1].acted = false;
  table.seats[2].stack = 100;
  table.seats[2].acted = false;
  table.currentBet = 100;
  table.lastRaise = 100;
  table.currentSeat = 1;
  table.pot = 400;
  table.stage = 'flop';
  table = engine.applyAction(table, { type: 'add', amount: 50 }).state;
  table = engine.applyAction(table, { type: 'next' }).state;
  table = engine.applyAction(table, { type: 'add', amount: 100 }).state;
  table = engine.applyAction(table, { type: 'next' }).state;
  assert.equal(table.currentSeat, 3);
  table = engine.applyAction(table, { type: 'next' }).state;
  assert.equal(table.currentSeat, 0);
  var reraised = engine.applyAction(table, { type: 'add', amount: 200 });
  assert.equal(reraised.error, undefined);
  assert.equal(reraised.state.currentBet, 300);
});

test('翻牌后短额全下开注可以补足到最小下注额', function () {
  var table = engine.createTable({ players: 3, smallBlind: 50, bigBlind: 100, totalChips: 400 });
  table.seats.forEach(function (seat) { seat.streetBet = 0; seat.totalBet = 0; seat.stack = 400; seat.acted = false; });
  table.seats[0].stack = 25;
  table.currentBet = 0;
  table.lastRaise = 100;
  table.currentSeat = 0;
  table.pot = 0;
  table.stage = 'flop';
  table = engine.applyAction(table, { type: 'add', amount: 25 }).state;
  table = engine.applyAction(table, { type: 'next' }).state;
  var completed = engine.applyAction(table, { type: 'add', amount: 100 });
  assert.equal(completed.error, undefined);
  assert.equal(completed.state.currentBet, 100);
  assert.equal(completed.state.lastRaise, 100);
});

test('过牌后面对不足最小额的全下仍可完成开注', function () {
  var table = engine.createTable({ players: 3, smallBlind: 50, bigBlind: 100, totalChips: 400 });
  table.seats.forEach(function (seat) { seat.streetBet = 0; seat.totalBet = 0; seat.stack = 400; seat.acted = true; seat.lastActedBet = 0; });
  table.seats[1].stack = 25;
  table.seats[1].acted = false;
  table.currentBet = 0;
  table.lastRaise = 100;
  table.currentSeat = 1;
  table.pot = 0;
  table.stage = 'flop';
  table = engine.applyAction(table, { type: 'add', amount: 25 }).state;
  table = engine.applyAction(table, { type: 'next' }).state;
  table = engine.applyAction(table, { type: 'next' }).state;
  assert.equal(table.currentSeat, 0);
  var completed = engine.applyAction(table, { type: 'add', amount: 100 });
  assert.equal(completed.error, undefined);
  assert.equal(completed.state.currentBet, 100);
});

test('无人跟注的多余筹码退回原玩家', function () {
  var table = engine.createTable({ players: 3, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  [50, 100, 80].forEach(function (amount, index) {
    table.seats[index].stack = 0;
    table.seats[index].totalBet = amount;
  });
  table.stage = 'showdown';
  table.pot = 230;
  var result = engine.settlePots(table, [[0], [1], []]);
  assert.equal(result.error, undefined);
  assert.equal(result.state.seats[0].stack, 150);
  assert.equal(result.state.seats[1].stack, 80);
  assert.equal(result.state.seats[2].stack, 0);
  assert.equal(result.state.stage, 'waiting');
  assert.equal(result.state.pot, 0);
});

test('平分底池时余下的单个筹码按庄家后顺序分配', function () {
  var table = engine.createTable({ players: 3, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table.seats.forEach(function (seat) { seat.stack = 99; seat.totalBet = 1; });
  table.pot = 3;
  table.stage = 'showdown';
  var result = engine.settlePots(table, [[0, 1]]);
  assert.equal(result.error, undefined);
  assert.equal(result.state.seats[0].stack, 100);
  assert.equal(result.state.seats[1].stack, 100);
  assert.equal(result.state.seats[2].stack, 97);
  assert.equal(result.state.pot, 3);
});

test('三人全下后结算，补齐筹码会自动开始新一局', function () {
  var table = engine.createTable({ players: 3, smallBlind: 1, bigBlind: 2, totalChips: 10 });
  table = engine.applyAction(table, { type: 'add', amount: 10 }).state;
  table = engine.applyAction(table, { type: 'next' }).state;
  table = engine.applyAction(table, { type: 'next' }).state;
  table = engine.applyAction(table, { type: 'next' }).state;
  assert.equal(table.stage, 'showdown');
  assert.equal(table.pot, 30);
  var settled = engine.settlePots(table, [[0]]);
  assert.equal(settled.error, undefined);
  assert.equal(settled.state.stage, 'waiting');
  assert.deepEqual(settled.state.seats.map(function (seat) { return seat.stack; }), [30, 0, 0]);
  var first = engine.addChips(settled.state, 1, 10);
  assert.equal(first.state.stage, 'waiting');
  var second = engine.addChips(first.state, 2, 10);
  assert.equal(second.state.stage, 'preflop');
  assert.deepEqual(second.state.seats.map(function (seat) { return seat.stack; }), [30, 9, 8]);
  assert.equal(second.state.pot, 3);
});

test('只剩一人时自动结算，返还无人跟注的盲注并保留筹码总量', function () {
  var table = engine.createTable({ players: 2, smallBlind: 1, bigBlind: 2, totalChips: 10 });
  var result = engine.applyAction(table, { type: 'fold' });
  assert.equal(result.error, undefined);
  assert.equal(result.state.stage, 'preflop');
  assert.deepEqual(result.state.seats.map(function (seat) { return seat.stack; }), [8, 9]);
  assert.equal(result.state.pot, 3);
});

test('弃牌玩家投入不同金额不会把同资格底池拆分导致平分误差', function () {
  var table = engine.createTable({ players: 5, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  [5, 1, 5, 2, 5].forEach(function (amount, index) {
    table.seats[index].stack = 100 - amount;
    table.seats[index].totalBet = amount;
    table.seats[index].folded = index === 1 || index === 3;
  });
  table.pot = 18;
  table.stage = 'showdown';
  assert.deepEqual(engine.getPots(table).map(function (pot) { return [pot.amount, pot.eligible]; }), [[18, [0, 2, 4]]]);
  var result = engine.settlePots(table, [[0, 2]]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state.seats.map(function (seat) { return seat.stack; }), [104, 98, 102, 98, 95]);
  assert.equal(result.state.pot, 3);
});

test('主池赢家有资格参与边池时，不能把边池判给输家', function () {
  var table = engine.createTable({ players: 3, smallBlind: 1, bigBlind: 2, totalChips: 100 });
  table.seats.forEach(function (seat, index) { seat.stack = 0; seat.totalBet = index === 0 ? 50 : 100; });
  table.pot = 250;
  table.stage = 'showdown';
  var result = engine.settlePots(table, [[1], [2]]);
  assert.ok(result.error);
  assert.equal(result.state.pot, 250);
  assert.deepEqual(result.state.seats.map(function (seat) { return seat.stack; }), [0, 0, 0]);
});
