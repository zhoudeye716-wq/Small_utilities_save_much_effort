const test = require('node:test');
const assert = require('node:assert/strict');
let definition;
global.wx = {env:{USER_DATA_PATH:'/data'},getFileSystemManager:()=>({})};
global.Page = p => { definition = p; };
require('../pages/perler-editor/index');

function page() {
  const p=Object.assign({},definition);
  p.data=JSON.parse(JSON.stringify(definition.data));
  p.setData=function(v,cb){Object.assign(this.data,v);if(cb)cb();};
  p.project={width:2,height:1,sourceWidth:2,sourceHeight:1,system:'MARD',mode:'dominant',edited:false,cells:[{key:'A',color:'#ffffff'},null]};
  p.generation=0;
  p.persist=()=>true;
  return p;
}

test('参数更新期间保留原始网格，直至生成成功', () => {
  const p=page(), original=p.project.cells;
  p.requestChange({width:20});
  assert.equal(p.project.width,2);
  assert.equal(p.project.cells,original);
  assert.equal(p.pendingSettings.width,20);
  assert.equal(p.project.pendingSettings.width,20);
  assert.equal(p.data.busy,true);
  clearTimeout(p.updateTimer);
});

test('保存待生成参数失败时不丢弃旧项目或进入生成状态', () => {
  const p=page();p.persist=()=>false;p.requestChange({width:20});
  assert.equal(p.project.width,2);
  assert.equal(p.project.pendingSettings,undefined);
  assert.notEqual(p.data.busy,true);
});

test('处理尚未完成时不允许导出旧网格', () => {
  let toast=''; global.wx.showToast = e => {toast=e.title;};
  const p=page();p.data.busy=true;p.openExport();
  assert.match(toast,/等待/);assert.notEqual(p.data.panel,'export');
});

test('画布点选单格只修改选择的坐标', () => {
  const p=page();p.rect={left:10,top:20};p.viewport={scale:10,x:0,y:0};p.data.editing=true;
  p.data.selectedColor={key:'B',color:'#000000'};p.lastTouch={x:25,y:25};p.moved=false;
  p.refreshCounts=()=>{};p.draw=()=>{};p.persist=()=>true;
  p.canvasEnd({touches:[]});
  assert.equal(p.project.cells[0].key,'A');assert.equal(p.project.cells[1].key,'B');assert.equal(p.project.edited,true);
});

test('手势开始时重新测量画布位置，滚动后点击不会选错格子', () => {
  const p=page();p.rect={left:10,top:20,width:200,height:100};p.viewport={scale:10,x:0,y:0};p.data.editing=true;
  p.data.selectedColor={key:'B',color:'#000000'};p.refreshCounts=()=>{};p.draw=()=>{};p.persist=()=>true;
  global.wx.createSelectorQuery=()=>({in(){return this;},select(){return this;},boundingClientRect(cb){this.cb=cb;return this;},exec(){this.cb({left:10,top:120,width:200,height:100});}});
  p.canvasStart({touches:[{clientX:25,clientY:125}]});p.canvasEnd({touches:[]});
  assert.equal(p.project.cells[1].key,'B');
});

test('快速点按在画布坐标异步测量完成后仍修改正确位置', () => {
  const p=page();p.rect={left:10,top:20,width:200,height:100};p.viewport={scale:10,x:0,y:0};p.data.editing=true;
  p.data.selectedColor={key:'B',color:'#000000'};p.refreshCounts=()=>{};p.draw=()=>{};p.persist=()=>true;
  let callback;global.wx.createSelectorQuery=()=>({in(){return this;},select(){return this;},boundingClientRect(cb){callback=cb;return this;},exec(){}});
  p.canvasStart({touches:[{clientX:25,clientY:125}]});p.canvasEnd({touches:[]});
  callback({left:10,top:120,width:200,height:100});
  assert.equal(p.project.cells[1].key,'B');
});
