'use strict';

// Keys are intentionally explicit: diagnostic logs and timers are not backups.
var KEYS=Object.create(null);
require('./registry').categories.forEach(function(category){KEYS[category.id]=category.fields.map(function(field){return field.key;});});

function copy(value) { return JSON.parse(JSON.stringify(value)); }

function createSource(api, fs, root, store) {
  return {
    get: function(key) { return api.getStorageSync(key); },
    listProjects: function(ids) { return store.list().filter(function(item){return !Array.isArray(ids)||ids.indexOf(item.id)>=0;}).map(function(item) {
      if (!item || item.invalid) throw new Error('拼豆项目损坏，无法备份');
      var project=store.load(item.id);
      if (!project || project.id!==item.id) throw new Error('拼豆项目编号不一致');
      return project;
    }); },
    readImage: function(path,id) {
      var prefix=root+'/'+id+'.';
      if (path.indexOf(prefix)!==0 || !/^(jpg|jpeg|png|webp)$/i.test(path.slice(prefix.length))) throw new Error('图片路径不在项目目录');
      return fs.readFileSync(path,'base64');
    }
  };
}

function collect(source, categories, options) {
  var result = { data: {}, projects: [], images: {} };
  var selected = Array.isArray(categories) ? categories : [];
  selected.forEach(function(category) {
    if (!Object.prototype.hasOwnProperty.call(KEYS, category)) throw new Error('不支持的备份类别');
    KEYS[category].forEach(function(key) {
      var value = source.get(key,key==='seatingProjectsV1'&&options?options.seatingProjectIds:undefined);
      if (value !== undefined && value !== null && value !== '') result.data[key] = copy(value);
    });
  });
  if (selected.indexOf('perler') < 0) return result;
  var ids = Object.create(null);
  var chosen=options&&Array.isArray(options.projectIds)?options.projectIds:null;
  source.listProjects(chosen).filter(function(project){return !chosen||chosen.indexOf(project.id)>=0;}).forEach(function(project) {
    if (!project || !/^[a-zA-Z0-9_-]+$/.test(project.id || '') || ids[project.id.toLowerCase()]) throw new Error('拼豆项目编号无效或重复');
    ids[project.id.toLowerCase()] = true;
    var path = project.imagePath;
    var match = typeof path === 'string' && path.match(/\.([a-zA-Z0-9]+)$/);
    if (!match || !/^(jpg|jpeg|png|webp)$/i.test(match[1])) throw new Error('拼豆项目图片路径无效');
    var image;
    try { image = source.readImage(path, project.id); } catch (e) { throw new Error('无法读取拼豆项目图片：' + project.id); }
    if (typeof image !== 'string' || !image) throw new Error('无法读取拼豆项目图片：' + project.id);
    var relative = 'images/' + project.id + '.' + match[1].toLowerCase();
    var item = copy(project);
    item.imagePath = relative;
    result.projects.push(item);
    result.images[relative] = image;
  });
  if(chosen&&chosen.some(function(id){return !result.projects.some(function(project){return project.id===id;});}))throw new Error('选中的拼豆项目不存在或无法读取');
  return result;
}

module.exports = { collect: collect, createSource: createSource, KEYS: KEYS };
