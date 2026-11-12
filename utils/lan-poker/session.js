var Transport=require('./transport.js'),protocol=require('./protocol.js'),sync=require('./sync.js'),lobby=require('./lobby.js'),router=require('./router.js');
function id(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
function host(options){
 var transport, serial=0;
 var initial=options.snapshot||{roomId:options.roomId,revision:0,state:lobby.create({roomId:options.roomId,name:options.roomName,hostId:options.id,hostName:options.name,settings:options.settings}),applied:{}};
 function sendSnapshot(peer){var full=authority.snapshot(),snap={roomId:full.roomId,revision:full.revision,state:full.state};try{protocol.fragment(snap,id()).forEach(function(part){transport.sendPeer(peer,part);});}catch(e){if(options.onError)options.onError('同步数据过大或发送失败');}}
 function broadcast(){Object.keys(transport.peers).forEach(sendSnapshot);if(options.onState)options.onState(authority.snapshot().state);}
 var authority=sync.createHost({roomId:initial.roomId,revision:initial.revision,state:initial.state,applied:initial.applied,persist:options.persist,apply:router.apply,broadcast:broadcast});
 transport=new Transport({id:options.id,name:options.name,createSocket:options.createSocket,
  onJoin:function(peer){var s=authority.snapshot();if(s.state.ended)return s.state.players.some(function(p){return p.id===peer.id;});return authority.execute({roomId:s.roomId,playerId:peer.id,operationId:'join-'+peer.request,baseRevision:s.revision,type:'join',name:peer.name}).ok;},
  onState:function(status){if(status.status==='hosting')Object.keys(transport.peers).forEach(sendSnapshot);if(options.onConnection)options.onConnection(status);},
  onMessage:function(packet,peer){
   if(packet.type==='snapshot-request')return sendSnapshot(peer.id);
   if(packet.type==='operation'&&packet.command&&packet.command.playerId===peer.id){var result=authority.execute(packet.command);transport.sendPeer(peer.id,{type:'operation-ack',operationId:packet.command.operationId,result:result});if(!result.ok)sendSnapshot(peer.id);}
  }});
 transport.host({id:initial.roomId,name:initial.state.name,password:options.password,ended:initial.state.ended,onBound:function(){return options.persist(authority.snapshot());}});if(options.onState)options.onState(authority.snapshot().state);
 if(options.snapshot&&Array.isArray(initial.state.players))initial.state.players.forEach(function(p){if(p.id!==options.id&&p.status!=='left')transport.peers[p.id]={id:p.id,name:p.name,address:'',port:0,seen:Date.now(),offline:false};});
 return {command:function(type,data){
  if(type==='mark-left'){var peer=transport.peers[data&&data.targetPlayerId];if(!peer||!peer.offline)return {ok:false,error:'该玩家尚未离线'};}
  var s=authority.snapshot(), result=authority.execute(Object.assign({},data,{type:type,roomId:s.roomId,playerId:options.id,operationId:'host-'+(++serial)+'-'+id(),baseRevision:s.revision}));
  if(type==='dissolve'&&result.ok)transport.ended=true;
  return result;
 },tick:function(){transport.tick();},snapshot:function(){return authority.snapshot();},close:function(){transport.close();}};
}
function guest(options){
 var transport,receiver=protocol.createAssembler(),replica=null,pending=Object.create(null),serial=0,lastConfirmed=0;
 function sendPending(){Object.keys(pending).forEach(function(key){transport.sendHost({type:'operation',command:pending[key].command});});}
 transport=new Transport({id:options.id,name:options.name,createSocket:options.createSocket,onRooms:options.onRooms,onRejected:options.onRejected,
  onState:function(status){if(options.onConnection)options.onConnection(status);if(status.status==='joined')transport.sendHost({type:'snapshot-request'});},
  onMessage:function(packet){
   if(packet.type==='snapshot-part'){
    var snapshot=receiver.accept(packet);if(!snapshot)return;
    if(!replica)replica=sync.createGuest(snapshot.roomId);
    if(replica.accept(snapshot)){if(options.persist)options.persist(snapshot);if(options.onState)options.onState(snapshot.state);}
   }else if(packet.type==='operation-ack'&&pending[packet.operationId]){pending[packet.operationId].result=packet.result;if(packet.result&&packet.result.ok)lastConfirmed=Math.max(lastConfirmed,packet.result.revision||0);delete pending[packet.operationId];if(options.onResult)options.onResult(packet.result);}
  }});
 var retryTimer=setInterval(function(){if(transport.status==='joined'){sendPending();transport.sendHost({type:'snapshot-request'});}},2000);
 return {search:function(){transport.search();},refreshSearch:function(){if(transport.status==='searching')transport.discover();},probe:function(address){return transport.probe(address);},join:function(room,password){transport.join(room,password);},command:function(type,data){
  var snapshot=replica&&replica.snapshot();if(!snapshot)return {ok:false,error:'等待牌局同步'};
  if(snapshot.state.ended)return {ok:false,error:'房间已解散'};
  if(Object.keys(pending).length||snapshot.revision<lastConfirmed)return {ok:false,error:'等待上一操作确认和同步'};
  var operationId='guest-'+(++serial)+'-'+id(),cmd=Object.assign({},data,{type:type,roomId:snapshot.roomId,playerId:options.id,operationId:operationId,baseRevision:snapshot.revision});
  var item={command:cmd,result:null};pending[operationId]=item;transport.sendHost({type:'operation',command:cmd});return item.result||{pending:true};
 },retry:sendPending,resume:function(){transport.tick();if(transport.status==='disconnected')transport.tick();},snapshot:function(){return replica&&replica.snapshot();},close:function(){clearInterval(retryTimer);transport.close();}};
}
module.exports={host:host,guest:guest};
