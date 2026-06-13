/**
 * examples.ts — the pre-loaded example gallery.
 *
 * Three evocative, visually-distinct hardware platforms, each shipped with a
 * ready-to-run requirement AND a machine-checkable rubric tuned against the seed
 * KB so all three are feasible. Each frames the intelligent compute / sensing /
 * comms / power / actuation CORE of its platform, which is what the KB describes.
 */

import type { Rubric } from "@/lib/schema";

export interface Example {
  id: string;
  slug: string; // also the image filename: /examples/<slug>.png
  title: string;
  tagline: string;
  requirement: string;
  rubric: Rubric;
  feasibleByDesign: boolean; // false => intentionally shows honest infeasibility
}

interface Knobs {
  powerW: number;
  rail5A?: number;
  rail12A?: number;
  runtimeMin: number;
  tempMin: number;
  tempMax: number;
  massG: number;
  env: { l: number; w: number; h: number };
  ramGb: number;
  tops: number;
  resMp: number;
  fps: number;
  lanes: number;
  chains: number;
  torqueNm: number;
  ip: number;
  costMax: number;
  leadMax: number;
  vendorsMax: number;
}

/** Build a complete 12-hard + 3-soft rubric from numeric knobs. */
function buildRubric(k: Knobs): Rubric {
  return [
    { id: "h-power-budget", dimension: "power_budget", kind: "hard", label: `Active power ≤ ${k.powerW} W`, required: { max: k.powerW } },
    {
      id: "h-voltage-rails",
      dimension: "voltage_rails",
      kind: "hard",
      label: "Supplies 5 V and 12 V rails",
      required: { rails: [{ voltage_v: 5, max_current_a: k.rail5A ?? 3 }, { voltage_v: 12, max_current_a: k.rail12A ?? 1.5 }] },
    },
    { id: "h-endurance", dimension: "endurance", kind: "hard", label: `Runtime ≥ ${k.runtimeMin} min`, required: { runtime_min: k.runtimeMin } },
    { id: "h-thermal", dimension: "thermal", kind: "hard", label: `Operates ${k.tempMin}..${k.tempMax} °C`, required: { env_temp_c: { min: k.tempMin, max: k.tempMax } } },
    { id: "h-mass", dimension: "mass", kind: "hard", label: `Mass ≤ ${k.massG} g`, required: { max: k.massG } },
    { id: "h-size", dimension: "size", kind: "hard", label: `Fits ${k.env.l}×${k.env.w}×${k.env.h} mm`, required: { envelope_mm: k.env } },
    { id: "h-compute", dimension: "compute", kind: "hard", label: `Compute ≥ ${k.ramGb} GB / ${k.tops} TOPS`, required: { ram_gb: k.ramGb, tops: k.tops } },
    { id: "h-sensing", dimension: "sensing", kind: "hard", label: `Camera ≥ ${k.resMp} MP @${k.fps} fps, ${k.lanes} lane(s)`, required: { resolution_mp: k.resMp, fps: k.fps, interface: "MIPI-CSI", lanes: k.lanes } },
    { id: "h-comms", dimension: "comms", kind: "hard", label: `Wireless link, ≥ ${k.chains} chain(s)`, required: { chains: k.chains } },
    { id: "h-actuation", dimension: "actuation", kind: "hard", label: `Actuation torque ≥ ${k.torqueNm} Nm`, required: { torque_nm: k.torqueNm } },
    { id: "h-connectors", dimension: "connectors", kind: "hard", label: "All connector mates provided", required: {} },
    { id: "h-environment", dimension: "environment", kind: "hard", label: `Ingress ≥ IP${k.ip}`, required: { ip_rating: k.ip } },
    { id: "s-cost", dimension: "cost", kind: "soft", label: `BOM cost ≤ $${k.costMax}`, required: { max: k.costMax }, weight: 0.45 },
    { id: "s-lead-time", dimension: "lead_time", kind: "soft", label: `Lead time ≤ ${k.leadMax} d`, required: { max: k.leadMax }, weight: 0.3 },
    { id: "s-vendor-consolidation", dimension: "vendor_consolidation", kind: "soft", label: `≤ ${k.vendorsMax} vendors`, required: { vendors_max: k.vendorsMax }, weight: 0.25 },
  ];
}

export const EXAMPLES: Example[] = [
  {
    id: "ex-inspection-drone",
    slug: "inspection-drone",
    title: "Outdoor Inspection Drone",
    tagline: "Power-line & rooftop imaging, downlinked to a ground station",
    requirement:
      "A self-contained outdoor inspection drone payload that captures imagery of power lines and rooftops and streams a downlink to a ground station. ≥30 min runtime, −10..+50 °C, IP54, ≤700 g in a 150×110×75 mm envelope, with a Linux-class compute node, a MIPI-CSI camera, a wireless downlink and a steerable mount — from connectorized, in-stock parts.",
    rubric: buildRubric({ powerW: 25, runtimeMin: 30, tempMin: -10, tempMax: 50, massG: 700, env: { l: 150, w: 110, h: 75 }, ramGb: 1.5, tops: 0, resMp: 1.5, fps: 20, lanes: 2, chains: 1, torqueNm: 0.15, ip: 54, costMax: 400, leadMax: 21, vendorsMax: 7 }),
    feasibleByDesign: true,
  },
  {
    id: "ex-humanoid-head",
    slug: "humanoid-head",
    title: "Humanoid Perception Head",
    tagline: "On-board vision + NPU for a service humanoid's sensor head",
    requirement:
      "The perception head for an indoor service humanoid: an NPU-class compute node running real-time vision, an 8 MP camera, a wireless link to the body controller, and a pan-tilt neck. ≥60 min between charges, 0..40 °C indoors, ≤500 g, 150×110×75 mm head shell.",
    rubric: buildRubric({ powerW: 22, runtimeMin: 60, tempMin: 0, tempMax: 40, massG: 500, env: { l: 150, w: 110, h: 75 }, ramGb: 4, tops: 15, resMp: 8, fps: 30, lanes: 2, chains: 1, torqueNm: 0.2, ip: 40, costMax: 600, leadMax: 28, vendorsMax: 8 }),
    feasibleByDesign: true,
  },
  {
    id: "ex-delivery-robot",
    slug: "delivery-robot",
    title: "Sidewalk Delivery Robot",
    tagline: "All-weather last-mile nav pod with cellular backhaul",
    requirement:
      "The navigation pod for a last-mile sidewalk delivery robot: vision-based obstacle avoidance, an LTE backhaul for teleop, and a long shift between charges. ≥180 min runtime, −5..+45 °C, fully weather-sealed (IP67), ≤850 g core in a 150×110×75 mm bay.",
    rubric: buildRubric({ powerW: 22, runtimeMin: 180, tempMin: -5, tempMax: 45, massG: 850, env: { l: 150, w: 110, h: 75 }, ramGb: 4, tops: 6, resMp: 8, fps: 30, lanes: 2, chains: 1, torqueNm: 0.2, ip: 67, costMax: 500, leadMax: 28, vendorsMax: 8 }),
    feasibleByDesign: true,
  },
];
