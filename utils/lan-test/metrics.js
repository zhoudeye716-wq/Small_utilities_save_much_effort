function latency(sent, samples) {
  var values = samples.slice().sort(function (a, b) { return a - b; });
  var length = values.length;
  var middle = Math.floor(length / 2);
  return {
    sent: sent,
    received: length,
    timeouts: Math.max(0, sent - length),
    average: length ? values.reduce(function (sum, value) { return sum + value; }, 0) / length : null,
    median: !length ? null : length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    p95: length ? values[Math.ceil(length * .95) - 1] : null,
    maximum: length ? values[length - 1] : null
  };
}

function createReceiver(runId) {
  var seen = {};
  var unique = 0;
  var duplicate = 0;
  var outOfOrder = 0;
  var highest = -1;
  var bytes = 0;
  var first = null;
  var last = null;
  return {
    receive: function (message, now) {
      if (message.run !== runId || !Number.isInteger(message.seq) || message.seq < 0 || message.seq > 100000) return false;
      if (seen[message.seq]) { duplicate++; return false; }
      seen[message.seq] = true;
      unique++;
      if (message.seq < highest) outOfOrder++;
      highest = Math.max(highest, message.seq);
      bytes += Math.max(0, Number(message.bytes) || 0);
      if (first === null) first = now;
      last = now;
      return true;
    },
    result: function (sent) {
      var elapsed = first === null || last === null ? 0 : Math.max(0, last - first);
      return {
        unique: unique, duplicate: duplicate, outOfOrder: outOfOrder,
        missing: Number.isInteger(sent) ? Math.max(0, sent - unique) : null,
        bytes: bytes, elapsedMs: elapsed,
        kibPerSecond: elapsed > 0 ? bytes / 1024 / (elapsed / 1000) : null
      };
    }
  };
}

module.exports = { latency: latency, createReceiver: createReceiver };
