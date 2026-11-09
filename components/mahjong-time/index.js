function pad(value) {
  return value < 10 ? '0' + value : '' + value;
}

function validTime(value) {
  return typeof value === 'number' && isFinite(value) && value > 0;
}

function dateString(value) {
  var date = new Date(value);
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function displayTime(value) {
  if (!validTime(value)) return '请选择';
  var date = new Date(value);
  return dateString(value) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function midnight(value) {
  var date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function buildTime(day, hour, minute) {
  var parts = day.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), hour, minute, 0, 0).getTime();
}

var hours = [];
var minutes = [];
for (var i = 0; i < 3; i++) {
  for (var h = 0; h < 24; h++) hours.push(pad(h));
  for (var m = 0; m < 60; m++) minutes.push(pad(m));
}

Component({
  properties: {
    startAt: { type: Number, value: null },
    endAt: { type: Number, value: null }
  },
  data: {
    startLabel: '请选择', endLabel: '请选择', nextDay: false,
    editing: '', draftDate: '', draftHour: 0, draftMinute: 0,
    wheel: [24, 60], hours: hours, minutes: minutes
  },
  observers: {
    'startAt, endAt': function (startAt, endAt) {
      var nextDay = validTime(startAt) && validTime(endAt) &&
        midnight(endAt) > midnight(startAt) &&
        dateString(endAt) === dateString(new Date(new Date(startAt).getFullYear(), new Date(startAt).getMonth(), new Date(startAt).getDate() + 1).getTime());
      this.setData({ startLabel: displayTime(startAt), endLabel: displayTime(endAt), nextDay: nextDay });
    }
  },
  methods: {
    editTime: function (event) {
      var kind = event.currentTarget.dataset.kind;
      var value = kind === 'start' ? this.properties.startAt : this.properties.endAt;
      if (!validTime(value)) {
        value = kind === 'end' && validTime(this.properties.startAt) ? this.properties.startAt + 3 * 3600000 : Date.now();
      }
      var date = new Date(value);
      this.setData({ editing: kind, draftDate: dateString(value), draftHour: date.getHours(), draftMinute: date.getMinutes(), wheel: [24 + date.getHours(), 60 + date.getMinutes()] });
    },
    changeDate: function (event) {
      this.setData({ draftDate: event.detail.value });
    },
    changeWheel: function (event) {
      var selected = event.detail.value;
      var hour = selected[0] % 24;
      var minute = selected[1] % 60;
      this.setData({ draftHour: hour, draftMinute: minute, wheel: [24 + hour, 60 + minute] });
    },
    cancelEdit: function () {
      this.setData({ editing: '' });
    },
    confirmEdit: function () {
      var value = buildTime(this.data.draftDate, this.data.draftHour, this.data.draftMinute);
      var startAt = validTime(this.properties.startAt) ? this.properties.startAt : null;
      var endAt = validTime(this.properties.endAt) ? this.properties.endAt : null;
      if (this.data.editing === 'start') {
        startAt = value;
        if (endAt && endAt <= startAt) endAt = null;
      } else {
        if (startAt && dateString(value) === dateString(startAt) && value <= startAt) {
          var next = new Date(value);
          next.setDate(next.getDate() + 1);
          value = next.getTime();
        }
        endAt = value;
      }
      if (startAt && endAt && endAt <= startAt) {
        wx.showToast({ title: '结束时间须晚于开始时间', icon: 'none' });
        return;
      }
      this.setData({ editing: '' });
      this.triggerEvent('change', { startAt: startAt, endAt: endAt, modified: true });
    },
    chooseDuration: function (event) {
      var startAt = validTime(this.properties.startAt) ? this.properties.startAt : Date.now();
      startAt = Math.floor(startAt / 60000) * 60000;
      var duration = Number(event.currentTarget.dataset.hours);
      this.setData({ editing: '' });
      this.triggerEvent('change', { startAt: startAt, endAt: startAt + duration * 3600000, modified: true });
    }
  }
});
