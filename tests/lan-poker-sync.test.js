var test=require('node:test'), assert=require('node:assert/strict');
var sync=require('../utils/lan-poker/sync.js');

test('房主保存成功后才确认，重复操作不会再次扣筹码',function(){
  var saved=[], broadcasts=[];
  var host=sync.createHost({roomId:'room',state:{chips:100},revision:0,applied:{},
    persist:function(value){saved.push(JSON.parse(JSON.stringify(value)));return true;},
    apply:function(state,cmd){return {state:{chips:state.chips-cmd.amount}};},
    broadcast:function(snapshot){broadcasts.push(snapshot);}});
  var command={roomId:'room',playerId:'a',operationId:'1',baseRevision:0,amount:10};
  var first=host.execute(command), repeat=host.execute(command);
  assert.equal(first.ok,true);assert.equal(first.revision,1);assert.equal(repeat.revision,1);
  assert.equal(host.snapshot().state.chips,90);assert.equal(saved.length,1);assert.equal(broadcasts.length,1);
  assert.equal(saved[0].applied[JSON.stringify(['a','1'])].revision,1);
});

test('存储失败、过期命令和其他房间不能确认或修改状态',function(){
  var host=sync.createHost({roomId:'room',state:{chips:100},revision:0,applied:{},persist:function(){return false;},apply:function(s){return {state:{chips:s.chips-10}};}});
  assert.equal(host.execute({roomId:'room',playerId:'a',operationId:'1',baseRevision:0}).ok,false);
  assert.equal(host.snapshot().state.chips,100);
  assert.equal(host.execute({roomId:'old',playerId:'a',operationId:'2',baseRevision:0}).ok,false);
  assert.equal(host.execute({roomId:'room',playerId:'a',operationId:'2',baseRevision:3}).ok,false);
});
test('存储异常时不确认也不广播',function(){
  var broadcasts=0;
  var host=sync.createHost({roomId:'room',state:{chips:100},persist:function(){throw Error('disk');},apply:function(s){return {state:{chips:s.chips-10}};},broadcast:function(){broadcasts++;}});
  assert.equal(host.execute({roomId:'room',playerId:'a',operationId:'1',baseRevision:0}).ok,false);
  assert.equal(host.snapshot().state.chips,100);assert.equal(broadcasts,0);
});

test('客户端拒绝其他房间与旧快照',function(){
  var guest=sync.createGuest('room');
  assert.equal(guest.accept({roomId:'room',revision:2,state:{chips:90}}),true);
  assert.equal(guest.accept({roomId:'room',revision:1,state:{chips:100}}),false);
  assert.equal(guest.accept({roomId:'old',revision:3,state:{chips:80}}),false);
  assert.equal(guest.snapshot().state.chips,90);
});
test('不同玩家和操作编号不会发生去重键冲突',function(){
 var host=sync.createHost({roomId:'room',state:{count:0},persist:function(){return true;},apply:function(s){return {state:{count:s.count+1}};}});
 assert.equal(host.execute({roomId:'room',playerId:'a:b',operationId:'c',baseRevision:0}).ok,true);
 assert.equal(host.execute({roomId:'room',playerId:'a',operationId:'b:c',baseRevision:1}).revision,2);
 assert.equal(host.snapshot().state.count,2);
});
test('广播失败后操作仍有确定确认并可以幂等重试',function(){
 var host=sync.createHost({roomId:'room',state:{count:0},persist:function(){return true;},apply:function(s){return {state:{count:s.count+1}};},broadcast:function(){throw Error('offline');}});
 var command={roomId:'room',playerId:'a',operationId:'1',baseRevision:0};
 assert.equal(host.execute(command).ok,true);
 assert.equal(host.execute(command).revision,1);
 assert.equal(host.snapshot().state.count,1);
});
