// 绘制目标由调用者提供，既可用于小程序 Canvas 2D，也可用于测试。
var LIMIT_SIDE = 8192;
var LIMIT_PIXELS = 16000000;

function createPlan(data, options) {
  options = options || {};
  if (!data || !Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width < 1 || data.height < 1 || !Array.isArray(data.cells) || data.cells.length !== data.width * data.height) throw new Error('无效的图纸网格');
  var references = Object.create(null);
  data = { width:data.width, height:data.height, cells:data.cells.map(function (cell) {
    if (cell == null) return null;
    if (typeof cell.key !== 'string' || !/^#[0-9a-f]{6}$/i.test(cell.color)) throw new Error('无效的豆子颜色');
    var id = cell.key + '\u0000' + cell.color;
    if (!references[id]) references[id] = { key:cell.key, color:cell.color };
    return references[id];
  }) };
  var automaticSize = options.cellSize === undefined;
  var cellSize = automaticSize ? 48 : Number(options.cellSize);
  if (!Number.isFinite(cellSize) || cellSize < 12 || cellSize > 128) throw new Error('无效的导出尺寸');
  cellSize = Math.round(cellSize);
  var interval = options.gridInterval === undefined ? 10 : Number(options.gridInterval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 1000) throw new Error('网格间隔无效');
  var split = options.tileSize !== undefined && options.tileSize !== null;
  var tileSize = split ? Number(options.tileSize) : Math.max(data.width, data.height);
  if (!Number.isInteger(tileSize) || tileSize < 1) throw new Error('分块大小无效');
  var opts = { hideNumbers:!!options.hideNumbers, includeStats:options.includeStats !== false, mirror:!!options.mirror, showCoordinates:options.showCoordinates !== false, showGrid:options.showGrid !== false, gridInterval:interval, cellSize:cellSize, split:split };
  var pages = [];
  for (var y = 0; y < data.height; y += tileSize) for (var x = 0; x < data.width; x += tileSize) {
    var w = Math.min(tileSize, data.width - x), h = Math.min(tileSize, data.height - y), counts = {}, colors = {};
    for (var yy = y; yy < y + h; yy++) for (var xx = x; xx < x + w; xx++) {
      var item = data.cells[yy * data.width + (opts.mirror ? data.width - 1 - xx : xx)];
      if (item) {
        if (typeof item.key !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color)) throw new Error('无效的豆子颜色');
        counts[item.key] = (counts[item.key] || 0) + 1; colors[item.key] = item.color;
      }
    }
    var keys = Object.keys(counts).sort();
    pages.push({x:x,y:y,width:w,height:h,counts:counts,colors:colors,keys:keys});
  }
  function layout(size, page) {
    var factor=size/20, margin=Math.ceil((opts.showCoordinates?30:8)*factor);
    var width=Math.ceil(Math.max(page.width*size+margin*2,opts.includeStats&&page.keys.length?360*factor:0));
    var height=Math.ceil(page.height*size+margin*2+(opts.includeStats&&page.keys.length?(35+Math.ceil(page.keys.length/3)*28)*factor:0));
    return {margin:margin,pixelWidth:width,pixelHeight:height};
  }
  function fits(size) {return pages.every(function(page){var l=layout(size,page);return l.pixelWidth<=LIMIT_SIDE&&l.pixelHeight<=LIMIT_SIDE&&l.pixelWidth*l.pixelHeight<=LIMIT_PIXELS;});}
  while(automaticSize&&cellSize>12&&!fits(cellSize))cellSize--;
  if(!fits(cellSize))throw new Error('图纸过大，请选择分块导出');
  opts.cellSize=cellSize;
  pages.forEach(function(page){Object.assign(page,layout(cellSize,page));});
  return { data:data, options:opts, pages:pages };
}

function ink(hex) {
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140 ? '#ffffff' : '#202020';
}

function drawPage(ctx, plan, pageIndex) {
  var page = plan.pages[pageIndex];
  if (!page) throw new Error('无效的导出页');
  var opts = plan.options, data = plan.data, size = opts.cellSize, m = page.margin, factor=size/20;
  ctx.save(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,page.pixelWidth,page.pixelHeight);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  for (var y=0; y<page.height; y++) for (var x=0; x<page.width; x++) {
    var gx=page.x+x, gy=page.y+y;
    var cell=data.cells[gy*data.width+(opts.mirror ? data.width-1-gx : gx)];
    if (!cell) continue;
    ctx.fillStyle=cell.color; ctx.fillRect(m+x*size,m+y*size,size,size);
    if (!opts.hideNumbers) { ctx.fillStyle=ink(cell.color); ctx.font=Math.max(8,Math.floor(size*0.35))+'px sans-serif'; ctx.fillText(cell.key,m+(x+.5)*size,m+(y+.5)*size); }
  }
  if (opts.showGrid) {
    ctx.strokeStyle='#a4a9a6'; ctx.lineWidth=0.5*factor; ctx.beginPath();
    for (var i=0;i<=page.width;i++) {ctx.moveTo(m+i*size,m);ctx.lineTo(m+i*size,m+page.height*size);}
    for (var j=0;j<=page.height;j++) {ctx.moveTo(m,m+j*size);ctx.lineTo(m+page.width*size,m+j*size);}
    ctx.stroke();
    if (!opts.split) {
      ctx.strokeStyle='#575d59'; ctx.lineWidth=1.5*factor; ctx.beginPath();
      for (i=opts.gridInterval;i<page.width;i+=opts.gridInterval) {ctx.moveTo(m+i*size,m);ctx.lineTo(m+i*size,m+page.height*size);}
      for (j=opts.gridInterval;j<page.height;j+=opts.gridInterval) {ctx.moveTo(m,m+j*size);ctx.lineTo(m+page.width*size,m+j*size);}
      ctx.stroke();
    }
  }
  if (opts.showCoordinates) {
    ctx.fillStyle='#464b47'; ctx.font=Math.round(10*factor)+'px sans-serif';
    for (i=0;i<page.width;i++) ctx.fillText(String(page.x+i+1),m+(i+.5)*size,m-12*factor);
    for (j=0;j<page.height;j++) ctx.fillText(String(page.y+j+1),m-14*factor,m+(j+.5)*size);
  }
  if (opts.includeStats && page.keys.length) {
    var top=m+page.height*size+22*factor, colWidth=(page.pixelWidth-16*factor)/3;
    ctx.fillStyle='#333333'; ctx.font='bold '+Math.round(14*factor)+'px sans-serif'; ctx.textAlign='left'; ctx.fillText(opts.split ? '本块色号统计' : '色号统计',8*factor,top);
    page.keys.forEach(function (key,index) {
      var sx=8*factor+(index%3)*colWidth, sy=top+(22+Math.floor(index/3)*28)*factor;
      ctx.fillStyle=page.colors[key]; ctx.fillRect(sx,sy-7*factor,14*factor,14*factor);
      ctx.fillStyle='#333333'; ctx.font=Math.round(12*factor)+'px sans-serif'; ctx.fillText(key+' × '+page.counts[key],sx+19*factor,sy);
    });
  }
  ctx.restore();
}

module.exports = { createPlan:createPlan, drawPage:drawPage, LIMIT_SIDE:LIMIT_SIDE, LIMIT_PIXELS:LIMIT_PIXELS };
