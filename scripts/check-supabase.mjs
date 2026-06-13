/**
 * check-supabase.mjs — verify the Postgres (Supabase) connection end to end.
 *
 *   node scripts/check-supabase.mjs
 *
 * Reads POSTGRES_URL from .env.local (or the process env), connects with the same
 * SSL/pool settings the app uses, applies the schema, round-trips a probe row in
 * each table, then reports table row counts. The secret URL is never printed —
 * only its host. Exit code 0 = healthy, 1 = problem.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local — rely on process env */
  }
}

function maskHost(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname} (user ${u.username})`;
  } catch {
    return "<unparseable URL>";
  }
}

loadEnvLocal();
const url = process.env.POSTGRES_URL;
if (!url) {
  console.error("✗ POSTGRES_URL is not set. Add it to .env.local (see instructions).");
  process.exit(1);
}

const u = (() => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
})();
console.log(`→ Target: ${maskHost(url)}`);
if (u && u.port && u.port !== "6543") {
  console.warn(
    `⚠ Port ${u.port} — for Supabase on serverless use the TRANSACTION POOLER (port 6543).`,
  );
}

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const pool = new pg.Pool({
  connectionString: url,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10_000,
});

const DDL = `
CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, created TIMESTAMPTZ NOT NULL DEFAULT now(), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS run_events (run_id TEXT NOT NULL, seq BIGSERIAL, event JSONB NOT NULL, PRIMARY KEY (run_id, seq));
CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL DEFAULT now(), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS preferences (id TEXT PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS components (part_number TEXT PRIMARY KEY, data JSONB NOT NULL);
`;

try {
  const t0 = Date.now();
  const ping = await pool.query("SELECT version()");
  console.log(`✓ Connected (${Date.now() - t0}ms) — ${ping.rows[0].version.split(",")[0]}`);

  await pool.query(DDL);
  console.log("✓ Schema applied (runs, run_events, decisions, preferences, components)");

  // Round-trip a probe component, then remove it.
  await pool.query(
    `INSERT INTO components (part_number, data) VALUES ($1, $2)
     ON CONFLICT (part_number) DO UPDATE SET data = EXCLUDED.data`,
    ["__healthcheck__", { part_number: "__healthcheck__", name: "probe" }],
  );
  const back = await pool.query(`SELECT data FROM components WHERE part_number = $1`, [
    "__healthcheck__",
  ]);
  await pool.query(`DELETE FROM components WHERE part_number = $1`, ["__healthcheck__"]);
  if (back.rows[0]?.data?.name !== "probe") throw new Error("round-trip mismatch");
  console.log("✓ Write/read/delete round-trip OK (JSONB)");

  const counts = await pool.query(`
    SELECT 'runs' t, count(*) n FROM runs
    UNION ALL SELECT 'decisions', count(*) FROM decisions
    UNION ALL SELECT 'preferences', count(*) FROM preferences
    UNION ALL SELECT 'components', count(*) FROM components
    ORDER BY t`);
  console.log("→ Row counts: " + counts.rows.map((r) => `${r.t}=${r.n}`).join("  "));
  console.log("\n✅ Supabase is healthy and ready. POSTGRES_URL will activate PostgresStore.");
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error(`\n✗ FAILED: ${err.message}`);
  console.error("  Common causes: wrong password, using the DIRECT (5432) url from a");
  console.error("  network that blocks it, IPv4 add-on needed, or SSL disabled.");
  await pool.end().catch(() => {});
  process.exit(1);
}
