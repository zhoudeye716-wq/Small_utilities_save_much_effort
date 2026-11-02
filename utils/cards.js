var RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
var SUITS = [
  { key: 'S', symbol: '♠', color: '#22252a' },
  { key: 'H', symbol: '♥', color: '#df4055' },
  { key: 'C', symbol: '♣', color: '#249b87' },
  { key: 'D', symbol: '♦', color: '#4284c5' }
];

function makeDeck() {
  var deck = [];
  RANKS.forEach(function (rank) {
    SUITS.forEach(function (suit) {
      deck.push({ key: suit.key + rank, rank: rank, suit: suit.key, symbol: suit.symbol, color: suit.color });
    });
  });
  return deck;
}

function hasDuplicate(cards) {
  var seen = {};
  for (var i = 0; i < cards.length; i += 1) {
    var key = cards[i] && typeof cards[i] === 'object' ? cards[i].key : cards[i];
    if (!key) continue;
    if (seen[key]) return true;
    seen[key] = true;
  }
  return false;
}

module.exports = { RANKS: RANKS, SUITS: SUITS, makeDeck: makeDeck, hasDuplicate: hasDuplicate };
