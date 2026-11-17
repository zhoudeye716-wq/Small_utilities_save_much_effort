var core = require('../../utils/perler/core');
var palettes = require('../../utils/perler/palette');
var local = require('../../utils/perler/wx-store');
var viewport = require('../../utils/perler/viewport');
var exporter = require('../../utils/perler/export');
var crop = require('../../utils/perler/crop');
var mardPresets = require('../../utils/perler/mard-presets');
var PROFILE_KEY = 'perler-calibrations-v1';

function id() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
function touchPoint(point) {
  if(!point)return null;
  if(Number.isFinite(point.clientX)&&Number.isFinite(point.clientY))return {x:point.clientX,y:point.clientY,local:false};
  if(Number.isFinite(point.x)&&Number.isFinite(point.y))return {x:point.x,y:point.y,local:true};
  return null;
}
function pointInSpace(point,local,rect) {
  if(point.local===!!local)return point;
  var direction=local?-1:1;
  return {x:point.x+direction*rect.left,y:point.y+direction*rect.top,local:!!local};
}
function distance(a,b) { var x=a.x-b.x, y=a.y-b.y;return Math.sqrt(x*x+y*y); }
function midpoint(a,b,rect) {var first=pointInSpace(a,true,rect),second=pointInSpace(b,true,rect);return {x:(first.x+second.x)/2,y:(first.y+second.y)/2};}
function error(message) { wx.showModal({title:'操作未完成',content:message,showCancel:false}); }
function colorOptions(system,selected,customColors) {
  var value=Number(selected)||291,values=mardPresets.sizes.slice();
  var closest=values.reduce(function(best,n){return Math.abs(n-value)<Math.abs(best-value)?n:best;},values[0]);
  var names=values.map(function(n){return n+' 色';});
  if(system!=='MARD'||values.indexOf(value)<0){values.unshift(null);names.unshift(system==='MARD'?value+' 色':'原色板（'+system+'）');}
  if(Array.isArray(customColors)){values.push('custom');names.push('自定义（'+customColors.length+' 色）');}
  return {values:values,names:names,index:Array.isArray(customColors)?values.length-1:system!=='MARD'||values.indexOf(value)<0?0:values.indexOf(value),value:system!=='MARD'?291:mardPresets.extraSizes.indexOf(value)>=0?value:closest};
}
function fullPalette(system){return palettes.getPalette(system,system==='MARD'?313:undefined);}
function availablePalette(settings){
  var system=settings.system||'MARD';
  var list=Array.isArray(settings.customColors)?fullPalette(system).filter(function(c){return settings.customColors.indexOf(c.color)>=0;}):palettes.getPalette(system,settings.paletteSize);
  var excluded=settings.excludeColors||[];return list.filter(function(c){return excluded.indexOf(c.color)<0;});
}

Page({
  data: {
    name:'新拼豆图', loaded:false, busy:false, width:0, height:0, columns:52,
    cropVisible:false,cropImage:'',cropWidth:0,cropHeight:0,cropRectStyle:'',advancedOpen:false,
    sizeNames:['130 × 130','104 × 104','78 × 78','52 × 52','32 × 32','29 × 29'],sizeValues:[130,104,78,52,32,29],sizeIndex:3,
    colorNames:[],colorValues:[],colorIndex:0,extraColorValues:[null].concat(mardPresets.extraSizes),extraColorNames:['选择其他色数'].concat(mardPresets.extraSizes.map(function(n){return n+' 色';})),
    systems:palettes.systems, systemIndex:0, modeNames:['卡通 · 主色','照片 · 平均色'], modeIndex:0, mergeThreshold:0,removeBackground:false,
    palette:[], filterPalette:[], selectedColor:{}, counts:[], colorCount:0,total:0, panel:'', colorPanelOpen:false, pickMode:'', replaceSourceKey:'',
    editing:false, undoCount:0, boardMode:false, scaleLocked:false, positionLocked:false,
    calibrating:false, profiles:[], exporting:false,
    exportOptions:{hideNumbers:false,includeStats:true,mirror:false,showCoordinates:true,showGrid:true,gridInterval:10,split:false,tileSize:50}
  },
  onLoad:function(options) {
    this.viewport = viewport.createViewport({scale:10,x:0,y:0,scaleLocked:false,positionLocked:false});
    this.generation = 0;
    this.projectId = options.id || '';
    var initialColors=colorOptions('MARD',221);
    this.setData({palette:palettes.getPalette('MARD',221),colorNames:initialColors.names,colorValues:initialColors.values,colorIndex:initialColors.index});
    if (this.projectId) {
      try {
        this.project = local.store().load(this.projectId);
        var system = this.project.system || 'MARD', si = Math.max(0,palettes.systems.indexOf(system));
        var colors=colorOptions(system,this.project.paletteSize||291,this.project.customColors), sizeValue=this.project.maxSide||Math.max(this.project.width,this.project.height), sizeIndex=this.data.sizeValues.indexOf(sizeValue);
        this.setData({name:this.project.name,loaded:true,width:this.project.width,height:this.project.height,columns:sizeValue,sizeIndex:sizeIndex,systemIndex:si,colorNames:colors.names,colorValues:colors.values,colorIndex:colors.index,modeIndex:this.project.mode === 'average'?1:0,mergeThreshold:this.project.mergeThreshold||0,removeBackground:!!this.project.removeBackground,palette:availablePalette({system:system,paletteSize:this.project.paletteSize,customColors:this.project.customColors,excludeColors:this.project.excludeColors})});
        this.refreshCounts();
      } catch(e) { error('项目读取失败，请返回列表后重试。'); }
    }
  },
  onReady:function() { var page=this; if(this.project) this.initStage(function(){page.fit();page.draw();if(!page.project.cells.length||page.project.pendingSettings)page.regenerate();}); else this.chooseImage(); },
  onShow:function(){if(this.boardModeActive)wx.setKeepScreenOn({keepScreenOn:true});},
  onHide:function(){if(this.boardModeActive)wx.setKeepScreenOn({keepScreenOn:false});},
  onUnload:function() { this.generation++; this.drawDisposed=true; if(this.updateTimer) clearTimeout(this.updateTimer); if(this.boardModeActive) wx.setKeepScreenOn({keepScreenOn:false}); },
  onResize:function() { var page=this;if(this.data.cropVisible&&this.cropDraft){var d=this.cropDraft,info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();d.scale=Math.min(Math.max(100,Math.min(600,info.windowWidth-32))/d.width,Math.max(100,Math.min(520,info.windowHeight*.58))/d.height);this.setData({cropWidth:d.width*d.scale,cropHeight:d.height*d.scale});this.updateCropRect();return;}if(!this.project||this.data.colorPanelOpen) return; this.initStage(function(){ page.viewport=viewport.resize(page.viewport);page.draw(); }); },
  chooseImage:function() {
    var page=this;
    function chosen(path) {
      wx.getImageInfo({src:path,success:function(info){
        page.beginCrop(path,info.width,info.height,info.type,true);
      },fail:function(){error('读取图片失败，请选择其他图片。');}});
    }
    if(wx.chooseMedia) wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album'],success:function(r){if(r.tempFiles&&r.tempFiles[0]) chosen(r.tempFiles[0].tempFilePath);},fail:function(e){if(!/cancel/i.test(e.errMsg||'')) error('无法打开相册，请检查系统权限或媒体组件。');}});
    else if(wx.chooseImage) wx.chooseImage({count:1,sourceType:['album'],success:function(r){if(r.tempFilePaths&&r.tempFilePaths[0]) chosen(r.tempFilePaths[0]);},fail:function(e){if(!/cancel/i.test(e.errMsg||'')) error('无法打开相册，请检查系统权限。');}});
    else error('当前环境不支持选择相册图片。');
  },
  beginCrop:function(path,width,height,type,isNew) {
    var info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync(), maxWidth=Math.max(100,Math.min(600,info.windowWidth-32)), maxHeight=Math.max(100,Math.min(520,info.windowHeight*.58)), scale=Math.min(maxWidth/width,maxHeight/height);
    this.cropDraft={path:path,width:width,height:height,type:type,isNew:isNew,scale:scale,rect:!isNew&&this.project.crop?Object.assign({},this.project.crop):crop.initialSquare(width,height)};
    this.setData({cropVisible:true,cropImage:path,cropWidth:width*scale,cropHeight:height*scale});this.updateCropRect();
  },
  updateCropRect:function(){var d=this.cropDraft,r=d.rect,s=d.scale;this.setData({cropRectStyle:'left:'+r.x*s+'px;top:'+r.y*s+'px;width:'+r.width*s+'px;height:'+r.height*s+'px;'});},
  recrop:function(){if(this.data.busy||!this.project)return;this.beginCrop(this.project.imagePath,this.project.sourceWidth,this.project.sourceHeight,this.project.imagePath.split('.').pop(),false);},
  resetCrop:function(){var d=this.cropDraft;d.rect=crop.initialSquare(d.width,d.height);this.updateCropRect();},
  cropTouchStart:function(e){var t=touchPoint(e.touches&&e.touches[0]);if(!t)return;this.cropGesture={x:t.x,y:t.y,edge:e.currentTarget.dataset.edge||'move',rect:Object.assign({},this.cropDraft.rect)};},
  cropTouchMove:function(e){var t=touchPoint(e.touches&&e.touches[0]),g=this.cropGesture,d=this.cropDraft;if(!t||!g||!d)return;var dx=(t.x-g.x)/d.scale,dy=(t.y-g.y)/d.scale,area={width:d.width,height:d.height};d.rect=g.edge==='move'?crop.move(g.rect,dx,dy,area):crop.resize(g.rect,g.edge,dx,dy,area);this.updateCropRect();},
  cropTouchEnd:function(){this.cropGesture=null;},
  cancelCrop:function(){var page=this,existing=!!this.project;this.cropDraft=null;this.setData({cropVisible:false},function(){if(existing)page.initStage(function(){page.draw();});});},
  confirmCrop:function(){
    var page=this,d=this.cropDraft;if(!d)return;
    if(!d.isNew){this.cropDraft=null;this.setData({cropVisible:false},function(){page.initStage(function(){page.draw();page.requestChange({crop:d.rect,maxSide:page.project.maxSide||Math.max(page.project.width,page.project.height)});});});return;}
    var projectId=id(),copy;
    try {copy=local.copyImage(d.path,projectId,d.type);} catch(e){error('无法保存图片到本机，请检查存储空间后重试。');return;}
    this.projectId=projectId;this.project={id:projectId,name:'拼豆图 '+new Date().toLocaleDateString(),imagePath:copy,sourceWidth:d.width,sourceHeight:d.height,crop:d.rect,maxSide:52,paletteSize:221,system:'MARD',mode:'dominant',width:52,height:0,cells:[],edited:false,updatedAt:Date.now()};
    if(!this.persist()){try{local.discardCopy(copy,projectId);}catch(e){error('项目保存失败，临时图片副本也未能清理，请检查本机存储空间。');}this.project=null;this.projectId='';return;}
    this.cropDraft=null;var colors=colorOptions('MARD',221);this.setData({cropVisible:false,name:this.project.name,loaded:true,columns:52,sizeIndex:3,systemIndex:0,colorNames:colors.names,colorValues:colors.values,colorIndex:colors.index,modeIndex:0,palette:palettes.getPalette('MARD',221)},function(){page.initStage(function(){page.regenerate();});});
  },
  initStage:function(done) {
    var page=this;
    wx.createSelectorQuery().in(this).select('#stage').boundingClientRect().select('#bead-canvas').fields({node:true,size:true}).select('#sample-canvas').fields({node:true,size:true}).select('#export-canvas').fields({node:true,size:true}).exec(function(r){
      if(page.drawDisposed||page.data.colorPanelOpen)return;
      if(!r || !r[0] || !r[1] || !r[1].node || !r[2] || !r[2].node || !r[3] || !r[3].node) {error('画布初始化失败，请返回后重新打开。');return;}
      page.rect=r[0];page.canvas=r[1].node;page.sampleCanvas=r[2].node;page.exportCanvas=r[3].node;
      var info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();page.dpr=info.pixelRatio||1;
      page.canvas.width=Math.round(r[1].width*page.dpr);page.canvas.height=Math.round(r[1].height*page.dpr);
      page.ctx=page.canvas.getContext('2d'); if(done) done();
    });
  },
  fit:function() {
    if(!this.project || !this.project.width || !this.project.height || !this.rect) return;
    var scale=Math.min((this.rect.width-24)/this.project.width,(this.rect.height-24)/this.project.height);
    this.viewport=viewport.createViewport({scale:scale,x:(this.rect.width-this.project.width*scale)/2,y:(this.rect.height-this.project.height*scale)/2,scaleLocked:false,positionLocked:false});
    this.syncLocks();
  },
  persist:function() {
    if(!this.project) return false;
    this.project.updatedAt=Date.now();
    try {local.store().save(this.project);return true;} catch(e) {error('保存失败，请检查存储空间；当前修改尚未可靠保存。');return false;}
  },
  refreshCounts:function() {
    if(!this.project)return;
    var map={};this.project.cells.forEach(function(c){if(!c)return;var k=c.key+'|'+c.color;if(!map[k])map[k]={key:c.key,color:c.color,count:0};map[k].count++;});
    var counts=Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return b.count-a.count;});
    this.setData({counts:counts,total:counts.reduce(function(n,c){return n+c.count;},0),colorCount:counts.length,width:this.project.width,height:this.project.height});
  },
  regenerate:function() {
    var page=this, seq=++this.generation, p=this.project, target=this.pendingSettings || p.pendingSettings || {width:p.width,maxSide:p.maxSide,crop:p.crop,paletteSize:p.paletteSize,customColors:p.customColors,system:p.system,mode:p.mode,mergeThreshold:p.mergeThreshold,excludeColors:p.excludeColors,removeBackground:p.removeBackground}, dim;
    if(!p || !this.sampleCanvas)return;
    var region=target.crop||{x:0,y:0,width:p.sourceWidth,height:p.sourceHeight};
    try {dim=target.maxSide?crop.gridDimensions(region.width,region.height,target.maxSide):core.gridDimensions(region.width,region.height,target.width);} catch(e){this.pendingSettings=null;this.setData({busy:false,columns:p.maxSide||p.width});error(e.message);return;}
    this.setData({busy:true});
    var node=this.sampleCanvas, image=node.createImage();
    image.onload=function() {
      if(seq!==page.generation)return;
      var factor=Math.min(1,1200/Math.max(region.width,region.height));
      node.width=Math.max(dim.width,Math.round(region.width*factor));node.height=Math.max(dim.height,Math.round(region.height*factor));
      try {
        var ctx=node.getContext('2d');ctx.clearRect(0,0,node.width,node.height);ctx.drawImage(image,region.x,region.y,region.width,region.height,0,0,node.width,node.height);
        var raw=ctx.getImageData(0,0,node.width,node.height);
        var pixels=target.removeBackground?core.removeEdgeBackground(raw.data,node.width,node.height,10):raw.data;
        var job=core.createPixelJob({data:pixels,width:node.width,height:node.height},dim.width,dim.height,availablePalette(target),{mode:target.mode,mergeThreshold:target.mergeThreshold||0});
        function step() {
          if(seq!==page.generation)return;
          try {
            if(!job.step(200).done) {setTimeout(step,0);return;}
            p.cells=job.result();p.width=dim.width;p.height=dim.height;p.system=target.system;p.mode=target.mode;p.crop=target.crop;p.maxSide=target.maxSide;p.paletteSize=target.paletteSize;p.customColors=target.customColors;p.mergeThreshold=target.mergeThreshold||0;p.excludeColors=target.excludeColors||[];p.removeBackground=!!target.removeBackground;p.edited=false;page.pendingSettings=null;page.clearUndo();delete p.pendingSettings;
            var options=colorOptions(p.system,p.paletteSize||291,p.customColors),side=p.maxSide||p.width;
            page.setData({busy:false,columns:side,sizeIndex:page.data.sizeValues.indexOf(side),systemIndex:Math.max(0,palettes.systems.indexOf(p.system)),colorNames:options.names,colorValues:options.values,colorIndex:options.index,palette:availablePalette(p)});page.refreshCounts();if(!page.viewport.scaleLocked)page.fit();page.draw();page.persist();
          } catch(e){page.setData({busy:false});error('生成图纸失败：'+e.message);}
        }
        setTimeout(step,0);
      } catch(e) {page.setData({busy:false});error('读取图片像素失败，请尝试较小的图片。');}
    };
    image.onerror=function(){if(seq===page.generation){page.setData({busy:false});error('无法打开本机图片，请重新选择。');}};
    image.src=p.imagePath;
  },
  requestChange:function(values) {
    var page=this;
    function apply() {
      var p=page.project, previous=p.pendingSettings, target=Object.assign({},page.pendingSettings || p.pendingSettings || {width:p.width,maxSide:p.maxSide,crop:p.crop,paletteSize:p.paletteSize,customColors:p.customColors,system:p.system,mode:p.mode,mergeThreshold:p.mergeThreshold||0,excludeColors:p.excludeColors||[],removeBackground:!!p.removeBackground},values);
      p.pendingSettings=target;if(!page.persist()){if(previous)p.pendingSettings=previous;else delete p.pendingSettings;return;}
      page.pendingSettings=target;page.generation++;
      var colors=colorOptions(target.system,target.paletteSize||291,target.customColors), side=target.maxSide||target.width;
      page.setData({busy:true,columns:side,sizeIndex:page.data.sizeValues.indexOf(side),systemIndex:Math.max(0,palettes.systems.indexOf(target.system)),colorNames:colors.names,colorValues:colors.values,colorIndex:colors.index,modeIndex:target.mode==='average'?1:0,mergeThreshold:target.mergeThreshold||0,removeBackground:!!target.removeBackground,selectedColor:target.system!==p.system||target.paletteSize!==p.paletteSize||target.customColors!==p.customColors?{}:page.data.selectedColor,palette:availablePalette(target)});
      if(page.updateTimer)clearTimeout(page.updateTimer);
      page.updateTimer=setTimeout(function(){page.regenerate();},350);
    }
    if(!this.project.edited){apply();return;}
    wx.showActionSheet({itemList:['替换当前图纸（丢弃单格修改）','另存为新项目'],success:function(r){
      if(r.tapIndex===0){apply();return;}
      if(r.tapIndex===1){
        var old=page.project,newId=id(),type=old.imagePath.split('.').pop().toLowerCase();
        try {var newPath=local.copyImage(old.imagePath,newId,type);page.project=JSON.parse(JSON.stringify(old));page.project.id=newId;page.project.imagePath=newPath;page.project.name=old.name+' 副本';page.projectId=newId;page.setData({name:page.project.name});apply();}
        catch(e){error('无法创建副本，请检查本机存储空间。');}
      }
    }});
  },
  changeColumns:function(e) { var n=Number(e.detail.value);if(n>=10&&n<=300) this.requestChange({width:Math.round(n),maxSide:Math.round(n)}); },
  changeSize:function(e){var n=this.data.sizeValues[Number(e.detail.value)];if(n)this.requestChange({width:n,maxSide:n});},
  confirmPaletteReset:function(done){var current=this.pendingSettings||this.project;if(!Array.isArray(current.customColors)){done();return;}wx.showModal({title:'切换色板',content:'切换后会重置当前自定义色号，是否继续？',success:function(r){if(r.confirm)done();}});},
  selectColorSize:function(n){var page=this,current=this.pendingSettings||this.project;if(typeof n!=='number')return;function apply(){page.requestChange({system:'MARD',paletteSize:n,customColors:null,excludeColors:[]});}if(current.system&&current.system!=='MARD'){wx.showModal({title:'切换色数',content:'此项目使用原来的 '+current.system+' 色板，选择色数后将使用 MARD 色板重新生成图纸，是否继续？',success:function(r){if(r.confirm)page.confirmPaletteReset(apply);}});}else this.confirmPaletteReset(apply);},
  changeColorSize:function(e){this.selectColorSize(this.data.colorValues[Number(e.detail.value)]);},
  changeExtraColorSize:function(e){this.selectColorSize(this.data.extraColorValues[Number(e.detail.value)]);},
  changeSystem:function(e) {var page=this,system=palettes.systems[Number(e.detail.value)],state=this.pendingSettings||this.project;if(!system||system===state.system)return;var current=state.paletteSize||291,choice=colorOptions(system,current);this.confirmPaletteReset(function(){page.requestChange({system:system,paletteSize:choice.value,customColors:null,excludeColors:[]});});},
  changeMode:function(e) {this.requestChange({mode:Number(e.detail.value)?'average':'dominant'});},
  changeMerge:function(e) {this.requestChange({mergeThreshold:Number(e.detail.value)});},
  changeBackground:function(e) {this.requestChange({removeBackground:e.detail.value});},
  renameProject:function() {var page=this;if(!this.project)return;wx.showModal({title:'项目名称',editable:true,placeholderText:this.project.name,success:function(r){if(r.confirm&&r.content&&r.content.trim()){page.project.name=r.content.trim().slice(0,40);page.setData({name:page.project.name});page.persist();}}});},
  togglePanel:function(e){var p=e.currentTarget.dataset.panel;this.setData({panel:this.data.panel===p?'':p,pickMode:''});},
  closePanel:function(){if(this.data.colorPanelOpen){this.closeColorPanel();return;}this.setData({panel:''});},
  toggleEditing:function(){var editing=!this.data.editing;this.setData({editing:editing,panel:'',pickMode:''});},
  openColorPanel:function(panel){this.drawSequence=(this.drawSequence||0)+1;this.drawPending=false;this.canvas=null;this.ctx=null;this.setData({panel:panel,colorPanelOpen:true});},
  closeColorPanel:function(extra,done){
    var page=this,values=Object.assign({panel:'',colorPanelOpen:false},extra||{});
    this.setData(values,function(){if(!page.drawDisposed&&!page.data.colorPanelOpen)page.initStage(function(){page.draw();if(done)done();});});
  },
  openColors:function(){if(this.data.busy){wx.showToast({title:'请等待图纸生成',icon:'none'});return;}this.setData({pickMode:'paint',panel:''});},
  openPalette:function(){if(this.data.pickMode==='paint')this.openColorPanel('colors');else if(this.data.pickMode==='replaceTarget')this.openColorPanel('replaceTarget');},
  cancelPicking:function(){this.replaceSource=null;this.setData({pickMode:'',replaceSourceKey:''});},
  selectColor:function(e){
    var index=Number(e.currentTarget.dataset.index),panel=this.data.panel;
    if(this.data.busy){wx.showToast({title:'请等待图纸生成',icon:'none'});return;}
    var c=this.data.palette[index];if(!c)return;
    if(panel==='replaceTarget'){this.applyReplacement(c);return;}
    this.closeColorPanel({selectedColor:c,pickMode:''});wx.showToast({title:'已选择 '+c.key,icon:'none'});
  },
  applyReplacement:function(c){
    var source=this.replaceSource,changes=[];if(!source)return;
    this.project.cells.forEach(function(cell,i){if(cell&&cell.color===source.color&&(cell.color!==c.color||cell.key!==c.key))changes.push({index:i,cell:cell});});
    if(!changes.length){wx.showToast({title:'请选择不同的目标颜色',icon:'none'});return;}
    this.recordUndo(changes);var cells=this.project.cells;changes.forEach(function(change){cells[change.index]={key:c.key,color:c.color};});
    this.colorCache=null;this.project.edited=true;this.refreshCounts();this.persist();this.replaceSource=null;
    if(this.data.colorPanelOpen)this.closeColorPanel({pickMode:'',replaceSourceKey:''});else{this.setData({pickMode:'',replaceSourceKey:''});this.draw();}
    wx.showToast({title:'已替换 '+changes.length+' 格',icon:'none'});
  },
  chooseEraser:function(){this.setData({selectedColor:{key:'擦除',erase:true},pickMode:''});wx.showToast({title:'已选择擦除',icon:'none'});},
  beginReplace:function(){if(this.data.busy){wx.showToast({title:'请等待图纸生成',icon:'none'});return;}if(!this.data.counts.length){wx.showToast({title:'图纸没有可替换的颜色',icon:'none'});return;}this.replaceSource=null;this.setData({pickMode:'replaceSource',replaceSourceKey:'',panel:''});},
  clearUndo:function(){this.undoHistory=[];this.undoCellsCount=0;this.setData({undoCount:0});},
  recordUndo:function(changes){
    if(!this.undoHistory)this.undoHistory=[];this.undoCellsCount=this.undoCellsCount||0;
    this.undoHistory.push(changes);this.undoCellsCount+=changes.length;
    while(this.undoHistory.length>1&&(this.undoHistory.length>50||this.undoCellsCount>200000))this.undoCellsCount-=this.undoHistory.shift().length;
    this.setData({undoCount:this.undoHistory.length});
  },
  undoEdit:function(){
    if(this.data.busy){wx.showToast({title:'请等待图纸生成',icon:'none'});return;}
    if(!this.undoHistory||!this.undoHistory.length){wx.showToast({title:'没有可撤销的修改',icon:'none'});return;}
    var changes=this.undoHistory.pop(),cells=this.project.cells;changes.forEach(function(change){cells[change.index]=change.cell;});
    this.undoCellsCount-=changes.length;this.colorCache=null;this.project.edited=true;this.setData({undoCount:this.undoHistory.length});this.refreshCounts();this.draw();this.persist();
    wx.showToast({title:'已撤销',icon:'none'});
  },
  openExcludes:function(){var current=this.pendingSettings||this.project,active=availablePalette(current);this.draftSelected=active.map(function(c){return c.color;});this.draftPalette=fullPalette(current.system||'MARD');this.refreshFilterPalette();this.openColorPanel('exclude');},
  refreshFilterPalette:function(){var selected=this.draftSelected;this.setData({draftSelectedCount:selected.length,filterPalette:this.draftPalette.map(function(c){return {key:c.key,color:c.color,excluded:selected.indexOf(c.color)<0};})});},
  toggleExcluded:function(e){var color=this.data.filterPalette[e.currentTarget.dataset.index].color,i=this.draftSelected.indexOf(color);if(i>=0)this.draftSelected.splice(i,1);else this.draftSelected.push(color);this.refreshFilterPalette();},
  selectAllColors:function(){this.draftSelected=this.draftPalette.map(function(c){return c.color;});this.refreshFilterPalette();},
  clearAllColors:function(){this.draftSelected=[];this.refreshFilterPalette();},
  confirmExcludes:function(){if(!this.draftSelected.length){error('请至少保留一种颜色。');return;}var page=this,selected=this.draftSelected.slice();this.closeColorPanel({panel:'settings'},function(){page.requestChange({customColors:selected,excludeColors:[]});});},
  toggleBoard:function(){var page=this,on=!this.data.boardMode;this.boardModeActive=on;this.setData({boardMode:on,panel:'',editing:false,pickMode:''},function(){page.initStage(function(){page.draw();});});wx.setKeepScreenOn({keepScreenOn:on});},
  syncLocks:function(){this.setData({scaleLocked:!!this.viewport.scaleLocked,positionLocked:!!this.viewport.positionLocked});},
  toggleScaleLock:function(){this.viewport.scaleLocked=!this.viewport.scaleLocked;this.syncLocks();},
  togglePositionLock:function(){this.viewport.positionLocked=!this.viewport.positionLocked;this.syncLocks();},
  requestDraw:function() {
    if(this.drawPending||this.drawDisposed)return;
    var page=this, canvas=this.canvas, sequence=this.drawSequence||0;
    this.drawPending=true;
    function render(){if(sequence!==(page.drawSequence||0))return;page.drawPending=false;if(!page.drawDisposed)page.draw();}
    if(canvas&&typeof canvas.requestAnimationFrame==='function')canvas.requestAnimationFrame(render);
    else setTimeout(render,16);
  },
  colorCanvas:function() {
    var p=this.project, old=this.colorCache;
    if(old&&old.cells===p.cells&&old.width===p.width&&old.height===p.height)return old.canvas;
    var cache={cells:p.cells,width:p.width,height:p.height,canvas:null};this.colorCache=cache;
    if(typeof wx.createOffscreenCanvas!=='function')return null;
    try {
      var canvas=wx.createOffscreenCanvas({type:'2d',width:p.width,height:p.height});
      var ctx=canvas.getContext('2d'), pixels=ctx.createImageData(p.width,p.height), data=pixels.data;
      for(var i=0;i<p.width*p.height;i++){
        var cell=p.cells[i],color=cell?parseInt(cell.color.slice(1),16):0xffffff,offset=i*4;
        data[offset]=(color>>16)&255;data[offset+1]=(color>>8)&255;data[offset+2]=color&255;data[offset+3]=255;
      }
      ctx.putImageData(pixels,0,0);cache.canvas=canvas;
    } catch(e) {cache.canvas=null;}
    return cache.canvas;
  },
  draw:function() {
    if(!this.ctx||!this.project||!this.project.cells.length||!this.rect)return;
    var ctx=this.ctx,v=this.viewport,p=this.project,d=this.dpr||1,w=this.rect.width,h=this.rect.height;
    ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#e8e6dc';ctx.fillRect(0,0,w,h);
    var left=Math.max(0,Math.floor(-v.x/v.scale)),top=Math.max(0,Math.floor(-v.y/v.scale));
    var right=Math.min(p.width,Math.ceil((w-v.x)/v.scale)),bottom=Math.min(p.height,Math.ceil((h-v.y)/v.scale));
    var cached=this.colorCanvas(), usedCache=false;
    if(cached){try{ctx.imageSmoothingEnabled=false;ctx.drawImage(cached,v.x,v.y,p.width*v.scale,p.height*v.scale);usedCache=true;}catch(e){this.colorCache.canvas=null;}}
    if(!usedCache){
      for(var fy=top;fy<bottom;fy++)for(var fx=left;fx<right;fx++){
        var fill=p.cells[fy*p.width+fx];ctx.fillStyle=fill?fill.color:'#ffffff';ctx.fillRect(v.x+fx*v.scale,v.y+fy*v.scale,v.scale+.25,v.scale+.25);
      }
    }
    if(v.scale>=8&&left<right&&top<bottom){
      ctx.strokeStyle='rgba(70,80,70,.20)';ctx.lineWidth=.5;ctx.beginPath();
      for(var gx=left;gx<=right;gx++){ctx.moveTo(v.x+gx*v.scale,v.y+top*v.scale);ctx.lineTo(v.x+gx*v.scale,v.y+bottom*v.scale);}
      for(var gy=top;gy<=bottom;gy++){ctx.moveTo(v.x+left*v.scale,v.y+gy*v.scale);ctx.lineTo(v.x+right*v.scale,v.y+gy*v.scale);}
      ctx.stroke();
    }
    if(v.scale<23)return;
    for(var y=top;y<bottom;y++)for(var x=left;x<right;x++){
      var c=p.cells[y*p.width+x],px=v.x+x*v.scale,py=v.y+y*v.scale;
      if(c&&v.scale>=23){var rgb=parseInt(c.color.slice(1),16),lum=((rgb>>16)*299+((rgb>>8)&255)*587+(rgb&255)*114)/1000;ctx.fillStyle=lum<140?'#fff':'#222';ctx.font=Math.min(14,Math.max(7,v.scale*.3))+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(c.key,px+v.scale/2,py+v.scale/2);}
    }
  },
  canvasStart:function(e) {
    if(this.data.busy||!this.rect)return;
    var page=this, token=this.gestureToken=(this.gestureToken||0)+1;
    var t=(e.touches||[]).map(touchPoint);if(!t.length||t.some(function(point){return !point;})){this.canvasCancel();return;}
    this.rectPending=true;this.pendingTouchEnd=false;
    if(t.length===2){this.pinch={distance:distance(t[0],pointInSpace(t[1],t[0].local,this.rect)),scale:this.viewport.scale};this.lastTouch=null;this.moved=true;}
    else if(t.length===1){this.lastTouch={x:t[0].x,y:t[0].y,startX:t[0].x,startY:t[0].y,local:t[0].local};this.moved=false;}
    wx.createSelectorQuery().in(this).select('#stage').boundingClientRect(function(rect){
      if(token!==page.gestureToken)return;
      if(rect)page.rect=rect;page.rectPending=false;
      if(page.pendingTouchEnd){page.pendingTouchEnd=false;page.canvasEnd({touches:[]});}
    }).exec();
  },
  canvasMove:function(e) {
    var t=(e.touches||[]).map(touchPoint);if(!this.rect||t.some(function(point){return !point;}))return;
    if(t.length===2&&this.pinch&&this.pinch.distance){var focus=midpoint(t[0],t[1],this.rect),second=pointInSpace(t[1],t[0].local,this.rect);this.viewport=viewport.zoom(this.viewport,this.pinch.scale*distance(t[0],second)/this.pinch.distance,focus.x,focus.y);this.moved=true;this.requestDraw();return;}
    if(t.length===1&&this.lastTouch){var point=pointInSpace(t[0],this.lastTouch.local,this.rect),wasMoved=this.moved,dx=point.x-this.lastTouch.x,dy=point.y-this.lastTouch.y;if(Math.abs(point.x-this.lastTouch.startX)+Math.abs(point.y-this.lastTouch.startY)>5)this.moved=true;if(this.moved){if(!wasMoved){dx=point.x-this.lastTouch.startX;dy=point.y-this.lastTouch.startY;}this.viewport=viewport.pan(this.viewport,dx,dy);this.requestDraw();}this.lastTouch.x=point.x;this.lastTouch.y=point.y;}
  },
  canvasEnd:function(e) {
    if(e.touches&&e.touches.length)return;
    var ended=touchPoint(e.changedTouches&&e.changedTouches[0]);
    if(ended&&this.lastTouch&&Number.isFinite(this.lastTouch.startX)&&Number.isFinite(this.lastTouch.startY)){
      ended=pointInSpace(ended,this.lastTouch.local,this.rect);
      if(Math.abs(ended.x-this.lastTouch.startX)+Math.abs(ended.y-this.lastTouch.startY)>5)this.moved=true;
    }
    if(this.rectPending){this.pendingTouchEnd=true;return;}
    this.gestureToken=(this.gestureToken||0)+1;
    if(!this.moved&&this.lastTouch&&this.data.editing&&!this.data.calibrating&&this.project){
      var touchX=Number.isFinite(this.lastTouch.startX)?this.lastTouch.startX:this.lastTouch.x,touchY=Number.isFinite(this.lastTouch.startY)?this.lastTouch.startY:this.lastTouch.y;
      var local=pointInSpace({x:touchX,y:touchY,local:!!this.lastTouch.local},true,this.rect);
      var x=Math.floor((local.x-this.viewport.x)/this.viewport.scale),y=Math.floor((local.y-this.viewport.y)/this.viewport.scale),c=this.data.selectedColor;
      if(x>=0&&x<this.project.width&&y>=0&&y<this.project.height){
        var idx=y*this.project.width+x,old=this.project.cells[idx],mode=this.data.pickMode;
        if(mode){
          if(!old)wx.showToast({title:'请选择有颜色的格子',icon:'none'});
          else if(mode==='paint'){this.setData({selectedColor:{key:old.key,color:old.color},pickMode:''});wx.showToast({title:'已选择 '+old.key,icon:'none'});}
          else if(mode==='replaceSource'){this.replaceSource={key:old.key,color:old.color};this.setData({pickMode:'replaceTarget',replaceSourceKey:old.key});}
          else if(mode==='replaceTarget')this.applyReplacement(old);
        }else if(c.key){var next=c.erase?null:{key:c.key,color:c.color};if(!((!old&&!next)||(old&&next&&old.key===next.key&&old.color===next.color))){this.recordUndo([{index:idx,cell:old}]);this.project.cells[idx]=next;this.colorCache=null;this.project.edited=true;this.refreshCounts();this.draw();this.persist();}}
      }
    }
    this.lastTouch=null;this.pinch=null;
  },
  canvasCancel:function(){this.gestureToken=(this.gestureToken||0)+1;this.rectPending=false;this.pendingTouchEnd=false;this.lastTouch=null;this.pinch=null;},
  openCalibration:function(){this.setData({panel:'calibration'});},
  beginCalibration:function(){this.viewport=viewport.beginCalibration(this.viewport);this.setData({panel:'',calibrating:true});this.syncLocks();},
  cancelCalibration:function(){if(this.data.calibrating)this.viewport=viewport.cancelCalibration(this.viewport);this.setData({panel:'',calibrating:false});this.syncLocks();this.draw();},
  wheelStart:function(e){if(e.touches.length)this.wheelX=e.touches[0].clientX;},
  wheelMove:function(e){if(this.wheelX===undefined||!e.touches.length)return;var x=e.touches[0].clientX,dx=x-this.wheelX;this.wheelX=x;this.viewport=viewport.adjustCalibration(this.viewport,dx,this.rect.width/2,this.rect.height/2);this.requestDraw();},
  wheelEnd:function(){this.wheelX=undefined;},
  confirmCalibration:function(){
    var page=this;this.viewport=viewport.confirmCalibration(this.viewport);this.setData({calibrating:false});this.syncLocks();
    var profiles=this.readProfiles(),items=['另存为新比例'];if(profiles.length)items.push('覆盖已有比例');
    wx.showActionSheet({itemList:items,success:function(r){if(r.tapIndex===0)page.nameProfile(profiles);else page.selectOverwrite(profiles);}});
  },
  readProfiles:function(){try{var x=wx.getStorageSync(PROFILE_KEY);return Array.isArray(x)?x:[];}catch(e){return[];}},
  nameProfile:function(profiles,old){var page=this;wx.showModal({title:old?'覆盖比例':'保存比例',editable:true,placeholderText:old?old.name:'例如：5mm 柱距',success:function(r){if(!r.confirm)return;var name=(r.content||'').trim()||(old&&old.name);if(!name){error('请输入比例名称，建议使用柱距命名。');return;}try{var list=viewport.saveProfile(profiles,{id:old?old.id:id(),name:name,scale:page.viewport.scale},{overwrite:!!old});wx.setStorageSync(PROFILE_KEY,list);}catch(e){error('比例保存失败，请重试。');}}});},
  selectOverwrite:function(profiles){this.setData({panel:'profiles',profiles:profiles,profileAction:'overwrite'});},
  openProfiles:function(){this.setData({panel:'profiles',profiles:this.readProfiles(),profileAction:'apply'});},
  applyProfile:function(e){var profile=this.data.profiles.filter(function(p){return p.id===e.currentTarget.dataset.id;})[0];if(!profile)return;if(this.data.profileAction==='overwrite'){this.setData({panel:''});this.nameProfile(this.data.profiles,profile);return;}this.viewport=viewport.applyProfile(this.viewport,profile,this.rect.width/2,this.rect.height/2);this.setData({panel:''});this.syncLocks();this.draw();},
  deleteProfile:function(e){var page=this,id=e.currentTarget.dataset.id;wx.showModal({title:'删除比例',content:'确定删除该设备上保存的比例吗？',success:function(r){if(!r.confirm)return;try{var list=page.readProfiles().filter(function(p){return p.id!==id;});wx.setStorageSync(PROFILE_KEY,list);page.setData({profiles:list});}catch(err){error('删除失败，请重试。');}}});},
  openExport:function(){if(this.data.busy){wx.showToast({title:'请等待图纸生成',icon:'none'});return;}this.setData({panel:'export'});},
  exportSwitch:function(e){var o=Object.assign({},this.data.exportOptions);o[e.currentTarget.dataset.key]=e.detail.value;this.setData({exportOptions:o});},
  exportInput:function(e){var o=Object.assign({},this.data.exportOptions);o[e.currentTarget.dataset.key]=Number(e.detail.value);this.setData({exportOptions:o});},
  exportImage:function(){
    var page=this;if(this.data.exporting||!this.project)return;
    var o=Object.assign({},this.data.exportOptions);if(o.split)o.tileSize=Math.floor(o.tileSize);else delete o.tileSize;
    var plan;try{plan=exporter.createPlan(this.project,o);}catch(e){error(e.message);return;}
    this.setData({exporting:true});
    function next(index){
      if(index>=plan.pages.length){page.setData({exporting:false,panel:''});wx.showToast({title:'已保存 '+plan.pages.length+' 张',icon:'none'});return;}
      var part=plan.pages[index],canvas=page.exportCanvas;
      try{canvas.width=part.pixelWidth;canvas.height=part.pixelHeight;exporter.drawPage(canvas.getContext('2d'),plan,index);}catch(e){page.setData({exporting:false});error('生成图片失败，请尝试更小的分块。');return;}
      setTimeout(function(){wx.canvasToTempFilePath({canvas:canvas,x:0,y:0,width:part.pixelWidth,height:part.pixelHeight,destWidth:part.pixelWidth,destHeight:part.pixelHeight,fileType:'png',success:function(result){wx.saveImageToPhotosAlbum({filePath:result.tempFilePath,success:function(){next(index+1);},fail:function(){page.setData({exporting:false});error('已保存 '+index+' 张；相册保存失败，请检查权限或存储空间。');}});},fail:function(){page.setData({exporting:false});error('已保存 '+index+' 张；生成图片失败，请尝试分块。');}},page);},30);
    }
    next(0);
  }
});
