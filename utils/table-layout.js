function seatPoints(count, width, height) {
  var tableWidth = Number(width) > 0 ? Number(width) : 800;
  var tableHeight = Number(height) > 0 ? Number(height) : 320;
  var points = [];
  for (var i = 0; i < count; i += 1) {
    var angle = -Math.PI / 2 + (Math.PI * 2 * i / count);
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    var x = 0.41 * Math.sign(cosine) * Math.sqrt(Math.abs(cosine));
    var y = 0.37 * Math.sign(sine) * Math.sqrt(Math.abs(sine));
    var rotation = Math.round(Math.atan2(-x * tableWidth, y * tableHeight) * 180 / Math.PI);
    points.push({ left: Math.round(50 + 100 * x), top: Math.round(50 + 100 * y), rotation: rotation === 0 ? 0 : rotation });
  }
  return points;
}

module.exports = { seatPoints: seatPoints };
