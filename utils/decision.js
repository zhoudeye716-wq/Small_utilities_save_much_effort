var cardUtils = require('./cards.js');
var RANK_VALUE = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
var SIMULATIONS = 700;

function rankOf(card) { return RANK_VALUE[card.rank] || 0; }
function compareScores(left, right) {
  for (var i = 0; i < Math.max(left.length, right.length); i += 1) {
    var difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return difference;
  }
  return 0;
}
function straightHigh(ranks) {
  var unique = ranks.filter(function (rank, index) { return ranks.indexOf(rank) === index; }).sort(function (a, b) { return b - a; });
  if (unique[0] === 14) unique.push(1);
  for (var i = 0; i <= unique.length - 5; i += 1) {
    if (unique[i] - unique[i + 4] === 4) return unique[i];
  }
  return 0;
}
function evaluateFive(cards) {
  var ranks = cards.map(rankOf).sort(function (a, b) { return b - a; });
  var counts = {};
  ranks.forEach(function (rank) { counts[rank] = (counts[rank] || 0) + 1; });
  var groups = Object.keys(counts).map(function (rank) { return { rank: Number(rank), count: counts[rank] }; }).sort(function (a, b) {
    return b.count - a.count || b.rank - a.rank;
  });
  var flush = cards.every(function (card) { return card.suit === cards[0].suit; });
  var straight = straightHigh(ranks);
  if (flush && straight) return [8, straight];
  if (groups[0].count === 4) return [7, groups[0].rank, groups[1].rank];
  if (groups[0].count === 3 && groups[1].count === 2) return [6, groups[0].rank, groups[1].rank];
  if (flush) return [5].concat(ranks);
  if (straight) return [4, straight];
  if (groups[0].count === 3) return [3, groups[0].rank].concat(groups.slice(1).map(function (group) { return group.rank; }).sort(function (a, b) { return b - a; }));
  if (groups[0].count === 2 && groups[1].count === 2) {
    var pairs = [groups[0].rank, groups[1].rank].sort(function (a, b) { return b - a; });
    return [2, pairs[0], pairs[1], groups[2].rank];
  }
  if (groups[0].count === 2) return [1, groups[0].rank].concat(groups.slice(1).map(function (group) { return group.rank; }).sort(function (a, b) { return b - a; }));
  return [0].concat(ranks);
}
function evaluateSeven(cards) {
  var best = null;
  for (var a = 0; a < cards.length - 4; a += 1) {
    for (var b = a + 1; b < cards.length - 3; b += 1) {
      for (var c = b + 1; c < cards.length - 2; c += 1) {
        for (var d = c + 1; d < cards.length - 1; d += 1) {
          for (var e = d + 1; e < cards.length; e += 1) {
            var score = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(score, best) > 0) best = score;
          }
        }
      }
    }
  }
  return best;
}
function shuffled(cards) {
  for (var i = cards.length - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var temporary = cards[i];
    cards[i] = cards[j];
    cards[j] = temporary;
  }
  return cards;
}
function estimateEquity(hand, board, players) {
  var known = hand.concat(board);
  var knownKeys = known.map(function (card) { return card.key; });
  var deck = cardUtils.makeDeck().filter(function (card) { return knownKeys.indexOf(card.key) === -1; });
  var opponentCount = Math.max(1, Math.min(8, players - 1));
  var wins = 0;
  for (var run = 0; run < SIMULATIONS; run += 1) {
    var draw = shuffled(deck.slice());
    var cursor = 0;
    var fullBoard = board.slice();
    while (fullBoard.length < 5) fullBoard.push(draw[cursor++]);
    var heroScore = evaluateSeven(hand.concat(fullBoard));
    var bestScore = heroScore;
    var scores = [heroScore];
    for (var opponent = 0; opponent < opponentCount; opponent += 1) {
      var opponentScore = evaluateSeven([draw[cursor++], draw[cursor++]].concat(fullBoard));
      scores.push(opponentScore);
      if (compareScores(opponentScore, bestScore) > 0) bestScore = opponentScore;
    }
    if (compareScores(heroScore, bestScore) === 0) {
      var tied = scores.filter(function (score) { return compareScores(score, bestScore) === 0; }).length;
      wins += 1 / tied;
    }
  }
  return wins / SIMULATIONS;
}

function analyzeHand(input) {
  input = input || {};
  var hand = (input.cards || []).filter(Boolean);
  var board = (input.board || []).filter(Boolean);
  if (hand.length !== 2) return { status: 'incomplete', message: '请先选择两张手牌。' };
  if (board.length > 5 || cardUtils.hasDuplicate(hand.concat(board).map(function (card) { return card.key; }))) {
    return { status: 'invalid', message: '牌面不合法，请检查重复牌或公共牌数量。' };
  }
  var players = Math.max(2, Number(input.players) || (input.seats && input.seats.length) || 4);
  var equity = estimateEquity(hand, board, players);
  var pot = Math.max(0, Number(input.pot) || 0);
  var match = Math.max(0, Number(input.match) || 0);
  var potOdds = match > 0 ? match / (pot + match) : 0;
  var advice;
  if (!match) advice = equity >= 0.55 ? '当前无需跟注，牌面权益较好，可考虑主动下注。' : '当前无需跟注，可过牌观察后续公共牌。';
  else if (equity + 0.03 < potOdds) advice = '估算权益低于底池赔率，倾向弃牌。';
  else if (equity > potOdds + 0.12) advice = '估算权益明显高于底池赔率，可考虑加注或跟注。';
  else advice = '估算权益接近底池赔率，倾向跟注并观察后续牌。';
  return {
    status: 'estimated',
    equity: Math.round(equity * 1000) / 10,
    potOdds: Math.round(potOdds * 1000) / 10,
    simulations: SIMULATIONS,
    message: '本地随机对手估算胜率约 ' + (Math.round(equity * 1000) / 10) + '%；底池赔率 ' + (Math.round(potOdds * 1000) / 10) + '%。' + advice + '（' + SIMULATIONS + ' 次模拟，仅供参考）'
  };
}

module.exports = { analyzeHand: analyzeHand, evaluateFive: evaluateFive, evaluateSeven: evaluateSeven, compareScores: compareScores };
