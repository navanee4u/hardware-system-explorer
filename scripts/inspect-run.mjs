/**
 * inspect-run.mjs — read-only: show the latest stored run's component sourcing,
 * especially whether live web search / Rapidflare fired and what they found.
 * Runs persist on completion, so an in-progress run won't appear until it finishes.
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
const pool = new pg.Pool({ connectionString: url, ssl: /localhost/.test(url) ? undefined : { rejectUnauthorized: false }, max: 1 });

const { rows } = await pool.query("SELECT data, created FROM runs ORDER BY created DESC LIMIT 1");
if (!rows.length) { console.log("No runs stored yet."); await pool.end(); process.exit(0); }
const run = rows[0].data;
const ev = run.telemetry ?? [];

console.log(`\n=== LATEST RUN ===`);
console.log(`id=${run.id}  created=${run.created}  model=${run.model}`);
console.log(`requirement: ${String(run.requirement).slice(0, 110)}…`);
console.log(`candidates: ${run.candidates.map((c) => `${c.profile}${c.feasible ? "✓" : "✗"}#${c.rank}`).join("  ")}`);

const byProvider = {};
for (const e of ev) {
  if (!e.provider) continue;
  byProvider[e.provider] ??= { query: 0, result: 0, error: 0 };
  if (e.type === "provider.query") byProvider[e.provider].query++;
  if (e.type === "provider.result") byProvider[e.provider].result++;
  if (e.type === "provider.error") byProvider[e.provider].error++;
}
console.log(`\n=== PROVIDER ACTIVITY ===`);
for (const [p, c] of Object.entries(byProvider)) console.log(`  ${p}: ${c.query} queries, ${c.result} results, ${c.error} errors`);

const webFired = ev.filter((e) => e.provider === "websearch" && e.type === "provider.query");
console.log(`\n=== WEB SEARCH ===`);
if (webFired.length === 0) {
  console.log("  Web search did NOT fire (KB satisfied every subsystem).");
} else {
  console.log(`  Web search fired ${webFired.length} time(s):`);
  for (const e of ev.filter((e) => e.provider === "websearch" && (e.type === "provider.result" || e.type === "provider.error"))) {
    console.log(`   - ${e.message}` + (e.data?.parts?.length ? `  [${e.data.parts.join(", ")}]` : ""));
  }
}

// web/rapidflare parts that ended up in a final BOM
const webParts = new Set();
for (const c of run.candidates) {
  for (const list of Object.values(c.bom.subsystems ?? {})) {
    for (const part of list ?? []) {
      if (part.source === "web" || part.source === "rapidflare") {
        webParts.add(`[${part.source}] ${part.vendor} ${part.part_number} — ${part.name}${part.source_url ? "  (" + part.source_url + ")" : ""}`);
      }
    }
  }
}
console.log(`\n=== WEB/RAPIDFLARE PARTS USED IN A DESIGN ===`);
console.log(webParts.size ? [...webParts].map((s) => "  " + s).join("\n") : "  (none — all chosen parts came from the KB)");

await pool.end();
