/**
 * intake.ts — lightweight requirement parsing.
 *
 * Two jobs, both heuristic (a full NL→rubric step would be an LLM call; this is a
 * fast, deterministic first pass):
 *   1. parseConstraints / buildRubricFromText — pull obvious numeric constraints
 *      out of a free-text requirement and overlay them on the default rubric, so a
 *      typed requirement is actually tracked by the verifier (not silently ignored).
 *   2. partClassHints — detect part-CLASS keywords (e.g. "FPGA", "LIDAR", "LTE")
 *      and which subsystem they imply, so the provider registry can decide the KB
 *      is insufficient for that subsystem and fall through to live web search.
 */

import type { Rubric, Subsystem } from "@/lib/schema";
import { DRONE_PAYLOAD_RUBRIC } from "@/lib/kb/sample-rubric";

// ---------------------------------------------------------------------------
// Part-class keywords -> the subsystem they belong to
// ---------------------------------------------------------------------------

const CLASS_KEYWORDS: { kw: string; subsystem: Subsystem }[] = [
  { kw: "fpga", subsystem: "compute" },
  { kw: "gpu", subsystem: "compute" },
  { kw: "microcontroller", subsystem: "compute" },
  { kw: "lidar", subsystem: "sensing" },
  { kw: "radar", subsystem: "sensing" },
  { kw: "thermal camera", subsystem: "sensing" },
  { kw: "lwir", subsystem: "sensing" },
  { kw: "depth camera", subsystem: "sensing" },
  { kw: "hyperspectral", subsystem: "sensing" },
  { kw: "gnss", subsystem: "comms" },
  { kw: "lte", subsystem: "comms" },
  { kw: "5g", subsystem: "comms" },
  { kw: "cellular", subsystem: "comms" },
  { kw: "satellite", subsystem: "comms" },
  { kw: "lora", subsystem: "comms" },
  { kw: "brushless", subsystem: "actuation" },
  { kw: "stepper", subsystem: "actuation" },
  { kw: "gimbal motor", subsystem: "actuation" },
];

export interface ClassHint {
  keyword: string;
  subsystem: Subsystem;
}

/** Part-class keywords present in the requirement text, with their subsystem. */
export function partClassHints(text?: string): ClassHint[] {
  if (!text) return [];
  const t = text.toLowerCase();
  const out: ClassHint[] = [];
  for (const { kw, subsystem } of CLASS_KEYWORDS) {
    if (t.includes(kw)) out.push({ keyword: kw, subsystem });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Numeric constraint parsing
// ---------------------------------------------------------------------------

interface Parsed {
  runtimeMin?: number;
  tempMin?: number;
  tempMax?: number;
  massG?: number;
  ip?: number;
  ramGb?: number;
  tops?: number;
  powerW?: number;
  resMp?: number;
  fps?: number;
}

export function parseConstraints(text: string): Parsed {
  const t = text.replace(/[−–—]/g, "-"); // normalize minus/dashes
  const p: Parsed = {};
  const num = (re: RegExp): number | undefined => {
    const m = t.match(re);
    return m ? parseFloat(m[1]) : undefined;
  };

  // runtime: "30 min" / "2 hours"
  const minM = t.match(/(\d+(?:\.\d+)?)\s*(?:min|minute)/i);
  const hrM = t.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h)\b/i);
  if (minM) p.runtimeMin = parseFloat(minM[1]);
  else if (hrM) p.runtimeMin = parseFloat(hrM[1]) * 60;

  // temperature range: "-10..50C" / "-10 to 50 C"
  const tr = t.match(/(-?\d+)\s*(?:\.\.|to)\s*\+?(-?\d+)\s*°?\s*c\b/i);
  if (tr) {
    p.tempMin = parseInt(tr[1], 10);
    p.tempMax = parseInt(tr[2], 10);
  }

  // mass
  const kg = t.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  const g = t.match(/(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/i);
  if (kg) p.massG = parseFloat(kg[1]) * 1000;
  else if (g) p.massG = parseFloat(g[1]);

  const ip = t.match(/ip\s?(\d{2})\b/i);
  if (ip) p.ip = parseInt(ip[1], 10);

  p.ramGb = num(/(\d+(?:\.\d+)?)\s*gb\b/i);
  p.tops = num(/(\d+(?:\.\d+)?)\s*tops\b/i);
  p.powerW = num(/(?:<=|≤|under|max(?:imum)?)?\s*(\d+(?:\.\d+)?)\s*w\b/i);
  p.resMp = num(/(\d+(?:\.\d+)?)\s*mp\b/i);
  p.fps = num(/(\d+(?:\.\d+)?)\s*fps\b/i);

  return p;
}

/**
 * Build a rubric for a free-text requirement: start from the proven default rubric
 * and overlay any explicit numbers the user typed, so the verifier tracks them.
 * (Deep-clones so the shared DRONE_PAYLOAD_RUBRIC is never mutated.)
 */
export function buildRubricFromText(text: string): Rubric {
  const p = parseConstraints(text);
  const rubric: Rubric = DRONE_PAYLOAD_RUBRIC.map((c) => ({
    ...c,
    required: JSON.parse(JSON.stringify(c.required)) as typeof c.required,
  }));
  const at = (dim: string) => rubric.find((c) => c.dimension === dim)?.required;

  if (p.powerW != null) { const r = at("power_budget"); if (r) r.max = p.powerW; }
  if (p.runtimeMin != null) { const r = at("endurance"); if (r) r.runtime_min = p.runtimeMin; }
  if (p.tempMin != null && p.tempMax != null) { const r = at("thermal"); if (r) r.env_temp_c = { min: p.tempMin, max: p.tempMax }; }
  if (p.massG != null) { const r = at("mass"); if (r) r.max = p.massG; }
  if (p.ramGb != null || p.tops != null) {
    const r = at("compute");
    if (r) { if (p.ramGb != null) r.ram_gb = p.ramGb; if (p.tops != null) r.tops = p.tops; }
  }
  if (p.resMp != null || p.fps != null) {
    const r = at("sensing");
    if (r) { if (p.resMp != null) r.resolution_mp = p.resMp; if (p.fps != null) r.fps = p.fps; }
  }
  if (p.ip != null) { const r = at("environment"); if (r) r.ip_rating = p.ip; }

  return rubric;
}
