/**
 * Jets Tracker — Google Apps Script backend
 *
 * Writes to two sheets in the active spreadsheet:
 *   "Events" — one row per tracking action (appended every tap)
 *   "Games"  — one row per game, auto-created on first event (upsert by game_id)
 *
 * Setup:
 *  1. Create a new Google Sheet named e.g. "Jets Tracker 2026/27".
 *  2. Extensions → Apps Script → delete the default code → paste this file.
 *  3. Save → Deploy → New deployment.
 *     Type: Web app | Execute as: Me | Who has access: Anyone.
 *  4. Copy the deployment URL into every kader.json → game_info.script_url.
 *  5. On the first tracker event both sheets auto-create with frozen headers.
 *  6. After each game: open the Games sheet and fill in the result column.
 */

const EVENTS_SHEET = 'Events';
const GAMES_SHEET  = 'Games';

function _getOrCreate(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function _ensureEventsHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'game_id', 'game_date', 'game_start', 'opponent', 'type', 'venue', 'home',
      'period', 'timestamp', 'player_nr', 'player_name', 'action', 'assist',
      'scout', 'note', 'received_at',
    ]);
    sheet.setFrozenRows(1);
  }
}

function _ensureGamesHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'game_id', 'date', 'time', 'opponent', 'type', 'venue', 'home', 'result',
    ]);
    sheet.setFrozenRows(1);
  }
}

// Write one row to Games only if game_id not already present (idempotent)
function _upsertGame(ss, p) {
  const sheet = _getOrCreate(ss, GAMES_SHEET);
  _ensureGamesHeader(sheet);
  const ids = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat()
    : [];
  if (!ids.includes(p.game_id)) {
    sheet.appendRow([
      p.game_id    || '',
      p.game_date  || '',
      p.game_start || '',
      p.opponent   || '',
      p.type       || '',
      p.venue      || '',
      p.home       || '',
      '',              // result — filled manually after the game
    ]);
  }
}

function doPost(e) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const p    = e.parameter;
  const evSh = _getOrCreate(ss, EVENTS_SHEET);

  _ensureEventsHeader(evSh);
  evSh.appendRow([
    p.game_id     || '',
    p.game_date   || '',
    p.game_start  || '',
    p.opponent    || '',
    p.type        || '',
    p.venue       || '',
    p.home        || '',
    Number(p.period)    || 0,
    p.timestamp   || '',
    Number(p.player_nr) || 0,
    p.player_name || '',
    p.action      || '',
    p.assist      || '',
    p.scout       || '',
    p.note        || '',
    new Date(),
  ]);

  _upsertGame(ss, p);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// GET — verify the deployment URL is live
function doGet(e) {
  return ContentService
    .createTextOutput('Jets Tracker endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}
