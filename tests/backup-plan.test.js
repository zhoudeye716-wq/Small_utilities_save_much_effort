const test=require('node:test');
const assert=require('node:assert/strict');
const plan=require('../utils/backup/plan');
const empty={data:{},projects:[],images:{}};
test('按记录而不是整个类别识别新增、重复和冲突',()=>{
  const local={...empty,data:{savedSignboards:[{id:'a',name:'旧'},{id:'b',name:'保留'}]}};
  const backup={...empty,data:{savedSignboards:[{id:'a',name:'新'},{id:'c',name:'新增'}]}};
  const preview=plan.preview(local,backup);
  assert.equal(preview.conflicts.length,1);assert.equal(preview.conflicts[0].id,'savedSignboards:a');
  const result=plan.resolve(preview,{'savedSignboards:a':'backup'});
  assert.deepEqual(result.data.savedSignboards.map(x=>x.name),['新','保留','新增']);
});
test('麻将玩家组合按各自身份合并，检测同名或无效组合',()=>{
  const local={...empty,data:{mahjongPlayerLibrary:{version:2,players:[{id:'a',name:'小王',groupId:''}],groups:[]}}};
  const backup={...empty,data:{mahjongPlayerLibrary:{version:2,players:[{id:'b',name:'小王',groupId:''}],groups:[]}}};
  const preview=plan.preview(local,backup);
  assert.throws(()=>plan.resolve(preview,{}),/同名/);
  const renamed=plan.resolve(preview,{}, {b:{name:'小王2'}});
  assert.deepEqual(renamed.data.mahjongPlayerLibrary.players.map(p=>p.name),['小王','小王2']);
  const removed=plan.resolve(preview,{}, {b:{archive:true}});
  assert.equal(removed.data.mahjongPlayerLibrary.players[1].archived,true);
  assert.equal(removed.data.mahjongPlayerLibrary.players[1].id,'b');
  try {plan.resolve(preview,{});assert.fail('expected');} catch(e) {assert.equal(e.issues[0].type,'duplicate-name');}
});
test('用户未选择的本地类别不应被删除，空的本地类别可导入',()=>{
  const local={...empty,data:{offlineSettings:{a:1}}};
  const backup={...empty,data:{'guess-size-current-v1':{a:1},savedSignboards:[{id:'x',name:'a'}]}};
  const p=plan.preview(local,backup);const result=plan.resolve(p,{});
  assert.deepEqual(result.data.offlineSettings,{a:1});
  assert.equal(result.data.savedSignboards.length,1);
});
test('导入局域网访客快照不会在打开页面时自动连接',()=>{
  const backup={...empty,data:{lanPokerRecentV1:{role:'guest',identity:{id:'g'},snapshot:{roomId:'r'}}}};
  const result=plan.resolve(plan.preview(empty,backup),{});
  assert.equal(result.data.lanPokerRecentV1.left,true);
  assert.equal(result.data.lanPokerRecentV1.snapshot.roomId,'r');
});
