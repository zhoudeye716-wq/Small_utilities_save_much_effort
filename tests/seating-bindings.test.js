'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('座位图页面的交互事件都对应已实现的方法', () => {
  const root = path.resolve(__dirname, '..');
  for (const name of ['seating-list', 'seating-editor', 'seating-export']) {
    let page;
    global.Page = definition => { page = definition; };
    const js = path.join(root, 'pages', name, 'index.js');
    delete require.cache[require.resolve(js)];
    require(js);
    const wxml = fs.readFileSync(path.join(root, 'pages', name, 'index.wxml'), 'utf8');
    const bindings = [...wxml.matchAll(/(?:bind|catch)(?:tap|change|changing|input|focus|touchstart|touchmove|touchend|touchcancel)="([^"]+)"/g)];
    for (const [, handler] of bindings) assert.equal(typeof page[handler], 'function', name + ': ' + handler);
  }
});
