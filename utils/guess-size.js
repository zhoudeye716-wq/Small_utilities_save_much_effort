var MAX_NUMBER = 9999;
var DEFAULT_SETTINGS = { lower: 0, upper: 100, sound: true, vibration: true };

function validateSettings(settings) {
  return !!settings &&
    Number.isInteger(settings.lower) && Number.isInteger(settings.upper) &&
    settings.lower >= 0 && settings.lower < settings.upper && settings.upper <= MAX_NUMBER &&
    typeof settings.sound === 'boolean' && typeof settings.vibration === 'boolean';
}

function startRound(settings, random) {
  if (!validateSettings(settings)) return null;
  var roll = (random || Math.random)();
  return {
    settings: Object.assign({}, settings),
    answer: settings.lower + Math.floor(roll * (settings.upper - settings.lower + 1)),
    left: settings.lower,
    right: settings.upper,
    leftOpen: false,
    rightOpen: false
  };
}

function firstCandidate(round) { return round.left + Number(round.leftOpen); }
function lastCandidate(round) { return round.right - Number(round.rightOpen); }

function isSavedRound(round) {
  if (!round || !validateSettings(round.settings)) return false;
  return Number.isInteger(round.answer) && Number.isInteger(round.left) && Number.isInteger(round.right) &&
    typeof round.leftOpen === 'boolean' && typeof round.rightOpen === 'boolean' &&
    round.left >= round.settings.lower && round.right <= round.settings.upper &&
    (round.leftOpen || round.left === round.settings.lower) &&
    (round.rightOpen || round.right === round.settings.upper) &&
    round.answer >= firstCandidate(round) && round.answer <= lastCandidate(round);
}

function guessNumber(round, input) {
  if (input === '') return { kind: 'invalid', reason: 'empty' };
  if (!/^\d{1,4}$/.test(String(input))) return { kind: 'invalid', reason: 'format' };
  var number = Number(input);
  if (number < round.left || number > round.right) return { kind: 'invalid', reason: 'outside' };
  if (number < firstCandidate(round) || number > lastCandidate(round)) {
    return { kind: 'invalid', reason: 'excluded' };
  }
  if (number === round.answer) return { kind: 'hit', number: number };
  if (number < round.answer) {
    return { kind: 'left', number: number, round: Object.assign({}, round, { left: number, leftOpen: true }) };
  }
  return { kind: 'right', number: number, round: Object.assign({}, round, { right: number, rightOpen: true }) };
}

function countRemaining(round) { return lastCandidate(round) - firstCandidate(round) + 1; }

module.exports = {
  MAX_NUMBER: MAX_NUMBER,
  DEFAULT_SETTINGS: DEFAULT_SETTINGS,
  validateSettings: validateSettings,
  startRound: startRound,
  isSavedRound: isSavedRound,
  guessNumber: guessNumber,
  countRemaining: countRemaining
};
