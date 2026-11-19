'use strict';
function attempt(recover){try{return {ok:true,recovered:!!recover()};}catch(e){return {ok:false,recovered:false};}}
function tryRecover(api){return attempt(function(){
  if(typeof api.getStorageSync!=='function')return false;
  var pending=api.getStorageSync('backup-restore-pending-v1')===true,cleanup=api.getStorageSync('backup-cleanup-pending-v1')===true,images=api.getStorageSync('backup-image-check-pending-v1')===true,exporting=api.getStorageSync('backup-export-pending-v1');
  if(!pending&&!cleanup&&!images&&!exporting)return false;
  var root=api.env.USER_DATA_PATH,fs=api.getFileSystemManager(),adapter=require('./wx-restore').createAdapter(api,fs,root,root+'/perler-projects');
  var recovered=pending?require('./restore').recover(adapter):false;
  if(api.getStorageSync('backup-cleanup-pending-v1')===true)adapter.cleanupJournal();
  if(images){require('./image-check').cleanup(fs,root);api.removeStorageSync('backup-image-check-pending-v1');}
  if(exporting)require('./output').cleanup(api,fs,root);
  return recovered;
});}
module.exports={attempt:attempt,tryRecover:tryRecover};
