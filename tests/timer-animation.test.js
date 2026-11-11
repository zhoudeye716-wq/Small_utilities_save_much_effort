const test = require('node:test');
const assert = require('node:assert/strict');
const { Bubbles } = require('../utils/timer-bubbles');

function canvas() {
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (_, name) => name === 'createRadialGradient' ? () => gradient : () => {} });
  return { getContext: () => ctx };
}

test('破裂动画按实际时间推进，高帧率不会加快动画', () => {
  function simulate(step, frames) {
    const bubbles = new Bubbles(canvas(), 375, 500, 1);
    bubbles.sparks = [{ x: 0, y: 0, vx: 1, vy: 0, life: 1 }];
    for (let i = 0; i < frames; i++) bubbles.draw('paint', i * step, step);
    return bubbles.sparks[0];
  }
  const slow = simulate(33, 3);
  const fast = simulate(11, 9);
  assert.ok(Math.abs(slow.x - fast.x) < 0.001);
  assert.ok(Math.abs(slow.life - fast.life) < 0.001);
});

test('不同帧率下相同时间的泡泡移动距离接近', () => {
  function position(step) {
    const bubbles = new Bubbles(canvas(), 375, 1200, 1);
    bubbles.sync([{ id: 'a', name: 'a', remaining: 300 }]);
    bubbles.nodes.a.body.position.y = 800;
    bubbles.nodes.a.body.positionPrev.y = 800;
    bubbles.setGravity(0, -1);
    for (let now = 0; now < 990; now += step) bubbles.draw('paint', now, step);
    return bubbles.nodes.a.body.position.y;
  }
  assert.ok(Math.abs(position(33) - position(11)) < 1);
});

test('泡泡渲染跟随画布刷新并在离开页面时停止', () => {
  let config, callback, cancelled;
  global.Page = value => { config = value; };
  global.wx = { setStorageSync() {} };
  delete require.cache[require.resolve('../pages/timer/index.js')];
  require('../pages/timer/index.js');
  const node = {
    requestAnimationFrame(fn) { callback = fn; return 7; },
    cancelAnimationFrame(id) { cancelled = id; }
  };
  const deltas = [];
  const page = Object.assign({}, config, {
    visible: true, data: { mode: 'multi', theme: 'paint' }, items: [], accel: {x:0,y:-1},
    bubbles: { canvas: node, sync() {}, setGravity() {}, draw(theme, now, delta) { deltas.push(delta); } },
    persist() {}
  });
  const realNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    page.drawFrame();
    assert.equal(typeof callback, 'function');
    now += 11;
    callback();
    assert.equal(deltas[1], 11);
    const oldCallback = callback;
    page.stopPage();
    assert.equal(cancelled, 7);
    page.visible = true;
    oldCallback();
    assert.equal(deltas.length, 2, '失效的旧回调不能启动第二个渲染循环');
  } finally {
    page.stopPage(); Date.now = realNow; delete global.wx; delete global.Page;
  }
});
