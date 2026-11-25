'use strict';
var planner = require('./export-plan');
function invoke(api, name, options, page) {
  return new Promise(function(resolve, reject) {
    var done = false, timer = setTimeout(function() { finish(new Error('导出操作超时')); }, 30000);
    function finish(error, value) { if (done) return; done = true; clearTimeout(timer); if (error) reject(error); else resolve(value); }
    var args = Object.assign({}, options, { success: function(result) { finish(null, result); }, fail: function(error) { finish(new Error((error && error.errMsg) || '导出操作失败')); } });
    try { api[name](args, page); } catch (error) { finish(error); }
  });
}
async function save(api, canvas, options, draw, page, onProgress) {
  var maxSide = options.maxSide, attempts = 0;
  while (true) {
    var parts = planner.tiles(options.width, options.height, maxSide, options.maxPixels), saved = 0, retry = false;
    for (var i = 0; i < parts.length; i++) {
      var stage = 'render';
    try {
      var part = parts[i]; canvas.width = part.width; canvas.height = part.height;
      await draw(part, canvas);
      await new Promise(function(resolve) { setTimeout(resolve, 30); });
      var result = await invoke(api, 'canvasToTempFilePath', { canvas: canvas, x: 0, y: 0, width: part.width, height: part.height, destWidth: part.width, destHeight: part.height, fileType: 'png' }, page);
      if (!result || !result.tempFilePath) throw new Error('生成图片失败');
      stage = 'save';
      await invoke(api, 'saveImageToPhotosAlbum', { filePath: result.tempFilePath }, page);
      saved++;
      if (onProgress) onProgress(saved, parts.length, part, parts, result.tempFilePath);
    } catch (error) {
      if (stage === 'render' && !saved && attempts < 3 && maxSide > 1) { maxSide = Math.max(1, Math.floor(maxSide / 2)); attempts++; retry = true; break; }
      var failure = new Error('已保存 ' + saved + ' / ' + parts.length + ' 张；' + (error.message || '导出失败'));
      failure.saved = saved; failure.total = parts.length; throw failure;
    }
    }
    if (!retry) return { saved: saved, total: parts.length };
  }
}
module.exports = { save: save };
