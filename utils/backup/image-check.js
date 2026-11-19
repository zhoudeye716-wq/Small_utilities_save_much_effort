'use strict';
var KEY='backup-image-check-pending-v1';
function cleanup(fs,root){
  var dir=root+'/backup-check',names;
  try{names=fs.readdirSync(dir);}catch(e){if(/ENOENT|not exist|no such file/i.test(e.errMsg||e.message||''))return;throw e;}
  names.forEach(function(name){if(/^check_[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(name))fs.unlinkSync(dir+'/'+name);});
}
async function verify(api,fs,root,projects,images,options){
  if(!projects.length)return;
  if(typeof api.getImageInfo!=='function')throw new Error('当前环境无法验证拼豆图片');
  var dir=root+'/backup-check';api.setStorageSync(KEY,true);
  try{
    try{fs.mkdirSync(dir,true);}catch(e){fs.accessSync(dir);}
    for(var i=0;i<projects.length;i++){
      var p=projects[i],prefix='images/'+p.id+'.';
      if(!/^[a-zA-Z0-9_-]+$/.test(p.id)||typeof p.imagePath!=='string'||p.imagePath.indexOf(prefix)!==0||!/^(jpg|jpeg|png|webp)$/i.test(p.imagePath.slice(prefix.length)))throw new Error('拼豆图片路径无效');
      var path=dir+'/check_'+p.id+'.'+p.imagePath.slice(prefix.length).toLowerCase();
      fs.writeFileSync(path,images[p.imagePath],'base64');
      var info=await new Promise(function(resolve,reject){
        var done=false,timeout=options&&options.timeoutMs||15000,timer=setTimeout(function(){if(!done){done=true;reject(new Error('拼豆图片验证超时'));}},timeout);
        function finish(error,value){if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(value);}
        try{api.getImageInfo({src:path,success:function(result){finish(null,result);},fail:function(){finish(new Error('拼豆图片已损坏或无法解码'));}});}catch(e){finish(new Error('拼豆图片无法验证'));}
      });
      if(info.width!==p.sourceWidth||info.height!==p.sourceHeight)throw new Error('拼豆图片尺寸与项目不一致');
      fs.unlinkSync(path);
    }
  } finally {cleanup(fs,root);api.removeStorageSync(KEY);}
}
module.exports={verify:verify,cleanup:cleanup,KEY:KEY};
