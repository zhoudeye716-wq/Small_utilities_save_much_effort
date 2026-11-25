'use strict';
var decorations = [
  {kind:'flower',label:'花枝',category:'花卉植物'},
  {kind:'leaf',label:'叶枝',category:'花卉植物'},
  {kind:'bouquet',label:'花簇',category:'花卉植物'},
  {kind:'vine',label:'蔓叶',category:'花卉植物'},
  {kind:'blossom',label:'繁花',category:'花卉植物'},
  {kind:'ink',label:'水墨竹影',category:'东方笔触'},
  {kind:'fan',label:'折扇',category:'东方笔触'},
  {kind:'seal',label:'朱印',category:'东方笔触'},
  {kind:'waves',label:'水波',category:'东方笔触'},
  {kind:'geometry',label:'交叠菱形',category:'几何线条'},
  {kind:'lattice',label:'几何格栅',category:'几何线条'},
  {kind:'orbit',label:'环轨',category:'几何线条'},
  {kind:'arch',label:'阶梯拱门',category:'装饰艺术'},
  {kind:'sunburst',label:'鎏金日轮',category:'装饰艺术'},
  {kind:'steps',label:'阶梯金线',category:'装饰艺术'},
  {kind:'confetti',label:'节庆彩屑',category:'节庆元素'},
  {kind:'firework',label:'礼花',category:'节庆元素'},
  {kind:'ribbon',label:'飘带',category:'节庆元素'}
];
var presetNames = [{id:'original',label:'原样'},{id:'modern',label:'现代几何'},{id:'floral',label:'暖金花卉'},{id:'oriental',label:'东方笔触'},{id:'deco',label:'夜幕装饰艺术'}];
function obj(v){return v && typeof v==='object' && !Array.isArray(v) ? v : {};}
function num(v,d,min,max){return Math.max(min,Math.min(max,typeof v==='number' && isFinite(v) ? v : d));}
function color(v,d){return typeof v==='string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? v : d;}
function choice(v,items,d){return items.indexOf(v)>=0?v:d;}
function normalize(input){
  var s=obj(input),f=obj(s.frame),t=obj(s.title),m=obj(s.map),c=obj(s.scene),l=obj(s.logo);
  var x=num(m.x,0,0,0.95),y=num(m.y,0,0,0.95);
  return {version:1,presetId:choice(s.presetId,['modern','floral','oriental','deco'],''),background:color(s.background,'#ffffff'),
    frame:{kind:choice(f.kind,['none','single','double','deco'],'none'),color:color(f.color,'#b69a60'),width:num(f.width,0.002,0,0.05),inset:num(f.inset,0.025,0,0.45)},
    title:{x:num(t.x,0.5,0,1),y:num(t.y,0.06,0,1),align:choice(t.align,['left','center','right'],'center'),color:color(t.color,'#1f2f26'),scale:num(t.scale,1,0.25,4)},
    logo:{x:typeof l.x==='number' && isFinite(l.x)?num(l.x,0,0,1):null,y:typeof l.y==='number' && isFinite(l.y)?num(l.y,0,0,1):null,scale:num(l.scale,1,0.25,2.5)},
    map:{x:x,y:y,width:num(m.width,1,0.05,1-x),height:num(m.height,1,0.05,1-y)},
    scene:{table:color(c.table,'#e7ded0'),tableStroke:color(c.tableStroke,'#796b5c'),seat:color(c.seat,'#ffffff'),seatStroke:color(c.seatStroke,'#537f69'),text:color(c.text,'#1f2f26')},
    decorations:(Array.isArray(s.decorations)?s.decorations:[]).map(function(item,i){
      var d=obj(item),kind=choice(d.kind,decorations.map(function(v){return v.kind;}),'flower');
      return {id:typeof d.id==='string' && d.id ? d.id : 'decoration-'+(i+1),kind:kind,x:num(d.x,0.5,0,1),y:num(d.y,0.5,0,1),scale:num(d.scale,0.15,0.05,2.5),rotation:num(d.rotation,0,-360,360),opacity:num(d.opacity,1,0,1),color:color(d.color,'#b69a60'),visible:d.visible!==false,layer:choice(d.layer,['behind','front'],'behind')};
    })};
}
function ornament(id,kind,x,y,scale,rotation,color){return {id:id,kind:kind,x:x,y:y,scale:scale,rotation:rotation,color:color};}
function preset(id){
  var s={};
  if(id==='modern')s={background:'#f4f7f6',frame:{kind:'single',color:'#4b7773',width:0.002,inset:0.025},title:{color:'#274743'},scene:{table:'#d8e9e5',tableStroke:'#56857d',seat:'#ffffff',seatStroke:'#66837d',text:'#203c38'},decorations:[ornament('modern-1','geometry',0.08,0.1,0.14,0,'#5c9690'),ornament('modern-2','geometry',0.92,0.9,0.14,180,'#5c9690')]};
  if(id==='floral')s={background:'#fffaf2',frame:{kind:'double',color:'#c5a469',width:0.0015,inset:0.025},title:{color:'#594335'},scene:{table:'#f3dfca',tableStroke:'#ad8264',seat:'#fffaf2',seatStroke:'#b18e70',text:'#4e382e'},decorations:[ornament('floral-1','flower',0.09,0.13,0.17,-25,'#b78359'),ornament('floral-2','leaf',0.91,0.87,0.17,155,'#9a9b6e')]};
  if(id==='oriental')s={background:'#f8f5ed',frame:{kind:'single',color:'#8d4942',width:0.0015,inset:0.028},title:{color:'#3e4440'},scene:{table:'#e3dfd2',tableStroke:'#7c8273',seat:'#fbfaf4',seatStroke:'#858b7e',text:'#303b35'},decorations:[ornament('oriental-1','ink',0.08,0.82,0.23,-10,'#67786b'),ornament('oriental-2','fan',0.91,0.13,0.13,20,'#ad6455')]};
  if(id==='deco')s={background:'#142536',frame:{kind:'deco',color:'#d6b870',width:0.002,inset:0.025},title:{color:'#f8e5b6'},scene:{table:'#203f45',tableStroke:'#d6b870',seat:'#1a353d',seatStroke:'#d6b870',text:'#f8e5b6'},decorations:[ornament('deco-1','sunburst',0.08,0.08,0.16,0,'#d6b870'),ornament('deco-2','arch',0.92,0.9,0.16,180,'#d6b870')]};
  if(id==='modern')s.decorations=[ornament('modern-1','lattice',0.08,0.12,0.24,0,'#75a9a3'),ornament('modern-2','orbit',0.91,0.86,0.25,20,'#75a9a3'),ornament('modern-3','geometry',0.1,0.85,0.16,15,'#8ab5ad'),ornament('modern-4','lattice',0.91,0.13,0.14,180,'#a0c1b9')];
  if(id==='floral')s.decorations=[ornament('floral-1','bouquet',0.10,0.15,0.27,-25,'#b78359'),ornament('floral-2','vine',0.89,0.85,0.27,155,'#9a9b6e'),ornament('floral-3','blossom',0.9,0.15,0.14,15,'#c59a78'),ornament('floral-4','leaf',0.11,0.86,0.19,180,'#aaa57b')];
  if(id==='oriental')s.decorations=[ornament('oriental-1','ink',0.1,0.84,0.28,-10,'#67786b'),ornament('oriental-2','fan',0.9,0.13,0.19,20,'#ad6455'),ornament('oriental-3','waves',0.87,0.86,0.25,0,'#94a699'),ornament('oriental-4','seal',0.12,0.14,0.09,0,'#ad6455')];
  if(id==='deco')s.decorations=[ornament('deco-1','sunburst',0.1,0.11,0.21,0,'#d6b870'),ornament('deco-2','steps',0.9,0.86,0.25,180,'#d6b870'),ornament('deco-3','arch',0.1,0.87,0.19,0,'#a88d5c'),ornament('deco-4','sunburst',0.9,0.13,0.13,0,'#d6b870')];
  if(['modern','floral','oriental','deco'].indexOf(id)>=0){s.map={x:0.06,y:0.23,width:0.88,height:0.7};s.title.y=0.08;}
  if(id==='modern'){s.background='#fbfcfd';s.frame.kind='none';s.title={x:0.08,y:0.08,align:'left',color:'#14274e'};s.scene={table:'#f8fbff',tableStroke:'#21375f',seat:'#ffffff',seatStroke:'#21375f',text:'#14274e'};}
  if(id==='oriental'){s.frame.color='#96a691';s.title.color='#253e2e';}
  if(id==='deco'){s.background='#063b39';s.scene={table:'#124943',tableStroke:'#d6b870',seat:'#10443f',seatStroke:'#d6b870',text:'#fff0cb'};}
  s.presetId=id;
  return normalize(s);
}
function presetList(){return presetNames.map(function(x){return {id:x.id,label:x.label};});}
function decorationList(){return decorations.map(function(x){return {kind:x.kind,label:x.label,category:x.category};});}
module.exports={normalize:normalize,preset:preset,presetList:presetList,decorationList:decorationList};
