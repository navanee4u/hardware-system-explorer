/**
 * store.postgres.ts — durable Store for cloud/serverless (Vercel).
 *
 * Serverless filesystems are read-only/ephemeral, so runs, decisions,
 * preferences, and the component library — the things the system learns from —
 * must live in Postgres to survive deploys/restarts. Tables use JSONB so the
 * row shape tracks lib/schema.ts without migrations as fields evolve.
 *
 * Activated by getStore() when POSTGRES_URL is set. Compatible with Vercel
 * Postgres / Neon / Supabase (any standard connection string).
 */

import { Pool } from "pg";
import type { Store } from "./store";
import type {
  Component,
  DecisionRecord,
  DesignRun,
  Event,
  Preference,
} from "./schema";

const DDL = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS run_events (
  run_id TEXT NOT NULL,
  seq BIGSERIAL,
  event JSONB NOT NULL,
  PRIMARY KEY (run_id, seq)
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS components (
  part_number TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
`;

export class PostgresStore implements Store {
  private constructor(private readonly pool: Pool) {}

  static async create(connectionString: string): Promise<Store> {
    // Managed Postgres (Supabase / Neon / Vercel Postgres) requires SSL; local
    // dev Postgres does not. Detect by host.
    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
    const pool = new Pool({
      connectionString,
      // Supabase/Neon use certs that don't chain to a bundled CA; accept them.
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      // Serverless: keep the per-instance pool tiny and point the URL at the
      // Supabase TRANSACTION POOLER (port 6543) so connections don't exhaust.
      max: Number(process.env.PG_POOL_MAX ?? (isLocal ? 5 : 1)),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    await pool.query(DDL);
    return new PostgresStore(pool);
  }

  async saveRun(run: DesignRun): Promise<void> {
    await this.pool.query(
      `INSERT INTO runs (id, created, data) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [run.id, run.created, run],
    );
    if (run.decision) await this.saveDecision(run.decision);
  }

  async getRun(id: string): Promise<DesignRun | null> {
    const { rows } = await this.pool.query<{ data: DesignRun }>(
      `SELECT data FROM runs WHERE id = $1`,
      [id],
    );
    return rows[0]?.data ?? null;
  }

  async listRuns(): Promise<DesignRun[]> {
    const { rows } = await this.pool.query<{ data: DesignRun }>(
      `SELECT data FROM runs ORDER BY created DESC`,
    );
    return rows.map((r) => r.data);
  }

  async appendEvents(runId: string, events: Event[]): Promise<void> {
    if (events.length === 0) return;
    const values = events.map((_, i) => `($1, $${i + 2})`).join(", ");
    await this.pool.query(
      `INSERT INTO run_events (run_id, event) VALUES ${values}`,
      [runId, ...events.map((e) => JSON.stringify(e))],
    );
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO decisions (id, run_id, ts, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [decision.id, decision.runId, decision.ts, decision],
    );
    // Mirror onto the run record so Past Designs shows the choice inline.
    const run = await this.getRun(decision.runId);
    if (run) {
      run.decision = decision;
      await this.pool.query(`UPDATE runs SET data = $2 WHERE id = $1`, [run.id, run]);
    }
  }

  async savePreference(pref: Preference): Promise<void> {
    await this.pool.query(
      `INSERT INTO preferences (id, ts, data) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [pref.id, pref.ts, pref],
    );
  }

  async listPreferences(): Promise<Preference[]> {
    const { rows } = await this.pool.query<{ data: Preference }>(
      `SELECT data FROM preferences ORDER BY ts ASC`,
    );
    return rows.map((r) => r.data);
  }

  async upsertComponents(components: Component[]): Promise<void> {
    for (const c of components) {
      await this.pool.query(
        `INSERT INTO components (part_number, data) VALUES ($1, $2)
         ON CONFLICT (part_number) DO UPDATE SET data = EXCLUDED.data`,
        [c.part_number, c],
      );
    }
  }

  async listComponents(): Promise<Component[]> {
    const { rows } = await this.pool.query<{ data: Component }>(
      `SELECT data FROM components`,
    );
    return rows.map((r) => r.data);
  }
}
