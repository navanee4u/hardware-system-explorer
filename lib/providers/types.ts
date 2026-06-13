/**
 * providers/types.ts — the modular component-sourcing contract.
 *
 * Component discovery is pluggable and configurable, never hardcoded to the KB.
 * The proposer asks the ProviderRegistry; the registry fans out to enabled
 * providers in priority order, tags every result with its source, dedups by part
 * number, and emits telemetry on every call.
 */

import type { Component, ComponentQuery, Source } from "../schema";
import type { EventBus } from "../telemetry";

/** Context threaded into every provider call so it can log + stream. */
export interface ProviderContext {
  bus: EventBus;
  candidate?: import("../schema").Profile;
}

export interface ComponentProvider {
  /** Stable identifier: "kb" | "websearch" | "rapidflare". */
  name: string;
  /** Provenance tag stamped on results. */
  source: Source;
  /** Creds/config present? Unavailable providers are skipped (logged). */
  available(): boolean;
  /** Search by subsystem + required fields. Must tag results with `source`. */
  search(query: ComponentQuery, ctx: ProviderContext): Promise<Component[]>;
}

/** Per-run registry configuration. */
export interface RegistryConfig {
  /** Provider names enabled this run, in priority order (earliest = highest). */
  order: string[];
  /** Dedup policy across merged results. Default: dedup by part_number. */
  dedupBy?: "part_number" | "id";
  /**
   * "fanout" (default): query all active providers concurrently and merge.
   * "fallback": query in priority order, stopping once `minResults` are gathered
   *   — so expensive providers (web search) only fire when cheaper, trusted ones
   *   (KB) come up short. Matches the brief's "web search for parts NOT in the KB."
   */
  mode?: "fanout" | "fallback";
  /** Fallback-mode threshold: stop once this many results are collected. Default 3. */
  minResults?: number;
}

export interface ComponentRegistry {
  /** Providers that are enabled AND available right now. */
  activeProviders(): ComponentProvider[];
  /**
   * Fan out a query to enabled+available providers (priority order), tag by
   * source, merge, and dedup. Emits provider.query / provider.result /
   * provider.error per provider via ctx.bus.
   */
  search(query: ComponentQuery, ctx: ProviderContext): Promise<Component[]>;
}
