/**
 * providers/rapidflare.ts — RapidflareProvider.
 *
 * Calls the Rapidflare Parts Search API (a grounded web-search proxy that returns
 * real, purchasable components) and maps the response into our Component shape.
 *
 *   POST {RAPIDFLARE_API_BASE}/api/v1/parts/search
 *   Authorization: Bearer {RAPIDFLARE_API_KEY}   (SECRET — server-to-server only)
 *   body: { query, subsystem?, limit? }
 *
 * Gated on RAPIDFLARE_API_KEY. Degrades gracefully — emits telemetry and returns []
 * on missing key, timeout, or error; never throws out of search(). The whole
 * request/response translation lives here so the endpoint stays a one-file concern.
 * (Brand: "Rapidflare", one word, capital R only.)
 */

import type {
  Component,
  ComponentQuery,
  ComponentSpecs,
  Source,
  Subsystem,
} from "@/lib/schema";
import type { ComponentProvider, ProviderContext } from "@/lib/providers/types";

const SEARCH_PATH = "/api/v1/parts/search";
// Grounded search is slow; cap it so a slow/unresponsive API can never stall a run.
// Tunable via env once the real healthy latency is known (RAPIDFLARE_TIMEOUT_MS).
const TIMEOUT_MS = Number(process.env.RAPIDFLARE_TIMEOUT_MS ?? 45_000);

/** A component as returned by the Rapidflare Parts Search API. */
interface RapidflarePart {
  id: string;
  subsystem?: string;
  name?: string;
  vendor?: string;
  part_number?: string;
  cost_usd?: number;
  source?: string;
  image_url?: string;
  product_url?: string;
  rapidflare_url?: string;
  specs?: Record<string, unknown>;
}
interface RapidflareResponse {
  query?: string;
  summary?: string;
  components?: RapidflarePart[];
}

export class RapidflareProvider implements ComponentProvider {
  readonly name = "rapidflare";
  readonly source: Source = "rapidflare";

  /** Live only when a Rapidflare API key is configured. */
  available(): boolean {
    return Boolean(process.env.RAPIDFLARE_API_KEY) && Boolean(process.env.RAPIDFLARE_API_BASE);
  }

  async search(query: ComponentQuery, ctx: ProviderContext): Promise<Component[]> {
    const required = query.required ?? {};
    const started = Date.now();
    const nlQuery = buildQuery(query);

    ctx.bus.emit({
      type: "provider.query",
      provider: this.name,
      source: this.source,
      candidate: ctx.candidate,
      message: `rapidflare: searching ${query.subsystem} — "${nlQuery}"`,
      data: { subsystem: query.subsystem, required, query: nlQuery },
    });

    if (!this.available()) {
      ctx.bus.emit({
        type: "provider.result",
        provider: this.name,
        source: this.source,
        candidate: ctx.candidate,
        message: "rapidflare unavailable (no RAPIDFLARE_API_KEY/BASE)",
        data: { count: 0, parts: [], latency_ms: Date.now() - started, note: "unavailable" },
      });
      return [];
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const base = process.env.RAPIDFLARE_API_BASE!.replace(/\/+$/, "");
      const res = await fetch(`${base}${SEARCH_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.RAPIDFLARE_API_KEY}`,
        },
        body: JSON.stringify({
          query: nlQuery,
          subsystem: hintSubsystem(query.subsystem),
          limit: query.limit ?? 8,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as RapidflareResponse;
      const mapped = this.mapResponse(raw.components ?? [], query.subsystem);

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
        data: { subsystem: query.subsystem, latency_ms: Date.now() - started, error: errMsg(err) },
      });
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The single translation layer: Rapidflare API parts -> our Component shape.
   * The API's spec keys are best-effort and unit-suffixed (e.g. active_power_W,
   * compute_TOPS, temp_op_C); normalizeSpecs() maps the ones our verifier knows
   * about and drops the rest. Parts are bucketed into the subsystem we searched
   * for (we trust our own query over the API's guess) and tagged source:"rapidflare".
   */
  private mapResponse(parts: RapidflarePart[], subsystem: Subsystem): Component[] {
    return parts
      .filter((p) => p && (p.part_number || p.id))
      .map((p) => {
        const specs = normalizeSpecs(p.specs ?? {});
        if (typeof p.cost_usd === "number") specs.cost_usd = p.cost_usd;
        const component: Component = {
          id: `rf-${p.id ?? p.part_number}`,
          subsystem,
          name: p.name ?? p.part_number ?? "Rapidflare part",
          vendor: p.vendor ?? "unknown",
          part_number: p.part_number ?? p.id,
          source: this.source,
          specs,
          tags: ["rapidflare"],
        };
        // Prefer the branded Rapidflare component page for the UI link; fall back
        // to the real vendor/buy page.
        const url = p.rapidflare_url ?? p.product_url;
        if (url) component.source_url = url;
        return component;
      });
  }
}

// ---------------------------------------------------------------------------
// Natural-language query synthesis (our structured query -> the API's NL field)
// ---------------------------------------------------------------------------

function buildQuery(q: ComponentQuery): string {
  const r = q.required ?? {};
  const bits: string[] = [`${q.subsystem} component`];
  if (typeof r.ram_gb === "number") bits.push(`>= ${r.ram_gb} GB RAM`);
  if (typeof r.tops === "number" && r.tops > 0) bits.push(`>= ${r.tops} TOPS`);
  if (typeof r.active_w === "number") bits.push(`<= ${r.active_w} W active`);
  if (typeof r.resolution_mp === "number") bits.push(`>= ${r.resolution_mp} MP`);
  if (typeof r.fps === "number") bits.push(`>= ${r.fps} fps`);
  if (r.sensor_interface) bits.push(`${r.sensor_interface} interface`);
  if (typeof r.lanes === "number") bits.push(`${r.lanes} lanes`);
  if (Array.isArray(r.bands) && r.bands.length) bits.push(`bands ${r.bands.join("/")}`);
  if (typeof r.chains === "number") bits.push(`${r.chains}+ radio chain(s)`);
  if (typeof r.torque_nm === "number") bits.push(`>= ${r.torque_nm} Nm torque`);
  if (typeof r.capacity_wh === "number") bits.push(`>= ${r.capacity_wh} Wh`);
  if (typeof r.ip_rating === "number") bits.push(`>= IP${r.ip_rating}`);
  if (r.temp_range_c) bits.push(`operating ${r.temp_range_c.min}..${r.temp_range_c.max} C`);
  return bits.join(", ");
}

/** Map our subsystem to the API's subsystem hint vocabulary. */
function hintSubsystem(s: Subsystem): string {
  switch (s) {
    case "thermal":
    case "chassis":
      return "mechanical";
    case "connectors":
      return "connector";
    default:
      return s; // compute | power | sensing | comms | actuation
  }
}

// ---------------------------------------------------------------------------
// Spec normalization: API spec keys -> our ComponentSpecs keys
// ---------------------------------------------------------------------------

/** Lowercased API key -> our ComponentSpecs key. */
const SPEC_ALIASES: Record<string, keyof ComponentSpecs> = {
  mass_g: "mass_g",
  cost_usd: "cost_usd",
  lead_time_days: "lead_time_days",
  active_power_w: "active_w",
  active_w: "active_w",
  peak_power_w: "peak_w",
  peak_w: "peak_w",
  idle_power_w: "idle_w",
  idle_w: "idle_w",
  compute_tops: "tops",
  tops: "tops",
  ram_gb: "ram_gb",
  resolution_mp: "resolution_mp",
  fps: "fps",
  lanes: "lanes",
  sensor_interface: "sensor_interface",
  interface: "sensor_interface",
  antenna_bands: "bands",
  bands: "bands",
  antenna_connector: "antenna_connector",
  chains: "chains",
  torque_nm: "torque_nm",
  stall_current_a: "stall_current_a",
  driver_current_a: "driver_current_a",
  capacity_wh: "capacity_wh",
  peak_supply_w: "peak_supply_w",
  ip_rating: "ip_rating",
  dims_mm: "dims_mm",
  temp_range_c: "temp_range_c",
  voltage_in: "voltage_in",
  rails_out: "rails_out",
};

const NUMERIC_KEYS = new Set<keyof ComponentSpecs>([
  "mass_g", "cost_usd", "lead_time_days", "active_w", "peak_w", "idle_w", "tops",
  "ram_gb", "resolution_mp", "fps", "lanes", "chains", "torque_nm",
  "stall_current_a", "driver_current_a", "capacity_wh", "peak_supply_w", "ip_rating",
]);

function normalizeSpecs(raw: Record<string, unknown>): ComponentSpecs {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = SPEC_ALIASES[k.toLowerCase()];
    if (!key || v == null) continue;
    if (key === "ip_rating") {
      const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10); // "IP67" -> 67
      if (Number.isFinite(n)) out[key] = n;
    } else if (NUMERIC_KEYS.has(key)) {
      const n = typeof v === "number" ? v : parseFloat(String(v));
      if (Number.isFinite(n)) out[key] = n;
    } else {
      out[key] = v; // bands[], sensor_interface, antenna_connector, dims_mm{}, temp_range_c{}, etc.
    }
  }
  return out as ComponentSpecs;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
