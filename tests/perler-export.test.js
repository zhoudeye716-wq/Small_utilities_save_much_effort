const test = require('node:test');
const assert = require('node:assert/strict');
const exporter = require('../utils/perler/export');

const data = {width:3,height:2,cells:[{key:'A',color:'#ffffff'}, {key:'B',color:'#111111'},null,{key:'A',color:'#ffffff'},null,{key:'B',color:'#111111'}]};
function context() {
  const ops=[];
  const ctx={ops};
  for(const op of ['fillRect','strokeRect','fillText','beginPath','moveTo','lineTo','stroke','save','restore']) ctx[op]=(...args)=>ops.push([op,...args]);
  return ctx;
}

test('默认选项保留色号与坐标，输出统计',()=>{
  const plan=exporter.createPlan(data,{}), ctx=context();
  assert.equal(plan.pages.length,1);
  exporter.drawPage(ctx,plan,0);
  const words=ctx.ops.filter(x=>x[0]==='fillText').map(x=>String(x[1]));
  assert.ok(words.includes('A')); assert.ok(words.some(x=>x.includes('A') && x.includes('2')));
  assert.ok(words.includes('1')); assert.equal(plan.options.showGrid,true);
});

test('默认导出至少达到参考项目每格 30 像素，并为小图提供更高分辨率',()=>{
  const plan=exporter.createPlan(data,{});
  assert.ok(plan.options.cellSize>=30);
  assert.ok(plan.pages[0].pixelWidth>=data.width*30);
});

test('大图自动选择安全的最高默认清晰度，分块使用统一比例',()=>{
  const square={width:180,height:180,cells:Array(180*180).fill(null)};
  const plan=exporter.createPlan(square,{});
  assert.ok(plan.options.cellSize>=12);
  assert.ok(plan.pages.every(p=>p.pixelWidth*p.pixelHeight<=exporter.LIMIT_PIXELS));
  const split=exporter.createPlan(square,{tileSize:100});
  assert.ok(split.options.cellSize>=30);
  assert.ok(split.pages.every(p=>p.pixelWidth*p.pixelHeight<=exporter.LIMIT_PIXELS));
});

test('镜像先于分块，统计和坐标按分块后所在位置计算',()=>{
  const plan=exporter.createPlan(data,{mirror:true,tileSize:2,showCoordinates:true});
  assert.deepEqual(plan.pages.map(({x,y,width,height})=>({x,y,width,height})),[{x:0,y:0,width:2,height:2},{x:2,y:0,width:1,height:2}]);
  assert.deepEqual(plan.pages[0].counts,{B:2});
  assert.deepEqual(plan.pages[1].counts,{A:2});
  const ctx=context(); exporter.drawPage(ctx,plan,1);
  assert.ok(ctx.ops.some(op=>op[0]==='fillText' && String(op[1])==='3'));
  assert.equal(data.cells[0].key,'A');
});

test('关闭格线、色号和统计会从绘制结果中移除',()=>{
  const plan=exporter.createPlan(data,{hideNumbers:true,includeStats:false,showCoordinates:false,showGrid:false});
  const ctx=context(); exporter.drawPage(ctx,plan,0);
  assert.equal(ctx.ops.filter(op=>op[0]==='fillText').length,0);
  assert.equal(ctx.ops.filter(op=>op[0]==='stroke').length,0);
});

test('图片尺寸超限和非法数据明确拒绝',()=>{
  assert.throws(()=>exporter.createPlan({width:500,height:500,cells:Array(250000).fill(null)},{}),/分块/);
  assert.throws(()=>exporter.createPlan({width:2,height:2,cells:[]},{}),/网格/);
  assert.throws(()=>exporter.createPlan(data,{tileSize:0}),/分块/);
});

test('180 格方形图可整图导出，且分块图无加粗分区线',()=>{
  const square={width:180,height:180,cells:Array(180*180).fill(null)};
  assert.equal(exporter.createPlan(square,{}).pages.length,1);
  const ctx=context(); exporter.drawPage(ctx,exporter.createPlan(data,{tileSize:2,gridInterval:1}),0);
  assert.equal(ctx.ops.filter(op=>op[0]==='stroke').length,1);
});

test('导出计划保留快照，后续编辑不影响正在导出的图纸',()=>{
  const original={width:1,height:1,cells:[{key:'A',color:'#ffffff'}]};
  const plan=exporter.createPlan(original,{});
  original.cells[0].key='B'; original.cells[0].color='#000000';
  const ctx=context(); exporter.drawPage(ctx,plan,0);
  assert.ok(ctx.ops.some(op=>op[0]==='fillText' && op[1]==='A'));
  assert.ok(!ctx.ops.some(op=>op[0]==='fillText' && op[1]==='B'));
});
