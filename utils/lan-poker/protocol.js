var LIMIT=1200, CHUNK=600, MAX_BYTES=512000, alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytes(s){return unescape(encodeURIComponent(s));}
function string(binary){var text='';for(var i=0;i<binary.length;i++)text+='%'+binary.charCodeAt(i).toString(16).padStart(2,'0');return decodeURIComponent(text);}
function b64(s){var out='';for(var i=0;i<s.length;i+=3){var a=s.charCodeAt(i), b=s.charCodeAt(i+1), c=s.charCodeAt(i+2), n=(a<<16)|((b||0)<<8)|(c||0);out+=alphabet[(n>>18)&63]+alphabet[(n>>12)&63]+(i+1<s.length?alphabet[(n>>6)&63]:'=')+(i+2<s.length?alphabet[n&63]:'=');}return out;}
function unb64(s){if(typeof s!=='string'||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('invalid base64');var out='';for(var i=0;i<s.length;i+=4){var n=(alphabet.indexOf(s[i])<<18)|(alphabet.indexOf(s[i+1])<<12)|((alphabet.indexOf(s[i+2])&63)<<6)|(alphabet.indexOf(s[i+3])&63);out+=String.fromCharCode((n>>16)&255);if(s[i+2]!=='=')out+=String.fromCharCode((n>>8)&255);if(s[i+3]!=='=')out+=String.fromCharCode(n&255);}return out;}
function checksum(s){var hash=2166136261;for(var i=0;i<s.length;i++)hash=Math.imul(hash^s.charCodeAt(i),16777619);return (hash>>>0).toString(16);}
function encode(packet){
  var binary=bytes(JSON.stringify(Object.assign({},packet,{v:1})));
  if(binary.length>=LIMIT)throw Error('报文过长');
  var out=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out.buffer;
}
function decode(buffer){try{var a=new Uint8Array(buffer);if(!a.length||a.length>=LIMIT)return null;var s='';for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);var packet=JSON.parse(string(s));return packet&&packet.v===1&&typeof packet.type==='string'&&packet.type.length<40?packet:null;}catch(e){return null;}}
function fragment(snapshot,id){
  if(!snapshot||typeof snapshot.roomId!=='string'||snapshot.roomId.length>64||typeof id!=='string'||!id||id.length>64)throw Error('无效快照');
  var data=bytes(JSON.stringify(snapshot));if(data.length>MAX_BYTES)throw Error('快照过大');
  var total=Math.ceil(data.length/CHUNK), hash=checksum(data), out=[];
  for(var i=0;i<total;i++)out.push({type:'snapshot-part',room:snapshot.roomId,id:id,index:i,total:total,hash:hash,data:b64(data.slice(i*CHUNK,(i+1)*CHUNK))});
  return out;
}
function createAssembler(){
  var pending=Object.create(null),completed=Object.create(null);
  return {accept:function(p){try{
    if(!p||p.type!=='snapshot-part'||typeof p.room!=='string'||p.room.length>64||typeof p.id!=='string'||!p.id||p.id.length>64||!Number.isInteger(p.total)||p.total<1||p.total>Math.ceil(MAX_BYTES/CHUNK)||!Number.isInteger(p.index)||p.index<0||p.index>=p.total||typeof p.hash!=='string'||!/^[0-9a-f]{1,8}$/.test(p.hash)||typeof p.data!=='string'||p.data.length>Math.ceil(CHUNK/3)*4)return null;
    var key=JSON.stringify([p.room,p.id]), now=Date.now();
    Object.keys(pending).forEach(function(k){if(now-pending[k].at>30000)delete pending[k];});
    Object.keys(completed).forEach(function(k){if(now-completed[k]>30000)delete completed[k];});
    if(completed[key])return null;
    if(!pending[key]){if(Object.keys(pending).length>=16)return null;pending[key]={at:now,total:p.total,hash:p.hash,parts:[],count:0};}
    var entry=pending[key];if(entry.total!==p.total||entry.hash!==p.hash)return null;
    if(entry.parts[p.index]===undefined){entry.parts[p.index]=unb64(p.data);entry.count++;}else if(entry.parts[p.index]!==unb64(p.data)){delete pending[key];return null;}
    if(entry.count!==entry.total)return null;
    var data=entry.parts.join('');delete pending[key];if(data.length>MAX_BYTES||checksum(data)!==entry.hash)return null;
    var snapshot=JSON.parse(string(data));if(!snapshot||snapshot.roomId!==p.room)return null;
    completed[key]=now;return snapshot;
  }catch(e){return null;}}};
}
module.exports={encode:encode,decode:decode,fragment:fragment,createAssembler:createAssembler};
