'use strict';
var KEY='seatingStylePresetsV1';
function clone(value){return JSON.parse(JSON.stringify(value));}
function object(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
function base64(value){if(typeof value!=='string'||!value||value.length%4!==0)return false;var end=value.length;if(value[end-1]==='=')end--;if(value[end-1]==='=')end--;return end>0&&!/[^A-Za-z0-9+/]/.test(value.slice(0,end));}
function validId(id){return typeof id==='string'&&/^sp_[a-z0-9_]{1,90}$/.test(id);}
function rejectProjectData(value){
  if(!value||typeof value!=='object')return;
  Object.keys(value).forEach(function(key){
    if(['eventTitle','eventDate','eventDateRaw','eventTime','eventPlace','people','tables','freeSeats','project','imagePath','logoPath','backgroundPath'].indexOf(key)>=0)throw new Error('排版预设不能包含活动或项目数据');
    rejectProjectData(value[key]);
  });
}
function validate(record,embedded){
  if(!object(record)||!validId(record.id)||typeof record.name!=='string'||!record.name.trim()||!object(record.style)||!object(record.assets))throw new Error('排版预设数据无效');
  rejectProjectData(record.style);
  var used=Object.create(null);
  Object.keys(record.assets).forEach(function(kind){
    var ref=record.assets[kind];
    if(['logo','background'].indexOf(kind)<0||typeof ref!=='string'||ref.indexOf(record.id+'-')!==0||!/^sp_[a-z0-9_]+-(logo|background)-[a-z0-9_]+\.(jpg|jpeg|png|webp)$/.test(ref))throw new Error('排版预设图片标识无效');
    used[ref]=true;
    if(embedded&&(!object(record.embeddedAssets)||!base64(record.embeddedAssets[ref])))throw new Error('排版预设图片缺失或无效');
  });
  if(embedded&&(!object(record.embeddedAssets)||Object.keys(record.embeddedAssets).some(function(ref){return !used[ref];})))throw new Error('排版预设图片无效');
  return true;
}
function create(api){
  var fs=api.getFileSystemManager(),root=api.env.USER_DATA_PATH+'/seating-style-presets';
  function all(){var v=api.getStorageSync(KEY);if(v===undefined||v===null||v==='')return [];if(!Array.isArray(v))throw new Error('排版预设数据无法读取');v.forEach(function(x){validate(x,false);});return clone(v);}
  function path(ref){if(typeof ref!=='string'||!/^sp_[a-z0-9_]+-(logo|background)-[a-z0-9_]+\.(jpg|jpeg|png|webp)$/.test(ref))throw new Error('排版预设图片标识无效');return root+'/'+ref;}
  function token(){return Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12);}
  function removeFiles(assets){Object.keys(assets||{}).forEach(function(k){try{fs.unlinkSync(path(assets[k]));}catch(e){/* Old or orphaned files do not invalidate committed data. */}});}
  function load(id){var found=all().find(function(x){return x.id===id;});if(!found)throw new Error('排版预设不存在');return found;}
  function save(input){
    if(!input||typeof input.name!=='string'||!input.name.trim()||!object(input.style))throw new Error('排版预设名称或样式无效');
    var records=all(),old=input.id?records.find(function(x){return x.id===input.id;}):null;
    if(input.id&&!old)throw new Error('排版预设不存在');
    var id=old?old.id:'sp_'+token();while(!old&&records.some(function(x){return x.id===id;}))id='sp_'+token();
    var record={id:id,name:input.name.trim(),style:clone(input.style),assets:{}},created={};
    try {
      try{fs.accessSync(root);}catch(e){fs.mkdirSync(root,true);}
      ['logo','background'].forEach(function(kind){
        var from=input[kind+'Path'];if(!from)return;
        var ext=typeof from==='string'&&from.match(/\.(jpg|jpeg|png|webp)$/i);if(!ext)throw new Error('排版预设图片格式无效');
        var ref=id+'-'+kind+'-'+token()+'.'+ext[1].toLowerCase();created[kind]=ref;fs.copyFileSync(from,path(ref));record.assets[kind]=ref;
      });
      validate(record,false);
      if(old)records=records.map(function(x){return x.id===id?record:x;});else records.push(record);
      api.setStorageSync(KEY,records);
    }catch(e){removeFiles(created);throw e;}
    if(old)removeFiles(old.assets);
    return clone(record);
  }
  function remove(id){var records=all(),old=records.find(function(x){return x.id===id;});if(!old)throw new Error('排版预设不存在');api.setStorageSync(KEY,records.filter(function(x){return x.id!==id;}));removeFiles(old.assets);}
  return {list:all,load:load,save:save,remove:remove,path:path};
}
function capture(store,api){var fs=api.getFileSystemManager();return store.list().map(function(record){record.embeddedAssets={};Object.keys(record.assets).forEach(function(k){var ref=record.assets[k];try{record.embeddedAssets[ref]=fs.readFileSync(store.path(ref),'base64');}catch(e){throw new Error('排版预设图片无法读取');}});validate(record,true);return record;});}
async function verifyAssets(api,fs,root,records){
  var refs=[];records.forEach(function(r){validate(r,true);Object.keys(r.embeddedAssets).forEach(function(ref){refs.push({ref:ref,data:r.embeddedAssets[ref]});});});
  if(!refs.length)return;
  if(typeof api.getImageInfo!=='function')throw new Error('当前环境无法验证排版预设图片');
  var check=require('../backup/image-check'),dir=root+'/backup-check';api.setStorageSync(check.KEY,true);
  try{
    try{fs.mkdirSync(dir,true);}catch(e){fs.accessSync(dir);}
    for(var i=0;i<refs.length;i++){
      var path=dir+'/check_preset_'+i+'.'+refs[i].ref.split('.').pop();fs.writeFileSync(path,refs[i].data,'base64');
      await new Promise(function(resolve,reject){var done=false,timer=setTimeout(function(){finish(new Error('排版预设图片验证超时'));},15000);function finish(e){if(done)return;done=true;clearTimeout(timer);if(e)reject(e);else resolve();}try{api.getImageInfo({src:path,success:function(info){finish(info&&info.width>0&&info.height>0?null:new Error('排版预设图片无效'));},fail:function(){finish(new Error('排版预设图片损坏'));}});}catch(e){finish(new Error('排版预设图片无法验证'));}});
      fs.unlinkSync(path);
    }
  }finally{check.cleanup(fs,root);api.removeStorageSync(check.KEY);}
}
module.exports={KEY:KEY,create:create,capture:capture,validate:validate,verifyAssets:verifyAssets};
