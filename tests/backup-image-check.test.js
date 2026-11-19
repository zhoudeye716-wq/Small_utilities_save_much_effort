const test=require('node:test');
const assert=require('node:assert/strict');
const check=require('../utils/backup/image-check');
function setup(width,height,fail){const files={},storage={};return {files,fs:{mkdirSync(){},writeFileSync(p,v){files[p]=v;},unlinkSync(p){delete files[p];},readdirSync(){return Object.keys(files).map(x=>x.split('/').pop());}},api:{setStorageSync(k,v){storage[k]=v;},removeStorageSync(k){delete storage[k];},getImageInfo(o){if(fail)o.fail({});else o.success({width,height});}}};}
test('导入前解码图片并验证原始尺寸，完成后删除临时文件',async()=>{
  const x=setup(100,50);await check.verify(x.api,x.fs,'/data',[{id:'p',imagePath:'images/p.jpg',sourceWidth:100,sourceHeight:50}],{'images/p.jpg':'aA=='});
  assert.equal(Object.keys(x.files).length,0);
});
test('图片损坏或尺寸不一致时拒绝并清理临时文件',async()=>{
  for(const x of [setup(0,0,true),setup(50,100)]){
    await assert.rejects(check.verify(x.api,x.fs,'/data',[{id:'p',imagePath:'images/p.jpg',sourceWidth:100,sourceHeight:50}],{'images/p.jpg':'aA=='}),/图片/);
    assert.equal(Object.keys(x.files).length,0);
  }
});
test('图片接口没有返回时超时并清理，避免卡在恢复界面',async()=>{
  const x=setup(1,1);x.api.getImageInfo=()=>{};
  await assert.rejects(check.verify(x.api,x.fs,'/data',[{id:'p',imagePath:'images/p.jpg',sourceWidth:1,sourceHeight:1}],{'images/p.jpg':'aA=='},{timeoutMs:10}),/超时/);
  assert.equal(Object.keys(x.files).length,0);
});
