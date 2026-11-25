'use strict';

// A new tool declares its category, storage keys and merge strategy here.
// File-backed formats require an additional explicit adapter; they must not
// place device-specific absolute paths into the backup.
var categories=[
  {id:'mahjong',label:'麻将玩家、组合与对局',fields:[{key:'mahjongPlayerLibrary',merge:'roster',shape:'object'},{key:'mahjongSessions',merge:'records',shape:'array'},{key:'mahjongGuideEnabled',merge:'singleton',shape:'boolean'}]},
  {id:'signboards',label:'保存的桌牌',fields:[{key:'savedSignboards',merge:'records',shape:'array'}]},
  {id:'poker',label:'扑克助手、围坐及局域网牌局',fields:[{key:'offlineSettings',merge:'singleton',shape:'object'},{key:'offlineTable',merge:'singleton',shape:'object'},{key:'analyzerSettings',merge:'singleton',shape:'object'},{key:'lanPokerProfileV1',merge:'singleton',shape:'object'},{key:'lanPokerRecentV1',merge:'singleton',shape:'object'}]},
  {id:'guess',label:'猜大小当前对局',fields:[{key:'guess-size-current-v1',merge:'singleton',shape:'object'}]},
  {id:'perler',label:'拼豆项目、原图与校准比例',fields:[{key:'perler-calibrations-v1',merge:'singleton',shape:'array'}],projects:true},
  {id:'seating',label:'聚会座位图与图片',fields:[{key:'seatingProjectsV1',merge:'records',shape:'array'},{key:'seatingStylePresetsV1',merge:'records',shape:'array'}]}
];
function validate(items){
  var ids=Object.create(null),keys=Object.create(null);
  items.forEach(function(item){
    if(!item||typeof item.id!=='string'||!item.id||ids[item.id])throw new Error('备份类别重复或无效');
    ids[item.id]=true;if(!Array.isArray(item.fields))throw new Error('备份数据定义无效');
    item.fields.forEach(function(field){
      if(!field||typeof field.key!=='string'||!field.key||keys[field.key])throw new Error('备份存储键重复或无效');
      if(['singleton','records','roster'].indexOf(field.merge)<0)throw new Error('未知备份合并策略');keys[field.key]=true;
      if(['object','array','boolean','string','number'].indexOf(field.shape)<0)throw new Error('未知备份数据类型');
      if(field.merge==='records'&&field.shape!=='array')throw new Error('记录合并策略需要数组类型');
      if(field.merge==='roster'&&field.shape!=='object')throw new Error('玩家库合并策略需要对象类型');
    });
  });return true;
}
validate(categories);
function byKey(key){for(var i=0;i<categories.length;i++)for(var j=0;j<categories[i].fields.length;j++)if(categories[i].fields[j].key===key)return categories[i].fields[j];return null;}
module.exports={categories:categories,byKey:byKey,validate:validate};
