'use strict';
var store = require('./store');
function create(wxApi) {
  var fs = wxApi.getFileSystemManager(), root = wxApi.env.USER_DATA_PATH + '/seating-projects';
  try { fs.accessSync(root); } catch (error) { fs.mkdirSync(root, true); }
  return store.createStore({
    read: function(p) { return fs.readFileSync(root + '/' + p, 'utf8'); },
    write: function(p, data) { fs.writeFileSync(root + '/' + p, data, 'utf8'); },
    rename: function(from, to) { fs.renameSync(root + '/' + from, root + '/' + to); },
    remove: function(p) { fs.unlinkSync(root + '/' + p); },
    list: function() { return fs.readdirSync(root); }
  });
}
module.exports = { create: create };
