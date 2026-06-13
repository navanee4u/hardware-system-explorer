/**
 * db-reset.mjs — truncate all HSE tables for a clean production start.
 *
 *   node scripts/db-reset.mjs
 *
 * Reads POSTGRES_URL from .env.local (or process env), TRUNCATEs the five tables,
 * and prints the resulting row counts. Destructive — intended for clearing test
 * data before go-live. The secret URL is never printed (host only).
 */
import { readFileSync } from "node:fs";
import pg from "pg";

function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on process env */
  }
}

loadEnvLocal();
const url = process.env.POSTGRES_URL;
if (!url) {
  console.error("✗ POSTGRES_URL not set.");
  process.exit(1);
}
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "<unparseable>";
  }
})();

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const pool = new pg.Pool({
  connectionString: url,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  console.log(`→ Resetting tables on ${host}`);
  await pool.query(
    `TRUNCATE runs, run_events, decisions, preferences, components RESTART IDENTITY`,
  );
  const counts = await pool.query(`
    SELECT 'runs' t, count(*) n FROM runs
    UNION ALL SELECT 'run_events', count(*) FROM run_events
    UNION ALL SELECT 'decisions', count(*) FROM decisions
    UNION ALL SELECT 'preferences', count(*) FROM preferences
    UNION ALL SELECT 'components', count(*) FROM components
    ORDER BY t`);
  console.log("✓ Truncated. Row counts: " + counts.rows.map((r) => `${r.t}=${r.n}`).join("  "));
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error(`✗ FAILED: ${err.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
}
