/**
 * schema.ts — the shared contract.
 *
 * Every module (verifier, proposer, providers, loop, rank, preferences, store,
 * telemetry, UI) depends on these types. Define them once; change them here only.
 *
 * Design rules encoded by these types:
 *  - The verifier is the single source of truth: it consumes (BOM, Rubric) and
 *    emits Checks. Nothing else decides pass/fail.
 *  - Components carry honest, provenanced spec fields — never invented numbers.
 *  - Preferences nudge SOFT scoring/ranking only; they can never admit an
 *    infeasible design (see lib/rank.ts + lib/verifier.ts).
 */

// ---------------------------------------------------------------------------
// Subsystems & sourcing
// ---------------------------------------------------------------------------

/** Subsystems a BOM is decomposed into. Data-driven: extend the list freely. */
export const SUBSYSTEMS = [
  "compute",
  "power",
  "sensing",
  "comms",
  "actuation",
  "thermal",
  "connectors",
  "chassis",
] as const;
export type Subsystem = (typeof SUBSYSTEMS)[number];

/** Where a component came from. Shown as a provenance badge on every part. */
export type Source = "kb" | "web" | "rapidflare";

// ---------------------------------------------------------------------------
// Components — honest, provenanced spec fields the verifier needs
// ---------------------------------------------------------------------------

/** A physical dimension triple in millimetres. */
export interface DimsMm {
  l: number;
  w: number;
  h: number;
}

/** Inclusive temperature operating range in degrees Celsius. */
export interface TempRangeC {
  min: number;
  max: number;
}

/**
 * The honest spec surface of a component. All fields optional because different
 * subsystems populate different fields. The verifier reads only what it needs
 * per constraint and reports missing data as a failure (never a silent pass).
 */
export interface ComponentSpecs {
  // SWAP-C basics (most components carry these)
  mass_g?: number;
  dims_mm?: DimsMm;
  cost_usd?: number;
  lead_time_days?: number;
  temp_range_c?: TempRangeC;
  ip_rating?: number; // e.g. 54 for IP54, 67 for IP67

  // Power — draw of a consumer
  active_w?: number; // typical active power draw
  peak_w?: number; // worst-case instantaneous draw
  idle_w?: number;
  voltage_in?: { min: number; max: number }; // accepted input rail range (V)

  // Power — a supply (battery / PMIC / regulator)
  capacity_wh?: number; // battery usable energy
  rails_out?: RailSpec[]; // regulated rails this supply provides
  peak_supply_w?: number; // max sustained power the supply can deliver

  // Compute
  tops?: number; // INT8 TOPS (or stated precision)
  ram_gb?: number;

  // Sensing
  resolution_mp?: number;
  fps?: number;
  sensor_interface?: Interface; // physical/electrical interface offered
  lanes?: number; // e.g. MIPI-CSI data lanes

  // Comms
  bands?: string[]; // e.g. ["2.4GHz", "5.8GHz", "LTE-B3"]
  antenna_connector?: string; // e.g. "U.FL", "SMA"
  chains?: number; // MIMO chains / radios

  // Actuation
  torque_nm?: number;
  stall_current_a?: number;
  driver_current_a?: number; // continuous current a driver can source

  // Connectors (mating-pair coverage)
  connectors_provided?: string[]; // e.g. ["JST-GH-4", "U.FL"]
  connectors_required?: string[]; // mates this part needs present elsewhere

  // Interfaces a part offers / requires (for lane + bus matching)
  interfaces_provided?: Interface[];
  interfaces_required?: Interface[];
}

export type Interface =
  | "MIPI-CSI"
  | "USB2"
  | "USB3"
  | "GMSL2"
  | "Ethernet"
  | "UART"
  | "SPI"
  | "I2C"
  | "PCIe"
  | "CAN";

/** A regulated output rail a supply provides. */
export interface RailSpec {
  voltage_v: number;
  max_current_a: number;
}

export interface Component {
  id: string;
  subsystem: Subsystem;
  name: string;
  vendor: string;
  part_number: string;
  source: Source;
  source_url?: string; // required for source==="web" provenance
  specs: ComponentSpecs;
  /** Free-form notes (e.g. "connectorized", "automotive grade"). Mined by prefs. */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Rubric — machine-checkable constraints
// ---------------------------------------------------------------------------

export type ConstraintKind = "hard" | "soft";

/**
 * Selects which verifier checker evaluates this constraint. Each value maps to a
 * pure function in lib/verifier.ts. Adding a constraint family = add a value here
 * + a checker there. This keeps the verifier deterministic and extensible.
 */
export type ConstraintDimension =
  | "power_budget" // sum(active_w of consumers) <= supply budget
  | "peak_power_rail" // peak draw per rail (P = I·V) <= rail capacity
  | "voltage_rails" // every required rail is provided
  | "endurance" // capacity_wh / avg_w >= required runtime
  | "thermal" // every part's temp range covers the environment
  | "mass" // total mass <= budget
  | "size" // packed volume / largest dim <= envelope
  | "compute" // TOPS + RAM >= required
  | "sensing" // resolution/fps + interface lanes >= required
  | "comms" // band coverage + antenna match + chains
  | "actuation" // torque + driver current (incl. stall) >= required
  | "connectors" // every required mate is provided
  | "environment" // IP rating >= required
  | "cost" // total cost <= budget (often soft)
  | "lead_time" // max lead time <= budget (often soft)
  | "vendor_consolidation"; // distinct vendors <= target (soft)

/**
 * The required threshold/spec for a constraint. Shape is interpreted by the
 * checker selected via `dimension`. Kept as a loose bag so each family reads the
 * fields it understands; the verifier validates presence.
 */
export interface Required {
  // scalar thresholds
  max?: number;
  min?: number;
  // structured requirements (per family)
  rails?: RailSpec[]; // voltage_rails
  runtime_min?: number; // endurance
  env_temp_c?: TempRangeC; // thermal
  envelope_mm?: DimsMm; // size
  tops?: number; // compute
  ram_gb?: number; // compute
  resolution_mp?: number; // sensing
  fps?: number; // sensing
  interface?: Interface; // sensing/comms
  lanes?: number; // sensing
  bands?: string[]; // comms
  antenna_connector?: string; // comms
  chains?: number; // comms
  torque_nm?: number; // actuation
  ip_rating?: number; // environment
  vendors_max?: number; // vendor_consolidation
}

export interface Constraint {
  id: string;
  dimension: ConstraintDimension;
  kind: ConstraintKind;
  /** Human-readable label for the rubric checklist UI. */
  label: string;
  required: Required;
  /** Soft-constraint weight feeding the scorecard (ignored for hard gate). */
  weight?: number;
  /** Optional subsystem scoping (e.g. a rail requirement for "compute"). */
  subsystem?: Subsystem;
}

export type Rubric = Constraint[];

// ---------------------------------------------------------------------------
// BOM
// ---------------------------------------------------------------------------

export interface BOM {
  subsystems: Partial<Record<Subsystem, Component[]>>;
}

// ---------------------------------------------------------------------------
// Verification (source of truth)
// ---------------------------------------------------------------------------

export type CheckStatus = "pass" | "fail";

export interface Check {
  constraint_id: string;
  dimension: ConstraintDimension;
  kind: ConstraintKind;
  status: CheckStatus;
  /** What the BOM actually delivers (number or human string). */
  observed: number | string;
  /** What the rubric required. */
  required: number | string;
  /** Plain-English why, for the rubric UI + telemetry. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Scoring & ranking (SWAP-C)
// ---------------------------------------------------------------------------

/** Normalized 0..1 sub-scores (1 = best) plus the weighted composite. */
export interface ScoreCard {
  size: number;
  weight: number;
  power: number;
  cost: number;
  margin: number; // headroom across hard constraints
  composite: number;
}

export const PROFILES = ["Efficiency", "Compact", "Value"] as const;
export type Profile = (typeof PROFILES)[number];

/** The five ranking weights. Sum is normalized at use; clamped when learned. */
export interface RankWeights {
  size: number;
  weight: number;
  power: number;
  cost: number;
  margin: number;
}

export interface Candidate {
  profile: Profile;
  bom: BOM;
  checks: Check[];
  coverage: number; // fraction of HARD constraints passing, 0..1
  scorecard: ScoreCard;
  rank?: 1 | 2 | 3;
  feasible: boolean;
  /** Inner-loop passes taken to converge (powers Tab 4). */
  iterations: number;
  /** First failing hard constraint when infeasible (honest reporting). */
  infeasible_reason?: string;
  tokens?: number;
  latency_ms?: number;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export type ModelId =
  | "claude-fable-5"
  | "claude-opus-4-8"
  | "claude-sonnet-4-6"
  | "deterministic";

export interface DesignRun {
  id: string;
  requirement: string;
  rubric: Rubric;
  candidates: Candidate[];
  model: ModelId;
  weights: RankWeights; // effective weights used for ranking this run
  created: string; // ISO timestamp
  telemetry: Event[];
  decision?: DecisionRecord;
}

// ---------------------------------------------------------------------------
// Outer loop — human choice & learned preferences
// ---------------------------------------------------------------------------

export interface DecisionRecord {
  id: string;
  runId: string;
  ts: string;
  agentTop: Profile; // agent's rank #1
  chosen?: Profile; // undefined => rejected all three
  agreed: boolean; // chosen === agentTop
  notes?: string;
  scorecards: Record<Profile, ScoreCard>;
}

export type PreferenceKind = "weight" | "bias" | "profile" | "rule";

export interface Preference {
  id: string;
  ts: string;
  kind: PreferenceKind;
  /** Human-readable, shown in the learning panel. */
  statement: string;
  /** Bounded nudges applied to ranking weights (kind==="weight"). */
  weights?: Partial<RankWeights>;
  /** Proposer selection bias (kind==="bias"): favored vendors/part classes. */
  bias?: {
    favor_vendors?: string[];
    avoid_vendors?: string[];
    favor_tags?: string[];
  };
  source: "choice" | "notes";
  evidenceRunIds: string[];
}

// ---------------------------------------------------------------------------
// Telemetry — log & stream EVERYTHING (co-hero)
// ---------------------------------------------------------------------------

export type EventType =
  | "run.start"
  | "rubric.built"
  | "preferences.consulted"
  | "candidate.start"
  | "provider.query"
  | "provider.result"
  | "provider.error"
  | "part.selected"
  | "model.call"
  | "verify.result"
  | "constraint.fail"
  | "fix.investigate"
  | "fix.swap"
  | "candidate.pass"
  | "candidate.infeasible"
  | "rank.assigned"
  | "run.done"
  | "human.choice"
  | "preference.distilled";

export interface Event {
  ts: string; // ISO timestamp
  type: EventType;
  runId: string;
  candidate?: Profile; // per-candidate tagging for the live stream
  provider?: string;
  source?: Source;
  message: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider query (used by lib/providers)
// ---------------------------------------------------------------------------

export interface ComponentQuery {
  subsystem: Subsystem;
  /** Spec thresholds/fields the proposer is looking to satisfy. */
  required?: Partial<ComponentSpecs>;
  /** Free-text hint (e.g. "low-power SoM with 8GB RAM"). */
  text?: string;
  limit?: number;
}
