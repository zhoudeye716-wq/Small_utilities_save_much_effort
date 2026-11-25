'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');
const archive = require('../utils/backup/archive');
const registry = require('../utils/backup/registry');
const restore = require('../utils/backup/wx-restore');

function project() {
  const p = model.createProject('聚会', 'p1');
  p.assets.background = 'p1-background-image1.jpg';
  p.embeddedAssets = { 'p1-background-image1.jpg': 'YWJj' };
  return p;
}
test('座位图作为独立类别备份，图片和项目一起打包', async () => {
  assert.ok(registry.categories.some(c => c.id === 'seating'));
  const payload = { data: { seatingProjectsV1: [project()] }, projects: [], images: {} };
  const bytes = await archive.pack(payload, {});
  const opened = await archive.open(bytes, '');
  assert.equal(opened.payload.data.seatingProjectsV1[0].embeddedAssets['p1-background-image1.jpg'], 'YWJj');
});
test('恢复座位图使用受限的本机文件路径，不写入其他目录', () => {
  const changes = restore.buildChanges({ data: { seatingProjectsV1: [project()] }, projects: [], images: {} }, ['seatingProjectsV1'], false, []);
  assert.ok(changes.some(c => c.key === 'g:p1.json'));
  assert.ok(changes.some(c => c.key === 'g:p1-background-image1.jpg'));
  assert.ok(!changes.some(c => c.key === 's:seatingProjectsV1'));
});
test('拒绝座位图引用路径穿越或不匹配的图片', async () => {
  const p = project(); p.assets.background = '../x.jpg'; p.embeddedAssets = { '../x.jpg': 'YWJj' };
  await assert.rejects(archive.pack({ data: { seatingProjectsV1: [p] }, projects: [], images: {} }, {}));
});
test('备份读取所有座位图和关联图片，缺图时明确失败', () => {
  const p = project(); delete p.embeddedAssets;
  const api = require('../utils/seating/backup');
  const snapshot = api.capture({ list: () => [{id: 'p1'}], load: () => p }, ref => ref === p.assets.background ? 'YWJj' : '');
  assert.equal(snapshot[0].embeddedAssets[p.assets.background], 'YWJj');
  assert.throws(() => api.capture({ list: () => [{id: 'p1'}], load: () => p }, () => { throw Error('missing'); }), /图片/);
});
test('较大图片的 base64 校验不会耗尽正则调用栈', () => {
  const p = project(); p.embeddedAssets[p.assets.background] = 'YWJj'.repeat(700000);
  assert.equal(require('../utils/seating/backup').validate(p), true);
});
test('不同来源编号大小写冲突时不能覆盖项目文件', () => {
  const first = model.createProject('一', 'same'), second = model.createProject('二', 'SAME');
  first.embeddedAssets = {}; second.embeddedAssets = {};
  assert.throws(() => restore.buildChanges({ data: { seatingProjectsV1: [first, second] }, projects: [], images: {} }, ['seatingProjectsV1'], false, []), /冲突/);
});
test('恢复前图片解码失败必须终止并清理临时文件', async () => {
  const files = {}, status = {}, fs = {
    mkdirSync: () => {}, accessSync: () => {},
    writeFileSync: (p, v) => { files[p] = v; },
    readdirSync: root => Object.keys(files).filter(p => p.startsWith(root + '/')).map(p => p.slice(root.length + 1)),
    unlinkSync: p => { delete files[p]; }
  };
  const wx = { setStorageSync: (k, v) => { status[k] = v; }, removeStorageSync: k => { delete status[k]; }, getImageInfo: o => o.fail({}) };
  await assert.rejects(require('../utils/seating/backup').verifyAssets(wx, fs, '/data', [project()]), /图片/);
  assert.equal(Object.keys(files).length, 0);
});
test('座位图备份按项目编号合并，图片随选中的项目恢复', async () => {
  const local = model.createProject('本地', 'local'); local.embeddedAssets = {};
  const incoming = project();
  const payload = { data: { seatingProjectsV1: [incoming] }, projects: [], images: {} };
  const packed = await archive.pack(payload, {}), opened = await archive.open(packed, '');
  const planner = require('../utils/backup/plan');
  const plan = planner.preview({ data: { seatingProjectsV1: [local] }, projects: [], images: {} }, opened.payload);
  const merged = planner.resolve(plan, {}, {}, {});
  assert.deepEqual(merged.data.seatingProjectsV1.map(p => p.id), ['local', 'p1']);
  const changes = restore.buildChanges(merged, plan.importedKeys, false, []);
  assert.ok(changes.some(c => c.key === 'g:local.json'));
  assert.ok(changes.some(c => c.key === 'g:p1-background-image1.jpg'));
});
test('恢复时替换同项目图片，旧图片应在同一事务内清理', () => {
  const incoming = project(), previous = project();
  previous.assets.background = 'p1-background-old.jpg'; previous.embeddedAssets = {'p1-background-old.jpg':'YWJj'};
  const changes = restore.buildChanges({data:{seatingProjectsV1:[incoming]},projects:[],images:{}}, ['seatingProjectsV1'], false, [], [previous]);
  assert.ok(changes.some(c => c.key === 'g:p1-background-old.jpg' && c.remove === true));
});
test('备份不能把同一个人同时安排到桌旁和独立座位', async () => {
  const p = model.createProject('p','p1'), table = model.createTable('round','t1',{seatCount:1});
  p.tables.push(table); const person = model.addPeople(p,'甲')[0]; table.seats[0].personId = person.id;
  model.createFreeSeat(p,10,20).personId = person.id; p.embeddedAssets = {};
  await assert.rejects(archive.pack({data:{seatingProjectsV1:[p]},projects:[],images:{}},{}), /座位/);
});
test('可选择部分座位图分批备份，丢失的已选项目必须报错', () => {
  const a=model.createProject('a','a'),b=model.createProject('b','b'),map={a,b};
  const storage={list:()=>[{id:'a'},{id:'b'}],load:id=>map[id]}, api=require('../utils/seating/backup');
  assert.deepEqual(api.capture(storage,()=>'', ['b']).map(p=>p.id),['b']);
  assert.throws(()=>api.capture(storage,()=>'', ['missing']),/不存在/);
});
test('同项目图片文件名大小写冲突时拒绝备份', async () => {
  const p=project();p.assets.logo='p1-background-IMAGE1.jpg';p.embeddedAssets[p.assets.logo]='YWJj';
  await assert.rejects(archive.pack({data:{seatingProjectsV1:[p]},projects:[],images:{}},{}),/图片/);
});
test('拒绝损坏的场地标定和座位偏移数据', () => {
  const validate=require('../utils/seating/backup').validate;
  const p=model.createProject('p','p');p.embeddedAssets={};
  p.venue={widthMetres:20,heightMetres:null,unitsPerMetre:100};
  assert.throws(()=>validate(p),/场地/);
  model.setVenue(p,20,10);
  const table=model.createTable('rect','t',{seatCount:1});p.tables.push(table);
  table.seats[0].offsetX='invalid';assert.throws(()=>validate(p),/座位/);
});
