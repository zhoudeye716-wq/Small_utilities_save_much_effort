'use strict';
function pad(n){return n<10?'0'+n:String(n);}
function create(d){return '小工具省更多_备份_'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds())+'_'+d.getTime()+'.zip';}
function valid(n){return typeof n==='string'&&/^小工具省更多_备份_[0-9]{8}_[0-9]{6}_[0-9]+\.zip$/.test(n);}
module.exports={create:create,valid:valid};
