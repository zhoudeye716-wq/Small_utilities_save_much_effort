'use strict';
function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function name(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
function base64(value) {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0) return false;
  var end = value.length; if (value[end - 1] === '=') end--; if (value[end - 1] === '=') end--;
  return end > 0 && !/[^A-Za-z0-9+/]/.test(value.slice(0, end));
}
function validate(project) {
  if (!object(project) || !name(project.id) || project.version !== 1 || typeof project.name !== 'string' || !object(project.venue) || !Array.isArray(project.tables) || !Array.isArray(project.people) || !Array.isArray(project.objects) || !object(project.assets) || !object(project.embeddedAssets)) throw new Error('座位图数据无效');
  var venue=project.venue, emptyVenue=venue.widthMetres===null&&venue.heightMetres===null;
  if(!emptyVenue&&(!Number.isFinite(venue.widthMetres)||venue.widthMetres<=0||!Number.isFinite(venue.heightMetres)||venue.heightMetres<=0||!Number.isFinite(venue.unitsPerMetre)||venue.unitsPerMetre<=0))throw new Error('座位图场地尺寸无效');
  var people = Object.create(null), seats = Object.create(null), seated = Object.create(null), tables = Object.create(null);
  project.people.forEach(function(person) { if (!object(person) || !name(person.id) || people[person.id] || typeof person.name !== 'string') throw new Error('座位图人员无效'); people[person.id] = true; });
  project.tables.forEach(function(table) {
    if (!object(table) || !name(table.id) || tables[table.id] || ['round','rect','oval','t','u'].indexOf(table.type) < 0 || !Number.isFinite(table.x) || !Number.isFinite(table.y) || !Number.isFinite(table.width) || table.width <= 0 || !Number.isFinite(table.height) || table.height <= 0 || !Array.isArray(table.seats) || !Array.isArray(table.edges) || !table.edges.length || table.edges.some(function(edge) { return ['top','right','bottom','left'].indexOf(edge) < 0; })) throw new Error('座位图桌子无效');
    tables[table.id] = true;
    table.seats.forEach(function(seat) { if (!object(seat) || !name(seat.id) || seats[seat.id] || (seat.offsetX !== undefined && !Number.isFinite(seat.offsetX)) || (seat.offsetY !== undefined && !Number.isFinite(seat.offsetY)) || (seat.personId !== null && (!people[seat.personId] || seated[seat.personId]))) throw new Error('座位图座位无效'); seats[seat.id] = true; if (seat.personId) seated[seat.personId] = true; });
  });
  if (project.freeSeats !== undefined && !Array.isArray(project.freeSeats)) throw new Error('座位图座位无效');
  (project.freeSeats || []).forEach(function(seat) { if (!object(seat) || !name(seat.id) || seats[seat.id] || !Number.isFinite(seat.x) || !Number.isFinite(seat.y) || (seat.personId !== null && (!people[seat.personId] || seated[seat.personId]))) throw new Error('座位图座位无效'); seats[seat.id] = true; if (seat.personId) seated[seat.personId] = true; });
  project.objects.forEach(function(item) { if (!object(item) || !name(item.id) || !Array.isArray(item.points) || item.points.some(function(p) { return !object(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y); })) throw new Error('座位图线条无效'); });
  var used = Object.create(null), assetNames = Object.create(null);
  Object.keys(project.assets).forEach(function(kind) {
    var ref = project.assets[kind];
    if (['background','logo'].indexOf(kind) < 0 || typeof ref !== 'string' || ref.indexOf(project.id + '-') !== 0 || !/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(ref) || !base64(project.embeddedAssets[ref])) throw new Error('座位图图片无效或缺失');
    var lower=ref.toLowerCase();if(assetNames[lower]&&assetNames[lower]!==ref)throw new Error('座位图图片名称冲突');assetNames[lower]=ref;used[ref] = true;
  });
  if (Object.keys(project.embeddedAssets).some(function(ref) { return !used[ref]; })) throw new Error('座位图包含未知图片');
  return true;
}
function capture(storage, readImage, selectedIds) {
  var chosen=Array.isArray(selectedIds)?selectedIds:null;
  var projects=storage.list().filter(function(summary){return !chosen||chosen.indexOf(summary.id)>=0;}).map(function(summary) {
    if (!summary || summary.invalid) throw new Error('座位图无法读取');
    var project = JSON.parse(JSON.stringify(storage.load(summary.id)));
    project.embeddedAssets = {};
    Object.keys(project.assets || {}).forEach(function(kind) {
      var ref = project.assets[kind];
      try { project.embeddedAssets[ref] = readImage(ref); } catch (error) { throw new Error('座位图图片无法读取'); }
    });
    validate(project); return project;
  });
  if(chosen&&chosen.some(function(id){return !projects.some(function(project){return project.id===id;});}))throw new Error('选中的座位图不存在或无法读取');
  return projects;
}
async function verifyAssets(api, fs, root, projects) {
  var refs = [];
  projects.forEach(function(project) { validate(project); Object.keys(project.embeddedAssets).forEach(function(ref) { refs.push({ ref: ref, data: project.embeddedAssets[ref] }); }); });
  if (!refs.length) return;
  if (typeof api.getImageInfo !== 'function') throw new Error('当前环境无法验证座位图图片');
  var check = require('../backup/image-check'), dir = root + '/backup-check';
  api.setStorageSync(check.KEY, true);
  try {
    try { fs.mkdirSync(dir, true); } catch (error) { fs.accessSync(dir); }
    for (var i = 0; i < refs.length; i++) {
      var ext = refs[i].ref.split('.').pop().toLowerCase(), path = dir + '/check_seating_' + i + '.' + ext;
      fs.writeFileSync(path, refs[i].data, 'base64');
      await new Promise(function(resolve, reject) {
        var done = false, timer = setTimeout(function() { finish(new Error('座位图图片验证超时')); }, 15000);
        function finish(error) { if (done) return; done = true; clearTimeout(timer); if (error) reject(error); else resolve(); }
        try { api.getImageInfo({ src: path, success: function(info) { finish(info && info.width > 0 && info.height > 0 ? null : new Error('座位图图片无效')); }, fail: function() { finish(new Error('座位图图片损坏或无法解码')); } }); } catch (error) { finish(new Error('座位图图片无法验证')); }
      });
      fs.unlinkSync(path);
    }
  } finally { check.cleanup(fs, root); api.removeStorageSync(check.KEY); }
}
module.exports = { validate: validate, capture: capture, verifyAssets: verifyAssets };
