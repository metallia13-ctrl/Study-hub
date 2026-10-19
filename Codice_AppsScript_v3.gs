// Study Hub — sync v3: dati divisi in più celle + una versione al giorno (ultimi 30 giorni)
const SHEET_NAME = 'StudyHub';
const VERSIONS_SHEET = 'Versioni';
const CHUNK = 45000;
const KEEP_VERSIONS = 30;

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'read') return out(readMain());
  if (p.action === 'versions') {
    const sh = getSheet(VERSIONS_SHEET);
    const last = sh.getLastRow();
    const list = [];
    if (last >= 1) {
      sh.getRange(1, 1, last, 3).getValues().forEach(function (r, i) {
        if (r[0] !== '') list.push({ row: i + 1, day: unmark(r[0]), at: unmark(r[1]), size: Number(unmark(r[2])) || 0 });
      });
    }
    return out(JSON.stringify({ versions: list }));
  }
  if (p.action === 'version') {
    const sh = getSheet(VERSIONS_SHEET);
    const row = Number(p.row);
    if (!row || row > sh.getLastRow()) return out(JSON.stringify({ error: 'versione non trovata' }));
    const cols = sh.getLastColumn();
    const cells = cols > 3 ? sh.getRange(row, 4, 1, cols - 3).getValues()[0] : [];
    return out(cells.filter(function (c) { return c !== ''; }).map(unmark).join('') || '{}');
  }
  return out(JSON.stringify({ error: 'unknown action' }));
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = e.postData.contents;
    JSON.parse(body); // valida
    const sheet = getSheet(SHEET_NAME);
    const rows = [];
    for (let i = 0; i < body.length; i += CHUNK) rows.push(['~' + body.substring(i, i + CHUNK)]);
    sheet.clearContents();
    const range = sheet.getRange(1, 1, rows.length, 1);
    range.setNumberFormat('@');
    range.setValues(rows);
    try { saveVersion(body); } catch (verr) { console.error(verr); }
    return out(JSON.stringify({ ok: true, chunks: rows.length }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  } finally {
    lock.releaseLock();
  }
}

function saveVersion(body) {
  const sh = getSheet(VERSIONS_SHEET);
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const row = ['~' + day, '~' + new Date().toISOString(), '~' + body.length];
  for (let i = 0; i < body.length; i += CHUNK) row.push('~' + body.substring(i, i + CHUNK));
  const last = sh.getLastRow();
  let target = last + 1;
  if (last >= 1 && unmark(sh.getRange(last, 1).getValue()) === day) target = last;
  if (sh.getMaxColumns() < row.length) sh.insertColumnsAfter(sh.getMaxColumns(), row.length - sh.getMaxColumns());
  if (target <= last && sh.getLastColumn() > 0) sh.getRange(target, 1, 1, sh.getLastColumn()).clearContent();
  const range = sh.getRange(target, 1, 1, row.length);
  range.setNumberFormat('@');
  range.setValues([row]);
  const rows = sh.getLastRow();
  if (rows > KEEP_VERSIONS) sh.deleteRows(1, rows - KEEP_VERSIONS);
}

function readMain() {
  const sheet = getSheet(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < 1) return '{}';
  return sheet.getRange(1, 1, last, 1).getValues().map(function (r) { return unmark(r[0]); }).join('') || '{}';
}

function unmark(v) { v = String(v); return v.charAt(0) === '~' ? v.slice(1) : v; }

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function out(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}