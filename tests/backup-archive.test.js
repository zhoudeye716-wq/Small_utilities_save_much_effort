const test=require('node:test');
const assert=require('node:assert/strict');
const archive=require('../utils/backup/archive');
const vendor=require('../utils/backup/vendor');
const payload={data:{savedSignboards:[{id:'a',name:'一'}]},projects:[],images:{}};
const random=async n=>new Uint8Array(n).fill(7);

test('无密码和加密备份均可往返恢复',async()=>{
  for(const password of ['', 'abc123']) {
    const bytes=await archive.pack(payload,{password,random,createdAt:'2026-11-18T12:00:00.000Z'});
    assert.equal(archive.inspect(bytes).encrypted,!!password);
    assert.deepEqual((await archive.open(bytes,password)).payload,payload);
    if(password) {assert.equal(Buffer.from(bytes).includes(Buffer.from('savedSignboards')),false);await assert.rejects(archive.open(bytes,'wrong1'),/密码|损坏/);}
  }
});

test('备份内容被篡改、格式不匹配或包含额外文件时拒绝导入',async()=>{
  const bytes=await archive.pack(payload,{password:'abc123',random,createdAt:'2026-11-18T12:00:00.000Z'});
  const entries=vendor.fflate.unzipSync(bytes);entries['payload.bin'][0]^=1;
  await assert.rejects(archive.open(vendor.fflate.zipSync(entries),'abc123'),/损坏/);
  const extra=vendor.fflate.unzipSync(bytes);extra['../outside']=new Uint8Array([1]);
  await assert.rejects(archive.open(vendor.fflate.zipSync(extra),'abc123'),/文件|格式/);
});
test('大小写不同但可能在文件系统中碰撞的项目编号必须拒绝',async()=>{
  const bad={data:{},projects:[{id:'Ab',imagePath:'images/Ab.jpg',width:1,height:1,sourceWidth:1,sourceHeight:1,cells:[]},{id:'ab',imagePath:'images/ab.jpg',width:1,height:1,sourceWidth:1,sourceHeight:1,cells:[]}],images:{'images/Ab.jpg':'aA==','images/ab.jpg':'aA=='}};
  await assert.rejects(archive.pack(bad,{password:'',random}),/项目/);
});
test('损坏的拼豆图纸不能生成或导入备份',async()=>{
  const bad={data:{},projects:[{id:'p1',imagePath:'images/p1.jpg',width:1,height:1,cells:null}],images:{'images/p1.jpg':'aA=='}};
  await assert.rejects(archive.pack(bad,{}),/图纸|项目/);
});
test('错误的色数或裁剪区域不能覆盖已有项目',async()=>{
  const base={id:'p1',imagePath:'images/p1.jpg',width:1,height:1,cells:[{key:'A01',color:'#ffffff'}],sourceWidth:100,sourceHeight:100,system:'MARD',paletteSize:221};
  for(const update of [{paletteSize:999999},{sourceWidth:0},{crop:{x:1,y:1,width:0,height:0}},{pendingSettings:{system:'MARD',paletteSize:999999}}]){
    await assert.rejects(archive.pack({data:{},projects:[{...base,...update}],images:{'images/p1.jpg':'aA=='}},{}),/拼豆/);
  }
});
test('加密标签开销计入导出大小限制，避免生成不可导入的备份',()=>{
  assert.equal(archive.fitsPayload(32*1024*1024-16,true),true);
  assert.equal(archive.fitsPayload(32*1024*1024-15,true),false);
  assert.equal(archive.fitsPayload(32*1024*1024,false),true);
});
test('破损的麻将记录、猜数字和围坐数据不允许恢复',async()=>{
  for(const data of [{mahjongSessions:[{id:'s1',players:null}]},{'guess-size-current-v1':{answer:0}},{offlineTable:{seats:null}}]){
    await assert.rejects(archive.pack({data,projects:[],images:{}},{}),/数据|记录/);
  }
});
test('重复身份的记录在导出时就应报错，不能生成无法导入的备份',async()=>{
  await assert.rejects(archive.pack({data:{savedSignboards:[{id:'x'},{id:'x'}]},projects:[],images:{}},{}),/记录/);
});
test('嵌套的麻将玩家和不完整的围坐牌桌不能覆盖已有记录',async()=>{
  const badSession={id:'s',players:[null],groups:[],rounds:[],fees:[]};
  await assert.rejects(archive.pack({data:{mahjongSessions:[badSession]},projects:[],images:{}},{}),/麻将/);
  await assert.rejects(archive.pack({data:{offlineTable:{seats:[{stack:1},{stack:2}]}},projects:[],images:{}},{}),/围坐/);
  const valid=require('../utils/offline-table').createTable({players:4,totalChips:1000});
  const bytes=await archive.pack({data:{offlineTable:valid},projects:[],images:{}},{});
  assert.equal((await archive.open(bytes,'')).payload.data.offlineTable.seats.length,4);
  for(const broken of [Object.assign(structuredClone(valid),{pot:999999}),(()=>{const x=structuredClone(valid);x.seats[0].index=999;return x;})()])
    await assert.rejects(archive.pack({data:{offlineTable:broken},projects:[],images:{}},{}),/围坐/);
});
test('损坏的麻将清算转账与在场记录不得覆盖历史',async()=>{
  const session=require('../utils/mahjong').createSession();session.settlements=[{id:'settlement',players:[],withFee:[null],withoutFee:[]}];
  await assert.rejects(archive.pack({data:{mahjongSessions:[session]},projects:[],images:{}},{}),/麻将/);
  delete session.settlements;session.players[0].attendance=[null];
  await assert.rejects(archive.pack({data:{mahjongSessions:[session]},projects:[],images:{}},{}),/麻将/);
});
test('麻将对局拒绝重复玩家编号和不存在的参与人',async()=>{
  const session=require('../utils/mahjong').createSession();
  const duplicate=structuredClone(session);duplicate.players.push({...duplicate.players[0]});
  const unknown=structuredClone(session);unknown.rounds[0].participants.push('missing');
  for(const s of [duplicate,unknown])await assert.rejects(archive.pack({data:{mahjongSessions:[s]},projects:[],images:{}},{}),/麻将/);
  const bytes=await archive.pack({data:{mahjongSessions:[session]},projects:[],images:{}},{});
  assert.equal((await archive.open(bytes,'')).payload.data.mahjongSessions[0].id,session.id);
});
test('局域网存档在恢复前检查房间与玩家结构',async()=>{
  const invalid={role:'host',snapshot:{roomId:'r',revision:0,state:{roomId:'r',players:[null]}}};
  await assert.rejects(archive.pack({data:{lanPokerRecentV1:invalid},projects:[],images:{}},{}),/局域网/);
  const lobby=require('../utils/lan-poker/lobby');
  const state=lobby.create({roomId:'r',name:'房间',hostId:'h',hostName:'房主',settings:{smallBlind:1,bigBlind:2,totalChips:1000,unitPrice:1}});
  const valid={role:'host',snapshot:{roomId:'r',revision:0,state}};
  const result=await archive.pack({data:{lanPokerRecentV1:valid},projects:[],images:{}},{});
  assert.equal((await archive.open(result,'')).payload.data.lanPokerRecentV1.snapshot.roomId,'r');
});
test('应用生成的麻将清算记录可以正常备份',async()=>{
  const engine=require('../utils/mahjong'),records=require('../utils/mahjong-records');const session=engine.createSession();
  session.players.forEach(p=>{session.rounds[0].scores[p.id]='50';});
  const result=records.createSnapshot(session,1700000000000);assert.equal(result.valid,true);
  session.settlements=[result.snapshot];
  const bytes=await archive.pack({data:{mahjongSessions:[session]},projects:[],images:{}},{});
  assert.equal((await archive.open(bytes,'')).payload.data.mahjongSessions[0].settlements.length,1);
});
