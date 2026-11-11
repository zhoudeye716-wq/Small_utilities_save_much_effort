const test = require('node:test');
const assert = require('node:assert/strict');

test('泡泡倾斜方向反转，力度随倾斜大小变化，平放时逐渐归零', () => {
  let config, handler;
  global.Page = value => { config = value; };
  global.wx = {
    getStorageSync: () => ({}), setStorageSync() {},
    onAccelerometerChange: cb => { handler = cb; },
    startAccelerometer() {}, stopAccelerometer() {}, offAccelerometerChange() {},
    getSystemInfoSync: () => ({ windowWidth: 375 })
  };
  require('../pages/timer/index.js');
  const page = Object.assign({}, config, {data: JSON.parse(JSON.stringify(config.data))});
  page.setData = values => Object.assign(page.data, values);
  page.tick = () => {};
  page.data.mode = 'board';
  try {
    page.onLoad(); page.onShow();
    page.accel = {x:0,y:0};
    handler({x:0.5,y:0.25});
    assert.ok(Math.abs(page.accel.x + 0.1) < 1e-9);
    assert.ok(Math.abs(page.accel.y - 0.05) < 1e-9);
    const prev = page.accel.y;
    handler({x:0,y:0});
    assert.ok(page.accel.y < prev && page.accel.y > 0);
    page.accel = {x:0,y:0};
    handler({x:0,y:-1});
    assert.ok(page.accel.y < 0);
  } finally { page.onHide(); delete global.wx; delete global.Page; }
});
