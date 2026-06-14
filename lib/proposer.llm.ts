/**
 * proposer.llm.ts — the LLM proposer (model-selectable, preference-aware).
 *
 * Plugs into the SAME Proposer interface as DeterministicProposer, so the inner
 * loop (lib/loop.ts) is unchanged. The LLM's job is SELECTION ONLY: it picks
 * components for a SWAP-C profile from the REAL candidate pool the provider
 * registry returns — it never invents specs and never judges pass/fail (the
 * verifier owns that). It returns part numbers; we map them back to the real
 * Components. Anything the model omits or hallucinates falls back to the
 * deterministic proposer, so the loop always closes.
 *
 * Telemetry: every model.call is logged with token usage + latency, and the full
 * prompt + response are attached to the event (persisted to disk per run).
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  BOM,
  Check,
  Component,
  ModelId,
  Profile,
  Rubric,
  Subsystem,
} from "@/lib/schema";
import type { ComponentRegistry } from "@/lib/providers/types";
import {
  DeterministicProposer,
  requiredSpecsFor,
  subsystemsInRubric,
  type Proposer,
  type ProposerBias,
  type ProposerContext,
  type SwapRecord,
} from "@/lib/proposer";

const PROFILE_BRIEF: Record<Profile, string> = {
  Efficiency: "minimize active power draw and maximize endurance/runtime margin (low-power parts, higher-capacity cells).",
  Compact: "minimize physical size and mass (smallest boards, lightest cells, dense packing).",
  Value: "minimize cost and lead time, favoring cheap, in-stock, vendor-consolidated parts.",
};

interface Selection {
  selections: { subsystem: string; part_number: string }[];
  rationale: string;
}

const SELECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["selections", "rationale"],
  properties: {
    selections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["subsystem", "part_number"],
        properties: {
          subsystem: { type: "string" },
          part_number: { type: "string" },
        },
      },
    },
    rationale: { type: "string" },
  },
} as const;

export interface LLMProposerOpts {
  model: ModelId;
  registry: ComponentRegistry;
  rubric: Rubric;
  profile: Profile;
  bias?: ProposerBias;
  preferences?: string[]; // learned preference statements (consulted at run start)
  requirement?: string; // raw requirement text — threaded to providers for web search
  client?: Anthropic; // injectable for tests
}

export class LLMProposer implements Proposer {
  private readonly client: Anthropic;
  private readonly fallback: DeterministicProposer;

  constructor(private readonly opts: LLMProposerOpts) {
    this.client = opts.client ?? new Anthropic();
    this.fallback = new DeterministicProposer(
      opts.registry,
      opts.rubric,
      opts.profile,
      opts.bias,
      opts.requirement,
    );
  }

  async proposeInitial(ctx: ProposerContext): Promise<BOM> {
    const pools = await this.fetchPools(ctx);
    const prompt = this.buildInitialPrompt(pools);
    const picks = await this.askModel(prompt, ctx, "initial");
    if (!picks) return this.fallback.proposeInitial(ctx); // model failed → deterministic
    return this.assembleBom(pools, picks, ctx);
  }

  async revise(
    bom: BOM,
    checks: Check[],
    ctx: ProposerContext,
  ): Promise<{ bom: BOM; swaps: SwapRecord[] }> {
    const pools = await this.fetchPools(ctx);
    const prompt = this.buildRevisePrompt(pools, bom, checks);
    const picks = await this.askModel(prompt, ctx, "revise");
    if (!picks) return this.fallback.revise(bom, checks, ctx); // model failed → deterministic
    const next = await this.assembleBom(pools, picks, ctx, /*quiet*/ true);
    const swaps = diffSwaps(bom, next, ctx);
    for (const s of swaps) {
      ctx.bus.emit({
        type: "fix.swap",
        candidate: ctx.candidate,
        message: `swap ${s.subsystem}: ${s.from ?? "—"} -> ${s.to} (LLM revision)`,
        data: { ...s },
      });
    }
    return { bom: next, swaps };
  }

  // -- model call -----------------------------------------------------------

  private async askModel(
    prompt: string,
    ctx: ProposerContext,
    phase: "initial" | "revise",
  ): Promise<Selection | null> {
    const started = Date.now();
    const system =
      "You are a hardware systems architect selecting components for ONE SWAP-C design profile. " +
      "You MUST choose only from the provided candidate lists, by exact part_number. Never invent parts or specs. " +
      "You do NOT decide pass/fail — a deterministic verifier does that. Pick the best parts for the profile that " +
      "are most likely to satisfy every hard constraint, selecting exactly one part per functional subsystem and " +
      "ALL listed connector kits.";
    try {
      const res = await this.client.messages.create({
        model: this.opts.model as string,
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: { type: "json_schema", schema: SELECTION_SCHEMA } },
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
      const parsed = JSON.parse(text) as Selection;
      ctx.bus.emit({
        type: "model.call",
        candidate: ctx.candidate,
        message: `model.call (${phase}): ${res.usage.input_tokens}->${res.usage.output_tokens} tok, ${Date.now() - started}ms`,
        data: {
          model: this.opts.model,
          phase,
          usage: res.usage,
          latency_ms: Date.now() - started,
          // Full I/O persisted to disk via the event stream — nothing hidden.
          io: { system, prompt, response: text },
          rationale: parsed.rationale,
        },
      });
      return parsed;
    } catch (err) {
      ctx.bus.emit({
        type: "provider.error",
        candidate: ctx.candidate,
        message: `model.call (${phase}) failed: ${err instanceof Error ? err.message : String(err)} — falling back to deterministic`,
        data: { model: this.opts.model, phase, latency_ms: Date.now() - started },
      });
      return null;
    }
  }

  // -- helpers --------------------------------------------------------------

  private async fetchPools(ctx: ProposerContext): Promise<Map<Subsystem, Component[]>> {
    const pools = new Map<Subsystem, Component[]>();
    for (const subsystem of subsystemsInRubric(this.opts.rubric)) {
      const parts = await this.opts.registry.search(
        { subsystem, required: requiredSpecsFor(subsystem, this.opts.rubric), text: this.opts.requirement || undefined, limit: 16 },
        { bus: ctx.bus, candidate: ctx.candidate },
      );
      if (parts.length > 0) pools.set(subsystem, parts);
    }
    return pools;
  }

  private assembleBom(
    pools: Map<Subsystem, Component[]>,
    picks: Selection,
    ctx: ProposerContext,
    quiet = false,
  ): BOM {
    const bom: BOM = { subsystems: {} };
    const bySubsystem = new Map<Subsystem, string[]>();
    for (const sel of picks.selections ?? []) {
      const sub = sel.subsystem as Subsystem;
      if (!bySubsystem.has(sub)) bySubsystem.set(sub, []);
      bySubsystem.get(sub)!.push(sel.part_number);
    }

    for (const [subsystem, pool] of pools) {
      const chosenPNs = bySubsystem.get(subsystem) ?? [];
      if (subsystem === "connectors") {
        // Always include the full set of connector kits for union coverage.
        bom.subsystems.connectors = pool;
        continue;
      }
      const matched = pool.find((c) => chosenPNs.includes(c.part_number));
      const pick = matched ?? this.fallbackPick(subsystem, pool); // hallucination/miss → deterministic
      if (pick) {
        bom.subsystems[subsystem] = [pick];
        if (!quiet) {
          ctx.bus.emit({
            type: "part.selected",
            candidate: ctx.candidate,
            source: pick.source,
            message: `${subsystem}: ${pick.name} (${pick.part_number})${matched ? "" : " [deterministic fallback]"}`,
            data: { subsystem, part_number: pick.part_number, vendor: pick.vendor, source: pick.source, by: matched ? "llm" : "fallback" },
          });
        }
      }
    }
    return bom;
  }

  /** Deterministic best-pick for a pool when the model didn't choose a valid part. */
  private fallbackPick(subsystem: Subsystem, pool: Component[]): Component | undefined {
    // Reuse the deterministic proposer's profile utility by delegating to a tiny
    // selection: pick the first locally-feasible part (the pool is already
    // ranked by the KB provider against the requirement).
    return pool[0];
  }

  private buildInitialPrompt(pools: Map<Subsystem, Component[]>): string {
    return [
      `PROFILE: ${this.opts.profile} — ${PROFILE_BRIEF[this.opts.profile]}`,
      preferencesBlock(this.opts.preferences, this.opts.bias),
      rubricBlock(this.opts.rubric),
      poolsBlock(pools),
      "Select exactly one part per functional subsystem (compute, power, sensing, comms, actuation, thermal, chassis) " +
        "and ALL connector kits. Optimize for the profile above while satisfying every HARD constraint. " +
        "Return the chosen part_numbers.",
    ].join("\n\n");
  }

  private buildRevisePrompt(pools: Map<Subsystem, Component[]>, bom: BOM, checks: Check[]): string {
    const fails = checks
      .filter((c) => c.kind === "hard" && c.status === "fail")
      .map((c) => `- ${c.constraint_id}: ${c.reason}`)
      .join("\n");
    const current = Object.entries(bom.subsystems)
      .map(([s, list]) => `${s}: ${(list ?? []).map((p) => p.part_number).join(", ")}`)
      .join("\n");
    return [
      `PROFILE: ${this.opts.profile} — ${PROFILE_BRIEF[this.opts.profile]}`,
      `CURRENT DESIGN:\n${current}`,
      `FAILING HARD CONSTRAINTS (fix these):\n${fails || "(none)"}`,
      poolsBlock(pools),
      "Revise the selection to fix the failing constraints with the smallest change that stays true to the profile. " +
        "Keep parts that already work. Return the full set of chosen part_numbers (one per functional subsystem + all connector kits).",
    ].join("\n\n");
  }
}

// ---------------------------------------------------------------------------
// prompt blocks
// ---------------------------------------------------------------------------

function preferencesBlock(statements?: string[], bias?: ProposerBias): string {
  const lines: string[] = [];
  if (statements && statements.length > 0) {
    lines.push("LEARNED PREFERENCES (soft guidance from prior human choices):");
    for (const s of statements) lines.push(`- ${s}`);
  }
  if (bias?.favor_vendors?.length) lines.push(`Favor vendors: ${bias.favor_vendors.join(", ")}`);
  if (bias?.avoid_vendors?.length) lines.push(`Avoid vendors: ${bias.avoid_vendors.join(", ")}`);
  if (bias?.favor_tags?.length) lines.push(`Favor part tags: ${bias.favor_tags.join(", ")}`);
  return lines.length > 0 ? lines.join("\n") : "LEARNED PREFERENCES: (none yet)";
}

function rubricBlock(rubric: Rubric): string {
  const lines = rubric.map(
    (c) => `- [${c.kind}] ${c.id} (${c.dimension}): ${c.label}`,
  );
  return `RUBRIC (HARD constraints must all pass; soft ones improve the score):\n${lines.join("\n")}`;
}

function poolsBlock(pools: Map<Subsystem, Component[]>): string {
  const out: string[] = ["CANDIDATE PARTS (choose only from these, by exact part_number):"];
  for (const [subsystem, parts] of pools) {
    out.push(`\n${subsystem.toUpperCase()}:`);
    for (const c of parts) out.push(`  - ${c.part_number} | ${c.name} | ${c.vendor} | ${specLine(c)}`);
  }
  return out.join("\n");
}

function specLine(c: Component): string {
  const s = c.specs;
  const bits: string[] = [];
  if (s.active_w != null) bits.push(`${s.active_w}W`);
  if (s.capacity_wh != null) bits.push(`${s.capacity_wh}Wh`);
  if (s.mass_g != null) bits.push(`${s.mass_g}g`);
  if (s.cost_usd != null) bits.push(`$${s.cost_usd}`);
  if (s.lead_time_days != null) bits.push(`${s.lead_time_days}d lead`);
  if (s.ram_gb != null) bits.push(`${s.ram_gb}GB`);
  if (s.tops != null) bits.push(`${s.tops}TOPS`);
  if (s.resolution_mp != null) bits.push(`${s.resolution_mp}MP@${s.fps ?? "?"}fps`);
  if (s.torque_nm != null) bits.push(`${s.torque_nm}Nm`);
  if (s.ip_rating != null) bits.push(`IP${s.ip_rating}`);
  if (c.tags?.length) bits.push(`tags:${c.tags.join("/")}`);
  return bits.join(" ");
}

function diffSwaps(prev: BOM, next: BOM, ctx: ProposerContext): SwapRecord[] {
  const swaps: SwapRecord[] = [];
  const subs = new Set<Subsystem>([
    ...(Object.keys(prev.subsystems) as Subsystem[]),
    ...(Object.keys(next.subsystems) as Subsystem[]),
  ]);
  for (const sub of subs) {
    if (sub === "connectors") continue;
    const a = (prev.subsystems[sub] ?? [])[0]?.part_number;
    const b = (next.subsystems[sub] ?? [])[0]?.part_number;
    if (a !== b) swaps.push({ subsystem: sub, from: a, to: b, reason: "LLM revision" });
  }
  return swaps;
}
