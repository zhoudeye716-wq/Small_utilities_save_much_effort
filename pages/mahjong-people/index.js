var roster = require('../../utils/mahjong-roster.js');

function makeId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function groupLetter(index) {
  var result = '';
  do {
    result = String.fromCharCode(65 + index % 26) + result;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return result;
}

function nextGroupName(groups, players) {
  var names = groups.concat(players).map(function (item) { return item.name; });
  var index = 0;
  while (names.indexOf('组合 ' + groupLetter(index)) !== -1) index++;
  return '组合 ' + groupLetter(index);
}

Page({
  data: { players: [], groups: [], dialog: null, readFailed: false },

  onShow: function () { this.refresh(); },

  refresh: function () {
    var result = roster.read();
    if (!result || !result.ok) {
      this.setData({ readFailed: true });
      return;
    }
    var groups = result.groups || [];
    var players = result.players || [];
    var groupViews = groups.map(function (group, index) {
      var members = players.filter(function (player) { return player.groupId === group.id; })
        .map(function (player) { return player.name; });
      return { id: group.id, name: group.name || '组合 ' + groupLetter(index), members: members.length ? members.join('、') : '暂无成员' };
    });
    var playerViews = players.map(function (player) {
      var group = groupViews.find(function (item) { return item.id === player.groupId; });
      return { id: player.id, name: player.name, groupId: group ? group.id : '', groupName: group ? group.name : '单独结算' };
    });
    this.setData({ players: playerViews, groups: groupViews, readFailed: false });
  },

  absorbTap: function () {},
  closeDialog: function () { this.setData({ dialog: null }); },
  changeDialogValue: function (event) {
    this.setData({ 'dialog.value': event.detail.value, 'dialog.error': '' });
  },

  addPlayer: function () {
    this.setData({ dialog: { kind: 'player', title: '添加玩家', value: '', placeholder: '输入玩家昵称', id: '', error: '' } });
  },
  renamePlayer: function (event) {
    var player = this.data.players.find(function (item) { return item.id === event.currentTarget.dataset.id; });
    if (player) this.setData({ dialog: { kind: 'player', title: '修改昵称', value: player.name, placeholder: '输入玩家昵称', id: player.id, error: '' } });
  },
  addGroup: function () {
    this.setData({ dialog: { kind: 'group', title: '添加组合', value: nextGroupName(this.data.groups, this.data.players), placeholder: '输入组合名称', id: '', error: '' } });
  },
  renameGroup: function (event) {
    var group = this.data.groups.find(function (item) { return item.id === event.currentTarget.dataset.id; });
    if (group) this.setData({ dialog: { kind: 'group', title: '修改组合名称', value: group.name, placeholder: '输入组合名称', id: group.id, error: '' } });
  },
  openGroupPicker: function (event) {
    var player = this.data.players.find(function (item) { return item.id === event.currentTarget.dataset.id; });
    if (!player) return;
    var options = [{ id: '', name: '单独结算' }].concat(this.data.groups.map(function (group) { return { id: group.id, name: group.name }; }));
    this.setData({ dialog: { kind: 'picker', title: '选择组合', note: player.name + ' 的结算方式', id: player.id, selected: player.groupId, options: options, error: '' } });
  },
  chooseGroup: function (event) {
    var dialog = this.data.dialog;
    if (!dialog || dialog.kind !== 'picker') return;
    var groupId = event.currentTarget.dataset.id || '';
    if (!roster.setPlayerGroup(dialog.id, groupId)) {
      this.setData({ 'dialog.error': '保存失败，请检查设备存储后重试。' });
      return;
    }
    this.setData({ dialog: null });
    this.refresh();
  },
  requestDelete: function (event) {
    var type = event.currentTarget.dataset.type;
    var items = type === 'player' ? this.data.players : this.data.groups;
    var item = items.find(function (entry) { return entry.id === event.currentTarget.dataset.id; });
    if (!item) return;
    var message = type === 'player'
      ? '将“' + item.name + '”从玩家名单移除；已有对局仍会保留这名玩家和记录。'
      : '删除“' + item.name + '”后，组合内成员将单独结算。';
    this.setData({ dialog: { kind: 'delete', type: type, id: item.id, title: type === 'player' ? '移除玩家' : '删除组合', message: message, stage: 1, error: '' } });
  },
  confirmDelete: function () {
    var dialog = this.data.dialog;
    if (!dialog || dialog.kind !== 'delete') return;
    if (dialog.stage === 1) {
      this.setData({ 'dialog.stage': 2 });
      return;
    }
    var saved = dialog.type === 'player' ? roster.archivePlayer(dialog.id) : roster.deleteGroup(dialog.id);
    if (!saved) {
      this.setData({ 'dialog.error': '操作失败，请检查设备存储后重试。' });
      return;
    }
    this.setData({ dialog: null });
    this.refresh();
  },
  confirmName: function () {
    var dialog = this.data.dialog;
    if (!dialog || (dialog.kind !== 'player' && dialog.kind !== 'group')) return;
    var name = (dialog.value || '').trim();
    if (!name) {
      this.setData({ 'dialog.error': '请输入名称。' });
      return;
    }
    var items = dialog.kind === 'player' ? this.data.players : this.data.groups;
    if (items.some(function (item) { return item.id !== dialog.id && item.name === name; })) {
      this.setData({ 'dialog.error': dialog.kind === 'player' ? '该昵称已存在，请换一个。' : '该组合名称已存在，请换一个。' });
      return;
    }
    var otherItems = dialog.kind === 'player' ? this.data.groups : this.data.players;
    if (otherItems.some(function (item) { return item.name === name; })) {
      this.setData({ 'dialog.error': dialog.kind === 'player' ? '该名称已被组合使用，请换一个昵称。' : '该名称已被玩家使用，请换一个组合名称。' });
      return;
    }
    var id = dialog.id || makeId(dialog.kind);
    var saved = dialog.kind === 'player' ? roster.upsert(id, name) : roster.upsertGroup(id, name);
    if (!saved) {
      this.setData({ 'dialog.error': '保存失败，请检查设备存储后重试。' });
      return;
    }
    this.setData({ dialog: null });
    this.refresh();
  }
});
