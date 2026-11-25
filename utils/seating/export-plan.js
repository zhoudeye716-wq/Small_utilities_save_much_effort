'use strict';
function valid(n) { return Number.isFinite(n) && n > 0; }
function printPixels(widthMetres, heightMetres, dpi) {
  if (!valid(widthMetres) || !valid(heightMetres) || !valid(dpi)) throw new Error('打印尺寸或清晰度无效');
  var w = Math.round(widthMetres / 0.0254 * dpi), h = Math.round(heightMetres / 0.0254 * dpi);
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1) throw new Error('导出尺寸无效');
  return { width: w, height: h };
}
function linkedHeight(sourceWidth, sourceHeight, width) {
  if (!valid(sourceWidth) || !valid(sourceHeight) || !valid(width)) throw new Error('尺寸无效');
  return Math.round(width * sourceHeight / sourceWidth);
}
function tiles(width, height, maxSide, maxPixels) {
  if (![width, height, maxSide, maxPixels].every(function(n) { return Number.isSafeInteger(n) && n > 0; })) throw new Error('导出尺寸无效');
  var tw = Math.min(width, maxSide, maxPixels), th = Math.min(height, maxSide, Math.floor(maxPixels / tw));
  var count = Math.ceil(width / tw) * Math.ceil(height / th);
  if (!Number.isSafeInteger(count) || count > 10000) throw new Error('导出分块过多');
  var result = [];
  for (var y = 0; y < height; y += th) for (var x = 0; x < width; x += tw) result.push({ x: x, y: y, width: Math.min(tw, width - x), height: Math.min(th, height - y) });
  return result;
}
function fit(sourceWidth, sourceHeight, targetWidth, targetHeight, position) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(valid)) throw new Error('尺寸无效');
  var scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight), width = sourceWidth * scale, height = sourceHeight * scale;
  var p = Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : 0.5;
  return { x: (targetWidth - width) * p, y: (targetHeight - height) * p, width: width, height: height };
}
function describeTiles(parts,width,height,printWidth,printHeight,unit){
  return parts.map(function(part,index){var info={index:index+1,x:part.x,y:part.y,width:part.width,height:part.height};if(valid(printWidth)&&valid(printHeight)){info.printWidth=Number((printWidth*part.width/width).toFixed(6));info.printHeight=Number((printHeight*part.height/height).toFixed(6));info.unit=unit;}return info;});
}
module.exports = { printPixels: printPixels, linkedHeight: linkedHeight, tiles: tiles, fit: fit,describeTiles:describeTiles };
