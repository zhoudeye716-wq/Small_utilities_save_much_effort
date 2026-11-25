'use strict';
var model=require('./style-model');
function dimensions(w,h){return typeof w==='number' && isFinite(w) && w>0 && typeof h==='number' && isFinite(h) && h>0;}
function drawBackground(ctx,w,h,style){if(!dimensions(w,h))return;var s=model.normalize(style);ctx.save();ctx.fillStyle=s.background;ctx.fillRect(0,0,w,h);ctx.restore();}
function drawFrame(ctx,w,h,style){
  if(!dimensions(w,h))return;var f=model.normalize(style).frame;if(f.kind==='none'||!f.width)return;
  var unit=Math.min(w,h),inset=f.inset*unit,step=unit*0.012;
  ctx.save();ctx.strokeStyle=f.color;ctx.lineWidth=f.width*unit;
  function border(n){var x=inset+n,y=inset+n; if(w-2*x<=0||h-2*y<=0)return;ctx.beginPath();ctx.rect(x,y,w-2*x,h-2*y);ctx.stroke();}
  border(0);if(f.kind==='double'||f.kind==='deco')border(step);
  if(f.kind==='deco'){
    var corners=[[inset,inset,1,1],[w-inset,inset,-1,1],[inset,h-inset,1,-1],[w-inset,h-inset,-1,-1]];
    corners.forEach(function(c){ctx.beginPath();ctx.moveTo(c[0]+c[2]*step*3,c[1]);ctx.lineTo(c[0]+c[2]*step*3,c[1]+c[3]*step*3);ctx.lineTo(c[0],c[1]+c[3]*step*3);ctx.stroke();});
  }
  ctx.restore();
}
function path(ctx,points,close){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(var i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);if(close)ctx.closePath();ctx.stroke();}
function leaf(ctx,x,y,angle){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(0.18,-0.18,0.35,-0.04);ctx.quadraticCurveTo(0.16,0.08,0,0);ctx.stroke();ctx.restore();}
function bloom(ctx,x,y,r,petals){
  ctx.save();ctx.translate(x,y);ctx.scale(r,r);
  for(var i=0;i<petals;i++){ctx.save();ctx.rotate(i*Math.PI*2/petals);ctx.beginPath();ctx.moveTo(0,-0.12);ctx.bezierCurveTo(-0.4,-0.32,-0.3,-0.92,0,-0.9);ctx.bezierCurveTo(0.3,-0.92,0.4,-0.32,0,-0.12);ctx.stroke();ctx.restore();}
  ctx.beginPath();ctx.arc(0,0,0.13,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,0,0.045,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawShape(ctx,kind){
  var i,a;
  if(kind==='flower'){
    path(ctx,[[0,0.48],[0,-0.08]]);leaf(ctx,0,0.25,-2.5);leaf(ctx,0,0.12,-0.55);
    for(i=0;i<5;i++){ctx.save();ctx.rotate(i*Math.PI*2/5);ctx.beginPath();ctx.moveTo(0,-0.08);ctx.bezierCurveTo(-0.18,-0.24,-0.11,-0.43,0,-0.4);ctx.bezierCurveTo(0.11,-0.43,0.18,-0.24,0,-0.08);ctx.stroke();ctx.restore();}
    ctx.beginPath();ctx.arc(0,-0.08,0.04,0,Math.PI*2);ctx.fill();
    bloom(ctx,-0.19,-0.3,0.13,5);leaf(ctx,0,0.36,-0.45);
  }else if(kind==='leaf'){
    path(ctx,[[0,0.48],[0,-0.45]]);for(i=0;i<4;i++){leaf(ctx,0,0.32-i*0.2,-2.6);leaf(ctx,0,0.22-i*0.2,-0.55);}
    for(i=0;i<4;i++){ctx.beginPath();ctx.arc(0.09,0.3-i*0.2,0.018,0,Math.PI*2);ctx.fill();}
  }else if(kind==='bouquet'){
    for(i=0;i<3;i++){ctx.beginPath();ctx.moveTo(0,0.48);ctx.quadraticCurveTo((i-1)*0.18,0.12,(i-1)*0.24,-0.21);ctx.stroke();}
    bloom(ctx,-0.24,-0.23,0.23,6);bloom(ctx,0.02,-0.31,0.24,7);bloom(ctx,0.26,-0.19,0.2,6);
    leaf(ctx,-0.05,0.21,-2.5);leaf(ctx,0.04,0.3,-0.55);leaf(ctx,0.1,0.04,-0.4);
    path(ctx,[[-0.11,0.38],[0.12,0.42],[-0.08,0.45]]);
  }else if(kind==='vine'){
    ctx.beginPath();ctx.moveTo(-0.42,0.42);ctx.bezierCurveTo(-0.25,0.1,0.22,0.08,0.35,-0.46);ctx.stroke();
    for(i=0;i<5;i++){var vx=-0.3+i*0.14,vy=0.28-i*0.16;leaf(ctx,vx,vy,-2.5);leaf(ctx,vx+0.03,vy-0.06,-0.45);}
    bloom(ctx,0.36,-0.39,0.12,5);
  }else if(kind==='blossom'){
    bloom(ctx,-0.15,-0.12,0.28,7);bloom(ctx,0.22,0.18,0.2,6);bloom(ctx,0.27,-0.28,0.12,5);
    leaf(ctx,-0.12,0.18,-2.4);leaf(ctx,0.02,0.2,-0.35);
  }else if(kind==='ink'){
    ctx.lineWidth=0.025;path(ctx,[[-0.05,0.5],[0,-0.48]]);path(ctx,[[0.15,0.5],[0.2,-0.35]]);ctx.lineWidth=0.012;
    for(i=0;i<4;i++){leaf(ctx,0,0.3-i*0.2,-2.7);leaf(ctx,0.18,0.25-i*0.2,-0.45);}
    for(i=0;i<4;i++){path(ctx,[[-0.08,0.3-i*0.2],[0.02,0.3-i*0.2]]);path(ctx,[[0.13,0.25-i*0.2],[0.22,0.25-i*0.2]]);}
  }else if(kind==='fan'){
    ctx.beginPath();ctx.arc(0,0.36,0.72,Math.PI*1.18,Math.PI*1.82);ctx.lineTo(0,0.36);ctx.closePath();ctx.stroke();
    for(i=0;i<=6;i++){a=Math.PI*(1.18+0.64*i/6);path(ctx,[[0,0.36],[Math.cos(a)*0.72,0.36+Math.sin(a)*0.72]]);}
    ctx.beginPath();ctx.arc(0,0.36,0.56,Math.PI*1.18,Math.PI*1.82);ctx.stroke();
  }else if(kind==='seal'){
    ctx.lineWidth=0.04;ctx.strokeRect(-0.38,-0.38,0.76,0.76);ctx.lineWidth=0.025;
    path(ctx,[[-0.23,-0.2],[0.23,-0.2]]);path(ctx,[[0,-0.26],[0,0.24]]);path(ctx,[[-0.23,0.06],[0.23,0.06]]);path(ctx,[[-0.2,0.25],[0.2,0.25]]);
  }else if(kind==='waves'){
    for(i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-0.48,-0.35+i*0.17);for(var j=0;j<4;j++)ctx.quadraticCurveTo(-0.36+j*0.24,-0.46+i*0.17,-0.24+j*0.24,-0.35+i*0.17);ctx.stroke();}
  }else if(kind==='geometry'){
    path(ctx,[[0,-0.48],[0.36,0],[0,0.48],[-0.36,0]],true);path(ctx,[[-0.18,-0.3],[0.48,-0.3],[0.18,0.3],[-0.48,0.3]],true);
    path(ctx,[[0,-0.3],[0.23,0],[0,0.3],[-0.23,0]],true);ctx.beginPath();ctx.arc(0,0,0.09,0,Math.PI*2);ctx.stroke();
  }else if(kind==='lattice'){
    for(i=0;i<5;i++){var off=-0.4+i*0.2;path(ctx,[[off,-0.48],[off,0.48]]);path(ctx,[[-0.48,off],[0.48,off]]);}
    for(i=0;i<3;i++){var side=0.4-i*0.12;path(ctx,[[0,-side],[side,0],[0,side],[-side,0]],true);}
  }else if(kind==='orbit'){
    for(i=0;i<4;i++){ctx.save();ctx.rotate(i*Math.PI/4);ctx.scale(1,0.48);ctx.beginPath();ctx.arc(0,0,0.43,0,Math.PI*2);ctx.stroke();ctx.restore();}
    ctx.beginPath();ctx.arc(0,0,0.055,0,Math.PI*2);ctx.fill();
  }else if(kind==='arch'){
    for(i=0;i<3;i++){var r=0.45-i*0.1;ctx.beginPath();ctx.moveTo(-r,0.48);ctx.lineTo(-r,-0.05);ctx.arc(0,-0.05,r,Math.PI,0);ctx.lineTo(r,0.48);ctx.stroke();}
  }else if(kind==='sunburst'){
    ctx.beginPath();ctx.arc(0,0,0.18,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,0,0.08,0,Math.PI*2);ctx.fill();
    for(i=0;i<16;i++){a=i*Math.PI/8;path(ctx,[[Math.cos(a)*0.22,Math.sin(a)*0.22],[Math.cos(a)*(i%2?0.36:0.49),Math.sin(a)*(i%2?0.36:0.49)]]);}
    ctx.beginPath();ctx.arc(0,0,0.27,0,Math.PI*2);ctx.stroke();
  }else if(kind==='steps'){
    for(i=0;i<4;i++){var p=0.08+i*0.1;path(ctx,[[-0.48,p],[ -p,p],[-p,-p],[p,-p],[p,-0.48]]);}
    path(ctx,[[-0.42,0.44],[-0.26,0.44],[-0.26,0.28],[-0.1,0.28]]);
  }else if(kind==='confetti'){
    for(i=0;i<11;i++){a=i*2.399;var radius=0.15+(i%3)*0.13,x=Math.cos(a)*radius,y=Math.sin(a)*radius;ctx.save();ctx.translate(x,y);ctx.rotate(a);path(ctx,[[-0.04,0],[0.04,0]]);ctx.restore();}
    path(ctx,[[-0.06,-0.06],[0.06,0.06]]);path(ctx,[[0.06,-0.06],[-0.06,0.06]]);
  }else if(kind==='firework'){
    for(i=0;i<18;i++){a=i*Math.PI/9;var inner=0.08,outer=i%2?0.32:0.47;path(ctx,[[Math.cos(a)*inner,Math.sin(a)*inner],[Math.cos(a)*outer,Math.sin(a)*outer]]);ctx.beginPath();ctx.arc(Math.cos(a)*outer,Math.sin(a)*outer,0.016,0,Math.PI*2);ctx.fill();}
    ctx.beginPath();ctx.arc(0,0,0.04,0,Math.PI*2);ctx.fill();
  }else if(kind==='ribbon'){
    for(i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-0.48,-0.3+i*0.16);ctx.bezierCurveTo(-0.18,-0.54+i*0.16,0.12,0.48+i*0.16,0.48,0.17+i*0.16);ctx.stroke();}
    for(i=0;i<4;i++){a=i*Math.PI/2;path(ctx,[[0.3+Math.cos(a)*0.04,-0.29+Math.sin(a)*0.04],[0.3+Math.cos(a)*0.09,-0.29+Math.sin(a)*0.09]]);}
  }
}
function drawDecorations(ctx,w,h,style,layer){
  if(!dimensions(w,h)||(layer!=='behind'&&layer!=='front'))return;
  model.normalize(style).decorations.forEach(function(d){if(!d.visible||d.layer!==layer||!d.opacity||!d.scale)return;
    ctx.save();ctx.translate(d.x*w,d.y*h);ctx.rotate(d.rotation*Math.PI/180);var size=Math.min(w,h)*d.scale;ctx.scale(size,size);ctx.globalAlpha=d.opacity;ctx.strokeStyle=d.color;ctx.fillStyle=d.color;ctx.lineWidth=0.014;ctx.lineCap='round';ctx.lineJoin='round';drawShape(ctx,d.kind);ctx.restore();
  });
}
function imageUpscaled(style,image,w,h){
  if(!image||!image.width||!dimensions(w,h))return false;
  var id=model.normalize(style).presetId,unit=Math.min(w,h);
  return id==='floral' ? unit*0.42>image.width : id==='oriental' ? Math.min(w,unit*1.05)>image.width : false;
}
module.exports={drawBackground:drawBackground,drawFrame:drawFrame,drawDecorations:drawDecorations,imageUpscaled:imageUpscaled};
