'use strict';

function validKey(key){return typeof key==='string'&&key.length>0&&key.length<300;}
function recover(io){
  var journal=io.loadJournal();if(!journal)return false;
  if(journal.version!==1||!Array.isArray(journal.before))throw new Error('恢复记录损坏，请勿继续导入');
  var seen=Object.create(null);
  journal.before.forEach(function(item){
    if(!item||!validKey(item.key)||typeof item.exists!=='boolean'||seen[item.key])throw new Error('恢复记录损坏，请勿继续导入');
    seen[item.key]=true;if(io.check)io.check(item.key);
  });
  // Keep the journal until every restore succeeds: retries are idempotent.
  journal.before.forEach(function(item){if(item.exists)io.put(item.key,item.value);else io.del(item.key);});
  io.clearJournal();return true;
}
function apply(io,changes){
  if(io.loadJournal())throw new Error('存在未完成的恢复任务');
  if(!Array.isArray(changes))throw new Error('导入内容无效');
  var seen=Object.create(null),before=[];
  changes.forEach(function(change){
    if(!change||!validKey(change.key)||(change.remove!==true&&!Object.prototype.hasOwnProperty.call(change,'value')))throw new Error('导入内容无效');
    if(seen[change.key])throw new Error('导入记录重复');seen[change.key]=true;if(io.check)io.check(change.key);
    var old=io.get(change.key);if(!old||typeof old.exists!=='boolean')throw new Error('无法读取原有数据');
    before.push(old.exists?{key:change.key,exists:true,value:old.value}:{key:change.key,exists:false});
  });
  io.saveJournal({version:1,before:before});
  try{changes.forEach(function(change){if(change.remove===true)io.del(change.key);else io.put(change.key,change.value);});}
  catch(e){try{recover(io);}catch(rollback){throw new Error('导入失败，恢复未完成，请重新打开软件后重试');}throw new Error('导入失败，已恢复原有数据');}
  io.clearJournal();
}
module.exports={apply:apply,recover:recover};
