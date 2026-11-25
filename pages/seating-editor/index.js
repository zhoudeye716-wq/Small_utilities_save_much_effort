'use strict';
var model = require('../../utils/seating/model');
var editor = require('../../utils/seating/editor-controller');
var store = require('../../utils/seating/wx-store');
var render = require('../../utils/seating/render');
var viewport = require('../../utils/seating/viewport');
var hit = require('../../utils/seating/hit');
var layout = require('../../utils/seating/layout');
var geometry = require('../../utils/seating/geometry');
function message(content) { wx.showModal({ title: '操作未完成', content: content, showCancel: false }); }
Page({
  data: { title: '', names: '', search: '', mode: 'select', snap: true, panel: '', people: [], tables: [], selectedTable: '', selectedSeat: '', saveStatus: '', dragName: '', dragX: 0, dragY: 0, dragTarget: '', tableTypes: ['圆桌', '方桌', '椭圆桌', 'T 形桌', 'U 形桌'], typeValues: ['round', 'rect', 'oval', 't', 'u'], draftType: 0, draftName: '', draftSeatCount: '8', draftWidth: '160', draftHeight: '100', draftEdges: [] },
  getStore: function() { return store.create(wx); },
  onLoad: function(options) {
    try { this.controller = editor.create(this.getStore().load(options.id)); this.setData({ title: this.controller.project().name }); }
    catch (error) { message('无法读取座位图，请返回后重试。'); }
    this.view = { x: 30, y: 40, scale: 1 };
  },
  onShow:function(){if(this.expectExportReturn&&this.controller)this.syncExportSettings();},
  syncExportSettings:function(){try{var updated=this.getStore().load(this.controller.project().id);this.controller.project().assets=updated.assets||{};this.controller.project().exportSettings=updated.exportSettings||{};this.expectExportReturn=false;return true;}catch(error){this.setData({saveStatus:'无法读取最新导出设置，保存暂停'});message('无法读取导出设置，暂时不会覆盖原项目，请检查设备存储。');return false;}},
  onReady: function() {
    var page = this;
    wx.createSelectorQuery().in(this).select('#stage').boundingClientRect().select('#canvas').fields({ node: true, size: true }).exec(function(result) {
      if (!result[0] || !result[1] || !result[1].node) return message('画布加载失败，请重新打开。');
      page.rect = result[0]; page.canvas = result[1].node;
      var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); page.dpr = info.pixelRatio || 1;
      page.canvas.width = Math.round(result[1].width * page.dpr); page.canvas.height = Math.round(result[1].height * page.dpr); page.draw();
    });
  },
  onUnload: function() { if (this.touch && this.touch.timer) clearTimeout(this.touch.timer); if(this.panTimer)clearInterval(this.panTimer); },
  persist: function() {
    if(this.expectExportReturn&&!this.syncExportSettings())return false;
    try { this.getStore().save(this.controller.project()); this.setData({ saveStatus: '已保存' }); return true; }
    catch (error) { this.setData({ saveStatus: '保存失败，请检查存储空间' }); message('保存失败，之前保存的版本仍然保留。请检查设备存储。'); return false; }
  },
  draw: function() {
    if (!this.canvas || !this.controller) return;
    var context = this.canvas.getContext('2d'), ratio = this.dpr || 1;
    context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(ratio * this.view.scale, 0, 0, ratio * this.view.scale, ratio * this.view.x, ratio * this.view.y);
    var draft=this.touch&&this.touch.stroke?this.touch.stroke:(this.polyPoints&&this.polyPoints.length?{points:this.polyPoints,color:'#46554d',width:2}:null);
    render.drawScene(context, this.controller.project(), { targetSeat: this.data.dragTarget || this.data.highlightSeat, draftStroke: draft,showVenueHandle:true,handleRadius:8/this.view.scale });
    if(this.snapGuides&&this.rect){var g=this.snapGuides,top=viewport.toWorld(this.view,{x:0,y:0}),bottom=viewport.toWorld(this.view,{x:this.rect.width,y:this.rect.height});context.save();context.strokeStyle='#e99a31';context.lineWidth=2/this.view.scale;context.beginPath();if(g.x!==null){context.moveTo(g.x,top.y);context.lineTo(g.x,bottom.y);}if(g.y!==null){context.moveTo(top.x,g.y);context.lineTo(bottom.x,g.y);}context.stroke();context.restore();}
  },
  addTable: function() {
    var page = this;
    this.controller.mutate(function(project) { var table = model.createTable('round'); table.x = (120 - page.view.x) / page.view.scale; table.y = (100 - page.view.y) / page.view.scale; project.tables.push(table); });
    this.persist(); this.draw();
  },
  addFreeSeat: function() { var page=this;this.controller.mutate(function(project){model.createFreeSeat(project,(120-page.view.x)/page.view.scale,(100-page.view.y)/page.view.scale);});this.persist();this.draw(); },
  openObjects: function() { this.setData({panel:'objects'}); },
  addObject: function(event) { var page=this,kind=event.currentTarget.dataset.kind;try{this.controller.mutate(function(project){model.createObject(project,kind,(120-page.view.x)/page.view.scale,(100-page.view.y)/page.view.scale);});this.setData({panel:''});this.persist();this.draw();}catch(error){message(error.message);} },
  openObject: function(id) { var item=this.controller.project().objects.find(function(o){return o.id===id;});if(!item)return;this.objectDraft=JSON.parse(JSON.stringify(item));var left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;item.points.forEach(function(p){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);});var unit=this.controller.project().venue.unitsPerMetre||1,page=this;this.setData({panel:'object',selectedObject:id,objectText:item.text||'',objectWidth:String(item.width||2),objectShapeWidth:String((right-left)/unit),objectShapeHeight:String((bottom-top)/unit),objectHasShape:item.points.length>1,objectAngle:0,objectUnit:unit===1?'画布单位':'米',objectColor:item.color||'#46554d',objectCanDelete:!!item.kind},function(){page.initObjectPreview();}); },
  initObjectPreview:function(){var page=this;wx.createSelectorQuery().in(this).select('#object-preview').fields({node:true,size:true}).select('#object-preview').boundingClientRect().exec(function(r){if(!r[0]||!r[0].node||!r[1])return;page.objectPreviewCanvas=r[0].node;page.objectPreviewRect=r[1];var dpr=(wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync()).pixelRatio||1;page.objectPreviewCanvas.width=Math.round(r[0].width*dpr);page.objectPreviewCanvas.height=Math.round(r[0].height*dpr);page.drawObjectPreview();});},
  drawObjectPreview:function(){
    if(!this.objectPreviewCanvas||!this.objectDraft)return;var unit=this.controller.project().venue.unitsPerMetre||1,points;
    try{points=geometry.transformPoints(this.objectDraft.points,Number(this.data.objectShapeWidth)*unit,Number(this.data.objectShapeHeight)*unit,Number(this.data.objectAngle));}catch(error){return;}
    var left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;points.forEach(function(p){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);});
    var canvas=this.objectPreviewCanvas,ctx=canvas.getContext('2d'),scale=Math.min((canvas.width-80)/Math.max(20,right-left),(canvas.height-80)/Math.max(20,bottom-top)),x=(canvas.width-(left+right)*scale)/2,y=(canvas.height-(top+bottom)*scale)/2;
    this.objectPreviewView={x:x,y:y,scale:scale,left:left,right:right,top:top,bottom:bottom};ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,x,y);var draft=Object.assign({},this.objectDraft,{points:points,text:this.data.objectText,color:this.data.objectColor,width:Number(this.data.objectWidth)||2});render.drawScene(ctx,{venue:{},people:[],tables:[],objects:[draft]});if(this.data.objectHasShape){ctx.beginPath();ctx.fillStyle='#e19b32';ctx.arc(right,bottom,7/scale,0,Math.PI*2);ctx.fill();}
  },
  objectResizeStart:function(event){if(!this.objectPreviewRect||!this.objectPreviewView||!this.objectPreviewCanvas||!event.touches.length)return;var t=event.touches[0],r=this.objectPreviewRect,v=this.objectPreviewView,c=this.objectPreviewCanvas,x=(t.clientX-r.left)*c.width/r.width,y=(t.clientY-r.top)*c.height/r.height;if(Math.hypot(x-(v.x+v.right*v.scale),y-(v.y+v.bottom*v.scale))>25)return;this.objectResize={x:t.clientX,y:t.clientY,width:Number(this.data.objectShapeWidth),height:Number(this.data.objectShapeHeight),scale:v.scale/(c.width/r.width),angle:Number(this.data.objectAngle)||0};},
  objectResizeMove:function(event){if(!this.objectResize||!event.touches.length)return;var d=this.objectResize,t=event.touches[0],unit=this.controller.project().venue.unitsPerMetre||1,dx=(t.clientX-d.x)/d.scale/unit,dy=(t.clientY-d.y)/d.scale/unit,angle=-d.angle*Math.PI/180,localX=dx*Math.cos(angle)-dy*Math.sin(angle),localY=dx*Math.sin(angle)+dy*Math.cos(angle);this.setData({objectShapeWidth:d.width?Number(Math.max(0.01,d.width+localX).toFixed(3)):0,objectShapeHeight:d.height?Number(Math.max(0.01,d.height+localY).toFixed(3)):0});this.drawObjectPreview();},
  objectResizeEnd:function(){this.objectResize=null;},
  objectInput: function(event) {var key=event.currentTarget.dataset.key,update={};if(['objectText','objectWidth','objectShapeWidth','objectShapeHeight'].indexOf(key)>=0){update[key]=event.detail.value;this.setData(update);this.drawObjectPreview();}},
  objectRotation:function(event){this.setData({objectAngle:geometry.snapAngle(Number(event.detail.value))});this.drawObjectPreview();},
  objectColor: function(event) {this.setData({objectColor:event.currentTarget.dataset.color});this.drawObjectPreview();},
  saveObject: function() {var page=this,id=this.data.selectedObject,width=Number(this.data.objectWidth),item=this.controller.project().objects.find(function(o){return o.id===id;});if(!item||!Number.isFinite(width)||width<=0||width>100)return message('请输入有效的线条粗细。');var unit=this.controller.project().venue.unitsPerMetre||1,shapeWidth=Number(this.data.objectShapeWidth)*unit,shapeHeight=Number(this.data.objectShapeHeight)*unit,points;try{points=geometry.transformPoints(item.points,shapeWidth,shapeHeight,Number(this.data.objectAngle));}catch(error){return message(error.message);}this.controller.mutate(function(){item.text=page.data.objectText;item.width=width;item.color=page.data.objectColor;item.points=points;});this.setData({panel:''});this.persist();this.draw();},
  deleteObject: function() {var page=this,id=this.data.selectedObject;wx.showModal({title:'删除元素',content:'确定删除这个场地元素吗？',success:function(result){if(!result.confirm)return;page.controller.mutate(function(project){project.objects=project.objects.filter(function(item){return item.id!==id;});});page.setData({panel:''});page.persist();page.draw();}});},
  addNames: function() {
    if (!String(this.data.names || '').trim()) return;
    this.controller.addPeople(this.data.names); this.setData({ names: '' }); this.persist(); this.refreshPeople(); this.draw();
  },
  openTable: function(id) {
    var table = this.controller.project().tables.find(function(item) { return item.id === id; });
    if (!table) return;
    this.draftTable = JSON.parse(JSON.stringify(table));
    var scale = this.controller.project().venue.unitsPerMetre || 1;
    var parts=table.parts||{};this.draftTable.parts={headDepth:parts.headDepth||table.height*0.3,stemWidth:parts.stemWidth||table.width*0.3,legWidth:parts.legWidth||table.width*0.3,baseDepth:parts.baseDepth||table.height*0.3};
    var page = this;
    this.setData({ panel: 'table', selectedTable: id, draftName: table.name || '', draftShowName:table.showName!==false,draftType: Math.max(0, this.data.typeValues.indexOf(table.type)), draftSeatCount: String(table.seats.length), draftWidth: String(table.width / scale), draftHeight: String(table.height / scale), draftRotation:table.rotation||0,draftHead:String(this.draftTable.parts.headDepth/scale),draftStem:String(this.draftTable.parts.stemWidth/scale),draftLeg:String(this.draftTable.parts.legWidth/scale),draftBase:String(this.draftTable.parts.baseDepth/scale),dimensionUnit: scale === 1 ? '画布单位' : '米', draftEdges: table.edges.slice(), edgeTop: table.edges.indexOf('top') >= 0, edgeRight: table.edges.indexOf('right') >= 0, edgeBottom: table.edges.indexOf('bottom') >= 0, edgeLeft: table.edges.indexOf('left') >= 0 }, function() { page.initTablePreview(); });
  },
  initTablePreview: function() {
    var page=this;
    wx.createSelectorQuery().in(this).select('#table-preview').fields({node:true,size:true}).select('#table-preview').boundingClientRect().exec(function(result){
      if (!result[0] || !result[0].node || !result[1]) return;
      page.tablePreviewCanvas=result[0].node;page.tablePreviewRect=result[1];var dpr=(wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync()).pixelRatio||1;
      page.tablePreviewCanvas.width=Math.round(result[0].width*dpr);page.tablePreviewCanvas.height=Math.round(result[0].height*dpr);page.drawTablePreview();
    });
  },
  drawTablePreview: function() {
    if (!this.tablePreviewCanvas || !this.draftTable) return;
    var canvas=this.tablePreviewCanvas,ctx=canvas.getContext('2d'),t=this.draftTable,pad=40,angle=(t.rotation||0)*Math.PI/180,rw=Math.abs(Math.cos(angle))*t.width+Math.abs(Math.sin(angle))*t.height,rh=Math.abs(Math.sin(angle))*t.width+Math.abs(Math.cos(angle))*t.height,scale=Math.min((canvas.width-pad*2)/(rw+24),(canvas.height-pad*2)/(rh+24));
    if (!Number.isFinite(scale) || scale<=0) return;
    var x=(canvas.width-t.width*scale)/2,y=(canvas.height-t.height*scale)/2;
    this.tablePreviewView={x:x,y:y,scale:scale};ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,x,y);
    var preview=Object.assign({},t,{x:0,y:0,name:''});render.drawScene(ctx,{venue:{},people:[],tables:[preview],objects:[]});
    ctx.save();ctx.translate(t.width/2,t.height/2);ctx.rotate(angle);ctx.translate(-t.width/2,-t.height/2);
    var active=layout.activeSegments(t), polygon=layout.outline(t), count=t.type==='round'||t.type==='oval'?4:polygon.length;
    for(var i=0;i<count;i++){
      ctx.beginPath();ctx.lineWidth=5/scale;ctx.strokeStyle=active.some(function(item){return item.index===i;})?'#3d9f75':'#b9c3bb';
      if(t.type==='round'||t.type==='oval')ctx.ellipse(t.width/2,t.height/2,t.width/2,t.height/2,0,-3*Math.PI/4+i*Math.PI/2,-3*Math.PI/4+(i+1)*Math.PI/2);
      else{var a=polygon[i],b=polygon[(i+1)%polygon.length];ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}ctx.stroke();
    }
    if(this.data.focusPart){var p=t.parts||{},part=this.data.focusPart;ctx.beginPath();ctx.strokeStyle='#e19b32';ctx.lineWidth=4/scale;if(part==='draftHead'){ctx.moveTo(t.width/2,0);ctx.lineTo(t.width/2,p.headDepth);}else if(part==='draftStem'){ctx.moveTo((t.width-p.stemWidth)/2,t.height*0.75);ctx.lineTo((t.width+p.stemWidth)/2,t.height*0.75);}else if(part==='draftLeg'){ctx.moveTo(0,t.height*0.2);ctx.lineTo(p.legWidth,t.height*0.2);}else if(part==='draftBase'){ctx.moveTo(t.width/2,t.height-p.baseDepth);ctx.lineTo(t.width/2,t.height);}ctx.stroke();}ctx.beginPath();ctx.fillStyle='#e19b32';ctx.arc(t.width,t.height,7/scale,0,Math.PI*2);ctx.fill();ctx.restore();
  },
  tablePreviewTap: function(event) {
    if(!this.tablePreviewRect||!this.tablePreviewView||!this.draftTable||!event.changedTouches||!event.changedTouches.length)return;
    var touch=event.changedTouches[0],rect=this.tablePreviewRect,view=this.tablePreviewView,canvas=this.tablePreviewCanvas;
    var px=(touch.clientX-rect.left)*(canvas?canvas.width/rect.width:1),py=(touch.clientY-rect.top)*(canvas?canvas.height/rect.height:1);
    var local=geometry.tableLocal(Object.assign({},this.draftTable,{x:0,y:0}),{x:(px-view.x)/view.scale,y:(py-view.y)/view.scale});var index=layout.nearestSegment(this.draftTable,local.x,local.y,18/view.scale);
    if(index===null)return;
    try{model.toggleSegment(this.draftTable,index);this.drawTablePreview();}catch(error){message(error.message);}
  },
  previewResizeStart:function(event){
    if(!this.tablePreviewRect||!this.tablePreviewView||!this.tablePreviewCanvas||!event.touches.length)return;
    var finger=event.touches[0],rect=this.tablePreviewRect,view=this.tablePreviewView,canvas=this.tablePreviewCanvas,t=this.draftTable,px=(finger.clientX-rect.left)*canvas.width/rect.width,py=(finger.clientY-rect.top)*canvas.height/rect.height;
    var shape=Object.assign({},t,{x:0,y:0}),local=geometry.tableLocal(shape,{x:(px-view.x)/view.scale,y:(py-view.y)/view.scale});
    if(Math.hypot(local.x-t.width,local.y-t.height)>25/view.scale)return;
    this.previewResize={shape:shape,view:Object.assign({},view),start:local};
  },
  previewResizeMove:function(event){
    if(!this.previewResize||!event.touches.length)return;var finger=event.touches[0],rect=this.tablePreviewRect,canvas=this.tablePreviewCanvas,drag=this.previewResize;
    var point=geometry.tableLocal(drag.shape,{x:((finger.clientX-rect.left)*canvas.width/rect.width-drag.view.x)/drag.view.scale,y:((finger.clientY-rect.top)*canvas.height/rect.height-drag.view.y)/drag.view.scale});
    var width=Math.max(10,drag.shape.width+point.x-drag.start.x),height=Math.max(10,drag.shape.height+point.y-drag.start.y),unit=this.controller.project().venue.unitsPerMetre||1;if(this.draftTable.type==='round')height=width;
    this.draftTable.width=width;this.draftTable.height=height;this.setData({draftWidth:String(Number((width/unit).toFixed(3))),draftHeight:String(Number((height/unit).toFixed(3)))});this.drawTablePreview();
  },
  previewResizeEnd:function(){this.previewResize=null;},
  tableInput: function(event) {
    var key = event.currentTarget.dataset.key, value = event.detail.value, update = {};
    if (['draftName', 'draftSeatCount', 'draftWidth', 'draftHeight','draftHead','draftStem','draftLeg','draftBase'].indexOf(key) < 0) return;
    update[key] = value;if(this.draftTable&&this.draftTable.type==='round'&&(key==='draftWidth'||key==='draftHeight'))update[key==='draftWidth'?'draftHeight':'draftWidth']=value; this.setData(update); if (this.draftTable) { var scale=this.controller.project().venue.unitsPerMetre||1; if(key==='draftWidth'&&Number(value)>0)this.draftTable.width=Number(value)*scale;if(key==='draftHeight'&&Number(value)>0)this.draftTable.height=Number(value)*scale;if(this.draftTable.type==='round'&&Number(value)>0&&(key==='draftWidth'||key==='draftHeight'))this.draftTable.width=this.draftTable.height=Number(value)*scale;if(key==='draftSeatCount'&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=500)model.resizeSeats(this.draftTable,Number(value),true);var partKeys={draftHead:'headDepth',draftStem:'stemWidth',draftLeg:'legWidth',draftBase:'baseDepth'};if(partKeys[key]&&Number(value)>0)this.draftTable.parts[partKeys[key]]=Number(value)*scale;this.drawTablePreview(); }
  },
  partFocus: function(event){this.setData({focusPart:event.currentTarget.dataset.key});this.drawTablePreview();},
  rotationInput: function(event){var angle=geometry.snapAngle(Number(event.detail.value));if(!Number.isFinite(angle))return;this.setData({draftRotation:angle});this.draftTable.rotation=angle;this.drawTablePreview();},
  tableType: function(event) { var index=Number(event.detail.value);this.setData({ draftType: index });if(this.draftTable){this.draftTable.type=this.data.typeValues[index];if(this.draftTable.type==='round'){this.draftTable.height=this.draftTable.width;this.setData({draftHeight:this.data.draftWidth});}this.draftTable.disabledSegments=[];this.drawTablePreview();} },
  openTableTypes:function(){this.setData({showTableTypes:true});},
  closeTableTypes:function(){this.setData({showTableTypes:false});},
  chooseTableType:function(event){this.tableType({detail:{value:event.currentTarget.dataset.index}});this.closeTableTypes();},
  tableNameVisibility:function(event){this.setData({draftShowName:!!event.detail.value});},
  tableEdges: function(event) {
    var edges = event.detail.value;
    try { if (this.draftTable) model.setTableEdges(this.draftTable, edges); }
    catch(error) { message(error.message); edges=this.draftTable.edges.slice(); }
    this.setData({ draftEdges: edges, edgeTop: edges.indexOf('top') >= 0, edgeRight: edges.indexOf('right') >= 0, edgeBottom: edges.indexOf('bottom') >= 0, edgeLeft: edges.indexOf('left') >= 0 }); this.drawTablePreview();
  },
  gridInput: function(event) { var key = event.currentTarget.dataset.key, update = {}; if (['gridRows', 'gridColumns', 'gapX', 'gapY'].indexOf(key) >= 0) { update[key] = event.detail.value; this.setData(update); this.drawGridPreview(); } },
  openGrid: function() { var page=this;this.saveTable(function(){var unit=page.controller.project().venue.unitsPerMetre||1;page.setData({ panel: 'grid', gridRows: 1, gridColumns: 1, gapX: 40/unit, gapY: 40/unit, gridUnit:unit===1?'画布单位':'米',gridMax:unit===1?1000:10,gridStep:unit===1?1:0.1 },function(){page.initGridPreview();});}); },
  gridSlider:function(event){var key=event.currentTarget.dataset.key,value=Number(event.detail.value),update={};if(['gapX','gapY'].indexOf(key)<0||!Number.isFinite(value))return;update[key]=Math.max(0,Math.min(this.data.gridMax,value));this.setData(update);this.drawGridPreview();},
  initGridPreview: function() {
    var page=this;wx.createSelectorQuery().in(this).select('#grid-preview').fields({node:true,size:true}).select('#grid-preview').boundingClientRect().exec(function(result){
      if(!result[0]||!result[0].node||!result[1])return;page.gridCanvas=result[0].node;page.gridRect=result[1];var dpr=(wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync()).pixelRatio||1;page.gridDpr=dpr;page.gridCanvas.width=Math.round(result[0].width*dpr);page.gridCanvas.height=Math.round(result[0].height*dpr);page.drawGridPreview();
    });
  },
  drawGridPreview: function() {
    if(!this.gridCanvas)return;var page=this,t=this.controller.project().tables.find(function(item){return item.id===page.data.selectedTable;});if(!t)return;
    var rows=Number(this.data.gridRows),cols=Number(this.data.gridColumns),unit=this.controller.project().venue.unitsPerMetre||1,gx=Number(this.data.gapX)*unit,gy=Number(this.data.gapY)*unit;
    if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1||rows*cols>500||!Number.isFinite(gx)||!Number.isFinite(gy)||gx<0||gy<0)return;
    var canvas=this.gridCanvas,ctx=canvas.getContext('2d'),angle=(t.rotation||0)*Math.PI/180,rw=Math.abs(Math.cos(angle))*t.width+Math.abs(Math.sin(angle))*t.height,rh=Math.abs(Math.sin(angle))*t.width+Math.abs(Math.cos(angle))*t.height,w=cols*rw+(cols-1)*gx,h=rows*rh+(rows-1)*gy,scale=Math.min((canvas.width-30)/(w+70),(canvas.height-30)/(h+70)),x=(canvas.width-w*scale)/2,y=(canvas.height-h*scale)/2;
    this.gridView={scale:scale};ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,x,y);
    var previews=[];for(var r=0;r<rows;r++)for(var c=0;c<cols;c++)previews.push(Object.assign({},t,{x:c*(rw+gx)+(rw-t.width)/2,y:r*(rh+gy)+(rh-t.height)/2,name:'',seats:t.seats.map(function(seat){return Object.assign({},seat,{personId:null});})}));
    render.drawScene(ctx,{venue:{},people:[],objects:[],tables:previews});
  },
  gridStart: function(event) { if(!event.touches.length)return;var t=event.touches[0],scale=this.gridView?this.gridView.scale/(this.gridDpr||1):1;this.gridTouch={x:t.clientX,y:t.clientY,gapX:Number(this.data.gapX),gapY:Number(this.data.gapY),scale:scale}; },
  gridMove: function(event) { if(!this.gridTouch||!event.touches.length)return;var t=event.touches[0],unit=this.controller.project().venue.unitsPerMetre||1,scale=this.gridTouch.scale;this.setData({gapX:Number(Math.max(0,Math.min(this.data.gridMax,this.gridTouch.gapX+(t.clientX-this.gridTouch.x)/(scale*unit))).toFixed(2)),gapY:Number(Math.max(0,Math.min(this.data.gridMax,this.gridTouch.gapY+(t.clientY-this.gridTouch.y)/(scale*unit))).toFixed(2))});this.drawGridPreview(); },
  gridEnd: function() { this.gridTouch=null; },
  addGrid: function() {
    var page = this, table = this.controller.project().tables.find(function(item) { return item.id === page.data.selectedTable; });
    if (!table) return;
    try {
      var unit=this.controller.project().venue.unitsPerMetre||1,gx=Number(this.data.gapX)*unit,gy=Number(this.data.gapY)*unit;
      var copies = layout.grid(table, Number(this.data.gridRows), Number(this.data.gridColumns), gx, gy).slice(1);
      this.controller.mutate(function(project) { Array.prototype.push.apply(project.tables, copies); });
      this.setData({ panel: '' }); this.persist(); this.draw();
    } catch (error) { message(error.message); }
  },
  copyTable:function(){var page=this;this.saveTable(function(){var table=page.controller.project().tables.find(function(item){return item.id===page.data.selectedTable;});if(!table)return;var angle=(table.rotation||0)*Math.PI/180,width=Math.abs(Math.cos(angle))*table.width+Math.abs(Math.sin(angle))*table.height,source=Object.assign({},table,{x:table.x+width+40});var copy=layout.grid(source,1,1,0,0)[0];page.controller.mutate(function(project){project.tables.push(copy);});page.setData({panel:''});page.persist();page.draw();});},
  saveTable: function(afterSave) {
    var page = this, id = this.data.selectedTable, table = this.controller.project().tables.find(function(item) { return item.id === id; });
    var scale = this.controller.project().venue.unitsPerMetre || 1, count = Number(this.data.draftSeatCount), width = Number(this.data.draftWidth) * scale, height = Number(this.data.draftHeight) * scale, edges = this.data.draftEdges;
    if(this.data.typeValues[this.data.draftType]==='round')height=width;
    if (!table || !Number.isInteger(count) || count < 0 || count > 500 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 || !edges.length) return message('请输入有效的尺寸和座位数，并至少选择一条可坐的桌边。');
    try { var candidate=JSON.parse(JSON.stringify(table));candidate.type=this.data.typeValues[this.data.draftType];candidate.width=width;candidate.height=height;candidate.parts=this.draftTable.parts;candidate.disabledSegments=(this.draftTable.disabledSegments||[]).slice();if(candidate.type==='t'&&(!(candidate.parts.headDepth>0&&candidate.parts.headDepth<height)||!(candidate.parts.stemWidth>0&&candidate.parts.stemWidth<width)))throw new Error('T 形桌局部尺寸必须小于桌子整体尺寸');if(candidate.type==='u'&&(!(candidate.parts.legWidth>0&&candidate.parts.legWidth<width/2)||!(candidate.parts.baseDepth>0&&candidate.parts.baseDepth<height)))throw new Error('U 形桌局部尺寸超过整体范围');model.setTableEdges(candidate,edges); }
    catch(error) { return message(error.message); }
    var displaced = table.seats.slice(count).filter(function(seat) { return !!seat.personId; });
    function apply() {
      page.controller.mutate(function() { model.resizeSeats(table, count, true); table.type=page.data.typeValues[page.data.draftType];table.rotation=page.data.draftRotation;table.parts=Object.assign({},page.draftTable.parts);table.disabledSegments=(page.draftTable.disabledSegments||[]).slice();model.setTableEdges(table, edges); table.width = width; table.height = height; table.name = page.data.draftName.trim();table.showName=page.data.draftShowName; });
      page.setData({ panel: '' }); var saved=page.persist();page.draw();if(saved&&typeof afterSave==='function')afterSave();
    }
    if (displaced.length) wx.showModal({ title: '减少座位', content: displaced.length + ' 人将回到未安排名单，继续吗？', success: function(result) { if (result.confirm) apply(); } }); else apply();
  },
  deleteTable: function(){var page=this,id=this.data.selectedTable;wx.showModal({title:'删除桌子',content:'桌上的人员会回到未安排名单，确定删除吗？',success:function(result){if(!result.confirm)return;page.controller.mutate(function(project){project.tables=project.tables.filter(function(table){return table.id!==id;});});page.setData({panel:''});page.persist();page.draw();}});},
  namesInput: function(event) { this.setData({ names: event.detail.value }); },
  openRename:function(){this.setData({panel:'rename',projectName:this.controller.project().name});},
  projectNameInput:function(event){this.setData({projectName:event.detail.value});},
  saveName:function(){var name=String(this.data.projectName||'').trim();if(!name)return message('请输入座位图名称。');this.controller.mutate(function(project){project.name=name;});this.setData({panel:'',title:name});this.persist();},
  clearSeat: function() { try { this.controller.clearSeat(this.data.selectedSeat); this.setData({ panel: '' }); this.persist(); this.draw(); } catch (error) { message(error.message); } },
  deleteFreeSeat: function() {var page=this,id=this.data.selectedSeat;wx.showModal({title:'删除座位',content:'删除后该座位上的人会回到未安排名单，确定删除吗？',success:function(result){if(!result.confirm)return;page.controller.mutate(function(project){project.freeSeats=(project.freeSeats||[]).filter(function(seat){return seat.id!==id;});});page.setData({panel:''});page.persist();page.draw();}});},
  deleteSeatedPerson: function() {
    var page = this, seat = model.allSeats(this.controller.project()).find(function(item) { return item.id === page.data.selectedSeat; });
    if (!seat || !seat.personId) return;
    wx.showModal({ title: '删除人员', content: '确定从这场聚会的名单中删除此人吗？', confirmText: '删除', success: function(result) { if (!result.confirm) return; page.controller.deletePerson(seat.personId); page.setData({ panel: '' }); page.persist(); page.draw(); } });
  },
  refreshPeople: function() { this.setData({ people: this.controller.peopleList(this.data.search || '') }); },
  searchInput: function(event) { this.setData({ search: event.detail.value }); this.refreshPeople(); },
  openPeople: function() { this.refreshPeople(); this.setData({ panel: 'people' }); },
  openTables: function() {
    var project = this.controller.project(), names = Object.create(null);
    project.people.forEach(function(person) { names[person.id] = person.name; });
    this.setData({ panel: 'tables', tables: project.tables.map(function(table, index) { return { id: table.id, label: table.name || '桌子 ' + (index + 1), members: table.seats.map(function(seat) { return names[seat.personId]; }).filter(Boolean).join('、') }; }) });
  },
  namesVisibility:function(event){var visible=!!event.currentTarget.dataset.visible;this.controller.mutate(function(project){project.tables.forEach(function(table){table.showName=visible;});});this.persist();this.openTables();this.draw();},
  locateTable: function(tableId) {
    var table = this.controller.project().tables.find(function(item) { return item.id === tableId; });
    if (!table || !this.rect) return;
    this.view.x = this.rect.width / 2 - (table.x + table.width / 2) * this.view.scale;
    this.view.y = this.rect.height / 2 - (table.y + table.height / 2) * this.view.scale;
    this.setData({ panel: '' }); this.draw();
  },
  locateTableTap: function(event) { this.locateTable(event.currentTarget.dataset.id); },
  locatePerson: function(event) {
    var person = this.controller.peopleList('').find(function(item) { return item.id === event.currentTarget.dataset.id; });
    if (person && person.tableId) { var seat = model.allSeats(this.controller.project()).find(function(item) { return item.personId === person.id; }); this.setData({ highlightSeat: seat ? seat.id : '' }); this.locateTable(person.tableId); }
    else if(person&&person.seated&&this.rect){var free=(this.controller.project().freeSeats||[]).find(function(item){return item.id===person.seatId;});if(free){this.view.x=this.rect.width/2-free.x*this.view.scale;this.view.y=this.rect.height/2-free.y*this.view.scale;this.setData({panel:'',highlightSeat:free.id});this.draw();}}
  },
  peopleTap: function(event) { if (this.data.panel === 'choose') this.choosePerson(event); else this.locatePerson(event); },
  openPerson:function(event){var person=this.controller.project().people.find(function(item){return item.id===event.currentTarget.dataset.id;});if(person)this.setData({personBack:this.data.panel,panel:'person',personId:person.id,personName:person.name,personNote:person.note||''});},
  personInput:function(event){var key=event.currentTarget.dataset.key,update={};if(key==='personName'||key==='personNote'){update[key]=event.detail.value;this.setData(update);}},
  savePerson:function(){var page=this,name=String(this.data.personName||'').trim(),person=this.controller.project().people.find(function(item){return item.id===page.data.personId;});if(!person||!name)return message('请输入姓名或昵称。');this.controller.mutate(function(){person.name=name;person.note=String(page.data.personNote||'').trim();});this.setData({panel:this.data.personBack||'people'});this.persist();this.refreshPeople();this.draw();},
  removePerson:function(){var page=this,id=this.data.personId;wx.showModal({title:'删除人员',content:'确定从这场聚会中删除此人吗？',success:function(result){if(!result.confirm)return;page.controller.deletePerson(id);page.setData({panel:page.data.personBack||'people'});page.persist();page.refreshPeople();page.draw();}});},
  closePanel: function() { this.setData({ panel: '' }); },
  autoAssign: function() {
    var result = this.controller.mutate(function(project) { return model.autoAssign(project); });
    this.persist(); this.refreshPeople(); this.draw();
    wx.showToast({ title: '已安排 ' + result.assigned + ' 人，剩余 ' + result.remaining + ' 人', icon: 'none' });
  },
  undo: function() { if (this.controller.undo()) { this.setData({title:this.controller.project().name});this.persist(); this.draw(); } },
  toggleDraw: function() { this.polyPoints=null;this.setData({ mode: this.data.mode === 'draw' ? 'select' : 'draw' }); },
  toggleSnap: function() { this.setData({snap:!this.data.snap}); },
  startPolyline:function(){this.polyPoints=[];this.setData({mode:'poly'});this.draw();},
  cancelPolyline:function(){this.polyPoints=null;this.setData({mode:'select'});this.draw();},
  finishPolyline:function(event){var points=this.polyPoints||[],closed=!!event.currentTarget.dataset.closed;if(points.length<(closed?3:2))return message(closed?'闭合区域至少需要三个点。':'折线至少需要两个点。');var object={id:model.id('stroke'),points:points.slice(),closed:closed,color:'#46554d',width:2};this.controller.mutate(function(project){project.objects.push(object);});this.polyPoints=null;this.setData({mode:'select'});this.persist();this.draw();},
  openExport: function() { if (!this.persist()) return;var page=this;this.expectExportReturn=true;wx.navigateTo({url:'/pages/seating-export/index?id=' + encodeURIComponent(this.controller.project().id),fail:function(){page.expectExportReturn=false;message('无法打开导出页面。');}}); },
  openVenue: function() { var venue = this.controller.project().venue; this.setData({ panel: 'venue', venueWidth: venue.widthMetres || '', venueHeight: venue.heightMetres || '' }); },
  venueInput: function(event) { var key = event.currentTarget.dataset.key, update = {}; if (key === 'venueWidth' || key === 'venueHeight') { update[key] = event.detail.value; this.setData(update); } },
  saveVenue: function() {
    var width = Number(this.data.venueWidth), height = Number(this.data.venueHeight), page = this;
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return message('请输入大于零的场地长和宽。');
    this.controller.mutate(function(project) { model.setVenue(project, width, height); });
    this.setData({ panel: '' }); this.persist();
    if (this.rect) { var scale = Math.min((this.rect.width - 40) / (width * 100), (this.rect.height - 40) / (height * 100)); this.view = { x: 20, y: 20, scale: Math.max(0.01, Math.min(8, scale)) }; }
    page.draw();
  },
  clearVenue: function() { var page=this;wx.showModal({title:'取消场地尺寸',content:'将移除场地边界和实际尺寸标定，已有桌椅和布置会保留。',success:function(result){if(!result.confirm)return;page.controller.mutate(function(project){model.clearVenue(project);});page.setData({panel:''});page.persist();page.draw();}}); },
  updateDragTarget: function(point) {var world=viewport.toWorld(this.view,point),target=hit.hitTest(this.controller.project(),world.x,world.y,this.view.scale);this.touch.targetSeat=target&&target.type==='seat'?target.seatId:'';this.setData({dragX:point.x,dragY:point.y,dragTarget:this.touch.targetSeat});this.draw();},
  updateAutoPan: function(point) {
    var page=this,margin=36,dx=point.x<margin?4:point.x>this.rect.width-margin?-4:0,dy=point.y<margin?4:point.y>this.rect.height-margin?-4:0;
    this.panDirection={x:dx,y:dy};
    if(!dx&&!dy){if(this.panTimer)clearInterval(this.panTimer);this.panTimer=null;return;}
    if(this.panTimer)return;
    this.panTimer=setInterval(function(){if(!page.touch||!page.touch.dragSeat){clearInterval(page.panTimer);page.panTimer=null;return;}page.view.x+=page.panDirection.x;page.view.y+=page.panDirection.y;page.updateDragTarget(page.touch.last);},40);
  },
  touchStart: function(event) {
    if (!this.rect || !this.controller || !event.touches.length) return;
    if (event.touches.length >= 2) {
      if (this.touch && this.touch.timer) clearTimeout(this.touch.timer);
      if (this.touch && this.touch.recorded) this.persist();
      if (this.panTimer) { clearInterval(this.panTimer); this.panTimer=null; }
      this.setData({dragName:'',dragTarget:''});
      var a = event.touches[0], b = event.touches[1];
      this.touch = { pinch: true, startDistance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), base: Object.assign({}, this.view), anchor: { x: (a.clientX + b.clientX) / 2 - this.rect.left, y: (a.clientY + b.clientY) / 2 - this.rect.top } };
      return;
    }
    var t = event.touches[0], screen = { x: t.clientX - this.rect.left, y: t.clientY - this.rect.top }, point = viewport.toWorld(this.view, screen);
    if (this.data.mode === 'draw') { this.touch = { stroke: { id: model.id('stroke'), points: [point], color: '#46554d', width: 2 } }; return; }
    if (this.data.mode === 'poly') { this.touch={start:screen,last:screen,hit:null,moved:false,polyPoint:point}; return; }
    var venue=this.controller.project().venue,venueHit=venue.widthMetres>0&&venue.heightMetres>0&&venue.unitsPerMetre>0&&Math.hypot(point.x-venue.widthMetres*venue.unitsPerMetre,point.y-venue.heightMetres*venue.unitsPerMetre)<=18/this.view.scale;
    this.touch = { start: screen, last: screen, hit: venueHit?{type:'venue-resize'}:hit.hitTest(this.controller.project(), point.x, point.y, this.view.scale), moved: false };
    if (this.touch.hit && this.touch.hit.type === 'seat') {
      var page = this, active = this.touch, seatId = active.hit.seatId;
      var seat = model.allSeats(this.controller.project()).find(function(item) { return item.id === seatId; });
      var person = seat && this.controller.project().people.find(function(item) { return item.id === seat.personId; });
      if (person) active.timer = setTimeout(function() {
        if (page.touch !== active || active.moved) return;
        active.dragSeat = true;
        page.setData({ dragName: person.name, dragX: screen.x, dragY: screen.y, dragTarget: '' });
        if (typeof wx.vibrateShort === 'function') { try { wx.vibrateShort({ type: 'light' }); } catch (ignore) {} }
      }, 450);
    }
  },
  touchMove: function(event) {
    if (!this.touch || !event.touches.length) return;
    if (event.touches.length >= 2 && this.touch.pinch) {
      var a = event.touches[0], b = event.touches[1], distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!this.touch.startDistance) return;
      this.view = viewport.zoom(this.touch.base, this.touch.anchor, this.touch.base.scale * distance / this.touch.startDistance);
      this.view.x += (a.clientX + b.clientX) / 2 - this.rect.left - this.touch.anchor.x;
      this.view.y += (a.clientY + b.clientY) / 2 - this.rect.top - this.touch.anchor.y;
      this.draw(); return;
    }
    if (this.touch.pinch) return;
    if (this.touch.stroke) {
      var finger = event.touches[0], location = viewport.toWorld(this.view, { x: finger.clientX - this.rect.left, y: finger.clientY - this.rect.top });
      this.touch.stroke.points.push(location); this.draw(); return;
    }
    var t = event.touches[0], next = { x: t.clientX - this.rect.left, y: t.clientY - this.rect.top }, dx = next.x - this.touch.last.x, dy = next.y - this.touch.last.y;
    if (Math.hypot(next.x - this.touch.start.x, next.y - this.touch.start.y) > 5) this.touch.moved = true;
    if (this.touch.moved && this.touch.timer && !this.touch.dragSeat) { clearTimeout(this.touch.timer); this.touch.timer = null; }
    if (this.touch.dragSeat) {
      this.touch.last = next;this.updateDragTarget(next);this.updateAutoPan(next);return;
    }
    if (this.touch.moved && this.touch.hit && this.touch.hit.type === 'venue-resize') {
      if(!this.touch.recorded){this.controller.mutate(function(){});this.touch.recorded=true;}
      var v=this.controller.project().venue,world=viewport.toWorld(this.view,next);v.widthMetres=Math.max(0.01,Number((world.x/v.unitsPerMetre).toFixed(3)));v.heightMetres=Math.max(0.01,Number((world.y/v.unitsPerMetre).toFixed(3)));this.draw();
    } else if (this.touch.moved && this.touch.hit && this.touch.hit.type === 'object') {
      if(!this.touch.recorded){this.controller.mutate(function(){});this.touch.recorded=true;}
      var objectId=this.touch.hit.objectId,object=this.controller.project().objects.find(function(item){return item.id===objectId;});
      if(object){if(!this.touch.rawPoints)this.touch.rawPoints=object.points.map(function(point){return {x:point.x,y:point.y};});this.touch.rawPoints.forEach(function(point){point.x+=dx/this.view.scale;point.y+=dy/this.view.scale;},this);object.points=this.touch.rawPoints.map(function(point){return {x:point.x,y:point.y};});var alignment=geometry.snapObjectToVenue(object,this.controller.project().venue,12/this.view.scale);this.snapGuides=null;if(alignment){object.points.forEach(function(point){point.x+=alignment.dx;point.y+=alignment.dy;});this.snapGuides={x:alignment.axis==='x'?alignment.edge:null,y:alignment.axis==='y'?alignment.edge:null};}this.draw();}
    } else if (this.touch.moved && this.touch.hit && this.touch.hit.type === 'seat' && !this.touch.hit.tableId) {
      if(!this.touch.recorded){this.controller.mutate(function(){});this.touch.recorded=true;}
      var freeId=this.touch.hit.seatId,free=(this.controller.project().freeSeats||[]).find(function(item){return item.id===freeId;});
      if(free){free.x+=dx/this.view.scale;free.y+=dy/this.view.scale;this.draw();}
    } else if (this.touch.moved && this.touch.hit && (this.touch.hit.type === 'table' || this.touch.hit.type === 'seat' && this.touch.hit.tableId)) {
      if (!this.touch.recorded) { this.controller.mutate(function() {}); this.touch.recorded = true; }
      var tableId = this.touch.hit.tableId, table = this.controller.project().tables.find(function(item) { return item.id === tableId; });
      if (table) { if(!this.touch.rawTable)this.touch.rawTable={x:table.x,y:table.y};this.touch.rawTable.x+=dx/this.view.scale;this.touch.rawTable.y+=dy/this.view.scale;table.x=this.touch.rawTable.x;table.y=this.touch.rawTable.y;this.snapGuides=null;if(this.data.snap){var snapped=layout.snap(table,this.controller.project().tables,12/this.view.scale);this.snapGuides={x:snapped.x!==table.x?snapped.x+table.width/2:null,y:snapped.y!==table.y?snapped.y+table.height/2:null};Object.assign(table,snapped);}this.draw(); }
    } else if (this.touch.moved) { this.view.x += dx; this.view.y += dy; this.draw(); }
    this.touch.last = next;
  },
  touchEnd: function() {
    if (!this.touch) return;
    if(this.panTimer)clearInterval(this.panTimer);this.panTimer=null;
    if (this.touch.timer) clearTimeout(this.touch.timer);
    if (this.touch.pinch) { this.touch = null; return; }
    if (this.touch.polyPoint) { if(!this.touch.moved){this.polyPoints.push(this.touch.polyPoint);}this.touch=null;this.draw();return; }
    if (this.touch.stroke) {
      var stroke = this.touch.stroke; this.touch = null;
      if (stroke.points.length > 1) { this.controller.mutate(function(project) { project.objects.push(stroke); }); this.persist(); }
      this.draw(); return;
    }
    if (this.touch.dragSeat) {
      var source = this.touch.hit.seatId, target = this.touch.targetSeat;
      if (target && target !== source) { this.controller.mutate(function(project) { model.movePerson(project, source, target); }); this.persist(); }
      this.setData({ dragName: '', dragTarget: '' }); this.touch = null; this.draw(); return;
    }
    if (this.touch.moved && this.touch.hit && (this.touch.hit.type === 'table' || this.touch.hit.type === 'seat' && this.touch.hit.tableId)) {
      var id = this.touch.hit.tableId, tables = this.controller.project().tables, table = tables.find(function(item) { return item.id === id; });
      if (table && this.data.snap) Object.assign(table, layout.snap(table, tables, 7 / this.view.scale));
      this.snapGuides=null;this.persist(); this.draw();
    }
    else if(this.touch.moved&&this.touch.hit&&(this.touch.hit.type==='venue-resize'||this.touch.hit.type==='object'||this.touch.hit.type==='seat')){this.snapGuides=null;this.persist();this.draw();}
    if (!this.touch.moved && this.touch.hit && this.touch.hit.type === 'seat') { this.setData({ selectedSeat: this.touch.hit.seatId, selectedIsFree: !this.touch.hit.tableId, panel: 'choose' }); this.refreshPeople(); }
    else if (!this.touch.moved && this.touch.hit && this.touch.hit.type === 'table') this.openTable(this.touch.hit.tableId);
    else if (!this.touch.moved && this.touch.hit && this.touch.hit.type === 'object') this.openObject(this.touch.hit.objectId);
    this.touch = null;
  },
  touchCancel: function() {
    if (!this.touch) return;
    if(this.panTimer)clearInterval(this.panTimer);this.panTimer=null;
    if (this.touch.timer) clearTimeout(this.touch.timer);
    if (this.touch.recorded) this.controller.undo();
    this.touch = null;this.snapGuides=null; this.setData({ dragName: '', dragTarget: '' }); this.draw();
  },
  choosePerson: function(event) {
    if (this.data.panel !== 'choose') return;
    var page = this, personId = event.currentTarget.dataset.id;
    function assign(confirmed) { try { page.controller.assign(page.data.selectedSeat, personId, confirmed); page.setData({ panel: '' }); page.persist(); page.draw(); } catch (error) { message(error.message); } }
    try { this.controller.assign(this.data.selectedSeat, personId, false); this.setData({ panel: '' }); this.persist(); this.draw(); }
    catch (error) { if (/确认/.test(error.message)) wx.showModal({ title: '调整座位', content: '此人或座位已有安排，是否移动或交换？', success: function(result) { if (result.confirm) assign(true); } }); else message(error.message); }
  }
});
