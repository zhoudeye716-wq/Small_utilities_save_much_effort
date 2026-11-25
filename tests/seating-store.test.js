'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../utils/seating/store');
const model = require('../utils/seating/model');

function memory() {
  const files = {};
  return { files, read: p => { if (!(p in files)) throw Error('not found'); return files[p]; }, write: (p, v) => { files[p] = v; }, rename: (a, b) => { files[b] = files[a]; delete files[a]; }, list: () => Object.keys(files), remove: p => { delete files[p]; } };
}
test('多个项目保存恢复彼此独立，名字可相同', () => {
  const io = memory(), storage = store.createStore(io);
  const first = model.createProject('聚会', 'p1'), second = model.createProject('聚会', 'p2');
  first.people.push({ id: 'p', name: '小王' });
  storage.save(first); storage.save(second);
  assert.equal(storage.list().length, 2);
  assert.equal(storage.load('p1').people[0].name, '小王');
  assert.equal(storage.load('p2').people.length, 0);
});
test('写入临时文件失败时保留上次可靠内容', () => {
  const io = memory(), storage = store.createStore(io), project = model.createProject('旧名称', 'p1');
  storage.save(project);
  io.write = () => { throw Error('空间不足'); };
  project.name = '新名称';
  assert.throws(() => storage.save(project));
  assert.equal(storage.load('p1').name, '旧名称');
});
test('拒绝异常项目编号，避免访问项目目录之外', () => {
  const storage = store.createStore(memory());
  assert.throws(() => storage.load('../other'));
});
test('删除项目清理其不再使用的背景图片，不影响其他项目', () => {
  const io = memory(), storage = store.createStore(io), first = model.createProject('一', 'p1'), second = model.createProject('二', 'p2');
  first.assets.background = 'p1-background-a.jpg'; second.assets.background = 'p2-background-b.jpg';
  io.files[first.assets.background] = 'image-one'; io.files[second.assets.background] = 'image-two';
  storage.save(first); storage.save(second); storage.remove('p1');
  assert.equal(io.files[first.assets.background], undefined);
  assert.equal(io.files[second.assets.background], 'image-two');
  assert.equal(storage.load('p2').name, '二');
});
test('项目已删除但图片清理失败时明确报告，不能称为完全未删除', () => {
  const io=memory(),storage=store.createStore(io),p=model.createProject('一','p1');p.assets.background='p1-background-a.jpg';storage.save(p);
  const remove=io.remove;io.remove=path=>{if(path.endsWith('.jpg'))throw Error('权限不足');remove(path);};
  assert.throws(()=>storage.remove('p1'),/项目已删除.*图片/);
  assert.equal(io.files['p1.json'],undefined);
});
