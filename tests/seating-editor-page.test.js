'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../utils/seating/model');
const controller = require('../utils/seating/editor-controller');
let definition;
global.Page = p => { definition = p; };
global.wx = { showModal: () => {} };
require('../pages/seating-editor/index');
function page() {
  const p = Object.assign({}, definition); p.data = JSON.parse(JSON.stringify(definition.data));
  p.setData = data => Object.assign(p.data, data);
  p.controller = controller.create(model.createProject('聚会', 'p'));
  p.view = { x: 30, y: 40, scale: 1 };
  p.draw = () => {}; p.getStore = () => ({ save: value => { p.saved = JSON.parse(JSON.stringify(value)); } });
  return p;
}
test('添加桌子后保存当前项目', () => {
  const p = page(); p.addTable();
  assert.equal(p.controller.project().tables.length, 1);
  assert.equal(p.saved.tables.length, 1);
});
test('圆桌默认是圆形，修改宽度会同步高度', () => {
  const p=page();p.addTable();const table=p.controller.project().tables[0];assert.equal(table.width,table.height);
  p.openTable(table.id);p.tableInput({currentTarget:{dataset:{key:'draftWidth'}},detail:{value:'200'}});
  assert.equal(p.data.draftHeight,'200');p.saveTable();assert.equal(table.width,200);assert.equal(table.height,200);
});
test('桌子对齐吸附可关闭和重新开启', () => {
  const p=page();assert.equal(p.data.snap,true);p.toggleSnap();assert.equal(p.data.snap,false);p.toggleSnap();assert.equal(p.data.snap,true);
});
test('自定义桌型选择后更新桌子预览', () => {
  const p=page();p.addTable();p.openTable(p.controller.project().tables[0].id);p.openTableTypes();
  assert.equal(p.data.showTableTypes,true);p.chooseTableType({currentTarget:{dataset:{index:3}}});
  assert.equal(p.draftTable.type,'t');assert.equal(p.data.showTableTypes,false);
});
test('批量添加人员后自动保存', () => {
  const p = page(); p.data.names = '甲，乙'; p.addNames();
  assert.equal(p.saved.people.length, 2);
});
test('拖动桌子后桌子移动并保存，可撤回', () => {
  const p = page(); p.rect = { left: 0, top: 0 }; p.addTable();
  const t = p.controller.project().tables[0];
  const start = { clientX: p.view.x + (t.x + t.width / 2) * p.view.scale, clientY: p.view.y + (t.y + t.height / 2) * p.view.scale };
  p.touchStart({ touches: [start] });
  p.touchMove({ touches: [{ clientX: start.clientX + 40, clientY: start.clientY + 20 }] });
  p.touchEnd();
  assert.equal(p.controller.project().tables[0].x, t.x);
  assert.equal(p.saved.tables[0].x, t.x);
  assert.ok(t.x > 100);
  p.undo(); assert.ok(p.controller.project().tables[0].x < t.x);
});
test('双指缩放以中点为中心，不移动桌子', () => {
  const p = page(); p.rect = { left: 0, top: 0 }; p.addTable();
  const before = p.controller.project().tables[0].x;
  p.touchStart({ touches: [{clientX: 0, clientY: 0}, {clientX: 100, clientY: 0}] });
  p.touchMove({ touches: [{clientX: -50, clientY: 0}, {clientX: 150, clientY: 0}] });
  p.touchEnd();
  assert.equal(p.view.scale, 2);
  assert.equal(p.controller.project().tables[0].x, before);
});
test('拖动桌旁座位时整张桌子移动，座位不会脱离桌子', () => {
  const p=page();p.rect={left:0,top:0,width:500,height:500};p.addTable();
  const table=p.controller.project().tables[0],seat=require('../utils/seating/layout').seatPositions(table)[0];
  const start={clientX:p.view.x+table.x+seat.x,clientY:p.view.y+table.y+seat.y},x=table.x,y=table.y;
  p.touchStart({touches:[start]});p.touchMove({touches:[{clientX:start.clientX+30,clientY:start.clientY+20}]});p.touchEnd();
  assert.equal(table.x,x+30);assert.equal(table.y,y+20);assert.equal(table.seats[0].offsetX,undefined);
});
test('拖动桌子时实时吸附同类型桌子的中心线并显示参考线', () => {
  const p=page();p.rect={left:0,top:0,width:500,height:500};p.addTable();p.addTable();
  const [a,b]=p.controller.project().tables;b.x=a.x+300;b.y=a.y+50;
  const x=p.view.x+a.x+a.width/2,y=p.view.y+a.y+a.height/2;
  p.touchStart({touches:[{clientX:x,clientY:y}]});p.touchMove({touches:[{clientX:x+30,clientY:y+46}]});
  assert.equal(a.y,b.y);assert.ok(p.snapGuides&&p.snapGuides.y!==null);p.touchEnd();assert.equal(p.snapGuides,null);
});
test('拖动墙壁靠近场地边界时吸附并保存', () => {
  const p=page();p.rect={left:0,top:0,width:500,height:500};p.data.venueWidth='5';p.data.venueHeight='5';p.saveVenue();
  const wall=model.createObject(p.controller.project(),'wall',40,180);p.view={x:0,y:0,scale:1};
  p.touchStart({touches:[{clientX:80,clientY:185}]});p.touchMove({touches:[{clientX:43,clientY:185}]});p.touchEnd();
  assert.equal(Math.min(...wall.points.map(point=>point.x)),0);assert.equal(p.saved.objects[0].points[0].x,0);
});
test('长按人员拖动到其他座位交换，取消拖动不会改变人员', async () => {
  const p = page(); p.rect = { left: 0, top: 0 }; p.addTable();
  const project = p.controller.project(), table = project.tables[0], people = model.addPeople(project, '甲 乙');
  table.seats[0].personId = people[0].id; table.seats[1].personId = people[1].id;
  const seats = require('../utils/seating/layout').seatPositions(table);
  function pos(seat) { return { clientX: p.view.x + table.x + seat.x, clientY: p.view.y + table.y + seat.y }; }
  p.touchStart({ touches: [pos(seats[0])] });
  await new Promise(resolve => setTimeout(resolve, 480));
  p.touchMove({ touches: [pos(seats[1])] }); p.touchEnd();
  assert.deepEqual(table.seats.slice(0, 2).map(s => s.personId), [people[1].id, people[0].id]);
});
test('系统取消触摸时清除拖动状态且不打开选人窗口', () => {
  const p = page(); p.rect = { left: 0, top: 0 }; p.addTable();
  const table = p.controller.project().tables[0], s = require('../utils/seating/layout').seatPositions(table)[0];
  p.touchStart({ touches: [{ clientX: p.view.x + table.x + s.x, clientY: p.view.y + table.y + s.y }] });
  p.touchCancel();
  assert.equal(p.touch, null); assert.equal(p.data.panel, '');
});
test('减少已有人员的座位时先确认，取消后不改变', () => {
  const p = page(); p.addTable(); const table = p.controller.project().tables[0];
  const person = model.addPeople(p.controller.project(), '甲')[0]; table.seats[7].personId = person.id;
  let dialog; global.wx.showModal = o => { dialog = o; };
  p.openTable(table.id); p.data.draftSeatCount = '4'; p.saveTable();
  assert.equal(table.seats.length, 8);
  dialog.success({ confirm: false }); assert.equal(table.seats.length, 8);
  dialog.success({ confirm: true }); assert.equal(table.seats.length, 4);
  assert.equal(p.controller.project().people.length, 1);
});
test('自由绘制的一次完整笔画可作为一步撤回', () => {
  const p = page(); p.rect = { left: 0, top: 0 }; p.data.mode = 'draw';
  p.touchStart({ touches: [{ clientX: 40, clientY: 50 }] });
  p.touchMove({ touches: [{ clientX: 60, clientY: 70 }] }); p.touchEnd();
  assert.equal(p.controller.project().objects.length, 1);
  assert.equal(p.saved.objects[0].points.length, 2);
  p.undo(); assert.equal(p.controller.project().objects.length, 0);
});
test('桌子列表展示未命名桌的临时编号，不修改真实桌名', () => {
  const p = page(); p.addTable(); p.openTables();
  assert.equal(p.data.tables[0].label, '桌子 1');
  assert.equal(p.controller.project().tables[0].name, '');
});
test('搜索已入座人员时可定位所属桌子', () => {
  const p = page(); p.rect = { width: 400, height: 300 }; p.addTable();
  const t = p.controller.project().tables[0], person = model.addPeople(p.controller.project(), '李明')[0]; t.seats[0].personId = person.id;
  p.searchInput({ detail: { value: '李' } });
  assert.equal(p.data.people[0].id, person.id);
  p.locatePerson({ currentTarget: { dataset: { id: person.id } } });
  assert.equal(p.view.x + (t.x + t.width / 2) * p.view.scale, 200);
  assert.equal(p.data.highlightSeat, t.seats[0].id);
});
test('按行列批量布置时包含原桌，副本不复制人员', () => {
  const p = page(); p.addTable(); const table = p.controller.project().tables[0]; table.seats[0].personId = 'p';
  p.openTable(table.id); p.data.gridRows = 2; p.data.gridColumns = 2; p.data.gapX = 30; p.data.gapY = 20;
  p.addGrid();
  const tables = p.controller.project().tables;
  assert.equal(tables.length, 4);
  assert.ok(tables.slice(1).every(item => item.seats.every(seat => seat.personId === null)));
});
test('单独复制一桌保留形状且不复制人员', () => {
  const p=page();p.addTable();const table=p.controller.project().tables[0];table.seats[0].personId='p';p.openTable(table.id);p.copyTable();
  assert.equal(p.controller.project().tables.length,2);assert.equal(p.controller.project().tables[1].seats[0].personId,null);
});
test('未保存的桌型设置用于复制和批量预览', () => {
  const p=page();p.addTable();const table=p.controller.project().tables[0];p.openTable(table.id);
  p.tableType({detail:{value:1}});p.copyTable();assert.equal(p.controller.project().tables[1].type,'rect');
  p.openTable(table.id);p.tableType({detail:{value:3}});p.openGrid();assert.equal(table.type,'t');assert.equal(p.data.panel,'grid');
});
test('场地尺寸可选并在设置后保存', () => {
  const p = page(); p.data.venueWidth = '20'; p.data.venueHeight = '10'; p.saveVenue();
  assert.equal(p.saved.venue.widthMetres, 20);
  assert.equal(p.saved.venue.heightMetres, 10);
});
test('标定场地后桌子尺寸用米输入并按同一比例保存', () => {
  const p = page(); p.data.venueWidth = '20'; p.data.venueHeight = '10'; p.saveVenue(); p.addTable();
  const table = p.controller.project().tables[0]; p.openTable(table.id);
  assert.equal(p.data.draftWidth, '1.6');
  p.data.draftWidth = '2'; p.saveTable();
  assert.equal(table.width, 200);
});
test('进入导出前先保存项目，保存失败时不导航', () => {
  const p = page(); let url = ''; global.wx.navigateTo = o => { url = o.url; };
  p.getStore = () => ({save: () => { throw Error('full'); }});
  p.openExport(); assert.equal(url, '');
  p.getStore = () => ({save: () => {}}); p.openExport(); assert.match(url, /seating-export/);
});
test('点击桌型预览切换指定桌边，保存前不影响原桌', () => {
  const p = page(); p.addTable(); const table = p.controller.project().tables[0];
  table.type = 't'; table.width = 120; table.height = 120;
  p.openTable(table.id); p.tablePreviewView = { x: 0, y: 0, scale: 1 }; p.tablePreviewRect = { left: 0, top: 0 };
  p.tablePreviewTap({ changedTouches: [{ clientX: 60, clientY: 0 }] });
  assert.ok(!table.disabledSegments || !table.disabledSegments.length);
  assert.ok(p.draftTable.disabledSegments.includes(0));
  p.saveTable(); assert.ok(table.disabledSegments.includes(0));
});
test('桌边无效时不能部分修改座位和桌型', () => {
  const p = page(); p.addTable(); const table = p.controller.project().tables[0];
  p.openTable(table.id); p.data.draftEdges = ['top']; p.draftTable.disabledSegments = [0]; p.data.draftSeatCount = '4';
  p.saveTable(); assert.equal(table.seats.length, 8); assert.equal(table.type, 'round');
});
test('T 形桌尺寸可独立保存横板厚度和桌腿宽度', () => {
  const p = page(); p.addTable(); const table = p.controller.project().tables[0]; table.type = 't'; table.width = 120; table.height = 100;
  p.openTable(table.id);
  p.tableInput({currentTarget:{dataset:{key:'draftHead'}}, detail:{value:'20'}});
  p.tableInput({currentTarget:{dataset:{key:'draftStem'}}, detail:{value:'40'}});
  p.saveTable();
  assert.equal(table.parts.headDepth, 20); assert.equal(table.parts.stemWidth, 40);
});
test('批量桌子间距支持左右上下拖动实时调整', () => {
  const p = page(); p.addTable(); p.openTable(p.controller.project().tables[0].id); p.openGrid();
  p.gridStart({ touches: [{clientX:10,clientY:10}] });
  p.gridMove({ touches: [{clientX:30,clientY:20}] });
  assert.equal(p.data.gapX, 60); assert.equal(p.data.gapY, 50);
});
test('标定后批量间距滑条限定在 0 到 10 米', () => {
  const p=page();p.data.venueWidth='20';p.data.venueHeight='10';p.saveVenue();p.addTable();p.openTable(p.controller.project().tables[0].id);p.openGrid();
  assert.equal(p.data.gridMax,10);p.gridSlider({currentTarget:{dataset:{key:'gapX'}},detail:{value:11}});assert.equal(p.data.gapX,10);
  p.gridSlider({currentTarget:{dataset:{key:'gapY'}},detail:{value:-1}});assert.equal(p.data.gapY,0);
});
test('调整间距时预览缩放变化不会造成拖动跳跃', () => {
  const p=page();p.addTable();p.openTable(p.controller.project().tables[0].id);p.openGrid();p.gridView={scale:2};p.gridDpr=1;
  p.gridStart({touches:[{clientX:0,clientY:0}]});p.gridView={scale:4};p.gridMove({touches:[{clientX:20,clientY:0}]});
  assert.equal(p.data.gapX,50);
});
test('独立座位可拖动到任意位置并可撤回', () => {
  const p = page(); p.rect = {left:0,top:0,width:400,height:300}; p.addFreeSeat();
  const seat = p.controller.project().freeSeats[0], start = {clientX:p.view.x+seat.x,clientY:p.view.y+seat.y}, original=seat.x;
  p.touchStart({touches:[start]});p.touchMove({touches:[{clientX:start.clientX+30,clientY:start.clientY+10}]});p.touchEnd();
  assert.equal(seat.x,original+30);p.undo();assert.equal(p.controller.project().freeSeats[0].x,original);
});
test('桌子设置支持旋转并保留实际角度', () => {
  const p=page();p.addTable();const t=p.controller.project().tables[0];p.openTable(t.id);
  p.rotationInput({detail:{value:90}});p.saveTable();assert.equal(t.rotation,90);
});
test('场地元素可以拖动且与桌子分层独立保存', () => {
  const p=page();p.rect={left:0,top:0};p.addObject({currentTarget:{dataset:{kind:'wall'}}});
  const o=p.controller.project().objects[0],start={clientX:p.view.x+o.points[0].x+60,clientY:p.view.y+o.points[0].y},before=o.points[0].x;
  p.touchStart({touches:[start]});p.touchMove({touches:[{clientX:start.clientX+20,clientY:start.clientY+10}]});p.touchEnd();
  assert.equal(o.points[0].x,before+20);assert.equal(p.saved.objects[0].points[0].x,before+20);
});
test('场地文字和线条粗细可以修改并保存', () => {
  const p=page();p.addObject({currentTarget:{dataset:{kind:'stage'}}});const object=p.controller.project().objects[0];
  p.openObject(object.id);p.data.objectText='主舞台';p.data.objectWidth='5';p.saveObject();
  assert.equal(object.text,'主舞台');assert.equal(object.width,5);assert.equal(p.saved.objects[0].text,'主舞台');
});
test('拖动人员靠近画布边缘时画布缓慢移动', async () => {
  const p=page();p.rect={left:0,top:0,width:300,height:200};p.addTable();const table=p.controller.project().tables[0],person=model.addPeople(p.controller.project(),'甲')[0];table.seats[0].personId=person.id;
  const seat=require('../utils/seating/layout').seatPositions(table)[0],start={clientX:p.view.x+table.x+seat.x,clientY:p.view.y+table.y+seat.y};
  p.touchStart({touches:[start]});await new Promise(resolve=>setTimeout(resolve,480));const before=p.view.x;
  p.touchMove({touches:[{clientX:295,clientY:100}]});await new Promise(resolve=>setTimeout(resolve,100));p.touchEnd();
  assert.ok(p.view.x<before);
});
test('删除独立座位时保留名单中的人员', () => {
  const p=page();p.addFreeSeat();const seat=p.controller.project().freeSeats[0],person=model.addPeople(p.controller.project(),'甲')[0];seat.personId=person.id;p.data.selectedSeat=seat.id;
  let dialog;global.wx.showModal=o=>{dialog=o;};p.deleteFreeSeat();dialog.success({confirm:true});
  assert.equal(p.controller.project().freeSeats.length,0);assert.equal(p.controller.project().people.length,1);
});
test('删除桌子后人员回到未安排名单', () => {
  const p=page();p.addTable();const table=p.controller.project().tables[0],person=model.addPeople(p.controller.project(),'甲')[0];table.seats[0].personId=person.id;p.openTable(table.id);
  let dialog;global.wx.showModal=o=>{dialog=o;};p.deleteTable();dialog.success({confirm:true});
  assert.equal(p.controller.project().tables.length,0);assert.equal(p.controller.peopleList('甲')[0].seated,false);
});
test('桌名可统一隐藏后单独开启且保留名称', () => {
  const p=page();p.addTable();const t=p.controller.project().tables[0];t.name='主桌';
  p.namesVisibility({currentTarget:{dataset:{visible:false}}});assert.equal(t.showName,false);
  p.openTable(t.id);p.tableNameVisibility({detail:{value:true}});p.saveTable();
  assert.equal(t.showName,true);assert.equal(t.name,'主桌');
});
test('座位图可以重命名并自动保存', () => {
  const p=page();p.openRename();p.data.projectName='婚宴';p.saveName();
  assert.equal(p.saved.name,'婚宴');assert.equal(p.data.title,'婚宴');
});
test('同名人员可添加备注且只修改当前人员', () => {
  const p=page(),people=model.addPeople(p.controller.project(),'小王 小王');
  p.openPerson({currentTarget:{dataset:{id:people[1].id}}});p.data.personNote='摄影组';p.savePerson();
  assert.equal(p.controller.project().people[0].note,'');assert.equal(p.saved.people[1].note,'摄影组');
});
test('导出页返回后更新图片引用，后续编辑不会覆盖导出设置', () => {
  const p=page();p.expectExportReturn=true;
  p.getStore=()=>({load:()=>({assets:{background:'p-background-new.jpg'},exportSettings:{position:75}}),save:v=>{p.saved=JSON.parse(JSON.stringify(v));}});
  p.onShow();p.addTable();assert.equal(p.saved.assets.background,'p-background-new.jpg');assert.equal(p.saved.exportSettings.position,75);
});
test('无法读取导出页最新数据时不覆盖原项目', () => {
  const p=page();p.expectExportReturn=true;let writes=0;global.wx.showModal=()=>{};
  p.getStore=()=>({load:()=>{throw Error('disk');},save:()=>writes++});
  p.onShow();p.addTable();assert.equal(writes,0);assert.equal(p.expectExportReturn,true);
});
test('拖动桌型预览角点可调整宽高，保存前不改变原桌', () => {
  const p=page();p.addTable();const t=p.controller.project().tables[0];t.type='rect';t.height=100;p.openTable(t.id);p.drawTablePreview=()=>{};
  p.tablePreviewCanvas={width:400,height:300};p.tablePreviewRect={left:0,top:0,width:400,height:300};p.tablePreviewView={x:0,y:0,scale:1};
  p.previewResizeStart({touches:[{clientX:t.width,clientY:t.height}]});p.previewResizeMove({touches:[{clientX:t.width+20,clientY:t.height+30}]});p.previewResizeEnd();
  assert.equal(t.width,160);assert.equal(p.draftTable.width,180);assert.equal(p.draftTable.height,130);p.saveTable();assert.equal(t.width,180);
});
test('拖动场地角点调整实际场地尺寸而不缩放桌子', () => {
  const p=page();p.rect={left:0,top:0,width:400,height:300};p.data.venueWidth='2';p.data.venueHeight='1';p.saveVenue();p.addTable();
  const venue=p.controller.project().venue,table=p.controller.project().tables[0],width=table.width;
  const x=p.view.x+venue.widthMetres*venue.unitsPerMetre*p.view.scale,y=p.view.y+venue.heightMetres*venue.unitsPerMetre*p.view.scale;
  p.touchStart({touches:[{clientX:x,clientY:y}]});p.touchMove({touches:[{clientX:x+100*p.view.scale,clientY:y}]});p.touchEnd();
  assert.equal(p.controller.project().venue.widthMetres,3);assert.equal(table.width,width);
});
test('撤回重命名时页面标题与数据保持一致', () => {
  const p=page();p.openRename();p.data.projectName='婚宴';p.saveName();p.undo();
  assert.equal(p.data.title,p.controller.project().name);
});
test('点击多个拐点可创建不闭合折线，并作为一次撤回', () => {
  const p=page();p.rect={left:0,top:0,width:400,height:300};p.startPolyline();
  p.touchStart({touches:[{clientX:40,clientY:40}]});p.touchEnd();
  p.touchStart({touches:[{clientX:100,clientY:100}]});p.touchEnd();
  p.finishPolyline({currentTarget:{dataset:{closed:false}}});
  assert.equal(p.controller.project().objects[0].points.length,2);assert.equal(p.controller.project().objects[0].closed,false);
  p.undo();assert.equal(p.controller.project().objects.length,0);
});
test('场地线条可设置长度并旋转，保存后保留中心', () => {
  const p=page();p.addObject({currentTarget:{dataset:{kind:'door'}}});const o=p.controller.project().objects[0],cx=(o.points[0].x+o.points[1].x)/2;
  p.openObject(o.id);p.data.objectShapeWidth='240';p.data.objectAngle=90;p.saveObject();
  assert.ok(Math.abs(o.points[0].x-cx)<1e-8);assert.ok(Math.abs(o.points[1].x-cx)<1e-8);assert.ok(Math.abs(o.points[1].y-o.points[0].y-240)<1e-8);
});
test('场地元素的预览角点可手动拖动调整大小', () => {
  const p=page();p.addObject({currentTarget:{dataset:{kind:'stage'}}});const o=p.controller.project().objects[0];p.openObject(o.id);
  p.objectPreviewCanvas={width:400,height:300};p.objectPreviewRect={left:0,top:0,width:400,height:300};p.objectPreviewView={x:0,y:0,scale:1,left:o.points[0].x,top:o.points[0].y,right:o.points[2].x,bottom:o.points[2].y};p.drawObjectPreview=()=>{};
  p.objectResizeStart({touches:[{clientX:o.points[2].x,clientY:o.points[2].y}]});p.objectResizeMove({touches:[{clientX:o.points[2].x+40,clientY:o.points[2].y+20}]});p.objectResizeEnd();
  assert.equal(Number(p.data.objectShapeWidth),200);assert.equal(Number(p.data.objectShapeHeight),80);p.saveObject();assert.equal(o.points[1].x-o.points[0].x,200);
});
