import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import type { FeatureCollection, Feature } from 'geojson';

const SQLITE_WASM_PATH = '/sql-wasm.wasm';
const DB_STORAGE_KEY = 'wildfire_sqlite_db_v2';

let sqlJsInstance: Promise<SqlJsStatic> | null = null;
let dbInstance: Promise<Database> | null = null;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.warn(
      'Local storage unavailable, database will be in-memory.',
      error
    );
    return null;
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsInstance) {
    sqlJsInstance = initSqlJs({
      locateFile: (file: string) => {
        if (file === 'sql-wasm.wasm') {
          return SQLITE_WASM_PATH;
        }
        return `/${file}`;
      },
    });
  }
  return sqlJsInstance;
}

function ensureSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      brightness REAL NOT NULL,
      scan REAL,
      track REAL,
      acq_date TEXT NOT NULL,
      acq_time TEXT NOT NULL,
      satellite TEXT NOT NULL,
      confidence INTEGER,
      version TEXT,
      bright_t31 REAL,
      frp REAL,
      daynight TEXT,
      UNIQUE(country_code, latitude, longitude, acq_date, acq_time, satellite)
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_observations_country_code
      ON observations(country_code)
  `);
}

function hydrateDatabase(SQL: SqlJsStatic): Database {
  const storage = getStorage();
  if (!storage) {
    const db = new SQL.Database();
    ensureSchema(db);
    return db;
  }
  const stored = storage.getItem(DB_STORAGE_KEY);
  if (stored) {
    try {
      const db = new SQL.Database(base64ToUint8Array(stored));
      ensureSchema(db);
      return db;
    } catch (error) {
      console.error(
        'Failed to restore SQLite database, creating a new one.',
        error
      );
      storage.removeItem(DB_STORAGE_KEY);
    }
  }
  const db = new SQL.Database();
  ensureSchema(db);
  return db;
}

async function getDatabase(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = (async () => {
      const SQL = await loadSqlJs();
      return hydrateDatabase(SQL);
    })();
  }
  return dbInstance;
}

function persistDatabase(db: Database) {
  const storage = getStorage();
  if (!storage) return;
  const exported = db.export();
  storage.setItem(DB_STORAGE_KEY, uint8ArrayToBase64(exported));
}
export interface ObservationRecord {
  latitude: number;
  longitude: number;
  brightness: number;
  scan: number | null;
  track: number | null;
  acq_date: string;
  acq_time: string;
  satellite: string;
  confidence: number | null;
  version: string | null;
  bright_t31: number | null;
  frp: number | null;
  daynight: string | null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeObservation(
  raw: Record<string, any>
): ObservationRecord | null {
  const latitude = toNumber(raw.latitude);
  const longitude = toNumber(raw.longitude);
  const brightness = toNumber(raw.brightness);
  if (latitude === null || longitude === null || brightness === null) {
    return null;
  }

  const scan = toNumber(raw.scan);
  const track = toNumber(raw.track);
  const brightT31 = toNumber(raw.bright_t31);
  const frp = toNumber(raw.frp);
  const confidence = toNumber(raw.confidence);

  const acqDate = raw.acq_date ? String(raw.acq_date) : null;
  const acqTime = raw.acq_time ? String(raw.acq_time) : null;
  const satellite = raw.satellite ? String(raw.satellite) : null;
  const daynight = raw.daynight ? String(raw.daynight) : null;
  const version = raw.version ? String(raw.version) : null;

  if (!acqDate || !acqTime || !satellite) {
    return null;
  }

  return {
    latitude,
    longitude,
    brightness,
    scan,
    track,
    acq_date: acqDate,
    acq_time: acqTime,
    satellite,
    confidence,
    version,
    bright_t31: brightT31,
    frp,
    daynight,
  };
}

export async function replaceCountryObservations(
  countryCode: string,
  rawRows: Record<string, any>[]
): Promise<void> {
  const db = await getDatabase();
  const normalized = rawRows
    .map((row) => normalizeObservation(row))
    .filter((row): row is ObservationRecord => Boolean(row));

  db.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const deleteStatement = db.prepare(
      'DELETE FROM observations WHERE country_code = ?'
    );
    deleteStatement.bind([countryCode]);
    deleteStatement.run();
    deleteStatement.free();

    if (normalized.length) {
      const insertStatement = db.prepare(`
        INSERT OR REPLACE INTO observations (
          country_code,
          latitude,
          longitude,
          brightness,
          scan,
          track,
          acq_date,
          acq_time,
          satellite,
          confidence,
          version,
          bright_t31,
          frp,
          daynight
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of normalized) {
        insertStatement.run([
          countryCode,
          row.latitude,
          row.longitude,
          row.brightness,
          row.scan,
          row.track,
          row.acq_date,
          row.acq_time,
          row.satellite,
          row.confidence,
          row.version,
          row.bright_t31,
          row.frp,
          row.daynight,
        ]);
      }
      insertStatement.free();
    }

    db.run('COMMIT');
    try {
      persistDatabase(db);
    } catch (storageError) {
      console.warn('Failed to persist wildfire observations DB', storageError);
    }
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function rowToFeature(row: any): Feature {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [Number(row.longitude), Number(row.latitude)],
    },
    properties: {
      id: row.id,
      brightness: row.brightness,
      scan: row.scan,
      track: row.track,
      acq_date: row.acq_date,
      acq_time: row.acq_time,
      satellite: row.satellite,
      confidence: row.confidence,
      version: row.version,
      bright_t31: row.bright_t31,
      frp: row.frp,
      daynight: row.daynight,
    },
  };
}

export async function readCountriesGeoJson(
  countryCodes: string[]
): Promise<Record<string, FeatureCollection>> {
  const db = await getDatabase();
  const result: Record<string, FeatureCollection> = {};
  if (!countryCodes.length) {
    return result;
  }
  const placeholders = countryCodes.map(() => '?').join(',');
  const statement = db.prepare(
    `SELECT * FROM observations WHERE country_code IN (${placeholders})`
  );
  statement.bind(countryCodes);
  for (const code of countryCodes) {
    result[code] = { type: 'FeatureCollection', features: [] };
  }
  while (statement.step()) {
    const row = statement.getAsObject();
    const code = String(row.country_code);
    if (!result[code]) {
      result[code] = { type: 'FeatureCollection', features: [] };
    }
    (result[code].features as Feature[]).push(rowToFeature(row));
  }
  statement.free();
  return result;
}

export async function clearObservations(): Promise<void> {
  const db = await getDatabase();
  db.run('DELETE FROM observations');
  persistDatabase(db);
}
