'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const output = require('../utils/seating/wx-export');
test('分块逐张保存并保留全局偏移，覆盖目标图片', async () => {
  const tiles = [], saved = [];
  const api = { canvasToTempFilePath: o => o.success({ tempFilePath: 'file' + tiles.length }), saveImageToPhotosAlbum: o => { saved.push(o.filePath); o.success(); } };
  const canvas = {};
  const result = await output.save(api, canvas, { width: 8, height: 4, maxSide: 4, maxPixels: 16 }, tile => tiles.push(tile), null);
  assert.deepEqual(result, { saved: 2, total: 2 });
  assert.deepEqual(tiles.map(t => [t.x, t.y, t.width, t.height]), [[0,0,4,4],[4,0,4,4]]);
  assert.equal(saved.length, 2);
});
test('相册保存失败时报告已经保存数量，不声称全部成功', async () => {
  let count = 0;
  const api = { canvasToTempFilePath: o => o.success({ tempFilePath: 'file' }), saveImageToPhotosAlbum: o => { if (++count === 2) o.fail({ errMsg: 'denied' }); else o.success(); } };
  await assert.rejects(output.save(api, {}, { width: 8, height: 4, maxSide: 4, maxPixels: 16 }, () => {}, null), e => e.saved === 1 && e.total === 2);
});
test('整图渲染失败且尚未保存时自动缩小切块重试', async () => {
  const api = { canvasToTempFilePath: o => o.width > 4 ? o.fail({errMsg:'canvas too large'}) : o.success({tempFilePath:'file'}), saveImageToPhotosAlbum: o => o.success() };
  const result = await output.save(api, {}, { width: 8, height: 4, maxSide: 8, maxPixels: 32 }, () => {}, null);
  assert.deepEqual(result, { saved: 2, total: 2 });
});
