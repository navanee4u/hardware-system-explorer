/**
 * learning-report.mjs — read-only summary of what the system has learned from
 * human inputs: every DecisionRecord, the distilled Preferences, the agreement
 * rate, and the resulting effective ranking weights. Reads POSTGRES_URL from
 * .env.local. Never writes. Never prints the secret.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const url = process.env.POSTGRES_URL;
if (!url) { console.error("POSTGRES_URL not set"); process.exit(1); }
const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false }, max: 1 });

const AXES = ["size", "weight", "power", "cost", "margin"];
function effectiveWeights(prefs) {
  const w = { size: 0.2, weight: 0.2, power: 0.2, cost: 0.2, margin: 0.2 };
  for (const p of prefs) if (p.weights) for (const a of AXES) if (typeof p.weights[a] === "number") w[a] = Math.max(0.02, Math.min(0.6, w[a] + p.weights[a]));
  const sum = AXES.reduce((s, a) => s + w[a], 0);
  for (const a of AXES) w[a] = +(w[a] / sum).toFixed(3);
  return w;
}

const q = async (sql) => (await pool.query(sql)).rows;
try {
  const [runs] = await q(`SELECT count(*)::int n FROM runs`);
  const [comps] = await q(`SELECT count(*)::int n FROM components`);
  const decisions = (await q(`SELECT data FROM decisions ORDER BY ts ASC`)).map((r) => r.data);
  const prefs = (await q(`SELECT data FROM preferences ORDER BY ts ASC`)).map((r) => r.data);

  console.log(`\n=== BACKEND LEARNING REPORT ===`);
  console.log(`Runs stored: ${runs.n}   Components in library: ${comps.n}`);
  console.log(`Decisions recorded: ${decisions.length}   Preferences distilled: ${prefs.length}`);

  const picked = decisions.filter((d) => d.chosen != null);
  const agreed = picked.filter((d) => d.agreed).length;
  console.log(`\n-- Agreement (agent #1 == human pick) --`);
  console.log(picked.length ? `  ${agreed}/${picked.length} = ${Math.round((agreed / picked.length) * 100)}%   (+ ${decisions.length - picked.length} 'rejected all')` : "  (no decisions with a pick yet)");

  console.log(`\n-- Human decisions --`);
  if (!decisions.length) console.log("  (none yet)");
  for (const d of decisions) {
    const verdict = d.chosen == null ? "REJECTED ALL" : d.agreed ? `agreed (#1 ${d.agentTop})` : `DISAGREED: chose ${d.chosen} over #1 ${d.agentTop}`;
    console.log(`  • [${(d.ts || "").slice(0, 16)}] ${verdict}${d.notes ? `\n      note: "${d.notes}"` : ""}`);
  }

  console.log(`\n-- Distilled preferences --`);
  if (!prefs.length) console.log("  (none yet)");
  for (const p of prefs) {
    const detail = p.weights ? JSON.stringify(p.weights) : p.bias ? JSON.stringify(p.bias) : "";
    console.log(`  • [${p.kind}/${p.source}] ${p.statement}  ${detail}`);
  }

  console.log(`\n-- Effective ranking weights now (vs 0.2 default each) --`);
  const w = effectiveWeights(prefs);
  console.log("  " + AXES.map((a) => `${a}=${w[a]}`).join("  "));
  console.log();
  await pool.end();
} catch (e) {
  console.error("FAILED:", e.message);
  await pool.end().catch(() => {});
  process.exit(1);
}
