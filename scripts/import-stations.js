const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ROOT_DIR = path.join(__dirname, "..");
const DEFAULT_DB_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = process.env.DB_PATH || path.join(DEFAULT_DB_DIR, "fuel-prices.db");
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const POLAND_BBOXES = [
  { name: "north-west", south: 53.6, west: 14.0, north: 54.9, east: 16.6 },
  { name: "north-central", south: 53.6, west: 16.6, north: 54.9, east: 19.2 },
  { name: "north-east", south: 53.4, west: 19.2, north: 54.9, east: 23.95 },
  { name: "west", south: 51.9, west: 14.0, north: 53.6, east: 16.6 },
  { name: "center-west", south: 51.7, west: 16.6, north: 53.6, east: 19.2 },
  { name: "center-east", south: 51.7, west: 19.2, north: 53.6, east: 23.95 },
  { name: "south-west", south: 49.0, west: 14.0, north: 51.9, east: 17.2 },
  { name: "south-central", south: 49.0, west: 17.2, north: 51.7, east: 20.3 },
  { name: "south-east", south: 49.0, west: 20.3, north: 51.9, east: 23.95 }
];

if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    updated_at TEXT NOT NULL DEFAULT '',
    is_user_created INTEGER NOT NULL DEFAULT 1
  );
`);

ensureColumn("stations", "source", "TEXT NOT NULL DEFAULT 'manual'");
ensureColumn("stations", "updated_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("stations", "is_user_created", "INTEGER NOT NULL DEFAULT 1");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStationId(element) {
  return `osm:${element.type}/${element.id}`;
}

function toStation(element) {
  const tags = element.tags || {};
  const houseNumber = tags["addr:housenumber"] ? ` ${tags["addr:housenumber"]}` : "";

  return {
    id: getStationId(element),
    name: tags.name || tags.brand || "Stacja paliw",
    city: tags["addr:city"] || tags["addr:place"] || "Polska",
    address: tags["addr:street"] ? `${tags["addr:street"]}${houseNumber}` : "Adres nieznany",
    lat: element.lat ?? element.center?.lat,
    lon: element.lon ?? element.center?.lon
  };
}

async function fetchChunk(chunk) {
  const query = `
    [out:json][timeout:40];
    (
      node["amenity"="fuel"](${chunk.south},${chunk.west},${chunk.north},${chunk.east});
      way["amenity"="fuel"](${chunk.south},${chunk.west},${chunk.north},${chunk.east});
      relation["amenity"="fuel"](${chunk.south},${chunk.west},${chunk.north},${chunk.east});
    );
    out center tags;
  `;

  let lastError = null;

  for (const overpassUrl of OVERPASS_URLS) {
    try {
      const response = await fetch(overpassUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          "User-Agent": "ceny-paliw-import/1.0"
        },
        body: query,
        signal: AbortSignal.timeout(25000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.elements || [];
    } catch (error) {
      lastError = error;
      console.error(`Chunk ${chunk.name} failed on ${overpassUrl}: ${error.message}`);
      await wait(400);
    }
  }

  throw lastError || new Error(`Import failed for chunk ${chunk.name}`);
}

function upsertStations(stations) {
  const upsert = db.prepare(`
    INSERT INTO stations (
      id,
      name,
      city,
      address,
      lat,
      lon,
      created_by,
      created_at,
      source,
      updated_at,
      is_user_created
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      city = excluded.city,
      address = excluded.address,
      lat = excluded.lat,
      lon = excluded.lon,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);

  const now = new Date().toISOString();
  let inserted = 0;

  for (const station of stations) {
    if (!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) {
      continue;
    }

    upsert.run(
      station.id,
      station.name,
      station.city,
      station.address,
      station.lat,
      station.lon,
      "import",
      now,
      "osm",
      now,
      0
    );
    inserted += 1;
  }

  return inserted;
}

async function run() {
  const seen = new Map();

  for (const chunk of POLAND_BBOXES) {
    console.log(`Importing chunk: ${chunk.name}`);
    const elements = await fetchChunk(chunk);

    for (const element of elements) {
      const station = toStation(element);
      seen.set(station.id, station);
    }

    await wait(700);
  }

  const total = upsertStations([...seen.values()]);
  console.log(`Imported or updated ${total} stations into ${DB_PATH}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
