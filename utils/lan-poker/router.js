var lobby=require('./lobby.js'), actions=require('./actions.js'), engine=require('../offline-table.js');
function apply(state,command){
 if(!state||!command||!command.playerId)return {error:'操作无效'};
 if(state.ended)return {error:'房间已解散'};
 if(command.type==='dissolve'){
  if(command.playerId!==state.hostId)return {error:'只有房主可以解散房间'};
  return {state:Object.assign({},state,{ended:true})};
 }
 if(command.type==='join'){
  var joined=lobby.join(state,command.playerId,command.name);
  if(!joined.error&&joined.state.table&&joined.state.table.stage==='waiting')joined.state=lobby.reconcile(joined.state);
  return joined;
 }
 if(!state.players.some(function(p){return p.id===command.playerId;}))return {error:'玩家未加入房间'};
 if(command.type==='seat'){
  var selection=lobby.chooseSeat(state,command.playerId,command.seat);
  if(!selection.error&&state.table&&state.table.stage==='waiting')selection.state=lobby.reconcile(selection.state);
  return selection;
 }
 if(command.type==='start')return lobby.start(state,command.playerId);
 if(command.type==='leave'||command.type==='mark-left'){
  if(command.type==='mark-left'&&command.playerId!==state.hostId)return {error:'只有房主可以确认离场'};
  var target=command.type==='leave'?command.playerId:command.targetPlayerId;
  if(target===state.hostId)return {error:'房主退出需要解散房间'};
  var next=JSON.parse(JSON.stringify(state)),player=next.players.find(function(p){return p.id===target;});
  if(!player)return {error:'玩家不存在'};
  var table=next.table,index=table?table.seats.findIndex(function(s){return s.playerId===target;}):-1;
  if(index>=0&&!table.seats[index].folded&&table.stage!=='waiting'){
   var left=engine.leaveSeat(table,index);if(left.error)return {error:left.error};next.table=left.state;
   next.table.seats.forEach(function(s){var p=next.players.find(function(x){return x.id===s.playerId;});if(p){p.stack=s.stack;p.buyIn=s.buyIn;}});
  }
  player.priorSeat=player.seat;player.seat=null;player.status='left';
  if(table&&next.table.handNumber!==table.handNumber)next=lobby.reconcile(next);
  return {state:next};
 }
 if(!state.table)return {error:'牌局尚未开始'};
 var result=actions.apply(state,command);
 if(!result.error&&result.state.table.handNumber!==state.table.handNumber)result.state=lobby.reconcile(result.state);
 return result;
}
module.exports={apply:apply};
