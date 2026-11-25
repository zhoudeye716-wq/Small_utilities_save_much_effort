'use strict';
function filename(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('无效的项目编号');
  return id + '.json';
}
function createStore(io) {
  function load(id) {
    var value = JSON.parse(io.read(filename(id)));
    if (!value || value.id !== id || value.version !== 1 || !Array.isArray(value.tables) || !Array.isArray(value.people)) throw new Error('项目数据损坏或版本不受支持');
    return value;
  }
  function save(project) {
    if (!project || project.version !== 1 || !Array.isArray(project.tables) || !Array.isArray(project.people)) throw new Error('项目数据无效');
    var path = filename(project.id), tmp = path + '.tmp';
    io.write(tmp, JSON.stringify(project));
    io.rename(tmp, path);
  }
  function list() {
    return io.list().filter(function(name) { return /^[a-zA-Z0-9_-]{1,100}\.json$/.test(name); }).map(function(name) {
      var id = name.slice(0, -5);
      try { var p = load(id); return { id: id, name: p.name, invalid: false }; }
      catch (error) { return { id: id, name: '读取失败的项目', invalid: true }; }
    });
  }
  function remove(id) {
    var project = load(id), refs = Object.keys(project.assets || {}).map(function(key) { return project.assets[key]; });
    refs.forEach(function(ref) { if (typeof ref !== 'string' || ref.indexOf(id + '-') !== 0 || !/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(ref)) throw new Error('项目图片路径无效'); });
    var used = Object.create(null);
    list().forEach(function(other) {
      if (other.id === id) return;
      if (other.invalid) throw new Error('其他项目无法读取，暂不能安全删除图片');
      var assets = load(other.id).assets || {}; Object.keys(assets).forEach(function(key) { used[assets[key]] = true; });
    });
    io.remove(filename(id));
    var failed=false;
    refs.filter(function(ref, index) { return !used[ref] && refs.indexOf(ref) === index; }).forEach(function(ref) { try { io.remove(ref); } catch(error) { if(!/ENOENT|not exist|no such file/i.test(error.errMsg||error.message||''))failed=true; } });
    if(failed)throw new Error('项目已删除，但部分图片清理失败，请检查存储权限。');
  }
  return { save: save, load: load, list: list, remove: remove };
}
module.exports = { createStore: createStore };
