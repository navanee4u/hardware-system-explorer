/**
 * store.ts — swappable persistence.
 *
 * Everything the system learns from must survive restarts/deploys: runs (with
 * full telemetry + provider/model I/O), DecisionRecords, Preferences, and the
 * growing component library. The Store interface hides where that lives.
 *
 *   - local/dev: FileStore (JSON/JSONL under ./data) — default.
 *   - cloud:     PostgresStore (durable) — selected when POSTGRES_URL is set,
 *                because Vercel's serverless filesystem is read-only/ephemeral.
 *
 * Swapping backends is a one-line change in getStore(); nothing else moves.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  Component,
  DecisionRecord,
  DesignRun,
  Event,
  Preference,
} from "./schema";

export interface Store {
  // Runs
  saveRun(run: DesignRun): Promise<void>;
  getRun(id: string): Promise<DesignRun | null>;
  listRuns(): Promise<DesignRun[]>;
  appendEvents(runId: string, events: Event[]): Promise<void>;

  // Outer loop
  saveDecision(decision: DecisionRecord): Promise<void>;
  savePreference(pref: Preference): Promise<void>;
  listPreferences(): Promise<Preference[]>;

  // Growing component library (dedup by part_number on write)
  upsertComponents(components: Component[]): Promise<void>;
  listComponents(): Promise<Component[]>;
}

// ---------------------------------------------------------------------------
// FileStore — local/dev. Durable on a persistent disk; NOT for serverless.
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

export class FileStore implements Store {
  private readonly dir: string;
  constructor(dir: string = DATA_DIR) {
    this.dir = dir;
  }

  private runFile(id: string) {
    return path.join(this.dir, "runs", `${id}.json`);
  }
  private get prefsFile() {
    return path.join(this.dir, "preferences.json");
  }
  private get componentsFile() {
    return path.join(this.dir, "components.json");
  }

  async saveRun(run: DesignRun): Promise<void> {
    await writeJson(this.runFile(run.id), run);
    if (run.decision) await this.saveDecision(run.decision);
  }

  async getRun(id: string): Promise<DesignRun | null> {
    return readJson<DesignRun | null>(this.runFile(id), null);
  }

  async listRuns(): Promise<DesignRun[]> {
    const dir = path.join(this.dir, "runs");
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const runs = await Promise.all(
      names
        .filter((n) => n.endsWith(".json"))
        .map((n) => readJson<DesignRun | null>(path.join(dir, n), null)),
    );
    return runs.filter((r): r is DesignRun => r !== null);
  }

  async appendEvents(runId: string, events: Event[]): Promise<void> {
    const file = path.join(this.dir, "runs", `${runId}.events.jsonl`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    const run = await this.getRun(decision.runId);
    if (run) {
      run.decision = decision;
      await writeJson(this.runFile(run.id), run);
    }
    const all = await readJson<DecisionRecord[]>(path.join(this.dir, "decisions.json"), []);
    const next = [...all.filter((d) => d.id !== decision.id), decision];
    await writeJson(path.join(this.dir, "decisions.json"), next);
  }

  async savePreference(pref: Preference): Promise<void> {
    const all = await this.listPreferences();
    const next = [...all.filter((p) => p.id !== pref.id), pref];
    await writeJson(this.prefsFile, next);
  }

  async listPreferences(): Promise<Preference[]> {
    return readJson<Preference[]>(this.prefsFile, []);
  }

  async upsertComponents(components: Component[]): Promise<void> {
    const all = await this.listComponents();
    const byPart = new Map(all.map((c) => [c.part_number, c]));
    for (const c of components) byPart.set(c.part_number, c); // dedup by part_number
    await writeJson(this.componentsFile, [...byPart.values()]);
  }

  async listComponents(): Promise<Component[]> {
    return readJson<Component[]>(this.componentsFile, []);
  }
}

// ---------------------------------------------------------------------------
// Store factory — env selects the backend
// ---------------------------------------------------------------------------

let cached: Store | null = null;

/**
 * Returns the durable Store. POSTGRES_URL present => PostgresStore (cloud);
 * otherwise FileStore (local dev). The PostgresStore is implemented in the
 * persistence phase; until then we fall back to FileStore with a warning so the
 * spine always runs.
 */
export async function getStore(): Promise<Store> {
  if (cached) return cached;
  if (process.env.POSTGRES_URL) {
    try {
      const { PostgresStore } = await import("./store.postgres");
      cached = await PostgresStore.create(process.env.POSTGRES_URL);
      return cached;
    } catch (err) {
      console.warn(
        "[store] POSTGRES_URL set but PostgresStore unavailable; falling back to FileStore.",
        err,
      );
    }
  }
  cached = new FileStore();
  return cached;
}
