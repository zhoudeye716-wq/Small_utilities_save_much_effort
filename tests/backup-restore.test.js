const test=require('node:test');
const assert=require('node:assert/strict');
const tx=require('../utils/backup/restore');
function io(initial){
  const data=structuredClone(initial);let journal=null,fail='';
  return {data,get:k=>Object.hasOwn(data,k)?{exists:true,value:structuredClone(data[k])}:{exists:false},
    put(k,v){if(fail===k){fail='';throw Error('full');}data[k]=structuredClone(v);},del(k){delete data[k];},
    saveJournal(v){journal=structuredClone(v);},loadJournal(){return structuredClone(journal);},clearJournal(){journal=null;},
    fail(k){fail=k;},hasJournal(){return !!journal;}};
}
test('发生写入失败时还原已修改数据，包括原本不存在的键',()=>{
  const disk=io({a:1,b:2});disk.fail('b');
  assert.throws(()=>tx.apply(disk,[{key:'new',value:1},{key:'a',value:3},{key:'b',value:4}]),/失败/);
  assert.deepEqual(disk.data,{a:1,b:2});assert.equal(disk.hasJournal(),false);
});
test('中断后可从恢复记录重复回滚',()=>{
  const disk=io({a:2});disk.saveJournal({version:1,before:[{key:'a',exists:true,value:1},{key:'new',exists:false}]});disk.data.new=3;
  tx.recover(disk);assert.deepEqual(disk.data,{a:1});assert.equal(disk.hasJournal(),false);
});
test('事务写入成功才清理记录，重复键不能执行',()=>{
  const disk=io({a:1});
  assert.throws(()=>tx.apply(disk,[{key:'a',value:2},{key:'a',value:3}]),/重复/);
  tx.apply(disk,[{key:'a',value:2}]);assert.equal(disk.data.a,2);assert.equal(disk.hasJournal(),false);
});
test('回滚失败时保留恢复记录，后续重试可完成',()=>{
  const disk=io({a:2});disk.saveJournal({version:1,before:[{key:'a',exists:true,value:1}]});disk.fail('a');
  assert.throws(()=>tx.recover(disk));assert.equal(disk.hasJournal(),true);
  tx.recover(disk);assert.equal(disk.data.a,1);assert.equal(disk.hasJournal(),false);
});
test('恢复记录有重复键时在任何数据修改前拒绝',()=>{
  const disk=io({a:2});disk.saveJournal({version:1,before:[{key:'a',exists:true,value:1},{key:'a',exists:true,value:0}]});
  assert.throws(()=>tx.recover(disk),/损坏/);assert.equal(disk.data.a,2);assert.equal(disk.hasJournal(),true);
});
