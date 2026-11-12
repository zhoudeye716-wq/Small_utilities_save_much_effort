var engine=require('../offline-table.js');
function apply(state,command){
  if(!state||!state.table||!command)return {error:'牌局不存在'};
  var table=state.table, seat=table.seats[table.currentSeat], result;
  var restricted=['dealer','topup','settle'];
  if(restricted.indexOf(command.type)>=0 && command.playerId!==state.hostId)return {error:'只有房主可以执行此操作'};
  if(['bet','call','fold'].indexOf(command.type)>=0){
    if(!seat||seat.playerId!==command.playerId)return {error:'还没轮到你'};
    if(command.type==='bet'){
      result=engine.applyAction(table,{type:'add',amount:command.amount});
      if(!result.error)result=engine.applyAction(result.state,{type:'next'});
    }else result=engine.applyAction(table,{type:command.type==='call'?'next':'fold'});
  }else if(command.type==='dealer'){
    if(!engine.canChangeDealer(table))return {error:'当前不能更换庄家'};
    if(!Number.isInteger(command.seat)||command.seat<0||command.seat>=table.seats.length)return {error:'无效的座位'};
    result={state:engine.setDealer(table,command.seat)};
  }else if(command.type==='topup') result=engine.addChips(table,command.seat,command.amount);
  else if(command.type==='settle')result=engine.settlePots(table,command.selections);
  else return {error:'无效操作'};
  if(result.error)return {error:result.error};
  var players=Array.isArray(state.players)?state.players.map(function(player){
    var current=result.state.seats.find(function(s){return s.playerId===player.id;});
    return current?Object.assign({},player,{stack:current.stack,buyIn:current.buyIn}):player;
  }):state.players;
  return {state:Object.assign({},state,{table:result.state,players:players})};
}
module.exports={apply:apply};
