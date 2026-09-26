import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory and JSON database file path
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'licenses.json');

// Ensure directory and database file exist
function initDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

// Read database
function readDb() {
  initDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('[DB] Error reading licenses database:', err);
    return {};
  }
}

// Write database
function writeDb(data) {
  initDb();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Error writing licenses database:', err);
  }
}

export const licenseDb = {
  getLicense(deviceId) {
    if (!deviceId) return null;
    const db = readDb();
    return db[deviceId] || null;
  },

  isLicensed(deviceId) {
    if (!deviceId) return false;
    const entry = this.getLicense(deviceId);
    return Boolean(entry && entry.licensed);
  },

  setLicense(deviceId, details = {}) {
    if (!deviceId) return false;
    const db = readDb();
    db[deviceId] = {
      licensed: true,
      updatedAt: new Date().toISOString(),
      ...details,
    };
    writeDb(db);
    return true;
  },

  revokeLicense(deviceId) {
    if (!deviceId) return false;
    const db = readDb();
    if (db[deviceId]) {
      db[deviceId].licensed = false;
      db[deviceId].updatedAt = new Date().toISOString();
      writeDb(db);
      return true;
    }
    return false;
  },
};

export default licenseDb;
