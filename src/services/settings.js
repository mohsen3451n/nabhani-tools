const db = require('../db');
function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row && row.value ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}
function getAllSettings(keys) {
  const result = {};
  for (const k of keys) result[k] = getSetting(k, '');
  return result;
}
module.exports = { getSetting, setSetting, getAllSettings };
