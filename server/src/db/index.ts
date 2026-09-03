import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

let instance: DB | null = null;

export const openDb = (file?: string): DB => {
  const path = file ?? process.env.DB_PATH ?? join(here, '../../data/assessment.db');
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  return db;
};

export const getDb = (): DB => (instance ??= openDb());

/** Test helper — an isolated in-memory database with the schema applied. */
export const openMemoryDb = (): DB => openDb(':memory:');

export const setDb = (db: DB): void => {
  instance = db;
};
