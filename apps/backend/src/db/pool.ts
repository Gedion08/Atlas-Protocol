import { Pool } from "pg";
import { loadEnv } from "../env.js";

export const pool = new Pool({
  connectionString: loadEnv().DATABASE_URL,
  max: 10,
});

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
