'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const model = require('../utils/seating/style-model');
test('预设是可独立修改的完整样式，素材覆盖各类别', () => {
  const list = model.presetList();
  assert.deepEqual(list.map(x => x.id), ['original', 'modern', 'floral', 'oriental', 'deco']);
  assert.equal(new Set(model.decorationList().map(x => x.category)).size >= 5, true);
  for (const item of list) {
    const value = model.preset(item.id);
    assert.deepEqual(model.normalize(value), value);
    assert.ok(value.scene.text && value.title.x >= 0 && value.map.width > 0);
    value.background = '#000000';
    assert.notEqual(model.preset(item.id).background, '#000000');
  }
});
test('归一化约束边界，保留多素材及其顺序', () => {
  const s = model.normalize({frame:{kind:'bad',width:Infinity,inset:-1},title:{x:2,y:-1,scale:0},map:{x:0.9,y:0.8,width:1,height:1},decorations:[{id:'one',kind:'flower',x:3,opacity:-1,layer:'front'},{id:'two',kind:'fan',rotation:90,visible:false}]});
  assert.equal(s.frame.kind, 'none'); assert.equal(s.frame.inset, 0);
  assert.equal(s.title.x, 1); assert.equal(s.title.y, 0); assert.ok(s.title.scale > 0);
  assert.ok(s.map.x + s.map.width <= 1 && s.map.y + s.map.height <= 1);
  assert.deepEqual(s.decorations.map(x => x.id), ['one','two']);
  assert.equal(s.decorations[0].x, 1); assert.equal(s.decorations[0].opacity, 0);
  assert.equal(s.decorations[1].rotation, 90); assert.equal(s.decorations[1].visible, false);
});
test('装饰预设为标题保留独立区域', () => {
  for (const id of ['modern','floral','oriental','deco']) {
    const s=model.preset(id);
    assert.deepEqual(s.map,{x:0.06,y:0.23,width:0.88,height:0.7});
    assert.equal(s.title.y,0.08);
    assert.ok(s.title.y < s.map.y);
  }
});
test('夜幕预设在背景、桌面和座位上均使用高对比浅色文字', () => {
  const s=model.preset('deco');
  function luminance(hex) { const rgb=hex.match(/[0-9a-f]{2}/gi).map(c=>parseInt(c,16)/255).map(c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4));return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2]; }
  function contrast(a,b) { const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+0.05)/(values[1]+0.05); }
  for (const surface of [s.background,s.scene.table,s.scene.seat]) assert.ok(contrast(s.scene.text,surface)>=4.5,surface);
  assert.notEqual(s.scene.tableStroke,s.scene.table);
});
test('场地图始终保有正尺寸，装饰可放大到 250%', () => {
  const s=model.normalize({map:{x:1,y:1,width:0,height:0},decorations:[{scale:2.5},{scale:0},{scale:9}]});
  assert.equal(s.map.x,0.95); assert.equal(s.map.y,0.95);
  assert.ok(s.map.width>=0.05 && s.map.x+s.map.width<=1);
  assert.ok(s.map.height>=0.05 && s.map.y+s.map.height<=1);
  assert.deepEqual(s.decorations.map(d=>d.scale),[2.5,0.05,2.5]);
});
test('Logo 默认沿用四角定位，位置和缩放独立保存并限制边界', () => {
  assert.deepEqual(model.normalize().logo,{x:null,y:null,scale:1});
  assert.deepEqual(model.normalize({logo:{x:2,y:-1,scale:3}}).logo,{x:1,y:0,scale:2.5});
  assert.deepEqual(model.normalize({logo:{x:null,y:NaN,scale:0}}).logo,{x:null,y:null,scale:0.25});
  assert.deepEqual(model.normalize({logo:{x:0,y:0.7,scale:1.3}}).logo,{x:0,y:0.7,scale:1.3});
});
test('素材库包含丰富的原创分类素材，预设由多项可编辑装饰构成', () => {
  const items=model.decorationList();
  assert.ok(items.length>=16);
  for(const category of ['花卉植物','东方笔触','几何线条','装饰艺术','节庆元素']) assert.ok(items.filter(x=>x.category===category).length>=2,category);
  for(const id of ['modern','floral','oriental','deco']) {
    const s=model.preset(id);
    assert.ok(s.decorations.length>=4,id);
    assert.equal(new Set(s.decorations.map(d=>d.id)).size,s.decorations.length);
    assert.ok(s.decorations.every(d=>d.layer==='behind'));
  }
});
