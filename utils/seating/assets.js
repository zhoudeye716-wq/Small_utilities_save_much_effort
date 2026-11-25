'use strict';
var model = require('./model');
function create(io, root, makeId) {
  function path(ref) {
    if (typeof ref !== 'string' || !/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(ref)) throw new Error('无效的图片标识');
    return root + '/' + ref;
  }
  function save(from, projectId, kind, extension) {
    if (!/^[a-zA-Z0-9_-]+$/.test(projectId || '') || ['background', 'logo'].indexOf(kind) < 0 || !/^(jpg|jpeg|png|webp)$/i.test(extension || '')) throw new Error('无效的图片信息');
    var ref = projectId + '-' + kind + '-' + (makeId ? makeId() : model.id('image')) + '.' + extension.toLowerCase();
    io.copy(from, path(ref));
    return ref;
  }
  return { path: path, save: save };
}
module.exports = { create: create };
