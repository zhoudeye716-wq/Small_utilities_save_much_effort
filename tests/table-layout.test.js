var test = require('node:test');
var assert = require('node:assert/strict');
test('联机视角自己总在正下方，所有座位文字不旋转', function () {
  var layout = require('../utils/table-layout.js');
  for (var n = 2; n <= 9; n++) for (var viewer = 0; viewer < n; viewer++) {
    var points = layout.seatPointsForViewer(n, 800, 320, viewer);
    assert.equal(points[viewer].left, 50);
    assert.equal(points[viewer].top, 87);
    assert.ok(points.every(function (p) { return p.rotation === 0; }));
  }
});
var fs = require('node:fs');
var path = require('node:path');
var file = path.join(__dirname, '../utils/table-layout.js');

test('六人座位文字朝向各自外侧，并随牌桌宽高变化', function () {
  assert.ok(fs.existsSync(file), '需要根据实际牌桌几何计算座位朝向');
  var layout = require(file);
  var wide = layout.seatPoints(6, 800, 300);
  var square = layout.seatPoints(6, 400, 400);
  assert.equal(wide.length, 6);
  assert.equal(Math.abs(wide[0].rotation), 180);
  assert.equal(wide[3].rotation, 0);
  assert.ok(wide[1].rotation < -90 && wide[1].rotation > -180);
  assert.ok(wide[2].rotation < 0 && wide[2].rotation > -90);
  assert.ok(wide[4].rotation > 0 && wide[4].rotation < 90);
  assert.ok(wide[5].rotation > 90 && wide[5].rotation < 180);
  assert.notEqual(wide[1].rotation, square[1].rotation);
});

test('2 至 9 人的座位和朝向均为有限值', function () {
  assert.ok(fs.existsSync(file), '需要座位布局模块');
  var layout = require(file);
  for (var count = 2; count <= 9; count += 1) {
    var seats = layout.seatPoints(count, 800, 300);
    assert.equal(seats.length, count);
    seats.forEach(function (seat) {
      assert.ok(Number.isFinite(seat.rotation));
      assert.ok(seat.left >= 0 && seat.left <= 100 && seat.top >= 0 && seat.top <= 100);
    });
  }
});

test('iPad 九人座位不遮挡中央控制区', function () {
  var seats = require(file).seatPoints(9, 800, 580);
  seats.forEach(function (seat) {
    var angle = seat.rotation * Math.PI / 180;
    var halfWidth = (102 * Math.abs(Math.cos(angle)) + 76 * Math.abs(Math.sin(angle))) / 2;
    var halfHeight = (102 * Math.abs(Math.sin(angle)) + 76 * Math.abs(Math.cos(angle))) / 2;
    var x = seat.left * 8, y = seat.top * 5.8;
    var overlaps = x + halfWidth > 204 && x - halfWidth < 596 && y + halfHeight > 145 && y - halfHeight < 435;
    assert.equal(overlaps, false, '座位不应挡住中央操作区：' + JSON.stringify(seat));
  });
});
