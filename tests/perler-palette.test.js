const test = require('node:test');
const assert = require('node:assert/strict');
const palette = require('../utils/perler/palette');

test('参考色板包含 MARD 等色号，缺失映射不生成无效色号', () => {
  const mard = palette.getPalette('MARD');
  assert.ok(mard.length > 100);
  assert.ok(mard.some(c => c.key === 'A01' && c.color === '#FAF4C8'));
  assert.ok(palette.getPalette('COCO').every(c => c.key && /^#[0-9a-f]{6}$/i.test(c.color)));
});

test('不认识的色板需要明确报错', () => {
  assert.throws(() => palette.getPalette('missing'));
});

test('色板数据通过小程序支持的 JavaScript 模块加载', () => {
  const fs=require('node:fs');
  const source=fs.readFileSync(require.resolve('../utils/perler/palette'),'utf8');
  assert.doesNotMatch(source,/require\([^)]*\.json/);
});
