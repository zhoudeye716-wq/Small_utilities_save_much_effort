'use strict';
var model=require('./style-model');
var presetStore=require('./style-presets');
var assets=require('./assets');
var ids=require('./model');
function clone(value){return JSON.parse(JSON.stringify(value));}
function viewOf(style){
  var view=clone(style),labels={};model.decorationList().forEach(function(d){labels[d.kind]=d.label;});
  view.frame.width=Math.round(view.frame.width*1000);view.frame.inset=Math.round(view.frame.inset*100);
  ['x','y','scale'].forEach(function(k){view.title[k]=Math.round(view.title[k]*100);});
  ['x','y','width','height'].forEach(function(k){view.map[k]=Math.round(view.map[k]*100);});
  view.logo.x=Math.round((view.logo.x===null?0.02:view.logo.x)*100);view.logo.y=Math.round((view.logo.y===null?0.02:view.logo.y)*100);
  view.decorations.forEach(function(d){d.label=labels[d.kind]||d.kind;['x','y','scale','opacity'].forEach(function(k){d[k]=Math.round(d[k]*100);});});return view;
}
function validColor(value){return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value);}
function message(content){wx.showModal({title:'操作未完成',content:content,showCancel:false});}
function current(page){return page.currentStyle?clone(page.currentStyle):model.preset('original');}
function snapshot(page){return {style:page.currentStyle?clone(page.currentStyle):null,logoScale:page.data.logoScale};}
function remember(page){if(!page.styleHistory)page.styleHistory=[];page.styleHistory.push(snapshot(page));if(page.styleHistory.length>30)page.styleHistory.shift();}
function refresh(page,dirty){var style=current(page);page.setData({styleView:viewOf(style),styleDirty:!!dirty});}
function commit(page,style,rememberBefore,skipSave){if(rememberBefore)remember(page);page.currentStyle=model.normalize(style);refresh(page,true);if(!skipSave)page.saveSettings();page.drawPreview();}
function find(style,path){var parts=String(path||'').split('.'),target=style;if(parts[0]==='decorations'){target=style.decorations.find(function(item){return item.id===parts[1];});parts=parts.slice(2);}if(!target||!parts.length)return null;while(parts.length>1){target=target[parts.shift()];if(!target||typeof target!=='object')return null;}return {target:target,key:parts[0]};}
function paths(page){var root=wx.env.USER_DATA_PATH+'/seating-projects';return assets.create({copy:function(a,b){wx.getFileSystemManager().copyFileSync(a,b);}},root);}
module.exports={
  styleSetup:function(settings){this.styleHistory=[];this.currentStyle=settings&&settings.posterStyle?model.normalize(settings.posterStyle):null;this.setData({styleExpanded:false,styleDirty:false,activeStyle:this.currentStyle&&this.currentStyle.presetId||'',styleView:viewOf(current(this)),decorationOptions:model.decorationList(),selectedDecorationId:''});this.refreshStylePresets();},
  refreshStylePresets:function(){var list=model.presetList().filter(function(item){return item.id!=='original';}).map(function(item){return {id:item.id,label:item.label,custom:false};});this.setData({stylePresets:list});},
  toggleStylePanel:function(){this.setData({styleExpanded:!this.data.styleExpanded});},
  applyStylePreset:function(event){
    var page=this,id=event.currentTarget.dataset.id,custom=event.currentTarget.dataset.custom===true||event.currentTarget.dataset.custom==='true';
    function apply(){var record,store,old=clone(page.project.assets||{}),oldSettings=clone(page.project.exportSettings||{}),previous=snapshot(page),wasDirty=page.data.styleDirty,created=[];try{if(custom){store=presetStore.create(wx);record=store.load(id);}var style=custom?model.normalize(record.style):(id==='original'?null:model.preset(id));
      if(record&&record.assets){var helper=paths(page);Object.keys(record.assets).forEach(function(kind){var source=store.path(record.assets[kind]),ext=source.split('.').pop(),ref=helper.save(source,page.project.id,kind,ext);created.push(ref);page.project.assets[kind]=ref;});}
      if(!page.styleHistory)page.styleHistory=[];page.styleHistory.push(previous);page.currentStyle=style;page.setData({logoScale:style?Math.round(style.logo.scale*100):page.data.logoScale,projectHasLogo:!!page.project.assets.logo});refresh(page,false);
      if(page.saveSettings()===false)throw new Error('保存失败');page.setData({activeStyle:style&&style.presetId||''});page.drawPreview();if(page.previewCanvas)page.loadPreviewAssets();
    }catch(error){page.project.assets=old;page.project.exportSettings=oldSettings;page.currentStyle=previous.style;page.setData({logoScale:previous.logoScale,projectHasLogo:!!old.logo});if(page.styleHistory&&page.styleHistory[page.styleHistory.length-1]===previous)page.styleHistory.pop();refresh(page,wasDirty);created.forEach(function(ref){try{wx.getFileSystemManager().unlinkSync(paths(page).path(ref));}catch(ignore){}});message(error.message||'无法应用预设');}}
    var includesImages=false;if(custom)try{includesImages=Object.keys(presetStore.create(wx).load(id).assets||{}).length>0;}catch(error){return message(error.message||'无法读取预设');}
    if(this.data.styleDirty||includesImages)wx.showModal({title:'切换排版预设',content:includesImages?'切换后将应用排版并替换预设包含的图片，确定继续吗？':'切换后将替换当前排版调整，确定继续吗？',success:function(result){if(result.confirm)apply();}});else apply();
  },
  undoStyle:function(){if(!this.styleHistory||!this.styleHistory.length)return;var old=this.styleHistory.pop();this.currentStyle=old.style;this.setData({logoScale:old.logoScale});refresh(this,true);this.saveSettings();this.drawPreview();},
  styleFieldInput:function(event){var path=event.currentTarget.dataset.path,value=event.currentTarget.dataset.value;if(value===undefined)value=event.detail.value;var style=current(this),field=find(style,path);if(!field)return;if((/color$|^background$/.test(path)||/^scene\.(table|tableStroke|seat|seatStroke|text)$/.test(path))&&!validColor(value))return;if(path==='frame.kind'&&['none','single','double','deco'].indexOf(value)<0)return;if(path==='title.align'&&['left','center','right'].indexOf(value)<0)return;if(/\.layer$/.test(path)&&['behind','front'].indexOf(value)<0)return;field.target[field.key]=value;commit(this,style,true);},
  styleSlider:function(event){var path=event.currentTarget.dataset.path,value=Number(event.detail.value);if(!Number.isFinite(value))return;var style=current(this),field=find(style,path);if(!field)return;if(path==='frame.width')value/=1000;else if(!/\.rotation$/.test(path))value/=100;field.target[field.key]=value;var first=this.activeStyleSlider!==path;if(first)this.activeStyleSlider=path;commit(this,style,first,event.type==='changing');if(event.type!=='changing')this.activeStyleSlider='';},
  selectDecoration:function(event){this.setData({selectedDecorationId:event.currentTarget.dataset.id});},
  addDecoration:function(event){var kind=event.currentTarget.dataset.kind;if(!model.decorationList().some(function(item){return item.kind===kind;}))return;var style=current(this),id=ids.id('decoration');style.decorations.push({id:id,kind:kind,x:0.5,y:0.5,scale:0.15,rotation:0,opacity:1,color:'#b69a60',visible:true,layer:'front'});this.setData({selectedDecorationId:id});commit(this,style,true);},
  removeDecoration:function(){var style=current(this),id=this.data.selectedDecorationId;style.decorations=style.decorations.filter(function(item){return item.id!==id;});this.setData({selectedDecorationId:''});commit(this,style,true);},
  moveDecoration:function(event){var style=current(this),id=this.data.selectedDecorationId,index=style.decorations.findIndex(function(item){return item.id===id;}),next=index+(event.currentTarget.dataset.direction==='forward'?1:-1);if(index<0||next<0||next>=style.decorations.length)return;var item=style.decorations[index];style.decorations[index]=style.decorations[next];style.decorations[next]=item;commit(this,style,true);},
  toggleDecoration:function(){var style=current(this),item=style.decorations.find(function(d){return d.id===this.data.selectedDecorationId;},this);if(!item)return;item.visible=!item.visible;commit(this,style,true);},
  saveStyleOpen:function(){this.setData({presetDialog:true,presetName:'',renameStyleId:'',includeLogo:false,includeBackground:false});},
  closeStyleSave:function(){this.setData({presetDialog:false});},
  saveStyleNameInput:function(event){this.setData({presetName:event.detail.value});},
  toggleIncludeLogo:function(){this.setData({includeLogo:!this.data.includeLogo});},
  toggleIncludeBackground:function(){this.setData({includeBackground:!this.data.includeBackground});},
  saveCustomStyle:function(){try{var name=String(this.data.presetName||'').trim();if(!name)throw new Error('请输入预设名称');var helper=paths(this),store=presetStore.create(wx),old=this.data.renameStyleId?store.load(this.data.renameStyleId):null,input={name:name,style:old?old.style:current(this)};if(old)input.id=old.id;if(this.data.includeLogo){if(old&&old.assets.logo)input.logoPath=store.path(old.assets.logo);else{if(!this.project.assets.logo)throw new Error('请先选择 Logo 图片');input.logoPath=helper.path(this.project.assets.logo);}}if(this.data.includeBackground){if(old&&old.assets.background)input.backgroundPath=store.path(old.assets.background);else{if(!this.project.assets.background)throw new Error('请先选择背景图片');input.backgroundPath=helper.path(this.project.assets.background);}}store.save(input);this.setData({presetDialog:false,styleDirty:old?this.data.styleDirty:false});this.refreshStylePresets();}catch(error){message(error.message||'保存预设失败');}},
  renameStylePreset:function(event){try{var record=presetStore.create(wx).load(event.currentTarget.dataset.id);this.setData({presetDialog:true,renameStyleId:record.id,presetName:record.name,includeLogo:!!record.assets.logo,includeBackground:!!record.assets.background});}catch(error){message(error.message||'无法读取预设');}},
  deleteStylePreset:function(event){var page=this,id=event.currentTarget.dataset.id;wx.showModal({title:'删除排版预设',content:'确定删除这个预设吗？不会删除座位图。',success:function(result){if(!result.confirm)return;try{presetStore.create(wx).remove(id);page.refreshStylePresets();}catch(error){message(error.message||'删除预设失败');}}});},
  _styleRemember:function(){remember(this);},_styleCommit:function(style){commit(this,style,false);},_styleRefresh:function(dirty){refresh(this,dirty);}
};
