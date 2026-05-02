/**
 * Jets Tracker — Google Apps Script backend
 *
 * Setup:
 *  1. Open Google Sheets → Extensions → Apps Script → paste this file.
 *  2. Create a sheet named "Events" (or rename the first sheet).
 *  3. Deploy → New deployment → Web app.
 *     Execute as: Me | Who has access: Anyone.
 *  4. Copy the deployment URL into kader.json → game_info.script_url.
 *
 * Column layout written to the sheet:
 *   A: game_id  B: opponent  C: period  D: timestamp  E: player_nr
 *   F: player_name  G: action  H: received_at (server time)
 */

const SHEET_NAME = 'Events';

function _sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
}

function _ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'game_id', 'opponent', 'period', 'timestamp',
      'player_nr', 'player_name', 'action', 'received_at',
    ]);
    sheet.setFrozenRows(1);
  }
}

function doPost(e) {
  const sheet = _sheet();
  _ensureHeader(sheet);

  const p = e.parameter;
  sheet.appendRow([
    p.game_id    || '',
    p.opponent   || '',
    Number(p.period)    || 0,
    p.timestamp  || '',
    Number(p.player_nr) || 0,
    p.player_name || '',
    p.action     || '',
    new Date(),
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// GET endpoint — useful for verifying the deployment URL is live
function doGet(e) {
  return ContentService
    .createTextOutput('Jets Tracker endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}
