'use strict';

// Availability of a method does not establish support in a particular host.
function capabilities(api) {
  return {chooseMessageFile:typeof api.chooseMessageFile==='function',shareFileMessage:typeof api.shareFileMessage==='function',secureRandom:typeof api.getRandomValues==='function'};
}
function randomBytes(api,length) {
  return new Promise(function(resolve,reject) {
    if (!Number.isSafeInteger(length)||length<1||length>1024||typeof api.getRandomValues!=='function') return reject(new Error('无法获取安全随机数'));
    try {
      api.getRandomValues({length:length,success:function(result){
        var buffer=result && result.randomValues;
        if (!(buffer instanceof ArrayBuffer)||buffer.byteLength!==length) return reject(new Error('安全随机数结果无效'));
        resolve(new Uint8Array(buffer));
      },fail:function(){reject(new Error('无法获取安全随机数'));}});
    } catch(e) {reject(new Error('无法获取安全随机数'));}
  });
}
function chooseFile(api,success,fail,cancel){
  function skipped(info){if(typeof cancel==='function')cancel(info||{});}
  function done(r){if(!r||!Array.isArray(r.tempFiles))return fail({errMsg:'chooseFile:fail invalid response'});if(!r.tempFiles.length)return skipped();if(r.tempFiles[0]&&r.tempFiles[0].path)success(r.tempFiles[0].path);else fail({errMsg:'chooseFile:fail missing path'});}
  function failure(e){var msg=String((e&&e.errMsg)||'').trim(),code=e&&e.errCode;if(/cancel|取消|abort|no (?:file )?select|not select|未选择|未选|closed/i.test(msg))return skipped();if(!msg||/^(?:choose(?:Message)?File\s*:\s*)?fail\s*$/i.test(msg))return skipped({ambiguous:true,errCode:code});fail(e||{});}
  function chat(){if(typeof api.chooseMessageFile==='function')return api.chooseMessageFile({count:1,type:'file',extension:['zip'],success:done,fail:failure});fail({errMsg:'chooseFile:fail not supported'});}
  try{if(api.miniapp&&typeof api.miniapp.chooseFile==='function')return api.miniapp.chooseFile({allowsMultipleSelection:false,success:done,fail:function(e){if(/not.support|not.implement/i.test((e&&e.errMsg)||''))chat();else failure(e||{});}});return chat();}catch(e){fail({errMsg:'chooseFile:fail '+(e.message||'unknown')});}
}
function shareFile(api,path,name,fail){
  function chat(){if(typeof api.shareFileMessage==='function')return api.shareFileMessage({filePath:path,fileName:name,fail:fail});fail({errMsg:'shareFile:fail not supported'});}
  try{if(api.miniapp&&typeof api.miniapp.shareFile==='function')return api.miniapp.shareFile({filePath:path,fail:function(e){if(/not.support|not.implement/i.test((e&&e.errMsg)||''))chat();else fail(e||{});}});return chat();}catch(e){fail({errMsg:'shareFile:fail '+(e.message||'unknown')});}
}
function copyToDevice(api,path,success,fail){
  if(!api.miniapp||typeof api.miniapp.copyWxFileToNative!=='function')return fail({errMsg:'copyWxFileToNative:fail not supported'});
  try{return api.miniapp.copyWxFileToNative({wxFilePath:path,success:success,fail:fail});}catch(e){fail({errMsg:'copyWxFileToNative:fail '+(e.message||'unknown')});}
}
module.exports={capabilities:capabilities,randomBytes:randomBytes,chooseFile:chooseFile,shareFile:shareFile,copyToDevice:copyToDevice};
