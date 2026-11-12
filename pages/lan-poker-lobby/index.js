var context=require('../../utils/lan-poker/context.js');
var local=require('../../utils/lan-poker/storage.js');
var offlineStorage=require('../../utils/storage.js');
function randomId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);}
Page({
 data:{name:'',roomName:'',passwordEnabled:false,password:'',joinPassword:'',joinTarget:null,manualAddress:'',rooms:[],searching:false,state:null,role:'',seats:[],inHand:false,error:'',settings:{smallBlind:'1',bigBlind:'1',totalChips:'1000',unitPrice:'0.1'}},
 onLoad:function(){
  this.store=local.create(wx);var profile=this.store.loadProfile(),settings=offlineStorage.loadState('offlineSettings',null);
  this.setData({name:profile.name||'',roomName:profile.roomName||'',settings:settings||this.data.settings});
  this.context=getApp().lanPoker||null;
  if(this.context&&(this.context.connection==='closed'||(this.context.state&&this.context.state.ended)))this.context=null;
 },
 onShow:function(){this.visible=true;if(this.context){var page=this;this.context.subscribe(function(){page.refresh();});this.context.resume();this.refresh();}else if(!this.restoreAttempted)this.restoreGuest();},
 onHide:function(){this.visible=false;if(this.context)this.context.subscribe(null);},
 onUnload:function(){this.visible=false;if(this.context)this.context.subscribe(null);},
 input:function(e){var key=e.currentTarget.dataset.key,value=e.detail.value,update={};update[key]=value;this.setData(update);},
 togglePassword:function(){this.setData({passwordEnabled:!this.data.passwordEnabled});},
 saveProfile:function(){this.store.saveProfile({name:this.data.name.trim(),roomName:this.data.roomName.trim()});},
 restoreGuest:function(){
  this.restoreAttempted=true;var record=this.store.loadGuest(),page=this;
  if(!record||record.left||!record.identity||!record.identity.room||record.snapshot.state.ended)return;
  var identity=record.identity,target=identity.room,joined=false;
  try{
   this.context=context.createGuest(wx,{id:identity.id,name:identity.name,onChange:function(){if(page.visible)page.refresh();},onRooms:function(rooms){
    page.setData({rooms:rooms});var room=rooms.find(function(r){return r.id===record.snapshot.roomId&&r.hostId===target.hostId;});
    if(room&&!joined){joined=true;page.context.join(room,identity.password||'');}
   }});
   this.context.state=record.snapshot.state;
   getApp().lanPoker=this.context;this.setData({name:identity.name});this.attachContext();this.context.search();
   if(!joined&&target.address&&target.port){joined=true;this.context.join(target,identity.password||'');}
   if(this.context.state&&Array.isArray(this.context.state.players))this.refresh();
  }catch(e){this.showError(e.message||'恢复房间失败');}
 },
 showError:function(message){wx.showToast({title:message,icon:'none',duration:3000});},
 validateName:function(){var name=String(this.data.name||'').trim();if(!name){this.showError('请先输入昵称');return '';}return name.slice(0,24);},
 createRoom:function(){
  var name=this.validateName(),roomName=String(this.data.roomName||'').trim(),page=this;if(!name)return;
  if(!roomName)return this.showError('请输入房间名称');
  if(this.data.passwordEnabled&&!String(this.data.password||''))return this.showError('请输入房间密码');
  var previous=this.store.loadHost();
  if(previous){var date=new Date(previous.updatedAt),pad=function(n){return String(n).padStart(2,'0');};
   var stamp=date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+' '+pad(date.getHours())+':'+pad(date.getMinutes());
   return wx.showModal({title:'发现未结束的房间',content:previous.snapshot.state.name+'\n最后保存：'+stamp,confirmText:'恢复房间',cancelText:'新建房间',success:function(r){if(r.confirm)page.startHost(previous);else if(r.cancel)page.startHost(null);}});
  }
  this.startHost(null);
 },
 startHost:function(previous){
  var page=this,app=getApp();
  try{
   if(app.lanPoker&&app.lanPoker!==this.context)app.lanPoker.close();
   if(this.context)this.context.close();
   var ctx=context.createHost(wx,{id:previous?previous.snapshot.state.hostId:randomId(),name:this.data.name.trim(),roomId:previous?previous.snapshot.roomId:randomId(),roomName:this.data.roomName.trim(),settings:this.data.settings,password:previous?previous.password:(this.data.passwordEnabled?this.data.password:''),snapshot:previous&&previous.snapshot,onChange:function(){if(page.visible)page.refresh();}});
   this.context=ctx;app.lanPoker=ctx;this.saveProfile();this.attachContext();this.refresh();
  }catch(e){this.showError(e.message||'创建房间失败');}
 },
 searchRooms:function(){
  var name=this.validateName(),page=this;if(!name)return;this.saveProfile();
  try{
   if(this.context&&this.context.role==='guest'&&this.context.connection==='searching'&&!this.context.state&&this.searchName===name){this.context.refreshSearch();return;}
   if(this.context)this.context.close();
   this.context=context.createGuest(wx,{id:randomId(),name:name,onChange:function(){if(page.visible)page.refresh();},onRooms:function(rooms){page.setData({rooms:rooms});}});
   this.searchName=name;getApp().lanPoker=this.context;this.attachContext();this.setData({rooms:[],searching:true,error:''});this.context.search();
  }catch(e){if(this.context)this.context.close();this.context=null;getApp().lanPoker=null;this.setData({searching:false});this.showError(e.message||'搜索房间失败');}
 },
 selectRoom:function(e){var room=this.data.rooms[Number(e.currentTarget.dataset.index)];if(!room)return;if(room.passwordRequired)this.setData({joinTarget:room,joinPassword:''});else this.joinRoom(room,'');},
 probeRoom:function(){if(!this.context||!this.context.probe||!this.context.probe(this.data.manualAddress.trim()))this.showError('请先搜索并输入有效的房主 IP');},
 joinWithPassword:function(){if(!this.data.joinTarget)return;this.joinRoom(this.data.joinTarget,this.data.joinPassword);this.setData({joinTarget:null});},
 cancelJoin:function(){this.setData({joinTarget:null});},
 joinRoom:function(room,password){
  if(!this.context)return;
  var saved=this.store.loadGuest(),page=this;
  if(saved&&saved.identity&&saved.snapshot.roomId===room.id&&saved.identity.id!==this.context.id){
   this.context.close();this.context=context.createGuest(wx,{id:saved.identity.id,name:this.data.name.trim()||saved.identity.name,onChange:function(){if(page.visible)page.refresh();},onRooms:function(rooms){page.setData({rooms:rooms});}});
   getApp().lanPoker=this.context;this.attachContext();this.context.search();
  }
  this.context.join(room,password);this.refresh();
 },
 attachContext:function(){var page=this;if(this.context)this.context.subscribe(function(){if(page.visible)page.refresh();});},
 chooseSeat:function(e){if(!this.context)return;var result=this.context.command('seat',{seat:Number(e.currentTarget.dataset.seat)});if(result&&result.error)this.showError(result.error);},
 startGame:function(){
  if(!this.context||this.context.role!=='host')return;
  var seated=this.context.state.players.filter(function(p){return p.seat!==null;});
  if(seated.length<2)return this.showError('至少需要两位玩家入座');
  var result=this.context.command('start',{});if(result&&result.error)this.showError(result.error);
 },
 leaveRoom:function(){if(this.context&&this.context.leave)this.context.leave(1);},
 refresh:function(){
  var ctx=this.context;if(!ctx)return;var state=ctx.state,seats=[];
  for(var i=0;i<9;i++){var player=state&&state.players.find(function(p){return p.seat===i;});seats.push({number:i, label:player?player.name:'空座 '+(i+1),own:!!player&&player.id===ctx.id,taken:!!player});}
  var self=state&&state.players.find(function(p){return p.id===ctx.id;});
  var inHand=!!(state&&state.table&&self&&self.status==='seated'&&state.table.seats.some(function(s){return s.playerId===ctx.id;}));
  this.setData({state:state,role:ctx.role,rooms:ctx.rooms||this.data.rooms,seats:seats,inHand:inHand,error:ctx.error||'',searching:!state&&ctx.connection==='searching'});
  if(this.visible&&inHand&&!state.ended&&!this.autoEntered){this.autoEntered=true;this.openTable();}
 },
 openTable:function(){if(!this.context||!this.context.state||!this.context.state.table)return;wx.navigateTo({url:'/pages/offline-table/index?mode=lan'});}
});
