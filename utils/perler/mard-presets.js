// MARD retail set membership: xiaodengaikeji/pindou, Apache-2.0;
// https://github.com/xiaodengaikeji/pindou/blob/main/assets/bead-studio/src/mard-colors.ts
// 168, 192, 216 and 264-color membership cross-checked against https://gogopixelbeads.com/zh/mard-color-chart/
var groups=[
  'B3 C3 D9 E2 G1 A4 B5 C5 D6 E4 G5 A6 B8 C8 D7 F5 G7 A7 H1 H2 H3 H4 H5 H7',
  'C2 C13 D19 E8 A13 A11 C10 C6 D18 E3 A10 G9 C11 C7 D21 D13 F13 G13 B12 D3 D15 E7 F8 G8',
  'A3 B20 D16 D8 E1 G2 B18 B10 D11 D12 E12 G3 B14 B19 D2 D20 E5 F10 B17 B7 C16 D14 E13 F7',
  'E11 E14 F1 A14 M6 M5 E15 F14 F9 F2 G14 M9 E9 E6 F12 F3 F11 M12 D5 E10 F4 F6 G17 H6',
  'A15 A5 A8 A12 A9 G6 A1 B13 B1 B2 B4 B11 H12 C1 B16 B6 C15 B15 C14 D17 D1 C4 C17 C9',
  'H8 G15 A2 H13 G16 H9 H10 M1 G11 G4 M4 H14 M10 M2 G12 M13 M7 H11 M11 M3 G10 M14 M8 M15',
  'H17 H18 H19 E16 F16 F17 D23 E24 E19 E18 E17 E20 B24 A16 A17 A18 F24 F23 A24 A22 A21 F21 F22 A19',
  'A26 A25 A20 A23 G18 H21 B26 B32 B31 B30 B27 B29 C22 C23 C24 B28 C25 C27 H15 H20 H23 H22 C28 C21',
  'F15 F19 G20 E21 E22 D26 F25 F20 G19 F18 G21 E23 D25 D22 D24 C20 B21 B25 H16 B23 C18 B22 C19 C26'
];
function normalize(code){return code.replace(/^([A-Z]+)0+(\d)/,'$1$2');}
function codes(size){
  if(size===291||size===313)return null;
  if(size===280){
    var extended=['Q2','Q5','T1'];
    [['P',23],['R',28],['Y',5]].forEach(function(series){for(var i=1;i<=series[1];i++)extended.push(series[0]+i);});
    return codes(221).concat(extended);
  }
  if(size===264){
    var extra=['Q2','Q5','T1'];
    [['P',23],['R',13],['Y',5]].forEach(function(series){for(var i=1;i<=series[1];i++)extra.push(series[0]+i);});
    return codes(221).filter(function(code){return code!=='C29';}).concat(extra);
  }
  var count=size===221?9:size/24;
  if(!Number.isInteger(count)||count<1||count>9)throw new Error('不支持的色数');
  var list=groups.slice(0,count).join(' ').split(' ');
  if(size===221)list=list.concat('C29 D10 B9 C12 D4'.split(' '));
  return list;
}
module.exports={sizes:[313,221,168,144,120,96,72,48,24],extraSizes:[291,280,264,216,192],codes:codes,normalize:normalize};
