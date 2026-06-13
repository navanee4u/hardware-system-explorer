/**
 * proposer.ts — the deterministic, profile- and preference-biased proposer.
 *
 * Selects/revises components for a given SWAP-C profile by asking the provider
 * REGISTRY (never the KB directly) and choosing per-subsystem winners by a
 * profile utility, nudged by learned proposer BIAS. It NEVER judges pass/fail —
 * that is the verifier's job. The inner loop (lib/loop.ts) calls proposeInitial()
 * then revise() until the verifier reports 100% hard coverage or MAX_ITERS.
 *
 * This is also the seam the LLM proposer plugs into (Phase 3): same Proposer
 * interface, same telemetry, same registry — only the selection brain changes.
 */

import type {
  BOM,
  Check,
  Component,
  ComponentQuery,
  ComponentSpecs,
  Constraint,
  Profile,
  Rubric,
  Subsystem,
} from "@/lib/schema";
import { SUBSYSTEMS } from "@/lib/schema";
import type { ComponentRegistry, ProviderContext } from "@/lib/providers/types";
import type { EventBus } from "@/lib/telemetry";

// ---------------------------------------------------------------------------
// Proposer interface (shared by deterministic + future LLM proposer)
// ---------------------------------------------------------------------------

export interface ProposerContext {
  bus: EventBus;
  candidate: Profile;
}

export interface SwapRecord {
  subsystem: Subsystem;
  from?: string; // part_number swapped out
  to?: string; // part_number swapped in
  reason: string;
}

export interface Proposer {
  proposeInitial(ctx: ProposerContext): Promise<BOM>;
  revise(
    bom: BOM,
    checks: Check[],
    ctx: ProposerContext,
  ): Promise<{ bom: BOM; swaps: SwapRecord[] }>;
}

/** Learned proposer bias (from lib/preferences.ts). Soft only — never gates. */
export interface ProposerBias {
  favor_vendors?: string[];
  avoid_vendors?: string[];
  favor_tags?: string[];
}

// ---------------------------------------------------------------------------
// Profile objectives — the SWAP-C lean each profile optimizes.
// Weighted sum of per-axis scores (each normalized 0..1 within a subsystem's
// candidate set, 1 = best for that profile). Tunable in one place.
// ---------------------------------------------------------------------------

type Axis = "power" | "endurance" | "mass" | "size" | "cost" | "lead";

const PROFILE_WEIGHTS: Record<Profile, Partial<Record<Axis, number>>> = {
  // min active power, max endurance margin -> low-power consumers, big cells.
  Efficiency: { power: 0.45, endurance: 0.35, mass: 0.1, cost: 0.1 },
  // min size + mass -> smallest boards, lightest cells.
  Compact: { mass: 0.5, size: 0.3, power: 0.1, cost: 0.1 },
  // min cost + lead time, best energy-per-dollar -> cheap, in-stock workhorses.
  Value: { cost: 0.45, lead: 0.3, endurance: 0.15, mass: 0.1 },
};

const BIAS_BONUS = 0.15; // utility bump for a favored vendor/tag (soft nudge)

// ---------------------------------------------------------------------------
// DeterministicProposer
// ---------------------------------------------------------------------------

export class DeterministicProposer implements Proposer {
  constructor(
    private readonly registry: ComponentRegistry,
    private readonly rubric: Rubric,
    private readonly profile: Profile,
    private readonly bias: ProposerBias = {},
  ) {}

  /** Build a BOM by picking each subsystem's best part for this profile. */
  async proposeInitial(ctx: ProposerContext): Promise<BOM> {
    const bom: BOM = { subsystems: {} };
    const needed = subsystemsInRubric(this.rubric);

    for (const subsystem of needed) {
      const pool = await this.fetch(subsystem, ctx);
      const feasiblePool = pool.filter((c) => this.locallyFeasible(subsystem, c));
      const usable = feasiblePool.length > 0 ? feasiblePool : pool;

      if (subsystem === "connectors") {
        // Connector coverage is a UNION problem: take every kit so the verifier's
        // mating-pair check can be satisfied (cheap, light parts).
        bom.subsystems.connectors = usable;
        for (const c of usable) this.emitSelected(ctx, subsystem, c, "connector kit");
        continue;
      }

      const pick = this.bestFor(subsystem, usable);
      if (pick) {
        bom.subsystems[subsystem] = [pick];
        this.emitSelected(ctx, subsystem, pick, "best fit for profile");
      }
    }
    return bom;
  }

  /**
   * Targeted local search: for the FIRST failing hard check, find the subsystem
   * most responsible and swap its part for the best locally-feasible alternative
   * that improves the failing axis. Emits fix.investigate + fix.swap.
   */
  async revise(
    bom: BOM,
    checks: Check[],
    ctx: ProposerContext,
  ): Promise<{ bom: BOM; swaps: SwapRecord[] }> {
    const next: BOM = { subsystems: { ...bom.subsystems } };
    const swaps: SwapRecord[] = [];

    const failing = checks.filter((c) => c.kind === "hard" && c.status === "fail");
    if (failing.length === 0) return { bom: next, swaps };

    const fail = failing[0];
    ctx.bus.emit({
      type: "fix.investigate",
      candidate: ctx.candidate,
      message: `investigating ${fail.constraint_id}: ${fail.reason}`,
      data: { constraint_id: fail.constraint_id, dimension: fail.dimension },
    });

    const targets = subsystemsForDimension(fail.dimension);
    // Pick the single best swap across the responsible subsystems.
    for (const subsystem of targets) {
      const current = (next.subsystems[subsystem] ?? [])[0];
      const pool = (await this.fetch(subsystem, ctx)).filter((c) =>
        this.locallyFeasible(subsystem, c),
      );
      const alt = this.bestAlternativeFor(fail.dimension, subsystem, pool, current);
      if (alt && (!current || alt.part_number !== current.part_number)) {
        next.subsystems[subsystem] = [alt];
        const swap: SwapRecord = {
          subsystem,
          from: current?.part_number,
          to: alt.part_number,
          reason: `address ${fail.dimension} (${fail.reason})`,
        };
        swaps.push(swap);
        ctx.bus.emit({
          type: "fix.swap",
          candidate: ctx.candidate,
          source: alt.source,
          message: `swap ${subsystem}: ${current?.name ?? "—"} -> ${alt.name} (${fail.dimension})`,
          data: { ...swap },
        });
        break; // one swap per revise pass; re-verify before the next.
      }
    }

    return { bom: next, swaps };
  }

  // -- internals ------------------------------------------------------------

  private async fetch(subsystem: Subsystem, ctx: ProviderContext): Promise<Component[]> {
    const query: ComponentQuery = {
      subsystem,
      required: requiredSpecsFor(subsystem, this.rubric),
      limit: 16,
    };
    return this.registry.search(query, { bus: ctx.bus, candidate: ctx.candidate });
  }

  /** Does this part individually satisfy its subsystem's local hard requirements? */
  private locallyFeasible(subsystem: Subsystem, c: Component): boolean {
    const env = constraintRequired(this.rubric, "thermal")?.env_temp_c;
    // Thermal applies to every part.
    if (env && c.specs.temp_range_c) {
      if (c.specs.temp_range_c.min > env.min || c.specs.temp_range_c.max < env.max) {
        return false;
      }
    }
    switch (subsystem) {
      case "compute": {
        const r = constraintRequired(this.rubric, "compute");
        if (r?.ram_gb !== undefined && (c.specs.ram_gb ?? -1) < r.ram_gb) return false;
        if (r?.tops !== undefined && (c.specs.tops ?? -1) < r.tops) return false;
        return true;
      }
      case "sensing": {
        const r = constraintRequired(this.rubric, "sensing");
        if (!r) return true;
        if (r.resolution_mp !== undefined && (c.specs.resolution_mp ?? -1) < r.resolution_mp) return false;
        if (r.fps !== undefined && (c.specs.fps ?? -1) < r.fps) return false;
        if (r.lanes !== undefined && (c.specs.lanes ?? -1) < r.lanes) return false;
        if (r.interface !== undefined && c.specs.sensor_interface !== r.interface) return false;
        return true;
      }
      case "comms": {
        const r = constraintRequired(this.rubric, "comms");
        if (!r) return true;
        if (r.chains !== undefined && (c.specs.chains ?? -1) < r.chains) return false;
        if (r.bands && r.bands.length > 0) {
          const have = c.specs.bands ?? [];
          if (!r.bands.every((b) => have.includes(b))) return false;
        }
        return true;
      }
      case "actuation": {
        const r = constraintRequired(this.rubric, "actuation");
        if (r?.torque_nm !== undefined && (c.specs.torque_nm ?? -1) < r.torque_nm) return false;
        return true;
      }
      case "power": {
        const r = constraintRequired(this.rubric, "voltage_rails");
        if (r?.rails && c.specs.rails_out) {
          const provides = (rail: { voltage_v: number; max_current_a: number }) =>
            c.specs.rails_out!.some(
              (o) => Math.abs(o.voltage_v - rail.voltage_v) <= 0.25 && o.max_current_a >= rail.max_current_a,
            );
          if (!r.rails.every(provides)) return false;
        }
        return true;
      }
      case "chassis": {
        const r = constraintRequired(this.rubric, "environment");
        if (r?.ip_rating !== undefined && (c.specs.ip_rating ?? -1) < r.ip_rating) return false;
        return true;
      }
      default:
        return true;
    }
  }

  /** Highest profile-utility part in a pool (with learned bias applied). */
  private bestFor(subsystem: Subsystem, pool: Component[]): Component | undefined {
    if (pool.length === 0) return undefined;
    const norms = axisNormalizers(pool);
    let best: Component | undefined;
    let bestU = -Infinity;
    for (const c of pool) {
      const u = this.utility(c, norms);
      if (u > bestU) {
        bestU = u;
        best = c;
      }
    }
    return best;
  }

  /**
   * Choose the alternative that most improves the FAILING dimension, among
   * locally-feasible parts, breaking ties by profile utility. Returns undefined
   * when no part improves the axis (caller then reports infeasible).
   */
  private bestAlternativeFor(
    dimension: string,
    subsystem: Subsystem,
    pool: Component[],
    current: Component | undefined,
  ): Component | undefined {
    if (pool.length === 0) return undefined;
    const norms = axisNormalizers(pool);
    const direction = improvementSelector(dimension);
    let best: Component | undefined;
    let bestKey = -Infinity;
    for (const c of pool) {
      const primary = direction ? direction(c) : 0;
      const tieBreak = this.utility(c, norms) * 1e-3;
      const key = primary + tieBreak;
      if (key > bestKey) {
        bestKey = key;
        best = c;
      }
    }
    // Only return if it strictly improves over current on the primary axis.
    if (best && current && direction && direction(best) <= direction(current)) {
      return undefined;
    }
    return best;
  }

  private utility(c: Component, norms: AxisNormalizers): number {
    const w = PROFILE_WEIGHTS[this.profile];
    let u = 0;
    for (const [axis, weight] of Object.entries(w) as [Axis, number][]) {
      u += weight * norms.score(axis, c);
    }
    // Learned soft bias.
    if (this.bias.favor_vendors?.includes(c.vendor)) u += BIAS_BONUS;
    if (this.bias.avoid_vendors?.includes(c.vendor)) u -= BIAS_BONUS;
    if (this.bias.favor_tags && c.tags) {
      if (c.tags.some((t) => this.bias.favor_tags!.includes(t))) u += BIAS_BONUS;
    }
    return u;
  }

  private emitSelected(ctx: ProposerContext, subsystem: Subsystem, c: Component, why: string) {
    ctx.bus.emit({
      type: "part.selected",
      candidate: ctx.candidate,
      source: c.source,
      message: `${subsystem}: ${c.name} (${c.part_number})`,
      data: { subsystem, part_number: c.part_number, vendor: c.vendor, source: c.source, why },
    });
  }
}

// ---------------------------------------------------------------------------
// Axis normalization within a candidate pool
// ---------------------------------------------------------------------------

interface AxisNormalizers {
  score(axis: Axis, c: Component): number; // 0..1, 1 = best for this axis
}

function volume(c: Component): number {
  const d = c.specs.dims_mm;
  return d ? d.l * d.w * d.h : NaN;
}

const AXIS_SPEC: Record<Axis, { get: (c: Component) => number; lowerBetter: boolean }> = {
  power: { get: (c) => c.specs.active_w ?? NaN, lowerBetter: true },
  endurance: { get: (c) => c.specs.capacity_wh ?? NaN, lowerBetter: false },
  mass: { get: (c) => c.specs.mass_g ?? NaN, lowerBetter: true },
  size: { get: (c) => volume(c), lowerBetter: true },
  cost: { get: (c) => c.specs.cost_usd ?? NaN, lowerBetter: true },
  lead: { get: (c) => c.specs.lead_time_days ?? NaN, lowerBetter: true },
};

function axisNormalizers(pool: Component[]): AxisNormalizers {
  const ranges: Partial<Record<Axis, { min: number; max: number }>> = {};
  for (const axis of Object.keys(AXIS_SPEC) as Axis[]) {
    const vals = pool.map((c) => AXIS_SPEC[axis].get(c)).filter((v) => Number.isFinite(v));
    if (vals.length > 0) ranges[axis] = { min: Math.min(...vals), max: Math.max(...vals) };
  }
  return {
    score(axis, c) {
      const spec = AXIS_SPEC[axis];
      const v = spec.get(c);
      const r = ranges[axis];
      if (!Number.isFinite(v) || !r) return 0.5; // missing data -> neutral
      if (r.max === r.min) return 1; // all equal -> all best
      const norm = (v - r.min) / (r.max - r.min); // 0 at min, 1 at max
      return spec.lowerBetter ? 1 - norm : norm;
    },
  };
}

/** For a failing dimension, a function whose HIGHER value = better candidate. */
function improvementSelector(dimension: string): ((c: Component) => number) | undefined {
  switch (dimension) {
    case "mass":
      return (c) => -(c.specs.mass_g ?? Infinity);
    case "power_budget":
      return (c) => -(c.specs.active_w ?? Infinity);
    case "size":
      return (c) => -(Number.isFinite(volume(c)) ? volume(c) : Infinity);
    case "endurance":
      return (c) => c.specs.capacity_wh ?? -Infinity;
    case "cost":
      return (c) => -(c.specs.cost_usd ?? Infinity);
    case "lead_time":
      return (c) => -(c.specs.lead_time_days ?? Infinity);
    default:
      return undefined; // structural dims (rails/compute/etc.) handled by local feasibility
  }
}

// ---------------------------------------------------------------------------
// Rubric helpers
// ---------------------------------------------------------------------------

export function subsystemsInRubric(rubric: Rubric): Subsystem[] {
  // Always consider the full subsystem set the rubric implies; the proposer
  // fetches each and skips any with no parts. Order is the canonical SUBSYSTEMS.
  const implied = new Set<Subsystem>();
  for (const c of rubric) {
    for (const s of subsystemsForDimension(c.dimension)) implied.add(s);
  }
  // Ensure we always source the core build subsystems even if a dimension is global.
  for (const s of SUBSYSTEMS) implied.add(s);
  return SUBSYSTEMS.filter((s) => implied.has(s));
}

/** Which subsystem(s) a constraint dimension is satisfied by. */
function subsystemsForDimension(dimension: string): Subsystem[] {
  switch (dimension) {
    case "compute":
      return ["compute"];
    case "sensing":
      return ["sensing"];
    case "comms":
      return ["comms"];
    case "actuation":
      return ["actuation"];
    case "voltage_rails":
    case "endurance":
      return ["power"];
    case "environment":
      return ["chassis"];
    case "connectors":
      return ["connectors"];
    case "thermal":
      return ["thermal", "chassis"];
    case "mass":
      // Heaviest swappable subsystems first (battery dominates, then chassis).
      return ["power", "chassis", "actuation", "thermal", "sensing", "comms", "compute"];
    case "power_budget":
      return ["compute", "comms", "sensing", "actuation", "thermal"];
    case "size":
      return ["chassis", "power", "thermal", "compute"];
    default:
      return [];
  }
}

function constraintRequired(rubric: Rubric, dimension: string): Constraint["required"] | undefined {
  return rubric.find((c) => c.dimension === dimension)?.required;
}

/** Translate a subsystem's rubric requirements into a provider ComponentQuery.required. */
export function requiredSpecsFor(subsystem: Subsystem, rubric: Rubric): Partial<ComponentSpecs> {
  const req: Partial<ComponentSpecs> = {};
  const env = constraintRequired(rubric, "thermal")?.env_temp_c;
  if (env) req.temp_range_c = env;
  switch (subsystem) {
    case "compute": {
      const r = constraintRequired(rubric, "compute");
      if (r?.ram_gb !== undefined) req.ram_gb = r.ram_gb;
      if (r?.tops !== undefined) req.tops = r.tops;
      break;
    }
    case "sensing": {
      const r = constraintRequired(rubric, "sensing");
      if (r?.resolution_mp !== undefined) req.resolution_mp = r.resolution_mp;
      if (r?.fps !== undefined) req.fps = r.fps;
      if (r?.lanes !== undefined) req.lanes = r.lanes;
      if (r?.interface !== undefined) req.sensor_interface = r.interface;
      break;
    }
    case "comms": {
      const r = constraintRequired(rubric, "comms");
      if (r?.chains !== undefined) req.chains = r.chains;
      if (r?.bands) req.bands = r.bands;
      break;
    }
    case "actuation": {
      const r = constraintRequired(rubric, "actuation");
      if (r?.torque_nm !== undefined) req.torque_nm = r.torque_nm;
      break;
    }
    case "chassis": {
      const r = constraintRequired(rubric, "environment");
      if (r?.ip_rating !== undefined) req.ip_rating = r.ip_rating;
      break;
    }
    default:
      break;
  }
  return req;
}
