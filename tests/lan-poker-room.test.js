var test=require('node:test'), assert=require('node:assert/strict');
var lobby=require('../utils/lan-poker/lobby.js');
function initial(){return lobby.create({roomId:'room',name:'朋友牌桌',hostId:'host',hostName:'阿明',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1}});}
test('房主无需指定人数，玩家选座冲突不能覆盖已有成员',function(){
 var state=initial();state=lobby.join(state,'p1','小王').state;state=lobby.chooseSeat(state,'p1',1).state;
 state=lobby.join(state,'p2','小李').state;assert.ok(lobby.chooseSeat(state,'p2',1).error);
 var started=lobby.start(state,'host');assert.equal(started.error,undefined);assert.equal(started.state.table.seats.length,2);
 assert.equal(started.state.table.seats[0].playerId,'host');assert.equal(started.state.table.seats[1].playerId,'p1');
});
test('开始后新玩家等待，同一身份重新加入保留旧筹码',function(){
 var state=initial();state=lobby.join(state,'p1','小王').state;state=lobby.chooseSeat(state,'p1',1).state;state=lobby.start(state,'host').state;
 var joined=lobby.join(state,'p2','新人').state;assert.equal(joined.players.find(function(p){return p.id==='p2';}).seat,null);
 var old=joined.players.find(function(p){return p.id==='p1';});old.stack=120;old.seat=null;
 var again=lobby.join(joined,'p1','小王').state;assert.equal(again.players.find(function(p){return p.id==='p1';}).stack,120);
});
test('中途加入可以先选择空座但只能等待小局结束',function(){
 var state=initial();state=lobby.join(state,'p1','小王').state;state=lobby.chooseSeat(state,'p1',1).state;state=lobby.start(state,'host').state;
 state=lobby.join(state,'p2','新人').state;
 var r=lobby.chooseSeat(state,'p2',2);assert.equal(r.error,undefined);
 assert.equal(r.state.players.find(function(p){return p.id==='p2';}).status,'waiting');assert.equal(r.state.table.seats.length,2);
});
