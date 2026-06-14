/**
 * loop.ts — the inner loop (per candidate) and the full design run.
 *
 * Inner loop, run once per SWAP-C profile:
 *   propose BOM (via providers, biased to the profile + learned preferences)
 *     -> verify against rubric
 *     -> feed failures back -> proposer investigates + re-sources + revises
 *     -> repeat until all HARD constraints pass (coverage == 1) or MAX_ITERS.
 *   then score the passing design on SWAP-C.
 *
 * runDesign() drives all three candidates, ranks them, streams every event, and
 * persists the run + discovered components. The proposer is injected, so the
 * deterministic proposer (no key) and the LLM proposer (Phase 3) share this loop.
 */

import type {
  BOM,
  Candidate,
  Check,
  Component,
  DesignRun,
  ModelId,
  Profile,
  RankWeights,
  Rubric,
} from "@/lib/schema";
import { PROFILES } from "@/lib/schema";
import { EventBus } from "@/lib/telemetry";
import { verify, hardCoverage, firstHardFailure } from "@/lib/verifier";
import { scoreCandidate, rankCandidates, DEFAULT_WEIGHTS } from "@/lib/rank";
import { buildRegistry } from "@/lib/providers/registry";
import type { ComponentRegistry } from "@/lib/providers/types";
import {
  DeterministicProposer,
  type Proposer,
  type ProposerBias,
  type ProposerContext,
} from "@/lib/proposer";
import { LLMProposer } from "@/lib/proposer.llm";
import { getStore, type Store } from "@/lib/store";

export const MAX_ITERS = 6;

/** A factory so the loop is proposer-agnostic (deterministic now, LLM later). */
export type ProposerFactory = (profile: Profile) => Proposer;

export interface RunDeps {
  registry?: ComponentRegistry;
  rubric: Rubric;
  requirement: string;
  weights?: RankWeights;
  bias?: ProposerBias;
  preferenceStatements?: string[]; // learned preference statements, injected into the LLM proposer
  model?: ModelId;
  makeProposer?: ProposerFactory;
  bus?: EventBus;
  store?: Store | null; // null => do not persist (tests)
  maxIters?: number;
  // Injectable for deterministic tests (no wall-clock / random in golden runs).
  runId?: string;
  clock?: () => string;
}

// ---------------------------------------------------------------------------
// One candidate
// ---------------------------------------------------------------------------

export async function runCandidate(
  profile: Profile,
  proposer: Proposer,
  rubric: Rubric,
  weights: RankWeights,
  bus: EventBus,
  maxIters: number,
): Promise<{ candidate: Candidate; parts: Component[] }> {
  const ctx: ProposerContext = { bus, candidate: profile };
  const startedAt = Date.now();

  bus.emit({ type: "candidate.start", candidate: profile, message: `candidate ${profile}: proposing` });

  let bom: BOM = await proposer.proposeInitial(ctx);
  let checks: Check[] = verify(bom, rubric);
  let iterations = 1;
  emitVerify(bus, profile, checks, iterations);

  while (hardCoverage(checks) < 1 && iterations < maxIters) {
    const { bom: revised, swaps } = await proposer.revise(bom, checks, ctx);
    if (swaps.length === 0) break; // proposer can't improve -> honestly infeasible
    bom = revised;
    checks = verify(bom, rubric);
    iterations += 1;
    emitVerify(bus, profile, checks, iterations);
  }

  const coverage = hardCoverage(checks);
  const feasible = coverage >= 1;
  const scorecard = scoreCandidate({ bom, checks, rubric, weights });

  const candidate: Candidate = {
    profile,
    bom,
    checks,
    coverage,
    scorecard,
    feasible,
    iterations,
    latency_ms: Date.now() - startedAt,
    infeasible_reason: feasible ? undefined : firstHardFailure(checks)?.reason,
  };

  if (feasible) {
    bus.emit({
      type: "candidate.pass",
      candidate: profile,
      message: `candidate ${profile}: feasible (100% hard coverage in ${iterations} iter)`,
      data: { coverage, iterations, composite: scorecard.composite },
    });
  } else {
    bus.emit({
      type: "candidate.infeasible",
      candidate: profile,
      message: `candidate ${profile}: infeasible — ${candidate.infeasible_reason ?? "unmet hard constraint"}`,
      data: { coverage, iterations, reason: candidate.infeasible_reason },
    });
  }

  return { candidate, parts: flatten(bom) };
}

function emitVerify(bus: EventBus, profile: Profile, checks: Check[], iteration: number) {
  const hard = checks.filter((c) => c.kind === "hard");
  const passed = hard.filter((c) => c.status === "pass").length;
  bus.emit({
    type: "verify.result",
    candidate: profile,
    message: `verify (iter ${iteration}): ${passed}/${hard.length} hard checks pass`,
    data: {
      iteration,
      coverage: hardCoverage(checks),
      checks: checks.map((c) => ({
        id: c.constraint_id,
        kind: c.kind,
        status: c.status,
        observed: c.observed,
        required: c.required,
      })),
    },
  });
  for (const c of checks) {
    if (c.kind === "hard" && c.status === "fail") {
      bus.emit({
        type: "constraint.fail",
        candidate: profile,
        message: `${c.constraint_id} FAIL: ${c.reason}`,
        data: { constraint_id: c.constraint_id, observed: c.observed, required: c.required },
      });
    }
  }
}

function flatten(bom: BOM): Component[] {
  const out: Component[] = [];
  for (const list of Object.values(bom.subsystems)) {
    if (Array.isArray(list)) out.push(...list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Full run: three candidates -> ranked set -> persisted
// ---------------------------------------------------------------------------

export async function runDesign(deps: RunDeps): Promise<DesignRun> {
  const weights = deps.weights ?? DEFAULT_WEIGHTS;
  const model: ModelId = deps.model ?? "deterministic";
  const maxIters = deps.maxIters ?? MAX_ITERS;
  const runId = deps.runId ?? `run_${Date.now().toString(36)}`;
  const bus = deps.bus ?? new EventBus(runId, deps.clock);
  const registry =
    deps.registry ??
    buildRegistry({
      order: ["kb", "websearch", "rapidflare"],
      dedupBy: "part_number",
      mode: "fallback", // KB-first; web/Rapidflare only fire when the KB is thin
      minResults: 3,
    });
  // Default factory: use the LLM proposer when a real model is selected AND a key
  // is present; otherwise the deterministic proposer (which also closes the loop
  // if the LLM errors mid-run). The proposer is injected, so tests stay offline.
  const useLLM =
    model !== "deterministic" && Boolean(process.env.ANTHROPIC_API_KEY);
  const makeProposer: ProposerFactory =
    deps.makeProposer ??
    ((profile) => {
      if (useLLM) {
        return new LLMProposer({
          model,
          registry,
          rubric: deps.rubric,
          profile,
          bias: deps.bias,
          preferences: deps.preferenceStatements,
          requirement: deps.requirement,
        });
      }
      return new DeterministicProposer(registry, deps.rubric, profile, deps.bias, deps.requirement);
    });

  const createdAt = deps.clock ? deps.clock() : new Date().toISOString();

  bus.emit({
    type: "run.start",
    message: `run ${runId}: ${deps.requirement.slice(0, 80)}…`,
    data: { runId, model, requirement: deps.requirement },
  });
  bus.emit({
    type: "rubric.built",
    message: `rubric: ${deps.rubric.length} constraints (${deps.rubric.filter((c) => c.kind === "hard").length} hard)`,
    data: { count: deps.rubric.length, hard: deps.rubric.filter((c) => c.kind === "hard").length },
  });
  bus.emit({
    type: "preferences.consulted",
    message: `ranking weights applied`,
    data: { weights, bias: deps.bias ?? {} },
  });

  // Run the three candidates concurrently; they share the bus (events tagged by
  // candidate) so the UI sees all three evolving at once.
  const settled = await Promise.all(
    PROFILES.map((profile) =>
      runCandidate(profile, makeProposer(profile), deps.rubric, weights, bus, maxIters),
    ),
  );

  const candidates = settled.map((s) => s.candidate);
  rankCandidates(candidates, weights);

  for (const c of candidates) {
    bus.emit({
      type: "rank.assigned",
      candidate: c.profile,
      message: `${c.profile}: rank #${c.rank} (composite ${c.scorecard.composite.toFixed(3)}, ${c.feasible ? "feasible" : "infeasible"})`,
      data: { rank: c.rank, composite: c.scorecard.composite, feasible: c.feasible },
    });
  }

  const run: DesignRun = {
    id: runId,
    requirement: deps.requirement,
    rubric: deps.rubric,
    candidates,
    model,
    weights,
    created: createdAt,
    telemetry: bus.all(),
  };

  bus.emit({
    type: "run.done",
    message: `run ${runId} done — #1 ${candidates.find((c) => c.rank === 1)?.profile}`,
    data: {
      ranks: candidates.map((c) => ({ profile: c.profile, rank: c.rank, feasible: c.feasible })),
    },
  });
  run.telemetry = bus.all(); // include the run.done event

  // Persist unless explicitly disabled (tests pass store:null).
  if (deps.store !== null) {
    const store = deps.store ?? (await getStore());
    const discovered = settled.flatMap((s) => s.parts);
    await store.saveRun(run);
    await store.appendEvents(runId, run.telemetry);
    await store.upsertComponents(discovered);
  }

  return run;
}
