'use strict';

// All monetary calculations use integer fen, including the transfer search.
var nextId = 0;
function id(prefix) {
  nextId += 1;
  return prefix + '-' + Date.now().toString(36) + '-' + nextId.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function createRound(playerIds, initial) {
  return { id: id('round'), initial: String(initial == null ? '50' : initial), participants: (playerIds || []).slice(), scores: {} };
}

function createFee(playerIds, payerId) {
  return { id: id('fee'), amount: '', payerId: payerId || '', participants: (playerIds || []).slice(), mode: 'equal', shares: {} };
}

function createSession() {
  var players = [1, 2, 3, 4].map(function (n) { return { id: id('player'), name: '玩家' + n, groupId: '' }; });
  return { id: id('session'), title: '麻将清算', price: '1', players: players, groups: [], rounds: [createRound(players.map(function (p) { return p.id; }), '50')], fees: [], updatedAt: Date.now() };
}

function integer(value, nonnegative) {
  var text = String(value == null ? '' : value).trim();
  if (!/^-?\d+$/.test(text)) return null;
  var n = Number(text);
  return Number.isSafeInteger(n) && (!nonnegative || n >= 0) ? n : null;
}

function money(value) {
  var text = String(value == null ? '' : value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  var parts = text.split('.');
  var whole = Number(parts[0]);
  var fraction = Number(((parts[1] || '') + '00').slice(0, 2));
  var cents = whole * 100 + fraction;
  return Number.isSafeInteger(whole) && Number.isSafeInteger(cents) ? cents : null;
}

function add(a, b) {
  var result = a + b;
  return Number.isSafeInteger(result) ? result : null;
}

function distinct(ids) {
  if (!Array.isArray(ids) || !ids.length) return false;
  var seen = Object.create(null);
  return ids.every(function (value) {
    if (typeof value !== 'string' || !value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

function validateRound(round) {
  function fail(message, difference) { return { valid: false, message: message, difference: difference == null ? null : difference }; }
  if (!round || !distinct(round.participants)) return fail('请选择本轮参与玩家');
  var initial = integer(round.initial, true);
  if (initial === null) return fail('初始点数须为非负整数');
  var expected = initial * round.participants.length;
  if (!Number.isSafeInteger(expected)) return fail('本轮点数超出可计算范围');
  var total = 0;
  var scores = round.scores || {};
  for (var i = 0; i < round.participants.length; i++) {
    var score = integer(scores[round.participants[i]], false);
    if (score === null) return fail('请为每位参与玩家填写整数点数');
    total = add(total, score);
    if (total === null) return fail('本轮点数超出可计算范围');
  }
  var difference = add(total, -expected);
  if (difference === null) return fail('本轮点数超出可计算范围');
  if (difference !== 0) return fail(difference > 0 ? '本轮多了 ' + difference + ' 点，请核对' : '本轮还差 ' + (-difference) + ' 点，请核对', difference);
  return { valid: true, message: '', difference: 0 };
}

// Divide a * b by divisor without forming an unsafe intermediate product.
// Here b is a weight and cannot exceed the total weight (divisor).
function weightedQuotient(a, b, divisor) {
  var quotient = 0;
  var remainder = 0;
  var bits = a.toString(2);
  for (var i = 0; i < bits.length; i++) {
    quotient *= 2;
    if (remainder >= divisor - remainder) {
      remainder -= divisor - remainder;
      quotient++;
    } else remainder += remainder;
    if (bits.charAt(i) === '1') {
      if (remainder >= divisor - b) {
        remainder -= divisor - b;
        quotient++;
      } else remainder += b;
    }
  }
  return { quotient: quotient, remainder: remainder };
}

function distribute(total, weights) {
  var ids = Object.keys(weights);
  var sum = 0;
  var shares = Object.create(null);
  for (var i = 0; i < ids.length; i++) {
    var weight = weights[ids[i]];
    if (!Number.isSafeInteger(weight) || weight < 0) return null;
    sum = add(sum, weight);
    if (sum === null) return null;
  }
  if (!sum) return null;
  var ranked = [];
  var assigned = 0;
  ids.forEach(function (pid, index) {
    var part = weightedQuotient(total, weights[pid], sum);
    shares[pid] = part.quotient;
    assigned += part.quotient;
    ranked.push({ id: pid, remainder: part.remainder, index: index });
  });
  ranked.sort(function (a, b) { return b.remainder - a.remainder || a.index - b.index; });
  for (var j = 0; j < total - assigned; j++) shares[ranked[j].id]++;
  return shares;
}

function attendanceDuration(player, startAt, endAt) {
  if (!Array.isArray(player.attendance)) return null;
  var intervals = [];
  for (var i = 0; i < player.attendance.length; i++) {
    var item = player.attendance[i];
    if (!item || (item.start !== null && !Number.isSafeInteger(item.start)) ||
        (item.end !== null && !Number.isSafeInteger(item.end))) return null;
    if (item.start !== null && item.end !== null && item.end < item.start) return null;
    var start = Math.max(startAt, item.start === null ? startAt : item.start);
    var end = Math.min(endAt, item.end === null ? endAt : item.end);
    if (start < end) intervals.push({ start: start, end: end });
  }
  intervals.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
  var duration = 0;
  var currentStart = null;
  var currentEnd = null;
  for (var j = 0; j < intervals.length; j++) {
    var interval = intervals[j];
    if (currentStart === null) { currentStart = interval.start; currentEnd = interval.end; }
    else if (interval.start <= currentEnd) currentEnd = Math.max(currentEnd, interval.end);
    else {
      duration = add(duration, currentEnd - currentStart);
      if (duration === null) return null;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }
  if (currentStart !== null) duration = add(duration, currentEnd - currentStart);
  return duration;
}

function calculateFee(fee, session) {
  function fail(message) { return { valid: false, message: message, shares: {}, amountCents: null }; }
  if (!fee) return fail('台费信息有误');
  if (fee.mode !== 'time' && !distinct(fee.participants)) return fail('请选择台费分摊人员');
  if (typeof fee.payerId !== 'string' || !fee.payerId) return fail('请选择垫付人');
  var amount = money(fee.amount);
  if (amount === null) return fail('台费须为非负金额，最多两位小数');
  var shares = Object.create(null);
  var total = 0;
  if (fee.mode === 'time') {
    if (!session || !Array.isArray(session.players) || !session.players.length) return fail('缺少本场玩家信息');
    if (!Number.isSafeInteger(fee.startAt) || !Number.isSafeInteger(fee.endAt) || fee.endAt <= fee.startAt || !Number.isSafeInteger(fee.endAt - fee.startAt)) return fail('请选择有效的台费开始和结束时间');
    var weights = Object.create(null);
    for (var t = 0; t < session.players.length; t++) {
      var player = session.players[t];
      if (!player || typeof player.id !== 'string' || !player.id || Object.prototype.hasOwnProperty.call(weights, player.id)) return fail('玩家信息有误');
      var duration = attendanceDuration(player, fee.startAt, fee.endAt);
      if (duration === null) return fail('玩家到场或离场时间有误');
      weights[player.id] = duration;
    }
    shares = distribute(amount, weights);
    if (!shares) return fail('台费时段内没有有效在场时间，请检查人员时间');
  } else if (fee.mode === 'equal') {
    var base = Math.floor(amount / fee.participants.length);
    var remainder = amount % fee.participants.length;
    fee.participants.forEach(function (pid, index) { shares[pid] = base + (index < remainder ? 1 : 0); });
  } else if (fee.mode === 'custom') {
    for (var i = 0; i < fee.participants.length; i++) {
      var pid = fee.participants[i];
      var value = money((fee.shares || {})[pid]);
      if (value === null) return fail('请填写每位玩家的分摊金额，最多两位小数');
      total = add(total, value);
      if (total === null) return fail('分摊金额超出可计算范围');
      shares[pid] = value;
    }
    if (total !== amount) return fail('分摊金额合计须等于台费总额');
  } else return fail('请选择台费分摊方式');
  return { valid: true, message: '', shares: shares, amountCents: amount };
}

function getFeeTotals(session) {
  function fail(message) { return { valid: false, message: message, totalFeeCents: 0, shares: {}, paid: {} }; }
  if (!session || !Array.isArray(session.players) || !session.players.length) return fail('请先添加玩家');
  var shares = Object.create(null);
  var paid = Object.create(null);
  for (var p = 0; p < session.players.length; p++) {
    var player = session.players[p];
    if (!player || typeof player.id !== 'string' || !player.id || Object.prototype.hasOwnProperty.call(shares, player.id)) return fail('玩家信息有误');
    shares[player.id] = 0;
    paid[player.id] = 0;
  }
  var fees = Array.isArray(session.fees) ? session.fees : [];
  var total = 0;
  for (var f = 0; f < fees.length; f++) {
    var fee = fees[f];
    var result = calculateFee(fee, session);
    if (!result.valid) return fail('第 ' + (f + 1) + ' 笔台费：' + result.message);
    if (!Object.prototype.hasOwnProperty.call(paid, fee.payerId)) return fail('台费垫付人不存在');
    total = add(total, result.amountCents);
    paid[fee.payerId] = add(paid[fee.payerId], result.amountCents);
    if (total === null || paid[fee.payerId] === null) return fail('台费超出可计算范围');
    var ids = Object.keys(result.shares);
    for (var i = 0; i < ids.length; i++) {
      var pid = ids[i];
      if (!Object.prototype.hasOwnProperty.call(shares, pid)) return fail('台费分摊人员不存在');
      shares[pid] = add(shares[pid], result.shares[pid]);
      if (shares[pid] === null) return fail('台费超出可计算范围');
    }
  }
  if (session.manualFeeShares != null) {
    var manual = session.manualFeeShares;
    if (typeof manual !== 'object' || Array.isArray(manual)) return fail('手动台费分摊信息有误');
    var manualIds = Object.keys(manual);
    var manualTotal = 0;
    for (var m = 0; m < manualIds.length; m++) {
      var mid = manualIds[m];
      if (!Object.prototype.hasOwnProperty.call(shares, mid) || !Number.isSafeInteger(manual[mid]) || manual[mid] < 0) return fail('手动台费分摊信息有误');
      manualTotal = add(manualTotal, manual[mid]);
      if (manualTotal === null) return fail('手动台费超出可计算范围');
    }
    if (manualTotal !== total) return fail('手动台费分摊合计须等于台费总额');
    Object.keys(shares).forEach(function (pid) { shares[pid] = Object.prototype.hasOwnProperty.call(manual, pid) ? manual[pid] : 0; });
  }
  return { valid: true, message: '', totalFeeCents: total, shares: shares, paid: paid };
}

function redistributeFee(totalCents, weightsById, targetId, targetCents) {
  function fail(message) { return { valid: false, message: message, shares: {} }; }
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || !Number.isSafeInteger(targetCents) || targetCents < 0 || targetCents > totalCents || !weightsById || typeof weightsById !== 'object' || Array.isArray(weightsById)) return fail('调整金额有误');
  var ids = Object.keys(weightsById);
  if (ids.indexOf(targetId) < 0) return fail('请选择有效的分摊人员');
  var others = Object.create(null);
  for (var i = 0; i < ids.length; i++) {
    var weight = weightsById[ids[i]];
    if (!Number.isSafeInteger(weight) || weight < 0) return fail('默认分摊金额有误');
    if (ids[i] !== targetId) others[ids[i]] = weight;
  }
  var remainder = totalCents - targetCents;
  var shares = Object.create(null);
  if (remainder) {
    shares = distribute(remainder, others);
    if (!shares) {
      var otherIds = Object.keys(others);
      if (!otherIds.length) return fail('没有其他人员可分配剩余金额');
      otherIds.forEach(function (pid) { others[pid] = 1; });
      shares = distribute(remainder, others);
      if (!shares) return fail('分配金额超出可计算范围');
    }
  } else Object.keys(others).forEach(function (pid) { shares[pid] = 0; });
  shares[targetId] = targetCents;
  return { valid: true, message: '', shares: shares };
}

function formatMoney(cents) {
  if (!Number.isSafeInteger(cents)) return '--';
  var negative = cents < 0;
  var value = Math.abs(cents);
  var fraction = String(value % 100);
  return (negative ? '-' : '') + Math.floor(value / 100) + '.' + (fraction.length === 1 ? '0' : '') + fraction;
}

function defaultGroupName(index) {
  var letters = '';
  for (var n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
  return '组合 ' + letters;
}

// Try alternative matches to reduce transfers. Bound the work for large groups.
function makeTransfers(people) {
  var debtors = people.filter(function (p) { return p.cents < 0; }).map(function (p) { return { name: p.name, left: -p.cents }; });
  var creditors = people.filter(function (p) { return p.cents > 0; }).map(function (p) { return { name: p.name, left: p.cents }; });
  var best = null;
  var visits = 0;
  function search(index, path) {
    if (++visits > 30000 || (best && path.length >= best.length)) return;
    while (index < debtors.length && debtors[index].left === 0) index++;
    if (index === debtors.length) { best = path.slice(); return; }
    var debtor = debtors[index];
    var tried = Object.create(null);
    for (var j = 0; j < creditors.length; j++) {
      var creditor = creditors[j];
      if (!creditor.left || tried[creditor.left]) continue;
      tried[creditor.left] = true;
      var amount = Math.min(debtor.left, creditor.left);
      debtor.left -= amount;
      creditor.left -= amount;
      path.push({ from: debtor.name, to: creditor.name, cents: amount });
      search(index, path);
      path.pop();
      debtor.left += amount;
      creditor.left += amount;
    }
  }
  search(0, []);
  if (best) return best;
  var transfers = [];
  var d = 0;
  var c = 0;
  while (d < debtors.length && c < creditors.length) {
    var amount = Math.min(debtors[d].left, creditors[c].left);
    transfers.push({ from: debtors[d].name, to: creditors[c].name, cents: amount });
    debtors[d].left -= amount;
    creditors[c].left -= amount;
    if (!debtors[d].left) d++;
    if (!creditors[c].left) c++;
  }
  return transfers;
}

function summarize(session, includeFees) {
  function fail(message) { return { valid: false, message: message, players: [], transfers: [], totalFeeCents: 0 }; }
  if (!session || !Array.isArray(session.players) || !session.players.length) return fail('请先添加玩家');
  var price = money(session.price);
  if (price === null) return fail('单价须为非负金额，最多两位小数');
  var players = [];
  var byId = Object.create(null);
  var groups = Object.create(null);
  var groupList = Array.isArray(session.groups) ? session.groups : [];
  for (var g = 0; g < groupList.length; g++) {
    var group = groupList[g];
    if (!group || typeof group.id !== 'string' || !group.id || groups[group.id]) return fail('组合信息有误');
    groups[group.id] = { name: String(group.name || '').trim() || defaultGroupName(g), cents: 0 };
  }
  for (var i = 0; i < session.players.length; i++) {
    var p = session.players[i];
    if (!p || typeof p.id !== 'string' || !p.id || byId[p.id]) return fail('玩家信息有误');
    if (p.groupId && !groups[p.groupId]) return fail('玩家所属组合不存在');
    var player = { id: p.id, name: String(p.name || '').trim() || '玩家' + (i + 1), groupId: p.groupId || '', points: 0, gameCents: 0, feePaidCents: 0, feeShareCents: 0 };
    players.push(player);
    byId[p.id] = player;
  }
  var rounds = Array.isArray(session.rounds) ? session.rounds : [];
  if (!rounds.length) return fail('请至少填写一轮点数');
  for (var r = 0; r < rounds.length; r++) {
    var round = rounds[r];
    if (session.rulesVersion === 2 && (!round || !Array.isArray(round.participants) || (round.participants.length !== 3 && round.participants.length !== 4))) return fail('第 ' + (r + 1) + ' 轮：请选择 3 人或 4 人上场');
    var check = validateRound(round);
    if (!check.valid) return fail('第 ' + (r + 1) + ' 轮：' + check.message);
    var initial = integer(round.initial, true);
    for (var k = 0; k < round.participants.length; k++) {
      var participant = byId[round.participants[k]];
      if (!participant) return fail('第 ' + (r + 1) + ' 轮包含不存在的玩家');
      var delta = add(integer(round.scores[participant.id], false), -initial);
      if (delta === null) return fail('点数超出可计算范围');
      participant.points = add(participant.points, delta);
      if (participant.points === null) return fail('点数超出可计算范围');
    }
  }
  for (var j = 0; j < players.length; j++) {
    players[j].gameCents = players[j].points * price;
    if (!Number.isSafeInteger(players[j].gameCents)) return fail('麻将金额超出可计算范围');
  }
  var totals = getFeeTotals(session);
  if (!totals.valid) return fail(totals.message);
  var totalFee = totals.totalFeeCents;
  for (var f = 0; f < players.length; f++) {
    players[f].feePaidCents = totals.paid[players[f].id];
    players[f].feeShareCents = totals.shares[players[f].id];
  }
  var entities = [];
  var groupEntities = Object.create(null);
  for (var m = 0; m < players.length; m++) {
    var current = players[m];
    var net = current.gameCents;
    if (includeFees) {
      net = add(net, current.feePaidCents);
      if (net !== null) net = add(net, -current.feeShareCents);
    }
    if (net === null) return fail('结算金额超出可计算范围');
    if (current.groupId) {
      var entity = groupEntities[current.groupId];
      if (!entity) {
        entity = { name: groups[current.groupId].name, cents: 0 };
        groupEntities[current.groupId] = entity;
        entities.push(entity);
      }
      entity.cents = add(entity.cents, net);
      if (entity.cents === null) return fail('组合金额超出可计算范围');
    } else entities.push({ name: current.name, cents: net });
  }
  var names = Object.create(null);
  for (var e = 0; e < entities.length; e++) {
    var name = entities[e].name;
    if (names[name]) return fail('结算对象名称“' + name + '”重复，请修改玩家或组合名称');
    names[name] = true;
  }
  return { valid: true, message: '', players: players, transfers: makeTransfers(entities), totalFeeCents: totalFee };
}

module.exports = { createSession: createSession, createRound: createRound, createFee: createFee, validateRound: validateRound, calculateFee: calculateFee, getFeeTotals: getFeeTotals, redistributeFee: redistributeFee, summarize: summarize, formatMoney: formatMoney, makeTransfers: makeTransfers };
