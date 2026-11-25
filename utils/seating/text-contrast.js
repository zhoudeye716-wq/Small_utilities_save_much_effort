'use strict';
// The outline must contrast with the lettering even when the picture beneath it changes.
function outline(color){
  var value=String(color||'').trim(),match=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if(!match)return '#ffffff';
  var hex=match[1];if(hex.length===3)hex=hex.split('').map(function(c){return c+c;}).join('');
  var channels=[0,2,4].map(function(i){var c=parseInt(hex.slice(i,i+2),16)/255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);});
  return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2]>0.35?'#14211b':'#ffffff';
}
module.exports={outline:outline};
