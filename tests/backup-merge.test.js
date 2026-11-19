const test = require('node:test');
const assert = require('node:assert/strict');
const { preview, resolve, validateRoster } = require('../utils/backup/merge');

test('只按身份判断冲突，不因同名合并不同玩家', () => {
  const old=[{id:'a',name:'小王'},{id:'b',name:'小李'}];
  const incoming=[{id:'a',name:'新名字'},{id:'c',name:'小王'}];
  const plan=preview(old,incoming);
  assert.deepEqual(plan.conflicts.map(x=>x.id),['a']);
  assert.deepEqual(plan.added.map(x=>x.id),['c']);
  assert.deepEqual(resolve(plan,{a:'backup'}).map(x=>x.id),['a','b','c']);
  assert.equal(resolve(plan,{a:'backup'})[0].name,'新名字');
  assert.equal(resolve(plan,{a:'local'})[0].name,'小王');
});

test('对象属性顺序不同的相同记录跳过，重复导入不产生副本', () => {
  const plan=preview([{id:'a',info:{a:1,b:2}}],[{info:{b:2,a:1},id:'a'}]);
  assert.equal(plan.skipped.length,1);
  assert.equal(resolve(plan,{}).length,1);
});

test('重复身份和未作出的冲突选择都应拒绝，原数据不变', () => {
  assert.throws(()=>preview([],[{id:'a'},{id:'a'}]),/重复/);
  const local=[{id:'a',name:'本地'}],incoming=[{id:'a',name:'备份'}];
  const plan=preview(local,incoming);
  assert.throws(()=>resolve(plan,{}),/选择/);
  assert.equal(local[0].name,'本地');
});

test('合并玩家库后检查组合引用及不同身份的同名玩家', () => {
  const library={version:2,players:[{id:'p1',name:'小王',groupId:'g1'},{id:'p2',name:'小王',groupId:''}],groups:[{id:'g1',name:'一起'}]};
  assert.deepEqual(validateRoster(library),[{type:'duplicate-name',name:'小王',ids:['p1','p2']}]);
  library.players[1].name='小李';library.players[1].groupId='missing';
  assert.deepEqual(validateRoster(library),[{type:'missing-group',playerId:'p2',groupId:'missing'}]);
});

test('同名不同身份的组合须交给用户处理',()=>{
  const library={version:2,players:[],groups:[{id:'g1',name:'朋友'},{id:'g2',name:'朋友'}]};
  assert.deepEqual(validateRoster(library),[{type:'duplicate-group-name',name:'朋友',ids:['g1','g2']}]);
});
