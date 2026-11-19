const test=require('node:test');
const assert=require('node:assert/strict');
const { createAdapter,buildChanges }=require('../utils/backup/wx-restore');
const tx=require('../utils/backup/restore');
function setup(){
  const storage={savedSignboards:[{id:'old'}]}, files=Object.create(null);
  const fs={accessSync(p){if(!Object.hasOwn(files,p))throw new Error('ENOENT');},readFileSync(p){return files[p];},writeFileSync(p,v){files[p]=v;},renameSync(a,b){files[b]=files[a];delete files[a];},unlinkSync(p){delete files[p];}};
  const wx={getStorageInfoSync:()=>({keys:Object.keys(storage)}),getStorageSync:k=>storage[k],setStorageSync(k,v){storage[k]=v;},removeStorageSync(k){delete storage[k];}};
  return {storage,files,adapter:createAdapter(wx,fs,'/data','/data/perler-projects')};
}
test('恢复存储与项目文件并去掉事务记录',()=>{
  const x=setup();const changes=buildChanges({data:{savedSignboards:[{id:'new'}]},projects:[],images:{}},['savedSignboards'],false);
  tx.apply(x.adapter,changes);assert.equal(x.storage.savedSignboards[0].id,'new');assert.deepEqual(Object.keys(x.files),[]);
});
test('禁止对未允许的存储或其他目录写入',()=>{
  const x=setup();assert.throws(()=>x.adapter.put('s:unknown',1),/不允许/);
  assert.throws(()=>x.adapter.put('f:../bad','x'),/不允许/);
});
test('拼豆项目恢复时写入新设备绝对路径',()=>{
  const x=setup();const payload={data:{},projects:[{id:'p1',name:'图',width:1,height:1,imagePath:'images/p1.jpg'}],images:{'images/p1.jpg':'aGVsbG8='}};
  tx.apply(x.adapter,buildChanges(payload,[],true));
  const project=JSON.parse(x.files['/data/perler-projects/p1.json']);
  assert.equal(project.imagePath,'/data/perler-projects/p1.jpg');
  assert.equal(x.files['/data/perler-projects/p1.jpg'],'aGVsbG8=');
});
test('不同来源的项目编号大小写碰撞时不生成写入计划',()=>{
  const payload={data:{},projects:[{id:'P1',imagePath:'images/P1.jpg'},{id:'p1',imagePath:'images/p1.jpg'}],images:{'images/P1.jpg':'aA==','images/p1.jpg':'aA=='}};
  assert.throws(()=>buildChanges(payload,[],true),/项目/);
});
test('大图片的 base64 校验不会耗尽正则调用栈',()=>{
  const payload={data:{},projects:[{id:'x',imagePath:'images/x.jpg'}],images:{'images/x.jpg':'a'.repeat(6000000)}};
  assert.equal(buildChanges(payload,[],true).length,3);
});
test('恢复其他图片格式时旧原图也按事务移除',()=>{
  const x=setup();x.files['/data/perler-projects/p1.jpg']='old';
  const payload={data:{},projects:[{id:'p1',name:'新图',width:1,height:1,imagePath:'images/p1.png'}],images:{'images/p1.png':'aA=='}};
  const previous=[{id:'p1',imagePath:'images/p1.jpg'}];
  tx.apply(x.adapter,buildChanges(payload,[],true,previous));
  assert.equal(Object.hasOwn(x.files,'/data/perler-projects/p1.jpg'),false);
  assert.equal(x.files['/data/perler-projects/p1.png'],'aA==');
});
test('写入失败后不遗留未完成的明文图片临时文件',()=>{
  const storage={},files=Object.create(null);let failed=false;
  const fs={accessSync(p){if(!Object.hasOwn(files,p))throw Error('ENOENT');},readFileSync(p){return files[p];},
    writeFileSync(p,v){files[p]=v;if(p.endsWith('.jpg.backup-tmp')&&!failed){failed=true;throw Error('full');}},renameSync(a,b){files[b]=files[a];delete files[a];},unlinkSync(p){delete files[p];}};
  const wx={getStorageInfoSync:()=>({keys:Object.keys(storage)}),getStorageSync:k=>storage[k],setStorageSync(k,v){storage[k]=v;},removeStorageSync(k){delete storage[k];}};
  const io=createAdapter(wx,fs,'/data','/data/perler-projects');
  assert.throws(()=>tx.apply(io,[{key:'f:p1.jpg',value:{encoding:'base64',data:'aA=='}}]),/失败/);
  assert.equal(Object.keys(files).some(x=>x.includes('backup-tmp')),false);
});
test('事务日志删除失败时保留清理标记，不假报干净完成',()=>{
  const storage={a:1},files={};let fail=true;
  const fs={accessSync(p){if(!Object.hasOwn(files,p))throw Error('ENOENT');},readFileSync(p){return files[p];},writeFileSync(p,v){files[p]=v;},renameSync(a,b){files[b]=files[a];delete files[a];},unlinkSync(p){if(p.endsWith('journal')&&fail)throw Error('denied');delete files[p];}};
  const wx={getStorageInfoSync:()=>({keys:Object.keys(storage)}),getStorageSync:k=>storage[k],setStorageSync(k,v){storage[k]=v;},removeStorageSync(k){delete storage[k];}};
  const io=createAdapter(wx,fs,'/data','/data/perler-projects');
  assert.throws(()=>tx.apply(io,[{key:'s:savedSignboards',value:[]}]),/清理/);
  assert.equal(storage['backup-cleanup-pending-v1'],true);fail=false;io.cleanupJournal();assert.equal(storage['backup-cleanup-pending-v1'],undefined);
});
