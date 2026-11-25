'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');
const layout = require('../utils/seating/layout');
const store = require('../utils/seating/store');
const backup = require('../utils/seating/backup');
const archive = require('../utils/backup/archive');
const restore = require('../utils/backup/wx-restore');

test('50 桌 500 人从建图、保存到备份和恢复的完整数据链路', async () => {
  const files = {};
  const io = {
    read: name => { if (!(name in files)) throw Error('missing'); return files[name]; },
    write: (name, data) => { files[name] = data; },
    rename: (from, to) => { files[to] = files[from]; delete files[from]; },
    remove: name => { delete files[name]; },
    list: () => Object.keys(files)
  };
  const local = store.createStore(io), project = model.createProject('聚会', 'workflow');
  model.setVenue(project, 40, 30);
  const table = model.createTable('round', 'source', {seatCount: 10});
  project.tables = layout.grid(table, 5, 10, 60, 60);
  model.addPeople(project, Array.from({length:500}, (_, i) => '客人' + (i + 1)).join(' '));
  assert.deepEqual(model.autoAssign(project), {assigned:500, remaining:0});
  local.save(project);
  const reopened = local.load(project.id);
  assert.equal(reopened.tables.length, 50);
  assert.equal(model.allSeats(reopened).filter(seat => seat.personId).length, 500);
  const payload = {data:{seatingProjectsV1:backup.capture(local, () => '')}, projects:[], images:{}};
  const bytes = await archive.pack(payload, {});
  const unpacked = await archive.open(bytes, '');
  const changes = restore.buildChanges(unpacked.payload, ['seatingProjectsV1'], false, []);
  const fileChange = changes.find(change => change.key === 'g:workflow.json');
  assert.equal(fileChange.value.encoding, 'json');
  const restoredFiles = {};
  const fs = {
    accessSync: name => { if (name !== '/device/seating-projects' && !(name in restoredFiles)) throw Error('not exist'); },
    mkdirSync: () => {}, writeFileSync: (name, data) => { restoredFiles[name] = data; },
    renameSync: (from, to) => { restoredFiles[to] = restoredFiles[from]; delete restoredFiles[from]; },
    unlinkSync: name => { delete restoredFiles[name]; }
  };
  const adapter = restore.createAdapter({}, fs, '/device', '/perler');
  adapter.put(fileChange.key, fileChange.value);
  const restored = JSON.parse(restoredFiles['/device/seating-projects/workflow.json']);
  assert.equal(restored.people.length, 500);
  assert.equal(model.allSeats(restored).filter(seat => seat.personId).length, 500);
});
