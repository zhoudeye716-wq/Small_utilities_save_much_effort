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

test('快速拖动时合并一帧内的重绘，保留最后的位移', () => {
  const p=page();p.rect={left:0,top:0,width:200,height:200};p.viewport={x:0,y:0,scale:10};
  let callback,frames=0,draws=0;
  p.canvas={requestAnimationFrame(fn){frames++;callback=fn;}};
  p.draw=()=>{draws++;};p.lastTouch={x:0,y:0,startX:0,startY:0};
  p.canvasMove({touches:[{clientX:10,clientY:0}]});
  p.canvasMove({touches:[{clientX:20,clientY:0}]});
  assert.equal(frames,1);assert.equal(draws,0);assert.equal(p.viewport.x,20);
  callback();assert.equal(draws,1);
});

test('大图颜色缓存只生成一次，图纸更换后重新生成', () => {
  const p=page();p.project.width=100;p.project.height=100;
  p.project.cells=Array.from({length:10000},()=>({key:'A',color:'#112233'}));
  p.rect={width:300,height:300};p.viewport={x:0,y:0,scale:3};
  let builds=0,images=0,fills=0;
  const buffer={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){builds++;}};
  global.wx.createOffscreenCanvas=()=>({getContext:()=>buffer});
  p.ctx={setTransform(){},clearRect(){},fillRect(){fills++;},drawImage(){images++;}};
  p.draw();p.draw();
  assert.equal(builds,1);assert.equal(images,2);assert.equal(fills,2);
  p.project.cells=p.project.cells.slice();p.draw();assert.equal(builds,2);
  p.ctx.beginPath=()=>{};p.ctx.moveTo=()=>{};p.ctx.lineTo=()=>{};p.ctx.stroke=()=>{};
  p.viewport.scale=10;p.draw();
  assert.equal(builds,2);assert.equal(images,4);
});

test('离屏画布不可用时仍绘制颜色与网格', () => {
  const p=page(),calls=[];p.rect={width:20,height:10};p.viewport={x:0,y:0,scale:10};
  global.wx.createOffscreenCanvas=()=>{throw new Error('not supported');};
  p.ctx={setTransform(){},clearRect(){},fillRect(){calls.push('fill');},beginPath(){},moveTo(){},lineTo(){},stroke(){calls.push('stroke');}};
  p.draw();assert.equal(calls.filter(x=>x==='fill').length,3);assert.equal(calls.at(-1),'stroke');
});

test('编辑单格后会清除已有颜色缓存', () => {
  const p=page();p.rect={left:0,top:0};p.viewport={scale:10,x:0,y:0};p.data.editing=true;
  p.data.selectedColor={key:'B',color:'#000000'};p.lastTouch={x:5,y:5};p.moved=false;p.colorCache={};
  p.refreshCounts=()=>{};p.draw=()=>{};p.canvasEnd({touches:[]});
  assert.equal(p.project.cells[0].key,'B');assert.equal(p.colorCache,null);
});

test('连续修改单格与全图换色都能逐步撤销', () => {
  const p=page();p.rect={left:0,top:0};p.viewport={scale:10,x:0,y:0};p.data.editing=true;
  p.refreshCounts=()=>{};p.draw=()=>{};global.wx.showToast=()=>{};
  p.data.selectedColor={key:'B',color:'#000000'};p.lastTouch={x:5,y:5};p.moved=false;p.canvasEnd({touches:[]});
  p.data.selectedColor={key:'C',color:'#ff0000'};p.lastTouch={x:15,y:5};p.moved=false;p.canvasEnd({touches:[]});
  p.undoEdit();assert.equal(p.project.cells[0].key,'B');assert.equal(p.project.cells[1],null);
  p.undoEdit();assert.equal(p.project.cells[0].key,'A');assert.equal(p.data.undoCount,0);
});

test('全图换色从当前图纸颜色选择，整次替换作为一次撤销', () => {
  const p=page();p.project.cells=[{key:'A',color:'#ffffff'},{key:'A',color:'#ffffff'}];
  p.data.counts=[{key:'A',color:'#ffffff',count:2}];p.data.palette=[{key:'B',color:'#000000'}];
  p.refreshCounts=()=>{};p.draw=()=>{};p.initStage=fn=>fn();global.wx.showToast=()=>{};
  p.data.editing=true;p.rect={left:0,top:0};p.viewport={x:0,y:0,scale:10};
  p.beginReplace();p.lastTouch={x:5,y:5};p.moved=false;p.canvasEnd({touches:[]});p.openPalette();
  p.selectColor({currentTarget:{dataset:{index:0}}});
  assert.deepEqual(p.project.cells.map(c=>c.key),['B','B']);
  p.undoEdit();assert.deepEqual(p.project.cells.map(c=>c.key),['A','A']);
});

test('改单格模式下拖动仍能移动图纸', () => {
  const p=page();p.rect={left:0,top:0};p.viewport={scale:10,x:0,y:0};p.data.editing=true;
  p.lastTouch={x:0,y:0,startX:0,startY:0};p.requestDraw=()=>{};
  p.canvasMove({touches:[{clientX:20,clientY:10}]});
  assert.equal(p.viewport.x,20);assert.equal(p.viewport.y,10);assert.equal(p.moved,true);
});

test('生成图纸时不能撤销或替换颜色，避免生成结果覆盖修改', () => {
  const p=page();p.project.cells=[{key:'B',color:'#000000'}];p.undoHistory=[[{index:0,cell:{key:'A',color:'#ffffff'}}]];p.undoCellsCount=1;
  p.data.undoCount=1;p.data.busy=true;p.data.counts=[{key:'B',color:'#000000',count:1}];
  global.wx.showToast=()=>{};p.undoEdit();p.beginReplace();
  assert.equal(p.project.cells[0].key,'B');assert.equal(p.undoHistory.length,1);assert.equal(p.data.panel,'');
});

test('选色弹层打开时画布不渲染，关闭后恢复原位置与图纸', () => {
  const fs=require('node:fs');const template=fs.readFileSync(require.resolve('../pages/perler-editor/index.wxml'),'utf8');
  assert.match(template,/<canvas[^>]*wx:if="\{\{!colorPanelOpen\}\}"[^>]*id="bead-canvas"/);
  const p=page();p.viewport={scale:17,x:20,y:-3};const cells=p.project.cells;let restored=0,draws=0;
  p.initStage=fn=>{restored++;fn();};p.draw=()=>{draws++;};
  p.openColors();p.openPalette();assert.equal(p.data.colorPanelOpen,true);
  p.closePanel();assert.equal(p.data.colorPanelOpen,false);assert.equal(restored,1);assert.equal(draws,1);
  assert.deepEqual(p.viewport,{scale:17,x:20,y:-3});assert.equal(p.project.cells,cells);
});

test('全图换色选原色后可打开色板选目标色，完成后重新绑定画布', () => {
  const p=page();p.project.cells=[{key:'A',color:'#ffffff'},{key:'A',color:'#ffffff'}];
  p.data.counts=[{key:'A',color:'#ffffff',count:2}];p.data.palette=[{key:'B',color:'#000000'}];
  p.refreshCounts=()=>{};let restored=0;p.initStage=fn=>{restored++;fn();};p.draw=()=>{};global.wx.showToast=()=>{};
  p.data.editing=true;p.rect={left:0,top:0};p.viewport={x:0,y:0,scale:10};
  p.beginReplace();p.lastTouch={x:5,y:5};p.moved=false;p.canvasEnd({touches:[]});
  assert.equal(p.data.pickMode,'replaceTarget');assert.equal(p.data.colorPanelOpen,false);assert.equal(restored,0);
  p.openPalette();assert.equal(p.data.panel,'replaceTarget');assert.equal(p.data.colorPanelOpen,true);
  p.selectColor({currentTarget:{dataset:{index:0}}});
  assert.equal(p.data.colorPanelOpen,false);assert.equal(restored,1);assert.equal(p.project.cells[0].key,'B');
});

test('关闭旧画布时丢弃尚未执行的动画帧', () => {
  const p=page();let callback,draws=0;p.canvas={requestAnimationFrame(fn){callback=fn;}};p.draw=()=>{draws++;};
  p.requestDraw();p.openColors();p.openPalette();callback();assert.equal(draws,0);assert.equal(p.drawPending,false);
});

test('改单格取色时点图纸获取颜色，而不修改图纸', () => {
  const p=page();p.rect={left:10,top:20};p.viewport={scale:20,x:4,y:6};p.data.editing=true;
  global.wx.showToast=()=>{};p.openColors();
  assert.equal(p.data.pickMode,'paint');assert.equal(p.data.colorPanelOpen,false);
  p.lastTouch={x:20,y:31};p.moved=false;p.canvasEnd({touches:[]});
  assert.equal(p.data.selectedColor.key,'A');assert.equal(p.data.pickMode,'');assert.equal(p.project.cells[0].key,'A');assert.equal(p.data.undoCount,0);
});

test('全图换色可从图纸选择原色和目标色，并可撤销', () => {
  const p=page();p.rect={left:0,top:0};p.viewport={scale:20,x:0,y:0};p.data.editing=true;
  p.project.cells=[{key:'A',color:'#ffffff'},{key:'B',color:'#000000'}];p.data.counts=[{key:'A',color:'#ffffff',count:1},{key:'B',color:'#000000',count:1}];
  p.refreshCounts=()=>{};p.draw=()=>{};global.wx.showToast=()=>{};p.beginReplace();
  p.lastTouch={x:5,y:5};p.moved=false;p.canvasEnd({touches:[]});assert.equal(p.data.pickMode,'replaceTarget');
  p.lastTouch={x:25,y:5};p.moved=false;p.canvasEnd({touches:[]});assert.deepEqual(p.project.cells.map(c=>c.key),['B','B']);
  assert.equal(p.data.pickMode,'');p.undoEdit();assert.deepEqual(p.project.cells.map(c=>c.key),['A','B']);
});

test('取色模式拖动不选色，点透明格也不改变图纸', () => {
  const p=page();p.rect={left:0,top:0};p.viewport={scale:10,x:0,y:0};p.data.editing=true;global.wx.showToast=()=>{};
  p.requestDraw=()=>{};p.openColors();p.lastTouch={x:0,y:0,startX:0,startY:0};p.moved=false;
  p.canvasMove({touches:[{clientX:10,clientY:0}]});p.canvasEnd({touches:[]});assert.equal(p.data.pickMode,'paint');
  p.viewport.x=0;p.lastTouch={x:15,y:5};p.moved=false;p.canvasEnd({touches:[]});
  assert.equal(p.data.pickMode,'paint');assert.equal(p.project.cells[1],null);
});

test('取色时仍可打开完整色板，选色后恢复图纸并结束取色', () => {
  const p=page();p.data.palette=[{key:'B',color:'#000000'}];p.data.editing=true;
  p.initStage=fn=>fn();p.draw=()=>{};global.wx.showToast=()=>{};
  p.openColors();p.openPalette();assert.equal(p.data.colorPanelOpen,true);
  p.selectColor({currentTarget:{dataset:{index:0}}});
  assert.equal(p.data.selectedColor.key,'B');assert.equal(p.data.colorPanelOpen,false);assert.equal(p.data.pickMode,'');
});

test('画布提供相对 x/y 时，按下后松手能选中格子', () => {
  const p=page();p.rect={left:30,top:180,width:100,height:100};p.viewport={x:0,y:0,scale:10};p.data.editing=true;
  global.wx.showToast=()=>{};global.wx.createSelectorQuery=()=>({in(){return this;},select(){return this;},boundingClientRect(cb){this.cb=cb;return this;},exec(){this.cb({left:30,top:180,width:100,height:100});}});
  p.openColors();p.canvasStart({touches:[{x:5,y:5}]});p.canvasEnd({touches:[],changedTouches:[{x:5,y:5}]});
  assert.equal(p.data.selectedColor.key,'A');assert.equal(p.data.pickMode,'');
});

test('没有收到移动事件时，松手距离足够远也不应误取色', () => {
  const p=page();p.rect={left:0,top:0,width:100,height:100};p.viewport={x:0,y:0,scale:10};p.data.editing=true;
  global.wx.showToast=()=>{};global.wx.createSelectorQuery=()=>({in(){return this;},select(){return this;},boundingClientRect(cb){this.cb=cb;return this;},exec(){this.cb({left:0,top:0,width:100,height:100});}});
  p.openColors();p.canvasStart({touches:[{clientX:5,clientY:5}]});p.canvasEnd({touches:[],changedTouches:[{clientX:35,clientY:5}]});
  assert.equal(p.data.pickMode,'paint');assert.equal(p.data.selectedColor.key,undefined);
});

test('相对画布坐标拖动只平移图纸，不会取色', () => {
  const p=page();p.rect={left:30,top:180,width:100,height:100};p.viewport={x:0,y:0,scale:10};p.data.editing=true;
  global.wx.showToast=()=>{};global.wx.createSelectorQuery=()=>({in(){return this;},select(){return this;},boundingClientRect(cb){this.cb=cb;return this;},exec(){this.cb({left:30,top:180,width:100,height:100});}});p.requestDraw=()=>{};
  p.openColors();p.canvasStart({touches:[{x:5,y:5}]});p.canvasMove({touches:[{x:25,y:5}]});p.canvasEnd({touches:[],changedTouches:[{x:25,y:5}]});
  assert.equal(p.viewport.x,20);assert.equal(p.data.pickMode,'paint');assert.equal(p.data.selectedColor.key,undefined);
});

test('坐标重新测量失败时使用已有位置完成点击，不阻塞后续手势', () => {
  const p=page();p.rect={left:30,top:180,width:100,height:100};p.viewport={x:0,y:0,scale:10};p.data.editing=true;
  global.wx.showToast=()=>{};global.wx.createSelectorQuery=()=>({in(){return this;},select(){return this;},boundingClientRect(cb){this.cb=cb;return this;},exec(){this.cb(null);}});
  p.openColors();p.canvasStart({touches:[{clientX:35,clientY:185}]});p.canvasEnd({touches:[],changedTouches:[{clientX:35,clientY:185}]});
  assert.equal(p.data.selectedColor.key,'A');assert.equal(p.rectPending,false);
});

test('画布测量未返回时先松手，延迟返回后仍按新位置选色', () => {
  const p=page();p.rect={left:30,top:100,width:100,height:100};p.viewport={x:0,y:0,scale:10};p.data.editing=true;let measure;
  global.wx.showToast=()=>{};global.wx.createSelectorQuery=()=>({in(){return this;},select(){return this;},boundingClientRect(cb){measure=cb;return this;},exec(){}});
  p.openColors();p.canvasStart({touches:[{clientX:35,clientY:185}]});p.canvasEnd({touches:[],changedTouches:[{clientX:35,clientY:185}]});
  measure({left:30,top:180,width:100,height:100});assert.equal(p.data.selectedColor.key,'A');assert.equal(p.data.pickMode,'');
});

test('相对画布坐标双指缩放后松手不会误取色', () => {
  const p=page();p.rect={left:30,top:100,width:100,height:100};p.viewport={x:0,y:0,scale:10};p.data.editing=true;p.requestDraw=()=>{};
  global.wx.showToast=()=>{};global.wx.createSelectorQuery=()=>({in(){return this;},select(){return this;},boundingClientRect(cb){this.cb=cb;return this;},exec(){this.cb({left:30,top:100,width:100,height:100});}});
  p.openColors();p.canvasStart({touches:[{x:5,y:5},{x:15,y:5}]});p.canvasMove({touches:[{x:0,y:5},{x:20,y:5}]});
  p.canvasEnd({touches:[{x:20,y:5}],changedTouches:[{x:0,y:5}]});p.canvasEnd({touches:[],changedTouches:[{x:20,y:5}]});
  assert.equal(p.viewport.scale,20);assert.equal(p.data.pickMode,'paint');assert.equal(p.data.selectedColor.key,undefined);
});
