'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const wxStore = require('../utils/seating/wx-store');
const model = require('../utils/seating/model');

test('小程序文件接口保存并重新读取项目', () => {
  const files = {}, dirs = new Set();
  const fs = {
    accessSync(p) { if (!dirs.has(p)) throw Error('not found'); },
    mkdirSync(p) { dirs.add(p); },
    readFileSync(p) { if (!(p in files)) throw Error('not found'); return files[p]; },
    writeFileSync(p, content) { files[p] = content; },
    renameSync(a, b) { files[b] = files[a]; delete files[a]; },
    unlinkSync(p) { delete files[p]; },
    readdirSync(p) { return Object.keys(files).filter(k => k.startsWith(p + '/')).map(k => k.slice(p.length + 1)); }
  };
  const storage = wxStore.create({ env: { USER_DATA_PATH: '/local' }, getFileSystemManager: () => fs });
  storage.save(model.createProject('第一次聚会', 'project1'));
  assert.equal(storage.list()[0].name, '第一次聚会');
  assert.equal(storage.load('project1').name, '第一次聚会');
});
