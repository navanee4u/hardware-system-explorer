/**
 * preferences.ts — the OUTER loop: the system gets smarter from human choices.
 *
 *   human picks a winner (+ notes) -> record decision -> distill into preferences
 *     -> consult preferences at the start of the next run -> agent's #1 converges
 *        on the human's taste.
 *
 * HARD RULE (enforced by construction): preferences only ever reshape SOFT
 * ranking weights + proposer bias. They are clamped and renormalized, and never
 * touch the verifier's hard-constraint gate. A learned preference can reorder
 * FEASIBLE designs; it can never admit an infeasible one.
 *
 * Disagreement (human pick != agent #1) is the strongest signal: we compare the
 * chosen design's scorecard to the agent's #1 and shift weight toward the axes
 * where the human's pick was stronger, plus mine the free-text note.
 */

import type {
  Candidate,
  DecisionRecord,
  DesignRun,
  Preference,
  Profile,
  RankWeights,
  ScoreCard,
} from "@/lib/schema";
import { DEFAULT_WEIGHTS, normalizeWeights } from "@/lib/rank";
import type { ProposerBias } from "@/lib/proposer";
import type { Store } from "@/lib/store";

/** How hard one decision pushes a weight. Bounded so learning is gradual. */
const NUDGE = 0.12;
const WEIGHT_MIN = 0.02;
const WEIGHT_MAX = 0.6;

type WeightAxis = keyof RankWeights;
const WEIGHT_AXES: WeightAxis[] = ["size", "weight", "power", "cost", "margin"];

// ---------------------------------------------------------------------------
// Consult — fold learned preferences into effective weights + bias
// ---------------------------------------------------------------------------

export interface EffectiveProfile {
  weights: RankWeights;
  bias: ProposerBias;
  statements: string[];
}

/**
 * Combine all learned preferences over the base weights. Weight nudges are summed
 * onto the base, clamped to [WEIGHT_MIN, WEIGHT_MAX], then renormalized to sum 1.
 * Bias preferences union their favored/avoided vendors + tags.
 */
export function consultPreferences(
  prefs: Preference[],
  base: RankWeights = DEFAULT_WEIGHTS,
): EffectiveProfile {
  const weights: RankWeights = { ...base };
  const favor = new Set<string>();
  const avoid = new Set<string>();
  const favorTags = new Set<string>();
  const statements: string[] = [];

  for (const p of prefs) {
    statements.push(p.statement);
    if (p.weights) {
      for (const axis of WEIGHT_AXES) {
        const d = p.weights[axis];
        if (typeof d === "number") weights[axis] = clamp(weights[axis] + d);
      }
    }
    if (p.bias) {
      p.bias.favor_vendors?.forEach((v) => favor.add(v));
      p.bias.avoid_vendors?.forEach((v) => avoid.add(v));
      p.bias.favor_tags?.forEach((t) => favorTags.add(t));
    }
  }

  return {
    weights: normalizeWeights(weights),
    bias: {
      favor_vendors: [...favor],
      avoid_vendors: [...avoid],
      favor_tags: [...favorTags],
    },
    statements,
  };
}

/** Convenience: load preferences from the store and compute the effective profile. */
export async function loadEffective(
  store: Store,
  base: RankWeights = DEFAULT_WEIGHTS,
): Promise<EffectiveProfile> {
  return consultPreferences(await store.listPreferences(), base);
}

// ---------------------------------------------------------------------------
// Distill — turn a decision into durable preferences
// ---------------------------------------------------------------------------

/**
 * Build (but do not persist) the preferences implied by a decision. Pure given
 * the decision + run, so it is unit-testable.
 */
export function distill(decision: DecisionRecord, run: DesignRun): Preference[] {
  const out: Preference[] = [];
  const mkId = (suffix: string) => `pref_${decision.id}_${suffix}`;

  // (1) Disagreement signal: shift weight toward the axes where the human's pick
  //     beat the agent's #1.
  if (decision.chosen && !decision.agreed) {
    const chosen = decision.scorecards[decision.chosen];
    const top = decision.scorecards[decision.agentTop];
    if (chosen && top) {
      const deltas = WEIGHT_AXES.map((axis) => ({ axis, delta: chosen[axis] - top[axis] }))
        .filter((d) => d.delta > 0.01)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 2); // focus on the 1-2 dominant reasons

      if (deltas.length > 0) {
        const weights: Partial<RankWeights> = {};
        for (const d of deltas) weights[d.axis] = round2(NUDGE * (d.delta >= 0.1 ? 1 : 0.6));
        out.push({
          id: mkId("disagree"),
          ts: decision.ts,
          kind: "weight",
          statement: `Human chose ${decision.chosen} over the agent's #1 (${decision.agentTop}); favoring ${deltas
            .map((d) => axisLabel(d.axis))
            .join(" + ")}.`,
          weights,
          source: "choice",
          evidenceRunIds: [run.id],
        });
      }
    }
  }

  // (2) Free-text note mining: keywords -> weight nudges, vendor/tag -> bias.
  if (decision.notes && decision.notes.trim().length > 0) {
    const note = decision.notes.toLowerCase();
    const weights: Partial<RankWeights> = {};
    for (const [axis, kws] of Object.entries(NOTE_KEYWORDS) as [WeightAxis, string[]][]) {
      // A "matters less / less important" phrase near an axis keyword DOWNweights
      // it and overrides any positive mention; otherwise a mention UPweights it.
      const negated = kws.some(
        (k) =>
          note.includes(`${k} matters less`) ||
          note.includes(`${k} is less`) ||
          note.includes(`less ${k}`) ||
          note.includes(`${k} secondary`),
      );
      if (negated) weights[axis] = -NUDGE;
      else if (kws.some((k) => note.includes(k))) weights[axis] = NUDGE;
    }

    const favorTags: string[] = [];
    for (const [tag, kws] of Object.entries(TAG_KEYWORDS)) {
      if (kws.some((k) => note.includes(k))) favorTags.push(tag);
    }
    const favorVendors = mentionedVendors(note, run.candidates);

    if (Object.keys(weights).length > 0) {
      out.push({
        id: mkId("note-weight"),
        ts: decision.ts,
        kind: "weight",
        statement: `From the note: emphasize ${Object.keys(weights)
          .map((a) => axisLabel(a as WeightAxis))
          .join(" + ")}.`,
        weights,
        source: "notes",
        evidenceRunIds: [run.id],
      });
    }
    if (favorTags.length > 0 || favorVendors.length > 0) {
      out.push({
        id: mkId("note-bias"),
        ts: decision.ts,
        kind: "bias",
        statement: `From the note: prefer ${[...favorTags, ...favorVendors].join(", ")}.`,
        bias: { favor_tags: favorTags, favor_vendors: favorVendors },
        source: "notes",
        evidenceRunIds: [run.id],
      });
    }
  }

  // (3) Rejected-all is itself a signal worth recording (margin matters: nothing
  //     felt good enough). Bumps margin so future runs prefer more headroom.
  if (!decision.chosen) {
    out.push({
      id: mkId("rejected-all"),
      ts: decision.ts,
      kind: "weight",
      statement: `Human rejected all three options; weighting headroom/margin more.`,
      weights: { margin: NUDGE },
      source: "choice",
      evidenceRunIds: [run.id],
    });
  }

  return out;
}

/**
 * Record a human decision against a run and learn from it: builds the
 * DecisionRecord, persists it, distills preferences, and persists those too.
 * Returns both so the caller (API route / test) can surface them live.
 */
export async function recordDecisionAndLearn(
  store: Store,
  run: DesignRun,
  choice: { chosen?: Profile; notes?: string },
  opts: { id?: string; ts?: string } = {},
): Promise<{ decision: DecisionRecord; preferences: Preference[] }> {
  const agentTop = run.candidates.find((c) => c.rank === 1)?.profile ?? run.candidates[0].profile;
  const scorecards = scorecardMap(run.candidates);
  const decision: DecisionRecord = {
    id: opts.id ?? `dec_${run.id}`,
    runId: run.id,
    ts: opts.ts ?? new Date().toISOString(),
    agentTop,
    chosen: choice.chosen,
    agreed: choice.chosen != null && choice.chosen === agentTop,
    notes: choice.notes,
    scorecards,
  };
  await store.saveDecision(decision);

  const preferences = distill(decision, run);
  for (const p of preferences) await store.savePreference(p);

  return { decision, preferences };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clamp(n: number): number {
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function scorecardMap(candidates: Candidate[]): Record<Profile, ScoreCard> {
  const map = {} as Record<Profile, ScoreCard>;
  for (const c of candidates) map[c.profile] = c.scorecard;
  return map;
}

function axisLabel(axis: WeightAxis): string {
  return axis === "weight" ? "low mass" : axis === "margin" ? "headroom" : `low ${axis}`;
}

/** Keywords in a free-text note that map to a ranking axis. */
const NOTE_KEYWORDS: Record<WeightAxis, string[]> = {
  size: ["small", "compact", "tiny", "size", "volume", "footprint"],
  weight: ["light", "weight", "mass", "grams", "lightweight"],
  power: ["power", "efficient", "efficiency", "low-power", "endurance", "battery", "runtime"],
  cost: ["cheap", "cost", "budget", "price", "affordable", "inexpensive"],
  margin: ["margin", "headroom", "robust", "safe", "buffer", "conservative"],
};

/** Keywords that map to a favored component tag (proposer bias). */
const TAG_KEYWORDS: Record<string, string[]> = {
  connectorized: ["connectorized", "connector", "plug"],
  "in-stock": ["in stock", "in-stock", "available", "off the shelf", "off-the-shelf"],
  "low-power": ["low-power", "low power"],
  industrial: ["industrial", "rugged", "automotive"],
};

/** Vendors named in the note that actually appear in this run's candidates. */
function mentionedVendors(note: string, candidates: Candidate[]): string[] {
  const vendors = new Set<string>();
  for (const c of candidates) {
    for (const list of Object.values(c.bom.subsystems)) {
      for (const part of list ?? []) {
        if (part.vendor && note.includes(part.vendor.toLowerCase())) vendors.add(part.vendor);
      }
    }
  }
  return [...vendors];
}
