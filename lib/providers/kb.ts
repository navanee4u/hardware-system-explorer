/**
 * providers/kb.ts — KBProvider.
 *
 * The trusted, offline, always-available provider. It searches the curated
 * in-repo knowledge base (lib/kb/parts.ts), filters by subsystem, and ranks
 * candidates by how well their honest specs meet the query's `required`
 * thresholds. No network, no surprises — this is the floor every run can rely on.
 *
 * Telemetry: emits provider.query before searching, provider.result after, and
 * provider.error (returning []) if anything throws. Never throws out of search().
 */

import type { Component, ComponentQuery, ComponentSpecs, Source } from "@/lib/schema";
import type { ComponentProvider, ProviderContext } from "@/lib/providers/types";
import { KB_COMPONENTS } from "@/lib/kb/parts";

const DEFAULT_LIMIT = 8;

export class KBProvider implements ComponentProvider {
  readonly name = "kb";
  readonly source: Source = "kb";

  /** The KB ships in the repo: always available, no creds, fully offline. */
  available(): boolean {
    return true;
  }

  async search(query: ComponentQuery, ctx: ProviderContext): Promise<Component[]> {
    const required = query.required ?? {};
    const limit = query.limit ?? DEFAULT_LIMIT;
    const started = Date.now();

    ctx.bus.emit({
      type: "provider.query",
      provider: this.name,
      source: this.source,
      candidate: ctx.candidate,
      message: `kb: searching ${query.subsystem}`,
      data: { subsystem: query.subsystem, required },
    });

    try {
      // 1. Filter by subsystem.
      const matches = KB_COMPONENTS.filter((c) => c.subsystem === query.subsystem);

      // 2. Rank by how well each part's specs meet the required thresholds.
      //    Higher score = meets more thresholds with more headroom.
      const ranked = matches
        .map((c) => ({ component: c, score: scoreAgainstRequired(c.specs, required) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        // Tag every returned part with this provider's source (honest provenance).
        .map(({ component }) => ({ ...component, source: this.source }));

      ctx.bus.emit({
        type: "provider.result",
        provider: this.name,
        source: this.source,
        candidate: ctx.candidate,
        message: `kb: ${ranked.length} part(s) for ${query.subsystem}`,
        data: {
          count: ranked.length,
          parts: ranked.map((c) => c.part_number),
          latency_ms: Date.now() - started,
        },
      });

      return ranked;
    } catch (err) {
      ctx.bus.emit({
        type: "provider.error",
        provider: this.name,
        source: this.source,
        candidate: ctx.candidate,
        message: `kb: search failed for ${query.subsystem}: ${errMsg(err)}`,
        data: {
          subsystem: query.subsystem,
          required,
          latency_ms: Date.now() - started,
          error: errMsg(err),
        },
      });
      return [];
    }
  }
}

/**
 * Simple, deterministic scoring: for each required field present, award points
 * when the candidate meets the threshold (preferring more headroom), and zero
 * when it fails or the data is missing. The verifier remains the source of truth
 * for pass/fail — this only orders likely-good candidates first.
 */
function scoreAgainstRequired(specs: ComponentSpecs, required: Partial<ComponentSpecs>): number {
  let score = 0;

  // "Higher is better" minima — meeting the floor scores, headroom adds a little.
  for (const key of MINIMA) {
    const req = required[key];
    const have = specs[key];
    if (typeof req !== "number") continue;
    if (typeof have !== "number") continue; // missing data: no credit, no throw
    if (have >= req) score += 1 + headroom(have, req);
  }

  // "Lower is better" maxima — being under budget scores, more slack adds a little.
  for (const key of MAXIMA) {
    const req = required[key];
    const have = specs[key];
    if (typeof req !== "number") continue;
    if (typeof have !== "number") continue;
    if (have <= req) score += 1 + headroom(req, have);
  }

  // Interface coverage: candidate offers an interface the query asks for.
  const reqIfaces = required.interfaces_provided;
  const haveIfaces = specs.interfaces_provided;
  if (Array.isArray(reqIfaces) && Array.isArray(haveIfaces)) {
    const covered = reqIfaces.filter((i) => haveIfaces.includes(i)).length;
    score += covered;
  }

  return score;
}

/** Bounded 0..1 bonus for headroom of `value` over `threshold`. */
function headroom(value: number, threshold: number): number {
  if (threshold <= 0) return 0;
  const ratio = (value - threshold) / threshold;
  return Math.max(0, Math.min(1, ratio));
}

/** Numeric spec fields where a larger value is better (must clear a minimum). */
const MINIMA = [
  "tops",
  "ram_gb",
  "capacity_wh",
  "peak_supply_w",
  "resolution_mp",
  "fps",
  "torque_nm",
  "driver_current_a",
  "ip_rating",
  "chains",
  "lanes",
] as const satisfies readonly (keyof ComponentSpecs)[];

/** Numeric spec fields where a smaller value is better (must stay under budget). */
const MAXIMA = [
  "mass_g",
  "cost_usd",
  "lead_time_days",
  "active_w",
  "peak_w",
  "idle_w",
] as const satisfies readonly (keyof ComponentSpecs)[];

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
