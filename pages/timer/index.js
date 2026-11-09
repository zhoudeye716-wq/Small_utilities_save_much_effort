var drawing = require('../../utils/timer-bubbles.js');
var STORE = 'universal-timer-v1';
var STYLES = [
  {id:'paint',name:'油画厚涂'},{id:'sketch',name:'纸上手绘'},{id:'film',name:'复古胶片'},
  {id:'water',name:'水彩晕染'},{id:'ink',name:'国风水墨'},{id:'pixel',name:'像素游戏'},
  {id:'deco',name:'装饰艺术'},{id:'cyber',name:'霓虹赛博'},{id:'paper',name:'折纸拼贴'},{id:'glass',name:'通透玻璃'}
];
function defaultBoard(){return {duration:60,left:60,end:0,running:false,fired:false};}
function defaultChess(){return {duration:300,left:[300,300],end:0,running:-1,last:-1,fired:false};}
function remaining(t,now){return t.paused?t.left:Math.max(0,(t.end-now)/1000);}
function makeId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
function timeInput(seconds){return {name:'',minutes:String(Math.floor(seconds/60)),seconds:String(seconds%60)};}

Page({
  data:{
    mode:'multi',theme:'ink',styles:STYLES,dialog:null,draft:{name:'',minutes:'5',seconds:'0'},
    quickDurations:[300,600,900],quickDraft:['5','10','15'],paused:[],list:[],activeCount:0,canvasHeight:500,iceHeight:0,canvasError:false,
    board:{display:'01:00',running:false},chess:{displayA:'05:00',displayB:'05:00',running:-1,status:'点击走完的一方，开始对手计时'},
    alert:null,alertQueue:0
  },
  onLoad:function(){
    var saved;
    try{saved=wx.getStorageSync(STORE)||{};}catch(e){saved={};}
    this.items=Array.isArray(saved.items)?saved.items.filter(function(x){return x && x.id && typeof x.name==='string';}):[];
    this.boardState=Object.assign(defaultBoard(),saved.board||{});
    this.chessState=Object.assign(defaultChess(),saved.chess||{});
    if(!Array.isArray(this.chessState.left)||this.chessState.left.length!==2)this.chessState=defaultChess();
    this.pending=Array.isArray(saved.pending)?saved.pending.filter(function(x){return x&&x.id&&x.at;}):[];
    var theme=STYLES.some(function(s){return s.id===saved.theme;})?saved.theme:'ink';
    var quick=Array.isArray(saved.quick)&&saved.quick.length===3?saved.quick:[300,600,900];
    this.setData({theme:theme,quickDurations:quick});
    this.accel={x:0,y:-1};this.visible=false;this.lastPaint=0;this.lastBeepSecond=null;this.lastAlertSound=0;this.lastVibration=0;
  },
  onReady:function(){this.prepareCanvas();},
  onShow:function(){
    var page=this;this.visible=true;
    if(wx.setKeepScreenOn)wx.setKeepScreenOn({keepScreenOn:true});
    if(wx.createInnerAudioContext){this.audio=wx.createInnerAudioContext();this.audio.src='/assets/timer-alert.wav';this.audio.obeyMuteSwitch=false;}
    if(wx.onAccelerometerChange){
      this.accelHandler=function(v){
        var x=Number(v.x)||0,y=Number(v.y)||0,mag=Math.sqrt(x*x+y*y);
        if(mag>.2){page.accel.x=page.accel.x*.8+x/mag*.2;page.accel.y=page.accel.y*.8-y/mag*.2;}
      };
      wx.onAccelerometerChange(this.accelHandler);
      if(wx.startAccelerometer)wx.startAccelerometer({interval:'game',fail:function(){}});
    }
    this.timer=setInterval(function(){page.tick();},250);this.tick();
    if(this.data.mode==='multi')setTimeout(function(){if(page.visible)page.prepareCanvas();},100);
  },
  onHide:function(){this.stopPage();},
  onUnload:function(){this.stopPage();},
  onResize:function(){var info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();this.windowWidth=info.windowWidth;this.lastSignature='';this.tick();if(this.visible&&this.data.mode==='multi')this.prepareCanvas();},
  stopPage:function(){
    this.visible=false;clearInterval(this.timer);clearTimeout(this.frameTimer);this.timer=null;this.frameTimer=null;
    if(this.audio){this.audio.stop();this.audio.destroy();this.audio=null;}
    if(this.accelHandler&&wx.offAccelerometerChange)wx.offAccelerometerChange(this.accelHandler);
    if(this.accelHandler&&wx.stopAccelerometer)wx.stopAccelerometer();this.accelHandler=null;
    if(wx.setKeepScreenOn)wx.setKeepScreenOn({keepScreenOn:false});this.persist();
  },
  persist:function(){
    try{wx.setStorageSync(STORE,{items:this.items,board:this.boardState,chess:this.chessState,pending:this.pending,theme:this.data.theme,quick:this.data.quickDurations});}
    catch(e){if(!this.storageWarned){this.storageWarned=true;wx.showToast({title:'本机保存失败',icon:'none'});}}
  },
  playTone:function(){if(!this.visible||!this.audio)return;try{this.audio.stop();this.audio.play();}catch(e){}},
  queue:function(id,name,at,kind){
    if(!this.pending.some(function(q){return q.id===id;}))this.pending.push({id:id,name:name,at:at,kind:kind,reveal:Date.now()+500});
  },
  tick:function(){
    if(!this.visible||!this.items)return;
    var now=Date.now(),page=this,b=this.boardState,c=this.chessState,changed=false;
    this.items.forEach(function(t){if(!t.paused&&!t.due&&t.end<=now){if(page.bubbles)page.bubbles.burst(t.id);t.due=true;page.queue(t.id,t.name,t.end,'multi');changed=true;}});
    if(b.running&&b.end<=now){b.running=false;b.left=0;if(!b.fired){b.fired=true;this.queue('board','桌游计时',b.end,'board');changed=true;}}
    if(c.running>=0&&c.end<=now){var player=c.running;c.left[player]=0;c.running=-1;if(!c.fired){c.fired=true;this.queue('chess','玩家 '+(player===0?'A':'B'),c.end,'chess');changed=true;}}
    this.pending.sort(function(a,z){return a.at-z.at;});
    var active=this.items.filter(function(t){return !t.paused&&!t.due;});
    var bleft=b.running?Math.max(0,(b.end-now)/1000):b.left;
    var clocks=c.left.slice();if(c.running>=0)clocks[c.running]=Math.max(0,(c.end-now)/1000);
    var screenWidth=this.windowWidth||(wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync()).windowWidth||375;
    var paused=this.items.filter(function(t){return t.paused&&!t.due;}).map(function(t){return {id:t.id,name:t.name,display:drawing.format(t.left),size:Math.ceil(drawing.radius(t.left,screenWidth)*2)};});
    var iceHeight=paused.length?Math.max.apply(null,paused.map(function(t){return t.size;}))+12:0;
    var list=this.items.filter(function(t){return !t.due;}).map(function(t){var left=remaining(t,now);return {id:t.id,name:t.name,paused:t.paused,display:drawing.format(left),remaining:left};}).sort(function(a,z){return a.remaining-z.remaining;}).map(function(t){return {id:t.id,name:t.name,paused:t.paused,display:t.display};});
    var first=this.pending[0],alert=first&&now>=(first.reveal||0)?{name:first.name,over:Math.max(0,Math.floor((now-first.at)/1000))}:null;
    var urgency=Math.max(0,Math.min(1,1-Math.ceil(bleft)/b.duration));
    var red=Math.round(76+142*urgency),green=Math.round(169-94*urgency),blue=Math.round(111-45*urgency);
    var boardBackground='background: radial-gradient(ellipse at center, rgba('+red+','+green+','+blue+',.22), transparent 72%);';
    var snapshot={activeCount:active.length,paused:paused,iceHeight:iceHeight,list:list,board:{display:drawing.format(bleft),running:b.running,seconds:Math.ceil(bleft),urgent:b.running&&bleft<=9,background:boardBackground},
      chess:{displayA:drawing.format(clocks[0]),displayB:drawing.format(clocks[1]),running:c.running,status:c.fired?'本局计时结束':c.running<0?'点击走完的一方，开始对手计时':'当前计时的一方点击后切换'},
      alert:alert,alertQueue:this.pending.length};
    var signature=JSON.stringify(snapshot);if(signature!==this.lastSignature){this.lastSignature=signature;this.setData(snapshot);}
    if(alert){
      if(now-this.lastAlertSound>=1400){this.playTone();this.lastAlertSound=now;}
      if(now-this.lastVibration>=2800){if(wx.vibrateShort)wx.vibrateShort({type:'medium',fail:function(){}});this.lastVibration=now;}
    }else if(b.running&&bleft>0&&bleft<=9){
      var second=Math.ceil(bleft);if(second!==this.lastBeepSecond){this.lastBeepSecond=second;this.playTone();}
    }
    if(changed)this.persist();
  },
  switchMode:function(event){
    var page=this,mode=event.currentTarget.dataset.mode;if(mode===this.data.mode)return;
    clearTimeout(this.frameTimer);this.bubbles=null;this.setData({mode:mode,dialog:null},function(){if(mode==='multi')page.prepareCanvas();});
  },
  prepareCanvas:function(){
    if(!this.visible||this.data.mode!=='multi')return;
    var page=this,revision=(this.canvasRevision||0)+1;this.canvasRevision=revision;clearTimeout(this.frameTimer);
    wx.createSelectorQuery().in(this).select('#bubble-viewport').boundingClientRect(function(rect){
      if(!rect||page.canvasRevision!==revision||!page.visible||page.data.mode!=='multi')return;
      page.viewportRect=rect;
      var count=page.items.filter(function(t){return !t.paused&&!t.due;}).length;
      var height=Math.max(Math.ceil(rect.height),Math.ceil(count/3)*130+120);
      page.setData({canvasHeight:height},function(){
        wx.createSelectorQuery().in(page).select('#bubble-canvas').fields({node:true,size:true}).exec(function(result){
          if(page.canvasRevision!==revision||!page.visible||page.data.mode!=='multi')return;
          var node=result&&result[0]&&result[0].node;if(!node){page.setData({canvasError:true});return;}
          var info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
          try{page.bubbles=new drawing.Bubbles(node,rect.width,height,Math.min(info.pixelRatio||1,2));page.setData({canvasError:false});page.drawFrame();}
          catch(e){page.bubbles=null;page.setData({canvasError:true});}
        });
      });
    }).exec();
  },
  drawFrame:function(){
    if(!this.visible||this.data.mode!=='multi'||!this.bubbles)return;
    var now=Date.now(),active=this.items.filter(function(t){return !t.paused&&!t.due;}).map(function(t){return {id:t.id,name:t.name,remaining:remaining(t,now)};}).sort(function(a,b){return a.remaining-b.remaining;});
    this.bubbles.sync(active);this.bubbles.setGravity(this.accel.x,this.accel.y);this.bubbles.draw(this.data.theme,now);
    var page=this;this.frameTimer=setTimeout(function(){page.drawFrame();},33);
  },
  onBubbleScroll:function(event){this.bubbleScrollTop=event.detail.scrollTop||0;},
  bubbleTouchStart:function(event){var t=event.touches&&event.touches[0],rect=this.viewportRect;if(t&&rect)this.touch={x:t.clientX-rect.left,y:t.clientY-rect.top+(this.bubbleScrollTop||0),clientX:t.clientX,clientY:t.clientY};},
  bubbleTouchEnd:function(event){
    var t=event.changedTouches&&event.changedTouches[0],start=this.touch;this.touch=null;if(!t||!start||!this.bubbles)return;
    if(Math.hypot((t.clientX||0)-(start.clientX||0),(t.clientY||0)-(start.clientY||0))>8)return;
    var id=this.bubbles.hit(start.x,start.y);if(id)this.pauseById(id);
  },
  pauseById:function(id){var item=this.items.find(function(t){return t.id===id;});if(!item||item.paused||item.due)return;item.left=remaining(item,Date.now());item.paused=true;this.tick();this.persist();this.prepareCanvas();},
  resumeById:function(id){var item=this.items.find(function(t){return t.id===id;});if(!item||!item.paused||item.due)return;item.paused=false;item.end=Date.now()+item.left*1000;this.tick();this.persist();this.prepareCanvas();},
  resumeTimer:function(event){this.resumeById(event.currentTarget.dataset.id);},
  toggleTimer:function(event){var id=event.currentTarget.dataset.id,t=this.items.find(function(x){return x.id===id;});if(t){if(t.paused)this.resumeById(id);else this.pauseById(id);}},
  deleteTimer:function(event){var page=this,id=event.currentTarget.dataset.id;wx.showModal({title:'删除计时',content:'确定删除这个计时吗？',success:function(r){if(!r.confirm)return;page.items=page.items.filter(function(t){return t.id!==id;});page.tick();page.persist();page.prepareCanvas();}});},
  openTimerList:function(){this.setData({dialog:{kind:'list',title:'管理计时'}});},
  openStyles:function(){this.setData({dialog:{kind:'styles',title:'选择美术风格'}});},
  chooseStyle:function(event){this.setData({theme:event.currentTarget.dataset.theme,dialog:null});this.persist();},
  openAdd:function(){this.setData({dialog:{kind:'add',title:'添加计时'},draft:timeInput(this.data.quickDurations[0])});},
  openQuickSettings:function(){this.setData({dialog:{kind:'quick',title:'快捷时长'},quickDraft:this.data.quickDurations.map(function(n){return String(n/60);})});},
  inputName:function(event){this.setData({'draft.name':event.detail.value});},
  inputMinutes:function(event){this.setData({'draft.minutes':event.detail.value});},
  inputSeconds:function(event){this.setData({'draft.seconds':event.detail.value});},
  inputQuick:function(event){var a=this.data.quickDraft.slice();a[Number(event.currentTarget.dataset.index)]=event.detail.value;this.setData({quickDraft:a});},
  selectQuick:function(event){var d=timeInput(Number(event.currentTarget.dataset.seconds));d.name=this.data.draft.name;this.setData({draft:d});},
  durationValue:function(){var m=Number(this.data.draft.minutes)||0,s=Number(this.data.draft.seconds)||0;if(m<0||s<0||s>=60||m>1440||!Number.isInteger(m)||!Number.isInteger(s)||m*60+s<=0){wx.showToast({title:'请输入有效时长，秒数为 0–59',icon:'none'});return 0;}return m*60+s;},
  saveQuick:function(){var quick=this.data.quickDraft.map(Number);if(quick.some(function(n){return !Number.isInteger(n)||n<1||n>1440;}))return wx.showToast({title:'请输入 1–1440 的分钟数',icon:'none'});this.setData({quickDurations:quick.map(function(n){return n*60;})});this.persist();this.openAdd();},
  addTimer:function(){var duration=this.durationValue();if(!duration)return;var name=String(this.data.draft.name||'').trim()||'计时 '+(this.items.length+1);this.items.push({id:makeId(),name:name,left:duration,end:Date.now()+duration*1000,paused:false,due:false});this.setData({dialog:null});this.tick();this.persist();this.prepareCanvas();},
  closeDialog:function(){this.setData({dialog:null});},stopTap:function(){},
  configureBoard:function(){this.setData({dialog:{kind:'board',title:'桌游计时设置'},draft:timeInput(this.boardState.duration)});},
  configureChess:function(){this.setData({dialog:{kind:'chess',title:'对战计时设置'},draft:timeInput(this.chessState.duration)});},
  saveDuration:function(){
    var duration=this.durationValue();if(!duration)return;var kind=this.data.dialog.kind;
    if(kind==='board'){this.boardState={duration:duration,left:duration,end:0,running:false,fired:false};}
    else{this.chessState={duration:duration,left:[duration,duration],end:0,running:-1,last:-1,fired:false};}
    this.pending=this.pending.filter(function(a){return a.kind!==kind;});this.setData({dialog:null});this.tick();this.persist();
  },
  resetBoard:function(){var b=this.boardState;b.left=b.duration;b.end=Date.now()+b.duration*1000;b.running=true;b.fired=false;this.lastBeepSecond=null;this.pending=this.pending.filter(function(a){return a.kind!=='board';});this.tick();this.persist();},
  resetBoardPaused:function(){var b=this.boardState;b.left=b.duration;b.end=0;b.running=false;b.fired=false;this.pending=this.pending.filter(function(a){return a.kind!=='board';});this.tick();this.persist();},
  toggleBoard:function(){var b=this.boardState;if(b.running){b.left=Math.max(0,(b.end-Date.now())/1000);b.running=false;}else{if(b.left<=0)b.left=b.duration;b.end=Date.now()+b.left*1000;b.running=true;b.fired=false;}this.tick();this.persist();},
  playChess:function(event){var c=this.chessState,side=Number(event.currentTarget.dataset.side);if(c.fired)return;
    if(c.running<0){c.running=1-side;c.last=c.running;c.end=Date.now()+c.left[c.running]*1000;}
    else if(c.running===side){c.left[side]=Math.max(0,(c.end-Date.now())/1000);c.running=1-side;c.last=c.running;c.end=Date.now()+c.left[c.running]*1000;}
    this.tick();this.persist();
  },
  toggleChess:function(){var c=this.chessState;if(c.fired)return;if(c.running>=0){c.left[c.running]=Math.max(0,(c.end-Date.now())/1000);c.last=c.running;c.running=-1;}else if(c.last>=0){c.running=c.last;c.end=Date.now()+c.left[c.running]*1000;}else return wx.showToast({title:'点击走完的一方开始',icon:'none'});this.tick();this.persist();},
  resetChess:function(){var d=this.chessState.duration;this.chessState={duration:d,left:[d,d],end:0,running:-1,last:-1,fired:false};this.pending=this.pending.filter(function(a){return a.kind!=='chess';});this.tick();this.persist();},
  dismissAlert:function(){var alert=this.pending.shift();if(!alert)return;if(alert.kind==='multi')this.items=this.items.filter(function(t){return t.id!==alert.id;});this.lastAlertSound=0;this.lastVibration=0;this.tick();this.persist();if(this.data.mode==='multi')this.prepareCanvas();}
});
