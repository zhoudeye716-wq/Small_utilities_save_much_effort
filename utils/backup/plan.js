'use strict';
var merge=require('./merge');
var registry=require('./registry');
var allowed=require('./collect').KEYS;
function copy(v){return JSON.parse(JSON.stringify(v));}
function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
var keys=Object.create(null);
Object.keys(allowed).forEach(function(group){allowed[group].forEach(function(key){keys[key]=true;});});
function addGroup(p,name,local,incoming){
  var part=merge.preview(local,incoming);p.groups[name]=part;
  part.conflicts.forEach(function(c){p.conflicts.push({id:name+':'+c.id,group:name,recordId:c.id,local:c.local,backup:c.backup});});
}
function preview(local,backup){
  if(!local||!backup||!local.data||!backup.data||!Array.isArray(local.projects)||!Array.isArray(backup.projects)||!local.images||!backup.images)throw new Error('备份数据无效');
  var p={local:copy(local),groups:Object.create(null),conflicts:[],importedKeys:Object.keys(backup.data),hasProjects:backup.projects.length>0};
  p.importedKeys.forEach(function(key){
    if(!keys[key])throw new Error('备份包含未知数据');
    var a=local.data[key],b=backup.data[key];
    var strategy=registry.byKey(key).merge;
    if(strategy==='roster'){
      if(!b||b.version!==2||(a&&a.version!==2))throw new Error('玩家库版本不支持自动合并');
      a=a||{version:2,players:[],groups:[]};
      addGroup(p,'roster.players',a.players,b.players);addGroup(p,'roster.groups',a.groups,b.groups);
    } else if(strategy==='records')addGroup(p,key,a||[],b);
    else addGroup(p,key,a===undefined?[]:[{id:key,value:a}],[{id:key,value:b}]);
  });
  function projects(payload){return payload.projects.map(function(project){
    if(!own(payload.images,project.imagePath))throw new Error('拼豆图片缺失');
    return {id:project.id,project:project,image:payload.images[project.imagePath]};
  });}
  if(p.hasProjects)addGroup(p,'perler',projects(local),projects(backup));
  return p;
}
function resolve(p,choices,playerEdits,groupEdits){
  var result=copy(p.local);
  function group(name){var scoped=Object.create(null);p.groups[name].conflicts.forEach(function(c){scoped[c.id]=choices[name+':'+c.id];});return merge.resolve(p.groups[name],scoped);}
  p.importedKeys.forEach(function(key){
    var strategy=registry.byKey(key).merge;
    if(strategy==='roster'){
      var library={version:2,players:group('roster.players'),groups:group('roster.groups')};
      library.players.forEach(function(player){
        var edit=playerEdits&&own(playerEdits,player.id)&&playerEdits[player.id];if(!edit)return;
        if(edit.archive===true)player.archived=true;
        if(typeof edit.name==='string'&&edit.name.trim())player.name=edit.name.trim();
        if(typeof edit.groupId==='string')player.groupId=edit.groupId;
      });
      library.groups.forEach(function(group){var edit=groupEdits&&own(groupEdits,group.id)&&groupEdits[group.id];if(edit&&typeof edit.name==='string')group.name=edit.name.trim();});
      var issues=merge.validateRoster(library);if(issues.length){var error=new Error('麻将玩家或组合存在同名或缺失组合，请先处理');error.issues=issues;throw error;}
      result.data[key]=library;
    }else if(strategy==='records')result.data[key]=group(key);
    else {var item=group(key)[0];if(item){
      result.data[key]=item.value;
      var imported=p.groups[key].added.length>0||choices[key+':'+key]==='backup';
      if(key==='lanPokerRecentV1'&&imported&&item.value&&item.value.role==='guest')result.data[key].left=true;
    }}
  });
  if(p.hasProjects){result.projects=[];result.images={};var ids=Object.create(null);group('perler').forEach(function(item){var id=item.id.toLowerCase();if(ids[id])throw new Error('拼豆项目编号大小写冲突');ids[id]=true;result.projects.push(item.project);result.images[item.project.imagePath]=item.image;});}
  return result;
}
module.exports={preview:preview,resolve:resolve};
