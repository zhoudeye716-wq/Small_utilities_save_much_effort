'use strict';
var naming=require('./naming'),KEY='backup-export-pending-v1';
function cleanup(api,fs,root){
  var name=api.getStorageSync(KEY);if(!name)return;
  if(!naming.valid(name))throw new Error('导出清理记录无效');
  var path=root+'/local-backups/'+name+'.tmp';
  try{fs.accessSync(path);}catch(e){if(/ENOENT|not exist|no such file/i.test(e.errMsg||e.message||'')){api.removeStorageSync(KEY);return;}throw e;}
  fs.unlinkSync(path);api.removeStorageSync(KEY);
}
function write(api,fs,root,name,data){
  if(!naming.valid(name)||!(data instanceof Uint8Array))throw new Error('备份文件无效');
  var path=root+'/local-backups/'+name;
  api.setStorageSync(KEY,name);
  try{fs.writeFileSync(path+'.tmp',data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));fs.renameSync(path+'.tmp',path);api.removeStorageSync(KEY);}
  catch(e){try{cleanup(api,fs,root);}catch(ignore){}throw e;}
}
module.exports={write:write,cleanup:cleanup,KEY:KEY};
