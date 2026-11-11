var test = require('node:test');
var assert = require('node:assert/strict');
var game = require('../utils/guess-size.js');

var settings = { lower: 0, upper: 100, sound: true, vibration: true };

function roundWith77() {
  return game.startRound(settings, function () { return 0.77; });
}

test('开局两端都可抽中，四位数范围合法', function () {
  assert.equal(game.validateSettings({ lower: 0, upper: 9999, sound: false, vibration: true }), true);
  [10000, 0, 10.5, '100'].forEach(function (upper) {
    assert.equal(game.validateSettings(Object.assign({}, settings, { upper: upper })), false);
  });
  assert.equal(game.validateSettings(Object.assign({}, settings, { lower: -1 })), false);
  assert.equal(game.startRound(settings, function () { return 0; }).answer, 0);
  assert.equal(game.startRound(settings, function () { return 0.999999; }).answer, 100);
});

test('猜错只排除对应边界，最后一个数仍需提交', function () {
  var initial = roundWith77();
  var high = game.guessNumber(initial, '78');
  assert.equal(high.kind, 'right');
  assert.equal(high.round.right, 78);
  assert.equal(high.round.rightOpen, true);
  assert.equal(initial.right, 100);
  assert.equal(game.guessNumber(high.round, '0').kind, 'left');
  var low = game.guessNumber(high.round, '76');
  assert.equal(low.kind, 'left');
  assert.equal(low.round.left, 76);
  assert.equal(low.round.leftOpen, true);
  assert.equal(game.countRemaining(low.round), 1);
  assert.equal(game.guessNumber(low.round, '76').kind, 'invalid');
  assert.equal(game.guessNumber(low.round, '78').kind, 'invalid');
  assert.equal(game.guessNumber(low.round, '77').kind, 'hit');
});

test('空白和非法猜测不能改变当前局面', function () {
  var round = roundWith77();
  ['', ' ', '101', '7e1', '5.5', '-1', '00000'].forEach(function (guess) {
    assert.equal(game.guessNumber(round, guess).kind, 'invalid');
  });
  assert.equal(game.guessNumber(round, '0077').kind, 'hit');
  assert.deepEqual(round, roundWith77());
});

test('存档必须保留合法答案以及与初始范围一致的边界', function () {
  var round = game.guessNumber(roundWith77(), '78').round;
  assert.equal(game.isSavedRound(round), true);
  assert.equal(game.isSavedRound(Object.assign({}, round, { answer: 78 })), false);
  assert.equal(game.isSavedRound(Object.assign({}, round, { rightOpen: false })), false);
  assert.equal(game.isSavedRound(Object.assign({}, round, { left: -1 })), false);
  assert.equal(game.isSavedRound(Object.assign({}, round, { settings: null })), false);
});
