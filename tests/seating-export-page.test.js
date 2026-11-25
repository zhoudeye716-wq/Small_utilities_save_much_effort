'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');
let definition;
global.Page = p => { definition = p; };
global.wx = { showModal: () => {} };
require('../pages/seating-export/index');
function page() {
  const p = Object.assign({}, definition); p.data = JSON.parse(JSON.stringify(definition.data));
  p.setData = data => Object.assign(p.data, data);
  p.project = model.createProject('聚会', 'p'); p.selection = { x: 0, y: 0, width: 100, height: 50 };
  p.saveSettings = () => {}; p.drawPreview = () => {};
  return p;
}
test('按长边档位设定像素，另一边按所选区域比例计算', () => {
  const p = page(); p.selectPreset({ detail: { value: 1 } });
  assert.equal(p.data.pixelWidth, 2048); assert.equal(p.data.pixelHeight, 1024);
});
test('自定义导出选项能够选择清晰度', () => {
  const p=page();p.openChoice({currentTarget:{dataset:{kind:'preset'}}});assert.equal(p.data.choiceKind,'preset');
  p.chooseOption({currentTarget:{dataset:{index:2}}});assert.equal(p.data.pixelWidth,4096);assert.equal(p.data.choiceKind,'');
});
test('应用排版预设只修改样式，不改座位或活动文字', () => {
  const p=page();p.project.tables.push(model.createTable('round','t'));p.data.eventTitle='聚会';p.styleSetup({});
  p.applyStylePreset({currentTarget:{dataset:{id:'floral',custom:false}}});
  assert.equal(p.project.tables.length,1);assert.equal(p.data.eventTitle,'聚会');assert.equal(p.currentStyle.presetId,'floral');assert.equal(p.data.activeStyle,'floral');assert.equal(p.data.stylePresets.length,4);
});
test('只向用户提供四个固定预设，重新打开后保留所选风格', () => {
  const p=page();p.styleSetup({});assert.deepEqual(p.data.stylePresets.map(v=>v.id),['modern','floral','oriental','deco']);
  p.applyStylePreset({currentTarget:{dataset:{id:'oriental'}}});
  const q=page();q.styleSetup({posterStyle:p.currentStyle});assert.equal(q.data.activeStyle,'oriental');
});
test('图片型预设从本地素材加载，非图片预设无需加载', async () => {
  const p=page(), style=require('../utils/seating/style-model');let src;
  const canvas={createImage(){return {set src(value){src=value;this.onload();}};}};
  assert.ok(await p.loadStyleImage(canvas,style.preset('floral')));assert.equal(src,'/assets/seating/floral.png');
  assert.ok(await p.loadStyleImage(canvas,style.preset('oriental'),true));assert.equal(src,'/assets/seating/bamboo.png');
  assert.equal(await p.loadStyleImage(canvas,style.preset('deco')),null);
});
test('样式参数修改可撤回，切换时先确认', () => {
  const p=page();p.styleSetup({});p.styleFieldInput({currentTarget:{dataset:{path:'background'}},detail:{value:'#123456'}});
  let dialog;global.wx.showModal=o=>{dialog=o;};p.applyStylePreset({currentTarget:{dataset:{id:'floral',custom:false}}});
  assert.equal(p.currentStyle.background,'#123456');dialog.success({confirm:false});assert.equal(p.currentStyle.background,'#123456');
  p.loadPreviewAssets=()=>{};p.undoStyle();assert.equal(p.currentStyle,null);
});
test('保存预设弹窗可用点击切换是否包含图片', () => {
  const p=page();p.saveStyleOpen();p.toggleIncludeLogo({});p.toggleIncludeBackground({});assert.equal(p.data.includeLogo,true);assert.equal(p.data.includeBackground,true);p.toggleIncludeLogo({});assert.equal(p.data.includeLogo,false);
});
test('撤回排版不会把已经替换的项目图片恢复成旧引用', () => {
  const p=page();p.styleSetup({});p.project.assets.background='p-background-old.jpg';p.styleFieldInput({currentTarget:{dataset:{path:'background'}},detail:{value:'#123456'}});
  p.project.assets.background='p-background-new.jpg';p.loadPreviewAssets=()=>{};p.undoStyle();assert.equal(p.project.assets.background,'p-background-new.jpg');
});
test('打开排版面板查看不会改变原样导出的样式', () => {
  const p=page();p.styleSetup({});p.toggleStylePanel();assert.equal(p.currentStyle,null);assert.equal(p.data.styleExpanded,true);
});
test('场景颜色输入不完整时不改写现有颜色', () => {
  const p=page();p.styleSetup({});p.styleFieldInput({currentTarget:{dataset:{path:'scene.table'}},detail:{value:''}});assert.equal(p.currentStyle,null);
  p.styleFieldInput({currentTarget:{dataset:{path:'scene.table'}},detail:{value:'#123456'}});assert.equal(p.currentStyle.scene.table,'#123456');
});
test('自定义比例和样式调整可保存并重新加载', () => {
  const p=page();p.saveSettings=definition.saveSettings;p.getStore=()=>({save:v=>{p.saved=JSON.parse(JSON.stringify(v));}});
  p.customRatioInput({detail:{value:150},type:'change'});p.styleInput({currentTarget:{dataset:{key:'logoScale'}},detail:{value:160},type:'change'});p.logoNameInput({detail:{value:'聚会'}});p.setLogoCorner({currentTarget:{dataset:{corner:'bottom-right'}}});p.saveSettings();
  assert.ok(Math.abs(p.data.pixelWidth/p.data.pixelHeight-1.5)<0.01);assert.equal(p.saved.exportSettings.logoCorner,'bottom-right');assert.equal(p.saved.exportSettings.logoScale,160);assert.equal(p.saved.exportSettings.logoName,'聚会');
  const q=page();q.getStore=()=>({load:()=>p.saved,save:()=>{}});q.onLoad({id:'p'});assert.equal(q.data.logoCorner,'bottom-right');assert.equal(q.data.customRatio,150);
});
test('选择日期自动显示星期，选择时间后一起用于导出', () => {
  const p=page();p.dateChanged({detail:{value:'2026-11-24'}});p.timeChanged({detail:{value:'18:30'}});
  assert.equal(p.data.eventDate,'2026-11-24 星期二');assert.ok(p.eventInfo().some(line=>line.includes('星期二')&&line.includes('18:30')));
});
test('可清空选择过的日期和时间', () => {
  const p=page();p.dateChanged({detail:{value:'2026-11-24'}});p.timeChanged({detail:{value:'18:30'}});
  p.clearDate();p.clearTime();assert.equal(p.data.eventDate,'');assert.equal(p.data.eventTime,'');
});
test('自定义日期选择会处理月份天数并输出日期和星期', () => {
  const p=page();p.openTemporal({currentTarget:{dataset:{kind:'date'}}});
  p.temporalChoose({currentTarget:{dataset:{key:'year',value:2026}}});p.temporalChoose({currentTarget:{dataset:{key:'month',value:2}}});p.temporalChoose({currentTarget:{dataset:{key:'day',value:28}}});p.confirmTemporal();
  assert.equal(p.data.eventDate,'2026-02-28 星期六');assert.equal(p.data.temporalKind,'');
});
test('输入宽度时高度随比例变化', () => {
  const p = page(); p.pixelInput({ currentTarget: { dataset: { key: 'pixelWidth' } }, detail: { value: '1000' } });
  assert.equal(p.data.pixelWidth, 1000); assert.equal(p.data.pixelHeight, 500);
});
test('选择背景图片时复制到项目本地并保存引用', () => {
  const p = page(), copies = [];
  p.saveSettings = definition.saveSettings; p.getStore = () => ({ save: value => { p.saved = JSON.parse(JSON.stringify(value)); } });
  global.wx = { env: { USER_DATA_PATH: '/data' }, getFileSystemManager: () => ({ copyFileSync: (a,b) => copies.push([a,b]), unlinkSync: () => {} }), chooseMedia: o => o.success({tempFiles:[{tempFilePath:'/tmp/photo'}]}), getImageInfo: o => o.success({type:'jpeg'}) };
  p.selectAsset('background');
  assert.ok(p.saved.assets.background.startsWith('p-background-'));
  assert.ok(copies[0][1].startsWith('/data/seating-projects/'));
});
test('保存图片引用失败时保留原背景', () => {
  const p = page(); p.project.assets.background = 'p-background-old.jpg'; let removed;
  p.getStore = () => ({ save: () => { throw Error('full'); } });
  global.wx = { env: { USER_DATA_PATH: '/data' }, showModal: () => {}, getFileSystemManager: () => ({ copyFileSync: () => {}, unlinkSync: path => { removed = path; } }), chooseMedia: o => o.success({tempFiles:[{tempFilePath:'/tmp/new'}]}), getImageInfo: o => o.success({type:'jpeg'}) };
  p.selectAsset('background');
  assert.equal(p.project.assets.background, 'p-background-old.jpg');
  assert.ok(removed && !removed.endsWith('p-background-old.jpg'));
});
test('框选图片范围时按画布坐标得到独立的输出范围', () => {
  const p = page(); p.fullBounds = { x: 0, y: 0, width: 200, height: 100 }; p.selection = Object.assign({}, p.fullBounds);
  p.previewCanvas = { width: 200, height: 100 }; p.previewRect = { left: 0, top: 0, width: 200, height: 100 }; p.cropView = { x: 0, y: 0, scale: 1 };
  p.data.cropping = true;
  p.cropStart({ touches: [{ clientX: 20, clientY: 10 }] });
  p.cropMove({ touches: [{ clientX: 120, clientY: 60 }] }); p.cropEnd();
  assert.deepEqual(p.selection, { x: 20, y: 10, width: 100, height: 50 });
});
test('打印宽度单位和 DPI 换算像素，高度保持比例', () => {
  const p = page(); p.data.printUnitIndex = 1; p.data.printWidth = 25.4; p.data.dpi = 100;
  p.printInput({ currentTarget: { dataset: { key: 'printWidth' } }, detail: { value: '25.4' } });
  assert.equal(p.data.printHeight, 12.7);
  assert.equal(p.data.pixelWidth, 1000); assert.equal(p.data.pixelHeight, 500);
});
test('选择像素档位后显示的 DPI 与既定打印尺寸一致', () => {
  const p = page(); p.data.printUnitIndex = 1; p.data.printWidth = 25.4; p.data.printHeight = 12.7; p.data.dpi = 100;
  p.selectPreset({ detail: { value: 0 } });
  assert.equal(p.data.pixelWidth, 1024);
  assert.equal(p.data.dpi, 102.4);
});
test('导出设置包含当前选区和打印尺寸以便下次恢复', () => {
  const p = page(); p.saveSettings = definition.saveSettings;
  p.getStore = () => ({save: v => { p.saved = JSON.parse(JSON.stringify(v)); }});
  p.data.printWidth = 1; p.data.printHeight = 0.5; p.data.dpi = 150;
  p.saveSettings();
  assert.deepEqual(p.saved.exportSettings.selection, p.selection);
  assert.equal(p.saved.exportSettings.printWidth, 1);
  assert.equal(p.saved.exportSettings.pixelWidth, p.data.pixelWidth);
});
test('重新打开导出页恢复自定义像素和打印设置', () => {
  const p = page(); p.project.exportSettings = { presetIndex: 1, ratioIndex: 0, position: 20, selection: {x:0,y:0,width:100,height:50}, pixelWidth: 3000, pixelHeight: 1500, printUnitIndex: 1, printWidth: 25.4, printHeight: 12.7, dpi: 300 };
  p.getStore = () => ({load: () => p.project, save: () => {}});
  p.onLoad({id:'p'});
  assert.equal(p.data.pixelWidth, 3000); assert.equal(p.data.printWidth, 25.4); assert.equal(p.data.printUnitIndex, 1);
});
test('全图导出在场景新增内容后重新计算范围', () => {
  const p=page();p.project.exportSettings={selectionMode:'full',selection:{x:0,y:0,width:100,height:50},ratioIndex:0,pixelWidth:1000,pixelHeight:500};
  model.createFreeSeat(p.project,1000,800);p.getStore=()=>({load:()=>p.project,save:()=>{}});
  p.onLoad({id:'p'});assert.ok(p.selection.x+p.selection.width>1000);assert.ok(Math.abs(p.data.pixelWidth/p.data.pixelHeight-p.selection.width/p.selection.height)<0.01);
});
test('自定义框选在重新打开导出页时保留', () => {
  const p=page();p.project.exportSettings={selectionMode:'custom',selection:{x:1,y:2,width:40,height:30}};
  p.getStore=()=>({load:()=>p.project,save:()=>{}});p.onLoad({id:'p'});
  assert.deepEqual(p.selection,{x:1,y:2,width:40,height:30});
});
test('超大图片保存前明确说明分辨率和自动分块', () => {
  const p = page(); p.exportCanvas = {}; p.data.pixelWidth = 8192; p.data.pixelHeight = 8192;
  let dialog; global.wx = {showModal: o => {dialog = o;}};
  p.saveImage();
  assert.match(dialog.content, /8192/); assert.match(dialog.content, /分块/);
  assert.equal(p.data.busy, false);
});
test('活动文字放不下时提示调整比例而不是静默省略', () => {
  const p=page();p.exportCanvas={};p.data.pixelWidth=1000;p.data.pixelHeight=500;p.data.eventTitle='公司聚会';
  let dialog;global.wx={showModal:o=>{dialog=o;}};p.saveImage();
  assert.match(dialog.content,/留白/);assert.equal(p.data.busy,false);
});
test('在留白方向拖动场地图可调整位置且不会越出画面', () => {
  const p=page();p.selection={x:0,y:0,width:100,height:100};p.data.pixelWidth=160;p.data.pixelHeight=90;p.data.position=50;
  p.previewCanvas={width:160,height:90};p.previewRect={left:0,top:0,width:160,height:90};
  p.cropStart({touches:[{clientX:80,clientY:45}]});p.cropMove({touches:[{clientX:200,clientY:45}]});p.cropEnd();
  assert.equal(p.data.position,100);
});
test('分块保存后显示每张缩略图、像素和对应打印尺寸', async () => {
  const p=page(),output=require('../utils/seating/wx-export'),old=output.save;p.exportCanvas={};p.data.pixelWidth=8000;p.data.pixelHeight=4000;p.data.printWidth=2;p.data.printHeight=1;p.data.printUnitIndex=0;p.loadImage=async()=>null;
  output.save=async(api,canvas,options,draw,host,progress)=>{const parts=[{x:0,y:0,width:4000,height:4000},{x:4000,y:0,width:4000,height:4000}];progress(1,2,parts[0],parts,'/tmp/1');progress(2,2,parts[1],parts,'/tmp/2');return {saved:2,total:2};};
  try{await p.performSave();assert.equal(p.data.tileInfo.length,2);assert.equal(p.data.tileInfo[0].printWidth,1);assert.equal(p.data.tileInfo[1].image,'/tmp/2');}finally{output.save=old;}
});
test('分块导出时冻结场景和打印设置，避免后续修改造成图片错位', async () => {
  const p=page(),output=require('../utils/seating/wx-export'),renderer=require('../utils/seating/export-render'),oldSave=output.save,oldDraw=renderer.draw,calls=[];
  p.exportCanvas={};p.data.pixelWidth=8000;p.data.pixelHeight=4000;p.data.printWidth=2;p.data.printHeight=1;p.loadImage=async()=>null;
  renderer.draw=(ctx,project,tile,opts)=>calls.push({name:project.name,x:opts.bounds.x,position:opts.position});
  output.save=async(api,canvas,opts,draw,host,progress)=>{const parts=[{x:0,y:0,width:4000,height:4000},{x:4000,y:0,width:4000,height:4000}];draw(parts[0],{getContext:()=>({})});p.project.name='改变';p.selection.x=99;p.data.position=0;p.data.printWidth=8;draw(parts[1],{getContext:()=>({})});progress(2,2,parts[1],parts,'/tmp/2');return {saved:2,total:2};};
  try{await p.performSave();assert.deepEqual(calls[0],calls[1]);assert.equal(p.data.tileInfo[0].printWidth,1);}finally{output.save=oldSave;renderer.draw=oldDraw;}
});
test('分块导出使用同一组 Logo 与文字缩放设置', async () => {
  const p=page(),output=require('../utils/seating/wx-export'),renderer=require('../utils/seating/export-render'),oldSave=output.save,oldDraw=renderer.draw,calls=[];
  p.exportCanvas={};p.data.logoCorner='top-right';p.data.logoName='标题';p.data.textScale=150;p.data.logoScale=120;p.loadImage=async()=>null;
  renderer.draw=(ctx,project,tile,opts)=>calls.push({brand:opts.brand,textScale:opts.textScale});
  output.save=async(api,canvas,opts,draw)=>{const tile={x:0,y:0,width:1,height:1},fake={getContext:()=>({})};draw(tile,fake);p.data.logoCorner='bottom-left';p.data.logoName='变更';p.data.textScale=50;draw(tile,fake);return {saved:2,total:2};};
  try{await p.performSave();assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].brand.corner,'top-right');assert.equal(calls[0].textScale,1.5);}finally{output.save=oldSave;renderer.draw=oldDraw;}
});
test('选择 KT 板预设填入尺寸并根据清晰度计算像素', () => {
  const p=page();p.data.dpi=100;p.paperPreset({detail:{value:1}});
  assert.equal(p.data.printUnitIndex,0);assert.equal(p.data.printWidth,2.4);assert.equal(p.data.printHeight,0.9);
  assert.equal(p.data.pixelWidth,Math.round(2.4/0.0254*100));
});
test('改变比例或打印尺寸后清除不再适用的纸张预设', () => {
  const p=page();p.paperPreset({detail:{value:1}});p.selectRatio({detail:{value:3}});assert.equal(p.data.paperIndex,0);
  p.paperPreset({detail:{value:1}});p.printInput({currentTarget:{dataset:{key:'printWidth'}},detail:{value:'3'}});assert.equal(p.data.paperIndex,0);
});
test('移除背景先保存项目再删除不再引用的图片', () => {
  const p=page(),removed=[];p.project.assets.background='p-background-old.jpg';
  p.getStore=()=>({save:v=>{p.saved=JSON.parse(JSON.stringify(v));}});
  global.wx={env:{USER_DATA_PATH:'/data'},getFileSystemManager:()=>({unlinkSync:path=>removed.push(path)}),showModal:o=>o.success({confirm:true})};
  p.removeAsset({currentTarget:{dataset:{kind:'background'}}});
  assert.equal(p.saved.assets.background,undefined);assert.ok(removed[0].endsWith('p-background-old.jpg'));
});
test('图片文件清理失败时不会声称已完全删除', () => {
  const p=page();p.project.assets.background='p-background-old.jpg';p.getStore=()=>({save:()=>{}});let messages=[];
  global.wx={env:{USER_DATA_PATH:'/data'},getFileSystemManager:()=>({unlinkSync:()=>{throw Error('permission');}}),showModal:o=>{messages.push(o.content);if(o.success)o.success({confirm:true});}};
  p.removeAsset({currentTarget:{dataset:{kind:'background'}}});assert.match(p.data.status,/清理失败/);assert.ok(messages.some(x=>/清理失败/.test(x)));
});
