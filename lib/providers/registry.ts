/**
 * providers/registry.ts — ProviderRegistry.
 *
 * The proposer never talks to providers directly: it asks the registry, which
 * fans a query out to the enabled+available providers in priority order, tags
 * every result by source (the providers do this themselves), merges, and dedups.
 * Per-provider telemetry (provider.query / provider.result / provider.error) is
 * emitted inside each provider via ctx.bus, so nothing is hidden.
 */

import type { Component, ComponentQuery } from "@/lib/schema";
import type {
  ComponentProvider,
  ComponentRegistry,
  ProviderContext,
  RegistryConfig,
} from "@/lib/providers/types";
import { KBProvider } from "@/lib/providers/kb";
import { WebSearchProvider } from "@/lib/providers/websearch";
import { RapidflareProvider } from "@/lib/providers/rapidflare";

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
      // Priority order, short-circuit once we have enough — keeps expensive
      // providers (web search) dormant unless the trusted KB comes up short.
      const minResults = this.config.minResults ?? 3;
      const merged: Component[] = [];
      for (const p of active) {
        let res: Component[] = [];
        try {
          res = await p.search(query, ctx);
        } catch {
          /* providers never throw, but settle defensively */
        }
        merged.push(...res);
        if (dedup(merged, key).length >= minResults) break;
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
