'use strict';

var mahjong = require('./mahjong.js');
var LIBRARY_KEY = 'mahjongPlayerLibrary';

function missing(value) { return value === '' || value === undefined || value === null; }
function isDefaultName(name) { return /^玩家[1-4]$/.test(name); }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function failure() { return { ok: false, players: [], groups: [] }; }

// Read the library and migrate legacy data in memory. No read operation writes
// storage; a later mutation or preserve() commits the complete v2 object.
function load() {
  try {
    var stored = wx.getStorageSync(LIBRARY_KEY);
    var legacy = missing(stored) || Array.isArray(stored);
    var sessions = [];
    if (legacy) {
      var history = wx.getStorageSync('mahjongSessions');
      if (!missing(history) && !Array.isArray(history)) return null;
      sessions = (history || []).slice().sort(function (a, b) {
        return (Number(b && b.updatedAt) || 0) - (Number(a && a.updatedAt) || 0);
      });
      for (var i = 0; i < sessions.length; i++) {
        if (!sessions[i] || !Array.isArray(sessions[i].players) ||
            (!missing(sessions[i].groups) && !Array.isArray(sessions[i].groups))) return null;
      }
    }
    var sourcePlayers = legacy ? (Array.isArray(stored) ? stored : []) : stored && stored.players;
    var sourceGroups = legacy ? [] : stored && stored.groups;
    if ((!legacy && (!stored || stored.version !== 2)) || !Array.isArray(sourcePlayers) || !Array.isArray(sourceGroups)) return null;
    var players = [], groups = [], ids = Object.create(null), groupIds = Object.create(null);
    function addGroup(group) {
      if (!group || typeof group.id !== 'string' || !group.id.trim() ||
          (group.name != null && typeof group.name !== 'string')) return false;
      if (!groupIds[group.id]) {
        groupIds[group.id] = true;
        groups.push({ id: group.id, name: (group.name || '').trim() });
      }
      return true;
    }
    for (var g = 0; g < sourceGroups.length; g++) {
      if (!addGroup(sourceGroups[g]) || groups.length !== g + 1) return null;
    }
    if (legacy) {
      for (var h = 0; h < sessions.length; h++) {
        var historicalGroups = sessions[h].groups || [];
        for (var k = 0; k < historicalGroups.length; k++) if (!addGroup(historicalGroups[k])) return null;
      }
    }
    function addPlayer(player, inferred) {
      if (!player || typeof player.id !== 'string' || !player.id.trim() ||
          typeof player.name !== 'string' || !player.name.trim()) return false;
      if (inferred && isDefaultName(player.name.trim())) return true;
      if (ids[player.id]) return inferred;
      if (player.groupId != null && typeof player.groupId !== 'string') return false;
      if (!legacy && player.archived != null && typeof player.archived !== 'boolean') return false;
      ids[player.id] = true;
      players.push({ id: player.id, name: player.name.trim(), groupId: player.groupId || '', archived: player.archived === true });
      return true;
    }
    for (var p = 0; p < sourcePlayers.length; p++) if (!addPlayer(sourcePlayers[p], false)) return null;
    if (legacy) {
      var assigned = Object.create(null);
      for (var s = 0; s < sessions.length; s++) {
        var historicalPlayers = sessions[s].players;
        for (var j = 0; j < historicalPlayers.length; j++) {
          var oldPlayer = historicalPlayers[j];
          if (!addPlayer(oldPlayer, true)) return null;
          if (!oldPlayer || assigned[oldPlayer.id] || isDefaultName(String(oldPlayer.name || '').trim())) continue;
          var match = players.filter(function (player) { return player.id === oldPlayer.id; })[0];
          if (match) {
            if (oldPlayer.groupId && !groupIds[oldPlayer.groupId]) return null;
            match.groupId = oldPlayer.groupId || '';
            assigned[oldPlayer.id] = true;
          }
        }
      }
    }
    for (var n = 0; n < players.length; n++) if (players[n].groupId && !groupIds[players[n].groupId]) return null;
    return { version: 2, players: players, groups: groups };
  } catch (error) { return null; }
}

function save(library) {
  try { wx.setStorageSync(LIBRARY_KEY, library); return true; } catch (error) { return false; }
}

function read() {
  var library = load();
  if (!library) return failure();
  return { ok: true, players: library.players.filter(function (p) { return !p.archived; }).map(function (p) {
    return { id: p.id, name: p.name, groupId: p.groupId };
  }), groups: copy(library.groups) };
}

function upsert(id, name) {
  if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) return false;
  var library = load();
  if (!library) return false;
  name = name.trim();
  var found = null;
  for (var i = 0; i < library.players.length; i++) {
    var player = library.players[i];
    if (player.id === id) found = player;
    else if (!player.archived && player.name === name) return false;
  }
  if (found && found.archived) return false;
  if (found) found.name = name;
  else library.players.push({ id: id, name: name, groupId: '', archived: false });
  return save(library);
}

function upsertGroup(id, name) {
  if (typeof id !== 'string' || !id.trim() || typeof name !== 'string') return false;
  var library = load();
  if (!library) return false;
  name = name.trim();
  var found = null;
  for (var i = 0; i < library.groups.length; i++) {
    var group = library.groups[i];
    if (group.id === id) found = group;
    else if (name && group.name === name) return false;
  }
  if (found) found.name = name;
  else library.groups.push({ id: id, name: name });
  return save(library);
}

function deleteGroup(id) {
  var library = load();
  if (!library) return false;
  var index = library.groups.findIndex(function (group) { return group.id === id; });
  if (index < 0) return false;
  library.groups.splice(index, 1);
  // Archived members retain their historical group in sessions. Their stored
  // group reference is no longer needed and must not point at a deleted group.
  library.players.forEach(function (player) { if (player.groupId === id) player.groupId = ''; });
  return save(library);
}

function setPlayerGroup(playerId, groupId) {
  if (typeof groupId !== 'string') return false;
  var library = load();
  if (!library || (groupId && !library.groups.some(function (group) { return group.id === groupId; }))) return false;
  var player = library.players.filter(function (item) { return item.id === playerId && !item.archived; })[0];
  if (!player) return false;
  player.groupId = groupId;
  return save(library);
}

function archivePlayer(id) {
  var library = load();
  if (!library) return false;
  var player = library.players.filter(function (item) { return item.id === id && !item.archived; })[0];
  if (!player) return false;
  player.archived = true;
  return save(library);
}

function preserve() {
  var library = load();
  return !!library && save(library);
}

function createSession() {
  var result = read();
  if (!result.ok) return { ok: false, session: null };
  var session = mahjong.createSession();
  if (result.players.length) session.players = result.players.map(function (player) {
    return { id: player.id, name: player.name, groupId: player.groupId, active: false };
  });
  else session.players.forEach(function (player) { player.active = false; });
  session.groups = result.groups;
  session.rounds = [mahjong.createRound([], '50')];
  return { ok: true, session: session };
}

function resolveSession(session) {
  var library = load();
  if (!library || !session || !Array.isArray(session.players) || !Array.isArray(session.groups)) return { ok: false, session: null };
  try {
    var result = copy(session);
    var players = Object.create(null), groups = Object.create(null);
    library.players.forEach(function (player) { players[player.id] = player; });
    result.groups.forEach(function (group) { groups[group.id] = group; });
    library.groups.forEach(function (group) {
      if (groups[group.id]) groups[group.id].name = group.name;
      else { var added = copy(group); groups[group.id] = added; result.groups.push(added); }
    });
    result.players.forEach(function (player) {
      var current = players[player.id];
      if (!current || isDefaultName(player.name)) return;
      player.name = current.name;
      if (!current.archived) player.groupId = current.groupId;
    });
    result.groups = result.groups.filter(function (group) {
      return library.groups.some(function (current) { return current.id === group.id; }) ||
        result.players.some(function (player) { return player.groupId === group.id; });
    });
    return { ok: true, session: result };
  } catch (error) { return { ok: false, session: null }; }
}

function resolveSnapshot(snapshot) {
  var library = load();
  if (!library || !snapshot || !Array.isArray(snapshot.players)) return snapshot;
  try {
    var result = copy(snapshot), byId = Object.create(null), renames = Object.create(null);
    library.players.forEach(function (player) { byId[player.id] = player; });
    result.players.forEach(function (player) {
      var current = byId[player.id], oldName = player.name;
      if (!current || isDefaultName(oldName)) return;
      player.name = current.name;
      if (!player.groupName && oldName !== current.name) renames[oldName] = current.name;
    });
    ['withoutFee', 'withFee'].forEach(function (key) {
      if (!Array.isArray(result[key])) return;
      result[key].forEach(function (transfer) {
        if (Object.prototype.hasOwnProperty.call(renames, transfer.from)) transfer.from = renames[transfer.from];
        if (Object.prototype.hasOwnProperty.call(renames, transfer.to)) transfer.to = renames[transfer.to];
      });
    });
    return result;
  } catch (error) { return snapshot; }
}

module.exports = { read: read, upsert: upsert, preserve: preserve, createSession: createSession,
  upsertGroup: upsertGroup, deleteGroup: deleteGroup, setPlayerGroup: setPlayerGroup,
  archivePlayer: archivePlayer, resolveSession: resolveSession, resolveSnapshot: resolveSnapshot };
