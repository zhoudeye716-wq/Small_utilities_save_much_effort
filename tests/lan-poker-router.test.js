var test=require('node:test'),assert=require('node:assert/strict');
var lobby=require('../utils/lan-poker/lobby.js'), router=require('../utils/lan-poker/router.js');
function room(){return lobby.create({roomId:'room',name:'测试',hostId:'host',hostName:'房主',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1}});}
test('座位选择与开始由房主状态记录，玩家不能冒充房主开始',function(){
 var g=room();g=router.apply(g,{type:'join',playerId:'p1',name:'玩家'}).state;
 g=router.apply(g,{type:'seat',playerId:'p1',seat:1}).state;
 assert.ok(router.apply(g,{type:'start',playerId:'p1'}).error);
 var r=router.apply(g,{type:'start',playerId:'host'});assert.equal(r.state.table.seats.length,2);
});
test('尚未加入房间的身份不能选座或行动',function(){
 var g=room();assert.ok(router.apply(g,{type:'seat',playerId:'unknown',seat:2}).error);
 assert.ok(router.apply(g,{type:'bet',playerId:'unknown',amount:5}).error);
});
test('中途加入的玩家在本小局结算后加入新一局',function(){
 var g=room();g=router.apply(g,{type:'join',playerId:'p1',name:'玩家'}).state;
 g=router.apply(g,{type:'seat',playerId:'p1',seat:1}).state;g=router.apply(g,{type:'start',playerId:'host'}).state;
 g=router.apply(g,{type:'join',playerId:'p2',name:'新人'}).state;g=router.apply(g,{type:'seat',playerId:'p2',seat:2}).state;
 assert.equal(g.table.seats.length,2);
 var r=router.apply(g,{type:'fold',playerId:'host'});
 assert.equal(r.error,undefined);assert.equal(r.state.table.seats.length,3);
 assert.equal(r.state.table.seats[2].playerId,'p2');
});
test('非当前玩家离开即弃牌但底池不动，同房间回来保留筹码并等待',function(){
 var g=room();['p1','p2'].forEach(function(id,i){g=router.apply(g,{type:'join',playerId:id,name:id}).state;g=router.apply(g,{type:'seat',playerId:id,seat:i+1}).state;});
 g=router.apply(g,{type:'start',playerId:'host'}).state;
 var oldPot=g.table.pot, oldSeat=g.table.currentSeat;
 var r=router.apply(g,{type:'leave',playerId:'p2'});assert.equal(r.error,undefined);
 assert.equal(r.state.table.seats[2].folded,true);assert.equal(r.state.table.pot,oldPot);assert.equal(r.state.table.currentSeat,oldSeat);
 var balance=r.state.players.find(function(p){return p.id==='p2';}).stack;
 var back=router.apply(r.state,{type:'join',playerId:'p2',name:'p2'}).state;
 assert.equal(back.players.find(function(p){return p.id==='p2';}).stack,balance);
 assert.equal(back.players.find(function(p){return p.id==='p2';}).status,'waiting');
});
test('离场玩家保留盈亏，新玩家等小局结束后入座',function(){
 var settlement=require('../utils/poker-settlement.js'),g=room();
 ['p1','p2'].forEach(function(id,i){g=router.apply(g,{type:'join',playerId:id,name:id}).state;g=router.apply(g,{type:'seat',playerId:id,seat:i+1}).state;});
 g=router.apply(g,{type:'start',playerId:'host'}).state;g=router.apply(g,{type:'leave',playerId:'p2'}).state;
 g=router.apply(g,{type:'join',playerId:'p3',name:'p3'}).state;g=router.apply(g,{type:'seat',playerId:'p3',seat:2}).state;
 g=router.apply(g,{type:'fold',playerId:'host'}).state;
 assert.deepEqual(g.table.seats.map(function(s){return s.playerId;}),['host','p1','p3']);
 var preview=settlement.summarize(g.table,g.players);assert.equal(preview.valid,true);
 assert.equal(preview.players.find(function(p){return p.id==='p2';}).chips,-1); // 未被跟注的 1 筹码退回
 assert.equal(preview.players.reduce(function(n,p){return n+p.cents;},0),0);
});
test('两人对局一人离场后等待，另一人入座才开始下一小局',function(){
 var g=room();g=router.apply(g,{type:'join',playerId:'p1',name:'玩家'}).state;g=router.apply(g,{type:'seat',playerId:'p1',seat:1}).state;g=router.apply(g,{type:'start',playerId:'host'}).state;
 g=router.apply(g,{type:'leave',playerId:'p1'}).state;
 assert.equal(g.table.stage,'waiting');assert.equal(g.table.seats.length,1);assert.equal(g.table.pot,0);
 g=router.apply(g,{type:'join',playerId:'p2',name:'新人'}).state;g=router.apply(g,{type:'seat',playerId:'p2',seat:1}).state;
 assert.equal(g.table.stage,'preflop');assert.equal(g.table.seats.length,2);assert.equal(g.table.seats[1].playerId,'p2');
});
test('中途主动离场后返回时保留空座并等待下一小局',function(){
 var g=room();['p1','p2'].forEach(function(id,i){g=router.apply(g,{type:'join',playerId:id,name:id}).state;g=router.apply(g,{type:'seat',playerId:id,seat:i+1}).state;});
 g=router.apply(g,{type:'start',playerId:'host'}).state;g=router.apply(g,{type:'leave',playerId:'p2'}).state;
 g=router.apply(g,{type:'join',playerId:'p2',name:'p2'}).state;
 var p=g.players.find(function(x){return x.id==='p2';});assert.equal(p.seat,2);assert.equal(p.status,'waiting');
 g=router.apply(g,{type:'fold',playerId:'host'}).state;
 assert.equal(g.players.find(function(x){return x.id==='p2';}).status,'seated');
 assert.equal(g.table.seats.find(function(x){return x.playerId==='p2';}).folded,false);
});
