import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { loadEnv } from "../src/env.js";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../db/migrations");

async function ensureTrackingTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);
}

async function migrate(): Promise<void> {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  await ensureTrackingTable(pool);
  const applied = new Set(
    (await pool.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(
      (r) => r.name,
    ),
  );

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(resolve(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)", [
        file,
        Date.now(),
      ]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
      count += 1;
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${String(err)}`);
    } finally {
      client.release();
    }
  }

  console.log(count === 0 ? "no pending migrations" : `${count} migration(s) applied`);
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
