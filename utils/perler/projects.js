function createStore(files, root) {
  function pathFor(id) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('无效的项目编号');
    return root + '/' + id + '.json';
  }
  function load(id) { return JSON.parse(files.read(pathFor(id))); }
  function save(project) {
    files.write(pathFor(project.id), JSON.stringify(project));
    if(files.writeSummary) try { files.writeSummary(project.id,{id:project.id,name:project.name,imagePath:project.imagePath,width:project.width,height:project.height,updatedAt:project.updatedAt}); }
    catch(e) { if(files.removeSummary) try {files.removeSummary(project.id);} catch(ignore) {} }
  }
  function list() {
    var result = [];
    files.list().forEach(function (name) {
      var match = /^([a-zA-Z0-9_-]+)\.json$/.exec(name);
      if (!match) return;
      var p;
      if(files.readSummary) try {p=files.readSummary(match[1]);} catch(e) {}
      if(!p || p.id!==match[1]) try {p=load(match[1]);} catch(e) {p={id:match[1],name:'项目数据损坏',invalid:true};}
      if(p && p.id===match[1]) result.push(p);
    });
    return result.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  }
  function remove(id) {
    var project = load(id);
    if (project.imagePath) {
      var allowed = root + '/' + id + '.';
      if (project.imagePath.indexOf(allowed) !== 0 || !/^(jpg|jpeg|png|webp)$/i.test(project.imagePath.slice(allowed.length))) {
        throw new Error('图片不在项目目录内');
      }
      if (!files.exists || files.exists(project.imagePath)) files.remove(project.imagePath);
    }
    if(files.removeSummary) files.removeSummary(id);
    files.remove(pathFor(id));
  }
  return { load: load, save: save, remove: remove, list: list };
}

module.exports = { createStore: createStore };
