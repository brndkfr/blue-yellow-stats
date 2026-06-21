/**
 * Jets Tracker — Google Apps Script backend
 *
 * Sheets managed by this script:
 *   "Events"     — one row per tracking action (appended on every tap)
 *   "Games"      — one row per game, upserted by game_id
 *   "Squad"      — full player/goalie pool, managed via the app or directly
 *   "GameRoster" — per-game player selection and role overrides
 *
 * Per-game event views are created automatically as QUERY sheets when a
 * game is saved (named "{date} {opponent}").
 *
 * Setup:
 *  1. Create a new Google Sheet named e.g. "Jets Tracker 2026/27".
 *  2. Extensions → Apps Script → delete the default code → paste this file.
 *  3. Run the setup() function once (Run menu → setup) to create all sheets
 *     and seed Squad + Scouts with the Jets U14B Blau roster.
 *  4. Save → Deploy → New deployment.
 *     Type: Web app | Execute as: Me | Who has access: Anyone.
 *  5. Paste the deployment URL into web/tracker/config.js → scriptUrl.
 */

const VERSION           = 'v29';

const EVENTS_SHEET      = 'Events';
const GAMES_SHEET       = 'Games';
const SQUAD_SHEET       = 'Squad';
const GAME_ROSTER_SHEET = 'GameRoster';
const SCOUTS_SHEET      = 'Scouts';

// Bump these keys whenever new migrations are added so the skip-flag resets.
const _EV_MIG_KEY = 'ev_mig_v4';
const _GM_MIG_KEY = 'gm_mig_v2';
const _CACHE_TTL  = 3600; // seconds

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _getOrCreate(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** Format a Date value from Sheets into a readable string.
 *  Times stored as duration-from-epoch (year 1899) become "HH:MM".
 *  All other dates become "DD.MM.YYYY". */
function _fmtDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return d;
  if (d.getFullYear() === 1899) {
    // Time-only value
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '.' + mm + '.' + d.getFullYear();
}

/** Return all rows of a sheet as an array of objects keyed by header row. */
function _sheetData(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const [headers, ...rows] = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  return rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = v instanceof Date ? _fmtDate(v) : v;
    });
    return obj;
  });
}

function _ensureHeader(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
}

function _ensureEventsHeader(sheet) {
  _ensureHeader(sheet, [
    'game_id', 'game_date', 'game_start', 'opponent', 'type', 'venue', 'home',
    'period', 'timestamp',
    'player_id', 'player_nr', 'player_name', 'player_role',
    'action',
    'assist_id', 'assist_nr', 'assist_name',
    'power_play', 'reason',
    'scout', 'note', 'was_queued', 'received_at',
  ]);
}

function _ensureGamesHeader(sheet) {
  _ensureHeader(sheet, [
    'game_id', 'display_name', 'date', 'time', 'opponent', 'type', 'venue', 'home',
    'format', 'minutes_per_period', 'team', 'result',
  ]);
}

function _ensureSquadHeader(sheet) {
  _ensureHeader(sheet, ['id', 'number', 'name', 'type', 'role', 'active']);
}

function _ensureGameRosterHeader(sheet) {
  _ensureHeader(sheet, ['game_id', 'player_id', 'number', 'name', 'selected', 'role']);
}

function _ensureScoutsHeader(sheet) {
  _ensureHeader(sheet, ['name', 'active']);
}

/** Upsert a row by matching keyCol value. Returns the row index (1-based) or -1. */
function _upsertRow(sheet, keyCol, keyVal, newRow) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const colIdx = 1; // keyCol is always column A (index 1) in our sheets
    const vals = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues().flat();
    const idx  = vals.indexOf(keyVal);
    if (idx !== -1) {
      const rowNum = idx + 2;
      sheet.getRange(rowNum, 1, 1, newRow.length).setValues([newRow]);
      return rowNum;
    }
  }
  sheet.appendRow(newRow);
  return -1;
}

/** Run all Events column migrations in one header read. Returns current headers array. */
function _migrateEventsAll(sheet) {
  if (sheet.getLastRow() === 0) return [];
  var h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // v1: player_id after timestamp
  if (h.indexOf('player_id') === -1) {
    var ti = h.indexOf('timestamp');
    if (ti !== -1) {
      sheet.insertColumnAfter(ti + 1);
      sheet.getRange(1, ti + 2).setValue('player_id');
      h.splice(ti + 1, 0, 'player_id');
    }
  }
  // v1: assist block after action
  if (h.indexOf('assist_id') === -1) {
    var ai = h.indexOf('action');
    if (ai !== -1) {
      ['assist_id', 'assist_nr', 'assist_name', 'power_play', 'reason'].forEach(function(col, i) {
        sheet.insertColumnAfter(ai + 1 + i);
        sheet.getRange(1, ai + 2 + i).setValue(col);
        h.splice(ai + 1 + i, 0, col);
      });
    }
  }
  // v2: player_role after player_name
  if (h.indexOf('player_role') === -1) {
    var ni = h.indexOf('player_name');
    if (ni !== -1) {
      sheet.insertColumnAfter(ni + 1);
      sheet.getRange(1, ni + 2).setValue('player_role');
      h.splice(ni + 1, 0, 'player_role');
    }
  }
  // Always: force player_id / assist_id to plain-text to prevent date-serial interpretation
  ['player_id', 'assist_id'].forEach(function(col) {
    var idx = h.indexOf(col);
    if (idx !== -1) sheet.getRange(1, idx + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  });

  return h;
}

/** Run all Games column migrations in one header read. */
function _migrateGamesAll(sheet) {
  if (sheet.getLastRow() === 0) return;
  var h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // v1: display_name as column B
  if (h.indexOf('display_name') === -1) {
    sheet.insertColumnAfter(1);
    sheet.getRange(1, 2).setValue('display_name');
    h.splice(1, 0, 'display_name');
  }
  // v2: format + minutes_per_period + team between home and result
  if (h.indexOf('format') === -1) {
    var hi = h.indexOf('home');
    if (hi !== -1) {
      ['format', 'minutes_per_period', 'team'].forEach(function(col, i) {
        sheet.insertColumnAfter(hi + 1 + i);
        sheet.getRange(1, hi + 2 + i).setValue(col);
      });
    }
  }
}

/** Upsert the Games sheet and create a per-game QUERY sheet if new.
 *  forceUpdate=true bypasses the ScriptCache check (used by saveGame action). */
function _upsertGame(ss, p, props, forceUpdate) {
  var gid = p.game_id || '';
  if (!gid) return;

  // Fast path: if we already know this game exists, skip the sheet read entirely.
  // saveGame always forces an update so changes to venue/result etc. are written.
  var cache    = CacheService.getScriptCache();
  var cacheKey = 'gm_' + gid.replace(/[^a-zA-Z0-9]/g, '_');
  if (!forceUpdate && cache.get(cacheKey) === '1') return;

  const sheet = _getOrCreate(ss, GAMES_SHEET);
  _ensureGamesHeader(sheet);

  if (!props) props = PropertiesService.getScriptProperties();
  if (props.getProperty(_GM_MIG_KEY) !== '1') {
    _migrateGamesAll(sheet);
    props.setProperty(_GM_MIG_KEY, '1');
  }

  const row = [
    p.game_id            || '',
    p.display_name       || '',
    p.game_date          || '',
    p.game_start         || '',
    p.opponent           || '',
    p.type               || '',
    p.venue              || '',
    p.home               || '',
    p.format             || '',
    p.minutes_per_period || '',
    p.team               || '',
    p.result             || '',
  ];

  const isNew = _upsertRow(sheet, 'game_id', gid, row) === -1;
  if (isNew && gid) _createGameQuerySheet(ss, gid, p.display_name || gid);

  cache.put(cacheKey, '1', _CACHE_TTL);
}

/** Create a per-game sheet with a QUERY formula against the Events sheet. */
function _createGameQuerySheet(ss, gameId, displayName) {
  const sheetName = (displayName || gameId).substring(0, 100);
  if (ss.getSheetByName(sheetName)) return; // already exists
  const qs = ss.insertSheet(sheetName);
  // QUERY pulls all Events rows where column A (game_id) matches
  qs.getRange('A1').setFormula(
    '=QUERY(' + EVENTS_SHEET + '!A:Z,"SELECT * WHERE A=\'' + gameId + '\'",1)'
  );
}

// ---------------------------------------------------------------------------
// doPost — receive events and data writes from the app
// ---------------------------------------------------------------------------

function doPost(e) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const p     = e.parameter;
  const props = PropertiesService.getScriptProperties(); // one call for all handlers

  switch (p.action_type) {
    case 'saveGame':       return _handleSaveGame(ss, p, props);
    case 'saveGameRoster': return _handleSaveGameRoster(ss, p);
    case 'saveSquadPlayer':return _handleSaveSquadPlayer(ss, p);
    case 'deleteEvent':    return _handleDeleteEvent(ss, p);
    default:               return _handleEvent(ss, p, props);
  }
}

function _handleEvent(ss, p, props) {
  const evSh = _getOrCreate(ss, EVENTS_SHEET);
  _ensureEventsHeader(evSh);

  // Run migrations once; after that, skip on every subsequent request.
  var headers;
  if (props.getProperty(_EV_MIG_KEY) !== '1') {
    headers = _migrateEventsAll(evSh);
    if (headers.indexOf('player_id') !== -1 &&
        headers.indexOf('assist_id')  !== -1 &&
        headers.indexOf('player_role') !== -1) {
      props.setProperty(_EV_MIG_KEY, '1');
    }
  } else {
    headers = evSh.getRange(1, 1, 1, evSh.getLastColumn()).getValues()[0];
  }

  const data = {
    game_id:     p.game_id       || '',
    game_date:   p.game_date     || '',
    game_start:  p.game_start    || '',
    opponent:    p.opponent      || '',
    type:        p.type          || '',
    venue:       p.venue         || '',
    home:        p.home          || '',
    period:      Number(p.period)    || 0,
    timestamp:   p.timestamp    || '',
    player_id:   p.player_id    || '',
    player_nr:   Number(p.player_nr) || 0,
    player_name: p.player_name  || '',
    player_role: p.player_role  || '',
    action:      p.action       || '',
    assist_id:   p.assist_id    || '',
    assist_nr:   Number(p.assist_nr) || '',
    assist_name: p.assist_name  || '',
    power_play:  p.power_play   || '',
    reason:      p.reason       || '',
    scout:       p.scout        || '',
    note:        p.note         || '',
    was_queued:  p.was_queued   || '',
    received_at: new Date(),
  };
  evSh.appendRow(headers.map(function(h) { return h in data ? data[h] : ''; }));

  _upsertGame(ss, p, props, false);
  return _json({ status: 'ok' });
}

function _handleSaveGame(ss, p, props) {
  _upsertGame(ss, p, props, true); // forceUpdate: always write saveGame requests
  return _json({ status: 'ok' });
}

function _handleSaveGameRoster(ss, p) {
  const sheet = _getOrCreate(ss, GAME_ROSTER_SHEET);
  _ensureGameRosterHeader(sheet);

  // Delete existing rows for this game_id
  const gameId  = p.game_id || '';
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    // Iterate in reverse to avoid index shifting after deletions
    for (let i = vals.length - 1; i >= 0; i--) {
      if (vals[i] === gameId) sheet.deleteRow(i + 2);
    }
  }

  // Insert new rows — roster is passed as JSON array in p.roster
  try {
    const roster = JSON.parse(p.roster || '[]');
    roster.forEach((entry) => {
      sheet.appendRow([
        gameId,
        entry.player_id || '',
        entry.number    || '',
        entry.name      || '',
        entry.selected  || 'yes',
        entry.role      || '',
      ]);
    });
  } catch (err) {
    return _json({ status: 'error', message: err.message });
  }

  return _json({ status: 'ok' });
}

/** Delete the most recent event row matching game_id + player_id + action. */
function _handleDeleteEvent(ss, p) {
  const sheet = ss.getSheetByName(EVENTS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return _json({ status: 'ok' });

  const gameId   = String(p.game_id   || '');
  const playerId = String(p.player_id || '');
  const action   = String(p.action    || '');
  if (!gameId || !action) return _json({ status: 'ok' });

  const headers  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const gidIdx   = headers.indexOf('game_id');
  const pidIdx   = headers.indexOf('player_id');
  const actIdx   = headers.indexOf('action');
  const lastRow  = sheet.getLastRow();
  const vals     = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  // Search from bottom (most recent) so we delete the event just logged
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][gidIdx]) === gameId &&
        String(vals[i][actIdx]) === action &&
        (playerId === '' || String(vals[i][pidIdx]) === playerId)) {
      sheet.deleteRow(i + 2);
      return _json({ status: 'ok' });
    }
  }
  return _json({ status: 'ok' }); // not found — already gone, treat as success
}

function _handleSaveSquadPlayer(ss, p) {
  const sheet = _getOrCreate(ss, SQUAD_SHEET);
  _ensureSquadHeader(sheet);

  let id = Number(p.id) || 0;

  if (!id) {
    // Auto-assign next id
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(Number);
      id = ids.length ? Math.max(...ids) + 1 : 1;
    } else {
      id = 1;
    }
  }

  const row = [
    id,
    Number(p.number) || '',
    p.name   || '',
    p.type   || 'player',
    p.role   || '',
    p.active || 'yes',
  ];

  _upsertRow(sheet, 'id', id, row);
  return _json({ status: 'ok', id });
}

// ---------------------------------------------------------------------------
// doGet — serve data to the app
// ---------------------------------------------------------------------------

function doGet(e) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const action = e && e.parameter && e.parameter.action;

  switch (action) {
    case 'squad': {
      const rows = _sheetData(ss, SQUAD_SHEET);
      const active = rows.filter((r) => String(r.active).toLowerCase() !== 'no');
      return _json(active);
    }
    case 'games': {
      const rows = _sheetData(ss, GAMES_SHEET);
      return _json(rows);
    }
    case 'gameRoster': {
      const gameId = e.parameter.game_id || '';
      const rows   = _sheetData(ss, GAME_ROSTER_SHEET);
      return _json(rows.filter((r) => r.game_id === gameId));
    }
    case 'scouts': {
      const sheet = ss.getSheetByName(SCOUTS_SHEET);
      if (!sheet) return _json([]);
      const rows = _sheetData(ss, SCOUTS_SHEET);
      return _json(rows.filter((r) => String(r.active).toLowerCase() !== 'no'));
    }
    default:
      return ContentService
        .createTextOutput('Jets Tracker endpoint is live.')
        .setMimeType(ContentService.MimeType.TEXT);
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function _json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// setup() — run once from the Apps Script editor (Run → setup)
// Creates all sheets with headers and seeds Squad + Scouts if empty.
// Safe to re-run: existing data is never overwritten.
// ---------------------------------------------------------------------------

const SEED_SQUAD = [
  // id, number, name, type, role
  [1,  5,  'Alexander B.', 'goalie', ''],
  [2,  9,  'Lenny F.',     'goalie', ''],
  [3,  16, 'Colin H.',     'goalie', ''],
  [4,  18, 'Ben Uriel K.', 'goalie', ''],
  [5,  23, 'Nils M.',      'goalie', ''],
  [6,  30, 'Dionys S.',    'goalie', ''],
  [7,  1,  'Leevi A.',     'player', 'winger'],
  [8,  2,  'Lias B.',      'player', 'defender'],
  [9,  3,  'Livio B.',     'player', 'winger'],
  [10, 4,  'Jan B.',       'player', 'defender'],
  [11, 6,  'Benjamin B.',  'player', 'center'],
  [12, 7,  'Avi F.',       'player', 'winger'],
  [13, 8,  'Luis F.',      'player', 'center'],
  [14, 10, 'Thierry G.',   'player', 'center'],
  [15, 11, 'Remy G.',      'player', 'winger'],
  [16, 12, 'Noah G.',      'player', 'defender'],
  [17, 13, 'Liam H.',      'player', 'center'],
  [18, 14, 'Tino H.',      'player', 'defender'],
  [19, 15, 'Ellis H.',     'player', 'winger'],
  [20, 17, 'Elio K.',      'player', 'center'],
  [21, 19, 'Ben M.',       'player', 'defender'],
  [22, 20, 'Lyan M.',      'player', 'winger'],
  [23, 21, 'Alonso M.',    'player', 'center'],
  [24, 22, 'Noel M.',      'player', 'defender'],
  [25, 24, 'Nils P.',      'player', 'winger'],
  [26, 25, 'Dario R.',     'player', 'center'],
  [27, 26, 'Robin R.',     'player', 'defender'],
  [28, 28, 'Gian S.',      'player', 'center'],
  [29, 29, 'Livio S.',     'player', 'winger'],
];

const SEED_SCOUTS = ['Roland', 'Bernd', 'Marvin', 'Daniel', 'Thomas'];

// ---------------------------------------------------------------------------
// fixEventsPlayerIds — run ONCE from Apps Script editor (Run menu)
// Converts date-serialised player_id / assist_id cells back to plain integers
// and sets both columns to plain-text format so it never happens again.
// ---------------------------------------------------------------------------

function fixEventsPlayerIds() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var evSh   = ss.getSheetByName(EVENTS_SHEET);
  var sqSh   = ss.getSheetByName(SQUAD_SHEET);
  if (!evSh || evSh.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Events sheet is empty — nothing to fix.');
    return;
  }

  // Build name -> id map from Squad (source of truth)
  var nameToId = {};
  if (sqSh && sqSh.getLastRow() > 1) {
    var sqHeaders = sqSh.getRange(1, 1, 1, sqSh.getLastColumn()).getValues()[0];
    var sqIdIdx   = sqHeaders.indexOf('id');
    var sqNameIdx = sqHeaders.indexOf('name');
    var sqVals    = sqSh.getRange(2, 1, sqSh.getLastRow() - 1, sqSh.getLastColumn()).getValues();
    sqVals.forEach(function(row) {
      var id   = row[sqIdIdx];
      var name = String(row[sqNameIdx] || '').trim();
      if (name && id !== '') nameToId[name] = String(id);
    });
  }

  var numPlayers = Object.keys(nameToId).length;
  Logger.log('Squad name->id map: ' + numPlayers + ' entries');

  var evHeaders  = evSh.getRange(1, 1, 1, evSh.getLastColumn()).getValues()[0];
  var pidIdx     = evHeaders.indexOf('player_id');
  var pnameIdx   = evHeaders.indexOf('player_name');
  var aidIdx     = evHeaders.indexOf('assist_id');
  var anameIdx   = evHeaders.indexOf('assist_name');

  if (pidIdx === -1) {
    SpreadsheetApp.getUi().alert('player_id column not found.');
    return;
  }

  var numRows = evSh.getLastRow() - 1;
  var allVals = evSh.getRange(2, 1, numRows, evSh.getLastColumn()).getValues();

  // Rebuild player_id from player_name, assist_id from assist_name
  var pidFixed = 0;
  var aidFixed = 0;

  var newPidVals  = [];
  var newAidVals  = [];

  allVals.forEach(function(row) {
    var pname = pnameIdx !== -1 ? String(row[pnameIdx] || '').trim() : '';
    var aname = anameIdx !== -1 ? String(row[anameIdx] || '').trim() : '';

    var correctPid = nameToId[pname] || '';
    var correctAid = nameToId[aname] || '';

    var curPid = row[pidIdx];
    // Detect bad value: Date object, or string containing '/' or ':' or looks like a year
    var pidBad = curPid instanceof Date ||
                 (typeof curPid === 'string' && /[\/:.]/.test(curPid) && curPid.length > 4) ||
                 (typeof curPid === 'number' && curPid > 31);
    // Also consider it bad if it doesn't match the correct value
    if (pidBad || (correctPid && String(curPid) !== correctPid)) { pidFixed++; }
    newPidVals.push([correctPid]);

    if (aidIdx !== -1) {
      var curAid = row[aidIdx];
      var aidBad = curAid instanceof Date ||
                   (typeof curAid === 'string' && /[\/:.]/.test(curAid) && curAid.length > 4) ||
                   (typeof curAid === 'number' && curAid > 31);
      if (aidBad || (correctAid && String(curAid) !== correctAid)) { aidFixed++; }
      newAidVals.push([correctAid]);
    }
  });

  // Step 1: set format to plain text
  var pidRange = evSh.getRange(2, pidIdx + 1, numRows, 1);
  pidRange.setNumberFormat('@');
  if (aidIdx !== -1) {
    evSh.getRange(2, aidIdx + 1, numRows, 1).setNumberFormat('@');
  }
  SpreadsheetApp.flush();

  // Step 2: clear existing content (removes stored Date objects / bad strings)
  pidRange.clearContent();
  if (aidIdx !== -1) evSh.getRange(2, aidIdx + 1, numRows, 1).clearContent();
  SpreadsheetApp.flush();

  // Step 3: write corrected string values
  pidRange.setValues(newPidVals);
  if (aidIdx !== -1 && newAidVals.length > 0) {
    evSh.getRange(2, aidIdx + 1, numRows, 1).setValues(newAidVals);
  }

  SpreadsheetApp.getUi().alert(
    'Done! Used Squad name lookup to rebuild IDs.\n' +
    'player_id: ' + pidFixed + ' cells updated.\n' +
    'assist_id: ' + aidFixed + ' cells updated.\n\n' +
    'Squad had ' + numPlayers + ' players in the name map.'
  );
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Create all sheets with headers
  const evSh = _getOrCreate(ss, EVENTS_SHEET);      _ensureEventsHeader(evSh);
  const gmSh = _getOrCreate(ss, GAMES_SHEET);       _ensureGamesHeader(gmSh);
  const sqSh = _getOrCreate(ss, SQUAD_SHEET);       _ensureSquadHeader(sqSh);
  const grSh = _getOrCreate(ss, GAME_ROSTER_SHEET); _ensureGameRosterHeader(grSh);
  const scSh = _getOrCreate(ss, SCOUTS_SHEET);      _ensureScoutsHeader(scSh);

  // Seed Squad if empty
  if (sqSh.getLastRow() <= 1) {
    SEED_SQUAD.forEach(([id, number, name, type, role]) => {
      sqSh.appendRow([id, number, name, type, role, 'yes']);
    });
    Logger.log('Squad seeded with ' + SEED_SQUAD.length + ' players.');
  } else {
    Logger.log('Squad already has data — skipped.');
  }

  // Seed Scouts if empty
  if (scSh.getLastRow() <= 1) {
    SEED_SCOUTS.forEach((name) => scSh.appendRow([name, 'yes']));
    Logger.log('Scouts seeded: ' + SEED_SCOUTS.join(', '));
  } else {
    Logger.log('Scouts already has data — skipped.');
  }

  // Delete the default blank "Sheet1" if it still exists and is empty
  const blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('Tabelle1');
  if (blank && blank.getLastRow() === 0) ss.deleteSheet(blank);

  Logger.log('Setup complete.');
  SpreadsheetApp.getUi().alert('Jets Tracker setup complete!\n\nSheets created: Events, Games, Squad, GameRoster, Scouts.\nNow deploy as Web App and paste the URL into config.js.');
}

// ---------------------------------------------------------------------------
// onOpen — custom spreadsheet menu (installed trigger)
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Jets Stats')
    .addItem('Alle Spiele',          'computeStatsAll')
    .addItem('Meisterschaft',        'computeStatsRegular')
    .addItem('Cup',                  'computeStatsCup')
    .addItem('Testspiele',           'computeStatsTest')
    .addSeparator()
    .addItem('Aktuelles Spiel analysieren', 'analyzeCurrentGame')
    .addToUi();
}

function computeStatsAll()     { computeStats_(null); }
function computeStatsRegular() { computeStats_('regular'); }
function computeStatsCup()     { computeStats_('cup'); }
function computeStatsTest()    { computeStats_('test'); }

// ---------------------------------------------------------------------------
// computeStats_ — main analytics function
// ---------------------------------------------------------------------------

const STATS_SHEET  = 'Stats';
const _S_NAVY      = '#0033a0';
const _S_LBLUE     = '#dce9ff';
const _S_HDRBG     = '#e0e7f5';
const _S_ALTROW    = '#f5f7fc';

function computeStats_(typeFilter) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  var FILTER_LABELS = { regular: 'Meisterschaft', cup: 'Cup', test: 'Testspiele' };
  var filterLabel   = typeFilter ? FILTER_LABELS[typeFilter] : 'Alle Spiele';
  ss.toast('Statistiken werden berechnet...', 'Jets Stats - ' + filterLabel, 120);

  const events  = _sheetData(ss, EVENTS_SHEET);
  const squad   = _sheetData(ss, SQUAD_SHEET);
  const games   = _sheetData(ss, GAMES_SHEET);
  const rosters = _sheetData(ss, GAME_ROSTER_SHEET);

  // Exclude games that haven't happened yet
  var _cutoff = new Date(); _cutoff.setHours(23, 59, 59, 999);
  const filteredGames = (typeFilter
    ? games.filter(function(g) { return g.type === typeFilter; })
    : games
  ).filter(function(g) { return _parseGameDate(String(g.date)) <= _cutoff; });

  const filteredGameIds = new Set(filteredGames.map(function(g) { return String(g.game_id); }));

  // Deduplicate events: same (game_id + timestamp + player_id + action) = same queued retry
  var _seen = Object.create(null);
  const filteredEvents = events.filter(function(e) {
    if (!filteredGameIds.has(String(e.game_id))) return false;
    var key = e.game_id + '|' + e.timestamp + '|' + e.player_id + '|' + e.action;
    if (_seen[key]) return false;
    _seen[key] = true;
    return true;
  });

  const filteredRosters = rosters.filter(function(r) { return filteredGameIds.has(String(r.game_id)); });

  var sh = ss.getSheetByName(STATS_SHEET);
  if (!sh) sh = ss.insertSheet(STATS_SHEET);
  sh.getCharts().forEach(function(c) { sh.removeChart(c); });
  sh.clearContents();
  sh.clearFormats();

  var stamp         = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');

  // Build player map id -> squad object
  var playerMap = {};
  squad.forEach(function(p) { playerMap[String(p.id)] = p; });

  // Events grouped by game_id
  var eventsByGame = {};
  filteredEvents.forEach(function(e) {
    var gid = String(e.game_id);
    if (!eventsByGame[gid]) eventsByGame[gid] = [];
    eventsByGame[gid].push(e);
  });

  // Events grouped by player_id
  var playerEvents = {};
  filteredEvents.forEach(function(e) {
    var pid = String(e.player_id);
    if (!pid || pid === '0' || pid === '') return;
    if (!playerEvents[pid]) playerEvents[pid] = [];
    playerEvents[pid].push(e);
  });

  // Goals where assist_id is set, grouped by assist_id
  var assistEvents = {};
  filteredEvents.filter(function(e) { return e.action === 'goal' && e.assist_id; })
    .forEach(function(e) {
      var aid = String(e.assist_id);
      if (!assistEvents[aid]) assistEvents[aid] = [];
      assistEvents[aid].push(e);
    });

  // Player game appearances from roster (selected='yes')
  var playerGames = {};
  filteredRosters.filter(function(r) { return String(r.selected).toLowerCase() !== 'no'; })
    .forEach(function(r) {
      var pid = String(r.player_id);
      if (!playerGames[pid]) playerGames[pid] = new Set();
      playerGames[pid].add(String(r.game_id));
    });

  // Per-game stats: gf, ga, gd, goalieId, info
  var gameStats = {};
  filteredGames.forEach(function(g) {
    var gid  = String(g.game_id);
    var evs  = eventsByGame[gid] || [];
    var gf   = evs.filter(function(e) { return e.action === 'goal'; }).length;
    var ga   = evs.filter(function(e) { return e.action === 'gegengoal'; }).length;
    var rstr = filteredRosters.filter(function(r) {
      return String(r.game_id) === gid && String(r.selected).toLowerCase() !== 'no';
    });
    var goalieEntry = rstr.find(function(r) {
      var sq = playerMap[String(r.player_id)];
      return sq && sq.type === 'goalie';
    });
    gameStats[gid] = {
      gf: gf, ga: ga, gd: gf - ga,
      goalieId: goalieEntry ? String(goalieEntry.player_id) : null,
      info: g,
    };
  });

  // --- Write sections ---
  var row  = 1;
  var meta = {};

  // Title row
  sh.getRange(row, 1, 1, 11).merge()
    .setValue('Jets U14B Blau - Statistiken: ' + filterLabel + '   |   Stand: ' + stamp)
    .setBackground(_S_NAVY).setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
  sh.setRowHeight(row, 36);
  row += 2;

  // Section 2: Team-Bilanz
  var bilanzResult = _computeTeamBilanz(gameStats, filteredGames);
  var s2 = _writeStatsSection(sh, row,
    'Team-Bilanz',
    ['Spiele', 'Siege', 'Unentschieden', 'Niederlagen', 'Tore', 'Gegentore', 'Tordifferenz', 'Heimsiege', 'Auswärtssiege'],
    bilanzResult
  );
  meta.teamBilanz = s2; row = s2.nextRow;

  // Section 3: Statistiken nach Periode
  var s3p = _writeStatsSection(sh, row,
    'Statistiken nach Periode',
    ['Periode', 'Tore', 'Gegentore', 'Tordifferenz', 'Paraden', 'Mega-Paraden', 'Torschüsse', 'Schlüsselpässe', 'Fehlpässe'],
    _computePeriodBreakdown(filteredEvents)
  );
  meta.periodBreakdown = s3p; row = s3p.nextRow;

  // Section 4: Torerfolge Feldspieler
  var s3 = _writeStatsSection(sh, row,
    'Torerfolge Feldspieler',
    ['Spieler', 'Rolle', 'Spiele', 'Tore', 'Vorlagen', 'Punkte', 'Tore Überzahl', 'Vorlagen Überzahl', 'Torschüsse (Zentrum)', 'Torschussquote'],
    _computePlayerScoring(playerMap, playerEvents, assistEvents, playerGames)
  );
  meta.scoring = s3; row = s3.nextRow;

  // Section 4: Feldspieler Beitrag
  var s4 = _writeStatsSection(sh, row,
    'Feldspieler Beitrag (Erweiterte Statistiken)',
    ['Spieler', 'Anzahl Aktionen', 'Positiv-Anteil', 'Offensiv-Wert', 'Defensiv-Wert', 'Gesamtwert', 'Offensiv-Anteil am Team', 'Leistung Schlussphase', 'Ballgewinn-Balance'],
    _computePlayerBeitrag(playerMap, playerEvents, assistEvents, filteredEvents, filteredGames)
  );
  meta.beitrag = s4; row = s4.nextRow;

  // Section 5: Torwart-Statistiken
  var s5 = _writeStatsSection(sh, row,
    'Torwart-Statistiken',
    ['Torwart', 'Spiele', 'Paraden', 'Mega-Paraden', 'Anteil Mega-Paraden', 'Gegentore', 'Fangquote', 'Torwart-Dominanz-Wert', 'Schlüsselpässe', 'Fehlauswürfe'],
    _computeGoalieStats(playerMap, playerEvents, filteredEvents)
  );
  meta.goalie = s5; row = s5.nextRow;

  // Section 6: Ergebnisse pro Spiel
  var s6 = _writeStatsSection(sh, row,
    'Ergebnisse pro Spiel',
    ['Datum', 'Gegner', 'Heim/Auswärts', 'Tore', 'Gegentore', 'Tordifferenz', 'Powerplay-Quote', 'Unterzahl gehalten', 'Geloggte Aktionen'],
    _computePerGame(filteredGames, gameStats, eventsByGame)
  );
  meta.perGame = s6; row = s6.nextRow;

  // Section 7: Verbindungsindex
  var s7 = _writeStatsSection(sh, row,
    'Verbindungsindex (wer bereitet für wen vor)',
    ['Torschütze', 'Vorbereiter', 'Gemeinsame Tore'],
    _computeChemistry(filteredEvents, playerMap)
  );
  meta.chemistry = s7; row = s7.nextRow;

  // Section 8: Gegentore nach Ursache
  var s8 = _writeStatsSection(sh, row,
    'Gegentore nach Ursache',
    ['Ursache', 'Anzahl', 'Anteil'],
    _computeGegengoalReasons(filteredEvents)
  );
  meta.reasons = s8; row = s8.nextRow;

  // Section 9: xGA
  var s9 = _writeStatsSection(sh, row,
    'Erwartete Gegentore pro Spiel (xGA)',
    ['Datum', 'Gegner', 'Gegentore (tatsächlich)', 'Erwartete Gegentore', 'Differenz', 'Bewertung'],
    _computeXGA(filteredGames, gameStats, eventsByGame)
  );
  meta.xga = s9; row = s9.nextRow;

  sh.autoResizeColumns(1, 11);

  // Write auxiliary chart data tables (columns 15+) and insert all charts
  var auxMeta = _writeAuxData(sh, playerMap, playerEvents, assistEvents, filteredEvents, filteredGames, gameStats);
  _insertStatsCharts(sh, meta, auxMeta);

  SpreadsheetApp.getUi().alert('Statistiken berechnet! (' + filterLabel + ')');
}

// ---------------------------------------------------------------------------
// Section write helper
// ---------------------------------------------------------------------------

function _writeStatsSection(sh, startRow, title, headers, dataRows) {
  var cols    = headers.length;
  var hasData = dataRows && dataRows.length > 0;
  var row     = startRow;

  // Section label
  var tr = sh.getRange(row, 1, 1, cols);
  if (cols > 1) tr.merge();
  tr.setValue(title).setBackground(_S_LBLUE).setFontWeight('bold').setFontSize(10);
  row++;

  // Column header row
  sh.getRange(row, 1, 1, cols).setValues([headers])
    .setFontWeight('bold').setBackground(_S_HDRBG);
  row++;

  var dataStart = row;

  if (hasData) {
    var paddedRows = dataRows.map(function(r) {
      var p = r.slice();
      while (p.length < cols) p.push('');
      return p;
    });
    sh.getRange(row, 1, paddedRows.length, cols).setValues(paddedRows);
    paddedRows.forEach(function(_, i) {
      if (i % 2 === 1) sh.getRange(row + i, 1, 1, cols).setBackground(_S_ALTROW);
    });
    row += dataRows.length;
  } else {
    sh.getRange(row, 1).setValue('Keine Daten verfügbar').setFontColor('#aaaaaa');
    if (cols > 1) sh.getRange(row, 1, 1, cols).merge();
    row++;
  }

  return { nextRow: row + 1, dataStart: dataStart, dataCount: hasData ? dataRows.length : 0, colCount: cols };
}

// ---------------------------------------------------------------------------
// Stat computation helpers
// ---------------------------------------------------------------------------

function _parseGameDate(dateStr) {
  if (!dateStr) return new Date(0);
  var parts = String(dateStr).split('.');
  if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
  return new Date(dateStr);
}

function _roleLabel(role) {
  return { center: 'Center', defender: 'Verteidiger', winger: 'Stürmer' }[role] || role || '';
}

function _pct(v) { return v !== null && v !== undefined ? (v * 100).toFixed(1) + '%' : '–'; }
function _num(v, d) {
  if (v === null || v === undefined) return '–';
  var factor = Math.pow(10, d !== undefined ? d : 1);
  return Math.round(v * factor) / factor;
}

function _computeTeamBilanz(gameStats, filteredGames) {
  var spiele = 0, siege = 0, unentsch = 0, niederl = 0;
  var tore = 0, gegentore = 0, heimsiege = 0, auswaertssiege = 0;
  Object.keys(gameStats).forEach(function(gid) {
    var gs = gameStats[gid];
    spiele++;
    tore      += gs.gf;
    gegentore += gs.ga;
    var isHome = String(gs.info.home).toLowerCase() === 'yes';
    if      (gs.gd > 0) { siege++;   if (isHome) heimsiege++; else auswaertssiege++; }
    else if (gs.gd < 0)   niederl++;
    else                  unentsch++;
  });
  if (spiele === 0) return [];
  return [[spiele, siege, unentsch, niederl, tore, gegentore, tore - gegentore, heimsiege, auswaertssiege]];
}

function _computePeriodBreakdown(filteredEvents) {
  var periods = {};
  filteredEvents.forEach(function(e) {
    var p = Number(e.period) || 0;
    if (!periods[p]) periods[p] = { goals: 0, ga: 0, saves: 0, mega: 0, shots: 0, kp: 0, bp: 0 };
    var a = e.action || '';
    if      (a === 'goal')      periods[p].goals++;
    else if (a === 'gegengoal') periods[p].ga++;
    else if (a === 'save')      periods[p].saves++;
    else if (a === 'mega_save') periods[p].mega++;
    else if (a === 'slot_shot') periods[p].shots++;
    else if (a === 'key_pass' && e.player_role !== 'goalie') periods[p].kp++;
    else if (a === 'bad_pass')  periods[p].bp++;
  });
  return Object.keys(periods)
    .map(Number)
    .sort(function(a, b) { return a - b; })
    .map(function(p) {
      var s = periods[p];
      return [p === 0 ? 'Unbekannt' : 'Periode ' + p, s.goals, s.ga, s.goals - s.ga, s.saves, s.mega, s.shots, s.kp, s.bp];
    });
}

function _computePlayerScoring(playerMap, playerEvents, assistEvents, playerGames) {
  var rows = [];
  Object.keys(playerMap).forEach(function(pid) {
    var player = playerMap[pid];
    if (player.type !== 'player') return;
    var evs   = playerEvents[pid]  || [];
    var assts = assistEvents[pid]  || [];
    var spiele = playerGames[pid]  ? playerGames[pid].size : 0;
    if (spiele === 0 && evs.length === 0) return;

    var tore   = evs.filter(function(e) { return e.action === 'goal'; }).length;
    var ppg    = evs.filter(function(e) { return e.action === 'goal' && e.power_play === 'yes'; }).length;
    var ppa    = assts.filter(function(e) { return e.power_play === 'yes'; }).length;
    var shots  = evs.filter(function(e) { return e.action === 'slot_shot'; }).length;
    var shotPct = shots >= 5 ? _pct(tore / shots) : '–';

    rows.push({
      data: [player.name, _roleLabel(player.role), spiele, tore, assts.length,
             tore + assts.length, ppg, ppa, shots, shotPct],
      sort: tore + assts.length,
    });
  });
  rows.sort(function(a, b) { return b.sort - a.sort; });
  return rows.map(function(r) { return r.data; });
}

function _computePlayerBeitrag(playerMap, playerEvents, assistEvents, filteredEvents, filteredGames) {
  var gameFormatMap = {};
  filteredGames.forEach(function(g) { gameFormatMap[String(g.game_id)] = Number(g.format) || 2; });

  var teamGoals  = filteredEvents.filter(function(e) { return e.action === 'goal'; }).length;
  var teamAssts  = filteredEvents.filter(function(e) { return e.action === 'goal' && e.assist_id; }).length;
  var teamKP     = filteredEvents.filter(function(e) { return e.action === 'key_pass' && e.player_role !== 'goalie'; }).length;
  var teamShots  = filteredEvents.filter(function(e) { return e.action === 'slot_shot'; }).length;
  var teamOff    = teamGoals + teamAssts + teamKP + teamShots;

  var rows = [];
  Object.keys(playerMap).forEach(function(pid) {
    var player = playerMap[pid];
    if (player.type !== 'player') return;
    var evs   = playerEvents[pid] || [];
    var assts = assistEvents[pid] || [];
    if (evs.length === 0 && assts.length === 0) return;

    var goals  = evs.filter(function(e) { return e.action === 'goal'; }).length;
    var kp     = evs.filter(function(e) { return e.action === 'key_pass'; }).length;
    var shots  = evs.filter(function(e) { return e.action === 'slot_shot'; }).length;
    var rec    = evs.filter(function(e) { return e.action === 'recovery'; }).length;
    var def    = evs.filter(function(e) { return e.action === 'defense'; }).length;
    var bp     = evs.filter(function(e) { return e.action === 'bad_pass'; }).length;

    var pos    = goals + assts.length + kp + shots + rec + def;
    var neg    = bp;
    var total  = pos + neg;

    var per    = total > 0    ? pos / total : null;
    var aii    = goals * 4 + assts.length * 3 + kp * 1.5 + shots;
    var dii    = rec + def - bp * 0.5;
    var ars    = aii + dii;
    var pOff   = goals + assts.length + kp + shots;
    var dc     = teamOff > 0  ? pOff / teamOff : null;

    var clutchEvs = evs.filter(function(e) {
      return Number(e.period) === (gameFormatMap[String(e.game_id)] || 2);
    });
    var clutch = evs.length > 0 ? clutchEvs.length / evs.length : null;
    var tb     = (rec + bp) > 0 ? rec / (rec + bp) : null;

    rows.push({
      data: [player.name, total, _pct(per), _num(aii), _num(dii), _num(ars), _pct(dc), _pct(clutch), _pct(tb)],
      sort: ars,
    });
  });
  rows.sort(function(a, b) { return b.sort - a.sort; });
  return rows.map(function(r) { return r.data; });
}

function _computeGoalieStats(playerMap, playerEvents, filteredEvents) {
  // Which goalie was active in each (game, period)? Use their save events as evidence.
  // First goalie with a save in a given period wins that period.
  var periodGoalie = Object.create(null);
  Object.keys(playerMap).forEach(function(pid) {
    if (playerMap[pid].type !== 'goalie') return;
    (playerEvents[pid] || []).forEach(function(e) {
      var k = String(e.game_id) + '|' + String(e.period || '');
      if (!periodGoalie[k]) periodGoalie[k] = pid;
    });
  });

  // Attribute each gegengoal to the goalie active in that period
  var goalieGA = Object.create(null);
  filteredEvents.filter(function(e) { return e.action === 'gegengoal'; }).forEach(function(e) {
    var pid = periodGoalie[String(e.game_id) + '|' + String(e.period || '')];
    if (pid) goalieGA[pid] = (goalieGA[pid] || 0) + 1;
  });

  var rows = [];
  Object.keys(playerMap).forEach(function(pid) {
    var player = playerMap[pid];
    if (player.type !== 'goalie') return;
    var evs = playerEvents[pid] || [];
    if (evs.length === 0) return;

    var saves     = evs.filter(function(e) { return e.action === 'save'; }).length;
    var megaSaves = evs.filter(function(e) { return e.action === 'mega_save'; }).length;
    var total     = saves + megaSaves;
    var ga        = goalieGA[pid] || 0;
    var numGames  = new Set(evs.map(function(e) { return String(e.game_id); })).size;
    var svPct     = (total + ga) >= 3 ? total / (total + ga) : null;
    var msvPct    = total > 0 ? megaSaves / total : null;
    var gds       = (total + ga) > 0 ? (megaSaves * 2 + saves) / (total + ga) : null;
    var kp        = evs.filter(function(e) { return e.action === 'key_pass'; }).length;
    var bt        = evs.filter(function(e) { return e.action === 'bad_throw'; }).length;

    rows.push({
      data: [player.name, numGames, total, megaSaves, _pct(msvPct), ga, _pct(svPct), _num(gds, 2), kp, bt],
      sort: numGames * 100 + total,
    });
  });
  rows.sort(function(a, b) { return b.sort - a.sort; });
  return rows.map(function(r) { return r.data; });
}

function _computePerGame(filteredGames, gameStats, eventsByGame) {
  return filteredGames
    .slice()
    .sort(function(a, b) { return _parseGameDate(b.date) - _parseGameDate(a.date); })
    .map(function(g) {
      var gid  = String(g.game_id);
      var gs   = gameStats[gid] || { gf: 0, ga: 0, gd: 0 };
      var evs  = eventsByGame[gid] || [];
      var ppS  = evs.filter(function(e) { return e.action === 'goal' && String(e.power_play).toLowerCase() === 'yes'; }).length;
      var ppE  = evs.filter(function(e) { return e.action === 'pp_expired'; }).length;
      var bxK  = evs.filter(function(e) { return e.action === 'box_killed'; }).length;
      var bxC  = evs.filter(function(e) { return e.action === 'box_conceded'; }).length;
      return [
        g.date || '',
        g.opponent || '',
        String(g.home).toLowerCase() === 'yes' ? 'Heim' : 'Auswärts',
        gs.gf, gs.ga, gs.gd,
        (ppS + ppE) > 0 ? _pct(ppS / (ppS + ppE)) : '–',
        (bxK + bxC) > 0 ? _pct(bxK / (bxK + bxC)) : '–',
        evs.length,
      ];
    });
}

function _computeChemistry(filteredEvents, playerMap) {
  var pairs = {};
  filteredEvents.filter(function(e) { return e.action === 'goal' && e.assist_id && e.player_id; })
    .forEach(function(e) {
      var key = e.player_id + '___' + e.assist_id;
      pairs[key] = (pairs[key] || 0) + 1;
    });
  return Object.keys(pairs)
    .sort(function(a, b) { return pairs[b] - pairs[a]; })
    .map(function(key) {
      var parts    = key.split('___');
      var scorer   = playerMap[parts[0]]  ? playerMap[parts[0]].name  : '#' + parts[0];
      var assister = playerMap[parts[1]]  ? playerMap[parts[1]].name  : '#' + parts[1];
      return [scorer, assister, pairs[key]];
    });
}

function _computeGegengoalReasons(filteredEvents) {
  var labelMap = {
    counter:     'Konter',
    free_shot:   'Freier Schuss',
    no_coverage: 'Deckungsfehler',
    bad_pass:    'Fehlpass',
    power_play:  'Überzahl Gegner',
    unlucky:     'Pech',
    '':          'Ohne Angabe',
  };
  var counts = {};
  Object.keys(labelMap).forEach(function(k) { counts[k] = 0; });
  filteredEvents.filter(function(e) { return e.action === 'gegengoal'; })
    .forEach(function(e) { counts[e.reason || ''] = (counts[e.reason || ''] || 0) + 1; });
  var total = Object.keys(counts).reduce(function(s, k) { return s + counts[k]; }, 0);
  return Object.keys(labelMap)
    .filter(function(k) { return counts[k] > 0; })
    .sort(function(a, b) { return counts[b] - counts[a]; })
    .map(function(k) { return [labelMap[k], counts[k], total > 0 ? _pct(counts[k] / total) : '–']; });
}

function _computeXGA(filteredGames, gameStats, eventsByGame) {
  var weights = { counter: 1.0, free_shot: 0.9, no_coverage: 0.8, power_play: 0.7, bad_pass: 0.6, unlucky: 0.3, '': 0.7 };
  return filteredGames
    .slice()
    .sort(function(a, b) { return _parseGameDate(b.date) - _parseGameDate(a.date); })
    .map(function(g) {
      var gid  = String(g.game_id);
      var evs  = eventsByGame[gid] || [];
      var gs   = gameStats[gid] || { ga: 0 };
      var xga  = evs.filter(function(e) { return e.action === 'gegengoal'; })
                    .reduce(function(s, e) { return s + (weights[e.reason || ''] || 0.7); }, 0);
      var diff = gs.ga - xga;
      var bewertung = Math.abs(diff) <= 0.5 ? 'Ausgeglichen' : diff > 0 ? 'Pech' : 'Stark gehalten';
      return [g.date || '', g.opponent || '', gs.ga, _num(xga, 1), _num(diff, 1), bewertung];
    });
}

// ---------------------------------------------------------------------------
// Auxiliary chart data tables (written to columns 15+ so charts can reference them)
// ---------------------------------------------------------------------------

function _writeAuxData(sh, playerMap, playerEvents, assistEvents, filteredEvents, filteredGames, gameStats) {
  var col = 15;
  var row = 2;

  // --- Bubble data: Angriff vs Abwehr per player ---
  // BUBBLE chart format: Label | X | Y | Group | Size
  var bubbleRows = [];
  Object.keys(playerMap).forEach(function(pid) {
    var player = playerMap[pid];
    if (player.type !== 'player') return;
    var evs   = playerEvents[pid] || [];
    var assts = assistEvents[pid] || [];
    if (evs.length + assts.length === 0) return;

    var goals = evs.filter(function(e) { return e.action === 'goal'; }).length;
    var kp    = evs.filter(function(e) { return e.action === 'key_pass'; }).length;
    var shots = evs.filter(function(e) { return e.action === 'slot_shot'; }).length;
    var rec   = evs.filter(function(e) { return e.action === 'recovery'; }).length;
    var def   = evs.filter(function(e) { return e.action === 'defense'; }).length;
    var bp    = evs.filter(function(e) { return e.action === 'bad_pass'; }).length;
    var aii   = goals * 4 + assts.length * 3 + kp * 1.5 + shots;
    var dii   = rec + def - bp * 0.5;
    bubbleRows.push([player.name, aii, dii, 'Spieler', 10]);
  });

  sh.getRange(row, col, 1, 5)
    .setValues([['Spieler', 'Offensiv-Wert', 'Defensiv-Wert', 'Gruppe', 'Grösse']])
    .setFontWeight('bold').setBackground('#f0f4ff').setFontSize(8);
  row++;
  var bubbleDataStart = row;
  if (bubbleRows.length > 0) {
    sh.getRange(row, col, bubbleRows.length, 5).setValues(bubbleRows).setFontSize(8);
    row += bubbleRows.length;
  }
  row += 2;

  // --- Radar data: Torwart profile ---
  // Format: Fähigkeit | Goalie1 | Goalie2 | ...
  // Period-based goalie GA (same logic as _computeGoalieStats)
  var _pgGoalie = Object.create(null);
  Object.keys(playerMap).forEach(function(pid) {
    if (playerMap[pid].type !== 'goalie') return;
    (playerEvents[pid] || []).forEach(function(e) {
      var k = String(e.game_id) + '|' + String(e.period || '');
      if (!_pgGoalie[k]) _pgGoalie[k] = pid;
    });
  });
  var _radarGA = Object.create(null);
  filteredEvents.filter(function(e) { return e.action === 'gegengoal'; }).forEach(function(e) {
    var pid = _pgGoalie[String(e.game_id) + '|' + String(e.period || '')];
    if (pid) _radarGA[pid] = (_radarGA[pid] || 0) + 1;
  });

  var radarHeaders  = ['Fähigkeit'];
  var faenQuote     = ['Fangquote (0-100)'];
  var megaAnteil    = ['Mega-Paraden %'];
  var schluesselpKP = ['Schlüsselpässe (0-100)'];
  var zuverl        = ['Zuverlässigkeit (0-100)'];

  Object.keys(playerMap).forEach(function(pid) {
    var player = playerMap[pid];
    if (player.type !== 'goalie') return;
    var evs = playerEvents[pid] || [];
    if (evs.length === 0) return;

    var saves     = evs.filter(function(e) { return e.action === 'save'; }).length;
    var megaSaves = evs.filter(function(e) { return e.action === 'mega_save'; }).length;
    var total     = saves + megaSaves;
    var ga        = _radarGA[pid] || 0;
    var numGames  = new Set(evs.map(function(e) { return String(e.game_id); })).size;
    var kp        = evs.filter(function(e) { return e.action === 'key_pass'; }).length;
    var bt        = evs.filter(function(e) { return e.action === 'bad_throw'; }).length;

    radarHeaders.push(player.name);
    faenQuote.push(    (total + ga) > 0 ? Math.round(total / (total + ga) * 100) : 0);
    megaAnteil.push(   total > 0 ? Math.round(megaSaves / total * 100) : 0);
    schluesselpKP.push(Math.min(Math.round(kp / Math.max(numGames, 1) * 100 / 2), 100));
    zuverl.push(       Math.max(0, 100 - Math.round(bt / Math.max(numGames, 1) * 50)));
  });

  var radarHeaderRow = row;
  var radarDataRows  = [faenQuote, megaAnteil, schluesselpKP, zuverl];
  if (radarHeaders.length > 1) {
    sh.getRange(row, col, 1, radarHeaders.length).setValues([radarHeaders])
      .setFontWeight('bold').setBackground('#f0f4ff').setFontSize(8);
    row++;
    sh.getRange(row, col, radarDataRows.length, radarHeaders.length).setValues(radarDataRows).setFontSize(8);
    row += radarDataRows.length;
  }

  return {
    bubbleDataStart: bubbleDataStart,
    bubbleCount:     bubbleRows.length,
    bubbleCol:       col,
    radarHeaderRow:  radarHeaderRow,
    radarDataCount:  radarDataRows.length,
    radarColCount:   radarHeaders.length,
    radarCol:        col,
    hasGoalies:      radarHeaders.length > 1,
  };
}

// ---------------------------------------------------------------------------
// Chart insertion
// ---------------------------------------------------------------------------

function _insertStatsCharts(sh, meta, auxMeta) {
  // Chart 1: Tore & Vorlagen pro Spieler (stacked horizontal bar)
  if (meta.scoring && meta.scoring.dataCount > 0) {
    // dataStart - 1 = column header row ("Spieler", "Tore", "Vorlagen") — needed for series labels
    var namesR  = sh.getRange(meta.scoring.dataStart - 1, 1, meta.scoring.dataCount + 1, 1);
    var valuesR = sh.getRange(meta.scoring.dataStart - 1, 4, meta.scoring.dataCount + 1, 2);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(namesR).addRange(valuesR)
      .setOption('title', 'Tore & Vorlagen pro Spieler')
      .setOption('isStacked', true)
      .setOption('legend', { position: 'bottom' })
      .setOption('colors', ['#0033a0', '#ffcd00'])
      .setOption('width', 520).setOption('height', Math.max(240, meta.scoring.dataCount * 26 + 80))
      .setPosition(meta.scoring.dataStart, 13, 0, 0)
      .build());
  }

  // Chart 2: Angriff vs Abwehr (bubble = scatter with player name labels)
  if (auxMeta && auxMeta.bubbleCount > 0) {
    var bubbleR = sh.getRange(auxMeta.bubbleDataStart - 1, auxMeta.bubbleCol, auxMeta.bubbleCount + 1, 5);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.BUBBLE)
      .addRange(bubbleR)
      .setOption('title', 'Angriff vs Abwehr (Spieler-Profil)')
      .setOption('hAxis', { title: 'Offensiv-Wert', minValue: 0 })
      .setOption('vAxis', { title: 'Defensiv-Wert' })
      .setOption('legend', { position: 'bottom' })
      .setOption('bubble', { textStyle: { fontSize: 9 } })
      .setOption('colors', ['#0033a0'])
      .setOption('width', 520).setOption('height', 380)
      .setPosition(meta.beitrag ? meta.beitrag.dataStart : 20, 13, 0, 0)
      .build());
  }

  // Chart 3: Tordifferenz pro Spiel (column, positive=navy, negative=red via series color)
  if (meta.perGame && meta.perGame.dataCount > 0) {
    // dataStart - 1 = column header row ("Datum", "Tordifferenz") — needed for series label
    var dateR = sh.getRange(meta.perGame.dataStart - 1, 1, meta.perGame.dataCount + 1, 1);
    var gdR   = sh.getRange(meta.perGame.dataStart - 1, 6, meta.perGame.dataCount + 1, 1);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(dateR).addRange(gdR)
      .setOption('title', 'Tordifferenz pro Spiel')
      .setOption('legend', { position: 'bottom' })
      .setOption('colors', ['#0033a0'])
      .setOption('vAxis', { title: 'Tordifferenz', baselineColor: '#888' })
      .setOption('width', 520).setOption('height', 300)
      .setPosition(meta.perGame.dataStart, 13, 0, 0)
      .build());
  }

  // Chart 4: Gegentore nach Ursache (donut pie)
  if (meta.reasons && meta.reasons.dataCount > 0) {
    var reasonR = sh.getRange(meta.reasons.dataStart, 1, meta.reasons.dataCount, 2);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(reasonR)
      .setOption('title', 'Gegentore nach Ursache')
      .setOption('pieHole', 0.4)
      .setOption('legend', { position: 'right' })
      .setOption('width', 440).setOption('height', 320)
      .setPosition(meta.reasons.dataStart, 13, 0, 0)
      .build());
  }

  // Chart 5: Torwart-Profil (radar)
  if (auxMeta && auxMeta.hasGoalies) {
    try {
      var radarR = sh.getRange(auxMeta.radarHeaderRow, auxMeta.radarCol, auxMeta.radarDataCount + 1, auxMeta.radarColCount);
      sh.insertChart(sh.newChart()
        .setChartType(Charts.ChartType.RADAR)
        .addRange(radarR)
        .setOption('title', 'Torwart-Profil (0-100)')
        .setOption('legend', { position: 'bottom' })
        .setOption('radarShape', 'polygon')
        .setOption('colors', ['#0033a0', '#ffcd00', '#4ade80'])
        .setOption('width', 420).setOption('height', 360)
        .setPosition(meta.goalie ? meta.goalie.dataStart : 40, 13, 0, 0)
        .build());
    } catch (e) {
      // Radar not supported in this Sheets version - skip silently
    }
  }
}

// ---------------------------------------------------------------------------
// Per-game tab analysis
// ---------------------------------------------------------------------------

function analyzeCurrentGame() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();
  var sheetName = sh.getName();
  ss.toast('Spiel wird analysiert...', 'Jets Stats - ' + sheetName, 120);

  // Find game_id: 1) from QUERY formula in A1, 2) tab name vs display_name/game_id
  var gameId = null;
  var gameInfo = null;

  var a1Formula = sh.getRange('A1').getFormula();
  var formulaMatch = a1Formula.match(/WHERE A='([^']+)'/i);
  if (formulaMatch) gameId = formulaMatch[1];

  var gamesData = _sheetData(ss, GAMES_SHEET);
  if (!gameId) {
    for (var i = 0; i < gamesData.length; i++) {
      var g = gamesData[i];
      if (g.display_name === sheetName || g.game_id === sheetName) {
        gameId = g.game_id;
        break;
      }
    }
  }
  if (gameId && !gameInfo) {
    for (var j = 0; j < gamesData.length; j++) {
      if (String(gamesData[j].game_id) === String(gameId)) { gameInfo = gamesData[j]; break; }
    }
  }

  if (!gameId) {
    SpreadsheetApp.getUi().alert(
      'Kein Spiel für dieses Tab gefunden.\n\n' +
      'Dieses Tab muss entweder:\n' +
      '- Eine QUERY-Formel in A1 enthalten (=QUERY(Events!A:W,...))\n' +
      '- Oder gleich heissen wie display_name / game_id in der Games-Tabelle.'
    );
    return;
  }

  var allEvents = _sheetData(ss, EVENTS_SHEET);
  var squad     = _sheetData(ss, SQUAD_SHEET);

  // Filter events for this game and sort by period then timestamp
  var events = allEvents
    .filter(function(e) { return e.game_id === gameId; })
    .sort(function(a, b) {
      var pd = Number(a.period || 0) - Number(b.period || 0);
      if (pd !== 0) return pd;
      return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
    });

  // Build player map
  var playerMap = {};
  squad.forEach(function(s) {
    playerMap[String(s.id)] = { name: s.name, type: s.type };
  });

  // Remove existing charts and clear aux data area
  sh.getCharts().forEach(function(c) { sh.removeChart(c); });
  var lastRow = Math.max(sh.getLastRow(), 60);
  var lastCol = sh.getLastColumn();
  if (lastCol >= 26) {
    sh.getRange(1, 26, lastRow, lastCol - 25).clear();
  }

  // Write aux data tables starting at col 26
  var auxCol = 26;
  var tlMeta  = _writeGameTimeline_(sh, auxCol,      1, events, playerMap);
  var actMeta = _writePlayerActionsTable_(sh, auxCol + 11, 1, events, playerMap);
  var typMeta = _writeActionTypeTable_(sh, auxCol + 21, 1, events);
  var gwMeta  = _writeGoalieBilanzTable_(sh, auxCol + 25, 1, events);

  // Insert charts
  _insertGameCharts_(sh, tlMeta, actMeta, typMeta, gwMeta);

  SpreadsheetApp.getUi().alert('Spiel "' + sheetName + '" analysiert!');
}

// Timeline: Nr | Jets | Gegner | Paraden | Mega-Parade | Torschuss | Schlüsselpass | Powerplay | Fehler
// Jets/Gegner = cumulative score at each event (continuous line).
// Event lanes = fixed Y value only at matching events, blank otherwise (isolated dots).
function _writeGameTimeline_(sh, col, startRow, events, playerMap) {
  var headers = ['Nr', 'Jets', 'Gegner', 'Parade', 'Mega-Parade', 'Torschuss', 'Schlüsselpass', 'Powerplay', 'Fehler'];
  sh.getRange(startRow, col, 1, headers.length)
    .setValues([headers]).setFontWeight('bold').setBackground('#e8f0fe').setFontSize(8);

  var jets   = 0;
  var gegner = 0;
  var nr     = 0;
  var rows   = [];

  events.forEach(function(e) {
    var a = e.action || '';
    // Skip bookkeeping events that add no visual value
    if (['power_play_end', 'box_start', 'box_end', 'defense', 'recovery'].indexOf(a) !== -1) return;

    nr++;
    var parade = null, mega = null, shot = null, kp = null, pp = null, err = null;

    if      (a === 'goal')              { jets++;   }
    else if (a === 'gegengoal')         { gegner++; }
    else if (a === 'save')              { parade = -1;   }
    else if (a === 'mega_save')         { mega   = -1.5; }
    else if (a === 'slot_shot')         { shot   = -2;   }
    else if (a === 'key_pass')          { kp     = -3;   }
    else if (a === 'power_play_start')  { pp     = -4;   }
    else if (a === 'bad_pass' || a === 'bad_throw') { err = -5; }

    rows.push([nr, jets, gegner, parade, mega, shot, kp, pp, err]);
  });

  if (rows.length > 0) {
    sh.getRange(startRow + 1, col, rows.length, headers.length)
      .setValues(rows).setFontSize(8);
  }

  return { col: col, headerRow: startRow, dataStart: startRow + 1, dataCount: rows.length, colCount: headers.length };
}

// Player actions: Spieler | Tore | Vorlagen | Paraden | Torschüsse | Schlüsselpässe | Ballgewinne | Fehlpässe
function _writePlayerActionsTable_(sh, col, startRow, events, playerMap) {
  var headers = ['Spieler', 'Tore', 'Vorlagen', 'Paraden', 'Torschüsse', 'Schlüsselpässe', 'Ballgewinne', 'Fehlpässe'];
  sh.getRange(startRow, col, 1, headers.length)
    .setValues([headers]).setFontWeight('bold').setBackground('#e8f0fe').setFontSize(8);

  var counts = {};
  var ensure = function(pid) {
    if (!counts[pid]) counts[pid] = { g: 0, a: 0, sv: 0, sh: 0, kp: 0, rec: 0, bp: 0 };
  };

  events.forEach(function(e) {
    var pid = String(e.player_id || '');
    if (!pid) return;
    ensure(pid);
    var a = e.action || '';
    if      (a === 'goal')                           { counts[pid].g++;  }
    else if (a === 'save' || a === 'mega_save')      { counts[pid].sv++; }
    else if (a === 'slot_shot')                      { counts[pid].sh++; }
    else if (a === 'key_pass')                       { counts[pid].kp++; }
    else if (a === 'recovery')                       { counts[pid].rec++; }
    else if (a === 'bad_pass' || a === 'bad_throw')  { counts[pid].bp++; }

    // Assist stored inline on the goal event
    if (a === 'goal' && e.assist_id) {
      var apid = String(e.assist_id);
      ensure(apid);
      counts[apid].a++;
    }
  });

  var rows = [];
  Object.keys(counts).forEach(function(pid) {
    var p   = playerMap[pid];
    var c   = counts[pid];
    var tot = c.g + c.a + c.sv + c.sh + c.kp + c.rec + c.bp;
    if (tot === 0) return;
    rows.push([p ? p.name : ('Spieler ' + pid), c.g, c.a, c.sv, c.sh, c.kp, c.rec, c.bp]);
  });
  rows.sort(function(a, b) {
    return b.slice(1).reduce(function(s, v) { return s + v; }, 0)
         - a.slice(1).reduce(function(s, v) { return s + v; }, 0);
  });

  if (rows.length > 0) {
    sh.getRange(startRow + 1, col, rows.length, headers.length)
      .setValues(rows).setFontSize(8);
  }

  return { col: col, headerRow: startRow, dataStart: startRow + 1, dataCount: rows.length, colCount: headers.length };
}

// Action type counts
function _writeActionTypeTable_(sh, col, startRow, events) {
  var headers = ['Aktionstyp', 'Anzahl'];
  sh.getRange(startRow, col, 1, 2)
    .setValues([headers]).setFontWeight('bold').setBackground('#e8f0fe').setFontSize(8);

  var labels = {
    goal: 'Tor', gegengoal: 'Gegentor', save: 'Parade', mega_save: 'Mega-Parade',
    slot_shot: 'Torschuss', key_pass: 'Schlüsselpass', recovery: 'Ballgewinn',
    defense: 'Abwehraktion', bad_pass: 'Fehlpass', bad_throw: 'Fehlauswurf',
    power_play_start: 'Powerplay', box_start: 'Unterzahl',
  };
  var typeCounts = {};
  events.forEach(function(e) {
    var a = e.action || 'unbekannt';
    typeCounts[a] = (typeCounts[a] || 0) + 1;
  });

  var rows = Object.keys(typeCounts)
    .map(function(k) { return [labels[k] || k, typeCounts[k]]; })
    .sort(function(a, b) { return b[1] - a[1]; });

  if (rows.length > 0) {
    sh.getRange(startRow + 1, col, rows.length, 2).setValues(rows).setFontSize(8);
  }

  return { col: col, headerRow: startRow, dataStart: startRow + 1, dataCount: rows.length, colCount: 2 };
}

// Goalie bilanz: Paraden / Mega-Paraden / Gegentore
function _writeGoalieBilanzTable_(sh, col, startRow, events) {
  var headers = ['Kategorie', 'Anzahl'];
  sh.getRange(startRow, col, 1, 2)
    .setValues([headers]).setFontWeight('bold').setBackground('#e8f0fe').setFontSize(8);

  var saves  = events.filter(function(e) { return e.action === 'save'; }).length;
  var mega   = events.filter(function(e) { return e.action === 'mega_save'; }).length;
  var ga     = events.filter(function(e) { return e.action === 'gegengoal'; }).length;

  var rows = [['Paraden', saves], ['Mega-Paraden', mega], ['Gegentore', ga]];
  sh.getRange(startRow + 1, col, rows.length, 2).setValues(rows).setFontSize(8);

  return { col: col, headerRow: startRow, dataStart: startRow + 1, dataCount: rows.length, colCount: 2 };
}

function _insertGameCharts_(sh, tlMeta, actMeta, typMeta, gwMeta) {
  // Anchor column for all charts (after all data tables with a gap)
  var chartCol = 44;

  // Chart 1: Score progression + event lanes (LINE chart)
  // Jets/Gegner as thick lines; event lanes as dot-only series (lineWidth: 0)
  if (tlMeta.dataCount > 0) {
    var tlNrR   = sh.getRange(tlMeta.headerRow, tlMeta.col, tlMeta.dataCount + 1, 1);
    var tlDataR = sh.getRange(tlMeta.headerRow, tlMeta.col + 1, tlMeta.dataCount + 1, tlMeta.colCount - 1);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(tlNrR).addRange(tlDataR)
      .setOption('title', 'Spielverlauf')
      .setOption('legend', { position: 'bottom' })
      .setOption('interpolateNulls', false)
      .setOption('series', {
        '0': { lineWidth: 3, pointSize: 5,  color: '#0033a0' },  // Jets score
        '1': { lineWidth: 3, pointSize: 5,  color: '#cc2200' },  // Gegner score
        '2': { lineWidth: 0, pointSize: 8,  color: '#22c55e' },  // Paraden
        '3': { lineWidth: 0, pointSize: 11, color: '#16a34a' },  // Mega-Paraden (bigger)
        '4': { lineWidth: 0, pointSize: 8,  color: '#ffcd00' },  // Torschüsse
        '5': { lineWidth: 0, pointSize: 8,  color: '#60a5fa' },  // Schlüsselpässe
        '6': { lineWidth: 0, pointSize: 8,  color: '#a78bfa' },  // Powerplay
        '7': { lineWidth: 0, pointSize: 8,  color: '#f87171' },  // Fehler
      })
      .setOption('vAxis', { gridlines: { color: '#e5e7eb' }, baselineColor: '#aaa' })
      .setOption('hAxis', { title: 'Ereignisreihenfolge', textStyle: { fontSize: 9 } })
      .setOption('width', 680).setOption('height', 380)
      .setPosition(1, chartCol, 0, 0)
      .build());
  }

  // Chart 2: Actions per player (stacked BAR)
  if (actMeta.dataCount > 0) {
    var actLabelR = sh.getRange(actMeta.headerRow, actMeta.col, actMeta.dataCount + 1, 1);
    var actDataR  = sh.getRange(actMeta.headerRow, actMeta.col + 1, actMeta.dataCount + 1, actMeta.colCount - 1);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(actLabelR).addRange(actDataR)
      .setOption('title', 'Aktionen pro Spieler')
      .setOption('isStacked', true)
      .setOption('legend', { position: 'bottom' })
      .setOption('colors', ['#0033a0', '#ffcd00', '#22c55e', '#60a5fa', '#a78bfa', '#f59e0b', '#f87171'])
      .setOption('width', 520).setOption('height', Math.max(260, actMeta.dataCount * 28 + 100))
      .setPosition(23, chartCol, 0, 0)
      .build());
  }

  // Chart 3: Action type counts (COLUMN)
  if (typMeta.dataCount > 0) {
    var typLabelR = sh.getRange(typMeta.headerRow, typMeta.col, typMeta.dataCount + 1, 1);
    var typDataR  = sh.getRange(typMeta.headerRow, typMeta.col + 1, typMeta.dataCount + 1, 1);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(typLabelR).addRange(typDataR)
      .setOption('title', 'Aktionen nach Typ')
      .setOption('legend', { position: 'bottom' })
      .setOption('colors', ['#0033a0'])
      .setOption('hAxis', { slantedText: true, slantedTextAngle: 40, textStyle: { fontSize: 9 } })
      .setOption('width', 440).setOption('height', 280)
      .setPosition(23, chartCol + 9, 0, 0)
      .build());
  }

  // Chart 4: Goalie bilanz (PIE / donut)
  if (gwMeta.dataCount > 0) {
    var gwLabelR = sh.getRange(gwMeta.headerRow, gwMeta.col, gwMeta.dataCount + 1, 1);
    var gwDataR  = sh.getRange(gwMeta.headerRow, gwMeta.col + 1, gwMeta.dataCount + 1, 1);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(gwLabelR).addRange(gwDataR)
      .setOption('title', 'Torwart-Bilanz')
      .setOption('pieHole', 0.4)
      .setOption('legend', { position: 'right' })
      .setOption('colors', ['#22c55e', '#16a34a', '#f87171'])
      .setOption('width', 340).setOption('height', 280)
      .setPosition(42, chartCol, 0, 0)
      .build());
  }
}
