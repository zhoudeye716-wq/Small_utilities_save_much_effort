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

function calculateFee(fee) {
  function fail(message) { return { valid: false, message: message, shares: {}, amountCents: null }; }
  if (!fee || !distinct(fee.participants)) return fail('请选择台费分摊人员');
  if (typeof fee.payerId !== 'string' || !fee.payerId) return fail('请选择垫付人');
  var amount = money(fee.amount);
  if (amount === null) return fail('台费须为非负金额，最多两位小数');
  var shares = Object.create(null);
  var total = 0;
  if (fee.mode === 'equal') {
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
  var fees = Array.isArray(session.fees) ? session.fees : [];
  var totalFee = 0;
  for (var f = 0; f < fees.length; f++) {
    var fee = fees[f];
    var result = calculateFee(fee);
    if (!result.valid) return fail('第 ' + (f + 1) + ' 笔台费：' + result.message);
    if (!byId[fee.payerId]) return fail('台费垫付人不存在');
    totalFee = add(totalFee, result.amountCents);
    var payer = byId[fee.payerId];
    payer.feePaidCents = add(payer.feePaidCents, result.amountCents);
    if (totalFee === null || payer.feePaidCents === null) return fail('台费超出可计算范围');
    for (var s = 0; s < fee.participants.length; s++) {
      var person = byId[fee.participants[s]];
      if (!person) return fail('台费分摊人员不存在');
      person.feeShareCents = add(person.feeShareCents, result.shares[person.id]);
      if (person.feeShareCents === null) return fail('台费超出可计算范围');
    }
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

module.exports = { createSession: createSession, createRound: createRound, createFee: createFee, validateRound: validateRound, calculateFee: calculateFee, summarize: summarize, formatMoney: formatMoney };
