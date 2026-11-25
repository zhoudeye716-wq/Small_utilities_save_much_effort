'use strict';
var planner = require('./export-plan');
var scene = require('./render');
var info = require('./info-layout');
var styles = require('./style-model');
var styleRender = require('./style-render');
var contrast = require('./text-contrast');
function drawStyled(ctx,project,tile,options){
  var w=options.width,h=options.height,s=styles.normalize(options.style),bounds=options.bounds,rect={x:s.map.x*w,y:s.map.y*h,width:s.map.width*w,height:s.map.height*h};
  if(!(rect.width>0&&rect.height>0))throw new Error('场地图显示区域过小');
  var fit=planner.fit(bounds.width,bounds.height,rect.width,rect.height,options.position),area={x:rect.x+fit.x,y:rect.y+fit.y,width:fit.width,height:fit.height};
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.translate(-tile.x,-tile.y);styleRender.drawBackground(ctx,w,h,s);
  if(options.backgroundImage){var image=options.backgroundImage,iw=image.width,ih=image.height;if(iw>0&&ih>0){var scale=Math.max(w/iw,h/ih),sw=w/scale,sh=h/scale;ctx.drawImage(image,(iw-sw)/2,(ih-sh)/2,sw,sh,0,0,w,h);}else ctx.drawImage(image,0,0,w,h);}
  if(s.presetId&&options.styleImage){
    var im=options.styleImage,unit=Math.min(w,h),size;
    if(s.presetId==='floral'){
      size=unit*0.42;ctx.drawImage(im,0,0,size,size*im.height/im.width);
      ctx.save();ctx.translate(w,h);ctx.rotate(Math.PI);ctx.drawImage(im,0,0,size,size*im.height/im.width);ctx.restore();
    }else if(s.presetId==='oriental'){
      size=Math.min(w,unit*1.05);ctx.drawImage(im,0,h-size*im.height/im.width,size,size*im.height/im.width);
      if(options.styleAccent){var accent=options.styleAccent,accentWidth=Math.min(w*0.42,unit*0.48);ctx.drawImage(accent,w-accentWidth,0,accentWidth,accentWidth*accent.height/accent.width);}
    }
  }
  if(!s.presetId)styleRender.drawDecorations(ctx,w,h,s,'behind');
  if(s.presetId==='modern'){
    ctx.save();ctx.fillStyle='#1341bc';ctx.beginPath();ctx.moveTo(w*0.85,0);ctx.lineTo(w,0);ctx.lineTo(w*0.89,h*0.2);ctx.lineTo(w*0.75,h*0.2);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(0,h);ctx.lineTo(w*0.14,h);ctx.lineTo(w*0.18,h*0.96);ctx.lineTo(0,h*0.96);ctx.closePath();ctx.fill();ctx.restore();
  }
  styleRender.drawFrame(ctx,w,h,s);
  if(s.presetId==='deco'){
    ctx.save();ctx.strokeStyle='#d6b870';ctx.lineWidth=Math.min(w,h)*0.0025;
    [[w*0.5,h*0.025,1],[w*0.5,h*0.975,-1]].forEach(function(v){ctx.beginPath();ctx.moveTo(v[0]-w*0.08,v[1]);ctx.lineTo(v[0]-w*0.05,v[1]+v[2]*h*0.045);ctx.lineTo(v[0]+w*0.05,v[1]+v[2]*h*0.045);ctx.lineTo(v[0]+w*0.08,v[1]);ctx.moveTo(v[0]-w*0.025,v[1]);ctx.lineTo(v[0]-w*0.015,v[1]+v[2]*h*0.045);ctx.moveTo(v[0]+w*0.025,v[1]);ctx.lineTo(v[0]+w*0.015,v[1]+v[2]*h*0.045);ctx.stroke();});ctx.restore();
    ctx.save();ctx.strokeStyle='#d6b870';ctx.lineWidth=Math.min(w,h)*0.002;[[1,1],[-1,1]].forEach(function(side){var x=side[0]>0?w*0.04:w*0.96,y=h*0.95;for(var i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+side[0]*w*(0.12+i*0.045),y);ctx.lineTo(x,y-h*(0.065+i*0.035));ctx.stroke();}});ctx.restore();
  }
  if(s.presetId==='modern'||s.presetId==='deco'){ctx.save();ctx.strokeStyle=s.presetId==='modern'?'#21375f':'#d6b870';ctx.lineWidth=Math.min(w,h)*0.0018;ctx.strokeRect(area.x,area.y,area.width,area.height);ctx.restore();}
  ctx.save();ctx.beginPath();ctx.rect(area.x,area.y,area.width,area.height);ctx.clip();ctx.translate(area.x,area.y);ctx.scale(area.width/bounds.width,area.height/bounds.height);ctx.translate(-bounds.x,-bounds.y);scene.drawScene(ctx,project,{outlineText:true,textScale:options.textScale,palette:s.scene});ctx.restore();
  if(!s.presetId)styleRender.drawDecorations(ctx,w,h,s,'front');
  var values=options.eventInfo||[],title=String(values[0]||'').trim(),subtitle=values.slice(1).filter(Boolean).join('  ·  '),size=Math.min(w,h)*0.055*s.title.scale*(options.textScale||1),subSize=size*0.48,x=s.title.x*w,y=s.title.y*h,pad=Math.min(w,h)*0.02,available=s.title.align==='center'?2*Math.min(x-pad,w-pad-x):s.title.align==='right'?x-pad:w-pad-x;
  var overflow=available<=0||y<0||(title||subtitle)&&y+(title?size*1.3:0)+(subtitle?subSize*1.4:0)>h-pad;
  if(s.presetId==='modern')available=Math.min(available,w*0.65);
  ctx.save();ctx.fillStyle=s.title.color;ctx.textAlign=s.title.align;ctx.textBaseline='top';
  ctx.strokeStyle=contrast.outline(s.title.color);ctx.lineJoin='round';
  if(title&&available>0){ctx.font='bold '+size+'px '+(s.presetId==='floral'||s.presetId==='oriental'||s.presetId==='deco'?'serif':'sans-serif');ctx.lineWidth=size*0.16;ctx.strokeText(title,x,y,available);ctx.fillText(title,x,y,available);}
  if(subtitle&&available>0){ctx.font=subSize+'px sans-serif';ctx.lineWidth=subSize*0.18;ctx.strokeText(subtitle,x,y+(title?size*1.3:0),available);ctx.fillText(subtitle,x,y+(title?size*1.3:0),available);}ctx.restore();
  if(title&&(s.presetId==='modern'||s.presetId==='deco')){ctx.save();ctx.strokeStyle=s.presetId==='modern'?'#21375f':'#d6b870';ctx.lineWidth=Math.min(w,h)*0.002;ctx.beginPath();var ly=y+size*1.05,lw=s.presetId==='modern'?w*0.12:w*0.36,lx=s.presetId==='modern'?x:x-lw/2;ctx.moveTo(lx,ly);ctx.lineTo(lx+lw,ly);ctx.stroke();ctx.restore();}
  var logo=options.logoImage,hasLogo=!!logo||!!options.hasLogo,brand=hasLogo?info.placeBrand(w,h,logo&&logo.width||1,logo&&logo.height||1,options.brand||{}):null;
  if(logo&&brand){var l=brand.logo;ctx.drawImage(logo,l.x,l.y,l.width,l.height);}if(brand&&brand.name){var n=brand.name;ctx.save();ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=n.size+'px sans-serif';ctx.fillStyle=s.title.color;ctx.strokeStyle=contrast.outline(s.title.color);ctx.lineJoin='round';ctx.lineWidth=Math.max(1,n.size*0.16);ctx.strokeText(n.text,n.x,n.y,n.maxWidth);ctx.fillText(n.text,n.x,n.y,n.maxWidth);ctx.restore();}
  ctx.restore();
  var titleLeft=s.title.align==='center'?x-available/2:s.title.align==='right'?x-available:x;
  return {infoOverflow:!!overflow,logoOverflow:hasLogo&&!brand,logoOverlap:!!(brand&&info.overlaps(brand.group,area)),styleLayout:{map:{x:rect.x/w,y:rect.y/h,width:rect.width/w,height:rect.height/h},title:{x:titleLeft/w,y:y/h,width:Math.max(0,available)/w,height:((title?size*1.3:0)+(subtitle?subSize*1.4:0))/h},logo:brand?{x:brand.group.x/w,y:brand.group.y/h,width:brand.group.width/w,height:brand.group.height/h}:null}};
}
function draw(ctx, project, tile, options) {
  if(options.style)return drawStyled(ctx,project,tile,options);
  var bounds = options.bounds, area = planner.fit(bounds.width, bounds.height, options.width, options.height, options.position);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = options.backgroundColor || '#ffffff'; ctx.fillRect(0, 0, tile.width, tile.height);
  ctx.translate(-tile.x, -tile.y);
  if (options.backgroundImage) {
    var image = options.backgroundImage, iw = image.width, ih = image.height;
    if (iw > 0 && ih > 0) { var scale = Math.max(options.width / iw, options.height / ih), sw = options.width / scale, sh = options.height / scale; ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, options.width, options.height); }
    else ctx.drawImage(image, 0, 0, options.width, options.height);
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(area.x, area.y, area.width, area.height); ctx.clip();
  ctx.translate(area.x, area.y); ctx.scale(area.width / bounds.width, area.height / bounds.height); ctx.translate(-bounds.x, -bounds.y);
  scene.drawScene(ctx, project, {outlineText: true,textScale:options.textScale}); ctx.restore();
  var hasLogo=!!options.logoImage||!!options.hasLogo,logo=options.logoImage,brand=hasLogo&&options.brand?info.placeBrand(options.width,options.height,logo&&logo.width||1,logo&&logo.height||1,options.brand):null,logoRect=hasLogo?(options.brand?(brand&&brand.group):info.placeLogo(options.width,options.height,area,logo&&logo.width||1,logo&&logo.height||1)):null;
  var textLayout=info.layout(options.width,options.height,area,options.eventInfo,logoRect,options.textScale);
  textLayout.lines.forEach(function(line){ctx.save();ctx.textAlign='left';ctx.textBaseline='top';ctx.font=line.size+'px sans-serif';ctx.fillStyle='#1f2f26';ctx.strokeStyle=contrast.outline(ctx.fillStyle);ctx.lineJoin='round';ctx.lineWidth=Math.max(1,line.size*0.16);ctx.strokeText(line.text,line.x,line.y,line.maxWidth);ctx.fillText(line.text,line.x,line.y,line.maxWidth);ctx.restore();});
  if (logo && logoRect) { var r=brand?brand.logo:logoRect;ctx.drawImage(logo,r.x,r.y,r.width,r.height); }
  if(brand&&brand.name){var n=brand.name;ctx.save();ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=n.size+'px sans-serif';ctx.fillStyle='#1f2f26';ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,n.size*0.16);ctx.strokeText(n.text,n.x,n.y,n.maxWidth);ctx.fillText(n.text,n.x,n.y,n.maxWidth);ctx.restore();}
  ctx.restore();
  return {infoOverflow:textLayout.overflow,logoOverflow:hasLogo&&!logoRect,logoOverlap:!!(brand&&info.overlaps(brand.group,area))};
}
module.exports = { draw: draw };
