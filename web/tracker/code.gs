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

const VERSION           = 'v13';

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

/** Write an event row using the actual header order, immune to migration drift. */
function _appendEventRow(sheet, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map((h) => (h in data ? data[h] : ''));
  sheet.appendRow(row);
}

function _handleEvent(ss, p) {
  const evSh = _getOrCreate(ss, EVENTS_SHEET);
  _ensureEventsHeader(evSh);
  _migrateEventsHeader(evSh);
  _migrateEventsHeaderV2(evSh);

  _appendEventRow(evSh, {
    game_id:     p.game_id       || '',
    game_date:   p.game_date     || '',
    game_start:  p.game_start    || '',
    opponent:    p.opponent      || '',
    type:        p.type          || '',
    venue:       p.venue         || '',
    home:        p.home          || '',
    period:      Number(p.period)     || 0,
    timestamp:   p.timestamp     || '',
    player_id:   Number(p.player_id)  || '',
    player_nr:   Number(p.player_nr)  || 0,
    player_name: p.player_name   || '',
    player_role: p.player_role   || '',
    action:      p.action        || '',
    assist_id:   Number(p.assist_id)  || '',
    assist_nr:   Number(p.assist_nr)  || '',
    assist_name: p.assist_name   || '',
    power_play:  p.power_play    || '',
    reason:      p.reason        || '',
    scout:       p.scout         || '',
    note:        p.note          || '',
    was_queued:  p.was_queued    || '',
    received_at: new Date(),
  });

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

// ---------------------------------------------------------------------------
// onOpen — custom spreadsheet menu (installed trigger)
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Jets Stats')
    .addItem('Alle Spiele',   'computeStatsAll')
    .addItem('Meisterschaft', 'computeStatsRegular')
    .addItem('Cup',           'computeStatsCup')
    .addItem('Testspiele',    'computeStatsTest')
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
  const events  = _sheetData(ss, EVENTS_SHEET);
  const squad   = _sheetData(ss, SQUAD_SHEET);
  const games   = _sheetData(ss, GAMES_SHEET);
  const rosters = _sheetData(ss, GAME_ROSTER_SHEET);

  const filteredGames   = typeFilter ? games.filter(function(g) { return g.type === typeFilter; }) : games;
  const filteredGameIds = new Set(filteredGames.map(function(g) { return String(g.game_id); }));
  const filteredEvents  = events.filter(function(e) { return filteredGameIds.has(String(e.game_id)); });
  const filteredRosters = rosters.filter(function(r) { return filteredGameIds.has(String(r.game_id)); });

  var sh = ss.getSheetByName(STATS_SHEET);
  if (!sh) sh = ss.insertSheet(STATS_SHEET);
  sh.getCharts().forEach(function(c) { sh.removeChart(c); });
  sh.clearContents();
  sh.clearFormats();

  var FILTER_LABELS = { regular: 'Meisterschaft', cup: 'Cup', test: 'Testspiele' };
  var filterLabel   = typeFilter ? FILTER_LABELS[typeFilter] : 'Alle Spiele';
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

  // Section 3: Torerfolge Feldspieler
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
    _computeGoalieStats(playerMap, playerEvents, gameStats)
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

  _insertStatsCharts(sh, meta);

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

function _computeGoalieStats(playerMap, playerEvents, gameStats) {
  var goalieGameIds = {};
  Object.keys(gameStats).forEach(function(gid) {
    var gid2 = gameStats[gid].goalieId;
    if (gid2) {
      if (!goalieGameIds[gid2]) goalieGameIds[gid2] = [];
      goalieGameIds[gid2].push(gid);
    }
  });

  var rows = [];
  Object.keys(playerMap).forEach(function(pid) {
    var player  = playerMap[pid];
    if (player.type !== 'goalie') return;
    var evs     = playerEvents[pid] || [];
    var gameIds = goalieGameIds[pid] || [];
    if (gameIds.length === 0 && evs.length === 0) return;

    var saves     = evs.filter(function(e) { return e.action === 'save'; }).length;
    var megaSaves = evs.filter(function(e) { return e.action === 'mega_save'; }).length;
    var total     = saves + megaSaves;
    var ga        = gameIds.reduce(function(sum, gid) { return sum + (gameStats[gid] ? gameStats[gid].ga : 0); }, 0);
    var svPct     = (total + ga) >= 3 ? total / (total + ga) : null;
    var msvPct    = total > 0 ? megaSaves / total : null;
    var gds       = (total + ga) > 0 ? (megaSaves * 2 + saves) / (total + ga) : null;
    var kp        = evs.filter(function(e) { return e.action === 'key_pass'; }).length;
    var bt        = evs.filter(function(e) { return e.action === 'bad_throw'; }).length;

    rows.push({
      data: [player.name, gameIds.length, total, megaSaves, _pct(msvPct), ga, _pct(svPct), _num(gds, 2), kp, bt],
      sort: gameIds.length * 100 + total,
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
      var ppS  = evs.filter(function(e) { return e.action === 'pp_scored'; }).length;
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
// Chart insertion
// ---------------------------------------------------------------------------

function _insertStatsCharts(sh, meta) {
  // Chart 1: Tore & Vorlagen pro Spieler (horizontal bar)
  if (meta.scoring && meta.scoring.dataCount > 0) {
    var namesR  = sh.getRange(meta.scoring.dataStart, 1, meta.scoring.dataCount, 1);
    var valuesR = sh.getRange(meta.scoring.dataStart, 4, meta.scoring.dataCount, 2);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(namesR).addRange(valuesR)
      .setOption('title', 'Tore & Vorlagen pro Spieler')
      .setOption('legend', { position: 'bottom' })
      .setOption('width', 500).setOption('height', Math.max(220, meta.scoring.dataCount * 28 + 80))
      .setPosition(meta.scoring.dataStart, 13, 0, 0)
      .build());
  }

  // Chart 2: Tordifferenz pro Spiel (column)
  if (meta.perGame && meta.perGame.dataCount > 0) {
    var dateR = sh.getRange(meta.perGame.dataStart, 1, meta.perGame.dataCount, 1);
    var gdR   = sh.getRange(meta.perGame.dataStart, 6, meta.perGame.dataCount, 1);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(dateR).addRange(gdR)
      .setOption('title', 'Tordifferenz pro Spiel')
      .setOption('legend', { position: 'none' })
      .setOption('vAxis', { title: 'Tordifferenz', baselineColor: '#888' })
      .setOption('width', 500).setOption('height', 280)
      .setPosition(meta.perGame.dataStart, 13, 0, 0)
      .build());
  }

  // Chart 3: Gegentore nach Ursache (pie)
  if (meta.reasons && meta.reasons.dataCount > 0) {
    var reasonR = sh.getRange(meta.reasons.dataStart, 1, meta.reasons.dataCount, 2);
    sh.insertChart(sh.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(reasonR)
      .setOption('title', 'Gegentore nach Ursache')
      .setOption('pieHole', 0.35)
      .setOption('width', 420).setOption('height', 300)
      .setPosition(meta.reasons.dataStart, 13, 0, 0)
      .build());
  }
}
