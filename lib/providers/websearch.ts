/**
 * providers/websearch.ts — WebSearchProvider.
 *
 * In Phase 3 this provider will use the Anthropic SDK's web_search tool to find
 * real, current parts and extract VERBATIM specs (with a source_url) so every
 * web-sourced number is provenanced and auditable. It is gated on
 * ANTHROPIC_API_KEY and makes NO network calls today.
 *
 * When unavailable (no key), search() still emits a provider.query then a
 * provider.result with count:0 and an explanatory note, and returns [] — so the
 * live telemetry stream honestly shows the provider was consulted and skipped.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Component, ComponentQuery, ComponentSpecs, Source, Subsystem } from "@/lib/schema";
import type { ComponentProvider, ProviderContext } from "@/lib/providers/types";

export class WebSearchProvider implements ComponentProvider {
  readonly name = "websearch";
  readonly source: Source = "web";
  private readonly client?: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client ?? (process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1 }) : undefined);
  }

  /** Live only when an Anthropic API key is configured. */
  available(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async search(query: ComponentQuery, ctx: ProviderContext): Promise<Component[]> {
    const required = query.required ?? {};
    const started = Date.now();

    ctx.bus.emit({
      type: "provider.query",
      provider: this.name,
      source: this.source,
      candidate: ctx.candidate,
      message: `websearch: searching ${query.subsystem}`,
      data: { subsystem: query.subsystem, required },
    });

    if (!this.available()) {
      // Honest no-op: report consulted-but-unavailable rather than hiding it.
      ctx.bus.emit({
        type: "provider.result",
        provider: this.name,
        source: this.source,
        candidate: ctx.candidate,
        message: "websearch unavailable (no ANTHROPIC_API_KEY)",
        data: {
          count: 0,
          parts: [],
          latency_ms: Date.now() - started,
          note: "websearch unavailable (no ANTHROPIC_API_KEY)",
        },
      });
      return [];
    }

    try {
      // Two-step: (1) web_search to find real parts, (2) structured extraction of
      // VERBATIM specs with a source_url. The model is told never to invent a
      // number — omit it instead, so the verifier reports missing data honestly.
      const limit = query.limit ?? 5;
      // web_search is a slow, multi-step server tool (~60-90s for real research),
      // so cap it with a request timeout. We ask for plain JSON and parse it (the
      // structured-output param interacts badly with the web_search tool loop).
      const res = await this.client!.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          tools: [
            { type: "web_search_20250305", name: "web_search", max_uses: 5 } as unknown as Anthropic.ToolUnion,
          ],
          system:
            "You find REAL, currently-available hardware components and extract their specs VERBATIM from the " +
            "manufacturer/distributor page you cite. Never invent or estimate a number — if a spec is not on the " +
            "cited page, omit that field. Every part MUST include the exact source_url you read the specs from. " +
            'Reply with ONLY a JSON object of the form {"parts":[{"name","vendor","part_number","source_url",' +
            '"specs":{mass_g,cost_usd,active_w,capacity_wh,tops,ram_gb,resolution_mp,fps,torque_nm,ip_rating,chains}}]} ' +
            "— no prose, no markdown.",
          messages: [{ role: "user", content: buildSearchPrompt(query, limit) }],
        },
        { timeout: 100_000 },
      );
      // web_search interleaves text + tool blocks; concatenate all text, then pull
      // the JSON object out of it (the model may still wrap it in prose/fences).
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const parsed = extractJson(text);

      const tagged: Component[] = (parsed.parts ?? [])
        .filter((p) => p.source_url && p.part_number)
        .map((p) => toComponent(p, query.subsystem));

      ctx.bus.emit({
        type: "provider.result",
        provider: this.name,
        source: this.source,
        candidate: ctx.candidate,
        message: `websearch: ${tagged.length} part(s) for ${query.subsystem}`,
        data: {
          count: tagged.length,
          parts: tagged.map((c) => c.part_number),
          latency_ms: Date.now() - started,
        },
      });

      return tagged;
    } catch (err) {
      ctx.bus.emit({
        type: "provider.error",
        provider: this.name,
        source: this.source,
        candidate: ctx.candidate,
        message: `websearch: search failed for ${query.subsystem}: ${errMsg(err)}`,
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

interface RawWebPart {
  name: string;
  vendor: string;
  part_number: string;
  source_url: string;
  specs: Partial<ComponentSpecs>;
}

function buildSearchPrompt(query: ComponentQuery, limit: number): string {
  const req = query.required ?? {};
  const wants = Object.entries(req)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(", ");
  return [
    `Find up to ${limit} REAL, currently-purchasable ${query.subsystem} components${query.text ? ` for this system: ${query.text}` : ""}.`,
    wants ? `The ${query.subsystem} part should meet or beat: ${wants}.` : "",
    "For each, read the manufacturer or distributor page and extract specs VERBATIM. Include the exact source_url.",
    "Omit any spec field not stated on the page. Return them in the required JSON shape.",
  ]
    .filter(Boolean)
    .join(" ");
}

function toComponent(p: RawWebPart, subsystem: Subsystem): Component {
  return {
    id: `web-${slug(p.vendor)}-${slug(p.part_number)}`,
    subsystem,
    name: p.name,
    vendor: p.vendor,
    part_number: p.part_number,
    source: "web",
    source_url: p.source_url,
    specs: p.specs ?? {},
    tags: ["web"],
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

/** Pull a {parts:[…]} JSON object out of free-form model text (handles fences/prose). */
function extractJson(text: string): { parts?: RawWebPart[] } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start < 0) return { parts: [] };
  for (let end = body.lastIndexOf("}"); end > start; end = body.lastIndexOf("}", end - 1)) {
    try {
      return JSON.parse(body.slice(start, end + 1)) as { parts?: RawWebPart[] };
    } catch {
      /* keep shrinking to the previous closing brace */
    }
  }
  return { parts: [] };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
