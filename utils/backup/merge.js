'use strict';

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}';
  return JSON.stringify(value);
}
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function index(records) {
  if (!Array.isArray(records)) throw new Error('记录格式无效');
  var byId=Object.create(null);
  records.forEach(function(record) {
    if (!record || typeof record.id !== 'string' || !record.id.trim()) throw new Error('记录编号无效');
    if (Object.prototype.hasOwnProperty.call(byId, record.id)) throw new Error('记录编号重复');
    byId[record.id]=record;
  });
  return byId;
}
function preview(local, backup) {
  var localIndex=index(local);index(backup);
  var result={local:copy(local),added:[],skipped:[],conflicts:[]};
  backup.forEach(function(item) {
    if (!Object.prototype.hasOwnProperty.call(localIndex,item.id)) result.added.push(copy(item));
    else if (stable(localIndex[item.id])===stable(item)) result.skipped.push(item.id);
    else result.conflicts.push({id:item.id,local:copy(localIndex[item.id]),backup:copy(item)});
  });
  return result;
}
function resolve(plan,choices) {
  var byId=Object.create(null);
  plan.conflicts.forEach(function(conflict) {
    var choice=Object.prototype.hasOwnProperty.call(choices,conflict.id) && choices[conflict.id];
    if (choice!=='local' && choice!=='backup') throw new Error('请先选择每条冲突记录');
    byId[conflict.id]=choice==='backup'?conflict.backup:conflict.local;
  });
  return plan.local.map(function(item) { return copy(Object.prototype.hasOwnProperty.call(byId,item.id)?byId[item.id]:item); }).concat(copy(plan.added));
}
function validateRoster(library) {
  if (!library || library.version!==2) throw new Error('玩家库版本无效');
  index(library.players);
  var groups=index(library.groups),names=Object.create(null),groupNames=Object.create(null),issues=[];
  library.groups.forEach(function(group){
    if(group.name!=null&&typeof group.name!=='string')throw new Error('组合名称无效');
    var name=(group.name||'').trim();if(name){if(!groupNames[name])groupNames[name]=[];groupNames[name].push(group.id);}
  });
  library.players.forEach(function(player) {
    if (typeof player.name!=='string'||!player.name.trim()) throw new Error('玩家名称无效');
    if (player.groupId && !Object.prototype.hasOwnProperty.call(groups,player.groupId)) issues.push({type:'missing-group',playerId:player.id,groupId:player.groupId});
    if (!player.archived) {
      var name=player.name.trim();
      if (!names[name]) names[name]=[];
      names[name].push(player.id);
    }
  });
  Object.keys(names).forEach(function(name){if(names[name].length>1)issues.push({type:'duplicate-name',name:name,ids:names[name]});});
  Object.keys(groupNames).forEach(function(name){if(groupNames[name].length>1)issues.push({type:'duplicate-group-name',name:name,ids:groupNames[name]});});
  return issues;
}
module.exports={preview:preview,resolve:resolve,validateRoster:validateRoster,stable:stable};
