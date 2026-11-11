var LIMIT = 4096;
var TYPES = [
  'discover', 'advertise', 'join', 'welcome', 'members', 'heartbeat', 'heartbeat_probe', 'bye',
  'message', 'message_ack', 'ping', 'pong', 'test_start', 'test_ready',
  'test_data', 'test_end', 'test_report', 'test_command', 'test_command_ack', 'test_summary', 'test_busy'
];

function valid(packet) {
  return !!packet && packet.v === 1 && TYPES.indexOf(packet.type) !== -1 &&
    typeof packet.sender === 'string' && packet.sender.length > 0 && packet.sender.length <= 64 &&
    (packet.seq === undefined || (Number.isInteger(packet.seq) && packet.seq >= 0 && packet.seq <= 100000)) &&
    (packet.run === undefined || (typeof packet.run === 'string' && packet.run.length <= 64)) &&
    (packet.room === undefined || (typeof packet.room === 'string' && packet.room.length <= 64));
}

function encode(packet) {
  var value = Object.assign({}, packet, { v: 1 });
  if (!valid(value)) throw new Error('无效的测试报文');
  var encoded = unescape(encodeURIComponent(JSON.stringify(value)));
  if (encoded.length >= LIMIT) throw new Error('UDP 报文必须小于 4096 字节');
  var bytes = new Uint8Array(encoded.length);
  for (var i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
  return bytes.buffer;
}

function decode(buffer) {
  try {
    var bytes = new Uint8Array(buffer);
    if (!bytes.length || bytes.length >= LIMIT) return null;
    var escaped = '';
    for (var i = 0; i < bytes.length; i++) escaped += '%' + bytes[i].toString(16).padStart(2, '0');
    var value = JSON.parse(decodeURIComponent(escaped));
    return valid(value) ? value : null;
  } catch (error) {
    return null;
  }
}

module.exports = { encode: encode, decode: decode, LIMIT: LIMIT };
