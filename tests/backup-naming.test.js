const test=require('node:test');
const assert=require('node:assert/strict');
const naming=require('../utils/backup/naming');
test('备份文件名称可读、包含搜索关键词并安全识别',()=>{
  const name=naming.create(new Date(2026,10,18,20,30,1));
  assert.match(name,/^小工具省更多_备份_20261118_203001_[0-9]+\.zip$/);
  assert.equal(naming.valid(name),true);
  assert.equal(naming.valid('../'+name),false);
});
