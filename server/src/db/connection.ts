import { Database } from "bun:sqlite";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, "..", "..", "data", "creditbridge.db");

let db: Database | null = null;

/**
 * Get the singleton database connection. Initializes if not yet connected.
 */
export function getDb(): Database {
  if (!db) {
    return initDb();
  }
  return db;
}

/**
 * Initialize the database, create data directory, and run pending migrations.
 */
export function initDb(): Database {
  const dataDir = dirname(DB_PATH);
  mkdirSync(dataDir, { recursive: true });

  const database = new Database(DB_PATH, { create: true });
  database.run("PRAGMA journal_mode = WAL");
  database.run("PRAGMA foreign_keys = ON");
  db = database;

  runMigrations(database);
  console.log(`[db] Database ready at ${DB_PATH}`);
  return database;
}

/**
 * Run all SQL migration files in order that haven't been applied yet.
 */
function runMigrations(database: Database): void {
  const migrationsDir = join(__dirname, "migrations");

  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return;
  }

  // Ensure _migrations tracking table exists
  database.run(
    `CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  for (const file of files) {
    const alreadyApplied = database
      .prepare("SELECT id FROM _migrations WHERE name = ?")
      .get(file);

    if (alreadyApplied) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf-8");

    database.transaction(() => {
      database.run(sql);
      database.run("INSERT INTO _migrations (name) VALUES (?)", [file]);
    })();

    console.log(`[db] Applied migration: ${file}`);
  }
}
