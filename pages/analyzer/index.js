var cardUtils = require('../../utils/cards.js');
var handAnalysis = require('../../utils/hand-analysis.js');

function nextEmpty(hand, board) {
  for (var i = 0; i < hand.length; i += 1) if (!hand[i]) return 'hand-' + i;
  for (var j = 0; j < board.length; j += 1) if (!board[j]) return 'board-' + j;
  return '';
}

function slotLabel(slot) {
  if (!slot) return '已选满，点击上方卡片可以移除';
  var parts = slot.split('-');
  return '请选择' + (parts[0] === 'hand' ? '手牌 ' : '公共牌 ') + (Number(parts[1]) + 1);
}

function analyzeIfReady(hand, board) {
  if (hand.filter(Boolean).length !== 2 || board.filter(Boolean).length < 3) return null;
  var result = handAnalysis.analyze(hand, board);
  return result.error ? null : result;
}

Page({
  data: { hand: [null, null], board: [null, null, null, null, null], rankGroups: [], slot: 'hand-0', slotLabel: '请选择手牌 1', result: null },
  onLoad: function () { this.refreshDeck(); },
  refreshDeck: function () {
    var selected = this.data.hand.concat(this.data.board).filter(Boolean).map(function (card) { return card.key; });
    var deck = cardUtils.makeDeck().map(function (card) {
      card.selected = selected.indexOf(card.key) >= 0;
      return card;
    });
    this.setData({ rankGroups: cardUtils.RANKS.map(function (rank) {
      return { rank: rank, cards: deck.filter(function (card) { return card.rank === rank; }) };
    }) });
  },
  selectSlot: function (event) {
    var slot = event.currentTarget.dataset.slot;
    var parts = slot.split('-');
    var hand = this.data.hand.slice();
    var board = this.data.board.slice();
    var target = parts[0] === 'hand' ? hand : board;
    var index = Number(parts[1]);
    var wasEmpty = !target[index];
    var shouldScroll = parts[0] === 'board' && wasEmpty && !!this.data.result;
    var self = this;
    target[index] = null;
    this.setData({ hand: hand, board: board, slot: slot, slotLabel: slotLabel(slot), result: wasEmpty ? this.data.result : analyzeIfReady(hand, board) }, function () {
      if (shouldScroll) self.showCardPicker();
    });
    this.refreshDeck();
  },
  chooseCard: function (event) {
    var key = event.currentTarget.dataset.card;
    if (this.data.hand.concat(this.data.board).some(function (card) { return card && card.key === key; })) {
      wx.showToast({ title: '这张牌已经选过', icon: 'none' });
      return;
    }
    if (!this.data.slot) {
      wx.showToast({ title: '请先点击上方卡片移除', icon: 'none' });
      return;
    }
    var card = cardUtils.makeDeck().filter(function (item) { return item.key === key; })[0];
    if (!card) return;
    var hand = this.data.hand.slice();
    var board = this.data.board.slice();
    var parts = this.data.slot.split('-');
    (parts[0] === 'hand' ? hand : board)[Number(parts[1])] = card;
    var next = nextEmpty(hand, board);
    var result = analyzeIfReady(hand, board);
    this.setData({ hand: hand, board: board, slot: next, slotLabel: slotLabel(next), result: result }, function () {
      if (result && result.remaining === 0) wx.pageScrollTo({ selector: '#analysis-result', duration: 250 });
    });
    this.refreshDeck();
  },
  showResults: function () { wx.pageScrollTo({ selector: '#analysis-result', duration: 250 }); },
  showCardPicker: function () { wx.pageScrollTo({ selector: '#card-picker', duration: 250 }); },
  clearCards: function () {
    this.setData({ hand: [null, null], board: [null, null, null, null, null], slot: 'hand-0', slotLabel: '请选择手牌 1', result: null });
    this.refreshDeck();
  }
});
