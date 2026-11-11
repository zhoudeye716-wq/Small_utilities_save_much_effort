var test = require('node:test');
var assert = require('node:assert/strict');
var definition;
global.Page = function (page) { definition = page; };
require('../pages/guess-size/index.js');

function openPage(saved) {
  var state = { saved: saved, audio: 0, vibration: 0, back: 0 };
  global.wx = {
    getStorageSync: function () { return state.saved; },
    setStorageSync: function (key, value) {
      assert.equal(key, 'guess-size-current-v1');
      if (state.failSave) throw new Error('storage unavailable');
      state.saved = value;
    },
    removeStorageSync: function () { state.saved = undefined; },
    navigateBack: function () { state.back++; },
    createInnerAudioContext: function () {
      return { play: function () { state.audio++; }, stop: function () {}, destroy: function () {} };
    },
    vibrateShort: function () { state.vibration++; }
  };
  var page = Object.assign({}, definition, {
    data: Object.assign({}, definition.data),
    setData: function (values, callback) {
      Object.assign(this.data, values);
      if (callback) callback();
    }
  });
  page.onLoad();
  return { page: page, state: state };
}

function savedRound() {
  return {
    settings: { lower: 0, upper: 100, sound: false, vibration: true },
    answer: 77, left: 0, right: 100, leftOpen: false, rightOpen: false
  };
}

test('取消新局设置可以继续旧局，答案不进入对局视图', function () {
  var saved = savedRound();
  var fixture = openPage(saved);
  var page = fixture.page;
  assert.equal(page.data.screen, 'resume');
  page.openSetup();
  page.goBack();
  assert.equal(page.data.screen, 'resume');
  assert.equal(fixture.state.saved, saved);
  page.resumeRound();
  assert.equal(page.data.screen, 'play');
  assert.equal(page.data.input, '');
  assert.equal(page.data.resultNumber, null);
  assert.equal(page.data.answer, undefined);
});

test('猜错先保存，落位才更新显示，退到后台能接续最新局面', function () {
  var fixture = openPage(savedRound());
  var page = fixture.page;
  page.resumeRound();
  page.setData({ input: '78' });
  page.submitGuess();
  assert.equal(fixture.state.saved.right, 78);
  assert.equal(page.data.right, 100);
  assert.equal(page.data.motion, 'fly-right');
  page.submitGuess();
  page.onHide();
  assert.equal(page.data.right, 78);
  assert.equal(page.data.rightOpen, true);
  assert.equal(page.data.input, '');
  assert.equal(page.data.motion, '');
});

test('爆雷清除存档，两个开关独立，重开沿用设置', function () {
  var fixture = openPage(savedRound());
  var page = fixture.page;
  page.resumeRound();
  page.setData({ input: '77' });
  page.submitGuess();
  page.submitGuess();
  assert.equal(fixture.state.saved, undefined);
  assert.equal(fixture.state.audio, 0);
  assert.equal(fixture.state.vibration, 1);
  page.onHide();
  assert.equal(page.data.screen, 'result');
  assert.equal(page.data.resultNumber, 77);
  page.replayRound();
  assert.deepEqual(fixture.state.saved.settings, savedRound().settings);
  assert.equal(fixture.state.saved.rightOpen, false);
  assert.equal(page.data.resultNumber, null);
});

test('保存失败时保留上次存档与画面', function () {
  var saved = savedRound();
  var fixture = openPage(saved);
  var page = fixture.page;
  page.resumeRound();
  fixture.state.failSave = true;
  page.setData({ input: '78' });
  page.submitGuess();
  assert.equal(fixture.state.saved, saved);
  assert.equal(page.data.right, 100);
  assert.equal(page.data.motion, '');
  assert.match(page.data.notice, /保存失败/);
});

test('设置页不会把负数或小数改成另一个整数开局', function () {
  ['-10', '1.5', '1e2'].forEach(function (input) {
    var fixture = openPage();
    fixture.page.updateRange({ currentTarget: { dataset: { bound: 'upper' } }, detail: { value: input } });
    fixture.page.startNewRound();
    assert.equal(fixture.page.data.screen, 'setup');
    assert.equal(fixture.state.saved, undefined);
  });
});
