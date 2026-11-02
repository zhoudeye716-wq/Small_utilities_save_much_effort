var cardUtils = require('../../utils/cards.js');
var decision = require('../../utils/decision.js');
var storage = require('../../utils/storage.js');
var ROLE_MAP = {
  2: ['D/SB', 'BB'],
  3: ['D', 'SB', 'BB'],
  4: ['D', 'SB', 'BB', 'UTG'],
  5: ['D', 'SB', 'BB', 'UTG', 'CO'],
  6: ['D', 'SB', 'BB', 'UTG', 'MP', 'CO'],
  7: ['D', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
  8: ['D', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
  9: ['D', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO']
};

function getPositions(count) {
  var positions = [];
  for (var i = 0; i < count; i += 1) {
    var angle = -Math.PI / 2 + (Math.PI * 2 * i / count);
    positions.push({ left: Math.round(50 + 43 * Math.cos(angle)), top: Math.round(50 + 40 * Math.sin(angle)) });
  }
  return positions;
}

Page({
  data: {
    hand: [null, null], board: [null, null, null, null, null], deck: [],
    slot: 'hand-0', slotLabel: '选择手牌 1', stageLabel: '准备期',
    pot: '0', match: '0', held: '1000', continuous: true,
    increments: [5, 10, 50, 100, 500], seats: [], dealerSeat: 0,
    wins: 0, losses: 0, analysisMessage: ''
  },
  onLoad: function () {
    var settings = storage.loadState('analyzerSettings', { players: 4, totalChips: '1000' });
    var saved = storage.loadState('analyzerState', {});
    var count = Math.max(2, Math.min(9, Number(settings.players) || 4));
    var state = Object.assign({}, this.data, saved);
    state.held = state.held || settings.totalChips || '1000';
    state.seats = this.buildSeats(count, state.dealerSeat || 0);
    this.setData(state);
    this.refreshDeck();
  },
  buildSeats: function (count, dealerSeat) {
    var points = getPositions(count);
    var baseRoles = ROLE_MAP[count] || ROLE_MAP[4];
    var seats = [];
    for (var i = 0; i < count; i += 1) {
      var roleIndex = (i - dealerSeat + count) % count;
      seats.push({ role: baseRoles[roleIndex], dealer: i === dealerSeat, folded: false, stack: this.data.held || '1000', left: points[i].left, top: points[i].top });
    }
    return seats;
  },
  refreshDeck: function () {
    var cards = [];
    this.data.hand.concat(this.data.board).forEach(function (card) { if (card) cards.push(card.key); });
    var deck = cardUtils.makeDeck().map(function (card) {
      card.selected = cards.indexOf(card.key) !== -1;
      return card;
    });
    this.setData({ deck: deck });
  },
  selectSlot: function (event) {
    var slot = event.currentTarget.dataset.slot;
    var labels = { 'hand-0': '选择手牌 1', 'hand-1': '选择手牌 2' };
    if (slot.indexOf('board-') === 0) labels[slot] = '选择公共牌 ' + (Number(slot.split('-')[1]) + 1);
    this.setData({ slot: slot, slotLabel: labels[slot] || '请选择卡片' });
  },
  chooseCard: function (event) {
    var key = event.currentTarget.dataset.card;
    var card = cardUtils.makeDeck().filter(function (item) { return item.key === key; })[0];
    var slot = this.data.slot.split('-');
    var hand = this.data.hand.slice();
    var board = this.data.board.slice();
    var selected = this.data.hand.concat(this.data.board);
    var existing = slot[0] === 'hand' ? hand[Number(slot[1])] : board[Number(slot[1])];
    if (selected.some(function (item) { return item && item.key === key && (!existing || existing.key !== key); })) {
      wx.showToast({ title: '这张牌已选过', icon: 'none' });
      return;
    }
    if (slot[0] === 'hand') hand[Number(slot[1])] = card;
    else board[Number(slot[1])] = card;
    this.setData({ hand: hand, board: board, analysisMessage: '' });
    this.saveState();
    this.refreshDeck();
  },
  setDealer: function (event) {
    var dealerSeat = Number(event.currentTarget.dataset.index);
    var settings = storage.loadState('analyzerSettings', { players: 4 });
    this.setData({ dealerSeat: dealerSeat, seats: this.buildSeats(Number(settings.players) || 4, dealerSeat) });
    this.saveState();
  },
  onNumericInput: function (event) {
    var key = event.currentTarget.dataset.key;
    var value = event.detail.value;
    var patch = {};
    patch[key] = value;
    this.setData(patch);
    this.saveState(patch);
  },
  addAmount: function (event) {
    var key = event.currentTarget.dataset.key;
    var value = Number(this.data[key] || 0) + Number(event.currentTarget.dataset.amount);
    var patch = {};
    patch[key] = String(value);
    this.setData(patch);
    this.saveState(patch);
  },
  toggleContinuous: function (event) {
    this.setData({ continuous: event.detail.value });
    this.saveState({ continuous: event.detail.value });
  },
  getAnalysis: function () {
    var input = { cards: this.data.hand.filter(Boolean), board: this.data.board.filter(Boolean), pot: Number(this.data.pot), match: Number(this.data.match), held: Number(this.data.held), seats: this.data.seats };
    var result = decision.analyzeHand(input);
    this.setData({ analysisMessage: result.message });
  },
  recordWin: function () { this.setData({ wins: this.data.wins + 1 }); this.saveState(); },
  recordLoss: function () { this.setData({ losses: this.data.losses + 1 }); this.saveState(); },
  clearRound: function () {
    var settings = storage.loadState('analyzerSettings', { players: 4, totalChips: '1000' });
    this.setData({ hand: [null, null], board: [null, null, null, null, null], pot: '0', match: '0', held: settings.totalChips || '1000', analysisMessage: '', seats: this.buildSeats(Number(settings.players) || 4, this.data.dealerSeat) });
    this.saveState();
    this.refreshDeck();
  },
  showExample: function () { wx.showToast({ title: '选择手牌和桌面座位开始记录', icon: 'none' }); },
  saveState: function (patch) {
    var state = Object.assign({}, this.data, patch || {});
    storage.saveState('analyzerState', state);
  }
});
