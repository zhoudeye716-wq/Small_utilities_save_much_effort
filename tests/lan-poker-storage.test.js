var test=require('node:test'),assert=require('node:assert/strict');
var storage=require('../utils/lan-poker/storage.js');
function memory(){var data={};return {getStorageSync:function(k){return data[k];},setStorageSync:function(k,v){data[k]=JSON.parse(JSON.stringify(v));},data:data};}
test('只恢复最近一个未主动解散的房间，并保留保存时间',function(){
 var store=storage.create(memory()),first={roomId:'one',revision:3,state:{name:'第一桌'},applied:{}};
 assert.equal(store.saveHost(first,'secret',123456),true);assert.equal(store.loadHost().snapshot.roomId,'one');assert.equal(store.loadHost().updatedAt,123456);
 assert.equal(store.saveHost({roomId:'two',revision:1,state:{name:'第二桌'},applied:{}},'',234567),true);
 assert.equal(store.loadHost().snapshot.roomId,'two');assert.equal(store.dissolveHost(),true);assert.equal(store.loadHost(),null);
});
test('保存异常不得删除或替换上次有效记录',function(){
 var m=memory(),store=storage.create(m),snap={roomId:'one',revision:3,state:{},applied:{}};
 store.saveHost(snap,'',1);m.setStorageSync=function(){throw Error('disk');};
 assert.equal(store.saveHost({roomId:'two',revision:0,state:{},applied:{}},'',2),false);assert.equal(store.loadHost().snapshot.roomId,'one');
});
test('加入新房间后旧房主房间不再恢复',function(){
 var store=storage.create(memory());
 store.saveHost({roomId:'old',revision:1,state:{},applied:{}},'',1);
 store.saveGuest({roomId:'new',revision:1,state:{}},'p1');
 assert.equal(store.loadHost(),null);assert.equal(store.loadGuest().snapshot.roomId,'new');
});
test('主动退出的玩家保留身份但不再自动恢复',function(){
 var store=storage.create(memory());store.saveGuest({roomId:'r',revision:1,state:{}},{id:'p',room:{id:'r'}});
 assert.equal(store.markGuestLeft(),true);var saved=store.loadGuest();assert.equal(saved.left,true);assert.equal(saved.identity.id,'p');
});
