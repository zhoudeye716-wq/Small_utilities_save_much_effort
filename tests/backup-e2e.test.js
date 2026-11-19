const test=require('node:test');
const assert=require('node:assert/strict');
const archive=require('../utils/backup/archive');
const collect=require('../utils/backup/collect');
const facade=require('../utils/backup/facade');
const planner=require('../utils/backup/plan');
const restore=require('../utils/backup/restore');
const wxRestore=require('../utils/backup/wx-restore');

test('加密备份跨设备合并后，原图、桌牌和本地未选择数据均保留',async()=>{
  const oldProject={id:'p1',name:'拼豆',imagePath:'/old/perler-projects/p1.jpg',width:2,height:1,sourceWidth:100,sourceHeight:50,cells:[{key:'A01',color:'#ffffff'},null]};
  const original={get(key){return key==='savedSignboards'?[{id:'a',name:'备份桌牌'}]:undefined;},listProjects(){return [oldProject];},readImage(){return Buffer.from('image bytes').toString('base64');}};
  const backup=collect.collect(original,['signboards','perler']);
  const zip=await archive.pack(backup,{password:'a1!234',random:async n=>new Uint8Array(n).fill(11)});
  const decoded=(await archive.open(zip,'a1!234')).payload;
  const storage={savedSignboards:[{id:'b',name:'本地桌牌'}],offlineSettings:{players:4}};
  const files=Object.create(null);
  const wx={getStorageInfoSync:()=>({keys:Object.keys(storage)}),getStorageSync:k=>storage[k],setStorageSync(k,v){storage[k]=v;},removeStorageSync(k){delete storage[k];}};
  const fs={accessSync(p){if(!Object.hasOwn(files,p))throw Error('ENOENT');},readFileSync(p,enc){return enc==='utf8'?files[p].toString():files[p].toString('base64');},writeFileSync(p,v,enc){files[p]=Buffer.from(v,enc==='base64'?'base64':'utf8');},renameSync(a,b){files[b]=files[a];delete files[a];},unlinkSync(p){delete files[p];}};
  const source={get:k=>storage[k],listProjects:()=>[],readImage:()=>{throw Error('unexpected');}};
  const p=facade.prepare(source,decoded),result=planner.resolve(p,{});
  const adapter=wxRestore.createAdapter(wx,fs,'/new','/new/perler-projects');
  restore.apply(adapter,wxRestore.buildChanges(result,p.importedKeys,p.hasProjects));
  assert.deepEqual(storage.savedSignboards.map(x=>x.id),['b','a']);
  assert.deepEqual(storage.offlineSettings,{players:4});
  assert.equal(files['/new/perler-projects/p1.jpg'].toString(),'image bytes');
  assert.equal(JSON.parse(files['/new/perler-projects/p1.json']).imagePath,'/new/perler-projects/p1.jpg');
  assert.ok(!Object.hasOwn(files,'/new/backup-restore.journal'));
});
