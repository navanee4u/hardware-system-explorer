/**
 * providers/registry.ts — ProviderRegistry.
 *
 * The proposer never talks to providers directly: it asks the registry, which
 * fans a query out to the enabled+available providers in priority order, tags
 * every result by source (the providers do this themselves), merges, and dedups.
 * Per-provider telemetry (provider.query / provider.result / provider.error) is
 * emitted inside each provider via ctx.bus, so nothing is hidden.
 */

import type { Component, ComponentQuery, ComponentSpecs } from "@/lib/schema";
import type {
  ComponentProvider,
  ComponentRegistry,
  ProviderContext,
  RegistryConfig,
} from "@/lib/providers/types";
import { KBProvider } from "@/lib/providers/kb";
import { WebSearchProvider } from "@/lib/providers/websearch";
import { RapidflareProvider } from "@/lib/providers/rapidflare";
import { partClassHints, type ClassHint } from "@/lib/intake";

export class ProviderRegistry implements ComponentRegistry {
  private readonly providers: ComponentProvider[];
  private readonly config: RegistryConfig;

  constructor(providers: ComponentProvider[], config: RegistryConfig) {
    this.providers = providers;
    this.config = config;
  }

  /**
   * Providers that are both enabled (name in config.order) AND available right
   * now, returned in config.order priority (earliest = highest priority).
   */
  activeProviders(): ComponentProvider[] {
    const byName = new Map(this.providers.map((p) => [p.name, p]));
    const active: ComponentProvider[] = [];
    for (const name of this.config.order) {
      const provider = byName.get(name);
      if (provider && provider.available()) active.push(provider);
    }
    return active;
  }

  /**
   * Fan out concurrently to active providers, concat results in priority order,
   * then dedup by config.dedupBy (default "part_number") with first-seen — i.e.
   * the highest-priority provider's part wins on a collision.
   */
  async search(query: ComponentQuery, ctx: ProviderContext): Promise<Component[]> {
    const active = this.activeProviders();
    const key = this.config.dedupBy ?? "part_number";

    if ((this.config.mode ?? "fanout") === "fallback") {
      // Priority order, short-circuit once the trusted KB actually SATISFIES the
      // need — so expensive providers (live web search) fire only when the KB has
      // no part that meets the spec OR none matching a named part class (e.g. an
      // "FPGA" the KB doesn't stock), not merely when it returns <N rows.
      const minResults = this.config.minResults ?? 3;
      const hints = partClassHints(query.text).filter((h) => h.subsystem === query.subsystem);
      const merged: Component[] = [];
      for (const p of active) {
        let res: Component[] = [];
        try {
          res = await p.search(query, ctx);
        } catch {
          /* providers never throw, but settle defensively */
        }
        merged.push(...res);
        if (isSufficient(dedup(merged, key), query, hints, minResults)) break;
      }
      return dedup(merged, key);
    }

    // fanout: run concurrently; settle defensively so one bad provider can't
    // reject the whole fan-out. Priority order preserved when stitching results.
    const settled = await Promise.allSettled(active.map((p) => p.search(query, ctx)));
    const merged: Component[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") merged.push(...result.value);
    }
    return dedup(merged, key);
  }
}

// ---------------------------------------------------------------------------
// Fallback sufficiency: has the KB (so far) actually met the need?
// ---------------------------------------------------------------------------

const MINIMA = new Set<keyof ComponentSpecs>([
  "ram_gb", "tops", "resolution_mp", "fps", "lanes", "chains", "torque_nm",
  "capacity_wh", "ip_rating", "peak_supply_w", "driver_current_a",
]);
const MAXIMA = new Set<keyof ComponentSpecs>(["mass_g", "cost_usd", "lead_time_days", "active_w", "peak_w", "idle_w"]);

/** Does this component meet the query's required spec thresholds? */
function satisfies(specs: ComponentSpecs, required: Partial<ComponentSpecs>): boolean {
  for (const [k, v] of Object.entries(required)) {
    if (v == null) continue;
    if (k === "temp_range_c") {
      const t = specs.temp_range_c;
      const env = v as { min: number; max: number };
      if (!t || t.min > env.min || t.max < env.max) return false;
      continue;
    }
    if (k === "bands") {
      const have = specs.bands ?? [];
      const want = (Array.isArray(v) ? (v as string[]) : []);
      if (want.length === 0 || !want.every((b) => have.includes(b))) return false;
      continue;
    }
    if (k === "sensor_interface") {
      if (specs.sensor_interface !== v) return false;
      continue;
    }
    if (typeof v === "number") {
      const have = specs[k as keyof ComponentSpecs];
      if (typeof have !== "number") return false;
      if (MINIMA.has(k as keyof ComponentSpecs) && have < v) return false;
      if (MAXIMA.has(k as keyof ComponentSpecs) && have > v) return false;
    }
    // other object keys (rails_out, envelope_mm) aren't part of a per-subsystem query
  }
  return true;
}

/** Does a part match a named part-class keyword (in its name / tags / part number)? */
function matchesKeyword(c: Component, kw: string): boolean {
  return `${c.name} ${(c.tags ?? []).join(" ")} ${c.part_number}`.toLowerCase().includes(kw);
}

/**
 * The KB is "sufficient" for this query when it returns at least one part that
 * MEETS the spec requirement AND (if the requirement names a part class for this
 * subsystem) at least one part matching that class. Otherwise we fall through to
 * the next provider (web search / Rapidflare).
 */
function isSufficient(
  parts: Component[],
  query: ComponentQuery,
  hints: ClassHint[],
  minResults: number,
): boolean {
  const req = query.required ?? {};
  const hasReq = Object.keys(req).length > 0;
  const fitOk = hasReq ? parts.some((c) => satisfies(c.specs, req)) : parts.length >= minResults;
  const classOk = hints.length === 0 || hints.some((h) => parts.some((c) => matchesKeyword(c, h.keyword)));
  return fitOk && classOk;
}

/** First-seen dedup by the chosen key; preserves input (priority) ordering. */
function dedup(components: Component[], key: "part_number" | "id"): Component[] {
  const seen = new Set<string>();
  const out: Component[] = [];
  for (const c of components) {
    const k = c[key];
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * Build a registry with the standard three providers (KB, web search, Rapidflare)
 * unless an explicit set is supplied (handy for tests / custom wiring).
 */
export function buildRegistry(
  config: RegistryConfig,
  providers?: ComponentProvider[],
): ProviderRegistry {
  const defaults = providers ?? [
    new KBProvider(),
    new WebSearchProvider(),
    new RapidflareProvider(),
  ];
  return new ProviderRegistry(defaults, config);
}
