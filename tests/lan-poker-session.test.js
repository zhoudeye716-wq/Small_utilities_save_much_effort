var test=require('node:test'),assert=require('node:assert/strict');
var Session=require('../utils/lan-poker/session.js');
function network(shouldDrop){var endpoints={},next=45000;return function(){var port,cb;return {bind:function(p){port=p||next++;endpoints[port]=function(msg,source){cb({message:msg,remoteInfo:{address:'ip'+source,port:source}});};return port;},onMessage:function(f){cb=f;},onError:function(){},send:function(p){if(shouldDrop&&shouldDrop(p))return;if(p.setBroadcast){Object.keys(endpoints).forEach(function(k){if(Number(k)!==port)endpoints[k](p.message,port);});}else if(endpoints[p.port])endpoints[p.port](p.message,port);},close:function(){delete endpoints[port];}};};}
test('房主建房、玩家选座与开始在双方同步，只有当前玩家能行动',function(){
 var socket=network(), found=[],hostState,guestState;
 var host=Session.host({id:'host',name:'房主',roomId:'room',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:socket,persist:function(){return true;},onState:function(s){hostState=s;}});
 var guest=Session.guest({id:'guest',name:'玩家',createSocket:socket,persist:function(){return true;},onRooms:function(r){found=r;},onState:function(s){guestState=s;}});
 try{
  guest.search();guest.join(found[0],'');assert.equal(guestState.players.length,2);
  guest.command('seat',{seat:1});assert.equal(hostState.players[1].seat,1);
  host.command('start',{});assert.equal(guestState.table.seats.length,2);
  assert.equal(guest.command('call',{}).ok,false);
  assert.equal(host.command('call',{}).ok,true);
  assert.equal(guestState.table.currentSeat,1);
 }finally{guest.close();host.close();}
});
test('玩家只接收牌局快照，操作去重记录仅保存在房主端',function(){
 var socket=network(),found=[];
 var host=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:socket,persist:function(){return true;}});
 var guest=Session.guest({id:'g',name:'玩家',createSocket:socket,persist:function(){return true;},onRooms:function(r){found=r;}});
 try{guest.search();guest.join(found[0],'');assert.ok(Object.keys(host.snapshot().applied).length);assert.equal(guest.snapshot().applied,undefined);}
 finally{guest.close();host.close();}
});
test('确认包丢失时保留操作，重发不会重复扣筹码',function(){
 var drop=false, protocol=require('../utils/lan-poker/protocol.js');
 var socket=network(function(packet){var p=protocol.decode(packet.message);return drop&&p&&p.type==='operation-ack';}),found=[];
 var host=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:socket,persist:function(){return true;}});
 var guest=Session.guest({id:'g',name:'玩家',createSocket:socket,persist:function(){return true;},onRooms:function(r){found=r;}});
 try{
  guest.search();guest.join(found[0],'');guest.command('seat',{seat:1});host.command('start',{});host.command('call',{});
  drop=true;assert.equal(guest.command('call',{}).pending,true);
  var after=host.snapshot().revision;assert.ok(guest.command('call',{}).error);
  drop=false;guest.retry();assert.equal(host.snapshot().revision,after);
 }finally{guest.close();host.close();}
});
test('确认包丢失且接口失效，重连重发不会重复扣筹码',function(){
 var protocol=require('../utils/lan-poker/protocol.js'),dropAck=false,dead=false,made=0,now=1000,realNow=Date.now;Date.now=function(){return now;};
 var socket=network(function(packet){var p=protocol.decode(packet.message);return dropAck&&p&&p.type==='operation-ack';}),found=[],results=[];
 var host=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:socket,persist:function(){return true;}});
 var guest=Session.guest({id:'g',name:'玩家',createSocket:function(){var s=socket(),number=++made,send=s.send;s.send=function(p){if(dead&&number===1)return;send(p);};return s;},persist:function(){return true;},onRooms:function(r){found=r;},onResult:function(r){results.push(r);}});
 try{guest.search();guest.join(found[0],'');guest.command('seat',{seat:1});host.command('start',{});host.command('call',{});
  dropAck=true;assert.equal(guest.command('call',{}).pending,true);var pot=host.snapshot().state.table.pot;
  dead=true;dropAck=false;now+=13000;guest.resume();guest.retry();
  assert.equal(made,2);assert.equal(host.snapshot().state.table.pot,pot);assert.equal(results[results.length-1].ok,true);
 }finally{Date.now=realNow;guest.close();host.close();}
});
test('新房间保存失败时不开放房间并释放端口',function(){
 var called=0,socket=network(),leaked;
 try { assert.throws(function(){leaked=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:function(){called++;return socket();},persist:function(){return false;}});});
 assert.equal(called,1);
 var ok=Session.host({id:'h',name:'房主',roomId:'r2',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:socket,persist:function(){return true;}});ok.close();
 } finally { if(leaked)leaked.close(); }
});
test('房主重启后恢复已确认的牌局并等待玩家重连',function(){
 var socket=network(),found=[],saved,now=1000,realNow=Date.now;Date.now=function(){return now;};
 var settings={smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1};
 var host=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:settings,createSocket:socket,persist:function(s){saved=JSON.parse(JSON.stringify(s));return true;}});
 var guest=Session.guest({id:'g',name:'玩家',createSocket:socket,persist:function(){return true;},onRooms:function(r){found=r;}});
 var restored;
 try{
  guest.search();guest.join(found[0],'');guest.command('seat',{seat:1});host.command('start',{});host.command('call',{});
  var rev=host.snapshot().revision;host.close();
  restored=Session.host({id:'h',name:'房主',snapshot:saved,createSocket:socket,persist:function(s){saved=JSON.parse(JSON.stringify(s));return true;}});
  assert.equal(restored.snapshot().revision,rev);
  now+=13000;guest.resume();assert.equal(guest.snapshot().roomId,'r');assert.ok(restored.snapshot().revision>rev);assert.equal(guest.snapshot().revision,restored.snapshot().revision);
 }finally{Date.now=realNow;guest.close();if(restored)restored.close();else host.close();}
});
test('房主解散后成员保留最后画面，但不能继续操作',function(){
 var socket=network(),found=[];
 var host=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:socket,persist:function(){return true;}});
 var guest=Session.guest({id:'g',name:'玩家',createSocket:socket,persist:function(){return true;},onRooms:function(r){found=r;}});
 try{guest.search();guest.join(found[0],'');guest.command('seat',{seat:1});host.command('start',{});
  assert.equal(host.command('dissolve',{}).ok,true);assert.equal(guest.snapshot().state.ended,true);
  assert.ok(guest.snapshot().state.table);assert.ok(guest.command('call',{}).error);
 }finally{guest.close();host.close();}
});
test('已解散的房间不会出现在新玩家搜索列表',function(){
 var socket=network(),found=[];
 var host=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:socket,persist:function(){return true;}});
 var guest=Session.guest({id:'g',name:'玩家',createSocket:socket,persist:function(){return true;},onRooms:function(r){found=r;}});
 try{host.command('dissolve',{});guest.search();assert.equal(found.length,0);}finally{guest.close();host.close();}
});
test('加入确认包丢失后重发不会重复产生加入操作',function(){
 var protocol=require('../utils/lan-poker/protocol.js'),drop=true,now=1000,realNow=Date.now;Date.now=function(){return now;};
 var socket=network(function(packet){var p=protocol.decode(packet.message);if(drop&&p&&p.type==='welcome'){drop=false;return true;}return false;}),found=[];
 var host=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:socket,persist:function(){return true;}});
 var guest=Session.guest({id:'g',name:'玩家',createSocket:socket,persist:function(){return true;},onRooms:function(r){found=r;}});
 try{guest.search();guest.join(found[0],'');var rev=host.snapshot().revision;now+=1100;guest.resume();assert.equal(host.snapshot().revision,rev);assert.ok(guest.snapshot());}
 finally{Date.now=realNow;guest.close();host.close();}
});
test('房主只能确认已经离线的玩家离场',function(){
 var socket=network(),found=[],now=1000,realNow=Date.now;Date.now=function(){return now;};
 var host=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:{smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},createSocket:socket,persist:function(){return true;}});
 var guest=Session.guest({id:'g',name:'玩家',createSocket:socket,persist:function(){return true;},onRooms:function(r){found=r;}});
 try{guest.search();guest.join(found[0],'');guest.command('seat',{seat:1});host.command('start',{});
 assert.ok(host.command('mark-left',{targetPlayerId:'g'}).error);
 guest.close();now+=13000;host.tick();assert.equal(host.command('mark-left',{targetPlayerId:'g'}).ok,true);
 }finally{Date.now=realNow;guest.close();host.close();}
});
test('房主恢复房间后未回来的玩家超时仍可标记离场',function(){
 var socket=network(),found=[],saved,now=1000,realNow=Date.now;Date.now=function(){return now;};
 var cfg={smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1};
 var host=Session.host({id:'h',name:'房主',roomId:'r',roomName:'测试',settings:cfg,createSocket:socket,persist:function(s){saved=JSON.parse(JSON.stringify(s));return true;}});
 var guest=Session.guest({id:'g',name:'玩家',createSocket:socket,persist:function(){return true;},onRooms:function(r){found=r;}});var restored;
 try{guest.search();guest.join(found[0],'');guest.command('seat',{seat:1});host.command('start',{});guest.close();host.close();
 restored=Session.host({id:'h',name:'房主',snapshot:saved,createSocket:socket,persist:function(){return true;}});
 assert.ok(restored.command('mark-left',{targetPlayerId:'g'}).error);now+=13000;restored.tick();
 assert.equal(restored.command('mark-left',{targetPlayerId:'g'}).ok,true);
 }finally{Date.now=realNow;guest.close();if(restored)restored.close();else host.close();}
});
