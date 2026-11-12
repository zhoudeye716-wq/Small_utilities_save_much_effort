var test=require('node:test'),assert=require('node:assert/strict');
var config;
global.Page=function(value){config=value;};
global.wx={getStorageSync:function(){return '';},setStorageSync:function(){},showToast:function(){}};
global.getApp=function(){return {};};
require('../pages/lan-poker-lobby/index.js');
function page(){var p=Object.assign({},config,{data:JSON.parse(JSON.stringify(config.data))});p.setData=function(v){Object.assign(p.data,v);};return p;}
test('房主只有在至少两人入座时才能开始',function(){
 var p=page(),calls=[];p.context={id:'h',role:'host',state:{players:[{id:'h',name:'房主',seat:0,status:'seated'}]},command:function(t){calls.push(t);return {ok:true};}};
 p.startGame();assert.deepEqual(calls,[]);
 p.context.state.players.push({id:'g',name:'玩家',seat:1,status:'seated'});p.startGame();assert.deepEqual(calls,['start']);
});
test('重复搜索刷新当前连接，不清空已发现的房间',function(){
 var factory=require('../utils/lan-poker/context.js'),original=factory.createGuest;
 factory.createGuest=function(){throw Error('不应创建新连接');};
 var p=page(),refreshes=0,closed=0,room={id:'r',name:'测试'};p.data.name='玩家';p.data.rooms=[room];
 p.searchName='玩家';p.store={saveProfile:function(){}};
 p.context={role:'guest',connection:'searching',state:null,refreshSearch:function(){refreshes++;},close:function(){closed++;}};
 try{p.searchRooms();assert.equal(refreshes,1);assert.equal(closed,0);assert.deepEqual(p.data.rooms,[room]);}finally{factory.createGuest=original;}
});
test('大厅可选择退出房间并由上下文确认处理',function(){
 var p=page(),delta=0;p.context={leave:function(value){delta=value;}};
 p.leaveRoom();assert.equal(delta,1);
});
test('成员重新打开后搜索并用原身份恢复上一个房间',function(){
 var factory=require('../utils/lan-poker/context.js'),original=factory.createGuest,joined=null,app={};
 global.getApp=function(){return app;};
 factory.createGuest=function(api,options){return {role:'guest',id:options.id,subscribe:function(){},resume:function(){},search:function(){options.onRooms([{id:'room',hostId:'host',address:'ip',port:43220}]);},join:function(r,p){joined={room:r,password:p,id:options.id};}};};
 try{var p=page();p.visible=true;p.store={loadGuest:function(){return {snapshot:{roomId:'room',state:{}},identity:{id:'guest',name:'小王',password:'12',room:{id:'room',hostId:'host'}}};}};p.restoreGuest();
 assert.equal(joined.id,'guest');assert.equal(joined.room.id,'room');assert.equal(joined.password,'12');}
 finally{factory.createGuest=original;}
});
test('主动离开后手动加入同一房间使用原身份',function(){
 var factory=require('../utils/lan-poker/context.js'),original=factory.createGuest,joined=null,closed=0,app={};
 global.getApp=function(){return app;};
 factory.createGuest=function(api,options){return {id:options.id,role:'guest',subscribe:function(){},search:function(){},join:function(room){joined={id:options.id,room:room};}};};
 try{var p=page();p.visible=true;p.context={id:'new',close:function(){closed++;}};p.store={loadGuest:function(){return {left:true,snapshot:{roomId:'room',state:{}},identity:{id:'old',name:'小王',room:{id:'room'}}};}};
 p.joinRoom({id:'room',hostId:'host',address:'ip',port:43220},'');assert.equal(closed,1);assert.equal(joined.id,'old');}
 finally{factory.createGuest=original;}
});
test('恢复玩家时即使房主尚未在线也先显示本机缓存',function(){
 var factory=require('../utils/lan-poker/context.js'),original=factory.createGuest,app={},nav='';
 global.getApp=function(){return app;};global.wx.navigateTo=function(o){nav=o.url;};
 factory.createGuest=function(api,options){return {role:'guest',id:options.id,connection:'idle',subscribe:function(){},search:function(){this.connection='searching';},join:function(){}};};
 try{var p=page();p.visible=true;p.store={loadGuest:function(){return {snapshot:{roomId:'room',state:{players:[{id:'g',seat:0,status:'seated'}],table:{seats:[{playerId:'g'}]}}},identity:{id:'g',name:'玩家',room:{hostId:'h'}}};}};
 p.restoreGuest();assert.equal(p.context.state.table.seats[0].playerId,'g');assert.equal(nav,'/pages/offline-table/index?mode=lan');assert.equal(p.context.connection,'searching');}
 finally{factory.createGuest=original;delete global.wx.navigateTo;}
});
test('自动恢复时即使广播无回复也尝试上次房主地址',function(){
 var factory=require('../utils/lan-poker/context.js'),original=factory.createGuest,app={},joined;
 global.getApp=function(){return app;};
 factory.createGuest=function(api,options){return {role:'guest',id:options.id,subscribe:function(){},search:function(){},join:function(room){joined=room;}};};
 try{var p=page();p.visible=false;p.store={loadGuest:function(){return {snapshot:{roomId:'r',state:{}},identity:{id:'g',name:'玩家',room:{id:'r',hostId:'h',address:'192.168.1.2',port:43220}}};}};
 p.restoreGuest();assert.equal(joined.address,'192.168.1.2');}
 finally{factory.createGuest=original;}
});
