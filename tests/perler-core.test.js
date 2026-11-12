const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../utils/perler/core');

test('保持宽高比例计算网格尺寸', () => {
  assert.deepEqual(core.gridDimensions(1200, 800, 180), { width: 180, height: 120 });
  assert.deepEqual(core.gridDimensions(2, 1000, 10), { width: 10, height: 5000 });
});

test('映射颜色并统计，透明像素不计入', () => {
  const palette = [{key:'A', color:'#ff0000'}, {key:'B', color:'#0000ff'}];
  const image = new Uint8ClampedArray([255,0,0,255, 0,0,255,255, 10,10,10,0]);
  const grid = core.mapPixels(image, 3, 1, palette);
  assert.deepEqual(grid.map(x => x && x.key), ['A', 'B', null]);
  assert.deepEqual(core.countColors(grid), { A: 1, B: 1 });
});

test('单像素映射采用与图纸生成一致的 Oklab 感知距离', () => {
  const palette=[{key:'B',color:'#0000ff'},{key:'K',color:'#000000'}];
  const rgba=new Uint8ClampedArray([0,0,102,255]);
  assert.equal(core.mapPixels(rgba,1,1,palette)[0].key,'B');
});

test('镜像先处理完整图纸，分块坐标保持整体坐标', () => {
  const cells = ['a','b','c','d','e','f'];
  assert.deepEqual(core.mirrorGrid(cells, 3, 2), ['c','b','a','f','e','d']);
  assert.deepEqual(core.makeTiles(3, 2, 2), [
    {x:0,y:0,width:2,height:2}, {x:2,y:0,width:1,height:2}
  ]);
});

test('限制缩放并保持单格比例不受图纸尺寸影响', () => {
  assert.equal(core.clampScale(0.01, 2, 100), 2);
  assert.equal(core.clampScale(200, 2, 100), 100);
  assert.equal(core.clampScale(15, 2, 100), 15);
});

test('滚轮微调以当前比例为基准，重复拨动可继续调整', () => {
  assert.equal(core.fineTuneScale(20, 100, 0.0005), 21);
  assert.equal(core.fineTuneScale(21, -100, 0.0005), 19.95);
  assert.equal(core.fineTuneScale(20, 0, 0.0005), 20);
});

test('拒绝无效和过大的网格，避免计算卡死', () => {
  assert.throws(() => core.gridDimensions(100, 100, Infinity), /尺寸/);
  assert.throws(() => core.gridDimensions(1, 100000, 300), /过大/);
  assert.throws(() => core.makeTiles(Infinity, 50, 10), /分块/);
});

test('区域采样支持主色和平均色，透明像素不参与', () => {
  const image = {width:4,height:1,data:new Uint8ClampedArray([255,0,0,255,255,0,0,255,0,0,255,255,0,255,0,0])};
  const palette = [{key:'R',color:'#ff0000'},{key:'B',color:'#0000ff'},{key:'M',color:'#aa0055'}];
  assert.equal(core.pixelate(image,1,1,palette,{mode:'dominant'})[0].key,'R');
  assert.equal(core.pixelate(image,1,1,palette,{mode:'average'})[0].key,'M');
  assert.equal(core.pixelate({width:1,height:1,data:new Uint8ClampedArray([1,2,3,0])},1,1,palette)[0],null);
});

test('禁用色号后只从剩余色板匹配，全部禁用时提示', () => {
  const image={width:1,height:1,data:new Uint8ClampedArray([255,0,0,255])};
  const palette=[{key:'R',color:'#ff0000'},{key:'B',color:'#0000ff'}];
  assert.equal(core.pixelate(image,1,1,palette,{excludeColors:['#FF0000']})[0].key,'B');
  assert.throws(()=>core.pixelate(image,1,1,palette,{excludeColors:['#ff0000','#0000ff']}),/色板/);
});

test('分片结果等同一次计算，未完成时不能读取结果', () => {
  const image={width:3,height:1,data:new Uint8ClampedArray([255,0,0,255,0,0,0,0,0,0,255,255])};
  const palette=[{key:'R',color:'#ff0000'},{key:'B',color:'#0000ff'}];
  const job=core.createPixelJob(image,3,1,palette,{});
  assert.equal(job.step(1).done,false);
  assert.throws(()=>job.result(),/未完成/);
  assert.equal(job.step(2).done,true);
  assert.deepEqual(job.result(),core.pixelate(image,3,1,palette));
});

test('相似色合并优先保留使用数量更多的颜色', () => {
  const a={key:'A',color:'#ff0000'},b={key:'B',color:'#fe0000'},c={key:'C',color:'#0000ff'};
  assert.deepEqual(core.mergeSimilarColors([a,a,b,c],1).map(x=>x.key),['A','A','A','C']);
  assert.deepEqual(core.mergeSimilarColors([a,b],0).map(x=>x.key),['A','B']);
});

test('边缘连通去背景保留被包围的同色区域且不更改原图', () => {
  const w=[255,255,255,255], b=[0,0,0,255];
  const colors=[w,w,w,w,w,w,b,b,b,w,w,b,w,b,w,w,b,b,b,w,w,w,w,w,w];
  const rgba=new Uint8ClampedArray(colors.flat());
  const original=Array.from(rgba);
  const result=core.removeEdgeBackground(rgba,5,5,0);
  assert.equal(result[(0*5+0)*4+3],0);
  assert.equal(result[(2*5+2)*4+3],255);
  assert.equal(result[(1*5+1)*4+3],255);
  assert.deepEqual(Array.from(rgba),original);
});

test('容差能去除相近背景，透明区域可作为连通路径', () => {
  const rgba=new Uint8ClampedArray([255,255,255,255,0,0,0,0,254,254,254,255,0,0,0,255,255,255,255,255,0,0,0,255]);
  const result=core.removeEdgeBackground(rgba,3,2,2);
  assert.equal(result[3],0);
  assert.equal(result[11],0);
  assert.equal(result[19],0);
  assert.equal(result[15],255);
});

test('去背景拒绝不匹配的尺寸和非法容差', () => {
  assert.throws(()=>core.removeEdgeBackground(new Uint8Array(4),3,3,2),/图片/);
  assert.throws(()=>core.removeEdgeBackground(new Uint8Array(4),1,1,-1),/容差/);
  assert.throws(()=>core.removeEdgeBackground(new Uint8Array(4),1,1,Infinity),/容差/);
});
