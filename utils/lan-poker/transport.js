var protocol=require('./protocol.js');
var PORT=43220, BROADCAST='255.255.255.255', PEER_TTL=12000;
function Transport(options){
 this.id=options.id;this.name=options.name;this.createSocket=options.createSocket;
 this.onRooms=options.onRooms||function(){};this.onJoin=options.onJoin||function(){return true;};
 this.onRejected=options.onRejected||function(){};this.onMessage=options.onMessage||function(){};
 this.onState=options.onState||function(){};this.peers=Object.create(null);this.rooms=Object.create(null);this.status='idle';
}
Transport.prototype.open=function(port){
 var self=this,socket=this.createSocket();if(!socket||!socket.onMessage||!socket.onError)throw Error('UDP 不可用');
 this.socket=socket;socket.onMessage(function(event){self.receive(event);});socket.onError(function(event){self.status='error';self.onState({status:'error',error:event});});
 var bound=socket.bind(port);if(!bound)throw Error('UDP 绑定失败');this.port=bound;
};
Transport.prototype.send=function(packet,address,port){
 if(!this.socket)return false;try{this.socket.send({address:address,port:port,message:protocol.encode(Object.assign({},packet,{sender:this.id})),setBroadcast:address===BROADCAST});return true;}catch(e){return false;}
};
Transport.prototype.host=function(room){
 this.close();this.roomId=room.id;this.roomName=String(room.name||'房间').slice(0,32);this.password=String(room.password||'');this.ended=!!room.ended;
 try{this.open(PORT);if(room.onBound&&!room.onBound())throw Error('保存房间失败');}catch(e){this.close();throw e;}
 this.status='hosting';this.startTimer();this.onState({status:this.status});
};
Transport.prototype.search=function(){
 this.close();this.rooms=Object.create(null);this.open();this.status='searching';this.startTimer();this.discover();
};
Transport.prototype.discover=function(){this.send({type:'discover'},BROADCAST,PORT);};
Transport.prototype.probe=function(address){if(this.status!=='searching'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(String(address))||String(address).split('.').some(function(n){return Number(n)>255;}))return false;return this.send({type:'discover'},address,PORT);};
Transport.prototype.join=function(room,password){
 if(!this.socket)this.open();
 if(!((this.status==='joining'||this.status==='disconnected')&&this.roomId===room.id&&this.joinRequest))this.joinRequest=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 this.hostAddress=room.address;this.hostPort=room.port;this.hostId=room.hostId;this.roomId=room.id;this.password=String(password||'');this.status='joining';
 this.joinStarted=Date.now();this.lastJoin=this.joinStarted;
 this.send({type:'join',room:this.roomId,name:this.name,password:this.password,request:this.joinRequest},this.hostAddress,this.hostPort);
};
Transport.prototype.receive=function(event){
 var p=protocol.decode(event.message),remote=event.remoteInfo,now=Date.now(),self=this;
 if(!p||!remote||!p.sender||p.sender===this.id)return;
 if(p.type==='discover'&&this.status==='hosting')return void this.send({type:'advertise',room:this.roomId,name:this.roomName,passwordRequired:!!this.password,ended:this.ended},remote.address,remote.port);
 if(p.type==='advertise'&&this.status==='searching'&&typeof p.room==='string'&&!p.ended){
  this.rooms[p.room]={id:p.room,name:String(p.name||'房间').slice(0,32),hostId:p.sender,address:remote.address,port:remote.port,passwordRequired:!!p.passwordRequired};
  return void this.onRooms(Object.keys(this.rooms).map(function(id){return self.rooms[id];}));
 }
 if(p.type==='advertise'&&(this.status==='joining'||this.status==='disconnected')&&p.room===this.roomId&&p.sender===this.hostId){
  this.join({id:this.roomId,hostId:this.hostId,address:remote.address,port:remote.port},this.password);return;
 }
 if(p.type==='join'&&this.status==='hosting'&&p.room===this.roomId){
  if(typeof p.request!=='string'||!p.request||p.request.length>64)return;
  if(p.password!==this.password)return void this.send({type:'join-rejected',room:this.roomId,request:p.request,reason:'密码错误'},remote.address,remote.port);
  var peer={id:p.sender,name:String(p.name||'玩家').slice(0,24),address:remote.address,port:remote.port,seen:now,request:p.request};
  if(!this.onJoin(peer))return void this.send({type:'join-rejected',room:this.roomId,request:p.request,reason:'无法加入房间'},remote.address,remote.port);
  this.peers[p.sender]=peer;this.send({type:'welcome',room:this.roomId,request:p.request},remote.address,remote.port);this.onState({status:'hosting',peers:this.peers});return;
 }
 if(this.status==='joining'&&p.room===this.roomId&&p.sender===this.hostId&&remote.address===this.hostAddress&&remote.port===this.hostPort){
  if((p.type==='welcome'||p.type==='join-rejected')&&p.request!==this.joinRequest)return;
  if(p.type==='join-rejected'){this.status='searching';this.onRejected(p.reason);return;}
  if(p.type==='welcome'){this.status='joined';this.hostSeen=now;this.onState({status:this.status});return;}
 }
 if(p.room!==this.roomId)return;
 if(this.status==='hosting'){
  var peer=this.peers[p.sender];if(!peer||peer.address!==remote.address||peer.port!==remote.port)return;
  peer.seen=now;if(peer.offline){peer.offline=false;this.onState({status:'hosting',online:p.sender,peers:this.peers});}
  if(p.type==='heartbeat')return void this.send({type:'heartbeat',room:this.roomId},peer.address,peer.port);
  this.onMessage(p,peer);
 }else if(this.status==='joined'&&p.sender===this.hostId&&remote.address===this.hostAddress&&remote.port===this.hostPort){
  this.hostSeen=now;if(p.type!=='heartbeat')this.onMessage(p,{id:p.sender,address:remote.address,port:remote.port});
 }
};
Transport.prototype.startTimer=function(){var self=this;clearInterval(this.timer);this.timer=setInterval(function(){self.tick();},1000);};
Transport.prototype.tick=function(){
 var self=this,now=Date.now();if(this.status==='searching')this.discover();
 else if(this.status==='joined'){
  if(now-this.hostSeen>PEER_TTL){this.status='disconnected';this.joinRequest=null;this.onState({status:'disconnected'});}
  else this.send({type:'heartbeat',room:this.roomId},this.hostAddress,this.hostPort);
 }else if(this.status==='disconnected'){
  this.join({id:this.roomId,hostId:this.hostId,address:this.hostAddress,port:this.hostPort},this.password);
  if(this.status==='joining')this.discover();
 }else if(this.status==='joining'){
  if(now-this.joinStarted>5000){this.status='disconnected';this.onState({status:'disconnected'});}
  else if(now-this.lastJoin>=1000){this.lastJoin=now;this.send({type:'join',room:this.roomId,name:this.name,password:this.password,request:this.joinRequest},this.hostAddress,this.hostPort);this.discover();}
 }else if(this.status==='hosting')Object.keys(this.peers).forEach(function(id){var peer=self.peers[id];if(!peer.offline&&now-peer.seen>PEER_TTL){peer.offline=true;self.onState({status:'hosting',offline:id,peers:self.peers});}});
};
Transport.prototype.sendPeer=function(id,packet){var peer=this.peers[id];return !!peer&&this.send(Object.assign({},packet,{room:this.roomId}),peer.address,peer.port);};
Transport.prototype.sendHost=function(packet){return this.send(Object.assign({},packet,{room:this.roomId}),this.hostAddress,this.hostPort);};
Transport.prototype.close=function(){clearInterval(this.timer);this.timer=null;if(this.socket){try{this.socket.close();}catch(e){}}this.socket=null;this.peers=Object.create(null);this.status='idle';};
Transport.PORT=PORT;module.exports=Transport;
