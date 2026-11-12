var engine=require('../offline-table.js');
var settlement=require('../poker-settlement.js');
function clone(value){return JSON.parse(JSON.stringify(value));}
function create(input){
  if(!input||!input.roomId||!input.hostId||!input.settings)throw Error('房间参数不完整');
  var c=input.settings,s=Number(c.smallBlind),b=Number(c.bigBlind),chips=Number(c.totalChips),price=Number(c.unitPrice);
  if(!Number.isSafeInteger(s)||s<1||!Number.isSafeInteger(b)||b<s||!Number.isSafeInteger(chips)||chips<1||!Number.isSafeInteger(chips*9)||settlement.priceFen(c.unitPrice)===null)throw Error('设置有误：单价至少 0.01 元且最多两位小数');
  return {roomId:String(input.roomId),name:String(input.name||'房间').slice(0,32),hostId:String(input.hostId),settings:{smallBlind:s,bigBlind:b,totalChips:chips,unitPrice:price},players:[{id:String(input.hostId),name:String(input.hostName||'房主').slice(0,24),seat:0,stack:chips,buyIn:chips,status:'seated'}],table:null};
}
function join(state,id,name){
  if(!state||!id||typeof id!=='string'||id.length>64||!name||typeof name!=='string'||name.length>24)return {error:'昵称或身份无效'};
  var next=clone(state), player=next.players.find(function(p){return p.id===id;});
  if(player){
    var returning=player.status==='left';
    player.name=name;
    if(returning&&player.seat===null&&Number.isInteger(player.priorSeat)&&!next.players.some(function(p){return p.id!==id&&p.seat===player.priorSeat;}))player.seat=player.priorSeat;
    player.status=player.seat===null||returning&&next.table?'waiting':'seated';
  }
  else next.players.push({id:id,name:name,seat:null,stack:next.settings.totalChips,buyIn:next.settings.totalChips,status:'waiting'});
  return {state:next};
}
function chooseSeat(state,id,seat){
  var next=clone(state),player=next.players.find(function(p){return p.id===id;});
  if(!player||!Number.isInteger(seat)||seat<0||seat>8)return {error:'无效的座位'};
  if(next.table&&next.table.seats.some(function(s){return s.playerId===id;}))return {error:'本小局中不能更换座位'};
  if(next.players.some(function(p){return p.id!==id&&p.seat===seat;}))return {error:'座位已被占用'};
  player.seat=seat;player.status=next.table?'waiting':'seated';return {state:next};
}
function start(state,id){
  var next=clone(state);if(id!==next.hostId)return {error:'只有房主可以开始'};
  if(next.table)return {error:'牌局已经开始'};
  var seated=next.players.filter(function(p){return p.seat!==null;}).sort(function(a,b){return a.seat-b.seat;});
  if(seated.length<2||seated.length>9)return {error:'请选择 2 至 9 位玩家'};
  var table=engine.createTable(Object.assign({},next.settings,{players:seated.length}));
  table.seats.forEach(function(seat,index){seat.playerId=seated[index].id;seat.name=seated[index].name;seat.slot=seated[index].seat;});
  next.table=table;return {state:next};
}
function reconcile(state){
  var next=clone(state),table=next.table;if(!table)return next;
  var seated=next.players.filter(function(p){return p.seat!==null&&p.status!=='left';}).sort(function(a,b){return a.seat-b.seat;});
  var oldIds=table.seats.map(function(s){return s.playerId;});
  if(seated.length===oldIds.length&&seated.every(function(p,i){return p.id===oldIds[i];})){seated.forEach(function(p){p.status='seated';});return next;}
  table.seats.forEach(function(s){var p=next.players.find(function(x){return x.id===s.playerId;});if(p){p.stack=s.stack+s.totalBet;p.buyIn=s.buyIn;}});
  var dealer=table.seats[table.dealerSeat],dealerId=dealer&&dealer.playerId,oldSlot=dealer&&dealer.slot||0;
  var seats=seated.map(function(p,i){p.status='seated';return {index:i,playerId:p.id,name:p.name,slot:p.seat,stack:p.stack,buyIn:p.buyIn,folded:false,acted:false,streetBet:0,totalBet:0};});
  var dealerIndex=seated.findIndex(function(p){return p.id===dealerId;});
  if(dealerIndex<0){dealerIndex=seated.findIndex(function(p){return p.seat>oldSlot;});if(dealerIndex<0)dealerIndex=0;}
  var base=Object.assign({},table,{seats:seats,players:seats.length,dealerSeat:dealerIndex,pot:0,currentBet:0});
  if(seats.length<2){base.stage='waiting';base.message='等待至少两位玩家入座';next.table=base;return next;}
  next.table=engine.startNewHand(base,{keepHandNumber:true});return next;
}
module.exports={create:create,join:join,chooseSeat:chooseSeat,start:start,reconcile:reconcile};
