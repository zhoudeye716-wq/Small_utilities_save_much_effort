'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../utils/seating/geometry');
test('旋转接近直角时吸附到 90 度倍数，远离时保留自由角度', () => {
  assert.equal(geometry.snapAngle(86),90);assert.equal(geometry.snapAngle(184),180);
  assert.equal(geometry.snapAngle(359),360);assert.equal(geometry.snapAngle(77),77);
});
test('门和墙壁靠近场地边界时吸附最近的外侧边', () => {
  const venue={widthMetres:10,heightMetres:5,unitsPerMetre:100};
  assert.deepEqual(geometry.snapObjectToVenue({kind:'wall',points:[{x:3,y:200},{x:23,y:230}]},venue,10),{dx:-3,dy:0,axis:'x',edge:0});
  assert.deepEqual(geometry.snapObjectToVenue({kind:'door',points:[{x:960,y:494},{x:990,y:494}]},venue,10),{dx:0,dy:6,axis:'y',edge:500});
  assert.equal(geometry.snapObjectToVenue({kind:'stage',points:[{x:1,y:0}]},venue,10),null);
});
test('从场地外侧也可吸附，但不会吸附到边界延长线', () => {
  const v={widthMetres:10,heightMetres:5,unitsPerMetre:100};
  assert.deepEqual(geometry.snapObjectToVenue({kind:'wall',points:[{x:1005,y:200},{x:1025,y:230}]},v,10),{dx:-5,dy:0,axis:'x',edge:1000});
  assert.equal(geometry.snapObjectToVenue({kind:'wall',points:[{x:4,y:800},{x:20,y:900}]},v,10),null);
});
test('未标定时不能把画布尺寸当成真实米数', () => {
  assert.equal(geometry.toMetres(200, null), null);
  assert.equal(geometry.toMetres(200, 0), null);
});
test('相同比例下场地与桌子单位一致，米数可逆转换', () => {
  assert.equal(geometry.toWorld(1.8, 100), 180);
  assert.equal(geometry.toMetres(180, 100), 1.8);
});
test('旋转并缩放场地线条时保持中心位置', () => {
  const points=[{x:0,y:0},{x:100,y:0}];
  const transformed=geometry.transformPoints(points,200,0,90);
  assert.ok(Math.abs(transformed[0].x-50)<1e-8 && Math.abs(transformed[1].x-50)<1e-8);
  assert.ok(Math.abs(transformed[0].y+100)<1e-8 && Math.abs(transformed[1].y-100)<1e-8);
});
test('非零尺寸不能缩到零导致图形意外消失', () => {
  assert.throws(()=>geometry.transformPoints([{x:0,y:0},{x:100,y:20}],0,20,0));
});
