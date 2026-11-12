// Scale is screen logical pixels per bead, never a percentage of image dimensions.
var MIN_SCALE = 0.25;
var MAX_SCALE = 4096;
function finite(value) { return typeof value === 'number' && isFinite(value); }
function validScale(value) {
  if (!finite(value) || value <= 0) throw new Error('比例必须为正数');
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}
function createViewport(options) {
  options = options || {};
  return {
    scale: validScale(options.scale == null ? 10 : options.scale),
    x: finite(options.x) ? options.x : 0,
    y: finite(options.y) ? options.y : 0,
    scaleLocked: !!options.scaleLocked,
    positionLocked: !!options.positionLocked,
    calibration: null
  };
}
function pan(state, dx, dy) {
  if (state.positionLocked || !finite(dx) || !finite(dy)) return state;
  return Object.assign({}, state, {x: state.x + dx, y: state.y + dy});
}
function zoom(state, nextScale, focusX, focusY) {
  if (state.scaleLocked && !state.calibration) return state;
  var scale = validScale(nextScale);
  if (!finite(focusX) || !finite(focusY)) throw new Error('无效的缩放中心');
  var x = state.x, y = state.y;
  if (!state.positionLocked) {
    var ratio = scale / state.scale;
    x = focusX - (focusX - x) * ratio;
    y = focusY - (focusY - y) * ratio;
  }
  return Object.assign({}, state, {scale: scale, x: x, y: y});
}
function resize(state) { return Object.assign({}, state); }
function beginCalibration(state) {
  if (state.calibration) return state;
  return Object.assign({}, state, {calibration: {scale:state.scale,x:state.x,y:state.y,scaleLocked:state.scaleLocked}});
}
function adjustCalibration(state, deltaX, focusX, focusY) {
  if (!state.calibration || !finite(deltaX)) return state;
  // Incremental horizontal travel; no momentum and no change after touch ends.
  return zoom(state, state.scale * Math.exp(deltaX * 0.0005), focusX, focusY);
}
function confirmCalibration(state) {
  if (!state.calibration) return state;
  return Object.assign({}, state, {calibration:null, scaleLocked:true});
}
function cancelCalibration(state) {
  var old = state.calibration;
  if (!old) return state;
  return Object.assign({}, state, {scale:old.scale,x:old.x,y:old.y,scaleLocked:old.scaleLocked,calibration:null});
}
function saveProfile(profiles, profile, options) {
  if (!Array.isArray(profiles) || !profile || typeof profile.id !== 'string' || !profile.id || typeof profile.name !== 'string' || !profile.name.trim()) throw new Error('请输入比例名称');
  var scale = validScale(profile.scale);
  if (scale !== profile.scale) throw new Error('比例超出范围');
  var index = profiles.findIndex(function (item) { return item.id === profile.id; });
  if (index >= 0 && !(options && options.overwrite)) throw new Error('比例编号已存在');
  if (index < 0 && options && options.overwrite) throw new Error('原比例不存在');
  var result = profiles.slice();
  var item = {id:profile.id,name:profile.name.trim(),scale:scale};
  if (index < 0) result.push(item); else result[index] = item;
  return result;
}
function applyProfile(state, profile, focusX, focusY) {
  if (!profile) throw new Error('未找到比例');
  var unlocked = Object.assign({}, state, {scaleLocked:false, calibration:null});
  return Object.assign({}, zoom(unlocked, profile.scale, focusX, focusY), {scaleLocked:true});
}
module.exports = {createViewport:createViewport,pan:pan,zoom:zoom,resize:resize,beginCalibration:beginCalibration,adjustCalibration:adjustCalibration,confirmCalibration:confirmCalibration,cancelCalibration:cancelCalibration,saveProfile:saveProfile,applyProfile:applyProfile,MIN_SCALE:MIN_SCALE,MAX_SCALE:MAX_SCALE};
