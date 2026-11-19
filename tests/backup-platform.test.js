const test=require('node:test');
const assert=require('node:assert/strict');
const platform=require('../utils/backup/platform');

test('只报告接口是否存在，不能将其作为设备支持的证据',()=>{
  const result=platform.capabilities({chooseMessageFile(){},shareFileMessage(){},getRandomValues(){}});
  assert.deepEqual(result,{chooseMessageFile:true,shareFileMessage:true,secureRandom:true});
  assert.deepEqual(platform.capabilities({}),{chooseMessageFile:false,shareFileMessage:false,secureRandom:false});
});

test('安全随机数缺失、失败或返回长度不正确时拒绝操作',async()=>{
  await assert.rejects(platform.randomBytes({},16),/随机数/);
  await assert.rejects(platform.randomBytes({getRandomValues(o){o.fail({});}},16),/随机数/);
  await assert.rejects(platform.randomBytes({getRandomValues(o){o.success({randomValues:new ArrayBuffer(1)});}},16),/随机数/);
  const bytes=await platform.randomBytes({getRandomValues(o){o.success({randomValues:new Uint8Array(16).fill(7).buffer});}},16);
  assert.equal(bytes.length,16);assert.equal(bytes[0],7);
});
test('多端优先调用系统选择器与系统分享，微信小程序使用聊天接口',()=>{
  const calls=[];const api={miniapp:{chooseFile(o){calls.push('native-choose');o.success({tempFiles:[{path:'/native.zip'}]});},shareFile(o){calls.push('native-share');}},chooseMessageFile(){calls.push('wechat-choose');},shareFileMessage(){calls.push('wechat-share');}};
  platform.chooseFile(api,p=>calls.push(p),()=>{});platform.shareFile(api,'/a.zip','a.zip',()=>{});
  assert.deepEqual(calls,['native-choose','/native.zip','native-share']);
  platform.chooseFile({chooseMessageFile(o){calls.push('wechat-choose');o.success({tempFiles:[{path:'/chat.zip'}]});}},p=>calls.push(p),()=>{});
  assert.deepEqual(calls.slice(-2),['wechat-choose','/chat.zip']);
});
test('多端接口明确不支持时回退微信接口，取消时不重复打开',()=>{
  let count=0;const api={miniapp:{chooseFile(o){o.fail({errMsg:'chooseFile:fail not supported'});}},chooseMessageFile(o){count++;o.success({tempFiles:[{path:'/chat.zip'}]});}};
  platform.chooseFile(api,()=>{},()=>{});assert.equal(count,1);
  api.miniapp.chooseFile=o=>o.fail({errMsg:'chooseFile:fail cancel'});platform.chooseFile(api,()=>{},()=>{});assert.equal(count,1);
});
test('系统选择器返回空文件列表时视为未选择，避免误报不支持',()=>{
  let selected=0,failed=0;
  const api={miniapp:{chooseFile(o){o.success({tempFiles:[]});}}};
  platform.chooseFile(api,()=>selected++,()=>failed++);
  assert.equal(selected,0);assert.equal(failed,0);
});
test('关闭选择器的取消和无详情返回不误报失败，明确错误仍保留',()=>{
  for(const error of [{errMsg:'chooseFile:fail'},{errMsg:'chooseFile:fail',errCode:-1},{errMsg:'chooseFile:fail cancel'},{errMsg:'用户取消'},{errMsg:'chooseFile:fail no file selected'}]){
    let failed=0,cancelled=0;platform.chooseFile({miniapp:{chooseFile(o){o.fail(error);}}},()=>{},()=>failed++,()=>cancelled++);
    assert.equal(failed,0);assert.equal(cancelled,1);
  }
  let failed=0;platform.chooseFile({miniapp:{chooseFile(o){o.fail({errMsg:'permission denied'});}}},()=>{},()=>failed++,()=>{});assert.equal(failed,1);
});
test('多端复制到设备使用 SDK 的文件复制接口，没有能力时明确报错',()=>{
  let target,result,failed=0;
  platform.copyToDevice({miniapp:{copyWxFileToNative(o){target=o.wxFilePath;o.success({nativeFilePath:'/download/a.zip'});}}},'wxfile://a.zip',r=>{result=r;},()=>failed++);
  assert.equal(target,'wxfile://a.zip');assert.equal(result.nativeFilePath,'/download/a.zip');
  platform.copyToDevice({},'wxfile://a.zip',()=>{},()=>failed++);assert.equal(failed,1);
});
