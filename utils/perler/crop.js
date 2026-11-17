function initialSquare(width,height) {
  if (!(width>0 && height>0)) throw new Error('无效的图片尺寸');
  var side=Math.min(width,height);
  return {x:(width-side)/2,y:(height-side)/2,width:side,height:side};
}
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
function move(rect,dx,dy,area){return {x:clamp(rect.x+dx,0,area.width-rect.width),y:clamp(rect.y+dy,0,area.height-rect.height),width:rect.width,height:rect.height};}
function resize(rect,edge,dx,dy,area){
  var left=rect.x,top=rect.y,right=left+rect.width,bottom=top+rect.height,min=Math.min(20,area.width,area.height);
  if(edge.indexOf('left')>=0)left=clamp(left+dx,0,right-min);
  if(edge.indexOf('right')>=0)right=clamp(right+dx,left+min,area.width);
  if(edge.indexOf('top')>=0)top=clamp(top+dy,0,bottom-min);
  if(edge.indexOf('bottom')>=0)bottom=clamp(bottom+dy,top+min,area.height);
  return {x:left,y:top,width:right-left,height:bottom-top};
}
function gridDimensions(width,height,limit){
  if (!(width>0&&height>0&&limit>=1)) throw new Error('无效的图纸尺寸');
  return {width:Math.max(1,Math.round(limit*width/Math.max(width,height))),height:Math.max(1,Math.round(limit*height/Math.max(width,height)))};
}
module.exports={initialSquare:initialSquare,move:move,resize:resize,gridDimensions:gridDimensions};
