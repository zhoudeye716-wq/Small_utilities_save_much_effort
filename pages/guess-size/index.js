var game = require('../../utils/guess-size.js');
var STORAGE_KEY = 'guess-size-current-v1';
var FLIGHT_MS = 355;
var IMPACT_MS = 320;
var BURST_MS = 540;
var RANGE_INPUT = /^\d{1,4}$/;
var GUESS_MESSAGES = {
  empty: '先输入一个数字',
  format: '请输入四位以内的整数',
  outside: '这个数字超出当前范围',
  excluded: '这侧边界已经猜过了'
};

function formFrom(settings) {
  return {
    lower: String(settings.lower),
    upper: String(settings.upper),
    sound: settings.sound,
    vibration: settings.vibration
  };
}

function displayRound(round) {
  var count = game.countRemaining(round);
  var initialCount = round.settings.upper - round.settings.lower + 1;
  var ratio = (count - 1) / (initialCount - 1);
  return {
    left: round.left,
    right: round.right,
    leftOpen: round.leftOpen,
    rightOpen: round.rightOpen,
    beatMs: Math.round(880 + 940 * Math.sqrt(ratio)),
    pace: count <= 5 ? '临界' : ratio < .65 ? '收紧' : '对局中'
  };
}

Page({
  data: {
    screen: 'setup',
    form: formFrom(game.DEFAULT_SETTINGS),
    digits: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    left: 0,
    right: 100,
    leftOpen: false,
    rightOpen: false,
    beatMs: 1820,
    pace: '对局中',
    input: '',
    flightNumber: '',
    resultNumber: null,
    motion: '',
    notice: '',
    headerTop: 4,
    headerHeight: 38
  },

  onLoad: function () {
    var saved;
    var notice = '';
    try { saved = wx.getStorageSync(STORAGE_KEY); }
    catch (error) { notice = '暂时无法读取本机存档'; }
    this.round = game.isSavedRound(saved) ? saved : null;
    this.setData(Object.assign({
      screen: this.round ? 'resume' : 'setup',
      notice: notice
    }, this.round ? displayRound(this.round) : {}));
    this.measureHeader();
  },

  onResize: function () { this.measureHeader(); },

  onHide: function () {
    if (this.transition) this.finishMotion();
    if (this.audio) this.audio.stop();
  },

  onUnload: function () {
    clearTimeout(this.motionTimer);
    this.transition = null;
    if (this.audio) this.audio.destroy();
  },

  measureHeader: function () {
    if (!wx.getMenuButtonBoundingClientRect) return;
    var menu = wx.getMenuButtonBoundingClientRect();
    if (menu && menu.height > 0 && menu.bottom > 0) {
      this.setData({ headerTop: menu.top, headerHeight: menu.bottom + 6 });
    }
  },

  goBack: function () {
    if (this.data.screen === 'setup' && this.round) {
      this.setData(Object.assign({ screen: 'resume', notice: '' }, displayRound(this.round)));
      return;
    }
    wx.navigateBack();
  },

  openSetup: function () {
    this.setData({
      screen: 'setup',
      form: formFrom(this.round ? this.round.settings : game.DEFAULT_SETTINGS),
      notice: ''
    });
  },

  updateRange: function (event) {
    var bound = event.currentTarget.dataset.bound;
    var value = event.detail.value;
    var form = Object.assign({}, this.data.form);
    form[bound] = value;
    this.setData({ form: form, notice: '' });
  },

  updateFeedback: function (event) {
    var form = Object.assign({}, this.data.form);
    form[event.currentTarget.dataset.option] = !!event.detail.value;
    this.setData({ form: form });
  },

  startNewRound: function () {
    if (this.data.screen !== 'setup') return;
    var form = this.data.form;
    var settings = Object.assign({}, form, { lower: Number(form.lower), upper: Number(form.upper) });
    if (!RANGE_INPUT.test(form.lower) || !RANGE_INPUT.test(form.upper) || !game.validateSettings(settings)) {
      this.setData({ notice: '请填写 0–9999 的整数，且上限大于下限' });
      return;
    }
    this.createRound(settings);
  },

  createRound: function (settings) {
    var round = game.startRound(settings);
    if (!this.saveRound(round)) return;
    this.resultSettings = null;
    this.resumeRound();
  },

  saveRound: function (round) {
    try { wx.setStorageSync(STORAGE_KEY, round); }
    catch (error) {
      this.setData({ notice: '本机保存失败，请再试一次' });
      return false;
    }
    this.round = round;
    return true;
  },

  resumeRound: function () {
    if (!this.round) return;
    this.setData(Object.assign({
      screen: 'play',
      input: '',
      flightNumber: '',
      resultNumber: null,
      motion: '',
      notice: ''
    }, displayRound(this.round)));
  },

  replayRound: function () {
    if (this.data.screen === 'result' && this.resultSettings) this.createRound(this.resultSettings);
  },

  pressDigit: function (event) {
    if (this.data.screen !== 'play' || this.transition || this.data.input.length >= 4) return;
    var digit = event.currentTarget.dataset.digit;
    this.setData({ input: (this.data.input === '0' ? '' : this.data.input) + digit, notice: '' });
  },

  clearInput: function () {
    if (!this.transition && this.data.screen === 'play') this.setData({ input: '', notice: '' });
  },

  submitGuess: function () {
    if (this.data.screen !== 'play' || this.transition || !this.round) return;
    var result = game.guessNumber(this.round, this.data.input);
    if (result.kind === 'invalid') {
      this.setData({ notice: GUESS_MESSAGES[result.reason] });
      return;
    }
    if (result.kind === 'hit') {
      this.beginBurst(result.number);
      return;
    }
    if (!this.saveRound(result.round)) return;
    this.transition = { phase: 'flight', side: result.kind };
    this.setMotion({
      motion: 'fly-' + result.kind,
      flightNumber: String(result.number),
      input: '',
      notice: ''
    }, FLIGHT_MS + 45, this.onFlightEnd);
  },

  onFlightEnd: function (event) {
    if (event && (!event.target || event.target.id !== 'flight-carrier')) return;
    if (!this.transition || this.transition.phase !== 'flight') return;
    var side = this.transition.side;
    this.transition.phase = 'impact';
    this.setMotion(Object.assign({
      motion: 'impact-' + side,
      flightNumber: '',
      notice: (side === 'left' ? '猜小了' : '猜大了') + ' · 范围缩到 ' + this.round.left + '–' + this.round.right
    }, displayRound(this.round)), IMPACT_MS, this.finishMotion);
  },

  beginBurst: function (number) {
    try { wx.removeStorageSync(STORAGE_KEY); }
    catch (error) {
      this.setData({ notice: '本机存档清除失败，请再试一次' });
      return;
    }
    this.resultSettings = this.round.settings;
    this.round = null;
    this.transition = { phase: 'burst', number: number };
    this.setMotion({ motion: 'burst', input: String(number), notice: '' }, BURST_MS, this.finishMotion);
    this.playFeedback(this.resultSettings);
  },

  playFeedback: function (settings) {
    if (settings.sound && wx.createInnerAudioContext) {
      try {
        if (!this.audio) {
          this.audio = wx.createInnerAudioContext();
          this.audio.src = '/assets/guess-size-burst.wav';
        }
        this.audio.play();
      } catch (error) {}
    }
    if (settings.vibration && wx.vibrateShort) {
      wx.vibrateShort({ type: 'heavy', fail: function () {} });
    }
  },

  setMotion: function (values, duration, next) {
    var page = this;
    clearTimeout(this.motionTimer);
    var transition = this.transition;
    var phase = transition.phase;
    function isCurrent() { return page.transition === transition && transition.phase === phase; }
    this.setData(values, function () {
      if (!isCurrent()) return;
      page.motionTimer = setTimeout(function () {
        if (isCurrent()) next.call(page);
      }, duration);
    });
  },

  finishMotion: function () {
    var transition = this.transition;
    clearTimeout(this.motionTimer);
    this.transition = null;
    if (!transition) return;
    if (transition.phase === 'burst') {
      this.setData({ screen: 'result', resultNumber: transition.number, input: '', motion: '', notice: '' });
    } else {
      this.setData(Object.assign({ input: '', flightNumber: '', motion: '' }, displayRound(this.round)));
    }
  }
});
