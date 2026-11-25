'use strict';
var groups=require('./collect').KEYS;
var allowed=Object.create(null);
Object.keys(groups).forEach(function(g){groups[g].forEach(function(k){allowed[k]=true;});});
function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
function validBase64(value){
  if(typeof value!=='string'||!value||value.length%4!==0)return false;
  var end=value.length;
  if(value[end-1]==='=')end--;
  if(value[end-1]==='=')end--;
  return !/[^A-Za-z0-9+/]/.test(value.slice(0,end));
}
function buildChanges(payload,importedKeys,projectsChanged,previousProjects,previousSeating,previousPresets){
  var changes=[],seenProjects=Object.create(null);
  importedKeys.forEach(function(key){
    if(!allowed[key]||!own(payload.data,key))throw new Error('不允许恢复此数据');
    if(key==='seatingStylePresetsV1'){
      var savedPresets=payload.data[key].map(function(record){
        require('../seating/style-presets').validate(record,true);
        Object.keys(record.embeddedAssets).forEach(function(ref){changes.push({key:'h:'+ref,value:{encoding:'base64',data:record.embeddedAssets[ref]}});});
        var old=(previousPresets||[]).find(function(item){return item.id===record.id;});
        if(old){require('../seating/style-presets').validate(old,true);Object.keys(old.embeddedAssets).forEach(function(ref){if(!own(record.embeddedAssets,ref))changes.push({key:'h:'+ref,remove:true});});}
        var saved=JSON.parse(JSON.stringify(record));delete saved.embeddedAssets;return saved;
      });
      changes.push({key:'s:'+key,value:savedPresets});return;
    }
    if(key==='seatingProjectsV1'){
      var seenSeating=Object.create(null);
      payload.data[key].forEach(function(project){
        require('../seating/backup').validate(project);
        var lower=project.id.toLowerCase();if(seenSeating[lower])throw new Error('座位图编号冲突');seenSeating[lower]=true;
        Object.keys(project.embeddedAssets).forEach(function(ref){changes.push({key:'g:'+ref,value:{encoding:'base64',data:project.embeddedAssets[ref]}});});
        var old=(previousSeating||[]).find(function(item){return item.id===project.id;});
        if(old){require('../seating/backup').validate(old);Object.keys(old.embeddedAssets).forEach(function(ref){if(!Object.prototype.hasOwnProperty.call(project.embeddedAssets,ref))changes.push({key:'g:'+ref,remove:true});});}
        var saved=JSON.parse(JSON.stringify(project));delete saved.embeddedAssets;
        changes.push({key:'g:'+project.id+'.json',value:{encoding:'json',data:saved}});
      });
      return;
    }
    changes.push({key:'s:'+key,value:payload.data[key]});
  });
  if(projectsChanged)payload.projects.forEach(function(p){
    if(!p||!/^[a-zA-Z0-9_-]+$/.test(p.id||'')||seenProjects[p.id.toLowerCase()])throw new Error('拼豆项目编号无效或冲突');
    seenProjects[p.id.toLowerCase()]=true;
    var prefix='images/'+p.id+'.',relative=p.imagePath;
    if(typeof relative!=='string'||relative.indexOf(prefix)!==0||!/^(jpg|jpeg|png|webp)$/i.test(relative.slice(prefix.length))||!own(payload.images,relative))throw new Error('拼豆图片无效');
    var ext=relative.slice(prefix.length).toLowerCase(),image=payload.images[relative];
    if(!validBase64(image))throw new Error('拼豆图片无效');
    changes.push({key:'f:'+p.id+'.'+ext,value:{encoding:'base64',data:image}});
    var previous=(previousProjects||[]).filter(function(old){return old.id===p.id;})[0];
    if(previous&&previous.imagePath!==relative){
      if(typeof previous.imagePath!=='string'||previous.imagePath.indexOf(prefix)!==0||!/^(jpg|jpeg|png|webp)$/i.test(previous.imagePath.slice(prefix.length)))throw new Error('原拼豆图片路径无效');
      var oldExt=previous.imagePath.slice(prefix.length).toLowerCase();
      if(oldExt!==ext)changes.push({key:'f:'+p.id+'.'+oldExt,remove:true});
    }
    var project=JSON.parse(JSON.stringify(p));project.imagePath='@PROJECT_ROOT@/'+p.id+'.'+ext;
    changes.push({key:'f:'+p.id+'.json',value:{encoding:'project',data:project}});
    var meta={id:p.id,name:p.name,imagePath:project.imagePath,width:p.width,height:p.height,updatedAt:p.updatedAt};
    changes.push({key:'f:'+p.id+'.meta',value:{encoding:'project',data:meta}});
  });
  return changes;
}
function createAdapter(api,fs,root,projectRoot){
  var journal=root+'/backup-restore.journal',temp=journal+'.tmp';
  function path(key){
    if(key.slice(0,2)==='s:'&&allowed[key.slice(2)])return null;
    if(key.slice(0,2)==='f:'&&/^[a-zA-Z0-9_-]+\.(json|meta|jpg|jpeg|png|webp)$/.test(key.slice(2)))return projectRoot+'/'+key.slice(2);
    if(key.slice(0,2)==='g:'&&/^[a-zA-Z0-9_-]+\.(json|jpg|jpeg|png|webp)$/i.test(key.slice(2)))return root+'/seating-projects/'+key.slice(2);
    if(key.slice(0,2)==='h:'&&/^sp_[a-z0-9_]+-(logo|background)-[a-z0-9_]+\.(jpg|jpeg|png|webp)$/.test(key.slice(2)))return root+'/seating-style-presets/'+key.slice(2);
    throw new Error('不允许恢复此数据');
  }
  function exists(p){try{fs.accessSync(p);return true;}catch(e){if(/ENOENT|not exist|no such file/i.test(e.errMsg||e.message||''))return false;throw e;}}
  function removeFile(p){if(exists(p))fs.unlinkSync(p);}
  function atomic(p,value,encoding){var tmp=p+'.backup-tmp';try{fs.writeFileSync(tmp,value,encoding);fs.renameSync(tmp,p);}catch(e){removeFile(tmp);throw e;}}
  return {
    check:function(key){path(key);},
    get:function(key){var p=path(key);if(p)return exists(p)?{exists:true,value:{encoding:'base64',data:fs.readFileSync(p,'base64')}}:{exists:false};var k=key.slice(2);return api.getStorageInfoSync().keys.indexOf(k)>=0?{exists:true,value:api.getStorageSync(k)}:{exists:false};},
    put:function(key,value){var p=path(key);if(!p){api.setStorageSync(key.slice(2),value);return;}
      if(!value||typeof value!=='object')throw new Error('文件数据无效');
      if(key.slice(0,2)==='g:'){try{fs.accessSync(root+'/seating-projects');}catch(error){fs.mkdirSync(root+'/seating-projects',true);}}
      if(key.slice(0,2)==='h:'){try{fs.accessSync(root+'/seating-style-presets');}catch(error){fs.mkdirSync(root+'/seating-style-presets',true);}}
      if(value.encoding==='project'){var obj=JSON.parse(JSON.stringify(value.data));obj.imagePath=obj.imagePath.replace('@PROJECT_ROOT@',projectRoot);atomic(p,JSON.stringify(obj),'utf8');}
      else if(value.encoding==='json')atomic(p,JSON.stringify(value.data),'utf8');
      else if(value.encoding==='base64'&&typeof value.data==='string')atomic(p,value.data,'base64');
      else throw new Error('文件数据无效');},
    del:function(key){var p=path(key);if(p){removeFile(p+'.backup-tmp');removeFile(p);}else api.removeStorageSync(key.slice(2));},
    saveJournal:function(value){api.setStorageSync('backup-cleanup-pending-v1',true);try{fs.writeFileSync(temp,JSON.stringify(value),'utf8');fs.renameSync(temp,journal);api.setStorageSync('backup-restore-pending-v1',true);}catch(e){try{if(api.getStorageSync('backup-restore-pending-v1')!==true){removeFile(temp);removeFile(journal);api.removeStorageSync('backup-cleanup-pending-v1');}}catch(ignore){}throw e;}},
    loadJournal:function(){if(api.getStorageSync('backup-restore-pending-v1')!==true)return null;if(!exists(journal))throw new Error('恢复记录缺失');return JSON.parse(fs.readFileSync(journal,'utf8'));},
    cleanupJournal:function(){if(api.getStorageSync('backup-restore-pending-v1')===true)throw new Error('恢复尚未完成');removeFile(temp);removeFile(journal);api.removeStorageSync('backup-cleanup-pending-v1');},
    clearJournal:function(){api.removeStorageSync('backup-restore-pending-v1');try{removeFile(temp);removeFile(journal);api.removeStorageSync('backup-cleanup-pending-v1');}catch(e){throw new Error('数据已处理，但临时文件清理失败，请重新打开软件重试');}}
  };
}
module.exports={createAdapter:createAdapter,buildChanges:buildChanges};
