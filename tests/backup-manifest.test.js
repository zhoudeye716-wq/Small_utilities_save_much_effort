const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePassword, createManifest, validateManifest } = require('../utils/backup/manifest');

test('备份密码为 6 至 18 个字符，不允许中文但允许字母数字及符号', () => {
  for (const password of ['abcdef','123456','a! Bcd','😀😀😀😀😀😀','123456789012345678']) assert.equal(validatePassword(password),true,password);
  for (const password of ['abcde','1234567890123456789','abc中文123','abc𠀀12','']) assert.equal(validatePassword(password),false,password);
});

test('备份标识和版本必须匹配，避免把其他文件当作备份', () => {
  const manifest=createManifest('2026-11-18T12:00:00.000Z',false);
  assert.equal(validateManifest(manifest),true);
  assert.equal(validateManifest({...manifest,format:'other'}),false);
  assert.equal(validateManifest({...manifest,version:99}),false);
  assert.equal(validateManifest({...manifest,encrypted:'false'}),false);
});
