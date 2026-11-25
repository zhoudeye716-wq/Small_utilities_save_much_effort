'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const renderer = require('../utils/seating/export-render');
const model = require('../utils/seating/model');
test('每块基于相同的全图坐标绘制，相邻块只改变切片偏移', () => {
  function context() { const calls = []; return { calls, ctx: new Proxy({}, { get(o, k) { return (...args) => calls.push([k, ...args]); }, set() { return true; } }) }; }
  const a = context(), b = context(), p = model.createProject('p', 'p');
  const options = { width: 800, height: 400, bounds: { x: 0, y: 0, width: 100, height: 100 }, position: 0.5 };
  renderer.draw(a.ctx, p, {x:0,y:0,width:400,height:400}, options);
  renderer.draw(b.ctx, p, {x:400,y:0,width:400,height:400}, options);
  assert.ok(a.calls.some(x => x[0] === 'translate' && x[1] === 0 && x[2] === 0));
  assert.ok(b.calls.some(x => x[0] === 'translate' && x[1] === -400 && x[2] === 0));
  assert.deepEqual(a.calls.filter(x => x[0] === 'scale'), b.calls.filter(x => x[0] === 'scale'));
});
test('框选导出时裁剪场地区域，场外内容不会泄入留白', () => {
  const calls = [];
  const ctx = new Proxy({}, { get(o, k) { return (...args) => calls.push([k, ...args]); }, set() { return true; } });
  const p = model.createProject('p', 'p');
  renderer.draw(ctx, p, { x: 0, y: 0, width: 800, height: 400 }, { width: 800, height: 400, bounds: { x: 50, y: 50, width: 100, height: 100 }, position: 0.5 });
  assert.ok(calls.some(x => x[0] === 'clip'));
  assert.ok(calls.some(x => x[0] === 'rect' && x[1] === 200 && x[2] === 0 && x[3] === 400 && x[4] === 400));
});
test('选了背景与 Logo 时将它们绘制到导出图，并为名字添加描边', () => {
  const calls = [];
  const ctx = new Proxy({}, { get(o, k) { return (...args) => calls.push([k, ...args]); }, set() { return true; } });
  const p = model.createProject('p', 'p'), table = model.createTable('round', 't', { seatCount: 1 });
  p.tables.push(table); table.seats[0].personId = model.addPeople(p, '甲')[0].id;
  const bg = { width: 100, height: 80 }, logo = { width: 20, height: 20 };
  renderer.draw(ctx, p, {x:0,y:0,width:800,height:400}, {width:800,height:400,bounds:{x:0,y:0,width:200,height:200},backgroundImage:bg,logoImage:logo});
  assert.ok(calls.some(x => x[0] === 'drawImage' && x[1] === bg));
  assert.ok(calls.some(x => x[0] === 'drawImage' && x[1] === logo));
  assert.ok(calls.some(x => x[0] === 'strokeText' && x[1] === '甲'));
});
test('活动文字随场地在留白中排版', () => {
  const words=[],ctx=new Proxy({fillText:t=>words.push(t)}, {get(o,k){return k in o?o[k]:()=>{};},set(o,k,v){o[k]=v;return true;}});
  const p=model.createProject('p','p');
  const result=renderer.draw(ctx,p,{x:0,y:0,width:800,height:400},{width:800,height:400,bounds:{x:0,y:0,width:100,height:100},position:0,eventInfo:['公司聚会']});
  assert.equal(result.infoOverflow,false);assert.ok(words.includes('公司聚会'));
});
test('没有留白时 Logo 不覆盖场地图，并提示无法排版', () => {
  const calls=[],ctx=new Proxy({}, {get(o,k){return(...args)=>calls.push([k,...args]);},set(){return true;}}),p=model.createProject('p','p'),logo={width:20,height:20};
  const result=renderer.draw(ctx,p,{x:0,y:0,width:400,height:400},{width:400,height:400,bounds:{x:0,y:0,width:100,height:100},logoImage:logo});
  assert.equal(result.logoOverflow,true);assert.ok(!calls.some(c=>c[0]==='drawImage'&&c[1]===logo));
});
test('排版预设使用统一画布坐标绘制标题、场地图和装饰', () => {
  const words=[],calls=[],ctx=new Proxy({fillText:t=>words.push(t)}, {get(o,k){return k in o?o[k]:(...a)=>calls.push([k,...a]);},set(o,k,v){o[k]=v;return true;}}),p=model.createProject('p','p');
  const style=require('../utils/seating/style-model').preset('floral');
  const result=renderer.draw(ctx,p,{x:0,y:0,width:800,height:800},{width:800,height:800,bounds:{x:0,y:0,width:100,height:100},eventInfo:['聚会','星期六','宴会厅'],style:style});
  assert.ok(words.includes('聚会'));assert.ok(words.some(w=>w.includes('星期六')));assert.equal(result.infoOverflow,false);
  assert.ok(calls.some(c=>c[0]==='clip'));
});
test('花卉与水墨预设使用高清素材，分块时仍使用全图坐标', () => {
  const calls=[],ctx=new Proxy({}, {get(o,k){return (...a)=>calls.push([k,...a]);},set(){return true;}}),p=model.createProject('p','p');
  const asset={width:1312,height:1199},style=require('../utils/seating/style-model').preset('floral');
  renderer.draw(ctx,p,{x:400,y:0,width:400,height:800},{width:800,height:800,bounds:{x:0,y:0,width:100,height:100},style,styleImage:asset});
  assert.ok(calls.some(c=>c[0]==='translate'&&c[1]===-400));
  assert.ok(calls.filter(c=>c[0]==='drawImage'&&c[1]===asset).length>=1);
});
test('东方预设的右上竹枝使用独立素材而不是翻转山水', () => {
  const calls=[],ctx=new Proxy({}, {get(o,k){return (...a)=>calls.push([k,...a]);},set(){return true;}}),p=model.createProject('p','p');
  const landscape={width:1774,height:887},bamboo={width:1536,height:1024};
  renderer.draw(ctx,p,{x:0,y:0,width:800,height:1000},{width:800,height:1000,bounds:{x:0,y:0,width:100,height:100},style:require('../utils/seating/style-model').preset('oriental'),styleImage:landscape,styleAccent:bamboo});
  assert.equal(calls.filter(c=>c[0]==='drawImage'&&c[1]===landscape).length,1);
  assert.equal(calls.filter(c=>c[0]==='drawImage'&&c[1]===bamboo).length,1);
});
test('深色预设在自选图片上使用深色描边保护浅色标题与姓名', () => {
  const strokes=[],ctx=new Proxy({strokeText(text){strokes.push({text,fill:this.fillStyle,stroke:this.strokeStyle});}}, {get(o,k){return k in o?o[k]:()=>{};},set(o,k,v){o[k]=v;return true;}});
  const p=model.createProject('p','p'),t=model.createTable('round','t',{seatCount:1});p.tables.push(t);t.seats[0].personId=model.addPeople(p,'小王')[0].id;
  renderer.draw(ctx,p,{x:0,y:0,width:800,height:800},{width:800,height:800,bounds:{x:0,y:0,width:200,height:200},style:require('../utils/seating/style-model').preset('deco'),backgroundImage:{width:100,height:100},eventInfo:['年会','周末']});
  for(const text of ['年会','周末','小王']){const item=strokes.find(s=>s.text===text);assert.ok(item,text);assert.notEqual(item.stroke,'#fff',text);assert.notEqual(item.stroke,'#ffffff',text);}
});
test('装饰图片下没有自选背景时，导出标题和姓名仍有描边', () => {
  const strokes=[],ctx=new Proxy({strokeText(text){strokes.push(text);}}, {get(o,k){return k in o?o[k]:()=>{};},set(o,k,v){o[k]=v;return true;}});
  const p=model.createProject('p','p'),t=model.createTable('round','t',{seatCount:1});p.tables.push(t);t.seats[0].personId=model.addPeople(p,'小李')[0].id;
  renderer.draw(ctx,p,{x:0,y:0,width:800,height:800},{width:800,height:800,bounds:{x:0,y:0,width:200,height:200},style:require('../utils/seating/style-model').preset('oriental'),eventInfo:['聚会']});
  assert.ok(strokes.includes('聚会'));assert.ok(strokes.includes('小李'));
});
