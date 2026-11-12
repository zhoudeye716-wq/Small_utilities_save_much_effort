var test=require('node:test'),assert=require('node:assert/strict');
var Transport=require('../utils/lan-poker/transport.js');
function network(){
 var endpoints={},nextPort=45000;
 function socket(){var handler,error,port;return {bind:function(value){port=value||nextPort++;if(endpoints[port])throw Error('occupied');endpoints[port]=function(data,from){handler({message:data,remoteInfo:{address:'192.168.0.'+from,port:from}});};return port;},onMessage:function(cb){handler=cb;},onError:function(cb){error=cb;},send:function(o){if(o.setBroadcast){Object.keys(endpoints).forEach(function(p){if(Number(p)!==port)endpoints[p](o.message,port);});}else if(endpoints[o.port])endpoints[o.port](o.message,port);},close:function(){delete endpoints[port];}};}
 return {socket:socket};
}
test('房间发现和有密码加入，错误密码不会加入房间',function(){
 var net=network(),rooms=[],joined=[],rejected=[];
 var host=new Transport({id:'host',name:'房主',createSocket:net.socket,onJoin:function(p){joined.push(p);return true;}});
 var guest=new Transport({id:'guest',name:'小王',createSocket:net.socket,onRooms:function(r){rooms=r;},onRejected:function(x){rejected.push(x);}});
 try{
   host.host({id:'room',name:'朋友们',password:'1234'});guest.search();
   assert.equal(rooms[0].name,'朋友们');assert.equal(rooms[0].passwordRequired,true);
   guest.join(rooms[0],'wrong');assert.equal(joined.length,0);assert.equal(rejected.length,1);
   guest.join(rooms[0],'1234');assert.equal(joined.length,1);assert.equal(guest.status,'joined');
 }finally{host.close();guest.close();}
});
test('房主临时断线恢复后，成员重连保留相同房间',function(){
 var net=network(),rooms=[],now=1000,original=Date.now;Date.now=function(){return now;};
 var host=new Transport({id:'host',name:'房主',createSocket:net.socket});
 var guest=new Transport({id:'guest',name:'玩家',createSocket:net.socket,onRooms:function(r){rooms=r;}});
 try{
  host.host({id:'room',name:'牌桌'});guest.search();guest.join(rooms[0],'');assert.equal(guest.status,'joined');
  host.close();now+=13000;guest.tick();assert.equal(guest.status,'disconnected');
  host.host({id:'room',name:'牌桌'});now+=2000;guest.tick();assert.equal(guest.status,'joined');assert.equal(guest.roomId,'room');
 }finally{Date.now=original;host.close();guest.close();}
});
test('成员短暂恢复发送消息后，房主清除离线状态',function(){
 var net=network(),rooms=[],now=1000,original=Date.now;Date.now=function(){return now;};
 var host=new Transport({id:'host',name:'房主',createSocket:net.socket});
 var guest=new Transport({id:'guest',name:'玩家',createSocket:net.socket,onRooms:function(r){rooms=r;}});
 try{
  host.host({id:'room',name:'牌桌'});guest.search();guest.join(rooms[0],'');
  now+=13000;host.tick();assert.equal(host.peers.guest.offline,true);
  guest.sendHost({type:'heartbeat'});assert.equal(host.peers.guest.offline,false);
 }finally{Date.now=original;host.close();guest.close();}
});
test('搜索广播不可用时可以按房主地址查询房间',function(){
 var net=network(),rooms=[];
 var host=new Transport({id:'host',name:'房主',createSocket:net.socket});
 var guest=new Transport({id:'guest',name:'玩家',createSocket:net.socket,onRooms:function(r){rooms=r;}});
 try{host.host({id:'room',name:'牌桌'});guest.search();rooms=[];guest.probe('192.168.0.1');assert.equal(rooms[0].id,'room');}
 finally{host.close();guest.close();}
});
test('过期的加入回复不能确认新的加入请求',function(){
 var guest=new Transport({id:'guest',name:'玩家',createSocket:network().socket});
 guest.status='joining';guest.roomId='room';guest.hostId='host';guest.hostAddress='192.168.0.1';guest.hostPort=43220;guest.joinRequest='new';
 var protocol=require('../utils/lan-poker/protocol.js');
 guest.receive({message:protocol.encode({type:'welcome',sender:'host',room:'room',request:'old'}),remoteInfo:{address:'192.168.0.1',port:43220}});
 assert.equal(guest.status,'joining');guest.close();
});
test('连接超时且原 UDP 接口失效时换新接口并恢复房间',function(){
 var net=network(),rooms=[],made=0,dead=false,now=1000,original=Date.now;Date.now=function(){return now;};
 var host=new Transport({id:'host',name:'房主',createSocket:net.socket});
 var guest=new Transport({id:'guest',name:'玩家',onRooms:function(r){rooms=r;},createSocket:function(){
  var socket=net.socket(),number=++made,send=socket.send;socket.send=function(packet){if(number===1&&dead)return;send(packet);};return socket;
 }});
 try{host.host({id:'room',name:'牌桌'});guest.search();guest.join(rooms[0],'');assert.equal(guest.status,'joined');
  dead=true;now+=13000;guest.tick();assert.equal(guest.status,'disconnected');guest.tick();
  assert.equal(guest.status,'joined');assert.equal(made,2);assert.ok(host.peers.guest);
 }finally{Date.now=original;guest.close();host.close();}
});
test('成员 UDP 报错后仍可重建接口并重连',function(){
 var net=network(),rooms=[],errorCallback,made=0;
 var host=new Transport({id:'host',name:'房主',createSocket:net.socket});
 var guest=new Transport({id:'guest',name:'玩家',onRooms:function(r){rooms=r;},createSocket:function(){var socket=net.socket(),old=socket.onError;made++;socket.onError=function(cb){errorCallback=cb;old(cb);};return socket;}});
 try{host.host({id:'room',name:'牌桌'});guest.search();guest.join(rooms[0],'');errorCallback({errMsg:'socket closed'});
  assert.equal(guest.status,'disconnected');guest.tick();assert.equal(guest.status,'joined');assert.equal(made,2);
 }finally{guest.close();host.close();}
});
test('房间停止响应一段时间后从搜索列表移除',function(){
 var net=network(),rooms=[],now=1000,original=Date.now;Date.now=function(){return now;};
 var host=new Transport({id:'host',name:'房主',createSocket:net.socket});
 var guest=new Transport({id:'guest',name:'玩家',onRooms:function(r){rooms=r;},createSocket:net.socket});
 try{host.host({id:'room',name:'牌桌'});guest.search();assert.equal(rooms.length,1);
  host.close();now+=20000;guest.tick();assert.equal(rooms.length,0);
 }finally{Date.now=original;guest.close();host.close();}
});
test('反复发现房主但加入确认丢失时仍能触发重连超时',function(){
 var net=network(),rooms=[],now=1000,original=Date.now,protocol=require('../utils/lan-poker/protocol.js');Date.now=function(){return now;};
 var host=new Transport({id:'host',name:'房主',createSocket:function(){var socket=net.socket(),send=socket.send;socket.send=function(o){var p=protocol.decode(o.message);if(p&&p.type==='welcome')return;send(o);};return socket;}});
 var guest=new Transport({id:'guest',name:'玩家',onRooms:function(r){rooms=r;},createSocket:net.socket});
 try{host.host({id:'room',name:'牌桌'});guest.search();guest.join(rooms[0],'');
  for(var i=0;i<6;i++){now+=1000;guest.tick();}
  assert.equal(guest.status,'disconnected');
 }finally{Date.now=original;guest.close();host.close();}
});
test('重连时发现房主地址变化，更新目标但不重置超时',function(){
 var guest=new Transport({id:'guest',name:'玩家',createSocket:network().socket}),sent=[];
 guest.status='joining';guest.roomId='room';guest.hostId='host';guest.hostAddress='192.168.1.2';guest.hostPort=43220;guest.joinRequest='req';guest.joinStarted=123;
 guest.send=function(packet,address,port){sent.push({packet:packet,address:address,port:port});};
 var protocol=require('../utils/lan-poker/protocol.js');guest.receive({message:protocol.encode({type:'advertise',sender:'host',room:'room'}),remoteInfo:{address:'192.168.1.5',port:43220}});
 assert.equal(guest.hostAddress,'192.168.1.5');assert.equal(guest.joinStarted,123);assert.equal(sent[0].packet.request,'req');guest.close();
});
