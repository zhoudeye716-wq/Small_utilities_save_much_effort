var engine = require('../../utils/offline-table.js');
var storage = require('../../utils/storage.js');
var layout = require('../../utils/table-layout.js');
var STAGE_NAMES = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '结算', waiting: '等待补充筹码', settled: '已结算' };

function seatNames(indices) { return indices.map(function (index) { return 'P' + (index + 1); }).join('、'); }

Page({
  data: {
    table: null, seats: [], stageLabel: '', currentRole: '', toCall: 0, callAmount: 0,
    mode: '', modeLabel: '', pendingBet: 0, increments: [1, 5, 10, 50, 100, 500],
    pots: [], selections: [], selectedPot: -1, canChangeDealer: true,
    layoutWidth: 800, layoutHeight: 320, menuOpen: false, menuTop: 8, menuRight: 100, topUpDialog: null
  },
  onLoad: function () {
    var table = storage.loadState('offlineTable', null);
    if (!table) {
      var settings = storage.loadState('offlineSettings', { players: 4, totalChips: 1000, smallBlind: 1, bigBlind: 1, unitPrice: 0.1 });
      table = engine.createTable(settings);
    }
    this.updateTable(table);
  },
  onReady: function () { this.measureTable(); },
  onResize: function () { this.measureTable(); },
  measureTable: function () {
    var self = this;
    try {
      var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      var capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      var width = info.windowWidth || 800;
      var height = info.windowHeight || 320;
      this.setData({ layoutWidth: width, layoutHeight: height,
        menuTop: capsule && capsule.height ? capsule.top : (info.statusBarHeight || 8),
        menuRight: capsule && capsule.width ? Math.max(8, width - capsule.left + 8) : 8 });
    } catch (error) { /* Preserve the default geometry on older base libraries. */ }
    if (this.data.table) this.updateTable(this.data.table);
    if (wx.createSelectorQuery) {
      wx.createSelectorQuery().in(this).select('.table-scene').boundingClientRect(function (rect) {
        if (!rect || !rect.width || !rect.height) return;
        self.setData({ layoutWidth: rect.width, layoutHeight: rect.height });
        if (self.data.table) self.updateTable(self.data.table);
      }).exec();
    }
  },
  updateTable: function (table) {
    if (table.stage !== 'showdown' && table.winnerSelections) {
      table = Object.assign({}, table);
      delete table.winnerSelections;
    }
    var points = layout.seatPoints(table.seats.length, this.data.layoutWidth, this.data.layoutHeight);
    var selections = table.stage === 'showdown' ? (table.winnerSelections || this.data.selections) : [];
    var chosen = this.data.mode === 'winner' ? (selections[this.data.selectedPot] || []) : [];
    var seats = table.seats.map(function (seat, index) {
      var point = points[index];
      return Object.assign({}, seat, points[index], {
        positionStyle: 'left:' + point.left + '%;top:' + point.top + '%;transform:translate(-50%,-50%) rotate(' + point.rotation + 'deg);',
        current: index === table.currentSeat && table.stage !== 'showdown' && table.stage !== 'waiting',
        selected: chosen.indexOf(index) >= 0
      });
    });
    var pots = table.stage === 'showdown' ? engine.getPots(table).map(function (pot, index) {
      var needsChoice = pot.contributors.length > 1 && pot.eligible.length > 1;
      var selected = selections[index] || [];
      var status = pot.contributors.length === 1 ? '未被跟注，退回 ' + seatNames(pot.contributors) :
        pot.eligible.length === 1 ? '自动分给 ' + seatNames(pot.eligible) :
        selected.length ? '已选：' + seatNames(selected) : '可选：' + seatNames(pot.eligible);
      return Object.assign({}, pot, { label: index === 0 ? '主池' : '边池 ' + index, needsChoice: needsChoice, status: status });
    }) : [];
    var current = table.seats[table.currentSeat];
    var toCall = current ? Math.max(0, table.currentBet - current.streetBet) : 0;
    this.setData({ table: table, seats: seats, pots: pots, selections: selections, stageLabel: STAGE_NAMES[table.stage] || table.stage,
      currentRole: current ? current.role : '', toCall: toCall, callAmount: current ? Math.min(toCall, current.stack) : 0,
      canChangeDealer: engine.canChangeDealer(table) });
    if (storage.saveState('offlineTable', table)) this._saveWarningShown = false;
    else if (!this._saveWarningShown) {
      this._saveWarningShown = true;
      if (wx.showToast) wx.showToast({ title: '牌局保存失败，请检查设备存储', icon: 'none', duration: 4000 });
    }
  },
  showError: function (message) { wx.showModal({ title: '提示', content: message, showCancel: false }); },
  toggleMenu: function () { this.setData({ menuOpen: !this.data.menuOpen }); },
  closeMenu: function () { this.setData({ menuOpen: false }); },
  menuAction: function (event) {
    var action = event.currentTarget.dataset.action;
    this.closeMenu();
    if (action === 'dealer') this.changeDealer();
    else if (action === 'topup') this.chooseTopUp();
    else if (action === 'reset') this.newHand();
    else if (action === 'guide') this.openGuide();
    else if (action === 'back') this.returnToSetup();
  },
  returnToSetup: function () {
    var self = this;
    wx.showModal({ title: '返回牌桌设置', content: '当前牌局会保留，可稍后继续。未确认的下注不会保存。', confirmText: '确认返回', success: function (result) {
      if (!result.confirm) return;
      if (!storage.saveState('offlineTable', self.data.table)) return self.showError('牌局保存失败，请检查设备存储后重试。');
      var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
      var target = -1;
      for (var i = pages.length - 2; i >= 0; i -= 1) {
        if (pages[i].route === 'pages/offline-setup/index') { target = i; break; }
      }
      if (target >= 0) wx.navigateBack({ delta: pages.length - 1 - target, fail: function () { wx.redirectTo({ url: '/pages/offline-setup/index' }); } });
      else wx.redirectTo({ url: '/pages/offline-setup/index' });
    } });
  },
  changeDealer: function () {
    if (this.data.pendingBet) return this.showError('请先确认或清空已选择的筹码。');
    if (!this.data.canChangeDealer) return this.showError('本局行动已开始，结算后才能更换庄家。');
    this.setData({ mode: 'dealer', modeLabel: '点击座位设置庄家' });
    this.updateTable(this.data.table);
  },
  chooseTopUp: function () {
    if (this.data.table.stage !== 'waiting' && !this.data.canChangeDealer) return this.showError('请等本局结算后再补充筹码。');
    this.setData({ mode: 'topup', modeLabel: '点击需要补充筹码的座位' });
    this.updateTable(this.data.table);
  },
  cancelMode: function () {
    this.setData({ mode: '', modeLabel: '', selectedPot: -1 });
    this.updateTable(this.data.table);
  },
  onSeatTap: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    if (this.data.mode === 'dealer') {
      this.setData({ mode: '', modeLabel: '' });
      this.updateTable(engine.setDealer(this.data.table, index));
    } else if (this.data.mode === 'topup') {
      this.setData({ topUpDialog: { index: index, label: 'P' + (index + 1), amount: '', error: '' } });
    } else if (this.data.mode === 'winner') {
      var pot = this.data.pots[this.data.selectedPot];
      if (!pot || pot.eligible.indexOf(index) < 0) return this.showError('这个座位没有资格参与该底池结算。');
      var selections = this.data.selections.slice();
      var selected = (selections[this.data.selectedPot] || []).slice();
      var existing = selected.indexOf(index);
      if (existing >= 0) selected.splice(existing, 1); else selected.push(index);
      selections[this.data.selectedPot] = selected;
      this.setData({ selections: selections });
      this.updateTable(Object.assign({}, this.data.table, { winnerSelections: selections }));
    }
  },
  closeTopUp: function () { this.setData({ topUpDialog: null }); },
  absorbTopUpTap: function () {},
  inputTopUp: function (event) { this.setData({ 'topUpDialog.amount': event.detail.value, 'topUpDialog.error': '' }); },
  confirmTopUp: function () {
    var dialog = this.data.topUpDialog;
    if (!dialog) return;
    var change = engine.addChips(this.data.table, dialog.index, dialog.amount);
    if (change.error) return this.setData({ 'topUpDialog.error': change.error });
    this.setData({ topUpDialog: null, mode: '', modeLabel: '' });
    this.updateTable(change.state);
  },
  addBet: function (event) {
    var seat = this.data.table.seats[this.data.table.currentSeat];
    var amount = Number(event.currentTarget.dataset.amount);
    this.setData({ pendingBet: Math.min(seat.stack, this.data.pendingBet + amount) });
  },
  setPendingBet: function (event) {
    var amount = Number(event.detail.value);
    var stack = this.data.table.seats[this.data.table.currentSeat].stack;
    this.setData({ pendingBet: Number.isSafeInteger(amount) && amount >= 0 ? Math.min(stack, amount) : 0 });
  },
  allIn: function () { this.setData({ pendingBet: this.data.table.seats[this.data.table.currentSeat].stack }); },
  clearBet: function () { this.setData({ pendingBet: 0 }); },
  confirmBet: function () {
    if (!this.data.pendingBet) return this.showError('请先选择要下注的筹码。');
    var added = engine.applyAction(this.data.table, { type: 'add', amount: this.data.pendingBet });
    if (added.error) return this.showError(added.error);
    var advanced = engine.applyAction(added.state, { type: 'next' });
    if (advanced.error) return this.showError(advanced.error);
    this.setData({ pendingBet: 0, mode: '', modeLabel: '' });
    this.updateTable(advanced.state);
  },
  apply: function (action) {
    var result = engine.applyAction(this.data.table, action);
    if (result.error) return this.showError(result.error);
    this.setData({ pendingBet: 0, mode: '', modeLabel: '' });
    this.updateTable(result.state);
  },
  fold: function () { this.apply({ type: 'fold' }); },
  nextSeat: function () {
    if (this.data.pendingBet) return this.showError('请先确认下注或清空已选筹码。');
    this.apply({ type: 'next' });
  },
  choosePot: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    this.setData({ mode: 'winner', modeLabel: '点击赢家座位，可多选平分；选完点击完成', selectedPot: index });
    this.updateTable(this.data.table);
  },
  settle: function () {
    var result = engine.settlePots(this.data.table, this.data.selections);
    if (result.error) return this.showError(result.error);
    this.setData({ mode: '', modeLabel: '', selectedPot: -1, selections: [], pendingBet: 0 });
    this.updateTable(result.state);
  },
  newHand: function () {
    var self = this;
    wx.showModal({ title: '重置牌桌', content: '将所有玩家筹码重置为初始值，并开始新一局。', confirmText: '重置', success: function (event) {
      if (event.confirm) {
        self.setData({ pendingBet: 0, mode: '', modeLabel: '', selections: [], selectedPot: -1 });
        self.updateTable(engine.startNewHand(self.data.table, { resetStacks: true }));
      }
    } });
  },
  openGuide: function () { wx.navigateTo({ url: '/pages/offline-guide/index' }); }
});
