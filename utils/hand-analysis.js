var cards = require('./cards.js');
var decision = require('./decision.js');

var TYPES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
var DESCRIPTIONS = [
  '没有组成对子或更大牌型时，按最大的牌比较。',
  '五张牌中有两张点数相同。',
  '五张牌中有两组不同点数的对子。',
  '五张牌中有三张点数相同。',
  '五张牌的点数连续，花色可以不同；A 也可以作为最小点数。',
  '五张牌的花色相同，点数不要求连续。',
  '三张相同点数的牌，加上另一组对子。',
  '五张牌中有四张点数相同。',
  '五张牌花色相同，点数也连续。'
];

function formatCards(list) {
  return list.map(function (card) { return (card.rank === 'T' ? '10' : card.rank) + card.symbol; }).join('  ');
}

function bestFive(all) {
  var best = null;
  var selected = [];
  function pick(start) {
    if (selected.length === 5) {
      var score = decision.evaluateFive(selected);
      if (!best || decision.compareScores(score, best.score) > 0) best = { score: score, cards: selected.slice() };
      return;
    }
    for (var i = start; i <= all.length - (5 - selected.length); i += 1) {
      selected.push(all[i]);
      pick(i + 1);
      selected.pop();
    }
  }
  pick(0);
  return best;
}

function analyze(hand, board) {
  hand = (hand || []).filter(Boolean);
  board = (board || []).filter(Boolean);
  if (hand.length !== 2 || board.length < 3 || board.length > 5) {
    return { error: '请选择两张手牌和 3～5 张公共牌。' };
  }
  var known = hand.concat(board);
  if (cards.hasDuplicate(known)) return { error: '牌面有重复，请重新选择。' };

  var current = bestFive(known);
  var remaining = cards.makeDeck().filter(function (card) {
    return !known.some(function (item) { return item.key === card.key; });
  });
  var drawCount = 5 - board.length;
  var examples = {};
  function consider(draw) {
    var finalCards = known.concat(draw);
    var score = decision.evaluateSeven(finalCards);
    if (score[0] > current.score[0] && !examples[score[0]]) {
      examples[score[0]] = { draw: draw.slice(), cards: bestFive(finalCards).cards };
    }
  }
  if (drawCount === 1) {
    remaining.forEach(function (card) { consider([card]); });
  } else if (drawCount === 2) {
    for (var i = 0; i < remaining.length; i += 1) {
      for (var j = i + 1; j < remaining.length; j += 1) consider([remaining[i], remaining[j]]);
    }
  }
  var possibilities = Object.keys(examples).map(Number).sort(function (a, b) { return b - a; }).slice(0, 5).map(function (rank) {
    return { name: TYPES[rank], description: DESCRIPTIONS[rank], draw: formatCards(examples[rank].draw), cards: formatCards(examples[rank].cards) };
  });
  return {
    name: TYPES[current.score[0]], description: DESCRIPTIONS[current.score[0]], cards: formatCards(current.cards),
    remaining: drawCount, possibilities: possibilities
  };
}

module.exports = { analyze: analyze };
