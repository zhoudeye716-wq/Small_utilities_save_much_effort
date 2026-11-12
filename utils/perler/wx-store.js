var projects = require('./projects');
var ROOT = wx.env.USER_DATA_PATH + '/perler-projects';
var fs = wx.getFileSystemManager();

function ensureRoot() {
  try { fs.accessSync(ROOT); } catch (e) { fs.mkdirSync(ROOT, true); }
}

function store() {
  ensureRoot();
  return projects.createStore({
    read: function (p) { return fs.readFileSync(p, 'utf8'); },
    write: function (p, value) {
      var temp = p + '.tmp';
      fs.writeFileSync(temp, value, 'utf8');
      fs.renameSync(temp, p);
    },
    remove: function (p) { fs.unlinkSync(p); },
    exists: function (p) { try { fs.accessSync(p);return true; } catch (e) { if (/no such file|not exist|ENOENT/i.test(e.errMsg || e.message || '')) return false; throw e; } },
    list: function () { return fs.readdirSync(ROOT); },
    readSummary: function (id) { return JSON.parse(fs.readFileSync(ROOT+'/'+id+'.meta','utf8')); },
    writeSummary: function (id,summary) {var p=ROOT+'/'+id+'.meta';fs.writeFileSync(p+'.tmp',JSON.stringify(summary),'utf8');fs.renameSync(p+'.tmp',p);},
    removeSummary: function (id) {var p=ROOT+'/'+id+'.meta';try{fs.unlinkSync(p);}catch(e){if(!/no such file|not exist|ENOENT/i.test(e.errMsg||e.message||''))throw e;}}
  }, ROOT);
}

function copyImage(path, id, type) {
  ensureRoot();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('无效的项目编号');
  var ext = type === 'png' ? 'png' : type === 'webp' ? 'webp' : 'jpg';
  var destination = ROOT + '/' + id + '.' + ext;
  fs.copyFileSync(path, destination);
  return destination;
}

function discardCopy(path,id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || path.indexOf(ROOT+'/'+id+'.') !== 0 || !/^(jpg|jpeg|png|webp)$/i.test(path.slice((ROOT+'/'+id+'.').length))) throw new Error('图片不在项目目录内');
  fs.unlinkSync(path);
}

module.exports = { store: store, copyImage: copyImage, discardCopy: discardCopy };
