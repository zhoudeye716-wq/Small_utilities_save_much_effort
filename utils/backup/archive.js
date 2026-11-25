'use strict';

var lib=require('./vendor');
var manifestUtil=require('./manifest');
var f=lib.fflate;
var LIMIT=32*1024*1024;
var KDF={N:16384,r:8,p:1,dkLen:32,asyncTick:12};
function fitsPayload(size,encrypted){return Number.isSafeInteger(size)&&size>=0&&size+(encrypted?16:0)<=LIMIT;}

function hex(bytes){return Array.prototype.map.call(bytes,function(n){return n.toString(16).padStart(2,'0');}).join('');}
function unhex(value,length){
  if(typeof value!=='string'||value.length!==length*2||!/^[0-9a-f]+$/.test(value))throw new Error('备份格式无效');
  var out=new Uint8Array(length);for(var i=0;i<length;i++)out[i]=parseInt(value.slice(i*2,i*2+2),16);return out;
}
function aad(m){return f.strToU8(JSON.stringify([m.format,m.version,m.createdAt,m.encrypted]));}
function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function projectSettingsValid(settings,project){
  if(!object(settings))return false;
  var system=settings.system||project.system||'MARD',size=settings.paletteSize===undefined?project.paletteSize:settings.paletteSize;
  try{require('../perler/palette').getPalette(system,size);}catch(e){return false;}
  if(settings.maxSide!==undefined&&(!Number.isInteger(settings.maxSide)||settings.maxSide<1||settings.maxSide>300))return false;
  var crop=settings.crop;if(crop!==undefined&&crop!==null){
    if(!object(crop)||!Number.isFinite(crop.x)||!Number.isFinite(crop.y)||!Number.isFinite(crop.width)||!Number.isFinite(crop.height)||crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||crop.x+crop.width>project.sourceWidth+0.00001||crop.y+crop.height>project.sourceHeight+0.00001)return false;
  }
  return true;
}
function entity(x){return object(x)&&typeof x.id==='string'&&!!x.id;}
function strings(items){return Array.isArray(items)&&items.every(function(x){return typeof x==='string'&&!!x;});}
function uniqueIds(items){var ids=Object.create(null);return items.every(function(x){if(!entity(x)||ids[x.id])return false;ids[x.id]=true;return true;});}
function validSession(s){
  if(!entity(s)||!Array.isArray(s.players)||!Array.isArray(s.groups)||!Array.isArray(s.rounds)||!Array.isArray(s.fees))return false;
  if(!uniqueIds(s.players)||!uniqueIds(s.groups)||!uniqueIds(s.rounds)||!uniqueIds(s.fees))return false;
  if(s.players.some(function(x){return !entity(x)||typeof x.name!=='string'||(x.attendance!==undefined&&(!Array.isArray(x.attendance)||x.attendance.some(function(period){return !object(period)||(period.start!==null&&!Number.isSafeInteger(period.start))||(period.end!==null&&!Number.isSafeInteger(period.end));})));}))return false;
  if(s.groups.some(function(x){return !entity(x)||(x.name!==undefined&&typeof x.name!=='string');}))return false;
  if(s.rounds.some(function(x){return !entity(x)||!strings(x.participants)||!object(x.scores);}))return false;
  if(s.fees.some(function(x){return !entity(x)||!strings(x.participants)||(x.shares!==undefined&&!object(x.shares));}))return false;
  var ids=Object.create(null);s.players.forEach(function(p){ids[p.id]=true;});
  if(s.rounds.some(function(r){return r.participants.some(function(id){return !ids[id];})||Object.keys(r.scores).some(function(id){return !ids[id];});}))return false;
  if(s.fees.some(function(fee){return fee.participants.some(function(id){return !ids[id];})||(fee.payerId&&!ids[fee.payerId]);}))return false;
  function validTransfer(x){return object(x)&&typeof x.from==='string'&&typeof x.to==='string'&&Number.isSafeInteger(x.cents)&&x.cents>=0;}
  if(s.settlements!==undefined&&(!Array.isArray(s.settlements)||s.settlements.some(function(x){return !entity(x)||!Array.isArray(x.players)||x.players.some(function(p){return !entity(p)||typeof p.name!=='string';})||!Array.isArray(x.withFee)||!Array.isArray(x.withoutFee)||!x.withFee.every(validTransfer)||!x.withoutFee.every(validTransfer);})))return false;
  return true;
}
function validTable(t){
  if(!object(t)||!Array.isArray(t.seats)||t.seats.length<2||t.seats.length>9||t.players!==t.seats.length)return false;
  if(!Number.isInteger(t.dealerSeat)||t.dealerSeat<0||t.dealerSeat>=t.seats.length||!Number.isInteger(t.currentSeat)||t.currentSeat< -1||t.currentSeat>=t.seats.length)return false;
  if(['preflop','flop','turn','river','showdown','settled','waiting'].indexOf(t.stage)<0)return false;
  if(['pot','currentBet','lastRaise','smallBlind','bigBlind','unitPrice','startStack'].some(function(k){return !Number.isFinite(t[k])||t[k]<0;}))return false;
  var total=0,maxBet=0;
  if(!t.seats.every(function(s,i){if(!object(s)||s.index!==i||!['stack','buyIn','streetBet','totalBet'].every(function(k){return Number.isSafeInteger(s[k])&&s[k]>=0;})||typeof s.folded!=='boolean'||typeof s.acted!=='boolean'||s.streetBet>s.totalBet)return false;total+=s.totalBet;maxBet=Math.max(maxBet,s.streetBet);return Number.isSafeInteger(total);} ))return false;
  return Number.isSafeInteger(t.pot)&&t.pot===total&&Number.isSafeInteger(t.currentBet)&&t.currentBet>=maxBet;
}
function validLan(record){
  if(!object(record)||['host','guest'].indexOf(record.role)<0||!object(record.snapshot))return false;
  var snapshot=record.snapshot,s=snapshot.state;
  if(typeof snapshot.roomId!=='string'||!snapshot.roomId||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0||!object(s)||s.roomId!==snapshot.roomId||typeof s.hostId!=='string'||!s.hostId||!object(s.settings)||!Array.isArray(s.players)||!uniqueIds(s.players))return false;
  if(s.players.some(function(p){return typeof p.name!=='string'||(p.seat!==null&&(!Number.isInteger(p.seat)||p.seat<0||p.seat>8));}))return false;
  if(s.table!=null&&(!object(s.table)||!Array.isArray(s.table.seats)||s.table.seats.some(function(seat){return !object(seat)||typeof seat.playerId!=='string';})))return false;
  return true;
}
function validateData(data){
  var registry=require('./registry');
  Object.keys(data).forEach(function(key){
    var field=registry.byKey(key);if(!field)throw new Error('备份包含未知数据');
    var value=data[key],valid=field.shape==='object'?object(value):field.shape==='array'?Array.isArray(value):typeof value===field.shape;
    if(!valid||(field.shape==='number'&&!Number.isFinite(value)))throw new Error('备份数据格式无效');
    if(field.shape==='array'){
      if(field.merge==='records'&&!uniqueIds(value))throw new Error('备份记录编号无效或重复');
      if(key==='seatingProjectsV1'){var seenSeating=Object.create(null);value.forEach(function(project){var lower=project.id.toLowerCase();if(seenSeating[lower])throw new Error('座位图编号冲突');seenSeating[lower]=true;require('../seating/backup').validate(project);});}
      if(key==='seatingStylePresetsV1')value.forEach(function(record){require('../seating/style-presets').validate(record,true);});
      if(key==='savedSignboards'&&value.some(function(x){return !object(x)||typeof x.id!=='string'||!x.id||(x.config!==undefined&&!object(x.config));}))throw new Error('桌牌记录数据无效');
      if(key==='mahjongSessions'&&value.some(function(s){return !validSession(s);}))throw new Error('麻将记录数据无效');
      return;
    }
    if(field.shape!=='object')return;
    if(key==='mahjongPlayerLibrary'&&(value.version!==2||!Array.isArray(value.players)||!Array.isArray(value.groups)))throw new Error('麻将玩家数据格式无效');
    if(key==='offlineTable'&&!validTable(value))throw new Error('围坐数据格式无效');
    if(key==='guess-size-current-v1'&&!require('../guess-size').isSavedRound(value))throw new Error('猜数字数据格式无效');
    if(key==='lanPokerRecentV1'&&!validLan(value))throw new Error('局域网牌局数据格式无效');
  });
}
function validatePayload(value){
  if(!value||typeof value!=='object'||!value.data||typeof value.data!=='object'||Array.isArray(value.data)||!Array.isArray(value.projects)||!value.images||typeof value.images!=='object'||Array.isArray(value.images))throw new Error('备份内容格式无效');
  validateData(value.data);
  var allowed=Object.create(null), ids=Object.create(null);
  value.projects.forEach(function(p){
    if(!p||typeof p.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(p.id)||ids[p.id.toLowerCase()])throw new Error('拼豆项目无效');
    ids[p.id.toLowerCase()]=true;
    if(!Number.isInteger(p.width)||p.width<1||p.width>300||!Number.isInteger(p.height)||p.height<0||p.height>300||!Array.isArray(p.cells)||
       (p.cells.length!==0&&p.cells.length!==p.width*p.height)||
       p.cells.some(function(c){return c!==null&&(!c||typeof c.key!=='string'||!c.key||typeof c.color!=='string'||!/^#[0-9a-f]{6}$/i.test(c.color));}))throw new Error('拼豆图纸数据无效');
    if(p.system&&['MARD','COCO','漫漫','盼盼','咪小窝'].indexOf(p.system)<0)throw new Error('拼豆项目色板无效');
    if(!Number.isFinite(p.sourceWidth)||p.sourceWidth<=0||!Number.isFinite(p.sourceHeight)||p.sourceHeight<=0||!projectSettingsValid(p,p)||(p.pendingSettings&&!projectSettingsValid(p.pendingSettings,p)))throw new Error('拼豆项目设置无效');
    ['customColors','excludeColors'].forEach(function(key){if(p[key]!=null&&(!Array.isArray(p[key])||p[key].some(function(c){return typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c);})))throw new Error('拼豆项目色板无效');});
    var prefix='images/'+p.id+'.';
    if(typeof p.imagePath!=='string'||p.imagePath.indexOf(prefix)!==0||!/^(jpg|jpeg|png|webp)$/i.test(p.imagePath.slice(prefix.length)))throw new Error('拼豆图片路径无效');
    if(typeof value.images[p.imagePath]!=='string'||!value.images[p.imagePath])throw new Error('拼豆图片缺失');
    allowed[p.imagePath]=true;
  });
  if(Object.keys(value.images).some(function(name){return !allowed[name];}))throw new Error('备份图片文件无效');
}
function entries(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length>LIMIT+1024*1024)throw new Error('备份文件过大或格式无效');
  var seen=Object.create(null),total=0,count=0,files;
  try {files=f.unzipSync(bytes,{filter:function(entry){
    count++;total+=entry.originalSize;
    if((entry.name!=='manifest.json'&&entry.name!=='payload.bin')||seen[entry.name]||entry.originalSize>LIMIT||total>LIMIT+65536||count>2)throw new Error('备份文件内容无效');
    seen[entry.name]=true;return true;
  }});}catch(e){throw new Error('备份文件格式无效或已损坏');}
  if(count!==2||!files['manifest.json']||!files['payload.bin']||files['manifest.json'].length>65536)throw new Error('备份文件格式无效');
  return files;
}
async function pack(payload,options){
  options=options||{};validatePayload(payload);
  var password=options.password||'',m=manifestUtil.createManifest(options.createdAt||new Date().toISOString(),!!password);
  if(password&&!manifestUtil.validatePassword(password))throw new Error('密码需为 6 至 18 位且不含中文');
  var body=f.strToU8(JSON.stringify(payload));
  if(!fitsPayload(body.length,!!password))throw new Error('备份内容过大，请减少选中的项目分批备份；单个项目仍过大时请缩小图片。');
  if(password){
    if(typeof options.random!=='function')throw new Error('无法获取安全随机数');
    var salt=await options.random(16),nonce=await options.random(24);
    if(!(salt instanceof Uint8Array)||salt.length!==16||!(nonce instanceof Uint8Array)||nonce.length!==24)throw new Error('安全随机数无效');
    m.salt=hex(salt);m.nonce=hex(nonce);
    var key=await lib.scryptAsync(f.strToU8(password),salt,KDF);
    try{body=lib.xchacha20poly1305(key,nonce,aad(m)).encrypt(body);}finally{key.fill(0);}
  }
  m.hash=hex(lib.sha256(body));
  return f.zipSync({'manifest.json':f.strToU8(JSON.stringify(m)),'payload.bin':body},{level:6});
}
function readHeader(files){
  var m;
  try{m=JSON.parse(f.strFromU8(files['manifest.json']));}catch(e){throw new Error('备份文件格式无效');}
  if(!manifestUtil.validateManifest(m))throw new Error('不支持的备份格式或版本');
  if(typeof m.hash!=='string'||m.hash!==hex(lib.sha256(files['payload.bin'])))throw new Error('备份内容已损坏');
  return m;
}
function inspect(bytes){return readHeader(entries(bytes));}
async function open(bytes,password){
  var files=entries(bytes),m=readHeader(files),body=files['payload.bin'];
  if(m.encrypted){
    var salt=unhex(m.salt,16),nonce=unhex(m.nonce,24);
    if(!manifestUtil.validatePassword(password))throw new Error('请输入正确的备份密码');
    var key=await lib.scryptAsync(f.strToU8(password),salt,KDF);
    try{body=lib.xchacha20poly1305(key,nonce,aad(m)).decrypt(body);}catch(e){throw new Error('密码错误或备份已损坏');}finally{key.fill(0);}
  }
  var payload;try{payload=JSON.parse(f.strFromU8(body));}catch(e){throw new Error('备份内容已损坏');}
  validatePayload(payload);return {manifest:m,payload:payload};
}
module.exports={pack:pack,open:open,inspect:inspect,fitsPayload:fitsPayload};
