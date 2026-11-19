const test=require('node:test');
const assert=require('node:assert/strict');
const presentation=require('../utils/backup/presentation');
test('冲突摘要展示名称、时间及发生变化的字段',()=>{
  const c={local:{id:'p1',project:{name:'图',updatedAt:1700000000000,cells:[1]}},backup:{id:'p1',project:{name:'图',updatedAt:1700000001000,cells:[2]}}};
  const view=presentation.conflict(c);assert.match(view.localText,/图/);assert.match(view.backupText,/图/);assert.ok(view.changed.includes('图纸格子'));assert.match(view.localText,/2023/);
});
test('同名玩家提供来源和关联对局，便于选择',()=>{
  const p={local:{data:{mahjongPlayerLibrary:{players:[{id:'a',name:'小王'}]},mahjongSessions:[{id:'s',title:'周末',players:[{id:'a'}]}]}},groups:{'roster.players':{added:[{id:'b'}],conflicts:[],skipped:[]}}};
  const issue=presentation.issue({type:'duplicate-name',name:'小王',ids:['a','b']},p);
  assert.match(issue.items[0].label,/本机/);assert.match(issue.items[0].label,/周末/);assert.match(issue.items[1].label,/备份/);
});
test('图纸相同但原图不同的冲突明确显示原图变化',()=>{
  const project={name:'图',updatedAt:1700000000000,cells:[]};
  const view=presentation.conflict({local:{project,image:'AAA'},backup:{project,image:'BBB'}});
  assert.match(view.changed,/原图/);
});
