'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const info=require('../utils/seating/info-layout');
test('场地图靠左或靠右时活动文字自动放到留白区域',()=>{
  const a=info.layout(800,400,{x:0,y:0,width:400,height:400},['聚会','2026年'],false);
  const b=info.layout(800,400,{x:400,y:0,width:400,height:400},['聚会','2026年'],false);
  assert.equal(a.overflow,false);assert.ok(a.lines.every(x=>x.x>=400));
  assert.equal(b.overflow,false);assert.ok(b.lines.every(x=>x.x<400));
});
test('没有留白时不悄悄丢失活动文字',()=>{
  const p=info.layout(400,400,{x:0,y:0,width:400,height:400},['聚会'],false);
  assert.equal(p.overflow,true);
});
test('活动文字中的空行不会截断后续内容',()=>{
  const p=info.layout(800,400,{x:0,y:0,width:400,height:400},['A\n\nB'],false);
  assert.equal(p.overflow,false);assert.ok(p.lines.some(line=>line.text==='B'));
});
test('Logo 使用留白，不覆盖场地图；没有留白时返回空',()=>{
  const logo=info.placeLogo(800,400,{x:0,y:0,width:400,height:400},100,50);
  assert.ok(logo && logo.x>=400 && logo.x+logo.width<=800);
  assert.equal(info.placeLogo(400,400,{x:0,y:0,width:400,height:400},100,50),null);
});
test('Logo 和名称组成整体，可放四角并按比例缩放',()=>{
  for(const corner of ['top-left','top-right','bottom-left','bottom-right']){
    const p=info.placeBrand(800,400,100,50,{corner,logoScale:1,textScale:1,name:'聚会'});
    assert.ok(p&&p.logo&&p.name);assert.ok(p.name.x>=p.logo.x+p.logo.width);assert.ok(p.group.x>=0&&p.group.x+p.group.width<=800);
    assert.equal(p.group.x<400,corner.includes('left'));assert.equal(p.group.y<200,corner.includes('top'));
  }
  const a=info.placeBrand(800,400,100,50,{logoScale:1}),b=info.placeBrand(800,400,100,50,{logoScale:2});assert.ok(b.logo.width>a.logo.width);
});
test('活动信息字体大小可调整',()=>{
  const area={x:0,y:0,width:400,height:400},a=info.layout(800,400,area,['聚会'],null,1),b=info.layout(800,400,area,['聚会'],null,1.5);
  assert.ok(b.lines[0].size>a.lines[0].size);
});
test('右下角 Logo 不阻挡上方的活动文字',()=>{
  const area={x:0,y:0,width:400,height:400},brand=info.placeBrand(800,400,100,50,{corner:'bottom-right',name:'标识'});
  const result=info.layout(800,400,area,['活动说明'],brand.group,1);
  assert.equal(result.overflow,false);assert.ok(result.lines[0].y<brand.group.y);
});
test('Logo 与场地图发生遮挡时可以检测并提示',()=>{
  assert.equal(info.overlaps({x:0,y:0,width:20,height:20},{x:10,y:10,width:20,height:20}),true);
  assert.equal(info.overlaps({x:0,y:0,width:20,height:20},{x:20,y:0,width:20,height:20}),false);
});
