var test=require('node:test'), assert=require('node:assert/strict');
var engine=require('../utils/offline-table.js'), actions=require('../utils/lan-poker/actions.js');
function game(){var t=engine.createTable({players:3,smallBlind:1,bigBlind:2,totalChips:100});t.seats.forEach(function(s,i){s.playerId='p'+i;});return {hostId:'p0',table:t};}
test('只有当前玩家能下注，房主不能代替玩家行动',function(){
 var g=game();assert.equal(g.table.currentSeat,0);
 assert.ok(actions.apply(g,{playerId:'p1',type:'call'}).error);
 var r=actions.apply(g,{playerId:'p0',type:'bet',amount:5});
 assert.equal(r.error,undefined);assert.equal(r.state.table.pot,8);assert.equal(r.state.table.currentSeat,1);assert.equal(g.table.pot,3);
});
test('只有房主可以补筹、更换庄家及分配赢家',function(){
 var g=game();assert.ok(actions.apply(g,{playerId:'p1',type:'dealer',seat:2}).error);
 assert.ok(actions.apply(g,{playerId:'p1',type:'topup',seat:1,amount:5}).error);
 assert.ok(actions.apply(g,{playerId:'p1',type:'settle',selections:[]}).error);
 var r=actions.apply(g,{playerId:'p0',type:'topup',seat:1,amount:5});
 assert.equal(r.state.table.seats[1].buyIn,105);
});
test('成员账本随牌桌变化，补筹后保持相同累计投入',function(){
 var g=game();g.players=g.table.seats.map(function(s){return {id:s.playerId,stack:s.stack,buyIn:s.buyIn};});
 var r=actions.apply(g,{playerId:'p0',type:'topup',seat:1,amount:5});
 assert.equal(r.state.players[1].buyIn,105);
 assert.equal(r.state.players[1].stack,r.state.table.seats[1].stack);
});
