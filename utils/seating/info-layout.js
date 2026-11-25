'use strict';
function overlaps(a,b){return !!a&&!!b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
function regionsFor(width,height,area){
  var right=width-area.x-area.width,bottom=height-area.y-area.height,regions=[];
  if(area.x>0)regions.push({x:0,y:0,width:area.x,height:height});
  if(right>0)regions.push({x:area.x+area.width,y:0,width:right,height:height});
  if(area.y>0)regions.push({x:area.x,y:0,width:area.width,height:area.y});
  if(bottom>0)regions.push({x:area.x,y:area.y+area.height,width:area.width,height:bottom});
  return regions;
}
function placeLogo(width,height,area,imageWidth,imageHeight){
  var pad=Math.min(width,height)*0.02,regions=regionsFor(width,height,area).sort(function(a,b){return b.width*b.height-a.width*a.height;});
  for(var i=0;i<regions.length;i++){
    var r=regions[i],maxW=Math.min(width*0.12,r.width-2*pad),maxH=Math.min(height*0.12,r.height-2*pad);
    if(maxW<Math.min(width,height)*0.025||maxH<Math.min(width,height)*0.025)continue;
    var factor=Math.min(maxW/(imageWidth||1),maxH/(imageHeight||1)),w=(imageWidth||1)*factor,h=(imageHeight||1)*factor;
    return {x:r.x+r.width-pad-w,y:r.y+pad,width:w,height:h};
  }
  return null;
}
function placeBrand(width,height,imageWidth,imageHeight,options){
  options=options||{};var pad=Math.min(width,height)*0.02,scale=Number(options.logoScale)||1,textScale=Number(options.textScale)||1,name=String(options.name||'').trim(),corner=options.corner||'top-left';
  var maxW=width*0.12*scale,maxH=height*0.12*scale,factor=Math.min(maxW/(imageWidth||1),maxH/(imageHeight||1)),w=(imageWidth||1)*factor,h=(imageHeight||1)*factor,size=Math.min(width,height)*0.045*textScale,gap=name?size*0.45:0;
  var textWidth=Array.from(name).reduce(function(n,c){return n+(c.charCodeAt(0)<128?0.65:1);},0)*size,groupWidth=w+gap+textWidth,groupHeight=Math.max(h,name?size*1.2:0);
  if(groupWidth>width-2*pad||groupHeight>height-2*pad)return null;
  var x=corner.indexOf('right')>=0?width-pad-groupWidth:pad,y=corner.indexOf('bottom')>=0?height-pad-groupHeight:pad;
  if(Number.isFinite(options.x))x=Math.max(0,Math.min(width-groupWidth,options.x*width));if(Number.isFinite(options.y))y=Math.max(0,Math.min(height-groupHeight,options.y*height));
  return {group:{x:x,y:y,width:groupWidth,height:groupHeight},logo:{x:x,y:y+(groupHeight-h)/2,width:w,height:h},name:name?{text:name,x:x+w+gap,y:y+groupHeight/2,size:size,maxWidth:textWidth+size*0.2}:null};
}
function layout(width,height,area,values,logo,textScale){
  var text=(values||[]).map(function(value){return String(value||'').trim();}).filter(Boolean).join('\n');
  if(!text)return {lines:[],overflow:false};
  var size=Math.min(width,height)*0.045*(Number(textScale)||1),pad=size*0.8,lineHeight=size*1.45,regions=regionsFor(width,height,area);
  if(logo&&typeof logo==='object')regions.forEach(function(r){if(logo.x<r.x+r.width&&logo.x+logo.width>r.x&&logo.y<r.y+r.height&&logo.y+logo.height>r.y){var above=Math.max(0,logo.y-pad-r.y),belowY=logo.y+logo.height+pad,below=Math.max(0,r.y+r.height-belowY);if(above>=below)r.height=above;else{r.y=belowY;r.height=below;}}});
  regions.sort(function(a,b){return b.width*b.height-a.width*a.height;});
  var chars=Array.from(text),index=0,lines=[];
  function charWidth(c){return c.charCodeAt(0)<128?0.65:1;}
  regions.forEach(function(region){
    var max=(region.width-2*pad)/size,rows=Math.floor((region.height-2*pad)/lineHeight);
    if(max<1||rows<1)return;
    for(var row=0;row<rows&&index<chars.length;row++){
      var line='',used=0,start=index;
      while(index<chars.length){var ch=chars[index];if(ch==='\n'){index++;break;}var w=charWidth(ch);if(used+w>max)break;line+=ch;used+=w;index++;}
      if(line)lines.push({text:line,x:region.x+pad,y:region.y+pad+row*lineHeight,size:size,maxWidth:region.width-2*pad});
      else if(index===start)break;
    }
  });
  return {lines:lines,overflow:index<chars.length};
}
module.exports={layout:layout,placeLogo:placeLogo,placeBrand:placeBrand,overlaps:overlaps};
