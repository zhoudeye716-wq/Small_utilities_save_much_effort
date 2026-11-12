function copy(value){return JSON.parse(JSON.stringify(value));}
function createHost(options){
  var current={roomId:options.roomId,revision:options.revision||0,state:copy(options.state),applied:copy(options.applied||{})};
  return {
    snapshot:function(){return copy(current);},
    execute:function(command){
      if(!command||command.roomId!==current.roomId||typeof command.playerId!=='string'||typeof command.operationId!=='string')return {ok:false,error:'无效操作'};
      var key=JSON.stringify([command.playerId,command.operationId]);
      if(Object.prototype.hasOwnProperty.call(current.applied,key))return copy(current.applied[key]);
      if(command.baseRevision!==current.revision)return {ok:false,error:'牌局已更新，请重试',revision:current.revision};
      var result=options.apply(copy(current.state),command);
      if(!result||result.error)return {ok:false,error:result&&result.error||'操作失败'};
      var next={roomId:current.roomId,revision:current.revision+1,state:result.state,applied:copy(current.applied)};
      var ack={ok:true,revision:next.revision};next.applied[key]=ack;
      try { if(!options.persist(copy(next)))return {ok:false,error:'保存失败，请检查设备存储'}; }
      catch(e) { return {ok:false,error:'保存失败，请检查设备存储'}; }
      current=next;
      if(options.broadcast)try{options.broadcast(copy(current));}catch(e){ /* 已保存的操作仍可通过后续同步恢复 */ }
      return copy(ack);
    }
  };
}
function createGuest(roomId){
  var current=null;
  return {accept:function(snapshot){
    if(!snapshot||snapshot.roomId!==roomId||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0||!snapshot.state)return false;
    if(current&&snapshot.revision<=current.revision)return false;
    current=copy(snapshot);return true;
  },snapshot:function(){return current?copy(current):null;}};
}
module.exports={createHost:createHost,createGuest:createGuest};
