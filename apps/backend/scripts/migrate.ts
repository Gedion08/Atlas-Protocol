import { loadEnv } from "../src/env.js";
import { buildPgPool, runMigrations } from "../src/db/bootstrap.js";

async function migrate(): Promise<void> {
  const env = loadEnv();
  const pool = buildPgPool(env.DATABASE_URL, { max: 5 });

  const applied = await runMigrations(pool);
  console.log(
    applied.length === 0
      ? "no pending migrations"
      : `${applied.length} migration(s) applied: ${applied.join(", ")}`,
  );
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
