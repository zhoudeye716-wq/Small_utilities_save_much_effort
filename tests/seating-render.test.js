'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');
const render = require('../utils/seating/render');

test('绘制场景时显示人员名字且不在未命名桌显示编辑编号', () => {
  const words = [], calls = [];
  const ctx = new Proxy({ fillText: t => words.push(t) }, { get(o, k) { if (k in o) return o[k]; return (...args) => calls.push([k, ...args]); }, set(o, k, v) { o[k] = v; return true; } });
  const project = model.createProject('场地', 'p');
  const table = model.createTable('round', 't', { seatCount: 1 });
  project.tables.push(table);
  const person = model.addPeople(project, '张三')[0]; table.seats[0].personId = person.id;
  render.drawScene(ctx, project);
  assert.ok(words.includes('张三'));
  assert.ok(!words.includes('1号桌'));
});

test('T 形桌按轮廓绘制，而不是画成长方形', () => {
  const calls = [];
  const ctx = new Proxy({}, { get(o, k) { return (...args) => calls.push([k, ...args]); }, set() { return true; } });
  const project = model.createProject('场地', 'p');
  project.tables.push(model.createTable('t', 't', { seatCount: 0 }));
  render.drawScene(ctx, project);
  assert.ok(calls.filter(c => c[0] === 'lineTo').length >= 7);
});

test('人员拖动经过目标座位时提供高亮', () => {
  const strokes = [];
  const ctx = new Proxy({}, { get(o, k) { return (...args) => { if (k === 'stroke') strokes.push(o.strokeStyle); }; }, set(o, k, v) { o[k] = v; return true; } });
  const project = model.createProject('场地', 'p'), table = model.createTable('rect', 't', { seatCount: 1 });
  project.tables.push(table);
  render.drawScene(ctx, project, { targetSeat: table.seats[0].id });
  assert.ok(strokes.includes('#f4a438'));
});
test('设置真实场地后，以统一比例画场地边界', () => {
  const calls = [];
  const ctx = new Proxy({}, { get(o, k) { return (...args) => calls.push([k, ...args]); }, set() { return true; } });
  const project = model.createProject('场地', 'p'); model.setVenue(project, 20, 10);
  render.drawScene(ctx, project);
  assert.ok(calls.some(c => c[0] === 'rect' && c[3] === 2000 && c[4] === 1000));
});
test('独立座位能显示已安排的人员', () => {
  const words = [], ctx = new Proxy({fillText: t => words.push(t)}, {get(o,k){return k in o?o[k]:()=>{};},set(o,k,v){o[k]=v;return true;}});
  const p = model.createProject('p','p'), seat = model.createFreeSeat(p,20,30); seat.personId = model.addPeople(p,'甲')[0].id;
  render.drawScene(ctx,p); assert.ok(words.includes('甲'));
});
test('所有桌面先绘制，座位和文字之后绘制避免被遮挡', () => {
  const fills=[],ctx=new Proxy({}, {get(o,k){if(k==='fill')return()=>fills.push(o.fillStyle);return()=>{};},set(o,k,v){o[k]=v;return true;}});
  const p=model.createProject('p','p');p.tables.push(model.createTable('rect','a',{seatCount:1}),model.createTable('rect','b',{seatCount:1}));
  render.drawScene(ctx,p);
  assert.deepEqual(fills.slice(0,2),['#e7ded0','#e7ded0']);
});
test('桌子和座位按相同角度旋转', () => {
  const rotations=[],ctx=new Proxy({}, {get(o,k){if(k==='rotate')return a=>rotations.push(a);return()=>{};},set(){return true;}});
  const p=model.createProject('p','p'),t=model.createTable('rect','t',{seatCount:1});t.rotation=90;p.tables.push(t);render.drawScene(ctx,p);
  assert.ok(rotations.filter(a=>Math.abs(a-Math.PI/2)<1e-10).length >= 2);
});
test('舞台与入口标注能在图上显示', () => {
  const words=[],ctx=new Proxy({fillText:t=>words.push(t)}, {get(o,k){return k in o?o[k]:()=>{};},set(o,k,v){o[k]=v;return true;}});
  const p=model.createProject('p','p');model.createObject(p,'stage',0,0);model.createObject(p,'entry',100,100);
  render.drawScene(ctx,p);assert.ok(words.includes('舞台'));assert.ok(words.includes('入口'));
});
test('座位默认绘制俯视椅子而非单一圆点', () => {
  const calls=[],ctx=new Proxy({}, {get(o,k){return(...args)=>calls.push([k,...args]);},set(){return true;}});
  const p=model.createProject('p','p');model.createFreeSeat(p,20,30);render.drawScene(ctx,p);
  assert.ok(calls.some(c=>c[0]==='rect'&&c[3]===14&&c[4]===10));
});
test('导出文字缩放同时应用到人名、桌名和场地文字', () => {
  const sizes=[],ctx=new Proxy({}, {get(o,k){return()=>{};},set(o,k,v){if(k==='font')sizes.push(v);o[k]=v;return true;}});
  const p=model.createProject('p','p'),t=model.createTable('rect','t',{seatCount:1});t.name='桌';p.tables.push(t);t.seats[0].personId=model.addPeople(p,'甲')[0].id;model.createObject(p,'text',0,0,'舞台');
  render.drawScene(ctx,p,{textScale:2});assert.ok(sizes.includes('24px sans-serif'));assert.ok(sizes.includes('28px sans-serif'));
});
test('渲染场地图时可按排版参数更改桌椅和文字配色', () => {
  const colors=[],ctx=new Proxy({}, {get(o,k){if(k==='fill')return()=>colors.push(o.fillStyle);return()=>{};},set(o,k,v){o[k]=v;return true;}});
  const p=model.createProject('p','p');p.tables.push(model.createTable('round','t',{seatCount:1}));
  render.drawScene(ctx,p,{palette:{table:'#123456',seat:'#abcdef',seatStroke:'#112233',tableStroke:'#334455',text:'#778899'}});
  assert.ok(colors.includes('#123456'));assert.ok(colors.includes('#abcdef'));
});
