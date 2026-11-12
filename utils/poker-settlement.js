var mahjong = require('./mahjong.js');
function priceFen(value){
  var price=String(value);if(!/^\d+(\.\d{1,2})?$/.test(price))return null;
  var parts=price.split('.'),fen=Number(parts[0])*100+Number(((parts[1]||'')+'00').slice(0,2));
  return Number.isSafeInteger(fen)&&fen>=1?fen:null;
}
function summarize(table, ledger) {
  function fail(message) { return {valid:false, message:message, players:[], transfers:[]}; }
  if (!table || !Array.isArray(table.seats)) return fail('牌桌数据不完整');
  var potTotal=0;
  for(var s=0;s<table.seats.length;s++){
    var betValue=table.seats[s].totalBet;
    if(!Number.isSafeInteger(betValue)||betValue<0||!Number.isSafeInteger(potTotal+betValue)) return fail('底池记录有误');
    potTotal+=betValue;
  }
  if(!Number.isSafeInteger(table.pot)||potTotal!==table.pot) return fail('底池与投入记录不一致');
  var fen=priceFen(table.unitPrice);
  if (fen===null) return fail('单价请设置为至少 0.01 元，且最多两位小数');
  var entries = ledger || table.seats, players=[], total=0;
  for(var i=0;i<entries.length;i++){
    var p=entries[i], seat=ledger ? table.seats.find(function(s){return s.playerId===p.id;}) : p;
    var stack=seat ? seat.stack : p.stack, bet=seat ? seat.totalBet : 0;
    if(!Number.isSafeInteger(p.buyIn)||p.buyIn<0||!Number.isSafeInteger(stack)||stack<0||!Number.isSafeInteger(bet)||bet<0) return fail('旧对局缺少完整投入记录，请开始新对局');
    var chips=stack+bet-p.buyIn,cents=chips*fen;
    if(!Number.isSafeInteger(chips)||!Number.isSafeInteger(cents)||!Number.isSafeInteger(total+cents)) return fail('金额超出可计算范围');
    var name=p.name || 'P'+(p.index+1);
    players.push({id:p.id||String(p.index),name:name,chips:chips,cents:cents,amount:mahjong.formatMoney(cents)});total+=cents;
  }
  if(total!==0) return fail('筹码记录不平衡，暂时无法计算转账');
  var names=Object.create(null),seen=Object.create(null);
  players.forEach(function(p){names[p.name]=(names[p.name]||0)+1;});
  players.forEach(function(p){if(names[p.name]>1){var name=p.name;seen[name]=(seen[name]||0)+1;p.name=name+'（'+seen[name]+'）';}});
  return {valid:true,message:'',players:players,transfers:mahjong.makeTransfers(players),provisional:table.pot>0};
}
module.exports = {summarize:summarize,priceFen:priceFen};
