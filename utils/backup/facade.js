'use strict';
var collect=require('./collect');
var planner=require('./plan');
function categories(payload){
  var groups=collect.KEYS;
  return Object.keys(groups).filter(function(group){return groups[group].some(function(key){return Object.prototype.hasOwnProperty.call(payload.data,key);})||(group==='perler'&&payload.projects.length>0);});
}
function prepare(source,payload){
  var localSource=payload.projects.length?source:{get:function(key){return source.get(key);},listProjects:function(){return [];},readImage:function(){throw new Error('不需要读取图片');}};
  var local=collect.collect(localSource,categories(payload));
  return planner.preview(local,payload);
}
function unchanged(source,payload,plan){return require('./merge').stable(prepare(source,payload).local)===require('./merge').stable(plan.local);}
function projectsToVerify(plan,choices){var group=plan.groups.perler;if(!group)return [];return group.added.map(function(x){return x.project;}).concat(group.conflicts.filter(function(x){return choices['perler:'+x.id]==='backup';}).map(function(x){return x.backup.project;}));}
module.exports={categories:categories,prepare:prepare,unchanged:unchanged,projectsToVerify:projectsToVerify};
