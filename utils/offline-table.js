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
var STAGES = ['preflop', 'flop', 'turn', 'river', 'showdown', 'settled'];

function clampPlayers(value) { return Math.max(2, Math.min(9, Number(value) || 4)); }
function activeSeats(state) { return state.seats.filter(function (seat) { return !seat.folded; }); }
function assignRoles(state) {
  var roles = ROLE_MAP[state.seats.length] || ROLE_MAP[4];
  state.seats.forEach(function (seat, index) {
    seat.role = roles[(index - state.dealerSeat + state.seats.length) % state.seats.length];
    seat.dealer = index === state.dealerSeat;
  });
  return state;
}
function normalizeSeat(state, index) { return (index + state.seats.length) % state.seats.length; }
function nextEligible(state, from) {
  for (var step = 1; step <= state.seats.length; step += 1) {
    var index = normalizeSeat(state, from + step);
    var seat = state.seats[index];
    if (!seat.folded && seat.stack > 0 && (!seat.acted || seat.streetBet < state.currentBet)) return index;
  }
  return -1;
}
function allActedAndMatched(state) {
  return activeSeats(state).every(function (seat) { return seat.stack === 0 || (seat.acted && seat.streetBet >= state.currentBet); });
}
function canChangeDealer(state) {
  if (state.stage !== 'preflop' || state.actionStarted) return false;
  if (state.actionStarted === false) return true;
  var sb = state.players === 2 ? state.dealerSeat : normalizeSeat(state, state.dealerSeat + 1);
  var bb = state.players === 2 ? normalizeSeat(state, state.dealerSeat + 1) : normalizeSeat(state, state.dealerSeat + 2);
  return state.seats.every(function (seat, index) {
    var blind = index === sb ? state.smallBlind : index === bb ? state.bigBlind : 0;
    return !seat.acted && !seat.folded && seat.totalBet === Math.min(blind, seat.stack + seat.totalBet);
  });
}
function postBlinds(state) {
  var sbIndex = state.players === 2 ? state.dealerSeat : normalizeSeat(state, state.dealerSeat + 1);
  var bbIndex = state.players === 2 ? normalizeSeat(state, state.dealerSeat + 1) : normalizeSeat(state, state.dealerSeat + 2);
  [{ index: sbIndex, amount: state.smallBlind }, { index: bbIndex, amount: state.bigBlind }].forEach(function (blind) {
    var seat = state.seats[blind.index];
    var paid = Math.min(seat.stack, blind.amount);
    seat.stack -= paid;
    seat.streetBet = paid;
    seat.totalBet = paid;
    state.pot += paid;
    state.currentBet = Math.max(state.currentBet, paid);
  });
  if (activeSeats(state).filter(function (seat) { return seat.stack > 0; }).length >= 2) {
    state.currentBet = Math.max(state.currentBet, state.bigBlind);
  }
  state.lastRaise = Math.max(state.bigBlind, state.smallBlind, 1);
}
function selectFirstActor(state) {
  var first = nextEligible(state, state.currentSeat - 1);
  if (first < 0 || (activeSeats(state).filter(function (seat) { return seat.stack > 0; }).length <= 1 && state.seats[first].streetBet >= state.currentBet)) {
    state.stage = 'showdown';
    state.message = '下注已结束，请完成实体牌面并选择赢家结算。';
  } else {
    state.currentSeat = first;
  }
}
function advanceStreet(state) {
  var stageIndex = STAGES.indexOf(state.stage);
  if (state.stage === 'river' || activeSeats(state).filter(function (seat) { return seat.stack > 0; }).length <= 1) {
    state.stage = 'showdown';
    state.message = '下注已结束，请完成实体牌面并选择赢家结算。';
    return state;
  }
  state.stage = STAGES[Math.min(stageIndex + 1, STAGES.indexOf('showdown'))];
  state.currentBet = 0;
  state.lastRaise = Math.max(state.bigBlind, 1);
  state.seats.forEach(function (seat) { seat.acted = false; seat.streetBet = 0; seat.lastActedBet = null; });
  state.currentSeat = normalizeSeat(state, state.dealerSeat + 1);
  if (state.seats[state.currentSeat].folded || state.seats[state.currentSeat].stack === 0) state.currentSeat = nextEligible(state, state.currentSeat - 1);
  state.message = '进入' + ({ flop: '翻牌', turn: '转牌', river: '河牌' }[state.stage] || '摊牌') + '阶段。';
  return state;
}

function createTable(config) {
  config = config || {};
  var count = clampPlayers(config.players);
  var stack = Math.max(0, Number(config.totalChips) || 1000);
  var seats = [];
  for (var i = 0; i < count; i += 1) seats.push({ index: i, stack: stack, folded: false, acted: false, streetBet: 0, totalBet: 0, role: '', dealer: false });
  var state = {
    seats: seats, players: count, dealerSeat: 0, heroSeat: 0,
    pot: 0, currentBet: 0, lastRaise: Math.max(Number(config.bigBlind) || 1, Number(config.smallBlind) || 1), currentSeat: count === 2 ? 0 : 3 % count,
    stage: 'preflop', smallBlind: Math.max(0, Number(config.smallBlind) || 1),
    bigBlind: Math.max(0, Number(config.bigBlind) || 1),
    unitPrice: Number(config.unitPrice) || 0.1,
    startStack: stack, actionStarted: false, message: '点击更换庄家可调整座位。'
  };
  assignRoles(state);
  postBlinds(state);
  selectFirstActor(state);
  return state;
}

function setDealer(state, seatIndex) {
  var next = JSON.parse(JSON.stringify(state));
  if (!canChangeDealer(next)) {
    next.message = '本局行动已开始，结算后才能更换庄家。';
    return next;
  }
  next.dealerSeat = normalizeSeat(next, Number(seatIndex));
  assignRoles(next);
  next.seats.forEach(function (seat) {
    seat.stack += seat.streetBet;
    seat.streetBet = 0;
    seat.totalBet = 0;
  });
  next.pot = 0;
  next.currentBet = 0;
  postBlinds(next);
  next.currentSeat = next.players === 2 ? next.dealerSeat : normalizeSeat(next, next.dealerSeat + 3);
  next.actionStarted = false;
  next.message = '庄家已设置，盲注已重新发放。';
  selectFirstActor(next);
  return next;
}
function setHero(state, seatIndex) {
  var next = JSON.parse(JSON.stringify(state));
  next.heroSeat = normalizeSeat(next, Number(seatIndex));
  next.message = '本人座位：' + (next.heroSeat + 1) + '。';
  return next;
}
function applyAction(state, action) {
  var next = JSON.parse(JSON.stringify(state));
  var seat = next.seats[next.currentSeat];
  if (!seat || next.stage === 'showdown' || next.stage === 'settled' || next.stage === 'waiting') return { state: next, error: '当前牌局不能进行下注操作。' };
  if (action.type === 'fold') {
    next.actionStarted = true;
    seat.folded = true;
    seat.acted = true;
    if (activeSeats(next).length === 1) {
      var winner = activeSeats(next)[0];
      next.stage = 'showdown';
      var foldPots = getPots(next);
      var foldSelections = foldPots.map(function (pot) { return pot.eligible.indexOf(winner.index) >= 0 ? [winner.index] : []; });
      var foldResult = settlePots(next, foldSelections);
      if (foldResult.error) return { state: next, error: foldResult.error };
      foldResult.state.message = '其他玩家均已弃牌，第 ' + (winner.index + 1) + ' 位自动获胜。 ' + foldResult.state.message;
      return foldResult;
    }
  } else if (action.type === 'add') {
    var amount = Math.max(0, Number(action.amount) || 0);
    if (!amount) return { state: next, error: '筹码数必须大于 0。' };
    if (!Number.isInteger(amount) || amount > seat.stack) return { state: next, error: '下注必须是整数，且不能超过持有筹码。' };
    var newStreetBet = seat.streetBet + amount;
    var allIn = amount === seat.stack;
    if (newStreetBet < next.currentBet && !allIn) return { state: next, error: '下注不足以跟注；请补足筹码或选择全下。' };
    if (newStreetBet > next.currentBet) {
      var lastActedBet = typeof seat.lastActedBet === 'number' ? seat.lastActedBet : seat.streetBet;
      var incompleteOpen = next.currentBet < next.bigBlind;
      var checkedBeforeShortOpen = lastActedBet === 0 && incompleteOpen;
      if (seat.acted && !checkedBeforeShortOpen && next.currentBet - lastActedBet < next.lastRaise) return { state: next, error: '短额全下未重新开放加注，本轮只能跟注或弃牌。' };
      var raiseSize = newStreetBet - next.currentBet;
      var minimumRaise = incompleteOpen ? next.bigBlind - next.currentBet : next.lastRaise;
      if (raiseSize < minimumRaise && !allIn) return { state: next, error: '至少需要再加 ' + minimumRaise + ' 筹码。' };
      if (raiseSize >= minimumRaise) {
        next.lastRaise = incompleteOpen ? newStreetBet : raiseSize;
        next.seats.forEach(function (other) { if (other.index !== seat.index && !other.folded && other.stack > 0) other.acted = false; });
      }
    }
    var paid = amount;
    next.actionStarted = true;
    seat.stack -= paid;
    seat.streetBet += paid;
    seat.totalBet += paid;
    next.pot += paid;
    if (seat.streetBet > next.currentBet) {
      next.currentBet = seat.streetBet;
    }
    next.message = '第 ' + (seat.index + 1) + ' 位加入 ' + paid + ' 筹码。';
    return { state: next };
  } else if (action.type === 'next') {
    var toCall = Math.max(0, next.currentBet - seat.streetBet);
    if (toCall > 0) {
      var callAmount = Math.min(toCall, seat.stack);
      seat.stack -= callAmount;
      seat.streetBet += callAmount;
      seat.totalBet += callAmount;
      next.pot += callAmount;
    }
    next.actionStarted = true;
    seat.acted = true;
    seat.lastActedBet = next.currentBet;
  }
  if (allActedAndMatched(next)) return { state: advanceStreet(next) };
  var following = nextEligible(next, next.currentSeat);
  if (following >= 0) next.currentSeat = following;
  return { state: next };
}
function addChips(state, seatIndex, amount) {
  var next = JSON.parse(JSON.stringify(state));
  var index = Number(seatIndex);
  var chips = Number(amount);
  if (next.stage !== 'waiting' && !canChangeDealer(next)) return { state: next, error: '请等本局结算后再补充筹码。' };
  if (!Number.isInteger(index) || index < 0 || index >= next.seats.length || !Number.isSafeInteger(chips) || chips <= 0) {
    return { state: next, error: '请输入大于 0 的整数筹码数量。' };
  }
  var totalChips = next.seats.reduce(function (sum, seat) { return sum + seat.stack; }, next.pot);
  if (!Number.isSafeInteger(totalChips) || chips > Number.MAX_SAFE_INTEGER - totalChips) {
    return { state: next, error: '补充后全桌筹码超出安全计算范围。' };
  }
  next.seats[index].stack += chips;
  next.message = '第 ' + (index + 1) + ' 位补充 ' + chips + ' 筹码。';
  if (next.stage === 'waiting' && next.seats.every(function (seat) { return seat.stack > 0; })) {
    return { state: startNewHand(next, { message: '筹码已补充。' }) };
  }
  return { state: next };
}
function getPots(state) {
  var levels = state.seats.map(function (seat) { return seat.totalBet; }).filter(function (value, index, values) {
    return value > 0 && values.indexOf(value) === index;
  }).sort(function (a, b) { return a - b; });
  var previous = 0;
  var pots = levels.map(function (level) {
    var contributors = state.seats.filter(function (seat) { return seat.totalBet >= level; });
    var pot = {
      amount: (level - previous) * contributors.length,
      contributors: contributors.map(function (seat) { return seat.index; }),
      eligible: contributors.filter(function (seat) { return !seat.folded; }).map(function (seat) { return seat.index; })
    };
    previous = level;
    return pot;
  });
  return pots.reduce(function (merged, pot) {
    var previousPot = merged[merged.length - 1];
    var sameEligible = previousPot && previousPot.eligible.length === pot.eligible.length && previousPot.eligible.every(function (index, position) {
      return index === pot.eligible[position];
    });
    if (sameEligible && previousPot.contributors.length > 1 && pot.contributors.length > 1) previousPot.amount += pot.amount;
    else merged.push(pot);
    return merged;
  }, []);
}
function settlePots(state, selections) {
  var next = JSON.parse(JSON.stringify(state));
  if (next.stage !== 'showdown') return { state: next, error: '请先结束本局下注。' };
  var pots = getPots(next);
  if (pots.reduce(function (sum, pot) { return sum + pot.amount; }, 0) !== next.pot) {
    return { state: next, error: '底池与下注记录不一致，请检查牌局。' };
  }
  var winnersByPot = [];
  for (var i = 0; i < pots.length; i += 1) {
    var pot = pots[i];
    var winners = pot.contributors.length === 1 ? pot.contributors.slice() :
      pot.eligible.length === 1 ? pot.eligible.slice() : ((selections && selections[i]) || []);
    if (!winners.length || winners.some(function (index, position) {
      return pot.contributors.length !== 1 && (pot.eligible.indexOf(index) < 0 || winners.indexOf(index) !== position);
    })) return { state: next, error: '请为每个底池选择有资格的赢家。' };
    for (var earlier = 0; earlier < i; earlier += 1) {
      if (pots[earlier].contributors.length === 1 || pot.contributors.length === 1) continue;
      var stillEligible = winnersByPot[earlier].filter(function (index) { return pot.eligible.indexOf(index) >= 0; });
      if (stillEligible.length && (stillEligible.length !== winners.length || winners.some(function (index) { return stillEligible.indexOf(index) < 0; }))) {
        return { state: next, error: '主池与边池的赢家不一致，请按实体牌的牌力重新选择。' };
      }
    }
    winnersByPot.push(winners.slice());
  }
  pots.forEach(function (pot, index) {
    var winners = winnersByPot[index].sort(function (a, b) {
      return normalizeSeat(next, a - next.dealerSeat - 1) - normalizeSeat(next, b - next.dealerSeat - 1);
    });
    var share = Math.floor(pot.amount / winners.length);
    var remainder = pot.amount % winners.length;
    winners.forEach(function (seatIndex, position) { next.seats[seatIndex].stack += share + (position < remainder ? 1 : 0); });
  });
  var total = next.pot;
  next.pot = 0;
  return { state: startNewHand(next, { message: '已结算 ' + total + ' 筹码。' }) };
}
function settleHand(state, winnerSeat) {
  var index = Number(winnerSeat);
  return settlePots(state, getPots(state).map(function (pot) { return pot.eligible.indexOf(index) >= 0 ? [index] : []; }));
}
function startNewHand(state, options) {
  var next = JSON.parse(JSON.stringify(state));
  options = options || {};
  var dealerSeat = next.dealerSeat;
  var fresh = {
    seats: next.seats.map(function (seat) {
      return { index: seat.index, stack: options.resetStacks ? next.startStack : seat.stack, folded: false, acted: false, streetBet: 0, totalBet: 0, role: '', dealer: false };
    }),
    players: next.players, dealerSeat: dealerSeat, heroSeat: next.heroSeat,
    pot: 0, currentBet: 0, lastRaise: Math.max(next.bigBlind, next.smallBlind, 1),
    currentSeat: next.players === 2 ? dealerSeat : normalizeSeat(next, dealerSeat + 3),
    stage: 'preflop', smallBlind: next.smallBlind, bigBlind: next.bigBlind,
    unitPrice: next.unitPrice, startStack: next.startStack, actionStarted: false, message: ''
  };
  assignRoles(fresh);
  if (fresh.seats.some(function (seat) { return seat.stack <= 0; })) {
    fresh.stage = 'waiting';
    fresh.message = (options.message || '') + ' 有玩家筹码为 0，请补充筹码后开始下一局。';
    return fresh;
  }
  postBlinds(fresh);
  fresh.message = options.message
    ? options.message + ' 新一局已自动开始，庄家位置不变。'
    : options.resetStacks ? '新一局已开始，筹码已重置。' : '新一局已开始，保留当前筹码。';
  selectFirstActor(fresh);
  return fresh;
}

module.exports = { ROLE_MAP: ROLE_MAP, createTable: createTable, canChangeDealer: canChangeDealer, setDealer: setDealer, setHero: setHero, applyAction: applyAction, addChips: addChips, getPots: getPots, settlePots: settlePots, settleHand: settleHand, startNewHand: startNewHand };
