const test = require('node:test');
const assert = require('node:assert/strict');
const crop = require('../utils/perler/crop');
const palettes = require('../utils/perler/palette');
const presets = require('../utils/perler/mard-presets');

test('常用色数按用户指定的顺序排列', () => {
  assert.deepEqual(presets.sizes,[313,221,168,144,120,96,72,48,24]);
});

test('高级色数使用有完整成员的套装色卡', () => {
  assert.deepEqual(presets.extraSizes,[291,280,264,216,192]);
  for (const size of presets.extraSizes) assert.equal(palettes.getPalette('MARD',size).length,size);
  assert.ok(palettes.getPalette('MARD',264).some(c=>c.key==='R13'));
  assert.ok(!palettes.getPalette('MARD',264).some(c=>c.key==='R14'));
  assert.ok(!palettes.getPalette('MARD',264).some(c=>c.key==='C29'));
});

test('最大居中正方形裁剪和矩形图纸都保持比例', () => {
  assert.deepEqual(crop.initialSquare(1200, 800), {x:200,y:0,width:800,height:800});
  assert.deepEqual(crop.initialSquare(800, 1200), {x:0,y:200,width:800,height:800});
  assert.deepEqual(crop.gridDimensions(400, 800, 52), {width:26,height:52});
  assert.deepEqual(crop.gridDimensions(800, 400, 104), {width:104,height:52});
});

test('移动和调整裁剪框时保持在原图内', () => {
  const area={width:1200,height:800};
  const rect={x:200,y:0,width:800,height:800};
  assert.deepEqual(crop.move(rect, 900, 20, area), {x:400,y:0,width:800,height:800});
  assert.deepEqual(crop.resize(rect, 'right', -300, 0, area), {x:200,y:0,width:500,height:800});
  assert.deepEqual(crop.resize(rect, 'bottom', 0, -300, area), {x:200,y:0,width:800,height:500});
});

test('MARD 色数预设提供真实色号成员并排除扩展色', () => {
  const p = palettes.getPalette('MARD', 221);
  assert.equal(p.length, 221);
  assert.ok(p.some(c=>c.key==='A01'));
  assert.ok(!p.some(c=>/^P|^Q|^R|^T|^Y|^Z/.test(c.key)));
  assert.equal(palettes.getPalette('MARD', 24).length,24);
  assert.equal(palettes.getPalette('MARD',168).length,168);
  assert.ok(palettes.getPalette('MARD',168).some(c=>c.key==='H17'));
  assert.ok(!palettes.getPalette('MARD',144).some(c=>c.key==='H17'));
  assert.ok(palettes.getPalette('MARD', 24).some(c=>c.key==='H07'));
  assert.ok(!palettes.getPalette('MARD',24).some(c=>c.key==='A01'));
  assert.equal(palettes.getPalette('MARD',280).length,280);
  assert.ok(palettes.getPalette('MARD',280).some(c=>c.key==='Q02'));
  assert.ok(!palettes.getPalette('MARD',280).some(c=>c.key==='Q01'||/^ZG/.test(c.key)));
  assert.equal(palettes.getPalette('MARD',313).length,313);
  assert.ok(palettes.getPalette('MARD',313).some(c=>c.key==='L08'));
  assert.ok(!palettes.getPalette('MARD',291).some(c=>c.key==='L08'));
});
