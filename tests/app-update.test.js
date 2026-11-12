const test = require('node:test');
const assert = require('node:assert/strict');
const update = require('../utils/app-update');

function release(tag, extra = {}) {
  return Object.assign({ tag_name: tag, name: tag, body: '修复问题', prerelease: false,
    assets: [{ name: 'app.apk', browser_download_url: 'https://gitee.com/bigpoint/Small_utilities_save_much_effort/releases/download/v0.0.7/app.apk' }] }, extra);
}

test('从 Release 中选出比原生版本更新的正式 APK', () => {
  const found = update.selectRelease([release('v0.0.7'), release('v0.0.9', {prerelease:true}), release('v0.0.6')], '0.0.5');
  assert.equal(found.version, '0.0.7');
  assert.equal(found.notes, '修复问题');
  assert.equal(update.selectRelease([release('v0.0.5')], '0.0.5'), null);
  assert.equal(update.selectRelease([release('v1.0.0')], ''), null);
});

test('跳过格式不合规或无可信 APK 的 Release', () => {
  const noApk = release('v3.0.0', {assets: [{name:'source.zip', browser_download_url:'https://gitee.com/a.zip'}]});
  const badUrl = release('v2.0.0', {assets: [{name:'a.apk', browser_download_url:'https://evil.test/a.apk'}]});
  const oldRepo = release('v1.0.0', {assets: [{name:'app.apk', browser_download_url:'https://gitee.com/bigpoint/total-release/attach_files/12/download'}]});
  assert.equal(update.selectRelease([noApk,badUrl,oldRepo,release('vbad')], '0.0.5'), null);
});

test('只在 Android 多端请求更新，一次启动只请求一次', () => {
  let requested = 0, opts;
  const wx = {miniapp:{installApp(){}}, getDeviceInfo:()=>({platform:'android'}),
    getAppBaseInfo:()=>({host:{env:'SAAASDK',appVersion:'0.0.5'}}), request(o){requested++;opts=o;} };
  const controller = update.createUpdater(wx);
  controller.check(); controller.check();
  assert.equal(requested, 1);
  assert.equal(opts.url, 'https://gitee.com/api/v5/repos/bigpoint/Small_utilities_save_much_effort/releases?per_page=100');
  opts.success({statusCode:200,data:[release('v0.0.6')]});
  assert.equal(controller.getState().version, '0.0.6');
  const other = update.createUpdater({getDeviceInfo:()=>({platform:'android'}),request(){throw Error('unexpected');}});
  other.check(); assert.equal(other.getState(), null);
});

test('下载进度实时更新，成功后调用官方安装接口', () => {
  let opts, progress, install;
  const wx = {miniapp:{installApp(o){install=o;}},downloadFile(o){opts=o;return {onProgressUpdate(fn){progress=fn;}};}};
  const events=[];
  update.download(wx, 'https://gitee.com/bigpoint/Small_utilities_save_much_effort/releases/download/v0.0.7/app.apk', s=>events.push(s));
  progress({progress:42}); assert.equal(events.at(-1).progress,42);
  opts.success({statusCode:200,tempFilePath:'wxfile://tmp/update.apk'});
  assert.equal(install.filePath,'wxfile://tmp/update.apk');
  install.success(); assert.equal(events.at(-1).status,'installing');
  progress({progress:99}); assert.equal(events.at(-1).status,'installing');
});

test('下载失败不调用安装接口，允许重试', () => {
  let opts, installs=0; const events=[];
  const wx={miniapp:{installApp(){installs++;}},downloadFile(o){opts=o;return {onProgressUpdate(){}};}};
  update.download(wx,'https://gitee.com/bigpoint/Small_utilities_save_much_effort/releases/download/v0.0.7/app.apk',s=>events.push(s));
  opts.success({statusCode:403});
  assert.equal(installs,0); assert.equal(events.at(-1).status,'error');
});

test('首页重复显示只订阅结果，取消后本次不再次提示', () => {
  let pageConfig, requestOptions, requests=0;
  global.Page = config => { pageConfig=config; };
  const wx = {miniapp:{installApp(){}},getDeviceInfo:()=>({platform:'android'}),
    getAppBaseInfo:()=>({host:{env:'SAAASDK',appVersion:'0.0.5'}}),request(o){requests++;requestOptions=o;}};
  const controller=update.createUpdater(wx);
  global.getApp=()=>({updater:controller});
  delete require.cache[require.resolve('../pages/home/index.js')];
  require('../pages/home/index.js');
  const page=Object.assign({},pageConfig,{data:Object.assign({},pageConfig.data)});
  page.setData=values=>Object.assign(page.data,values);
  try {
    controller.check(); page.onShow();
    requestOptions.success({statusCode:200,data:[release('v0.0.6')]});
    assert.equal(page.data.update.version,'0.0.6');
    page.dismissUpdate(); page.onHide(); page.onShow(); controller.check();
    assert.equal(page.data.update,null); assert.equal(requests,1);
  } finally { delete global.Page; delete global.getApp; }
});
