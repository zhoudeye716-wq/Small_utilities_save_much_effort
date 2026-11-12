var test=require('node:test'),assert=require('node:assert/strict');
var context=require('../utils/lan-poker/context.js');
function env(){var values={},callbacks={},counter=45000;return {getStorageSync:function(k){return values[k];},setStorageSync:function(k,v){values[k]=JSON.parse(JSON.stringify(v));},createUDPSocket:function(){var p,cb;return {bind:function(x){p=x||counter++;callbacks[p]=function(msg,source){cb({message:msg,remoteInfo:{address:'ip'+source,port:source}});};return p;},onMessage:function(f){cb=f;},onError:function(){},send:function(packet){if(packet.setBroadcast)Object.keys(callbacks).forEach(function(k){if(Number(k)!==p)callbacks[k](packet.message,p);});else if(callbacks[packet.port])callbacks[packet.port](packet.message,p);},close:function(){delete callbacks[p];}};}};}
test('创建和加入房间只影响联机存档，订阅者能收到最新状态',function(){
 var wx=env(), settings={smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},rooms=[],last;
 wx.setStorageSync('offlineTable',{example:'本地'});
 var host=context.createHost(wx,{id:'h',name:'房主',roomId:'r',roomName:'测试',settings:settings});
 var guest=context.createGuest(wx,{id:'g',name:'玩家',onRooms:function(r){rooms=r;}});
 try{guest.subscribe(function(s){last=s;});guest.search();guest.join(rooms[0],'');assert.equal(last.players.length,2);assert.equal(wx.getStorageSync('offlineTable').example,'本地');}
 finally{guest.close();host.close();}
});
test('房主确认解散后成员仍能查看最后状态',function(){
 var wx=env(),rooms=[],nav=0;wx.showModal=function(o){o.success({confirm:true});};wx.navigateBack=function(){nav++;};
 var settings={smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1};
 var host=context.createHost(wx,{id:'h',name:'房主',roomId:'r',roomName:'测试',settings:settings});
 var guest=context.createGuest(wx,{id:'g',name:'玩家',onRooms:function(r){rooms=r;}});
 try{guest.search();guest.join(rooms[0],'');guest.command('seat',{seat:1});host.command('start',{});
  host.leave(1);assert.equal(guest.state.ended,true);assert.ok(guest.state.table);assert.equal(nav,1);
  guest.leave(1);assert.equal(nav,2);
 }finally{guest.close();host.close();}
});
test('房主离线时玩家可以退出本机页面并保留需房主确认离场的提示',function(){
 var wx=env(),rooms=[],modal,nav=0;wx.showModal=function(o){modal=o;o.success({confirm:true});};wx.navigateBack=function(){nav++;};
 var settings={smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1};
 var host=context.createHost(wx,{id:'h',name:'房主',roomId:'r',roomName:'测试',settings:settings});
 var guest=context.createGuest(wx,{id:'g',name:'玩家',onRooms:function(r){rooms=r;}});
 try{guest.search();guest.join(rooms[0],'');host.close();guest.connection='disconnected';guest.leave(1);
 assert.match(modal.content,/房主/);assert.equal(nav,1);assert.equal(wx.getStorageSync('lanPokerRecentV1').left,true);}
 finally{guest.close();host.close();}
});
test('搜索期间立即收到并加入房间时不覆盖已连接状态',function(){
 var wx=env(),settings={smallBlind:1,bigBlind:2,totalChips:100,unitPrice:0.1},guest;
 var host=context.createHost(wx,{id:'h',name:'房主',roomId:'r',roomName:'测试',settings:settings});
 guest=context.createGuest(wx,{id:'g',name:'玩家',onRooms:function(rooms){guest.join(rooms[0],'');}});
 try{guest.search();assert.equal(guest.connection,'joined');}finally{guest.close();host.close();}
});
