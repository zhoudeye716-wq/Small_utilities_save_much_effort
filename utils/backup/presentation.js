'use strict';
var stable=require('./merge').stable;
var names={cells:'图纸格子',updatedAt:'修改时间',name:'名称',title:'名称',players:'玩家',groups:'组合',rounds:'小轮',fees:'台费',imagePath:'原图',image:'原图',config:'设置',value:'内容'};
function content(record){var value=record&&record.value!==undefined?record.value:record;return value&&value.project?value.project:value;}
function summary(record){
  var v=content(record);if(!v||typeof v!=='object')return JSON.stringify(v);
  var pieces=[];if(v.name||v.title)pieces.push(String(v.name||v.title));
  if(v.updatedAt&&Number.isFinite(new Date(v.updatedAt).getTime()))pieces.push(new Date(v.updatedAt).toLocaleString());
  if(Number.isFinite(v.width)&&Number.isFinite(v.height))pieces.push(v.width+'×'+v.height+' 格');
  if(Array.isArray(v.rounds))pieces.push(v.rounds.length+' 小轮');
  if(Array.isArray(v.fees))pieces.push(v.fees.length+' 笔台费');
  if(v.config&&v.config.text)pieces.push(String(v.config.text).slice(0,40));
  return pieces.length?pieces.join(' · '):JSON.stringify(v).slice(0,220);
}
function conflict(c){
  var a=content(c.local),b=content(c.backup),all=Object.create(null),changed=[];
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    Object.keys(a).concat(Object.keys(b)).forEach(function(k){all[k]=true;});
    Object.keys(all).forEach(function(k){if(stable(a[k])!==stable(b[k]))changed.push(names[k]||k);});
  }
  if(c.local&&c.backup&&c.local.project&&c.backup.project&&c.local.image!==c.backup.image&&changed.indexOf('原图')<0)changed.push('原图');
  return {localText:summary(c.local),backupText:summary(c.backup),changed:changed.join('、')||'内容'};
}
function issue(issue,plan){
  var out=Object.assign({},issue),isGroup=issue.type==='duplicate-group-name',group=plan.groups[isGroup?'roster.groups':'roster.players'];
  if(!issue.ids)return out;
  var local=plan.local.data.mahjongPlayerLibrary||{},records=plan.local.data.mahjongSessions||[];
  out.items=issue.ids.map(function(id){
    var inLocal=(isGroup?local.groups:local.players)||[],origins=[];
    if(inLocal.some(function(x){return x.id===id;}))origins.push('本机');
    if(group&&(group.added.some(function(x){return x.id===id;})||group.skipped.indexOf(id)>=0||group.conflicts.some(function(x){return x.id===id;})))origins.push('备份');
    var linked=!isGroup?records.filter(function(s){return Array.isArray(s.players)&&s.players.some(function(x){return x.id===id;});}).map(function(s){return s.title||'麻将对局';}):[];
    return {id:id,label:(origins.join(' / ')||'未知来源')+(linked.length?' · '+linked.slice(0,3).join('、'):' · 暂无本机对局')};
  });return out;
}
module.exports={conflict:conflict,issue:issue};
