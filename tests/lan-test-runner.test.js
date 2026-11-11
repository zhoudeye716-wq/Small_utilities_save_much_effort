const test = require('node:test');
const assert = require('node:assert/strict');
const Runner = require('../utils/lan-test/runner');

function fakeClock() {
  let now = 0, next = 0, jobs = [];
  return {
    now: () => now,
    setTimeout(fn, delay) { const id = ++next; jobs.push({ id, at: now + delay, fn }); return id; },
    clearTimeout(id) { jobs = jobs.filter(job => job.id !== id); },
    advance(ms) {
      const until = now + ms;
      while (true) {
        jobs.sort((a, b) => a.at - b.at || a.id - b.id);
        if (!jobs.length || jobs[0].at > until) break;
        const job = jobs.shift(); now = job.at; job.fn();
      }
      now = until;
    }
  };
}

test('延迟测试结束后接收端也正常完成，不产生假中断', () => {
  const clock = fakeClock(), resultsA = [], resultsB = [];
  let a, b;
  a = new Runner({ clock, send: (_, p) => { b.receive(p, { id: 'a' }); return true; }, onResult: r => resultsA.push(r) });
  b = new Runner({ clock, send: (_, p) => { a.receive(p, { id: 'b' }); return true; }, onResult: r => resultsB.push(r) });
  assert.equal(a.start('b', 'latency'), true);
  clock.advance(45000);
  assert.equal(resultsA.length, 1);
  assert.equal(resultsA[0].result.state, 'complete');
  assert.equal(resultsB.length, 1);
  assert.equal(resultsB[0].result.state, 'complete');
});

test('连续测试报告去重与丢包，并且无确认时有超时', () => {
  const clock = fakeClock(), results = [];
  let a, b;
  a = new Runner({ clock, send: (_, p) => {
    if (p.type === 'test_data' && p.seq === 3) return true;
    b.receive(p, { id: 'a' });
    if (p.type === 'test_data' && p.seq === 2) b.receive(p, { id: 'a' });
    return true;
  }, onResult: r => results.push(r) });
  b = new Runner({ clock, send: (_, p) => { a.receive(p, { id: 'b' }); return true; } });
  a.start('b', 'series');
  clock.advance(12000);
  assert.equal(results[0].result.unique, 99);
  assert.equal(results[0].result.duplicate, 1);
  const failures = [];
  const offline = new Runner({ clock, send: () => true, onResult: r => failures.push(r) });
  offline.start('missing', 'series');
  clock.advance(6000);
  assert.equal(failures[0].result.state, 'failed');
});

test('结束包先于数据包到达时，宽限期内仍计入数据；设备忙时拒绝重叠测试', () => {
  const clock = fakeClock(), sent = [], results = [];
  const receiver = new Runner({ clock, send: (_, p) => { sent.push(p); return true; }, onResult: r => results.push(r) });
  receiver.receive({ type: 'test_start', run: 'one', kind: 'series', count: 100 }, { id: 'a' });
  receiver.receive({ type: 'test_end', run: 'one', sent: 1 }, { id: 'a' });
  receiver.receive({ type: 'test_data', run: 'one', seq: 0, payload: 'x' }, { id: 'a' });
  receiver.receive({ type: 'test_start', run: 'two', kind: 'speed', count: 250 }, { id: 'b' });
  assert.equal(sent.some(p => p.type === 'test_busy' && p.run === 'two'), true);
  assert.equal(receiver.start('b', 'speed'), false);
  clock.advance(800);
  assert.equal(results[0].result.unique, 1);
  assert.equal(results[0].result.missing, 0);
});
