/**
 * rank.ts — SWAP-C scoring + ranking. Pure functions, no LLM, no I/O.
 *
 * Normalization basis: RUBRIC BUDGETS, not min/max across candidates. Each
 * sub-score is `clamp(1 - used/budget, 0, 1)` where `used` is the observed total
 * from the BOM and `budget` is the constraint's stated limit. This makes a
 * candidate's score stable and explainable in isolation — it does not shift when
 * its peers change — and a score of 1 always means "uses none of the budget"
 * while 0 means "at or over budget".
 *
 * Defensive rule: a missing budget or missing spec yields the NEUTRAL value 0.5
 * for that sub-score. No sub-score, headroom, or composite is ever NaN.
 *
 * Preferences only ever ride in through `weights` (RankWeights) — they reshape the
 * weighted composite but can never flip an infeasible design feasible. Feasibility
 * is owned by the verifier (the Check[] / Candidate.feasible flag); this module
 * only reads it.
 *
 * This file imports ONLY from "@/lib/schema".
 */

import type {
  BOM,
  Candidate,
  Check,
  Component,
  Rubric,
  ScoreCard,
  RankWeights,
} from "@/lib/schema";

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

/** Balanced default — every SWAP-C axis weighted equally (sums to 1.0). */
export const DEFAULT_WEIGHTS: RankWeights = {
  size: 0.2,
  weight: 0.2,
  power: 0.2,
  cost: 0.2,
  margin: 0.2,
};

/** Fallback cost ceiling (USD) used when the rubric carries no cost constraint. */
const DEFAULT_COST_BUDGET_USD = 1000;

/**
 * Scale a RankWeights so the five fields sum to exactly 1. Negative weights are
 * floored to 0 (a negative axis weight is meaningless and would corrupt the
 * composite). If the (clamped) total is 0 — every weight zero/negative — fall
 * back to balanced DEFAULT_WEIGHTS rather than dividing by zero.
 */
export function normalizeWeights(w: RankWeights): RankWeights {
  const safe = (n: number): number =>
    Number.isFinite(n) && n > 0 ? n : 0;

  const cleaned: RankWeights = {
    size: safe(w.size),
    weight: safe(w.weight),
    power: safe(w.power),
    cost: safe(w.cost),
    margin: safe(w.margin),
  };

  const total =
    cleaned.size +
    cleaned.weight +
    cleaned.power +
    cleaned.cost +
    cleaned.margin;

  if (total <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }

  return {
    size: cleaned.size / total,
    weight: cleaned.weight / total,
    power: cleaned.power / total,
    cost: cleaned.cost / total,
    margin: cleaned.margin / total,
  };
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

const NEUTRAL = 0.5;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Budget-normalized "lower is better" score: clamp(1 - used/budget, 0, 1).
 * Neutral (0.5) when the budget is missing/non-positive or `used` is not finite.
 */
function budgetScore(used: number, budget: number | undefined): number {
  if (
    budget === undefined ||
    !Number.isFinite(budget) ||
    budget <= 0 ||
    !Number.isFinite(used)
  ) {
    return NEUTRAL;
  }
  return clamp01(1 - used / budget);
}

/**
 * Endurance headroom 0..1 from the endurance Check (achieved vs required runtime).
 * Scaled so a design at exactly the requirement scores 0 and one with ~15x the
 * required runtime saturates at 1 — enough spread to separate a big-battery
 * endurance build from a light short-runtime one. Undefined if no endurance check.
 */
function enduranceHeadroom(checks: Check[]): number | undefined {
  if (!Array.isArray(checks)) return undefined;
  const c = checks.find((k) => k.dimension === "endurance");
  if (!c) return undefined;
  const achieved = typeof c.observed === "number" ? c.observed : parseFloat(String(c.observed));
  const required = typeof c.required === "number" ? c.required : parseFloat(String(c.required));
  if (!Number.isFinite(achieved) || !Number.isFinite(required) || required <= 0) return undefined;
  const K = 15;
  return clamp01((achieved - required) / (required * K));
}

/** Flatten every component across all populated subsystems of a BOM. */
function allComponents(bom: BOM): Component[] {
  const out: Component[] = [];
  if (!bom || !bom.subsystems) return out;
  for (const list of Object.values(bom.subsystems)) {
    if (Array.isArray(list)) {
      for (const c of list) if (c) out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// BOM observed totals
// ---------------------------------------------------------------------------

/** Total mass in grams across the BOM (missing values contribute 0). */
function totalMassG(parts: Component[]): number {
  let sum = 0;
  for (const c of parts) {
    const m = c.specs?.mass_g;
    if (Number.isFinite(m)) sum += m as number;
  }
  return sum;
}

/** Total typical active power draw in watts across the BOM. */
function totalActiveW(parts: Component[]): number {
  let sum = 0;
  for (const c of parts) {
    const p = c.specs?.active_w;
    if (Number.isFinite(p)) sum += p as number;
  }
  return sum;
}

/** Total unit cost in USD across the BOM. */
function totalCostUsd(parts: Component[]): number {
  let sum = 0;
  for (const c of parts) {
    const v = c.specs?.cost_usd;
    if (Number.isFinite(v)) sum += v as number;
  }
  return sum;
}

/**
 * Packed bounding volume in mm^3: the naive sum of each part's box volume
 * (l*w*h). This is the conservative "no nesting" packed footprint the size
 * sub-score compares against the envelope budget. Parts lacking dims contribute
 * 0 (honest: we cannot inflate a candidate by hiding a part's size, but we also
 * do not invent one).
 */
function packedVolumeMm3(parts: Component[]): number {
  let sum = 0;
  for (const c of parts) {
    const d = c.specs?.dims_mm;
    if (
      d &&
      Number.isFinite(d.l) &&
      Number.isFinite(d.w) &&
      Number.isFinite(d.h)
    ) {
      sum += d.l * d.w * d.h;
    }
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Rubric budget extraction
// ---------------------------------------------------------------------------

function firstByDimension(rubric: Rubric, dim: string) {
  if (!Array.isArray(rubric)) return undefined;
  return rubric.find((c) => c?.dimension === dim);
}

/** Envelope volume budget in mm^3 from the `size` constraint, if present. */
function sizeBudgetMm3(rubric: Rubric): number | undefined {
  const env = firstByDimension(rubric, "size")?.required?.envelope_mm;
  if (
    env &&
    Number.isFinite(env.l) &&
    Number.isFinite(env.w) &&
    Number.isFinite(env.h)
  ) {
    return env.l * env.w * env.h;
  }
  return undefined;
}

function massBudgetG(rubric: Rubric): number | undefined {
  return firstByDimension(rubric, "mass")?.required?.max;
}

function powerBudgetW(rubric: Rubric): number | undefined {
  return firstByDimension(rubric, "power_budget")?.required?.max;
}

/** Cost ceiling: the `cost` constraint's max, or a sane default if absent. */
function costBudgetUsd(rubric: Rubric): number {
  const max = firstByDimension(rubric, "cost")?.required?.max;
  return Number.isFinite(max) ? (max as number) : DEFAULT_COST_BUDGET_USD;
}

// ---------------------------------------------------------------------------
// Margin: normalized headroom across passing HARD checks
// ---------------------------------------------------------------------------

/**
 * Margin sub-score = average normalized headroom across the HARD checks that
 * PASSED. Headroom for a numeric check is how far the observed value sits inside
 * its limit, mapped to 0..1:
 *   - "lower is better" (observed <= required): headroom = 1 - observed/required
 *   - "higher is better" (observed >= required): headroom = 1 - required/observed
 * We infer direction from observed-vs-required since Check does not carry it
 * explicitly. Non-numeric / structural checks (e.g. connector coverage) count as
 * a pass with modest headroom so they neither dominate nor are ignored.
 *
 * Infeasible designs (a failing hard check, or no passing hard checks) get a LOW
 * margin so feasible designs always read as having more headroom.
 */
function marginScore(checks: Check[]): number {
  if (!Array.isArray(checks) || checks.length === 0) return NEUTRAL;

  const hard = checks.filter((c) => c?.kind === "hard");
  if (hard.length === 0) return NEUTRAL;

  // Any hard failure => infeasible => low margin.
  const anyHardFail = hard.some((c) => c.status === "fail");
  if (anyHardFail) return 0.05;

  const passing = hard.filter((c) => c.status === "pass");
  if (passing.length === 0) return 0.05;

  const STRUCTURAL_HEADROOM = 0.5; // non-numeric pass: present but unmeasured
  let acc = 0;
  for (const c of passing) {
    acc += checkHeadroom(c, STRUCTURAL_HEADROOM);
  }
  return clamp01(acc / passing.length);
}

/** Normalized 0..1 headroom for a single passing check. */
function checkHeadroom(c: Check, structuralFallback: number): number {
  const obs = toNum(c.observed);
  const req = toNum(c.required);

  // Structural / unparseable: treat as a measured-but-modest pass.
  if (obs === undefined || req === undefined) return structuralFallback;

  if (req === 0) {
    // Requirement of zero: any non-negative observed is a clean pass.
    return obs <= 0 ? 1 : structuralFallback;
  }
  if (obs === 0) {
    // Observed zero against a positive requirement.
    // If lower-is-better this is maximal headroom; treat as best case.
    return 1;
  }

  if (obs <= req) {
    // Lower-is-better: observed comfortably under the cap.
    return clamp01(1 - obs / req);
  }
  // Higher-is-better: observed comfortably above the floor.
  return clamp01(1 - req / obs);
}

/** Coerce a Check.observed/required (number | string) to a finite number. */
function toNum(v: number | string | undefined): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score one candidate against the rubric budgets. Returns a fully-populated
 * ScoreCard with no NaN. `weights` is normalized internally before forming the
 * composite, so callers may pass raw (un-normalized) weights.
 */
export function scoreCandidate(args: {
  bom: BOM;
  checks: Check[];
  rubric: Rubric;
  weights: RankWeights;
}): ScoreCard {
  const { bom, checks, rubric, weights } = args;
  const parts = allComponents(bom);

  const size = budgetScore(packedVolumeMm3(parts), sizeBudgetMm3(rubric));
  const weight = budgetScore(totalMassG(parts), massBudgetG(rubric));
  // The "power" axis is power+endurance HEALTH (faithful to the Efficiency
  // profile's "min active power, max endurance margin"): half from staying under
  // the active-power budget, half from runtime headroom beyond the requirement.
  const drawScore = budgetScore(totalActiveW(parts), powerBudgetW(rubric));
  const endur = enduranceHeadroom(checks);
  const power = endur === undefined ? drawScore : clamp01(0.5 * drawScore + 0.5 * endur);
  const cost = budgetScore(totalCostUsd(parts), costBudgetUsd(rubric));
  const margin = marginScore(checks);

  const w = normalizeWeights(weights);
  const composite = clamp01(
    size * w.size +
      weight * w.weight +
      power * w.power +
      cost * w.cost +
      margin * w.margin,
  );

  return { size, weight, power, cost, margin, composite };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Assign rank 1|2|3 across candidates.
 *
 * IMPORTANT: rankCandidates assumes each candidate's `scorecard` is ALREADY set
 * (the caller runs scoreCandidate first and stores the result on the candidate).
 * This function does NOT call scoreCandidate — it ranks purely on the existing
 * `scorecard.composite` and the `feasible` flag. A candidate that still carries a
 * zeroed scorecard will simply sort to the bottom of its feasibility bucket.
 *
 * Ordering rules:
 *   - FEASIBLE candidates always outrank INFEASIBLE ones.
 *   - Within each bucket, sort by composite DESC.
 *   - Ranks are assigned 1,2,3 across the combined ordering (feasible first).
 *   - Infeasible candidates keep feasible:false — ranking never relabels them.
 *
 * Returns the same candidate objects (mutated with `rank`) for caller convenience.
 */
export function rankCandidates(
  candidates: Candidate[],
  _weights: RankWeights,
): Candidate[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return candidates ?? [];
  }

  const ordered = [...candidates].sort((a, b) => {
    // Feasible bucket first.
    const fa = a.feasible ? 1 : 0;
    const fb = b.feasible ? 1 : 0;
    if (fa !== fb) return fb - fa;
    // Then composite DESC (missing/zeroed scorecards fall to the bottom).
    const ca = a.scorecard?.composite ?? 0;
    const cb = b.scorecard?.composite ?? 0;
    return cb - ca;
  });

  ordered.forEach((cand, i) => {
    const r = i + 1;
    // Schema only types rank as 1|2|3; clamp defensively for >3 candidates.
    cand.rank = (r <= 3 ? r : 3) as 1 | 2 | 3;
  });

  return candidates;
}

// `_weights` is accepted to satisfy the frozen signature; ranking is decided by
// the already-computed composite (which baked weights in at scoreCandidate time)
// plus the hard feasibility gate, so weights are intentionally not re-applied here.
