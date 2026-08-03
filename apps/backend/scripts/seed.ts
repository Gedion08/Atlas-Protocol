import { loadEnv } from "../src/env.js";
import { buildPgPool, runSeed } from "../src/db/bootstrap.js";

async function seed(): Promise<void> {
  const env = loadEnv();
  const pool = buildPgPool(env.DATABASE_URL, { max: 5 });

  await runSeed(pool);
  console.log("seeded managers, strategies, vaults, ve-locks, proposals, performance, risk");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
