var core = require('../../utils/perler/core');
var palettes = require('../../utils/perler/palette');
var local = require('../../utils/perler/wx-store');
var viewport = require('../../utils/perler/viewport');
var exporter = require('../../utils/perler/export');
var PROFILE_KEY = 'perler-calibrations-v1';

function id() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
function distance(a, b) { var x=a.clientX-b.clientX, y=a.clientY-b.clientY; return Math.sqrt(x*x+y*y); }
function midpoint(a,b,rect) { return {x:(a.clientX+b.clientX)/2-rect.left,y:(a.clientY+b.clientY)/2-rect.top}; }
function error(message) { wx.showModal({title:'操作未完成',content:message,showCancel:false}); }

Page({
  data: {
    name:'新拼豆图', loaded:false, busy:false, width:0, height:0, columns:50,
    systems:palettes.systems, systemIndex:0, modeNames:['卡通 · 主色','照片 · 平均色'], modeIndex:0, mergeThreshold:0,removeBackground:false,
    palette:[], filterPalette:[], selectedColor:{}, counts:[], colorCount:0,total:0, panel:'',
    editing:false, boardMode:false, scaleLocked:false, positionLocked:false,
    calibrating:false, profiles:[], exporting:false,
    exportOptions:{hideNumbers:false,includeStats:true,mirror:false,showCoordinates:true,showGrid:true,gridInterval:10,split:false,tileSize:50}
  },
  onLoad:function(options) {
    this.viewport = viewport.createViewport({scale:10,x:0,y:0,scaleLocked:false,positionLocked:false});
    this.generation = 0;
    this.projectId = options.id || '';
    this.setData({palette:palettes.getPalette('MARD')});
    if (this.projectId) {
      try {
        this.project = local.store().load(this.projectId);
        var system = this.project.system || 'MARD', si = Math.max(0,palettes.systems.indexOf(system));
        this.setData({name:this.project.name,loaded:true,width:this.project.width,height:this.project.height,columns:this.project.width,systemIndex:si,modeIndex:this.project.mode === 'average'?1:0,mergeThreshold:this.project.mergeThreshold||0,removeBackground:!!this.project.removeBackground,palette:palettes.getPalette(system)});
        this.refreshCounts();
      } catch(e) { error('项目读取失败，请返回列表后重试。'); }
    }
  },
  onReady:function() { var page=this; if(this.project) this.initStage(function(){page.fit();page.draw();if(!page.project.cells.length||page.project.pendingSettings)page.regenerate();}); else this.chooseImage(); },
  onShow:function(){if(this.boardModeActive)wx.setKeepScreenOn({keepScreenOn:true});},
  onHide:function(){if(this.boardModeActive)wx.setKeepScreenOn({keepScreenOn:false});},
  onUnload:function() { this.generation++; if(this.updateTimer) clearTimeout(this.updateTimer); if(this.boardModeActive) wx.setKeepScreenOn({keepScreenOn:false}); },
  onResize:function() { var page=this; if(!this.project) return; this.initStage(function(){ page.viewport=viewport.resize(page.viewport);page.draw(); }); },
  chooseImage:function() {
    var page=this;
    function chosen(path) {
      wx.getImageInfo({src:path,success:function(info){
        var projectId=id(), copy;
        try { copy=local.copyImage(path,projectId,info.type); } catch(e) { error('无法保存图片到本机，请检查存储空间后重试。');return; }
        page.projectId=projectId;
        page.project={id:projectId,name:'拼豆图 ' + new Date().toLocaleDateString(),imagePath:copy,sourceWidth:info.width,sourceHeight:info.height,system:'MARD',mode:'dominant',width:50,height:0,cells:[],edited:false,updatedAt:Date.now()};
        if (!page.persist()) {
          try { local.discardCopy(copy,projectId);page.project=null; } catch(e) { error('项目保存失败，临时图片副本也未能清理，请检查本机存储空间。'); }
          return;
        }
        page.setData({name:page.project.name,loaded:true,columns:50,systemIndex:0,modeIndex:0,palette:palettes.getPalette('MARD')},function(){page.initStage(function(){page.regenerate();});});
      },fail:function(){error('读取图片失败，请选择其他图片。');}});
    }
    if(wx.chooseMedia) wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album'],success:function(r){if(r.tempFiles&&r.tempFiles[0]) chosen(r.tempFiles[0].tempFilePath);},fail:function(e){if(!/cancel/i.test(e.errMsg||'')) error('无法打开相册，请检查系统权限或媒体组件。');}});
    else if(wx.chooseImage) wx.chooseImage({count:1,sourceType:['album'],success:function(r){if(r.tempFilePaths&&r.tempFilePaths[0]) chosen(r.tempFilePaths[0]);},fail:function(e){if(!/cancel/i.test(e.errMsg||'')) error('无法打开相册，请检查系统权限。');}});
    else error('当前环境不支持选择相册图片。');
  },
  initStage:function(done) {
    var page=this;
    wx.createSelectorQuery().in(this).select('#stage').boundingClientRect().select('#bead-canvas').fields({node:true,size:true}).select('#sample-canvas').fields({node:true,size:true}).select('#export-canvas').fields({node:true,size:true}).exec(function(r){
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
    var page=this, seq=++this.generation, p=this.project, target=this.pendingSettings || p.pendingSettings || {width:p.width,system:p.system,mode:p.mode,mergeThreshold:p.mergeThreshold,excludeColors:p.excludeColors,removeBackground:p.removeBackground}, dim;
    if(!p || !this.sampleCanvas)return;
    try {dim=core.gridDimensions(p.sourceWidth,p.sourceHeight,target.width);} catch(e){this.pendingSettings=null;this.setData({busy:false,columns:p.width});error(e.message);return;}
    this.setData({busy:true});
    var node=this.sampleCanvas, image=node.createImage();
    image.onload=function() {
      if(seq!==page.generation)return;
      var factor=Math.min(1,1200/Math.max(p.sourceWidth,p.sourceHeight));
      node.width=Math.max(dim.width,Math.round(p.sourceWidth*factor));node.height=Math.max(dim.height,Math.round(p.sourceHeight*factor));
      try {
        var ctx=node.getContext('2d');ctx.clearRect(0,0,node.width,node.height);ctx.drawImage(image,0,0,node.width,node.height);
        var raw=ctx.getImageData(0,0,node.width,node.height);
        var pixels=target.removeBackground?core.removeEdgeBackground(raw.data,node.width,node.height,10):raw.data;
        var job=core.createPixelJob({data:pixels,width:node.width,height:node.height},dim.width,dim.height,palettes.getPalette(target.system),{mode:target.mode,mergeThreshold:target.mergeThreshold||0,excludeColors:target.excludeColors||[]});
        function step() {
          if(seq!==page.generation)return;
          try {
            if(!job.step(200).done) {setTimeout(step,0);return;}
            p.cells=job.result();p.width=dim.width;p.height=dim.height;p.system=target.system;p.mode=target.mode;p.mergeThreshold=target.mergeThreshold||0;p.excludeColors=target.excludeColors||[];p.removeBackground=!!target.removeBackground;p.edited=false;page.pendingSettings=null;delete p.pendingSettings;
            page.setData({busy:false,columns:p.width});page.refreshCounts();if(!page.viewport.scaleLocked)page.fit();page.draw();page.persist();
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
      var p=page.project, previous=p.pendingSettings, target=Object.assign({},page.pendingSettings || p.pendingSettings || {width:p.width,system:p.system,mode:p.mode,mergeThreshold:p.mergeThreshold||0,excludeColors:p.excludeColors||[],removeBackground:!!p.removeBackground},values);
      p.pendingSettings=target;if(!page.persist()){if(previous)p.pendingSettings=previous;else delete p.pendingSettings;return;}
      page.pendingSettings=target;page.generation++;
      page.setData({busy:true,columns:target.width,systemIndex:Math.max(0,palettes.systems.indexOf(target.system)),modeIndex:target.mode==='average'?1:0,mergeThreshold:target.mergeThreshold||0,removeBackground:!!target.removeBackground,palette:palettes.getPalette(target.system)});
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
  changeColumns:function(e) { var n=Number(e.detail.value);if(n>=10&&n<=300) this.requestChange({width:Math.round(n)}); },
  changeSystem:function(e) {this.requestChange({system:palettes.systems[Number(e.detail.value)]});},
  changeMode:function(e) {this.requestChange({mode:Number(e.detail.value)?'average':'dominant'});},
  changeMerge:function(e) {this.requestChange({mergeThreshold:Number(e.detail.value)});},
  changeBackground:function(e) {this.requestChange({removeBackground:e.detail.value});},
  renameProject:function() {var page=this;if(!this.project)return;wx.showModal({title:'项目名称',editable:true,placeholderText:this.project.name,success:function(r){if(r.confirm&&r.content&&r.content.trim()){page.project.name=r.content.trim().slice(0,40);page.setData({name:page.project.name});page.persist();}}});},
  togglePanel:function(e){var p=e.currentTarget.dataset.panel;this.setData({panel:this.data.panel===p?'':p});},
  closePanel:function(){this.setData({panel:''});},
  toggleEditing:function(){this.setData({editing:!this.data.editing});},
  openColors:function(){this.setData({panel:'colors'});},
  selectColor:function(e){var c=this.data.palette[e.currentTarget.dataset.index];if(this.data.panel==='replaceSource'){this.replaceSource=c.color;this.setData({panel:'replaceTarget'});return;}if(this.data.panel==='replaceTarget'){var source=this.replaceSource;this.undoCells=this.project.cells.slice();this.project.cells=this.project.cells.map(function(cell){return cell&&cell.color===source?{key:c.key,color:c.color}:cell;});this.project.edited=true;this.refreshCounts();this.draw();this.persist();this.setData({panel:''});return;}this.setData({selectedColor:c,panel:''});},
  chooseEraser:function(){this.setData({selectedColor:{key:'擦除',erase:true}});},
  beginReplace:function(){this.setData({panel:'replaceSource'});},
  undoEdit:function(){if(!this.undoCells){wx.showToast({title:'没有可撤销的修改',icon:'none'});return;}this.project.cells=this.undoCells;this.undoCells=null;this.project.edited=true;this.refreshCounts();this.draw();this.persist();},
  openExcludes:function(){var list=(this.pendingSettings&&this.pendingSettings.excludeColors)||this.project.excludeColors||[];this.draftExcluded=list.slice();this.refreshFilterPalette();this.setData({panel:'exclude'});},
  refreshFilterPalette:function(){var excluded=this.draftExcluded;this.setData({filterPalette:this.data.palette.map(function(c){return {key:c.key,color:c.color,excluded:excluded.indexOf(c.color)>=0};})});},
  toggleExcluded:function(e){var color=this.data.filterPalette[e.currentTarget.dataset.index].color,i=this.draftExcluded.indexOf(color);if(i>=0)this.draftExcluded.splice(i,1);else this.draftExcluded.push(color);this.refreshFilterPalette();},
  confirmExcludes:function(){if(this.draftExcluded.length>=this.data.palette.length){error('请至少保留一种颜色。');return;}this.setData({panel:'settings'});this.requestChange({excludeColors:this.draftExcluded.slice()});},
  toggleBoard:function(){var page=this,on=!this.data.boardMode;this.boardModeActive=on;this.setData({boardMode:on,panel:'',editing:false},function(){page.initStage(function(){page.draw();});});wx.setKeepScreenOn({keepScreenOn:on});},
  syncLocks:function(){this.setData({scaleLocked:!!this.viewport.scaleLocked,positionLocked:!!this.viewport.positionLocked});},
  toggleScaleLock:function(){this.viewport.scaleLocked=!this.viewport.scaleLocked;this.syncLocks();},
  togglePositionLock:function(){this.viewport.positionLocked=!this.viewport.positionLocked;this.syncLocks();},
  draw:function() {
    if(!this.ctx||!this.project||!this.project.cells.length||!this.rect)return;
    var ctx=this.ctx,v=this.viewport,p=this.project,d=this.dpr||1,w=this.rect.width,h=this.rect.height;
    ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#e8e6dc';ctx.fillRect(0,0,w,h);
    var left=Math.max(0,Math.floor(-v.x/v.scale)),top=Math.max(0,Math.floor(-v.y/v.scale));
    var right=Math.min(p.width,Math.ceil((w-v.x)/v.scale)),bottom=Math.min(p.height,Math.ceil((h-v.y)/v.scale));
    for(var y=top;y<bottom;y++)for(var x=left;x<right;x++){
      var c=p.cells[y*p.width+x],px=v.x+x*v.scale,py=v.y+y*v.scale;
      ctx.fillStyle=c?c.color:'#ffffff';ctx.fillRect(px,py,v.scale+.25,v.scale+.25);
      if(v.scale>=8){ctx.strokeStyle='rgba(70,80,70,.20)';ctx.lineWidth=.5;ctx.strokeRect(px,py,v.scale,v.scale);}
      if(c&&v.scale>=23){var rgb=parseInt(c.color.slice(1),16),lum=((rgb>>16)*299+((rgb>>8)&255)*587+(rgb&255)*114)/1000;ctx.fillStyle=lum<140?'#fff':'#222';ctx.font=Math.min(14,Math.max(7,v.scale*.3))+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(c.key,px+v.scale/2,py+v.scale/2);}
    }
  },
  canvasStart:function(e) {
    if(this.data.busy||!this.rect)return;
    var page=this, token=this.gestureToken=(this.gestureToken||0)+1;
    var t=e.touches.map(function(point){return {clientX:point.clientX,clientY:point.clientY};});
    this.rectPending=true;this.pendingTouchEnd=false;
    if(t.length===2){this.pinch={distance:distance(t[0],t[1]),scale:this.viewport.scale};this.lastTouch=null;this.moved=true;}
    else if(t.length===1){this.lastTouch={x:t[0].clientX,y:t[0].clientY,startX:t[0].clientX,startY:t[0].clientY};this.moved=false;}
    wx.createSelectorQuery().in(this).select('#stage').boundingClientRect(function(rect){
      if(!rect||token!==page.gestureToken)return;
      page.rect=rect;page.rectPending=false;
      if(page.pendingTouchEnd){page.pendingTouchEnd=false;page.canvasEnd({touches:[]});}
    }).exec();
  },
  canvasMove:function(e) {
    var t=e.touches;if(!this.rect)return;
    if(t.length===2&&this.pinch&&this.pinch.distance){var focus=midpoint(t[0],t[1],this.rect);this.viewport=viewport.zoom(this.viewport,this.pinch.scale*distance(t[0],t[1])/this.pinch.distance,focus.x,focus.y);this.moved=true;this.draw();return;}
    if(t.length===1&&this.lastTouch){var dx=t[0].clientX-this.lastTouch.x,dy=t[0].clientY-this.lastTouch.y;if(Math.abs(t[0].clientX-this.lastTouch.startX)+Math.abs(t[0].clientY-this.lastTouch.startY)>5)this.moved=true;if(!this.data.editing){this.viewport=viewport.pan(this.viewport,dx,dy);this.draw();}this.lastTouch.x=t[0].clientX;this.lastTouch.y=t[0].clientY;}
  },
  canvasEnd:function(e) {
    if(e.touches&&e.touches.length)return;
    if(this.rectPending){this.pendingTouchEnd=true;return;}
    this.gestureToken=(this.gestureToken||0)+1;
    if(!this.moved&&this.lastTouch&&this.data.editing&&!this.data.calibrating&&this.project){
      var x=Math.floor((this.lastTouch.x-this.rect.left-this.viewport.x)/this.viewport.scale),y=Math.floor((this.lastTouch.y-this.rect.top-this.viewport.y)/this.viewport.scale),c=this.data.selectedColor;
      if(x>=0&&x<this.project.width&&y>=0&&y<this.project.height&&c.key){this.undoCells=this.project.cells.slice();this.project.cells[y*this.project.width+x]=c.erase?null:{key:c.key,color:c.color};this.project.edited=true;this.refreshCounts();this.draw();this.persist();}
    }
    this.lastTouch=null;this.pinch=null;
  },
  canvasCancel:function(){this.gestureToken=(this.gestureToken||0)+1;this.rectPending=false;this.pendingTouchEnd=false;this.lastTouch=null;this.pinch=null;},
  openCalibration:function(){this.setData({panel:'calibration'});},
  beginCalibration:function(){this.viewport=viewport.beginCalibration(this.viewport);this.setData({panel:'',calibrating:true});this.syncLocks();},
  cancelCalibration:function(){if(this.data.calibrating)this.viewport=viewport.cancelCalibration(this.viewport);this.setData({panel:'',calibrating:false});this.syncLocks();this.draw();},
  wheelStart:function(e){if(e.touches.length)this.wheelX=e.touches[0].clientX;},
  wheelMove:function(e){if(this.wheelX===undefined||!e.touches.length)return;var x=e.touches[0].clientX,dx=x-this.wheelX;this.wheelX=x;this.viewport=viewport.adjustCalibration(this.viewport,dx,this.rect.width/2,this.rect.height/2);this.draw();},
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
      setTimeout(function(){wx.canvasToTempFilePath({canvas:canvas,x:0,y:0,width:part.pixelWidth,height:part.pixelHeight,destWidth:part.pixelWidth,destHeight:part.pixelHeight,success:function(result){wx.saveImageToPhotosAlbum({filePath:result.tempFilePath,success:function(){next(index+1);},fail:function(){page.setData({exporting:false});error('已保存 '+index+' 张；相册保存失败，请检查权限或存储空间。');}});},fail:function(){page.setData({exporting:false});error('已保存 '+index+' 张；生成图片失败，请尝试分块。');}},page);},30);
    }
    next(0);
  }
});
