const test=require('node:test');
const assert=require('node:assert/strict');
const output=require('../utils/backup/output');
function setup(){const files={},storage={};return {files,storage,api:{setStorageSync(k,v){storage[k]=v;},getStorageSync(k){return storage[k];},removeStorageSync(k){delete storage[k];}},fs:{writeFileSync(p,v){files[p]=v;},renameSync(a,b){files[b]=files[a];delete files[a];},accessSync(p){if(!Object.hasOwn(files,p))throw Error('ENOENT');},unlinkSync(p){delete files[p];}}};}
test('导出先写临时文件，完成后才显示正式备份',()=>{
  const x=setup(),name='小工具省更多_备份_20261119_120000_1.zip';
  output.write(x.api,x.fs,'/data',name,new Uint8Array([1,2]));
  assert.ok(x.files['/data/local-backups/'+name]);assert.equal(x.storage[output.KEY],undefined);assert.equal(Object.keys(x.files).length,1);
});
test('中断后只清理本软件自己的临时备份，不删除已完成文件',()=>{
  const x=setup(),name='小工具省更多_备份_20261119_120000_1.zip';x.storage[output.KEY]=name;
  x.files['/data/local-backups/'+name+'.tmp']='partial';x.files['/data/local-backups/'+name]='complete';
  output.cleanup(x.api,x.fs,'/data');assert.equal(x.files['/data/local-backups/'+name],'complete');assert.equal(x.storage[output.KEY],undefined);
});
