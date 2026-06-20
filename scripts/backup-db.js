const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ROOT_DIR = path.join(__dirname, "..");
const DEFAULT_DB_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = process.env.DB_PATH || path.join(DEFAULT_DB_DIR, "fuel-prices.db");
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), "backups");
const KEEP_BACKUPS = Math.max(1, Number(process.env.BACKUP_KEEP || 14));

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function pruneOldBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith("fuel-prices-") && name.endsWith(".db"))
    .map((name) => ({
      name,
      mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(KEEP_BACKUPS)) {
    fs.rmSync(path.join(BACKUP_DIR, file.name), { force: true });
    console.log(`Usunieto stara kopie: ${file.name}`);
  }
}

function run() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Nie znaleziono bazy danych: ${DB_PATH}`);
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const target = path.join(BACKUP_DIR, `fuel-prices-${timestamp()}.db`);

  // VACUUM INTO tworzy spojna kopie bazy nawet przy aktywnym serwerze.
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }

  pruneOldBackups();

  const sizeKb = (fs.statSync(target).size / 1024).toFixed(1);
  console.log(`Kopia zapasowa zapisana: ${target} (${sizeKb} KB)`);
}

try {
  run();
} catch (error) {
  console.error(`Backup nie powiodl sie: ${error.message}`);
  process.exitCode = 1;
}
