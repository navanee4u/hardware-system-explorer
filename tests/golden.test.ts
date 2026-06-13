/**
 * golden.test.ts — the CI gate.
 *
 * Two properties must hold, deterministically (KB-only, deterministic proposer,
 * injected clock — no network, no wall-clock, no LLM):
 *   (A) A fixed requirement yields THREE feasible, correctly-ranked candidates
 *       within MAX_ITERS, with full telemetry.
 *   (B) A fixed human decision distills a preference that DEMONSTRABLY reorders
 *       the next run — the agent's #1 converges on the human's pick.
 *
 * Treat a failure here as a real failure: investigate, fix, re-run.
 */

import { describe, it, expect } from "vitest";
import { runDesign, MAX_ITERS } from "@/lib/loop";
import { EventBus } from "@/lib/telemetry";
import { buildRegistry } from "@/lib/providers/registry";
import { DEFAULT_WEIGHTS } from "@/lib/rank";
import { consultPreferences, distill, recordDecisionAndLearn } from "@/lib/preferences";
import { DRONE_PAYLOAD_REQUIREMENT, DRONE_PAYLOAD_RUBRIC } from "@/lib/kb/sample-rubric";
import type {
  Component,
  DecisionRecord,
  DesignRun,
  Event,
  Preference,
  Profile,
  ScoreCard,
} from "@/lib/schema";
import type { Store } from "@/lib/store";

// Deterministic, monotonic clock so runs are reproducible.
function fixedClock() {
  let i = 0;
  return () => new Date(1700000000000 + i++ * 1000).toISOString();
}

function kbOnly() {
  return buildRegistry({ order: ["kb"], dedupBy: "part_number" });
}

async function design(weights = DEFAULT_WEIGHTS, bias = {}, runId = "g"): Promise<DesignRun> {
  const clock = fixedClock();
  return runDesign({
    requirement: DRONE_PAYLOAD_REQUIREMENT,
    rubric: DRONE_PAYLOAD_RUBRIC,
    registry: kbOnly(),
    weights,
    bias,
    bus: new EventBus(runId, clock),
    store: null,
    clock,
  });
}

const topProfile = (run: DesignRun): Profile =>
  run.candidates.find((c) => c.rank === 1)!.profile;
const rankOf = (run: DesignRun, p: Profile) =>
  run.candidates.find((c) => c.profile === p)!.rank!;

// ---------------------------------------------------------------------------
// (A) Three feasible, correctly-ranked candidates within MAX_ITERS
// ---------------------------------------------------------------------------

describe("golden A: three ranked feasible candidates", () => {
  it("produces exactly three candidates, all feasible at 100% coverage", async () => {
    const run = await design();
    expect(run.candidates).toHaveLength(3);
    for (const c of run.candidates) {
      expect(c.feasible, `${c.profile} should be feasible: ${c.infeasible_reason ?? ""}`).toBe(true);
      expect(c.coverage).toBe(1);
      expect(c.iterations).toBeLessThanOrEqual(MAX_ITERS);
      expect(c.iterations).toBeGreaterThanOrEqual(1);
    }
  });

  it("assigns distinct ranks 1,2,3 ordered by composite among feasible designs", async () => {
    const run = await design();
    const ranks = run.candidates.map((c) => c.rank).sort();
    expect(ranks).toEqual([1, 2, 3]);
    const byRank = [...run.candidates].sort((a, b) => a.rank! - b.rank!);
    expect(byRank[0].scorecard.composite).toBeGreaterThanOrEqual(byRank[1].scorecard.composite);
    expect(byRank[1].scorecard.composite).toBeGreaterThanOrEqual(byRank[2].scorecard.composite);
  });

  it("picks three DISTINCT designs (different batteries) — not one answer repeated", async () => {
    const run = await design();
    const battery = (c: DesignRun["candidates"][number]) =>
      (c.bom.subsystems.power ?? []).map((p) => p.part_number).join(",");
    const batteries = new Set(run.candidates.map(battery));
    expect(batteries.size).toBe(3);
  });

  it("emits the key telemetry events", async () => {
    const run = await design();
    const types = new Set(run.telemetry.map((e: Event) => e.type));
    for (const t of ["run.start", "rubric.built", "preferences.consulted", "candidate.start", "part.selected", "verify.result", "candidate.pass", "rank.assigned", "run.done"]) {
      expect(types.has(t as Event["type"]), `missing event ${t}`).toBe(true);
    }
    expect(run.telemetry.filter((e) => e.type === "candidate.pass")).toHaveLength(3);
    expect(run.telemetry.filter((e) => e.type === "rank.assigned")).toHaveLength(3);
  });

  it("the verifier — not a preference — owns feasibility (every hard check passes)", async () => {
    const run = await design();
    for (const c of run.candidates) {
      const hardFails = c.checks.filter((k) => k.kind === "hard" && k.status === "fail");
      expect(hardFails, `${c.profile} hard fails: ${hardFails.map((f) => f.constraint_id)}`).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// (B) A decision distills a preference that reorders the next run
// ---------------------------------------------------------------------------

describe("golden B: learning reorders the next run", () => {
  it("default run ranks Compact #1, Efficiency #3 (the agent's baseline taste)", async () => {
    const run = await design();
    expect(topProfile(run)).toBe("Compact");
    expect(rankOf(run, "Efficiency")).toBe(3);
  });

  it("a human choosing Efficiency distills preferences that flip the next run's #1", async () => {
    const run1 = await design(DEFAULT_WEIGHTS, {}, "g1");
    const agentTop = topProfile(run1); // Compact

    const scorecards = {} as Record<Profile, ScoreCard>;
    for (const c of run1.candidates) scorecards[c.profile] = c.scorecard;
    const decision: DecisionRecord = {
      id: "dec-golden",
      runId: run1.id,
      ts: "2026-06-13T00:00:00.000Z",
      agentTop,
      chosen: "Efficiency",
      agreed: false,
      notes: "Endurance and low power matter most for long sorties; weight matters less.",
      scorecards,
    };

    const prefs = distill(decision, run1);
    expect(prefs.length).toBeGreaterThan(0);
    const eff = consultPreferences(prefs);
    // Learning moved weight toward the favored axis (power) and away from mass.
    expect(eff.weights.power).toBeGreaterThan(DEFAULT_WEIGHTS.power);
    expect(eff.weights.weight).toBeLessThan(DEFAULT_WEIGHTS.weight);

    const run2 = await design(eff.weights, eff.bias, "g2");
    // The chosen design climbed, and the agent's #1 converged on the human's pick.
    expect(rankOf(run2, "Efficiency")).toBeLessThan(rankOf(run1, "Efficiency"));
    expect(topProfile(run2)).toBe("Efficiency");
    expect(topProfile(run2)).not.toBe(agentTop);
  });

  it("persists the decision + distilled preferences through the Store", async () => {
    const run1 = await design(DEFAULT_WEIGHTS, {}, "g3");
    const store = new MemStore();
    const { decision, preferences } = await recordDecisionAndLearn(
      store,
      run1,
      { chosen: "Efficiency", notes: "Endurance matters most; weight matters less." },
      { id: "dec-persist", ts: "2026-06-13T00:00:00.000Z" },
    );
    expect(decision.agreed).toBe(false);
    expect(decision.agentTop).toBe("Compact");
    const stored = await store.listPreferences();
    expect(stored.length).toBe(preferences.length);
    expect(stored.length).toBeGreaterThan(0);
    // Consulting the stored prefs reproduces the learned shift.
    const eff = consultPreferences(stored);
    expect(eff.weights.power).toBeGreaterThan(DEFAULT_WEIGHTS.power);
  });
});

// ---------------------------------------------------------------------------
// Minimal in-memory Store for hermetic tests.
// ---------------------------------------------------------------------------

class MemStore implements Store {
  private runs = new Map<string, DesignRun>();
  private decisions = new Map<string, DecisionRecord>();
  private prefs = new Map<string, Preference>();
  private components = new Map<string, Component>();
  async saveRun(run: DesignRun) {
    this.runs.set(run.id, run);
  }
  async getRun(id: string) {
    return this.runs.get(id) ?? null;
  }
  async listRuns() {
    return [...this.runs.values()];
  }
  async appendEvents() {}
  async saveDecision(d: DecisionRecord) {
    this.decisions.set(d.id, d);
    const run = this.runs.get(d.runId);
    if (run) run.decision = d;
  }
  async savePreference(p: Preference) {
    this.prefs.set(p.id, p);
  }
  async listPreferences() {
    return [...this.prefs.values()];
  }
  async upsertComponents(cs: Component[]) {
    for (const c of cs) this.components.set(c.part_number, c);
  }
  async listComponents() {
    return [...this.components.values()];
  }
}
