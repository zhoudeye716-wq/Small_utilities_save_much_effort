var test=require('node:test'),assert=require('node:assert/strict');
var p=require('../utils/lan-poker/protocol.js');
test('大型中文快照分片乱序及重复接收后只能完整组装一次',function(){
 var snapshot={roomId:'abc',revision:15,state:{names:Array.from({length:100},function(_,i){return '玩家😀'+i;})}};
 var pieces=p.fragment(snapshot,'message1');assert.ok(pieces.length>1);
 pieces.forEach(function(x){assert.ok(p.encode(x).byteLength<1200);});
 var receiver=p.createAssembler();var result=null;
 pieces.slice().reverse().forEach(function(x){var value=receiver.accept(x);if(value)result=value;});
 assert.deepEqual(result,snapshot);assert.equal(receiver.accept(pieces[0]),null);
});
test('损坏数据、错误版本和超长报文被拒绝',function(){
 assert.equal(p.decode(new Uint8Array([123]).buffer),null);
 assert.throws(function(){p.encode({type:'state',room:'x',content:'x'.repeat(2000)});});
 assert.equal(p.decode(p.encode({type:'probe',room:'x'})).type,'probe');
});
test('最长房间与发送者标识不会令快照分片超过单包限制',function(){
 var parts=p.fragment({roomId:'r'.repeat(64),state:{value:'x'.repeat(2000)}},'m'.repeat(64));
 parts.forEach(function(part){assert.ok(p.encode(Object.assign({},part,{sender:'s'.repeat(64)})).byteLength<1200);});
});
