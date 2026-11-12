const test = require('node:test');
const assert = require('node:assert/strict');
const projects = require('../utils/perler/projects');

function fakeFiles() {
  const files = {};
  return {
    files,
    write: (path, content) => { files[path] = content; },
    read: path => { if (!(path in files)) throw Error('missing'); return files[path]; },
    remove: path => { if (!(path in files)) throw Error('missing'); delete files[path]; },
    list: () => Object.keys(files).filter(path => path.startsWith('/private/')).map(path => path.slice('/private/'.length)),
    exists: path => path in files
  };
}

test('项目保存和恢复包括网格与独立原图路径', () => {
  const fs = fakeFiles();
  const store = projects.createStore(fs, '/private');
  const project = { id:'one', name:'小猫', imagePath:'/private/one.jpg', cells:['A','B'], width:2, height:1 };
  store.save(project);
  assert.deepEqual(store.load('one'), project);
});

test('项目列表按最后编辑时间倒序并提示损坏文件', () => {
  const fs = fakeFiles();
  const store = projects.createStore(fs, '/private');
  store.save({id:'old', updatedAt:10});
  store.save({id:'new', updatedAt:20});
  fs.files['/private/corrupt.json'] = '{';
  assert.deepEqual(store.list().map(p => p.id), ['new','old','corrupt']);
  assert.equal(store.list()[2].invalid,true);
});

test('删除项目只删除本应用内文件，不删除相册原图', () => {
  const fs = fakeFiles();
  const store = projects.createStore(fs, '/private');
  fs.files['/private/one.jpg'] = 'copy';
  fs.files['/album/source.jpg'] = 'original';
  store.save({id:'one', imagePath:'/private/one.jpg'});
  store.remove('one');
  assert.equal(fs.files['/private/one.jpg'], undefined);
  assert.equal(fs.files['/album/source.jpg'], 'original');
  assert.throws(() => store.load('one'));
});

test('拒绝删除应用目录外的文件，且保留项目以便修复', () => {
  const fs = fakeFiles();
  const store = projects.createStore(fs, '/private');
  fs.files['/album/source.jpg'] = 'original';
  store.save({id:'one', imagePath:'/album/source.jpg'});
  assert.throws(() => store.remove('one'));
  assert.equal(fs.files['/album/source.jpg'], 'original');
  assert.equal(store.load('one').id, 'one');
});

test('拒绝包含路径穿越的图片文件名', () => {
  const fs = fakeFiles();
  const store = projects.createStore(fs, '/private');
  const path = '/private/one.jpg/../../album/source.jpg';
  fs.files[path] = 'original';
  store.save({id:'one', imagePath:path});
  assert.throws(() => store.remove('one'));
  assert.equal(fs.files[path], 'original');
  assert.equal(store.load('one').id, 'one');
});

test('删除时记录文件失败后可重试，不会因原图副本已删而卡住', () => {
  const fs = fakeFiles();const remove = fs.remove;let fail=true;
  fs.remove=path=>{if(path.endsWith('.json')&&fail){fail=false;throw Error('disk busy');}remove(path);};
  const store=projects.createStore(fs,'/private');
  fs.files['/private/one.jpg']='copy';store.save({id:'one',imagePath:'/private/one.jpg'});
  assert.throws(()=>store.remove('one'));
  assert.doesNotThrow(()=>store.remove('one'));
  assert.throws(()=>store.load('one'));
});

test('项目列表优先读取轻量摘要，避免读取大型网格文件', () => {
  const fs=fakeFiles(), summaries={}; let reads=0;
  fs.writeSummary=(id,value)=>{summaries[id]=JSON.stringify(value);};
  fs.readSummary=id=>JSON.parse(summaries[id]);
  const read=fs.read;fs.read=path=>{reads++;return read(path);};
  const store=projects.createStore(fs,'/private');store.save({id:'large',name:'图纸',width:180,height:180,cells:new Array(32400).fill('A'),updatedAt:10});
  const list=store.list();assert.equal(list[0].name,'图纸');assert.ok(!('cells' in list[0]));assert.equal(reads,0);
});

test('摘要写入失败不等同于项目保存失败，原图不应被清理', () => {
  const fs=fakeFiles();fs.writeSummary=()=>{throw Error('summary failure');};fs.removeSummary=()=>{};
  const store=projects.createStore(fs,'/private');
  fs.files['/private/one.jpg']='copy';
  assert.doesNotThrow(()=>store.save({id:'one',imagePath:'/private/one.jpg'}));
  assert.equal(store.load('one').id,'one');
  assert.equal(fs.files['/private/one.jpg'],'copy');
});
