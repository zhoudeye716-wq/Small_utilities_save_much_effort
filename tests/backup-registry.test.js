const test=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../utils/backup/registry');
test('备份功能统一注册类别、存储键和合并策略',()=>{
  assert.equal(registry.byKey('mahjongSessions').merge,'records');
  assert.equal(registry.byKey('mahjongPlayerLibrary').merge,'roster');
  assert.equal(registry.byKey('offlineTable').merge,'singleton');
  assert.equal(registry.byKey('mahjongGuideEnabled').shape,'boolean');
  assert.equal(registry.byKey('perler-calibrations-v1').shape,'array');
  assert.equal(registry.byKey('universal-timer-v1'),null);
  assert.equal(registry.categories.find(x=>x.id==='perler').projects,true);
});
test('新增数据类别不可重复注册存储键或使用未知合并策略',()=>{
  assert.throws(()=>registry.validate([{id:'a',fields:[{key:'x',merge:'singleton',shape:'object'}]},{id:'b',fields:[{key:'x',merge:'records',shape:'array'}]}]),/重复/);
  assert.throws(()=>registry.validate([{id:'a',fields:[{key:'x',merge:'unknown',shape:'array'}]}]),/策略/);
  assert.throws(()=>registry.validate([{id:'a',fields:[{key:'x',merge:'singleton',shape:'unknown'}]}]),/类型/);
});
