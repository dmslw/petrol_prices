const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT_DIR = __dirname;
const DEFAULT_DB_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = process.env.DB_PATH || path.join(DEFAULT_DB_DIR, "fuel-prices.db");
const DB_DIR = path.dirname(DB_PATH);
const SESSION_COOKIE = "fuel_session";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const seedReports = [
  {
    stationId: "node/1",
    stationName: "ORLEN",
    city: "Warszawa",
    address: "ul. Pulawska 120",
    fuelType: "PB95",
    price: 6.47,
    author: "Kamil",
    createdAt: "2026-04-10T08:15:00.000Z"
  },
  {
    stationId: "node/2",
    stationName: "BP",
    city: "Gdansk",
    address: "al. Grunwaldzka 211",
    fuelType: "ON",
    price: 6.59,
    author: "Ania",
    createdAt: "2026-04-10T09:05:00.000Z"
  },
  {
    stationId: "node/3",
    stationName: "Shell",
    city: "Wroclaw",
    address: "ul. Legnicka 54",
    fuelType: "LPG",
    price: 3.12,
    author: "Marek",
    createdAt: "2026-04-09T18:40:00.000Z"
  }
];

const seedStations = [
  {
    id: "node/1",
    name: "ORLEN",
    city: "Warszawa",
    address: "ul. Pulawska 120",
    lat: 52.1674,
    lon: 21.0237
  },
  {
    id: "node/2",
    name: "BP",
    city: "Gdansk",
    address: "al. Grunwaldzka 211",
    lat: 54.4049,
    lon: 18.5752
  },
  {
    id: "node/3",
    name: "Shell",
    city: "Wroclaw",
    address: "ul. Legnicka 54",
    lat: 51.1182,
    lon: 16.9887
  }
];

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
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
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    station_name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    fuel_type TEXT NOT NULL,
    price REAL NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

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

const reportCountRow = db.prepare("SELECT COUNT(*) AS count FROM reports").get();
if (reportCountRow.count === 0) {
  const insertSeed = db.prepare(`
    INSERT INTO reports (
      station_id,
      station_name,
      city,
      address,
      fuel_type,
      price,
      author,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const report of seedReports) {
    insertSeed.run(
      report.stationId,
      report.stationName,
      report.city,
      report.address,
      report.fuelType,
      report.price,
      report.author,
      report.createdAt
    );
  }
}

const stationCountRow = db.prepare("SELECT COUNT(*) AS count FROM stations").get();
if (stationCountRow.count === 0) {
  const insertSeedStation = db.prepare(`
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
  `);

  for (const station of seedStations) {
    const now = new Date().toISOString();
    insertSeedStation.run(
      station.id,
      station.name,
      station.city,
      station.address,
      station.lat,
      station.lon,
      "system",
      now,
      "seed",
      now,
      0
    );
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  const [salt, originalHash] = String(storedValue).split(":");
  if (!salt || !originalHash) {
    return false;
  }

  const candidateHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(candidateHash, "hex"));
}

function ensureAdminUser() {
  const existingAdmin = db
    .prepare("SELECT id, username FROM users WHERE role = 'admin' LIMIT 1")
    .get();
  if (existingAdmin) {
    if (existingAdmin.username !== ADMIN_USERNAME) {
      db.prepare("UPDATE users SET username = ? WHERE id = ?").run(
        ADMIN_USERNAME,
        existingAdmin.id
      );
    }
    return;
  }

  db.prepare(`
    INSERT INTO users (username, password_hash, role, created_at)
    VALUES (?, ?, 'admin', ?)
  `).run(ADMIN_USERNAME, hashPassword(ADMIN_PASSWORD), new Date().toISOString());
}

ensureAdminUser();

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...rest] = part.split("=");
        return [name, decodeURIComponent(rest.join("="))];
      })
  );
}

function getCurrentUser(request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return null;
  }

  return (
    db
      .prepare(`
        SELECT
          users.id,
          users.username,
          users.role,
          users.created_at AS createdAt
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = ?
      `)
      .get(token) || null
  );
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at)
    VALUES (?, ?, ?)
  `).run(token, userId, new Date().toISOString());
  return token;
}

function clearSession(request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return;
  }

  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function sanitizeUser(user) {
  return user
    ? {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      }
    : null;
}

function listReports() {
  return db
    .prepare(`
      SELECT
        id,
        station_id AS stationId,
        station_name AS stationName,
        city,
        address,
        fuel_type AS fuelType,
        price,
        author,
        created_at AS createdAt
      FROM reports
      ORDER BY datetime(created_at) DESC, id DESC
    `)
    .all();
}

function getReportById(id) {
  return db
    .prepare(`
      SELECT
        id,
        station_id AS stationId,
        station_name AS stationName,
        city,
        address,
        fuel_type AS fuelType,
        price,
        author,
        created_at AS createdAt
      FROM reports
      WHERE id = ?
    `)
    .get(id);
}

function insertReport(payload, author) {
  return db
    .prepare(`
      INSERT INTO reports (
        station_id,
        station_name,
        city,
        address,
        fuel_type,
        price,
        author,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      payload.stationId.trim(),
      payload.stationName.trim(),
      payload.city.trim(),
      payload.address.trim(),
      payload.fuelType.trim(),
      Number(payload.price),
      author,
      new Date().toISOString()
    );
}

function listUsers() {
  return db
    .prepare(`
      SELECT
        id,
        username,
        role,
        created_at AS createdAt
      FROM users
      ORDER BY datetime(created_at) DESC, id DESC
    `)
    .all();
}

function listStations() {
  return db
    .prepare(`
      SELECT
        id,
        name,
        city,
        address,
      lat,
      lon,
      created_by AS createdBy,
      created_at AS createdAt,
      source,
      updated_at AS updatedAt,
      is_user_created AS isUserCreated
      FROM stations
      ORDER BY name ASC, city ASC
    `)
    .all();
}

function getStationById(id) {
  return db
    .prepare(`
      SELECT
        id,
        name,
        city,
        address,
      lat,
      lon,
      created_by AS createdBy,
      created_at AS createdAt,
      source,
      updated_at AS updatedAt,
      is_user_created AS isUserCreated
      FROM stations
      WHERE id = ?
    `)
    .get(id);
}

function insertStation(payload, username) {
  const stationId = createStationId();
  db.prepare(`
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
  `).run(
    stationId,
    payload.name.trim(),
    payload.city.trim(),
    payload.address.trim(),
    Number(payload.lat),
    Number(payload.lon),
    username,
    new Date().toISOString(),
    "manual",
    new Date().toISOString(),
    1
  );
  return stationId;
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendNotFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function sendMethodNotAllowed(response) {
  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Method not allowed");
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    return JSON.parse(rawBody || "{}");
  } catch (error) {
    sendJson(response, 400, { error: "Niepoprawny JSON." });
    return null;
  }
}

function requireAuth(request, response) {
  const user = getCurrentUser(request);
  if (!user) {
    sendJson(response, 401, { error: "Musisz sie zalogowac." });
    return null;
  }

  return user;
}

function requireAdmin(request, response) {
  const user = requireAuth(request, response);
  if (!user) {
    return null;
  }

  if (user.role !== "admin") {
    sendJson(response, 403, { error: "Brak dostepu admina." });
    return null;
  }

  return user;
}

function validateReport(payload) {
  if (!payload || typeof payload !== "object") {
    return "Niepoprawne dane.";
  }

  for (const field of ["stationId", "stationName", "city", "address", "fuelType"]) {
    if (typeof payload[field] !== "string" || !payload[field].trim()) {
      return `Pole ${field} jest wymagane.`;
    }
  }

  const price = Number(payload.price);
  if (!Number.isFinite(price) || price <= 0) {
    return "Cena musi byc liczba wieksza od zera.";
  }

  return null;
}

function validateAuthPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Niepoprawne dane.";
  }

  if (typeof payload.username !== "string" || payload.username.trim().length < 3) {
    return "Login musi miec co najmniej 3 znaki.";
  }

  if (typeof payload.password !== "string" || payload.password.length < 4) {
    return "Haslo musi miec co najmniej 4 znaki.";
  }

  return null;
}

function validatePasswordChangePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Niepoprawne dane.";
  }

  if (typeof payload.currentPassword !== "string" || !payload.currentPassword) {
    return "Podaj obecne haslo.";
  }

  if (typeof payload.newPassword !== "string" || payload.newPassword.length < 4) {
    return "Nowe haslo musi miec co najmniej 4 znaki.";
  }

  return null;
}

function createStationId() {
  return `custom/${crypto.randomUUID()}`;
}

function validateStationPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Niepoprawne dane stacji.";
  }

  for (const field of ["name", "city", "address"]) {
    if (typeof payload[field] !== "string" || !payload[field].trim()) {
      return `Pole ${field} jest wymagane.`;
    }
  }

  const lat = Number(payload.lat);
  const lon = Number(payload.lon);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return "Niepoprawna szerokosc geograficzna.";
  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return "Niepoprawna dlugosc geograficzna.";
  }

  return null;
}

async function handleAuthApi(request, response, pathname) {
  if (pathname === "/api/auth/register" && request.method === "POST") {
    const payload = await readJsonBody(request, response);
    if (!payload) {
      return;
    }

    const validationError = validateAuthPayload(payload);
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const username = payload.username.trim();
    const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (exists) {
      sendJson(response, 409, { error: "Taki login juz istnieje." });
      return;
    }

    const createdAt = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, role, created_at)
      VALUES (?, ?, 'user', ?)
    `).run(username, hashPassword(payload.password), createdAt);

    const token = createSession(result.lastInsertRowid);
    const user = sanitizeUser(
      db.prepare("SELECT id, username, role, created_at AS createdAt FROM users WHERE id = ?").get(
        result.lastInsertRowid
      )
    );

    sendJson(
      response,
      201,
      { user },
      {
        "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax`
      }
    );
    return;
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    const payload = await readJsonBody(request, response);
    if (!payload) {
      return;
    }

    const userRow = db
      .prepare("SELECT id, username, role, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE username = ?")
      .get(String(payload.username || "").trim());

    if (!userRow || !verifyPassword(String(payload.password || ""), userRow.passwordHash)) {
      sendJson(response, 401, { error: "Niepoprawny login lub haslo." });
      return;
    }

    const token = createSession(userRow.id);
    sendJson(
      response,
      200,
      { user: sanitizeUser(userRow) },
      {
        "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax`
      }
    );
    return;
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    clearSession(request);
    sendJson(
      response,
      200,
      { ok: true },
      {
        "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
      }
    );
    return;
  }

  if (pathname === "/api/auth/change-password" && request.method === "POST") {
    const user = requireAuth(request, response);
    if (!user) {
      return;
    }

    const payload = await readJsonBody(request, response);
    if (!payload) {
      return;
    }

    const validationError = validatePasswordChangePayload(payload);
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const userRow = db
      .prepare("SELECT id, password_hash AS passwordHash FROM users WHERE id = ?")
      .get(user.id);

    if (!userRow || !verifyPassword(payload.currentPassword, userRow.passwordHash)) {
      sendJson(response, 401, { error: "Obecne haslo jest niepoprawne." });
      return;
    }

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      hashPassword(payload.newPassword),
      user.id
    );

    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/auth/me" && request.method === "GET") {
    sendJson(response, 200, { user: sanitizeUser(getCurrentUser(request)) });
    return;
  }

  sendNotFound(response);
}

async function handleReportsApi(request, response, pathname) {
  if (pathname === "/api/reports" && request.method === "GET") {
    sendJson(response, 200, listReports());
    return;
  }

  if (pathname === "/api/reports" && request.method === "POST") {
    const user = requireAuth(request, response);
    if (!user) {
      return;
    }

    const payload = await readJsonBody(request, response);
    if (!payload) {
      return;
    }

    const validationError = validateReport(payload);
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const result = insertReport(payload, user.username);
    sendJson(response, 201, getReportById(result.lastInsertRowid));
    return;
  }

  if (pathname.startsWith("/api/reports/") && request.method === "DELETE") {
    const admin = requireAdmin(request, response);
    if (!admin) {
      return;
    }

    const id = Number(pathname.split("/").pop());
    if (!Number.isInteger(id) || id <= 0) {
      sendJson(response, 400, { error: "Niepoprawne id zgloszenia." });
      return;
    }

    db.prepare("DELETE FROM reports WHERE id = ?").run(id);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendNotFound(response);
}

async function handleAdminApi(request, response, pathname) {
  if (pathname === "/api/admin/overview" && request.method === "GET") {
    const admin = requireAdmin(request, response);
    if (!admin) {
      return;
    }

    sendJson(response, 200, {
      users: listUsers(),
      reports: listReports()
    });
    return;
  }

  sendNotFound(response);
}

async function handleStationsApi(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, { stations: listStations() });
    return;
  }

  if (request.method !== "POST") {
    sendMethodNotAllowed(response);
    return;
  }

  const user = requireAuth(request, response);
  if (!user) {
    return;
  }

  const payload = await readJsonBody(request, response);
  if (!payload) {
    return;
  }

  const validationError = validateStationPayload(payload);
  if (validationError) {
    sendJson(response, 400, { error: validationError });
    return;
  }

  const stationId = insertStation(payload, user.username);
  sendJson(response, 201, getStationById(stationId));
}

async function handleApi(request, response, pathname) {
  try {
    if (pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname === "/api/stations") {
      await handleStationsApi(request, response);
      return;
    }

    if (pathname.startsWith("/api/auth/")) {
      await handleAuthApi(request, response, pathname);
      return;
    }

    if (pathname === "/api/auth/me") {
      await handleAuthApi(request, response, pathname);
      return;
    }

    if (pathname.startsWith("/api/reports")) {
      await handleReportsApi(request, response, pathname);
      return;
    }

    if (pathname.startsWith("/api/admin/")) {
      await handleAdminApi(request, response, pathname);
      return;
    }

    sendNotFound(response);
  } catch (error) {
    console.error("Blad API:", error);
    sendJson(response, 500, { error: "Blad serwera." });
  }
}

async function handleStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = path.normalize(safePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT_DIR, normalizedPath);

  if (!filePath.startsWith(ROOT_DIR)) {
    sendNotFound(response);
    return;
  }

  try {
    const data = await fsp.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
    });
    response.end(data);
  } catch (error) {
    sendNotFound(response);
  }
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }

    await handleStatic(response, pathname);
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`Serwer dziala na http://${HOST}:${PORT}`);
    console.log(`SQLite DB: ${DB_PATH}`);
  });
}

module.exports = {
  createServer
};
