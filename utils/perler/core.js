function gridDimensions(width, height, columns) {
  if (!(isFinite(width) && isFinite(height) && isFinite(columns) && width > 0 && height > 0 && columns >= 1)) throw new Error('无效的图片尺寸');
  columns = Math.round(columns);
  var rows = Math.max(1, Math.round(height * columns / width));
  if (columns * rows > 360000) throw new Error('图纸过大，请减少网格数量');
  return { width: columns, height: rows };
}

function toRgb(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('无效的色板颜色');
  var value = parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Oklab 匹配和区域代表色参照 Zippland/perler-beads（AGPL-3.0）。
function toLab(rgb) {
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  var r=lin(rgb[0]), g=lin(rgb[1]), b=lin(rgb[2]);
  var l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
  var m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
  var s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
  return [0.2104542553*l+0.793617785*m-0.0040720468*s,1.9779984951*l-2.428592205*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.808675766*s];
}
function distanceSquared(a,b) {
  var l=a[0]-b[0], x=a[1]-b[1], y=a[2]-b[2];
  return l*l+x*x+y*y;
}

// 推断最常见边缘颜色，再仅移除与边缘相连的相近像素。
function removeEdgeBackground(rgba, width, height, tolerance) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || !rgba || rgba.length!==width*height*4) throw new Error('无效的图片数据');
  if (typeof tolerance!=='number' || !isFinite(tolerance) || tolerance<0 || tolerance>100) throw new Error('无效的去背景容差');
  var total=width*height, output=new Uint8ClampedArray(rgba), buckets=Object.create(null), best=null;
  function countEdge(index) {
    var p=index*4; if(rgba[p+3]<128) return;
    var rgb=(rgba[p]<<16)|(rgba[p+1]<<8)|rgba[p+2];
    var bin=((rgba[p]>>3)<<10)|((rgba[p+1]>>3)<<5)|(rgba[p+2]>>3);
    var bucket=buckets[bin];
    if(!bucket) bucket=buckets[bin]={count:0,colors:Object.create(null),max:0,representative:rgb};
    bucket.count++;
    var n=(bucket.colors[rgb]||0)+1; bucket.colors[rgb]=n;
    if(n>bucket.max) {bucket.max=n;bucket.representative=rgb;}
    if(!best || bucket.count>best.count) best=bucket;
  }
  var x,y;
  for(x=0;x<width;x++) {countEdge(x); if(height>1) countEdge((height-1)*width+x);}
  for(y=1;y<height-1;y++) {countEdge(y*width); if(width>1) countEdge(y*width+width-1);}
  if(!best) return output;
  var rgb=best.representative, background=toLab([(rgb>>16)&255,(rgb>>8)&255,rgb&255]), limit=tolerance*tolerance/10000;
  var queue=new Int32Array(total), seen=new Uint8Array(total), head=0,tail=0, cache=Object.create(null),cacheSize=0;
  function enqueue(index) {
    if(seen[index]) return; seen[index]=1;
    var p=index*4;
    if(rgba[p+3]>=128) {
      var color=(rgba[p]<<16)|(rgba[p+1]<<8)|rgba[p+2], match=cache[color];
      if(match===undefined) {
        match=distanceSquared(background,toLab([rgba[p],rgba[p+1],rgba[p+2]]))<=limit;
        if(cacheSize<50000) {cache[color]=match;cacheSize++;}
      }
      if(!match) return;
    }
    output[p+3]=0;queue[tail++]=index;
  }
  for(x=0;x<width;x++) {enqueue(x);if(height>1) enqueue((height-1)*width+x);}
  for(y=1;y<height-1;y++) {enqueue(y*width);if(width>1) enqueue(y*width+width-1);}
  while(head<tail) {
    var index=queue[head++], col=index%width, row=Math.floor(index/width);
    if(col>0) enqueue(index-1);if(col+1<width) enqueue(index+1);
    if(row>0) enqueue(index-width);if(row+1<height) enqueue(index+width);
  }
  return output;
}

function mergeSimilarColors(cells, threshold) {
  threshold=Number(threshold) || 0;
  if (threshold <= 0) return cells.slice();
  var groups=Object.create(null), order=[];
  cells.forEach(function(cell) {
    if (!cell) return;
    var key=cell.color.toUpperCase();
    if (!groups[key]) { groups[key]={cell:cell,count:0,lab:toLab(toRgb(cell.color)), index:order.length}; order.push(groups[key]); }
    groups[key].count++;
  });
  order.sort(function(a,b) { return b.count-a.count || a.index-b.index; });
  var keep=[], replacements=Object.create(null), limit=threshold*threshold/10000;
  order.forEach(function(group) {
    var best=null, distance=Infinity;
    keep.forEach(function(candidate) { var d=distanceSquared(group.lab,candidate.lab); if(d <= limit && d < distance) {best=candidate;distance=d;} });
    if (!best) { keep.push(group); best=group; }
    replacements[group.cell.color.toUpperCase()]=best.cell;
  });
  return cells.map(function(cell) { return cell ? replacements[cell.color.toUpperCase()] : null; });
}

function createPixelJob(image, width, height, palette, options) {
  options=options || {};
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width<1 || image.height<1 || !image.data || image.data.length!==image.width*image.height*4) throw new Error('无效的图片数据');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || width*height>360000) throw new Error('无效的图纸尺寸');
  if (options.mode && options.mode !== 'dominant' && options.mode !== 'average') throw new Error('无效的采样模式');
  var excludes=(options.excludeColors || []).map(function(color) { return color.toUpperCase(); });
  var colors=(palette || []).filter(function(item) { return excludes.indexOf(item.color.toUpperCase())<0; }).map(function(item) { return {item:item,lab:toLab(toRgb(item.color))}; });
  if (!colors.length) throw new Error('色板不能为空');
  var data=image.data, total=width*height, result=new Array(total), current=0, cache=Object.create(null), finalized=false;
  function closest(rgb) {
    var key=(rgb[0]<<16)|(rgb[1]<<8)|rgb[2];
    if (cache[key]) return cache[key];
    var lab=toLab(rgb), best=colors[0].item, min=Infinity;
    for(var i=0;i<colors.length;i++) { var d=distanceSquared(lab,colors[i].lab); if(d<min) {min=d;best=colors[i].item;} if(d===0) break; }
    cache[key]=best; return best;
  }
  function calculate(index) {
    var x=index%width,y=Math.floor(index/width), x0=Math.floor(x*image.width/width), x1=Math.min(image.width,Math.ceil((x+1)*image.width/width));
    var y0=Math.floor(y*image.height/height), y1=Math.min(image.height,Math.ceil((y+1)*image.height/height));
    var counts=Object.create(null), largest=0, chosen=0, n=0, rs=0,gs=0,bs=0;
    for(var yy=y0;yy<y1;yy++) for(var xx=x0;xx<x1;xx++) {
      var p=(yy*image.width+xx)*4; if(data[p+3]<128) continue;
      var r=data[p],g=data[p+1],b=data[p+2]; n++;
      if(options.mode==='average') {rs+=r;gs+=g;bs+=b;} else {var key=(r<<16)|(g<<8)|b;var count=(counts[key]||0)+1;counts[key]=count;if(count>largest){largest=count;chosen=key;}}
    }
    if (!n) return null;
    return closest(options.mode==='average' ? [Math.round(rs/n),Math.round(gs/n),Math.round(bs/n)] : [(chosen>>16)&255,(chosen>>8)&255,chosen&255]);
  }
  return {
    step:function(maxCells) {
      if (!Number.isInteger(maxCells) || maxCells<1) throw new Error('无效的分片大小');
      var end=Math.min(total,current+maxCells);
      while(current<end) { result[current]=calculate(current); current++; }
      if(current===total && !finalized) { if(options.mergeThreshold>0) result=mergeSimilarColors(result,options.mergeThreshold); finalized=true; }
      return {done:finalized,processed:current,total:total};
    },
    result:function() { if(!finalized) throw new Error('计算未完成'); return result.slice(); }
  };
}
function pixelate(image,width,height,palette,options) {
  var job=createPixelJob(image,width,height,palette,options);
  job.step(width*height);
  return job.result();
}

function mapPixels(rgba, width, height, palette) {
  return pixelate({data:rgba,width:width,height:height},width,height,palette);
}

function countColors(cells) {
  var counts = {};
  cells.forEach(function (cell) { if (cell) counts[cell.key] = (counts[cell.key] || 0) + 1; });
  return counts;
}

function mirrorGrid(cells, width, height) {
  var result = [];
  for (var y = 0; y < height; y++) for (var x = width - 1; x >= 0; x--) result.push(cells[y * width + x]);
  return result;
}

function makeTiles(width, height, size) {
  if (!(isFinite(width) && isFinite(height) && isFinite(size) && width > 0 && height > 0 && size >= 1)) throw new Error('无效的分块大小');
  size = Math.floor(size);
  var result = [];
  for (var y = 0; y < height; y += size) for (var x = 0; x < width; x += size) {
    result.push({ x: x, y: y, width: Math.min(size, width - x), height: Math.min(size, height - y) });
  }
  return result;
}

function clampScale(value, min, max) { return Math.max(min, Math.min(max, value)); }
function fineTuneScale(scale, distance, sensitivity) {
  return Math.round(scale * (1 + distance * sensitivity) * 1000000) / 1000000;
}

module.exports = { gridDimensions: gridDimensions, mapPixels: mapPixels, countColors: countColors, mirrorGrid: mirrorGrid, makeTiles: makeTiles, clampScale: clampScale, fineTuneScale: fineTuneScale, createPixelJob:createPixelJob, pixelate:pixelate, mergeSimilarColors:mergeSimilarColors, removeEdgeBackground:removeEdgeBackground };
