'use strict';

var engine = require('./mahjong.js');
var roster = require('./mahjong-roster.js');

function defaultGroupName(index) {
  var letters = '';
  for (var n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
  }
  return '组合 ' + letters;
}

function createSnapshot(session, timestamp) {
  var withoutFee = engine.summarize(session, false);
  if (!withoutFee.valid) return { valid: false, message: withoutFee.message };
  var withFee = engine.summarize(session, true);
  if (!withFee.valid) return { valid: false, message: withFee.message };

  var groups = Object.create(null);
  (session.groups || []).forEach(function (group, index) {
    groups[group.id] = String(group.name || '').trim() || defaultGroupName(index);
  });
  var createdAt = timestamp == null ? Date.now() : timestamp;
  return {
    valid: true,
    snapshot: {
      id: 'settlement-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
      createdAt: createdAt,
      dateLabel: formatDate(createdAt),
      title: String(session.title || '麻将清算'),
      price: String(session.price),
      players: withFee.players.filter(function (player) {
        var original = session.players.filter(function (item) { return item.id === player.id; })[0];
        if (original && original.active !== false) return true;
        return (session.rounds || []).some(function (round) { return round.participants.indexOf(player.id) >= 0; }) ||
          (session.fees || []).some(function (fee) { return fee.payerId === player.id || fee.participants.indexOf(player.id) >= 0; });
      }).map(function (player) {
        return {
          id: player.id,
          name: player.name,
          groupName: groups[player.groupId] || '',
          points: player.points,
          gameCents: player.gameCents,
          feePaidCents: player.feePaidCents,
          feeShareCents: player.feeShareCents
        };
      }),
      withoutFee: withoutFee.transfers.map(copyTransfer),
      withFee: withFee.transfers.map(copyTransfer),
      totalFeeCents: withFee.totalFeeCents
    }
  };
}

function copyTransfer(transfer) {
  return { from: transfer.from, to: transfer.to, cents: transfer.cents };
}

function pad(number) { return String(number).padStart(2, '0'); }

function formatDate(timestamp) {
  var date = new Date(timestamp);
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' 星期' + weekdays[date.getDay()] + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function viewSnapshot(snapshot) {
  snapshot = roster.resolveSnapshot(snapshot);
  var dateLabel = snapshot.dateLabel || formatDate(snapshot.createdAt);
  function transferView(transfer) {
    return { from: transfer.from, to: transfer.to, amount: engine.formatMoney(transfer.cents) };
  }
  return {
    id: snapshot.id,
    dateLabel: dateLabel,
    players: snapshot.players.map(function (player) {
      return {
        id: player.id,
        name: player.name,
        groupName: player.groupName,
        pointsLabel: (player.points > 0 ? '+' : '') + player.points,
        gameLabel: (player.gameCents > 0 ? '+' : player.gameCents < 0 ? '−' : '') + '¥' + engine.formatMoney(Math.abs(player.gameCents))
      };
    }),
    withoutFee: snapshot.withoutFee.map(transferView),
    withFee: snapshot.withFee.map(transferView),
    totalFee: engine.formatMoney(snapshot.totalFeeCents)
  };
}

module.exports = { createSnapshot: createSnapshot, viewSnapshot: viewSnapshot };
