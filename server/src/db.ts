import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

const dirSql = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sql');

/** Aplica os arquivos server/sql/*.sql em ordem. Todos são idempotentes. */
export async function migrar(p: pg.Pool = pool) {
  for (const arq of (await readdir(dirSql)).filter((f) => f.endsWith('.sql')).sort()) {
    await p.query(await readFile(path.join(dirSql, arq), 'utf8'));
  }
}
