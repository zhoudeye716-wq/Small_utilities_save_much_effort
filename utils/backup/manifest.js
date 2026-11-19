'use strict';

var FORMAT='small-utilities-backup';
var VERSION=1;
function isChinese(code) {
  return (code>=0x3400&&code<=0x9fff)||(code>=0xf900&&code<=0xfaff)||
    (code>=0x20000&&code<=0x2fa1f)||(code>=0x30000&&code<=0x323af);
}
function validatePassword(password) {
  if (typeof password!=='string') return false;
  var chars=Array.from(password);
  return chars.length>=6 && chars.length<=18 && !chars.some(function(char){return isChinese(char.codePointAt(0));});
}
function createManifest(createdAt,encrypted) {
  if (typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt))||typeof encrypted!=='boolean') throw new Error('备份信息无效');
  return {format:FORMAT,version:VERSION,createdAt:createdAt,encrypted:encrypted};
}
function validateManifest(value) {
  return !!value && value.format===FORMAT && value.version===VERSION && typeof value.createdAt==='string' &&
    Number.isFinite(Date.parse(value.createdAt)) && typeof value.encrypted==='boolean';
}
module.exports={validatePassword:validatePassword,createManifest:createManifest,validateManifest:validateManifest};
