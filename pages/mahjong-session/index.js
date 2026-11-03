var storage = require('../../utils/storage.js');
var engine = require('../../utils/mahjong.js');
var roster = require('../../utils/mahjong-roster.js');
var records = require('../../utils/mahjong-records.js');

function readSessions() {
  try {
    var value = wx.getStorageSync('mahjongSessions');
    if (value === '' || value === undefined || value === null) return [];
    return Array.isArray(value) ? value : null;
  } catch (error) { return null; }
}

function makeId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function nameOf(session, id) {
  var player = session.players.filter(function (item) { return item.id === id; })[0];
  return player ? player.name : '未知玩家';
}
function amount(cents) { return engine.formatMoney(cents); }
function signed(cents) { return (cents > 0 ? '+' : cents < 0 ? '−' : '') + '¥' + amount(Math.abs(cents)); }
function defaultGroupName(index) {
  return '组合 ' + (index < 26 ? String.fromCharCode(65 + index) : String(index + 1));
}
function groupName(session, id) {
  for (var i = 0; i < session.groups.length; i += 1) {
    if (session.groups[i].id === id) return session.groups[i].name || defaultGroupName(i);
  }
  return '';
}
function nameInUse(session, name, playerId, groupId) {
  return session.players.some(function (player) { return player.id !== playerId && player.name === name; }) ||
    session.groups.some(function (group, index) { return group.id !== groupId && (group.name || defaultGroupName(index)) === name; });
}
function involvedInSession(session, player) {
  if (player.active !== false) return true;
  return session.rounds.some(function (round) { return round.participants.indexOf(player.id) >= 0; }) ||
    session.fees.some(function (fee) { return fee.payerId === player.id || fee.participants.indexOf(player.id) >= 0; });
}

Page({
  data: {
    session: null, tab: 'rounds', roundViews: [], feeViews: [], playerViews: [], groupViews: [],
    groupOptions: ['单独结算'], payerOptions: [], summary: null, includeFees: true, saveFailed: false, expandedRoundId: '', expandedFeeId: '',
    dialog: null, recordViews: [], expandedRecordId: '', currentRoundLabel: ''
  },
  onLoad: function (options) {
    var id = options.id || '';
    var sessions = readSessions();
    var session = sessions ? sessions.filter(function (item) { return item.id === id; })[0] : null;
    if (!session) {
      wx.showModal({ title: sessions ? '找不到对局' : '读取失败', content: sessions ? '这场对局可能已不在本机记录中。' : '暂时无法读取本机对局记录，请稍后重试。', showCancel: false, success: function () { wx.navigateBack(); } });
      return;
    }
    var resolved = roster.resolveSession(session);
    if (!resolved.ok) {
      wx.showModal({ title: '读取失败', content: '暂时无法读取本机玩家与组合，请稍后重试。', showCancel: false, success: function () { wx.navigateBack(); } });
      return;
    }
    session = resolved.session;
    this.setData({ expandedRoundId: session.rounds.length ? session.rounds[session.rounds.length - 1].id : '', expandedFeeId: session.fees.length ? session.fees[session.fees.length - 1].id : '',
      tab: options.tab === 'settlement' ? 'settlement' : 'rounds', expandedRecordId: options.record || '' });
    this.refresh(session, false);
  },
  saveSession: function (session) {
    var sessions = readSessions();
    if (!sessions) {
      if (!this.data.saveFailed) wx.showToast({ title: '读取记录失败，未能保存', icon: 'none', duration: 4000 });
      return false;
    }
    var index = sessions.findIndex(function (item) { return item.id === session.id; });
    session.updatedAt = Date.now();
    if (index < 0) sessions.unshift(session); else sessions[index] = session;
    var saved = storage.saveState('mahjongSessions', sessions);
    if (!saved && !this.data.saveFailed) wx.showToast({ title: '保存失败，请检查设备存储', icon: 'none', duration: 4000 });
    return saved;
  },
  refresh: function (session, shouldSave) {
    var saved = shouldSave === false ? !this.data.saveFailed : this.saveSession(session);
    var groupOptions = ['单独结算'].concat(session.groups.map(function (group, index) { return group.name || defaultGroupName(index); }));
    var payerOptions = ['请选择垫付人'].concat(session.players.map(function (player) { return player.name; }));
    var selectedRoundIndex = session.rounds.findIndex(function (round) { return round.id === this.data.expandedRoundId; }, this);
    var selectedRound = session.rounds[selectedRoundIndex];
    var playerViews = session.players.map(function (player) {
      var groupIndex = session.groups.findIndex(function (group) { return group.id === player.groupId; });
      return Object.assign({}, player, { groupIndex: groupIndex + 1, groupLabel: groupName(session, player.groupId) || '单独结算', active: player.active !== false,
        inRound: !!selectedRound && selectedRound.participants.indexOf(player.id) >= 0 });
    });
    var groupViews = session.groups.map(function (group, index) {
      return { id: group.id, name: group.name || defaultGroupName(index), members: session.players.filter(function (player) { return player.groupId === group.id; }).map(function (player) { return player.name; }).join('、') || '暂无成员' };
    });
    var roundViews = session.rounds.map(function (round, index) {
      var check = engine.validateRound(round);
      return { id: round.id, number: index + 1, initial: round.initial, valid: check.valid, message: check.valid ? '✓ 点数已核对平衡' : check.message,
        rows: session.players.filter(function (player) { return player.active !== false || round.participants.indexOf(player.id) >= 0; }).map(function (player) {
          var selected = round.participants.indexOf(player.id) >= 0;
          var value = Object.prototype.hasOwnProperty.call(round.scores, player.id) ? round.scores[player.id] : '';
          var initial = Number(round.initial);
          var score = Number(value);
          var delta = value !== '' && /^-?\d+$/.test(String(value)) && Number.isSafeInteger(score) && Number.isSafeInteger(initial) ? score - initial : null;
          var negative = String(value).charAt(0) === '-';
          return { id: player.id, name: player.name, selected: selected, value: negative ? String(value).slice(1) : value,
            negative: negative, delta: delta === null ? '' : (delta > 0 ? '+' : '') + delta };
        }) };
    });
    var feeViews = session.fees.map(function (fee, index) {
      var check = engine.calculateFee(fee);
      var payerIndex = session.players.findIndex(function (player) { return player.id === fee.payerId; });
      return { id: fee.id, number: index + 1, amount: fee.amount, mode: fee.mode, payerIndex: payerIndex + 1, payerName: payerIndex >= 0 ? payerOptions[payerIndex + 1] : '请选择垫付人',
        valid: check.valid, message: check.valid ? '✓ 台费分摊已核对' : check.message,
        rows: session.players.filter(function (player) { return player.active !== false || fee.payerId === player.id || fee.participants.indexOf(player.id) >= 0; }).map(function (player) {
          var selected = fee.participants.indexOf(player.id) >= 0;
          var value = fee.mode === 'custom' ? (fee.shares[player.id] || '') : (check.shares && Object.prototype.hasOwnProperty.call(check.shares, player.id) ? amount(check.shares[player.id]) : '');
          return { id: player.id, name: player.name, selected: selected, value: value };
        }) };
    });
    var summary = null;
    if (this.data.tab === 'settlement') {
      var raw = engine.summarize(session, this.data.includeFees);
      if (raw.valid) {
        summary = { valid: true, totalFee: amount(raw.totalFeeCents), players: raw.players.filter(function (player) {
          var original = session.players.filter(function (item) { return item.id === player.id; })[0];
          return original && involvedInSession(session, original);
        }).map(function (player) {
          return Object.assign({}, player, { groupLabel: groupName(session, player.groupId), pointsLabel: (player.points > 0 ? '+' : '') + player.points,
            gameLabel: signed(player.gameCents), feePaidLabel: amount(player.feePaidCents), feeShareLabel: amount(player.feeShareCents) });
        }), transfers: raw.transfers.map(function (transfer) { return { from: transfer.from, to: transfer.to, amount: amount(transfer.cents) }; }) };
      } else summary = { valid: false, message: raw.message };
    }
    var recordViews = (session.settlements || []).slice().reverse().map(records.viewSnapshot);
    this.setData({ session: session, playerViews: playerViews, groupViews: groupViews, groupOptions: groupOptions, payerOptions: payerOptions,
      roundViews: roundViews, feeViews: feeViews, summary: summary, recordViews: recordViews,
      currentRoundLabel: selectedRoundIndex >= 0 ? '第 ' + (selectedRoundIndex + 1) + ' 轮' : '未选择小轮', saveFailed: !saved });
  },
  setTab: function (event) { this.setData({ tab: event.currentTarget.dataset.tab }); this.refresh(this.data.session, false); },
  openRound: function (event) { this.setData({ expandedRoundId: event.currentTarget.dataset.id }); this.refresh(this.data.session, false); },
  openFee: function (event) { this.setData({ expandedFeeId: event.currentTarget.dataset.id }); },
  changePrice: function (event) { var s = copy(this.data.session); s.price = event.detail.value; this.refresh(s); },
  renameSession: function () {
    this.setData({ dialog: { kind: 'session', title: '修改对局名称', value: this.data.session.title, placeholder: '输入对局名称', error: '' } });
  },
  addPlayer: function () {
    var existing = roster.read();
    if (!existing.ok) return wx.showToast({ title: '无法读取本机玩家名单', icon: 'none' });
    var sessionPlayers = this.data.session.players;
    var options = existing.players.filter(function (player) {
      return !sessionPlayers.some(function (item) { return item.id === player.id || item.name === player.name; });
    });
    this.setData({ dialog: { kind: 'addPlayer', title: '添加玩家', value: '', placeholder: '输入新昵称', error: '', options: options } });
  },
  renamePlayer: function (event) {
    var id = event.currentTarget.dataset.id;
    var player = this.data.session.players.filter(function (item) { return item.id === id; })[0];
    if (!player) return;
    this.setData({ dialog: { kind: 'player', title: '修改昵称', targetId: id, value: player.name, placeholder: '输入昵称', error: '' } });
  },
  toggleActive: function (event) {
    var s = copy(this.data.session), id = event.currentTarget.dataset.id;
    var player = s.players.filter(function (item) { return item.id === id; })[0];
    if (player) { player.active = event.detail.value; this.refresh(s); }
  },
  toggleCurrentRound: function (event) {
    var s = copy(this.data.session), id = event.currentTarget.dataset.id;
    var round = s.rounds.filter(function (item) { return item.id === this.data.expandedRoundId; }, this)[0];
    var player = s.players.filter(function (item) { return item.id === id; })[0];
    if (!round || !player) return wx.showToast({ title: '请先创建一小轮', icon: 'none' });
    var index = round.participants.indexOf(id);
    if (event.detail.value && index < 0) { round.participants.push(id); player.active = true; }
    else if (!event.detail.value && index >= 0) round.participants.splice(index, 1);
    this.refresh(s);
  },
  openGroupPicker: function (event) {
    var id = event.currentTarget.dataset.id;
    var player = this.data.session.players.filter(function (item) { return item.id === id; })[0];
    if (!player) return;
    var options = [{ id: '', name: '单独结算' }].concat(this.data.groupViews.map(function (group) { return { id: group.id, name: group.name }; }));
    this.setData({ dialog: { kind: 'groupPicker', title: '选择 ' + player.name + ' 的组合', targetId: id, selected: player.groupId || '', options: options } });
  },
  addGroup: function () {
    var s = copy(this.data.session);
    var library = roster.read();
    if (!library.ok) return wx.showToast({ title: '无法读取玩家与组合', icon: 'none' });
    var index = 0;
    while (nameInUse(s, defaultGroupName(index)) || library.groups.some(function (group) { return group.name === defaultGroupName(index); }) ||
      library.players.some(function (player) { return player.name === defaultGroupName(index); })) index += 1;
    var group = { id: makeId('g'), name: defaultGroupName(index) };
    if (!roster.upsertGroup(group.id, group.name)) return wx.showToast({ title: '组合保存失败', icon: 'none' });
    s.groups.push(group);
    this.refresh(s);
  },
  renameGroup: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    var group = this.data.session.groups[index];
    if (!group) return;
    this.setData({ dialog: { kind: 'group', title: '修改组合名称', targetId: group.id, value: group.name, placeholder: '输入组合名称', error: '' } });
  },
  removeGroup: function (event) {
    this.setData({ dialog: { kind: 'removeGroup', title: '删除组合', message: '组合将从全局移除，相关玩家在各对局中恢复单独结算，已保存的清算记录不变。', targetId: event.currentTarget.dataset.id } });
  },
  addRound: function () {
    var s = copy(this.data.session);
    var last = s.rounds[s.rounds.length - 1];
    var players = s.players.filter(function (player) { return player.active !== false; }).map(function (player) { return player.id; });
    if (!players.length) return wx.showToast({ title: '请先选择参加的玩家', icon: 'none' });
    var round = engine.createRound(players, last ? last.initial : '50');
    s.rounds.push(round); this.setData({ expandedRoundId: round.id }); this.refresh(s);
  },
  removeRound: function (event) {
    this.setData({ dialog: { kind: 'removeRound', title: '删除这一轮', message: '确定删除这轮的点数记录吗？', index: Number(event.currentTarget.dataset.index) } });
  },
  updateRound: function (event) {
    var s = copy(this.data.session), index = Number(event.currentTarget.dataset.index), key = event.currentTarget.dataset.key;
    if (s.rounds[index] && key === 'initial') { s.rounds[index].initial = event.detail.value; this.refresh(s); }
  },
  toggleRoundPlayer: function (event) {
    var s = copy(this.data.session), index = Number(event.currentTarget.dataset.index), id = event.currentTarget.dataset.id;
    var round = s.rounds[index]; if (!round) return;
    var position = round.participants.indexOf(id);
    if (position < 0) {
      round.participants.push(id);
      var player = s.players.filter(function (item) { return item.id === id; })[0];
      if (player) player.active = true;
    } else round.participants.splice(position, 1);
    this.refresh(s);
  },
  updateScore: function (event) {
    var s = copy(this.data.session), index = Number(event.currentTarget.dataset.index), id = event.currentTarget.dataset.id;
    if (s.rounds[index]) {
      var current = String(s.rounds[index].scores[id] || '');
      var input = String(event.detail.value || '');
      if (!/^-?\d*$/.test(input)) {
        wx.showToast({ title: '请输入整数点数', icon: 'none' });
        this.refresh(s, false);
        return;
      }
      var digits = input.charAt(0) === '-' ? input.slice(1) : input;
      var negative = input.charAt(0) === '-' || current.charAt(0) === '-';
      s.rounds[index].scores[id] = (negative ? '-' : '') + digits;
      this.refresh(s);
    }
  },
  toggleScoreSign: function (event) {
    var s = copy(this.data.session), index = Number(event.currentTarget.dataset.index), id = event.currentTarget.dataset.id;
    if (!s.rounds[index]) return;
    var value = String(s.rounds[index].scores[id] || '');
    s.rounds[index].scores[id] = value.charAt(0) === '-' ? value.slice(1) : '-' + value;
    this.refresh(s);
  },
  addFee: function () {
    var s = copy(this.data.session);
    var players = s.players.filter(function (player) { return player.active !== false; }).map(function (player) { return player.id; });
    if (!players.length) return wx.showToast({ title: '请先添加参加的玩家', icon: 'none' });
    var fee = engine.createFee(players, '');
    s.fees.push(fee); this.setData({ expandedFeeId: fee.id }); this.refresh(s);
  },
  updateFeeAmount: function (event) {
    var s = copy(this.data.session), index = Number(event.currentTarget.dataset.index);
    if (s.fees[index]) { s.fees[index].amount = event.detail.value; this.refresh(s); }
  },
  openPayerPicker: function (event) {
    var index = Number(event.currentTarget.dataset.index), fee = this.data.session.fees[index];
    if (!fee) return;
    this.setData({ dialog: { kind: 'payerPicker', title: '选择垫付人', index: index, selected: fee.payerId,
      options: this.data.session.players.map(function (player) { return { id: player.id, name: player.name }; }) } });
  },
  toggleFeePlayer: function (event) {
    var s = copy(this.data.session), index = Number(event.currentTarget.dataset.index), id = event.currentTarget.dataset.id;
    var fee = s.fees[index]; if (!fee) return;
    var position = fee.participants.indexOf(id);
    if (position < 0) fee.participants.push(id); else fee.participants.splice(position, 1);
    this.refresh(s);
  },
  setFeeMode: function (event) {
    var s = copy(this.data.session), index = Number(event.currentTarget.dataset.index), mode = event.currentTarget.dataset.mode;
    var fee = s.fees[index]; if (!fee || fee.mode === mode) return;
    if (mode === 'custom') {
      var check = engine.calculateFee(fee);
      if (check.valid) Object.keys(check.shares).forEach(function (id) {
        if (!Object.prototype.hasOwnProperty.call(fee.shares, id)) fee.shares[id] = amount(check.shares[id]);
      });
    }
    fee.mode = mode; this.refresh(s);
  },
  updateShare: function (event) {
    var s = copy(this.data.session), index = Number(event.currentTarget.dataset.index), id = event.currentTarget.dataset.id;
    if (s.fees[index]) { s.fees[index].shares[id] = event.detail.value; this.refresh(s); }
  },
  removeFee: function (event) {
    this.setData({ dialog: { kind: 'removeFee', title: '删除台费记录', message: '确定删除这笔台费吗？', index: Number(event.currentTarget.dataset.index) } });
  },
  setSettlementMode: function (event) {
    this.setData({ includeFees: event.currentTarget.dataset.include === 'yes' });
    this.refresh(this.data.session, false);
  },
  saveSettlement: function () {
    var snapshot = records.createSnapshot(this.data.session);
    if (!snapshot.valid) return wx.showToast({ title: snapshot.message, icon: 'none', duration: 3000 });
    var s = copy(this.data.session);
    if (!Array.isArray(s.settlements)) s.settlements = [];
    s.settlements.push(snapshot.snapshot);
    this.setData({ expandedRecordId: snapshot.snapshot.id });
    this.refresh(s);
    if (!this.data.saveFailed) wx.showToast({ title: '清算记录已保存', icon: 'success' });
  },
  openRecord: function (event) {
    var id = event.currentTarget.dataset.id;
    this.setData({ expandedRecordId: this.data.expandedRecordId === id ? '' : id });
  },
  closeDialog: function () { this.setData({ dialog: null }); },
  absorbTap: function () {},
  changeDialogValue: function (event) { this.setData({ 'dialog.value': event.detail.value, 'dialog.error': '' }); },
  chooseDialogOption: function (event) {
    var dialog = this.data.dialog, id = event.currentTarget.dataset.id;
    if (!dialog) return;
    var s = copy(this.data.session);
    if (dialog.kind === 'groupPicker') {
      var player = s.players.filter(function (item) { return item.id === dialog.targetId; })[0];
      if (!player || (id && !s.groups.some(function (group) { return group.id === id; }))) return;
      var library = roster.read();
      if (!library.ok) return wx.showToast({ title: '无法读取玩家与组合', icon: 'none' });
      var globalPlayer = library.players.some(function (item) { return item.id === player.id; });
      if (globalPlayer) {
        var selectedGroup = s.groups.filter(function (group) { return group.id === id; })[0];
        if (selectedGroup && !library.groups.some(function (group) { return group.id === id; }) && !roster.upsertGroup(id, selectedGroup.name)) {
          return wx.showToast({ title: '组合保存失败', icon: 'none' });
        }
        if (!roster.setPlayerGroup(player.id, id)) return wx.showToast({ title: '组合保存失败', icon: 'none' });
      }
      player.groupId = id;
    } else if (dialog.kind === 'payerPicker') {
      if (!s.fees[dialog.index] || !s.players.some(function (item) { return item.id === id; })) return;
      s.fees[dialog.index].payerId = id;
    } else if (dialog.kind === 'addPlayer') {
      var candidate = (dialog.options || []).filter(function (item) { return item.id === id; })[0];
      if (!candidate || nameInUse(s, candidate.name)) return;
      s.players.push({ id: candidate.id, name: candidate.name, groupId: candidate.groupId || '', active: false });
      var updated = roster.resolveSession(s);
      if (!updated.ok) return wx.showToast({ title: '无法读取玩家与组合', icon: 'none' });
      s = updated.session;
    } else return;
    this.setData({ dialog: null });
    this.refresh(s);
  },
  confirmDialog: function () {
    var dialog = this.data.dialog;
    if (!dialog) return;
    var s = copy(this.data.session), id = dialog.targetId;
    if (dialog.kind === 'removeGroup') {
      var groups = roster.read();
      if (!groups.ok || (groups.groups.some(function (group) { return group.id === id; }) && !roster.deleteGroup(id))) {
        return wx.showToast({ title: '组合删除失败，请重试', icon: 'none' });
      }
      s.groups = s.groups.filter(function (group) { return group.id !== id; });
      s.players.forEach(function (player) { if (player.groupId === id) player.groupId = ''; });
    } else if (dialog.kind === 'removeRound') {
      if (!s.rounds[dialog.index]) return this.closeDialog();
      var removedId = s.rounds[dialog.index].id;
      s.rounds.splice(dialog.index, 1);
      if (this.data.expandedRoundId === removedId) this.setData({ expandedRoundId: s.rounds.length ? s.rounds[s.rounds.length - 1].id : '' });
    } else if (dialog.kind === 'removeFee') {
      if (!s.fees[dialog.index]) return this.closeDialog();
      s.fees.splice(dialog.index, 1);
    } else {
      var name = (dialog.value || '').trim();
      if (!name) return this.setData({ 'dialog.error': '请输入名称' });
      if (dialog.kind !== 'session' && nameInUse(s, name, dialog.kind === 'player' ? id : '', dialog.kind === 'group' ? id : '')) {
        return this.setData({ 'dialog.error': '名称已存在，请换一个' });
      }
      if (dialog.kind === 'session') s.title = name;
      else if (dialog.kind === 'group') {
        var group = s.groups.filter(function (item) { return item.id === id; })[0];
        if (!group) return this.closeDialog();
        if (!roster.upsertGroup(id, name)) return this.setData({ 'dialog.error': '名称已存在或组合保存失败' });
        group.name = name;
      } else if (dialog.kind === 'player' || dialog.kind === 'addPlayer') {
        var playerId = dialog.kind === 'player' ? id : makeId('p');
        var player = s.players.filter(function (item) { return item.id === playerId; })[0];
        if (dialog.kind === 'player' && !player) return this.closeDialog();
        if (player && player.name === name) return this.closeDialog();
        if (!roster.upsert(playerId, name)) return this.setData({ 'dialog.error': '昵称库中可能已有此名称，或本机保存失败' });
        if (player && player.groupId) {
          var currentGroup = s.groups.filter(function (item) { return item.id === player.groupId; })[0];
          var currentLibrary = roster.read();
          if (!currentLibrary.ok || (currentGroup && !currentLibrary.groups.some(function (item) { return item.id === currentGroup.id; }) && !roster.upsertGroup(currentGroup.id, currentGroup.name)) || !roster.setPlayerGroup(playerId, player.groupId)) {
            return this.setData({ 'dialog.error': '昵称已保存，但组合保存失败，请重试' });
          }
        }
        if (player) player.name = name;
        else s.players.push({ id: playerId, name: name, groupId: '', active: false });
      } else return;
    }
    this.setData({ dialog: null });
    this.refresh(s);
  }
});
