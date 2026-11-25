'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const model = require('../utils/seating/style-model'), render = require('../utils/seating/style-render');
function recorder() { const calls=[]; const ctx=new Proxy({}, {get(o,k){return k in o ? o[k] : (...a)=>calls.push([k,...a]);},set(o,k,v){o[k]=v;calls.push(['set',k,v]);return true;}}); return {ctx,calls}; }
test('背景与边框使用全图尺寸，原样不画框', () => {
  const a=recorder(), s=model.preset('original'); render.drawBackground(a.ctx,1000,500,s); render.drawFrame(a.ctx,1000,500,s);
  assert.ok(a.calls.some(c=>c[0]==='fillRect' && c[3]===1000 && c[4]===500));
  assert.equal(a.calls.some(c=>c[0]==='stroke'),false);
  const b=recorder(); render.drawFrame(b.ctx,1000,500,model.preset('deco')); assert.ok(b.calls.some(c=>c[0]==='stroke'));
});
test('装饰按层与显隐过滤，并使用全图坐标和可编辑变换', () => {
  const a=recorder(),s=model.normalize({decorations:[{id:'a',kind:'flower',x:0.25,y:0.4,scale:0.2,rotation:90,opacity:0.3,color:'#112233',layer:'front'},{id:'b',kind:'fan',visible:false,layer:'front'},{id:'c',kind:'confetti',layer:'behind'}]});
  render.drawDecorations(a.ctx,1000,500,s,'front');
  assert.deepEqual(a.calls.find(c=>c[0]==='translate').slice(1),[250,200]);
  assert.equal(a.calls.filter(c=>c[0]==='scale' && c[1]===100 && c[2]===100).length,1);
  assert.ok(a.calls.some(c=>c[0]==='rotate' && Math.abs(c[1]-Math.PI/2)<1e-10));
  assert.ok(a.calls.some(c=>c[0]==='set' && c[1]==='globalAlpha' && c[2]===0.3));
  assert.ok(a.calls.some(c=>c[0]==='set' && c[1]==='strokeStyle' && c[2]==='#112233'));
});
test('每种枚举素材均绘制矢量路径', () => {
  for(const item of model.decorationList()) { const a=recorder(); render.drawDecorations(a.ctx,800,600,{decorations:[{kind:item.kind}]},'behind'); assert.ok(a.calls.some(c=>c[0]==='stroke' || c[0]==='fill'),item.kind); }
});
test('只有装饰素材超出原图像素时提醒清晰度限制', () => {
  const asset={width:1312,height:1199},style=model.preset('floral');
  assert.equal(render.imageUpscaled(style,asset,2048,2048),false);
  assert.equal(render.imageUpscaled(style,asset,8192,8192),true);
  assert.equal(render.imageUpscaled(model.preset('deco'),asset,8192,8192),false);
});
