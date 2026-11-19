const test=require('node:test');
const assert=require('node:assert/strict');
const startup=require('../utils/backup/startup');
test('恢复成功或无恢复记录时允许启动，恢复失败时保持阻止状态',()=>{
  assert.equal(startup.attempt(()=>false).ok,true);
  assert.equal(startup.attempt(()=>true).ok,true);
  assert.equal(startup.attempt(()=>{throw Error('disk full');}).ok,false);
});
test('实际恢复入口在存储不可用时不会误报恢复成功',()=>{
  const api={env:{USER_DATA_PATH:'/data'},getStorageSync(){return true;},getFileSystemManager(){throw Error('unavailable');}};
  assert.equal(startup.tryRecover(api).ok,false);
});
test('没有导入事务时即使宿主不提供文件接口也不阻止启动',()=>{
  assert.equal(startup.tryRecover({}).ok,true);
  assert.equal(startup.tryRecover({getStorageSync(){return '';}}).ok,true);
});
test('标记存在但事务日志丢失时不能当作恢复成功',()=>{
  const api={env:{USER_DATA_PATH:'/data'},getStorageSync(){return true;},getFileSystemManager(){return {accessSync(){throw Error('ENOENT');}};}};
  assert.equal(startup.tryRecover(api).ok,false);
});
test('启动时清理已完成事务的残留日志和中断的图片检查文件',()=>{
  const values={'backup-cleanup-pending-v1':true,'backup-image-check-pending-v1':true},files={'/data/backup-restore.journal':'old','/data/backup-check/check_x.jpg':'old'};
  const api={env:{USER_DATA_PATH:'/data'},getStorageSync:k=>values[k],removeStorageSync(k){delete values[k];},getFileSystemManager(){return {
    accessSync(p){if(!Object.hasOwn(files,p))throw Error('ENOENT');},unlinkSync(p){delete files[p];},readdirSync(){return ['check_x.jpg'];}
  };}};
  assert.equal(startup.tryRecover(api).ok,true);assert.deepEqual(Object.keys(files),[]);assert.deepEqual(values,{});
});
test('启动恢复失败时重定向到受保护首页，避免直接进入工具修改数据',()=>{
  let definition,route='';global.App=x=>{definition=x;};
  global.wx={env:{USER_DATA_PATH:'/data'},getStorageSync(){return true;},getFileSystemManager(){throw Error('unavailable');},reLaunch(o){route=o.url;}};
  delete require.cache[require.resolve('../app')];require('../app');definition.onLaunch();
  assert.equal(definition.backupRecoveryFailed,true);assert.equal(route,'/pages/home/index');
});
