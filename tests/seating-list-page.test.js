'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
let definition;
global.Page = p => { definition = p; };
global.wx = {};
require('../pages/seating-list/index');
function page(storage) { const p = Object.assign({}, definition); p.data = { projects: [] }; p.setData = data => Object.assign(p.data, data); p.getStore = () => storage; return p; }
test('项目列表使用本地数据，不创建项目', () => {
  const p = page({ list: () => [{ id: 'a', name: '聚会' }] });
  p.refresh(); assert.equal(p.data.projects[0].name, '聚会');
});
test('删除项目取消时不会删除文件', () => {
  let removed = false, dialog;
  global.wx.showModal = o => { dialog = o; };
  const p = page({ remove: () => { removed = true; }, list: () => [] });
  p.removeProject({ currentTarget: { dataset: { id: 'a' } } });
  dialog.success({ confirm: false }); assert.equal(removed, false);
});
