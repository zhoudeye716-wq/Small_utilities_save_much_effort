const test=require('node:test');
const assert=require('node:assert/strict');
let definition;
global.wx={env:{USER_DATA_PATH:'/data'},getFileSystemManager:()=>({})};
global.Page=p=>{definition=p;};
require('../pages/data-backup/index');
function page(){const p=Object.assign({},definition);p.data=structuredClone(definition.data);p.setData=function(v){Object.assign(this.data,v);};return p;}
test('备份默认选择所有用户类别但不包含倒计时',()=>{
  const p=page();assert.deepEqual(p.data.selected,['mahjong','signboards','poker','guess','perler']);
  assert.ok(!p.data.selected.includes('timer'));
});
test('批量设置冲突后仍可逐条更改',()=>{
  const p=page();p.data.conflicts=[{id:'a'},{id:'b'}];p.chooseAll({currentTarget:{dataset:{choice:'local'}}});
  p.chooseConflict({currentTarget:{dataset:{id:'a',choice:'backup'}}});
  assert.deepEqual(p.choices,{a:'backup',b:'local'});
});
test('正在验证或恢复时不能更改已确认的冲突选择',()=>{
  const p=page();p.data.conflicts=[{id:'a'}];p.choices={a:'backup'};p.data.busy=true;
  p.chooseAll({currentTarget:{dataset:{choice:'local'}}});
  p.chooseConflict({currentTarget:{dataset:{id:'a',choice:'local'}}});
  p.cancelImport();assert.equal(p.choices.a,'backup');
});
test('未设置密码时每次导出都先提醒，取消时不导出',()=>{
  const p=page();p.data.projectsLoaded=true;let dialog,count=0;global.wx.showModal=o=>{dialog=o;};p.exportNow=()=>count++;
  p.startExport();assert.equal(count,0);dialog.success({confirm:false});assert.equal(count,0);
  p.startExport();dialog.success({confirm:true});assert.equal(count,1);
});
test('加密备份须输入符合规则且一致的密码',()=>{
  const p=page();p.data.projectsLoaded=true;let dialog,count=0;global.wx.showModal=o=>{dialog=o;};p.exportNow=()=>count++;
  p.data.encrypted=true;p.data.password='12345';p.data.passwordAgain='12345';p.startExport();assert.match(dialog.content,/6 至 18/);assert.equal(count,0);
  p.data.password='abc123';p.data.passwordAgain='abc124';p.startExport();assert.match(dialog.content,/不一致/);assert.equal(count,0);
  p.data.passwordAgain='abc123';p.startExport();assert.equal(count,1);
});
test('图片解码失败时不写入本机存储或图纸',async()=>{
  const p=page(),perler=require('../utils/perler/wx-store'),check=require('../utils/backup/image-check');
  const oldStore=perler.store,oldVerify=check.verify;let writes=0,error='';
  const project={id:'x',imagePath:'images/x.jpg',sourceWidth:2,sourceHeight:2,width:1,height:1,cells:[]};
  p.importPlan={importedKeys:['savedSignboards'],local:{projects:[]},groups:{perler:{added:[{id:'x',project}],conflicts:[]}}};
  p.resolved={data:{savedSignboards:[]},projects:[project],images:{'images/x.jpg':'aA=='}};p.choices={};
  global.wx.getStorageSync=()=>false;global.wx.setStorageSync=()=>{writes++;};global.wx.showModal=o=>{error=o.content;};
  perler.store=()=>({});check.verify=async()=>{throw Error('拼豆图片已损坏');};
  try{await p.importNow();assert.equal(writes,0);assert.match(error,/图片/);}finally{perler.store=oldStore;check.verify=oldVerify;}
});
test('文件系统不可用时导入失败并退出忙碌状态',async()=>{
  const p=page(),old=global.wx.getFileSystemManager;let text='';
  global.wx.getFileSystemManager=()=>{throw Error('不可用');};global.wx.showModal=o=>{text=o.content;};
  try{await p.importNow();assert.equal(p.data.busy,false);assert.match(text,/不可用|失败/);}finally{global.wx.getFileSystemManager=old;}
});
test('文件系统不可用时导出明确报错且不会停留在忙碌状态',async()=>{
  const p=page(),old=global.wx.getFileSystemManager;let text='';
  global.wx.getFileSystemManager=()=>{throw Error('不可用');};global.wx.showModal=o=>{text=o.content;};
  try{await p.exportNow();assert.equal(p.data.busy,false);assert.match(text,/不可用|失败/);}finally{global.wx.getFileSystemManager=old;}
});
test('从文件选择器空手返回时仅显示提示，真正失败仍显示原因',()=>{
  const p=page(),old=global.wx.miniapp;let dialog='';global.wx.showModal=o=>{dialog=o.content;};
  try{
    global.wx.miniapp={chooseFile(o){o.fail({errMsg:'chooseFile:fail'});}};
    p.chooseFile();assert.match(p.data.status,/未选择/);assert.equal(dialog,'');
    global.wx.miniapp={chooseFile(o){o.fail({errMsg:'permission denied'});}};
    p.chooseFile();assert.match(dialog,/permission denied/);
  }finally{global.wx.miniapp=old;}
});
test('复制接口未返回路径时不声称文件已可靠保存在可见目录',()=>{
  const p=page(),old=global.wx.miniapp,name='小工具省更多_备份_20261119_120000_1.zip';
  try{global.wx.miniapp={copyWxFileToNative(o){o.success({errMsg:'ok'});}};p.copyToDevice({currentTarget:{dataset:{name}}});assert.match(p.data.status,/未返回保存位置/);assert.match(p.data.status,/核实/);assert.equal(p.data.busy,false);}finally{global.wx.miniapp=old;}
});
