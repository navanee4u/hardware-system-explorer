/**
 * providers/rapidflare.ts — RapidflareProvider.
 *
 * A clean adapter for the Rapidflare component API. Kept deliberately small and
 * single-purpose so wiring the real endpoint in Phase 3 is a ~10-minute job:
 * everything network-shaped is isolated behind available() + a TODO, and the
 * payload->Component translation lives in one private mapResponse() function.
 *
 * Gated on RAPIDFLARE_API_KEY; reads its base URL from RAPIDFLARE_API_BASE. When
 * unavailable it degrades gracefully — emits telemetry and returns [] — never
 * throwing out of search(). (Brand: "Rapidflare", one word, capital R only.)
 */

import type { Component, ComponentQuery, Source, Subsystem } from "@/lib/schema";
import type { ComponentProvider, ProviderContext } from "@/lib/providers/types";

/** The shape we assume the Rapidflare API returns. Adjust to match the real
 *  schema in Phase 3 — only mapResponse() below needs to change. */
interface RapidflareRawPart {
  sku: string;
  display_name: string;
  manufacturer: string;
  subsystem: string;
  url?: string;
  specs?: Record<string, unknown>;
  tags?: string[];
}

interface RapidflareRawResponse {
  parts?: RapidflareRawPart[];
}

export class RapidflareProvider implements ComponentProvider {
  readonly name = "rapidflare";
  readonly source: Source = "rapidflare";

  /** Live only when a Rapidflare API key is configured. */
  available(): boolean {
    return Boolean(process.env.RAPIDFLARE_API_KEY);
  }

  private baseUrl(): string | undefined {
    return process.env.RAPIDFLARE_API_BASE;
  }

  async search(query: ComponentQuery, ctx: ProviderContext): Promise<Component[]> {
    const required = query.required ?? {};
    const started = Date.now();

    ctx.bus.emit({
      type: "provider.query",
      provider: this.name,
      source: this.source,
      candidate: ctx.candidate,
      message: `rapidflare: searching ${query.subsystem}`,
      data: { subsystem: query.subsystem, required },
    });

    if (!this.available()) {
      ctx.bus.emit({
        type: "provider.result",
        provider: this.name,
        source: this.source,
        candidate: ctx.candidate,
        message: "rapidflare unavailable (no RAPIDFLARE_API_KEY)",
        data: {
          count: 0,
          parts: [],
          latency_ms: Date.now() - started,
          note: "rapidflare unavailable (no RAPIDFLARE_API_KEY)",
        },
      });
      return [];
    }

    try {
      // ----------------------------------------------------------------------
      // TODO(Phase 3): call the real Rapidflare endpoint.
      //
      //   const res = await fetch(`${this.baseUrl()}/v1/components/search`, {
      //     method: "POST",
      //     headers: {
      //       "content-type": "application/json",
      //       authorization: `Bearer ${process.env.RAPIDFLARE_API_KEY}`,
      //     },
      //     body: JSON.stringify({
      //       subsystem: query.subsystem,
      //       required: query.required,
      //       text: query.text,
      //       limit: query.limit,
      //     }),
      //   });
      //   if (!res.ok) throw new Error(`rapidflare ${res.status}`);
      //   const raw: RapidflareRawResponse = await res.json();
      //
      // Everything below this point already works once `raw` is populated —
      // mapResponse() is the only translation point.
      // ----------------------------------------------------------------------

      const raw: RapidflareRawResponse = { parts: [] }; // no network yet
      const mapped = this.mapResponse(raw);

      ctx.bus.emit({
        type: "provider.result",
        provider: this.name,
        source: this.source,
        candidate: ctx.candidate,
        message: `rapidflare: ${mapped.length} part(s) for ${query.subsystem}`,
        data: {
          count: mapped.length,
          parts: mapped.map((c) => c.part_number),
          latency_ms: Date.now() - started,
        },
      });

      return mapped;
    } catch (err) {
      ctx.bus.emit({
        type: "provider.error",
        provider: this.name,
        source: this.source,
        candidate: ctx.candidate,
        message: `rapidflare: search failed for ${query.subsystem}: ${errMsg(err)}`,
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

  /**
   * The single, isolated translation layer: hypothetical Rapidflare payload ->
   * our Component shape. Swapping in the real API schema means editing only this
   * function. Every produced part is tagged source:"rapidflare" and carries
   * source_url when the payload provides one.
   */
  private mapResponse(raw: RapidflareRawResponse): Component[] {
    const parts = raw.parts ?? [];
    return parts
      .filter((p) => isSubsystem(p.subsystem))
      .map((p) => {
        const component: Component = {
          id: `rapidflare:${p.sku}`,
          subsystem: p.subsystem as Subsystem,
          name: p.display_name,
          vendor: p.manufacturer,
          part_number: p.sku,
          source: this.source,
          // Pass through only honest spec fields the schema knows about.
          specs: (p.specs ?? {}) as Component["specs"],
          tags: p.tags,
        };
        if (p.url) component.source_url = p.url;
        return component;
      });
  }
}

const SUBSYSTEM_SET = new Set<string>([
  "compute",
  "power",
  "sensing",
  "comms",
  "actuation",
  "thermal",
  "connectors",
  "chassis",
]);

function isSubsystem(value: string): value is Subsystem {
  return SUBSYSTEM_SET.has(value);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
