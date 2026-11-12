var Session=require('./session.js'),storage=require('./storage.js');
function base(api,options,role){
 var store=storage.create(api),listener=null,ctx={id:options.id,role:role,state:null,connection:'idle',rooms:[]};
 ctx.subscribe=function(fn){listener=fn;if(listener&&ctx.state)listener(ctx.state);};
 ctx.notify=function(){if(listener&&ctx.state)listener(ctx.state);if(options.onChange)options.onChange(ctx);};
 ctx.command=function(type,data){return ctx.session.command(type,data||{});};
 ctx.leave=function(delta){
  if(ctx.state&&ctx.state.ended){ctx.close();api.navigateBack({delta:delta||1});return;}
  if(role==='guest'&&ctx.connection!=='joined')return api.showModal({title:'退出房间',content:'当前无法通知房主。退出后需由房主确认你已离场，才会按弃牌处理。',success:function(result){
   if(!result.confirm)return;
   if(!ctx.store.markGuestLeft()){if(api.showToast)api.showToast({title:'保存退出状态失败，请重试',icon:'none'});return;}
   ctx.close();api.navigateBack({delta:delta||1});
  }});
  api.showModal({title:role==='host'?'解散房间':'退出房间',content:role==='host'?'解散后其他人只能查看最后的牌桌。':'退出后本小局按弃牌处理。',success:function(result){
   if(!result.confirm)return;
   var type=role==='host'?'dissolve':'leave';
   ctx.leaveConfirmed=function(ack){if(!ack||!ack.ok)return;if(role==='guest'){ctx.store.markGuestLeft();ctx.close();}ctx.leaveConfirmed=null;api.navigateBack({delta:delta||1});};
   var ack=ctx.command(type,{});
   if(ack&&ack.ok&&ctx.leaveConfirmed)ctx.leaveConfirmed(ack);
   else if(ack&&ack.error){ctx.leaveConfirmed=null;if(api.showToast)api.showToast({title:ack.error,icon:'none'});}
   else if(ack&&ack.pending&&api.showToast)api.showToast({title:'等待房主确认',icon:'none'});
  }});
 };
 ctx.close=function(){if(ctx.session)ctx.session.close();ctx.connection='closed';};
 ctx.resume=function(){if(ctx.session&&ctx.session.resume)ctx.session.resume();};
 ctx.store=store;return ctx;
}
function createHost(api,options){
 var ctx=base(api,options,'host');
 ctx.session=Session.host({id:options.id,name:options.name,roomId:options.roomId,roomName:options.roomName,settings:options.settings,password:options.password,snapshot:options.snapshot,
  createSocket:function(){return api.createUDPSocket();},persist:function(s){return ctx.store.saveHost(s,options.password,Date.now());},
  onState:function(s){ctx.state=s;ctx.notify();},onConnection:function(s){ctx.connection=s.status;ctx.peers=s.peers||ctx.peers;if(s.offline&&api.showToast){var p=ctx.peers&&ctx.peers[s.offline];api.showToast({title:(p&&p.name||'玩家')+'已离线',icon:'none'});}ctx.notify();},onError:function(e){ctx.error=e;ctx.notify();}});
 return ctx;
}
function createGuest(api,options){
 var ctx=base(api,options,'guest');
 ctx.session=Session.guest({id:options.id,name:options.name,createSocket:function(){return api.createUDPSocket();},
  persist:function(s){return ctx.store.saveGuest(s,{id:options.id,name:options.name,room:ctx.target,password:ctx.password});},
  onRooms:function(rooms){ctx.rooms=rooms;if(options.onRooms)options.onRooms(rooms);ctx.notify();},
  onRejected:function(reason){ctx.connection='searching';ctx.error=reason;ctx.notify();},onState:function(s){ctx.state=s;ctx.notify();},
  onConnection:function(s){ctx.connection=s.status;ctx.notify();},onResult:function(result){
   ctx.lastResult=result;
   if(result&&result.error){ctx.error=result.error;ctx.leaveConfirmed=null;if(api.showToast)api.showToast({title:result.error,icon:'none'});}else ctx.error='';
   if(ctx.leaveConfirmed)ctx.leaveConfirmed(result);ctx.notify();
  }});
 ctx.search=function(){ctx.connection='searching';ctx.session.search();};
 ctx.refreshSearch=function(){ctx.session.refreshSearch();};
 ctx.probe=function(address){return ctx.session.probe(address);};
 ctx.join=function(room,password){ctx.error='';ctx.target=room;ctx.password=password||'';ctx.connection='joining';ctx.session.join(room,password);};
 return ctx;
}
module.exports={createHost:createHost,createGuest:createGuest};
