'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const model=require('../utils/seating/model');const hit=require('../utils/seating/hit');
test('常见场地元素可以添加，文字可以独立编辑',()=>{
  const p=model.createProject('p','p'),stage=model.createObject(p,'stage',10,20),label=model.createObject(p,'text',40,60,'舞台');
  assert.equal(stage.closed,true);assert.equal(label.text,'舞台');assert.equal(p.objects.length,2);
});
test('线条对象可以点选，空白位置不误选',()=>{
  const p=model.createProject('p','p'),wall=model.createObject(p,'wall',0,0);
  assert.deepEqual(hit.hitTest(p,50,1,1),{type:'object',objectId:wall.id});
  assert.equal(hit.hitTest(p,300,300,1),null);
});
test('墙壁是可点选的实心矩形障碍，门带有开启弧线',()=>{
  const p=model.createProject('p','p'),wall=model.createObject(p,'wall',0,0),door=model.createObject(p,'door',200,0);
  assert.equal(wall.closed,true);assert.equal(wall.fill,'#202020');assert.deepEqual(hit.hitTest(p,50,5,1),{type:'object',objectId:wall.id});
  const calls=[],ctx=new Proxy({}, {get(o,k){return(...args)=>calls.push([k,...args]);},set(){return true;}});
  require('../utils/seating/render').drawScene(ctx,p);assert.ok(calls.some(c=>c[0]==='arc'&&c[3]>0));assert.equal(door.kind,'door');
});
