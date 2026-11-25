'use strict';
var store = require('../../utils/seating/wx-store');
var bounds = require('../../utils/seating/bounds');
var planner = require('../../utils/seating/export-plan');
var output = require('../../utils/seating/wx-export');
var renderer = require('../../utils/seating/export-render');
var assets = require('../../utils/seating/assets');
var infoLayout = require('../../utils/seating/info-layout');
var stylePage = require('../../utils/seating/style-page');
var styleInteraction = require('../../utils/seating/style-interaction');
var styleModel = require('../../utils/seating/style-model');
var styleRender = require('../../utils/seating/style-render');
function message(content) { wx.showModal({ title: '操作未完成', content: content, showCancel: false }); }
Page(Object.assign({},stylePage,{
  data: { presets: ['1K（长边 1024）', '2K（长边 2048）', '4K（长边 4096）', '8K（长边 8192）'], presetValues: [1024, 2048, 4096, 8192], presetIndex: 1, ratios: ['保持场地比例', '16:9 横屏', '9:16 竖屏', '1:1', 'KT 2.4:0.9', 'KT 2.4:1.2', 'KT 0.9:2.4', 'KT 1.2:2.4','自定义比例'], ratioValues: [0, 16/9, 9/16, 1, 2.4/0.9, 2, 0.9/2.4, 0.5,0], ratioIndex: 0,customRatio:100,logoCorner:'top-left',logoScale:100,textScale:100,logoName:'', paperPresets:['自定义','KT 板 2.4 × 0.9 米（横）','KT 板 2.4 × 1.2 米（横）','KT 板 0.9 × 2.4 米（竖）','KT 板 1.2 × 2.4 米（竖）','16:9 大屏幕'],paperIndex:0,pixelWidth: 2048, pixelHeight: 2048, printUnits: ['米', '厘米', '毫米', '英寸'], unitFactors: [1, 0.01, 0.001, 0.0254], printUnitIndex: 0, printWidth: '', printHeight: '', dpi: 150, position: 50, cropping: false, status: '', busy: false },
  getStore: function() { return store.create(wx); },
  openChoice:function(event){var kind=event.currentTarget.dataset.kind,map={paper:'paperPresets',ratio:'ratios',preset:'presets',unit:'printUnits'},key=map[kind];if(key)this.setData({choiceKind:kind,choiceItems:this.data[key]});},
  closeChoice:function(){this.setData({choiceKind:''});},
  chooseOption:function(event){var value=event.currentTarget.dataset.index,kind=this.data.choiceKind,map={paper:'paperPreset',ratio:'selectRatio',preset:'selectPreset',unit:'printUnit'};this.closeChoice();if(map[kind])this[map[kind]]({detail:{value:value}});},
  openTemporal:function(event){var kind=event.currentTarget.dataset.kind;if(kind!=='date'&&kind!=='time')return;var now=new Date(),parts=String(this.data.eventDateRaw||'').split('-').map(Number),clock=String(this.data.eventTime||'').split(':').map(Number),year=parts.length===3?parts[0]:now.getFullYear(),month=parts.length===3?parts[1]:now.getMonth()+1,day=parts.length===3?parts[2]:now.getDate();this.setData({temporalKind:kind,temporalYear:year,temporalMonth:month,temporalDay:day,temporalHour:clock.length===2?clock[0]:now.getHours(),temporalMinute:clock.length===2?clock[1]:now.getMinutes(),years:Array.from({length:201},function(_,i){return 1900+i;}),months:Array.from({length:12},function(_,i){return i+1;}),days:Array.from({length:new Date(year,month,0).getDate()},function(_,i){return i+1;}),hours:Array.from({length:24},function(_,i){return i;}),minutes:Array.from({length:60},function(_,i){return i;})});},
  closeTemporal:function(){this.setData({temporalKind:''});},
  temporalChoose:function(event){var key=event.currentTarget.dataset.key,value=Number(event.currentTarget.dataset.value),fields={year:'temporalYear',month:'temporalMonth',day:'temporalDay',hour:'temporalHour',minute:'temporalMinute'},field=fields[key],update={};if(!field||!Number.isInteger(value))return;update[field]=value;var year=key==='year'?value:this.data.temporalYear,month=key==='month'?value:this.data.temporalMonth,max=new Date(year,month,0).getDate();update.days=Array.from({length:max},function(_,i){return i+1;});if(key!=='day'&&this.data.temporalDay>max)update.temporalDay=max;this.setData(update);},
  confirmTemporal:function(){var p=function(n){return String(n).padStart(2,'0');};if(this.data.temporalKind==='date')this.dateChanged({detail:{value:this.data.temporalYear+'-'+p(this.data.temporalMonth)+'-'+p(this.data.temporalDay)}});else if(this.data.temporalKind==='time')this.timeChanged({detail:{value:p(this.data.temporalHour)+':'+p(this.data.temporalMinute)}});this.closeTemporal();},
  onLoad: function(options) {
    try {
      this.project = this.getStore().load(options.id); var settings = this.project.exportSettings || {}, selected = settings.selection;
      this.fullBounds = bounds.project(this.project,{textScale:(settings.textScale||100)/100});
      var hasSelection=selected && [selected.x,selected.y,selected.width,selected.height].every(Number.isFinite) && selected.width > 0 && selected.height > 0;
      this.selectionMode=settings.selectionMode==='full'?'full':hasSelection?'custom':'full';
      this.selection = this.selectionMode==='custom' ? Object.assign({}, selected) : Object.assign({}, this.fullBounds);
      var preset = Number.isInteger(settings.presetIndex) && settings.presetIndex >= 0 && settings.presetIndex < this.data.presetValues.length ? settings.presetIndex : 1;
      this.setData({ presetIndex: preset, paperIndex:Number.isInteger(settings.paperIndex)&&settings.paperIndex>=0&&settings.paperIndex<this.data.paperPresets.length?settings.paperIndex:0,ratioIndex: Number.isInteger(settings.ratioIndex) && settings.ratioIndex >= 0 && settings.ratioIndex < this.data.ratioValues.length ? settings.ratioIndex : 0, position: Number.isFinite(settings.position) ? Math.max(0, Math.min(100, settings.position)) : 50, printUnitIndex: Number.isInteger(settings.printUnitIndex) && settings.printUnitIndex >= 0 && settings.printUnitIndex < this.data.unitFactors.length ? settings.printUnitIndex : 0, printWidth: settings.printWidth || '', printHeight: settings.printHeight || '', dpi: settings.dpi > 0 ? settings.dpi : 150,eventTitle:settings.eventTitle||'',eventDate:settings.eventDate||'',eventDateRaw:settings.eventDateRaw||'',eventTime:settings.eventTime||'',eventPlace:settings.eventPlace||'' });
      this.setData({customRatio:settings.customRatio||100,logoCorner:settings.logoCorner||'top-left',logoScale:settings.logoScale||100,textScale:settings.textScale||100,logoName:settings.logoName||'',projectHasLogo:!!this.project.assets.logo});
      this.styleSetup(settings);
      if (Number.isSafeInteger(settings.pixelWidth) && settings.pixelWidth > 0 && Number.isSafeInteger(settings.pixelHeight) && settings.pixelHeight > 0) {
        if(this.selectionMode==='full'&&this.data.ratioIndex===0)this.setLongEdge(Math.max(settings.pixelWidth,settings.pixelHeight));
        else this.setData({pixelWidth:settings.pixelWidth,pixelHeight:settings.pixelHeight});
      }
      else this.setLongEdge(this.data.presetValues[preset]);
    }
    catch (error) { message('无法读取座位图。'); }
  },
  onReady: function() {
    var page = this;
    wx.createSelectorQuery().in(this).select('#preview').fields({node:true,size:true}).select('#export').fields({node:true,size:true}).select('#preview').boundingClientRect().exec(function(result) {
      if (!result[0] || !result[1] || !result[2]) return message('导出画布无法加载。');
      page.previewCanvas = result[0].node; page.exportCanvas = result[1].node; page.previewRect = result[2];
      var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(), dpr = info.pixelRatio || 1;
      page.previewCanvas.width = Math.round(result[0].width * dpr); page.previewCanvas.height = Math.round(result[0].height * dpr); page.loadPreviewAssets(); page.drawPreview();
    });
  },
  onUnload:function(){if(this.settingsTimer)clearTimeout(this.settingsTimer);if(this.settingsTimer||this.activeStyleSlider||this.styleDrag&&this.styleDrag.recorded)this.saveSettings();this.assetTicket=(this.assetTicket||0)+1;},
  ratio: function() { return this.data.ratioIndex===8?this.data.customRatio/100:(this.data.ratioValues[this.data.ratioIndex] || this.selection.width / this.selection.height); },
  customRatioInput:function(event){var value=Number(event.detail.value);if(!Number.isFinite(value))return;this.setData({customRatio:Math.max(10,Math.min(1000,value)),ratioIndex:8,paperIndex:0});this.setLongEdge(Math.max(this.data.pixelWidth,this.data.pixelHeight));if(event.type!=='changing')this.saveSettings();this.drawPreview();},
  setLogoCorner:function(event){var corner=event.currentTarget.dataset.corner;if(['top-left','top-right','bottom-left','bottom-right'].indexOf(corner)<0)return;this.setData({logoCorner:corner});if(this.currentStyle){this._styleRemember();this.currentStyle.logo.x=null;this.currentStyle.logo.y=null;this._styleRefresh(true);}this.saveSettings();this.drawPreview();},
  logoNameInput:function(event){var page=this;this.setData({logoName:event.detail.value});clearTimeout(this.settingsTimer);this.settingsTimer=setTimeout(function(){page.settingsTimer=null;page.saveSettings();},400);this.drawPreview();},
  styleInput:function(event){var key=event.currentTarget.dataset.key,value=Number(event.detail.value),update={};if(['logoScale','textScale'].indexOf(key)<0||!Number.isFinite(value))return;update[key]=Math.max(key==='logoScale'?25:50,Math.min(key==='logoScale'?250:200,value));this.setData(update);if(key==='logoScale'&&this.currentStyle){if(!this.logoScaleActive)this._styleRemember();this.logoScaleActive=event.type==='changing';this.currentStyle.logo.scale=update[key]/100;this._styleRefresh(true);}if(key==='textScale'){this.fullBounds=bounds.project(this.project,{textScale:update[key]/100});if(this.selectionMode==='full'){this.selection=Object.assign({},this.fullBounds);if(this.data.ratioIndex===0)this.setLongEdge(Math.max(this.data.pixelWidth,this.data.pixelHeight));}}if(event.type!=='changing')this.saveSettings();this.drawPreview();},
  brandOptions:function(){var logo=this.currentStyle&&this.currentStyle.logo||{};return {corner:this.data.logoCorner,logoScale:this.data.logoScale/100,textScale:this.data.textScale/100,name:this.data.logoName||'',x:logo.x,y:logo.y};},
  setLongEdge: function(edge) {
    var ratio = this.ratio(), width = ratio >= 1 ? edge : Math.max(1, Math.round(edge * ratio)), height = ratio >= 1 ? Math.max(1, Math.round(edge / ratio)) : edge;
    this.setData({ pixelWidth: width, pixelHeight: height }); this.syncPrintFromPixels();
  },
  syncPrintFromPixels: function() {
    var width = Number(this.data.printWidth), factor = this.data.unitFactors[this.data.printUnitIndex];
    if (!(width > 0) || !(factor > 0)) return;
    var dpi = this.data.pixelWidth * 0.0254 / (width * factor);
    this.setData({ printHeight: Number((width / this.ratio()).toFixed(4)), dpi: Number(dpi.toFixed(2)) });
  },
  selectPreset: function(event) { var index = Number(event.detail.value); this.setData({ presetIndex: index }); this.setLongEdge(this.data.presetValues[index]); this.saveSettings(); this.drawPreview(); },
  selectRatio: function(event) { this.setData({ ratioIndex: Number(event.detail.value),paperIndex:0 }); this.setLongEdge(Math.max(this.data.pixelWidth, this.data.pixelHeight)); this.saveSettings(); this.drawPreview(); },
  paperPreset:function(event){
    var index=Number(event.detail.value),sizes=[null,{w:2.4,h:0.9,r:4},{w:2.4,h:1.2,r:5},{w:0.9,h:2.4,r:6},{w:1.2,h:2.4,r:7}];
    if(!Number.isInteger(index)||index<0||index>=this.data.paperPresets.length)return;this.setData({paperIndex:index});
    if(index===5){this.setData({ratioIndex:1});this.setLongEdge(Math.max(this.data.pixelWidth,this.data.pixelHeight));}
    else if(sizes[index]){var s=sizes[index],pixels=planner.printPixels(s.w,s.h,Number(this.data.dpi)||150);this.setData({ratioIndex:s.r,printUnitIndex:0,printWidth:s.w,printHeight:s.h,pixelWidth:pixels.width,pixelHeight:pixels.height});}
    this.saveSettings();this.drawPreview();
  },
  pixelInput: function(event) {
    var value = Number(event.detail.value), key = event.currentTarget.dataset.key, ratio = this.ratio();
    if (!Number.isSafeInteger(value) || value < 1) return;
    if (key === 'pixelWidth') this.setData({ pixelWidth: value, pixelHeight: Math.max(1, Math.round(value / ratio)) });
    else if (key === 'pixelHeight') this.setData({ pixelHeight: value, pixelWidth: Math.max(1, Math.round(value * ratio)) });
    this.syncPrintFromPixels(); this.saveSettings(); this.drawPreview();
  },
  positionInput: function(event) { this.setData({ position: Number(event.detail.value) }); if (event.type !== 'changing') this.saveSettings(); this.drawPreview(); },
  eventInput:function(event){var key=event.currentTarget.dataset.key,update={},page=this;if(['eventTitle','eventDate','eventPlace'].indexOf(key)<0)return;update[key]=event.detail.value;this.setData(update);clearTimeout(this.settingsTimer);this.settingsTimer=setTimeout(function(){page.settingsTimer=null;page.saveSettings();},400);this.drawPreview();},
  dateChanged:function(event){var value=event.detail.value,parts=String(value).split('-').map(Number);if(parts.length!==3||parts.some(function(n){return !Number.isFinite(n);}))return;var weekday=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][new Date(parts[0],parts[1]-1,parts[2]).getDay()];this.setData({eventDateRaw:value,eventDate:value+' '+weekday});this.saveSettings();this.drawPreview();},
  timeChanged:function(event){this.setData({eventTime:event.detail.value});this.saveSettings();this.drawPreview();},
  clearDate:function(){this.setData({eventDateRaw:'',eventDate:''});this.saveSettings();this.drawPreview();},
  clearTime:function(){this.setData({eventTime:''});this.saveSettings();this.drawPreview();},
  eventInfo:function(){return [this.data.eventTitle||'',[(this.data.eventDate||''),(this.data.eventTime||'')].filter(Boolean).join(' '),this.data.eventPlace||''];},
  printInput: function(event) {
    var key = event.currentTarget.dataset.key, value = Number(event.detail.value), ratio = this.ratio();
    if (['printWidth','printHeight','dpi'].indexOf(key) < 0 || !Number.isFinite(value) || value <= 0) return;
    var width = Number(this.data.printWidth), height = Number(this.data.printHeight), dpi = Number(this.data.dpi);
    if (key === 'printWidth') { width = value; height = width / ratio; }
    if (key === 'printHeight') { height = value; width = height * ratio; }
    if (key === 'dpi') dpi = value;
    if (!(width > 0) || !(height > 0) || !(dpi > 0)) return;
    var factor = this.data.unitFactors[this.data.printUnitIndex], pixels;
    try { pixels = planner.printPixels(width * factor, height * factor, dpi); } catch (error) { return message(error.message); }
    var update={printWidth: Number(width.toFixed(4)), printHeight: Number(height.toFixed(4)), dpi: dpi, pixelWidth: pixels.width, pixelHeight: pixels.height};if(key!=='dpi')update.paperIndex=0;this.setData(update); this.saveSettings(); this.drawPreview();
  },
  printUnit: function(event) {
    var index = Number(event.detail.value), oldFactor = this.data.unitFactors[this.data.printUnitIndex], nextFactor = this.data.unitFactors[index];
    if (!nextFactor) return;
    this.setData({ printUnitIndex: index, printWidth: this.data.printWidth ? Number((this.data.printWidth * oldFactor / nextFactor).toFixed(4)) : '', printHeight: this.data.printHeight ? Number((this.data.printHeight * oldFactor / nextFactor).toFixed(4)) : '' }); this.saveSettings();
  },
  chooseBackground: function() { this.selectAsset('background'); },
  chooseLogo: function() { this.selectAsset('logo'); },
  removeAsset:function(event){
    var page=this,kind=event.currentTarget.dataset.kind;if(['background','logo'].indexOf(kind)<0||!this.project.assets[kind])return;
    wx.showModal({title:'移除图片',content:'确定从该座位图中移除这张图片吗？',success:function(result){if(!result.confirm)return;var old=page.project.assets[kind],helper=assets.create({},wx.env.USER_DATA_PATH+'/seating-projects'),failed=false;delete page.project.assets[kind];try{page.getStore().save(page.project);}catch(error){page.project.assets[kind]=old;return message('无法保存修改，原图片仍保留。');}if(Object.keys(page.project.assets).every(function(key){return page.project.assets[key]!==old;}))try{wx.getFileSystemManager().unlinkSync(helper.path(old));}catch(error){if(!/ENOENT|not exist|no such file/i.test(error.errMsg||error.message||''))failed=true;}page.setData({status:failed?'图片已从项目移除，但本机文件清理失败。':'图片已移除。',projectHasLogo:!!page.project.assets.logo});if(failed)message('图片已从项目移除，但本机文件清理失败，请检查存储权限。');page.loadPreviewAssets();}});
  },
  selectAsset: function(kind) {
    var page = this;
    function chosen(path) {
      wx.getImageInfo({ src: path, success: function(info) {
        var type = String(info.type || '').toLowerCase(); if (type === 'jpeg') type = 'jpg';
        if (['jpg','png','webp'].indexOf(type) < 0) return message('请选择 JPG、PNG 或 WebP 图片。');
        var fs = wx.getFileSystemManager(), root = wx.env.USER_DATA_PATH + '/seating-projects', helper = assets.create({copy:function(from,to){fs.copyFileSync(from,to);}}, root), previous = page.project.assets[kind], ref;
        try {
          page.getStore(); ref = helper.save(path, page.project.id, kind, type); page.project.assets[kind] = ref; page.getStore().save(page.project);
        } catch (error) {
          if (previous) page.project.assets[kind] = previous; else delete page.project.assets[kind];
          if (ref) try { fs.unlinkSync(helper.path(ref)); } catch (ignore) {}
          return message('无法保存图片，请检查设备存储。');
        }
        var cleanupFailed=false;if (previous && Object.keys(page.project.assets).every(function(key) { return page.project.assets[key] !== previous; })) try { fs.unlinkSync(helper.path(previous)); } catch (error) { if(!/ENOENT|not exist|no such file/i.test(error.errMsg||error.message||''))cleanupFailed=true; }
        page.setData({ status: cleanupFailed?'新图片已保存，但旧图片清理失败。':kind === 'background' ? '背景图片已保存在本机。' : 'Logo 已保存在本机。',projectHasLogo:!!page.project.assets.logo });if(cleanupFailed)message('新图片已保存，但旧图片清理失败，请检查存储权限。');page.loadPreviewAssets();
      }, fail: function() { message('图片无法读取，请选择其他图片。'); } });
    }
    function failed(error) { if (!/cancel/i.test((error && error.errMsg) || '')) message('无法打开相册，请检查权限。'); }
    if (typeof wx.chooseMedia === 'function') wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album'],success:function(result){if(result.tempFiles && result.tempFiles[0])chosen(result.tempFiles[0].tempFilePath);},fail:failed});
    else if (typeof wx.chooseImage === 'function') wx.chooseImage({count:1,sourceType:['album'],success:function(result){if(result.tempFilePaths && result.tempFilePaths[0])chosen(result.tempFilePaths[0]);},fail:failed});
    else message('当前环境不支持选择相册图片。');
  },
  loadImage: function(canvas, ref) {
    if (!ref) return Promise.resolve(null);
    var path = assets.create({}, wx.env.USER_DATA_PATH + '/seating-projects').path(ref);
    return new Promise(function(resolve,reject) {
      if (!canvas || typeof canvas.createImage !== 'function') return reject(new Error('当前环境无法加载图片'));
      var image = canvas.createImage(), done = false, timer = setTimeout(function(){finish(new Error('图片加载超时'));},15000);
      function finish(error) { if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(image); }
      image.onload = function(){finish();};image.onerror = function(){finish(new Error('图片无法加载'));};image.src = path;
    });
  },
  loadStyleImage:function(canvas,style,accent){
    var paths={floral:'/assets/seating/floral.png',oriental:'/assets/seating/ink.png'},path=style&&(accent?(style.presetId==='oriental'?'/assets/seating/bamboo.png':null):paths[style.presetId]);
    if(!path)return Promise.resolve(null);
    return new Promise(function(resolve,reject){
      if(!canvas||typeof canvas.createImage!=='function')return reject(new Error('当前环境无法加载排版素材'));
      var image=canvas.createImage(),done=false,timer=setTimeout(function(){finish(new Error('排版素材加载超时'));},15000);
      function finish(error){if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(image);}
      image.onload=function(){finish();};image.onerror=function(){finish(new Error('排版素材无法加载'));};image.src=path;
    });
  },
  loadPreviewAssets: function() {
    if (!this.previewCanvas || !this.project) return;
    var page = this, ticket = (this.assetTicket || 0) + 1; this.assetTicket = ticket;
    this.previewBackground=null;this.previewLogo=null;this.previewStyleImage=null;this.previewStyleAccent=null;
    try { Promise.all([this.loadImage(this.previewCanvas, this.project.assets.background), this.loadImage(this.previewCanvas, this.project.assets.logo),this.loadStyleImage(this.previewCanvas,this.currentStyle),this.loadStyleImage(this.previewCanvas,this.currentStyle,true)]).then(function(images) { if (page.assetTicket !== ticket) return; page.previewBackground = images[0]; page.previewLogo = images[1];page.previewStyleImage=images[2];page.previewStyleAccent=images[3]; page.drawPreview(); }).catch(function(error) { if (page.assetTicket === ticket) { page.setData({status:error.message}); message(error.message); } }); }
    catch(error) { this.setData({status:'图片引用无效，请重新选择。'});message('图片引用无效，请重新选择。'); }
  },
  startCrop: function() { this.cropDraft = null; this.setData({ cropping: true, status: '在图上拖动框选范围。' }); this.drawPreview(); },
  resetCrop: function() { this.selection = Object.assign({}, this.fullBounds); this.selectionMode='full';this.cropDraft = null; this.setData({cropping:false,status:''}); this.setLongEdge(Math.max(this.data.pixelWidth, this.data.pixelHeight)); this.saveSettings(); this.drawPreview(); },
  cropPoint: function(touch) {
    var x = (touch.clientX - this.previewRect.left) * this.previewCanvas.width / this.previewRect.width;
    var y = (touch.clientY - this.previewRect.top) * this.previewCanvas.height / this.previewRect.height;
    var b = this.fullBounds, view = this.cropView;
    return { x: Math.max(b.x, Math.min(b.x + b.width, b.x + (x - view.x) / view.scale)), y: Math.max(b.y, Math.min(b.y + b.height, b.y + (y - view.y) / view.scale)) };
  },
  cropStart: function(event) {
    if(!event.touches.length||!this.previewCanvas||!this.previewRect)return;
    if(this.data.cropping){if(!this.cropView)return;this.cropDraft={start:this.cropPoint(event.touches[0]),end:this.cropPoint(event.touches[0])};return;}
    if(this.data.styleExpanded&&this.currentStyle&&this.stylePreviewLayout&&this.stylePreviewDisplay){
      var d=this.stylePreviewDisplay,r=this.previewRect,canvas=this.previewCanvas,outputRect={x:r.left+d.x*r.width/canvas.width,y:r.top+d.y*r.height/canvas.height,width:d.width*r.width/canvas.width,height:d.height*r.height/canvas.height},touch=event.touches[0],point=styleInteraction.toLocalPoint({x:touch.clientX,y:touch.clientY},outputRect),layout=this.stylePreviewLayout,items=[];
      items.push({id:'map',rect:layout.map,z:1});if(layout.title&&layout.title.height>0)items.push({id:'title',rect:layout.title,z:3});if(layout.logo)items.push({id:'logo',rect:layout.logo,z:4});
      var short=Math.min(d.width,d.height);this.currentStyle.decorations.forEach(function(item){if(!item.visible)return;var width=short*item.scale/d.width,height=short*item.scale/d.height;items.push({id:item.id,rect:{x:item.x-width/2,y:item.y-height/2,width:width,height:height},z:item.id===this.data.selectedDecorationId?6:item.layer==='front'?5:0});},this);
      var item=styleInteraction.hitTest(items,point);if(item){this.styleDrag={drag:styleInteraction.beginDrag(item,point),outputRect:outputRect,base:JSON.parse(JSON.stringify(this.currentStyle)),item:item,recorded:false};this.setData({selectedDecorationId:item.id==='map'||item.id==='title'||item.id==='logo'?'':item.id});return;}
    }
    var display=planner.fit(this.data.pixelWidth,this.data.pixelHeight,this.previewCanvas.width,this.previewCanvas.height,0.5),area=planner.fit(this.selection.width,this.selection.height,display.width,display.height,this.data.position/100),t=event.touches[0],px=(t.clientX-this.previewRect.left)*this.previewCanvas.width/this.previewRect.width,py=(t.clientY-this.previewRect.top)*this.previewCanvas.height/this.previewRect.height;
    if(px<display.x+area.x||px>display.x+area.x+area.width||py<display.y+area.y||py>display.y+area.y+area.height)return;
    var gapX=display.width-area.width,gapY=display.height-area.height;if(gapX<0.01&&gapY<0.01)return;
    this.positionDrag={x:t.clientX,y:t.clientY,position:this.data.position,gapX:gapX,gapY:gapY};
  },
  cropMove: function(event) {
    if(!event.touches.length)return;
    if(this.styleDrag){var finger=event.touches[0],sd=this.styleDrag,p=styleInteraction.toLocalPoint({x:finger.clientX,y:finger.clientY},sd.outputRect),moved=styleInteraction.moveDrag(sd.drag,p,sd.outputRect);if(!moved)return;var dx=moved.rect.x-sd.item.rect.x,dy=moved.rect.y-sd.item.rect.y;if(!sd.recorded&&Math.hypot(dx,dy)>0.001){this._styleRemember();sd.recorded=true;}if(!sd.recorded)return;var style=JSON.parse(JSON.stringify(sd.base));if(sd.item.id==='map'){style.map.x=Math.max(0,Math.min(1-style.map.width,sd.base.map.x+dx));style.map.y=Math.max(0,Math.min(1-style.map.height,sd.base.map.y+dy));}else if(sd.item.id==='title'){style.title.x=sd.base.title.x+dx;style.title.y=sd.base.title.y+dy;}else if(sd.item.id==='logo'){style.logo.x=moved.rect.x;style.logo.y=moved.rect.y;}else{var decor=style.decorations.find(function(v){return v.id===sd.item.id;});if(decor){decor.x+=dx;decor.y+=dy;}}this.currentStyle=styleModel.normalize(style);this._styleRefresh(true);this.drawPreview();return;}
    if(this.positionDrag){var t=event.touches[0],d=this.positionDrag,delta=d.gapX>d.gapY?(t.clientX-d.x)*this.previewCanvas.width/this.previewRect.width/d.gapX:(t.clientY-d.y)*this.previewCanvas.height/this.previewRect.height/d.gapY;this.setData({position:Math.max(0,Math.min(100,Math.round(d.position+delta*100)))});this.drawPreview();return;}
    if(!this.cropDraft)return;this.cropDraft.end=this.cropPoint(event.touches[0]);this.drawPreview();
  },
  cropEnd: function() {
    if(this.styleDrag){var changed=this.styleDrag.recorded;this.styleDrag=null;if(changed)this.saveSettings();return;}
    if(this.positionDrag){this.positionDrag=null;this.saveSettings();return;}
    if (!this.cropDraft) return;
    var selected = bounds.rectangle(this.cropDraft.start, this.cropDraft.end); this.cropDraft = null;
    if (selected.width < 1 || selected.height < 1) { this.drawPreview(); return; }
    this.selection = selected;this.selectionMode='custom'; this.setData({cropping:false,status:'已选择导出范围。'}); this.setLongEdge(Math.max(this.data.pixelWidth, this.data.pixelHeight)); this.saveSettings(); this.drawPreview();
  },
  cropCancel: function() { if(this.styleDrag){if(this.styleDrag.recorded){this.currentStyle=this.styleDrag.base;if(this.styleHistory)this.styleHistory.pop();this._styleRefresh(true);}this.styleDrag=null;}this.cropDraft = null;if(this.positionDrag){this.setData({position:this.positionDrag.position});this.positionDrag=null;}this.drawPreview(); },
  saveSettings: function() {
    if (!this.project) return;
    this.project.exportSettings = Object.assign({}, this.project.exportSettings, { posterStyle:this.currentStyle||null,presetIndex: this.data.presetIndex,paperIndex:this.data.paperIndex, ratioIndex: this.data.ratioIndex,customRatio:this.data.customRatio,logoCorner:this.data.logoCorner,logoScale:this.data.logoScale,textScale:this.data.textScale,logoName:this.data.logoName||'', position: this.data.position, selection: Object.assign({}, this.selection), selectionMode:this.selectionMode||'full', pixelWidth: this.data.pixelWidth, pixelHeight: this.data.pixelHeight, printUnitIndex: this.data.printUnitIndex, printWidth: this.data.printWidth, printHeight: this.data.printHeight, dpi: this.data.dpi,eventTitle:this.data.eventTitle||'',eventDate:this.data.eventDate||'',eventDateRaw:this.data.eventDateRaw||'',eventTime:this.data.eventTime||'',eventPlace:this.data.eventPlace||'' });
    try { this.getStore().save(this.project); return true; } catch (error) { this.setData({ status: '导出设置保存失败，请检查存储空间。' }); return false; }
  },
  drawPreview: function() {
    if (!this.previewCanvas || !this.project || !this.selection) return;
    var canvas = this.previewCanvas, ctx = canvas.getContext('2d');
    var source = this.data.cropping ? this.fullBounds : this.selection;
    var display = this.data.cropping ? planner.fit(source.width, source.height, canvas.width, canvas.height, 0.5) : planner.fit(this.data.pixelWidth, this.data.pixelHeight, canvas.width, canvas.height, 0.5);
    if (this.data.cropping) this.cropView = { x: display.x, y: display.y, scale: display.width / source.width };
    var preview=renderer.draw(ctx, this.project, {x:-display.x,y:-display.y,width:canvas.width,height:canvas.height}, {width:display.width,height:display.height,bounds:source,position:this.data.cropping?0.5:this.data.position/100,backgroundImage:this.previewBackground,logoImage:this.previewLogo,styleImage:this.previewStyleImage,styleAccent:this.previewStyleAccent,hasLogo:!!this.project.assets.logo,eventInfo:this.data.cropping?[]:this.eventInfo(),brand:this.brandOptions(),textScale:this.data.textScale/100,style:this.data.cropping?null:this.currentStyle});
    this.stylePreviewLayout=preview.styleLayout||null;this.stylePreviewDisplay=display;this.previewValidation=preview;
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(24,39,30,.24)';ctx.fillRect(0,0,canvas.width,Math.max(0,display.y));ctx.fillRect(0,display.y+display.height,canvas.width,Math.max(0,canvas.height-display.y-display.height));ctx.fillRect(0,display.y,Math.max(0,display.x),display.height);ctx.fillRect(display.x+display.width,display.y,Math.max(0,canvas.width-display.x-display.width),display.height);ctx.strokeStyle='#e69a26';ctx.lineWidth=Math.max(2,canvas.width/200);ctx.strokeRect(display.x,display.y,display.width,display.height);ctx.restore();
    var warning=preview.logoOverflow?'Logo 或名称超出图片，请缩小或精简名称。':preview.infoOverflow?'文字留白不足，请调整图片比例、位置或精简文字。':preview.logoOverlap?'Logo 可能遮挡场地图，可调整位置、大小或图片比例。':'';if(this.data.infoWarning!==warning)this.setData({infoWarning:warning});
    var qualityWarning=styleRender.imageUpscaled(this.currentStyle,this.previewStyleImage,this.data.pixelWidth,this.data.pixelHeight)?'当前导出尺寸会放大装饰图片，花卉或水墨细节可能变软；文字和桌椅仍按导出尺寸绘制。':'';if(this.data.qualityWarning!==qualityWarning)this.setData({qualityWarning:qualityWarning});
    if (this.data.cropping && this.cropDraft) { var rect = bounds.rectangle(this.cropDraft.start, this.cropDraft.end), view = this.cropView; ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.strokeStyle = '#f2a63b'; ctx.lineWidth = 3; ctx.strokeRect(view.x+(rect.x-source.x)*view.scale,view.y+(rect.y-source.y)*view.scale,rect.width*view.scale,rect.height*view.scale); ctx.restore(); }
  },
  saveImage: function() {
    if (this.data.busy || !this.project || !this.exportCanvas) return;
    var width = this.data.pixelWidth, height = this.data.pixelHeight, page = this, parts;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return message('请输入有效的图片像素。');
    var area=planner.fit(this.selection.width,this.selection.height,width,height,this.data.position/100);
    var hasLogo=!!this.project.assets.logo,brand=hasLogo?infoLayout.placeBrand(width,height,this.previewLogo&&this.previewLogo.width||1,this.previewLogo&&this.previewLogo.height||1,this.brandOptions()):null,logoRect=brand&&brand.group;
    if(hasLogo&&!brand)return message('Logo 或名称超出图片，请缩小或精简名称。');
    if(this.currentStyle){if(this.previewValidation&&this.previewValidation.infoOverflow)return message('标题超出图片，请调整标题位置或大小。');}
    else if(infoLayout.layout(width,height,area,this.eventInfo(),logoRect,this.data.textScale/100).overflow)return message('文字留白不足，请调整图片比例、位置或精简文字。');
    if(this.saveSettings()===false)return message('导出设置保存失败，请检查设备存储。');
    try { parts = planner.tiles(width, height, 8192, 16000000); } catch (error) { return message(error.message); }
    if (parts.length > 1) return wx.showModal({title:'图片较大',content:'图片为 '+width+' × '+height+' 像素，将自动无缝分块保存，预计 '+parts.length+' 张。打印时请保持相同缩放比例。',confirmText:'继续保存',success:function(result){if(result.confirm)page.performSave();}});
    this.performSave();
  },
  performSave: async function() {
    if (this.data.busy || !this.project || !this.exportCanvas) return;
    var width = this.data.pixelWidth, height = this.data.pixelHeight, page = this;
    var snapshot=JSON.parse(JSON.stringify(this.project)),selection=Object.assign({},this.selection),position=this.data.position/100,info=this.eventInfo(),brandOptions=this.brandOptions(),textScale=this.data.textScale/100,styleSnapshot=this.currentStyle?JSON.parse(JSON.stringify(this.currentStyle)):null,printWidth=Number(this.data.printWidth),printHeight=Number(this.data.printHeight),printUnit=this.data.printUnits[this.data.printUnitIndex];
    this.tileImages=[];this.setData({ busy: true, status: '正在生成图片…',tileInfo:[],tileTotal:0 });
    try {
      var images = await Promise.all([this.loadImage(this.exportCanvas, snapshot.assets.background), this.loadImage(this.exportCanvas, snapshot.assets.logo),this.loadStyleImage(this.exportCanvas,styleSnapshot),this.loadStyleImage(this.exportCanvas,styleSnapshot,true)]);
      var area=planner.fit(selection.width,selection.height,width,height,position),brand=images[1]?infoLayout.placeBrand(width,height,images[1].width,images[1].height,brandOptions):null,logoRect=brand&&brand.group;
      if(images[1]&&!brand)throw new Error('Logo 或名称超出图片，请缩小或精简名称。');
      if(!styleSnapshot&&infoLayout.layout(width,height,area,info,logoRect,textScale).overflow)throw new Error('文字留白不足，请调整图片比例、位置或精简文字。');
      if(styleSnapshot){this.exportCanvas.width=1;this.exportCanvas.height=1;var check=renderer.draw(this.exportCanvas.getContext('2d'),snapshot,{x:0,y:0,width:1,height:1},{width:width,height:height,bounds:selection,position:position,backgroundImage:images[0],logoImage:images[1],styleImage:images[2],styleAccent:images[3],eventInfo:info,brand:brandOptions,textScale:textScale,style:styleSnapshot});if(check.infoOverflow)throw new Error('标题超出图片，请缩小文字或精简内容。');}
      var result = await output.save(wx, this.exportCanvas, {width:width,height:height,maxSide:8192,maxPixels:16000000}, function(tile, canvas) { renderer.draw(canvas.getContext('2d'), snapshot, tile, {width:width,height:height,bounds:selection,position:position,backgroundImage:images[0],logoImage:images[1],styleImage:images[2],styleAccent:images[3],eventInfo:info,brand:brandOptions,textScale:textScale,style:styleSnapshot}); }, this, function(done, total, part, parts, path) { page.tileImages[done-1]=path;var list=planner.describeTiles(parts,width,height,printWidth,printHeight,printUnit).slice(0,done).map(function(item,index){item.image=page.tileImages[index];return item;});page.setData({status:'已保存 '+done+' / '+total+' 张',tileInfo:list,tileTotal:total}); });
      this.setData({ status: '已保存 ' + result.saved + ' 张图片到相册。' });
    } catch (error) { this.setData({ status: error.message }); message(error.message); }
    finally { this.setData({ busy: false }); }
  }
}));
