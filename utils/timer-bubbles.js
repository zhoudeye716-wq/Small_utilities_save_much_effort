var Matter = require('../vendor/matter/matter.min.js');
var Engine = Matter.Engine, Bodies = Matter.Bodies, Body = Matter.Body, Composite = Matter.Composite;
var palettes = {
  paint: { fill:['#f2d4a9','#d6aa8a','#93a58a'], ink:'#443b30', edge:'#f9e6cc' },
  sketch:{ fill:['#fffefa','#f5f2e4','#d9e1d3'], ink:'#303b35', edge:'#747868' },
  film:{ fill:['#c29a65','#765e4c','#454843'], ink:'#fff6e5', edge:'#e4c797' },
  water:{ fill:['#fffdf8','#f8e5db','#c7dde0'], ink:'#455961', edge:'#fdfaf2' },
  ink:{ fill:['rgba(255,253,242,.82)','rgba(243,240,221,.72)','rgba(169,175,154,.48)'], ink:'#252b25', edge:'rgba(57,67,54,.6)' },
  pixel:{ fill:['#f9e8a2','#f3b76c','#cf6f65'], ink:'#3b2631', edge:'#493844' },
  deco:{ fill:['#496354','#223e36','#112920'], ink:'#fff2cf', edge:'#dec58a' },
  cyber:{ fill:['#c0f8f0','#4576b3','#532660'], ink:'#fff', edge:'#8df8ef' },
  paper:{ fill:['#fff4d9','#eab6a2','#d38c7d'], ink:'#513f35', edge:'#fff8e9' },
  glass:{ fill:['rgba(255,255,255,.52)','rgba(220,245,249,.16)','rgba(158,210,235,.22)'], ink:'#193f55', edge:'rgba(255,255,255,.86)' }
};
function clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }
function radius(seconds,width) {
  var s=clamp(seconds,0,600), r=s>=300?40+(600-s)*18/300:s>=60?58+(300-s)*27/240:85+(60-s);
  return Math.min(r,Math.max(32,(width-20)/2));
}
function format(seconds) {
  var n=Math.max(0,Math.ceil(seconds)), h=Math.floor(n/3600), m=Math.floor(n%3600/60), s=n%60;
  return (h?String(h)+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(s).padStart(2,'0');
}
function trace(ctx,points) {
  ctx.beginPath(); points.forEach(function(p,i){ if(i) ctx.lineTo(p.x,p.y); else ctx.moveTo(p.x,p.y); }); ctx.closePath();
}
function clip(poly,nx,ny,c) {
  var out=[]; if(!poly.length)return out;
  var a=poly[poly.length-1], da=a.x*nx+a.y*ny-c;
  poly.forEach(function(b){ var db=b.x*nx+b.y*ny-c;
    if((da<=0)!==(db<=0)){var t=da/(da-db);out.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});}
    if(db<=0)out.push(b);a=b;da=db;
  });return out;
}
function detail(ctx,theme,p,x,y,r) {
  var i,px,py;
  ctx.lineCap='round';
  if(theme==='ink'){
    var wash=ctx.createRadialGradient(x-r*.65,y+r*.55,0,x-r*.65,y+r*.55,r*.75);
    wash.addColorStop(0,'rgba(66,78,60,.19)');wash.addColorStop(1,'rgba(84,98,74,0)');ctx.fillStyle=wash;ctx.fillRect(x-r,y-r,r*2,r*2);
    for(i=0;i<3;i++){ctx.strokeStyle='rgba(47,57,45,.16)';ctx.lineWidth=Math.max(1,r*(.045-i*.008));ctx.beginPath();ctx.moveTo(x-r*.86+i*r*.055,y+r*(.28+i*.13));ctx.quadraticCurveTo(x-r*.68,y+r*(.55+i*.11),x-r*.36+i*r*.1,y+r*(.78+i*.035));ctx.stroke();}
  } else if(theme==='glass'){
    ctx.strokeStyle='rgba(255,255,255,.82)';ctx.lineWidth=Math.max(2,r*.045);ctx.beginPath();ctx.arc(x,y,r*.82,3.75,4.55);ctx.stroke();
    ctx.strokeStyle='rgba(221,156,225,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r*.9,.1,1.2);ctx.stroke();
    ctx.strokeStyle='rgba(109,199,220,.5)';ctx.beginPath();ctx.arc(x,y,r*.9,1.35,2.12);ctx.stroke();
  } else if(theme==='deco'){
    ctx.strokeStyle='rgba(230,201,133,.62)';ctx.lineWidth=1;
    for(i=-4;i<=4;i++){ctx.beginPath();ctx.moveTo(x,y-r*.49);ctx.lineTo(x+i*r*.27,y-r);ctx.moveTo(x,y+r*.56);ctx.lineTo(x+i*r*.26,y+r);ctx.stroke();}
  } else if(theme==='film'){
    for(i=0;i<60;i++){px=x+Math.sin(i*127.1+p.phase*3)*r;py=y+Math.sin(i*53.9+p.phase*7)*r;ctx.fillStyle=i%3?'rgba(255,242,208,.2)':'rgba(45,29,23,.2)';ctx.fillRect(px,py,1,1);}
  } else if(theme==='water'){
    var colors=['rgba(92,165,183,.25)','rgba(222,137,156,.23)','rgba(227,186,103,.2)'];
    for(i=0;i<3;i++){px=x+Math.sin(i*2.1+p.phase)*r*.5;py=y+Math.cos(i*2.1+p.phase)*r*.47;var w=ctx.createRadialGradient(px,py,0,px,py,r*.7);w.addColorStop(0,colors[i]);w.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=w;ctx.fillRect(px-r,py-r,2*r,2*r);}
  } else if(theme==='paint'){
    ctx.lineWidth=Math.max(2,r*.065);for(i=0;i<8;i++){px=x-r*.75+i*r*.18;py=y+Math.sin(i*2.2+p.phase)*r*.44;ctx.strokeStyle=i%2?'rgba(255,239,211,.3)':'rgba(115,91,71,.16)';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+r*.22,py-r*.12);ctx.stroke();}
  } else if(theme==='sketch'){
    ctx.strokeStyle='rgba(67,76,65,.18)';ctx.lineWidth=1;for(i=-4;i<7;i++){px=x+i*r*.2;ctx.beginPath();ctx.moveTo(px-r*.4,y+r*.9);ctx.lineTo(px+r*.4,y+r*.15);ctx.stroke();}
  } else if(theme==='cyber'){
    ctx.strokeStyle='rgba(117,255,242,.4)';ctx.lineWidth=1;for(i=-3;i<=3;i++){py=y+i*r*.22;ctx.beginPath();ctx.moveTo(x-r,py);ctx.lineTo(x+r,py);ctx.stroke();}
  } else if(theme==='paper'){
    ctx.fillStyle='rgba(255,248,220,.32)';ctx.beginPath();ctx.moveTo(x-r,y-r);ctx.lineTo(x+r*.45,y-r);ctx.lineTo(x-r*.4,y+r);ctx.closePath();ctx.fill();
  } else if(theme==='pixel'){
    var block=Math.max(4,Math.floor(r/8));ctx.fillStyle='rgba(255,247,183,.42)';for(i=0;i<4;i++)ctx.fillRect(x-r*.55+i*block,y-r*.55,block,block);
  }
}
function inkGarden(ctx,w,h) {
  var x=w*.82,y=Math.min(h-125,420);
  ctx.save();ctx.globalAlpha=.55;ctx.lineCap='round';ctx.strokeStyle='#516148';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(w*.98,h-20);ctx.quadraticCurveTo(w*.82,y+110,x,y);ctx.stroke();
  ctx.fillStyle='#87947b';
  [[-.12,80],[-.05,140],[.09,115]].forEach(function(a){var lx=x+w*a[0],ly=y+a[1];ctx.beginPath();ctx.moveTo(x,ly+35);ctx.quadraticCurveTo(lx-22,ly+12,lx,ly);ctx.quadraticCurveTo(lx+20,ly+4,x,ly+35);ctx.fill();});
  ctx.fillStyle='#bd5660';for(var i=0;i<5;i++){ctx.save();ctx.translate(x,y);ctx.rotate(i*Math.PI*2/5);ctx.scale(7,16);ctx.beginPath();ctx.arc(0,-13/16,1,0,Math.PI*2);ctx.fill();ctx.restore();}
  ctx.fillStyle='#a5783c';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#586759';ctx.lineWidth=1;ctx.beginPath();ctx.arc(w*.18,y+80,15,3.5,6.1);ctx.moveTo(w*.18-15,y+80);ctx.lineTo(w*.18-35,y+68);ctx.moveTo(w*.18-15,y+80);ctx.lineTo(w*.18-36,y+82);ctx.stroke();ctx.restore();
}
function Bubbles(canvas,width,height,dpr) {
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.width=width;this.height=height;
  this.engine=Engine.create({positionIterations:12,velocityIterations:8});this.engine.gravity.y=0;this.engine.gravity.x=0;this.nodes={};this.sparks=[];this.gravity={x:0,y:-1};
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);this.ctx.scale(dpr,dpr);
  var t=100,o={isStatic:true,restitution:.1,friction:.04};
  Composite.add(this.engine.world,[Bodies.rectangle(width/2,-t/2,width+t*2,t,o),Bodies.rectangle(width/2,height+t/2,width+t*2,t,o),Bodies.rectangle(-t/2,height/2,t,height+t*2,o),Bodies.rectangle(width+t/2,height/2,t,height+t*2,o)]);
}
Bubbles.prototype.setGravity=function(x,y){this.gravity.x=clamp(x,-1,1);this.gravity.y=clamp(y,-1,1);};
Bubbles.prototype.burst=function(id){
  var p=this.nodes[id];if(!p)return;
  for(var i=0;i<20;i++){var a=i*Math.PI/10,speed=1.1+Math.random()*2.2;this.sparks.push({x:p.body.position.x,y:p.body.position.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:1});}
};
Bubbles.prototype.sync=function(items) {
  var self=this, seen={};
  items.forEach(function(item,index){
    seen[item.id]=true;var n=self.nodes[item.id],r=radius(item.remaining,self.width);
    if(!n){var x=clamp(r+10+(index%3)*(self.width-2*r-20)/2,r,self.width-r),y=clamp(r+10+Math.floor(index/3)*95,r,self.height-r);
      n={id:item.id,body:Bodies.circle(x,y,r*.88,{restitution:.12,friction:.03,frictionAir:.035,inertia:Infinity}),r:r,phase:index*2.1};self.nodes[item.id]=n;Composite.add(self.engine.world,n.body);}
    n.item=item;n.rank=index;n.total=items.length;
  });
  Object.keys(this.nodes).forEach(function(id){if(!seen[id]){Composite.remove(self.engine.world,self.nodes[id].body);delete self.nodes[id];}});
};
Bubbles.prototype.draw=function(theme,now,delta) {
  var self=this,ctx=this.ctx,nodes=Object.keys(this.nodes).map(function(k){return self.nodes[k];});
  delta=typeof delta==='number'?clamp(delta,0,66):33;var ratio=delta/33;
  nodes.forEach(function(p){var target=radius(p.item.remaining,self.width),step=clamp((target-p.r)*(1-Math.pow(.96,ratio)),-.4*ratio,.4*ratio);if(Math.abs(step)>.002){Body.scale(p.body,(p.r+step)/p.r,(p.r+step)/p.r);p.r+=step;}});
  var remaining=delta;
  while(remaining>0){
    var dt=Math.min(remaining,1000/60);
    nodes.forEach(function(p){var lift=.00055+.00055*(1-p.rank/Math.max(1,p.total-1));Body.applyForce(p.body,p.body.position,{x:p.body.mass*self.gravity.x*lift,y:p.body.mass*self.gravity.y*lift});});
    Engine.update(this.engine,dt);remaining-=dt;
  }
  ctx.clearRect(0,0,this.width,this.height);if(theme==='ink')inkGarden(ctx,this.width,this.height);
  nodes.forEach(function(p){
    var x=p.body.position.x,y=p.body.position.y,r=p.r,poly=[];
    for(var k=0;k<48;k++){var a=k*Math.PI*2/48,organic=1+.014*Math.sin(3*a+p.phase+now/1600);poly.push({x:x+Math.cos(a)*r*organic,y:y+Math.sin(a)*r*organic});}
    nodes.forEach(function(q){if(q===p||!poly.length)return;var qx=q.body.position.x,qy=q.body.position.y,dx=qx-x,dy=qy-y;if(dx*dx+dy*dy>(r+q.r+5)*(r+q.r+5))return;
      poly=clip(poly,dx,dy,(qx*qx+qy*qy-q.r*q.r-x*x-y*y+r*r)/2);});
    if(poly.length<3)return;if(theme==='pixel')poly=poly.map(function(v){return{x:Math.round(v.x/4)*4,y:Math.round(v.y/4)*4};});
    var pal=palettes[theme]||palettes.paint,g=ctx.createRadialGradient(x-r*.38,y-r*.43,0,x,y,r*1.2);
    g.addColorStop(0,pal.fill[0]);g.addColorStop(.53,pal.fill[1]);g.addColorStop(1,pal.fill[2]);
    ctx.save();trace(ctx,poly);ctx.fillStyle=g;ctx.fill();ctx.save();ctx.clip();detail(ctx,theme,p,x,y,r);ctx.restore();trace(ctx,poly);ctx.lineWidth=theme==='pixel'?3:theme==='deco'?1.8:1.2;ctx.strokeStyle=pal.edge;ctx.stroke();
    ctx.fillStyle=pal.ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 12px sans-serif';ctx.fillText(p.item.name,x,y-12,r*1.4);ctx.font='bold 16px sans-serif';ctx.fillText(format(p.item.remaining),x,y+7,r*1.4);ctx.restore();
  });
  this.sparks=this.sparks.filter(function(s){return s.life>0;});
  this.sparks.forEach(function(s){s.x+=s.vx*ratio;s.y+=s.vy*ratio;s.life-=.08*ratio;ctx.save();ctx.globalAlpha=Math.max(0,s.life);ctx.fillStyle=(palettes[theme]||palettes.paint).edge;ctx.beginPath();ctx.arc(s.x,s.y,2,0,Math.PI*2);ctx.fill();ctx.restore();});
};
Bubbles.prototype.hit=function(x,y){var self=this,nodes=Object.keys(this.nodes).map(function(k){return self.nodes[k];});for(var i=nodes.length-1;i>=0;i--){var p=nodes[i],dx=p.body.position.x-x,dy=p.body.position.y-y;if(dx*dx+dy*dy<p.r*p.r)return p.id;}return null;};
module.exports={Bubbles:Bubbles,format:format,radius:radius};
