var ROOM='lanPokerRecentV1', PROFILE='lanPokerProfileV1';
function create(api){
 function read(key){try{return api.getStorageSync(key)||null;}catch(e){return null;}}
 function write(key,value){try{api.setStorageSync(key,value);return true;}catch(e){return false;}}
 function valid(s){return !!s&&typeof s.roomId==='string'&&!!s.roomId&&Number.isSafeInteger(s.revision)&&s.revision>=0&&s.state&&typeof s.state==='object';}
 return {
  saveHost:function(snapshot,password,updatedAt){if(!valid(snapshot))return false;return write(ROOM,{role:'host',snapshot:snapshot,password:password||'',updatedAt:updatedAt||Date.now(),closed:!!snapshot.state.ended});},
  loadHost:function(){var record=read(ROOM);return record&&record.role==='host'&&!record.closed&&valid(record.snapshot)?record:null;},
  dissolveHost:function(){var record=read(ROOM);if(!record||record.role!=='host')return true;return write(ROOM,Object.assign({},record,{closed:true}));},
  saveGuest:function(snapshot,identity){if(!valid(snapshot))return false;return write(ROOM,{role:'guest',snapshot:snapshot,identity:identity,updatedAt:Date.now()});},
  loadGuest:function(){var record=read(ROOM);return record&&record.role==='guest'&&valid(record.snapshot)?record:null;},
  markGuestLeft:function(){var record=read(ROOM);if(!record||record.role!=='guest')return true;return write(ROOM,Object.assign({},record,{left:true}));},
  saveProfile:function(profile){return write(PROFILE,{name:String(profile.name||''),roomName:String(profile.roomName||'')});},
  loadProfile:function(){return read(PROFILE)||{name:'',roomName:''};}
 };
}
module.exports={create:create};
