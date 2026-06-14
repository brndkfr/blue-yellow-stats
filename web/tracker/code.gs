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

const VERSION           = 'v11';

const EVENTS_SHEET      = 'Events';
const GAMES_SHEET       = 'Games';
const SQUAD_SHEET       = 'Squad';
const GAME_ROSTER_SHEET = 'GameRoster';
const SCOUTS_SHEET      = 'Scouts';

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

/** Add player_id and assist columns if the Events sheet predates those columns. */
function _migrateEventsHeader(sheet) {
  if (sheet.getLastRow() === 0) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Insert player_id after timestamp
  if (!headers.includes('player_id')) {
    const tsIdx = headers.indexOf('timestamp');
    if (tsIdx !== -1) {
      sheet.insertColumnAfter(tsIdx + 1);
      sheet.getRange(1, tsIdx + 2).setValue('player_id');
      headers.splice(tsIdx + 1, 0, 'player_id');
    }
  }

  // Insert assist_id, assist_nr, assist_name, power_play, reason after action
  if (!headers.includes('assist_id')) {
    const actionIdx = headers.indexOf('action');
    if (actionIdx !== -1) {
      const newCols = ['assist_id', 'assist_nr', 'assist_name', 'power_play', 'reason'];
      newCols.forEach((col, i) => {
        sheet.insertColumnAfter(actionIdx + 1 + i);
        sheet.getRange(1, actionIdx + 2 + i).setValue(col);
      });
    }
  }
}

/** Insert player_role after player_name if the Events sheet predates that column. */
function _migrateEventsHeaderV2(sheet) {
  if (sheet.getLastRow() === 0) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!headers.includes('player_role')) {
    const nameIdx = headers.indexOf('player_name');
    if (nameIdx !== -1) {
      sheet.insertColumnAfter(nameIdx + 1);
      sheet.getRange(1, nameIdx + 2).setValue('player_role');
    }
  }
}

/** Insert display_name as column B if the Games sheet predates that column. */
function _migrateGamesHeader(sheet) {
  if (sheet.getLastRow() === 0) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!headers.includes('display_name')) {
    sheet.insertColumnAfter(1);
    sheet.getRange(1, 2).setValue('display_name');
  }
}

/** Insert format, minutes_per_period, team between home and result if missing. */
function _migrateGamesHeaderV2(sheet) {
  if (sheet.getLastRow() === 0) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!headers.includes('format')) {
    const homeIdx = headers.indexOf('home');
    if (homeIdx !== -1) {
      const newCols = ['format', 'minutes_per_period', 'team'];
      newCols.forEach((col, i) => {
        sheet.insertColumnAfter(homeIdx + 1 + i);
        sheet.getRange(1, homeIdx + 2 + i).setValue(col);
      });
    }
  }
}

/** Upsert the Games sheet and create a per-game QUERY sheet if new. */
function _upsertGame(ss, p) {
  const sheet = _getOrCreate(ss, GAMES_SHEET);
  _ensureGamesHeader(sheet);
  _migrateGamesHeader(sheet);
  _migrateGamesHeaderV2(sheet);

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

  const isNew = _upsertRow(sheet, 'game_id', p.game_id, row) === -1;

  if (isNew && p.game_id) {
    _createGameQuerySheet(ss, p.game_id, p.display_name || p.game_id);
  }
}

/** Create a per-game sheet with a QUERY formula against the Events sheet. */
function _createGameQuerySheet(ss, gameId, displayName) {
  const sheetName = (displayName || gameId).substring(0, 100);
  if (ss.getSheetByName(sheetName)) return; // already exists
  const qs = ss.insertSheet(sheetName);
  // QUERY pulls all Events rows where column A (game_id) matches
  qs.getRange('A1').setFormula(
    `=QUERY(${EVENTS_SHEET}!A:W,"SELECT * WHERE A='${gameId}'",1)`
  );
}

// ---------------------------------------------------------------------------
// doPost — receive events and data writes from the app
// ---------------------------------------------------------------------------

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const p  = e.parameter;

  // Route to the correct handler based on action type
  switch (p.action_type) {
    case 'saveGame':       return _handleSaveGame(ss, p);
    case 'saveGameRoster': return _handleSaveGameRoster(ss, p);
    case 'saveSquadPlayer':return _handleSaveSquadPlayer(ss, p);
    default:               return _handleEvent(ss, p);
  }
}

function _handleEvent(ss, p) {
  const evSh = _getOrCreate(ss, EVENTS_SHEET);
  _ensureEventsHeader(evSh);
  _migrateEventsHeader(evSh);
  _migrateEventsHeaderV2(evSh);

  evSh.appendRow([
    p.game_id       || '',
    p.game_date     || '',
    p.game_start    || '',
    p.opponent      || '',
    p.type          || '',
    p.venue         || '',
    p.home          || '',
    Number(p.period)     || 0,
    p.timestamp     || '',
    Number(p.player_id)  || '',
    Number(p.player_nr)  || 0,
    p.player_name   || '',
    p.player_role   || '',
    p.action        || '',
    Number(p.assist_id)  || '',
    Number(p.assist_nr)  || '',
    p.assist_name   || '',
    p.power_play    || '',
    p.reason        || '',
    p.scout         || '',
    p.note          || '',
    p.was_queued    || '',
    new Date(),
  ]);

  _upsertGame(ss, p);
  return _json({ status: 'ok' });
}

function _handleSaveGame(ss, p) {
  _upsertGame(ss, p);
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
