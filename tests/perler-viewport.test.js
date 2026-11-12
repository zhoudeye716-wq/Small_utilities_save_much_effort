const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../utils/perler/viewport');

test('缩放以手指中心为锚，锁定比例时拒绝缩放', () => {
  let s = v.createViewport({scale:10,x:20,y:30});
  s = v.zoom(s,20,70,80);
  assert.deepEqual([s.scale,s.x,s.y],[20,-30,-20]);
  assert.equal(v.zoom({...s,scaleLocked:true},30,70,80).scale,20);
});
test('位置和比例锁定互不影响', () => {
  let s = v.createViewport({scale:10,x:20,y:30,positionLocked:true});
  assert.deepEqual([v.pan(s,10,10).x,v.pan(s,10,10).y],[20,30]);
  s = v.zoom(s,20,70,80);
  assert.deepEqual([s.scale,s.x,s.y],[20,20,30]);
  assert.equal(v.pan({...s,positionLocked:false,scaleLocked:true},5,-3).x,25);
});
test('校准微调确认后锁定，取消恢复进入前全部视口', () => {
  const s = v.createViewport({scale:20,x:10,y:15,scaleLocked:true});
  let editing = v.beginCalibration(s);
  editing = v.adjustCalibration(editing,100,30,35);
  assert.ok(editing.scale > 20 && editing.scale < 22);
  assert.equal(v.cancelCalibration(editing).scale,20);
  assert.deepEqual([v.cancelCalibration(editing).x,v.cancelCalibration(editing).y],[10,15]);
  assert.equal(v.confirmCalibration(editing).scale,editing.scale);
  assert.equal(v.confirmCalibration(editing).scaleLocked,true);
});
test('配置可新增、覆盖并锁定应用，原配置数组不被修改', () => {
  const original = [];
  const a = v.saveProfile(original,{id:'a',name:'2.6 mm',scale:16},{overwrite:false});
  const b = v.saveProfile(a,{id:'b',name:'5 mm',scale:25},{overwrite:false});
  const c = v.saveProfile(b,{id:'a',name:'修正',scale:17},{overwrite:true});
  assert.equal(original.length,0); assert.equal(b[0].scale,16); assert.equal(c[0].scale,17);
  assert.throws(() => v.saveProfile(c,{id:'a',name:'重复',scale:18},{overwrite:false}));
  const applied = v.applyProfile(v.createViewport({scale:10}),c[0],0,0);
  assert.equal(applied.scale,17); assert.equal(applied.scaleLocked,true);
});
test('旋转大小变化不会改变已锁定的单格尺寸', () => {
  const state = v.createViewport({scale:18,scaleLocked:true,x:2,y:3});
  assert.equal(v.resize(state,800,400).scale,18);
  assert.equal(v.resize(state,400,800).scale,18);
});
test('异常缩放和比例配置不会破坏视口或已有配置', () => {
  const s = v.createViewport({scale:20});
  assert.throws(() => v.zoom(s,NaN,0,0));
  assert.throws(() => v.saveProfile([],{id:'x',name:'  ',scale:20},{overwrite:false}));
  assert.throws(() => v.saveProfile([],{id:'x',name:'too large',scale:10000},{overwrite:false}));
  assert.equal(s.scale,20);
});
