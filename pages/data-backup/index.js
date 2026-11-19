'use strict';
var archive=require('../../utils/backup/archive');
var collect=require('../../utils/backup/collect');
var facade=require('../../utils/backup/facade');
var planner=require('../../utils/backup/plan');
var platform=require('../../utils/backup/platform');
var naming=require('../../utils/backup/naming');
var registry=require('../../utils/backup/registry');
var outputFile=require('../../utils/backup/output');
var presentation=require('../../utils/backup/presentation');
var wxRestore=require('../../utils/backup/wx-restore');
var transaction=require('../../utils/backup/restore');
var imageCheck=require('../../utils/backup/image-check');
var perler=require('../../utils/perler/wx-store');
var ROOT=wx.env.USER_DATA_PATH,DIR=ROOT+'/local-backups',PROJECTS=ROOT+'/perler-projects';
function message(text){wx.showModal({title:'操作未完成',content:text,showCancel:false});}
function source(){var fs=wx.getFileSystemManager(),input=collect.createSource(wx,fs,PROJECTS,perler.store()),get=input.get;input.get=function(key){if(key!=='mahjongPlayerLibrary')return get(key);var library=require('../../utils/mahjong-roster').snapshot();if(!library)throw new Error('麻将玩家数据无法读取');return library;};return input;}
function adapter(){return wxRestore.createAdapter(wx,wx.getFileSystemManager(),ROOT,PROJECTS);}
function folder(fs){try{fs.accessSync(DIR);}catch(e){fs.mkdirSync(DIR,true);}}
function bytes(buffer){return buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);}
function conflictTitle(c){var labels={'roster.players':'麻将玩家','roster.groups':'麻将组合',perler:'拼豆项目'};var label=labels[c.group];if(!label)registry.categories.some(function(category){if(category.fields.some(function(field){return field.key===c.group;})){label=category.label;return true;}return false;});return (label||'数据')+' · '+String(c.recordId).slice(-8);}
Page({
 data:{selected:registry.categories.map(function(c){return c.id;}),categories:registry.categories.map(function(c){return {value:c.id,name:c.label,checked:true};}),perlerEnabled:true,projectsLoaded:false,projects:[],projectIds:[],encrypted:false,password:'',passwordAgain:'',importPassword:'',busy:false,files:[],canCopyToDevice:false,importing:false,needsPassword:false,conflicts:[],issues:[],status:''},
 onShow:function(){this.setData({canCopyToDevice:!!(wx.miniapp&&typeof wx.miniapp.copyWxFileToNative==='function')});this.refreshFiles();this.refreshProjects();},
 onUnload:function(){this.disposed=true;clearTimeout(this.copyTimer);},
 refreshProjects:function(){try{var list=perler.store().list(),old=this.data.projects,selected=this.data.projectIds,loaded=this.data.projectsLoaded;var items=list.map(function(item){var existed=old.some(function(p){return p.id===item.id;});return {id:item.id,name:item.name||item.id,checked:!loaded||!existed||selected.indexOf(item.id)>=0,invalid:!!item.invalid};});this.setData({projectsLoaded:true,projects:items,projectIds:items.filter(function(x){return x.checked;}).map(function(x){return x.id;})});}catch(e){this.setData({projectsLoaded:false,projects:[],projectIds:[]});}},
 refreshFiles:function(){try{var fs=wx.getFileSystemManager();folder(fs);var names=fs.readdirSync(DIR).filter(naming.valid).sort().reverse();this.setData({files:names});}catch(e){this.setData({files:[]});}},
 selectCategories:function(e){var selected=e.detail.value;this.setData({selected:selected,perlerEnabled:selected.indexOf('perler')>=0,categories:this.data.categories.map(function(c){return Object.assign({},c,{checked:selected.indexOf(c.value)>=0});})});},
 selectProjects:function(e){var ids=e.detail.value;this.setData({projectIds:ids,projects:this.data.projects.map(function(p){return Object.assign({},p,{checked:ids.indexOf(p.id)>=0});})});},
 toggleEncryption:function(e){this.setData({encrypted:e.detail.value,password:'',passwordAgain:''});},
 inputValue:function(e){var key=e.currentTarget.dataset.key,change={};if(['password','passwordAgain','importPassword'].indexOf(key)>=0){change[key]=e.detail.value;this.setData(change);}},
 startExport:function(){
  if(this.data.busy)return;if(!this.data.selected.length)return message('请选择至少一种数据。');if(this.data.perlerEnabled&&!this.data.projectsLoaded)return message('无法读取拼豆项目列表，请返回后重试。');
  if(this.data.encrypted){if(!require('../../utils/backup/manifest').validatePassword(this.data.password))return message('密码需为 6 至 18 位，不能包含中文。');if(this.data.password!==this.data.passwordAgain)return message('两次输入的密码不一致。');this.exportNow();return;}
  var page=this;wx.showModal({title:'建议设置密码',content:'未设置密码时，备份数据未加密，其他人拿到备份文件后可以查看其中的内容。仍要继续导出吗？',confirmText:'继续导出',cancelText:'返回设置',success:function(r){if(r.confirm)page.exportNow();}});
 },
 exportNow:async function(){
  this.setData({busy:true,status:'正在生成备份…'});
  try{var fs=wx.getFileSystemManager(),payload=collect.collect(source(),this.data.selected,{projectIds:this.data.projectIds}),password=this.data.encrypted?this.data.password:'';
    var output=await archive.pack(payload,{password:password,random:function(n){return platform.randomBytes(wx,n);}});
    folder(fs);var name=naming.create(new Date());outputFile.write(wx,fs,ROOT,name,output);
    this.setData({status:'备份已保存在软件内部，请通过「分享」另存，避免卸载后丢失。',password:'',passwordAgain:''});this.refreshFiles();
  }catch(e){try{if(wx.getStorageSync(outputFile.KEY)){getApp().backupRecoveryFailed=true;wx.reLaunch({url:'/pages/home/index'});}}catch(ignore){}message(e.message||'生成备份失败，请检查存储空间。');this.setData({status:''});}
  finally{this.setData({busy:false});}
 },
 shareFile:function(e){var name=e.currentTarget.dataset.name;if(!naming.valid(name))return;
  platform.shareFile(wx,DIR+'/'+name,name,function(e){if(!/cancel/i.test(e.errMsg||''))message('当前环境无法分享文件，请检查多端 SDK 是否支持。');});
 },
 copyToDevice:function(e){var page=this,name=e.currentTarget.dataset.name;if(this.data.busy||!naming.valid(name))return;this.setData({busy:true});var settled=false;
  function finish(){if(settled||page.disposed)return false;settled=true;clearTimeout(page.copyTimer);page.setData({busy:false});return true;}
  this.copyTimer=setTimeout(function(){if(finish())message('系统复制接口未及时返回，请在文件管理器核实，或使用「分享」另存。');},15000);
  platform.copyToDevice(wx,DIR+'/'+name,function(result){if(!finish())return;var path=result&&(result.nativeFilePath||result.filePath||result.path);var detail=typeof path==='string'&&path?'系统返回位置：'+path+'。':'系统未返回保存位置。';page.setData({status:detail+'请在文件管理器核实文件可见且可打开后，再依赖此副本；也可使用分享另存。'});},function(error){if(!finish())return;message('复制到设备未完成：'+String(error&&error.errMsg||'未知错误').slice(0,160)+'。仍可使用「分享」另存。');});
 },
 openLocal:function(e){var name=e.currentTarget.dataset.name;if(naming.valid(name))this.readFile(DIR+'/'+name);},
 chooseFile:function(){var page=this;if(this.data.busy)return;
  platform.chooseFile(wx,function(path){page.readFile(path);},function(e){var detail=String((e&&e.errMsg)||'未知错误').slice(0,160);message('文件选择未完成，系统返回：'+detail+'。本软件生成的备份可直接在下方列表中导入。');},function(info){var extra=info&&info.ambiguous?'如已选择文件仍失败，系统未提供原因'+(info.errCode!=null?'（错误码 '+info.errCode+'）':'')+'。':'';page.setData({status:'未选择文件。'+extra+'本软件生成的备份可直接在下方列表中导入。'});});
 },
 readFile:function(path){if(this.data.busy)return;try{var fs=wx.getFileSystemManager(),info=fs.statSync(path);if(info.size>33*1024*1024)throw Error('备份文件过大');this.backupBytes=bytes(fs.readFileSync(path));var header=archive.inspect(this.backupBytes);this.setData({needsPassword:header.encrypted,importPassword:'',status:'',importing:false,issues:[],conflicts:[]});if(!header.encrypted)this.openBackup();}catch(e){this.backupBytes=null;message(e.message||'无法读取备份文件。');}},
 openBackup:async function(){if(!this.backupBytes||this.data.busy)return;this.setData({busy:true,status:'正在读取备份…'});
  try{var opened=await archive.open(this.backupBytes,this.data.importPassword);this.backupPayload=opened.payload;this.importPlan=facade.prepare(source(),opened.payload);this.choices=Object.create(null);this.playerEdits=Object.create(null);this.groupEdits=Object.create(null);
    var conflicts=this.importPlan.conflicts.map(function(c){return Object.assign({id:c.id,title:conflictTitle(c),choice:''},presentation.conflict(c));});
    var count={added:0,skipped:0,conflicts:conflicts.length};Object.keys(this.importPlan.groups).forEach(function(k){var g=this.importPlan.groups[k];count.added+=g.added.length;count.skipped+=g.skipped.length;},this);
    this.importCounts=count;
    this.setData({importing:true,needsPassword:false,importPassword:'',conflicts:conflicts,issues:[],status:'备份时间：'+opened.manifest.createdAt+'；新增 '+count.added+'，相同跳过 '+count.skipped+'，冲突 '+count.conflicts+'。'});
  }catch(e){message(e.message||'读取备份失败。');this.setData({status:''});}finally{this.setData({busy:false});}
 },
 updateChoices:function(){var page=this;this.setData({conflicts:this.data.conflicts.map(function(c){return Object.assign({},c,{choice:page.choices[c.id]||''});})});},
 chooseAll:function(e){if(this.data.busy)return;var choice=e.currentTarget.dataset.choice;if(choice!=='local'&&choice!=='backup')return;this.choices=this.choices||{};this.data.conflicts.forEach(function(c){this.choices[c.id]=choice;},this);this.updateChoices();},
 chooseConflict:function(e){if(this.data.busy)return;var d=e.currentTarget.dataset;if(!this.choices)this.choices={};if(d.choice!=='local'&&d.choice!=='backup')return;this.choices[d.id]=d.choice;this.updateChoices();},
 editPlayer:function(e){if(this.data.busy)return;var page=this,id=e.currentTarget.dataset.id;wx.showModal({title:'修改玩家昵称',editable:true,placeholderText:'输入新昵称',success:function(r){if(!page.data.busy&&r.confirm&&r.content&&r.content.trim()){page.playerEdits[id]=Object.assign({},page.playerEdits[id],{name:r.content.trim()});page.resolvePreview();}}});},
 archivePlayer:function(e){if(this.data.busy)return;var page=this,id=e.currentTarget.dataset.id;wx.showModal({title:'移出玩家',content:'该玩家会从当前名单移出，历史对局保留。确定继续吗？',success:function(r){if(!page.data.busy&&r.confirm){page.playerEdits[id]=Object.assign({},page.playerEdits[id],{archive:true});page.resolvePreview();}}});},
 editGroup:function(e){if(this.data.busy)return;var page=this,id=e.currentTarget.dataset.id;wx.showModal({title:'修改组合名称',editable:true,placeholderText:'输入新组合名',success:function(r){if(!page.data.busy&&r.confirm&&r.content&&r.content.trim()){page.groupEdits[id]={name:r.content.trim()};page.resolvePreview();}}});},
 removeGroupLink:function(e){if(this.data.busy)return;var page=this,id=e.currentTarget.dataset.id;wx.showModal({title:'解除无效组合',content:'该玩家所属组合不存在，确认解除当前组合吗？历史对局会保留。',success:function(r){if(!page.data.busy&&r.confirm){page.playerEdits[id]=Object.assign({},page.playerEdits[id],{groupId:''});page.resolvePreview();}}});},
 resolvePreview:function(){try{this.resolved=planner.resolve(this.importPlan,this.choices||{},this.playerEdits||{},this.groupEdits||{});this.setData({issues:[]});return true;}
  catch(e){if(e.issues){var page=this;this.setData({issues:e.issues.map(function(issue,index){return Object.assign({index:index},presentation.issue(issue,page.importPlan));})});}else message(e.message||'无法合并备份。');return false;}},
 confirmImport:function(){if(this.data.busy||!this.importPlan)return;if(!this.resolvePreview())return;var page=this;wx.showModal({title:'确认导入',content:'将合并所选备份数据。拼豆底板比例在其他设备上需重新校准，局域网牌局不会自动重连。',success:function(r){if(r.confirm)page.importNow();}});},
 importNow:async function(){this.setData({busy:true,status:'正在验证图片和恢复数据…'});var io=null;try{io=adapter();perler.store();var selected=facade.projectsToVerify(this.importPlan,this.choices||{}),payload={data:this.resolved.data,projects:selected,images:this.resolved.images};var changes=wxRestore.buildChanges(payload,this.importPlan.importedKeys,selected.length>0,this.importPlan.local.projects);await imageCheck.verify(wx,wx.getFileSystemManager(),ROOT,selected,this.resolved.images);if(this.disposed)throw new Error('页面已关闭，导入已取消');if(!facade.unchanged(source(),this.backupPayload,this.importPlan))throw new Error('本机数据已变化，请重新选择备份并确认合并。');transaction.apply(io,changes);var replaced=0,kept=0;Object.keys(this.choices||{}).forEach(function(k){if(this.choices[k]==='backup')replaced++;else kept++;},this);var count=this.importCounts||{added:0,skipped:0};this.setData({importing:false,issues:[],conflicts:[],status:'导入完成：新增 '+count.added+'，相同跳过 '+count.skipped+'，替换 '+replaced+'，保留本机 '+kept+'。'});this.backupBytes=null;this.backupPayload=null;this.importPlan=null;this.resolved=null;}
  catch(e){try{if((io&&io.loadJournal())||wx.getStorageSync('backup-cleanup-pending-v1')===true||wx.getStorageSync(imageCheck.KEY)===true){getApp().backupRecoveryFailed=true;wx.reLaunch({url:'/pages/home/index'});}}catch(ignore){getApp().backupRecoveryFailed=true;wx.reLaunch({url:'/pages/home/index'});}if(!this.disposed)message(e.message||'导入失败。');this.setData({status:''});}finally{this.setData({busy:false});}},
 cancelImport:function(){if(this.data.busy)return;this.backupBytes=null;this.backupPayload=null;this.importPlan=null;this.resolved=null;this.setData({importing:false,needsPassword:false,importPassword:'',conflicts:[],issues:[],status:''});}
});
