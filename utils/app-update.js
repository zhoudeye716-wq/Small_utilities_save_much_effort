var RELEASE_URL = 'https://gitee.com/api/v5/repos/bigpoint/Small_utilities_save_much_effort/releases?per_page=100';
var ASSET_PREFIX = 'https://gitee.com/bigpoint/Small_utilities_save_much_effort/';

function parseVersion(value) {
  var m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(value || ''));
  if (!m) return null;
  var parts = m.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function compare(a, b) {
  for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
function selectRelease(releases, current) {
  var installed = parseVersion(current), best = null;
  if (!installed || !Array.isArray(releases)) return null;
  releases.forEach(function (r) {
    if (!r || r.prerelease || r.draft) return;
    var version = parseVersion(r.tag_name);
    if (!version || compare(version, installed) <= 0 || (best && compare(version, best.parts) <= 0)) return;
    var assets = Array.isArray(r.assets) ? r.assets : [];
    var apk = assets.filter(function (a) {
      return a && /\.apk$/i.test(a.name || '') && typeof a.browser_download_url === 'string' && a.browser_download_url.indexOf(ASSET_PREFIX) === 0;
    });
    if (apk.length !== 1) return;
    best = { parts: version, version: version.join('.'), current: installed.join('.'), notes: String(r.body || '暂无更新说明').slice(0, 4000), url: apk[0].browser_download_url };
  });
  if (best) delete best.parts;
  return best;
}
function createUpdater(api) {
  var checked = false, state = null, listener = null;
  function publish(value) { state = value; if (listener) listener(state); }
  return {
    getState: function () { return state; },
    subscribe: function (fn) { listener = fn; if (listener) listener(state); },
    clear: function () { publish(null); },
    check: function () {
      if (checked) return;
      checked = true;
      try {
        if (!api.miniapp || typeof api.miniapp.installApp !== 'function' || !api.getAppBaseInfo) return;
        var device = api.getDeviceInfo ? api.getDeviceInfo() : api.getSystemInfoSync();
        if (!device || device.platform !== 'android') return;
        var info = api.getAppBaseInfo(), host = info && info.host, current = host && host.env === 'SAAASDK' && host.appVersion;
        if (!parseVersion(current)) return;
        api.request({url: RELEASE_URL, timeout: 10000, success: function (res) {
          if (res.statusCode === 200) { var found = selectRelease(res.data, current); if (found) publish(found); }
        }});
      } catch (e) { /* 更新检查失败不影响工具使用 */ }
    }
  };
}
function download(api, url, notify) {
  var finished = false;
  function error(msg) { finished = true; notify({status:'error', message:msg}); }
  if (typeof url !== 'string' || url.indexOf(ASSET_PREFIX) !== 0) return error('下载地址无效');
  try {
    var task = api.downloadFile({url:url, success:function (res) {
      if (res.statusCode !== 200 || !res.tempFilePath) return error('下载失败，请检查网络后重试');
      finished = true;
      notify({status:'opening', progress:100});
      try { api.miniapp.installApp({filePath:res.tempFilePath,
        success:function () { notify({status:'installing', progress:100}); },
        fail:function () { error('无法打开安装界面，请检查安装权限和安装包签名'); }
      }); } catch (e) { error('当前版本不支持打开安装界面'); }
    }, fail:function () { error('下载失败，请检查网络后重试'); }});
    notify({status:'downloading',progress:0});
    if (task && task.onProgressUpdate) task.onProgressUpdate(function (p) {
      if (!finished) notify({status:'downloading', progress:Math.max(0, Math.min(100, Number(p.progress) || 0))});
    });
  } catch (e) { error('下载失败，请稍后重试'); }
}
module.exports = { selectRelease:selectRelease, createUpdater:createUpdater, download:download };
