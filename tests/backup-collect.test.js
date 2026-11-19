const test = require('node:test');
const assert = require('node:assert/strict');
const { collect, createSource } = require('../utils/backup/collect');

function source(values, projects, images) {
  return {
    get(key) { return values[key]; },
    listProjects() { return projects || []; },
    readImage(path) { if (!Object.hasOwn(images || {}, path)) throw new Error('missing'); return images[path]; }
  };
}

test('备份按类别收集数据并排除倒计时和局域网测试日志', () => {
  const input = source({mahjongSessions:[{id:'s1'}],mahjongGuideEnabled:false,savedSignboards:[{id:'x'}], 'universal-timer-v1':{quick:[5]},'lan-test-last-v1':{log:'private'}});
  const result = collect(input, ['mahjong','signboards']);
  assert.deepEqual(result.data.mahjongSessions,[{id:'s1'}]);
  assert.equal(result.data.mahjongGuideEnabled,false);
  assert.deepEqual(result.data.savedSignboards,[{id:'x'}]);
  assert.equal(result.data['universal-timer-v1'],undefined);
  assert.equal(result.data['lan-test-last-v1'],undefined);
});

test('拼豆项目和图片打包为相对路径，且不修改现有项目', () => {
  const project={id:'p1',imagePath:'/user/perler-projects/p1.jpg',cells:[{key:'A'}]};
  const result=collect(source({},[project],{'/user/perler-projects/p1.jpg':'aGVsbG8='}),['perler']);
  assert.equal(result.projects[0].imagePath,'images/p1.jpg');
  assert.equal(result.images['images/p1.jpg'],'aGVsbG8=');
  assert.equal(project.imagePath,'/user/perler-projects/p1.jpg');
});

test('图片缺失或路径不安全时明确失败', () => {
  assert.throws(()=>collect(source({},[{id:'p1',imagePath:'/user/perler-projects/p1.jpg'}],{}),['perler']),/图片/);
  assert.throws(()=>collect(source({},[{id:'../p',imagePath:'/tmp/x.jpg'}],{}),['perler']),/项目/);
});

test('真实文件源只允许读取自身项目目录中与项目编号匹配的图片', () => {
  const fs={readFileSync(path,encoding){assert.equal(encoding,'base64');return 'aGVsbG8=';}};
  const store={list:()=>[{id:'p1'}],load:()=>({id:'p1',imagePath:'/data/perler-projects/p1.jpg'})};
  const input=createSource({getStorageSync:()=>''},fs,'/data/perler-projects',store);
  assert.equal(collect(input,['perler']).images['images/p1.jpg'],'aGVsbG8=');
  store.load=()=>({id:'p1',imagePath:'/data/perler-projects/other.jpg'});
  assert.throws(()=>collect(input,['perler']),/图片/);
});
test('可选择单个拼豆项目分批备份，不读取未选择的图片',()=>{
  const projects=[{id:'a',imagePath:'/p/a.jpg'},{id:'b',imagePath:'/p/b.jpg'}];
  const result=collect(source({},projects,{'/p/a.jpg':'aA=='}),['perler'],{projectIds:['a']});
  assert.deepEqual(result.projects.map(x=>x.id),['a']);
  assert.throws(()=>collect(source({},projects,{'/p/a.jpg':'aA=='}),['perler'],{projectIds:['a','missing']}),/项目/);
});
