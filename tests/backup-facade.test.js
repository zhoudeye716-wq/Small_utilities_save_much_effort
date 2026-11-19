const test=require('node:test');
const assert=require('node:assert/strict');
const facade=require('../utils/backup/facade');
const store={get:()=>undefined,listProjects:()=>[],readImage:()=>''};
test('从备份内容推断本机需要读取的类别，不读取无关拼豆图片',()=>{
  assert.deepEqual(facade.categories({data:{mahjongSessions:[],savedSignboards:[]},projects:[],images:{}}),['mahjong','signboards']);
  assert.deepEqual(facade.categories({data:{},projects:[{id:'a'}],images:{}}),['perler']);
});
test('导入计划不会在预览阶段写入本地存储',()=>{
  const preview=facade.prepare(store,{data:{savedSignboards:[{id:'a',name:'桌牌'}]},projects:[],images:{}});
  assert.equal(preview.conflicts.length,0);
  assert.equal(preview.importedKeys[0],'savedSignboards');
});
test('仅恢复拼豆校准参数时不读取图纸原图',()=>{
  const source={get:()=>undefined,listProjects(){throw Error('unexpected');},readImage(){throw Error('unexpected');}};
  const preview=facade.prepare(source,{data:{'perler-calibrations-v1':[]},projects:[],images:{}});
  assert.equal(preview.importedKeys[0],'perler-calibrations-v1');
});
test('预览之后本机数据变化时阻止按旧预览写入',()=>{
  let items=[{id:'a',name:'原版'}];const source={get:key=>key==='savedSignboards'?items:undefined,listProjects:()=>[],readImage:()=>''};
  const incoming={data:{savedSignboards:[{id:'b',name:'备份'}]},projects:[],images:{}};
  const p=facade.prepare(source,incoming);assert.equal(facade.unchanged(source,incoming,p),true);
  items=[{id:'a',name:'后来修改'}];assert.equal(facade.unchanged(source,incoming,p),false);
});
test('只需验证将要新增或替换的图片',()=>{
  const p={groups:{perler:{added:[{id:'a',project:{id:'a'}}],conflicts:[{id:'b',backup:{project:{id:'b'}}},{id:'c',backup:{project:{id:'c'}}}]}}};
  assert.deepEqual(facade.projectsToVerify(p,{'perler:b':'backup','perler:c':'local'}).map(x=>x.id),['a','b']);
});
