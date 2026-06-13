/**
 * examples.ts — the pre-loaded example gallery.
 *
 * Ten evocative hardware platforms, each shipped with a ready-to-run requirement
 * AND a machine-checkable rubric tuned against the seed KB. Nine are feasible;
 * one (the solar HALE drone) intentionally demands an endurance the KB can't meet,
 * so the demo can show the verifier honestly reporting infeasibility — never faking
 * a passing design.
 *
 * Each example frames the intelligent compute / sensing / comms / power / actuation
 * CORE of its platform, which is what the KB describes.
 */

import type { Rubric } from "@/lib/schema";

export interface Example {
  id: string;
  slug: string; // also the image filename: /examples/<slug>.jpg
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
  {
    id: "ex-robotic-arm",
    slug: "robotic-arm",
    title: "6-DOF Collaborative Arm",
    tagline: "Eye-in-hand vision + torque-aware joint controller",
    requirement:
      "The controller core for a 6-DOF collaborative robotic arm: an eye-in-hand camera for pick-and-place, a wireless cell to the fleet manager, and a joint driver sized for the wrist actuator. ≥90 min duty cycle, 0..45 °C, ≤700 g, 150×110×75 mm control box.",
    rubric: buildRubric({ powerW: 22, runtimeMin: 90, tempMin: 0, tempMax: 45, massG: 700, env: { l: 150, w: 110, h: 75 }, ramGb: 2, tops: 0, resMp: 8, fps: 30, lanes: 2, chains: 1, torqueNm: 0.6, ip: 40, costMax: 450, leadMax: 21, vendorsMax: 8 }),
    feasibleByDesign: true,
  },
  {
    id: "ex-crop-drone",
    slug: "crop-drone",
    title: "Agricultural Crop-Scout Drone",
    tagline: "High-res field imaging with on-board analysis + LTE upload",
    requirement:
      "A crop-scouting drone payload that captures high-resolution field imagery, runs on-board plant-health inference, and uploads over cellular. ≥45 min runtime, −5..+45 °C, IP54, ≤700 g, with a steerable camera mount.",
    rubric: buildRubric({ powerW: 25, runtimeMin: 45, tempMin: -5, tempMax: 45, massG: 700, env: { l: 150, w: 110, h: 75 }, ramGb: 4, tops: 10, resMp: 8, fps: 20, lanes: 2, chains: 1, torqueNm: 0.15, ip: 54, costMax: 500, leadMax: 28, vendorsMax: 8 }),
    feasibleByDesign: true,
  },
  {
    id: "ex-sar-quadruped",
    slug: "sar-quadruped",
    title: "Search & Rescue Quadruped",
    tagline: "Thermal-imaging sensor pack with long-range radio",
    requirement:
      "A sensor pack for a search-and-rescue quadruped: a thermal (LWIR) imager to find people in smoke and rubble, long-range telemetry back to the operator, and a stabilized scan mount. Rugged and weather-sealed (IP67), −10..+50 °C, ≥60 min, ≤700 g.",
    rubric: buildRubric({ powerW: 22, runtimeMin: 60, tempMin: -10, tempMax: 50, massG: 700, env: { l: 150, w: 110, h: 75 }, ramGb: 4, tops: 6, resMp: 0.3, fps: 30, lanes: 1, chains: 1, torqueNm: 0.2, ip: 67, costMax: 1800, leadMax: 40, vendorsMax: 9 }),
    feasibleByDesign: true,
  },
  {
    id: "ex-warehouse-amr",
    slug: "warehouse-amr",
    title: "Warehouse AMR",
    tagline: "Indoor autonomous mobile robot perception + Wi-Fi fleet link",
    requirement:
      "The perception and connectivity core for a warehouse autonomous mobile robot: vision for lane-following and obstacle detection, a Wi-Fi link to the fleet controller, and a long single-shift runtime. 0..40 °C indoors, ≥180 min, ≤700 g, 150×110×75 mm.",
    rubric: buildRubric({ powerW: 22, runtimeMin: 180, tempMin: 0, tempMax: 40, massG: 700, env: { l: 150, w: 110, h: 75 }, ramGb: 4, tops: 6, resMp: 8, fps: 30, lanes: 2, chains: 1, torqueNm: 0.15, ip: 40, costMax: 500, leadMax: 21, vendorsMax: 8 }),
    feasibleByDesign: true,
  },
  {
    id: "ex-underwater-rov",
    slug: "underwater-rov",
    title: "Underwater Inspection ROV",
    tagline: "Sealed hull-inspection camera pod for shallow dives",
    requirement:
      "A sealed inspection pod for a small underwater ROV doing hull and pier surveys: a detailed inspection camera, a tether-side wireless bridge, and a thruster/pan driver. Fully sealed (IP67), −5..+40 °C, ≥60 min, ≤700 g, 150×110×75 mm pressure housing core.",
    rubric: buildRubric({ powerW: 22, runtimeMin: 60, tempMin: -5, tempMax: 40, massG: 700, env: { l: 150, w: 110, h: 75 }, ramGb: 2, tops: 0, resMp: 12, fps: 30, lanes: 2, chains: 1, torqueNm: 0.5, ip: 67, costMax: 500, leadMax: 28, vendorsMax: 8 }),
    feasibleByDesign: true,
  },
  {
    id: "ex-fpv-gimbal",
    slug: "fpv-gimbal",
    title: "Cinematic FPV Drone Gimbal",
    tagline: "Light, fast global-shutter camera on a brushless gimbal",
    requirement:
      "A lightweight cinematic payload for an FPV drone: a global-shutter camera at high frame rate to kill jello and rolling-shutter wobble, a low-latency video link, and a brushless gimbal. Featherweight ≤450 g, 150×110×75 mm, ≥20 min, −5..+45 °C, IP54.",
    rubric: buildRubric({ powerW: 18, runtimeMin: 20, tempMin: -5, tempMax: 45, massG: 450, env: { l: 150, w: 110, h: 75 }, ramGb: 1.5, tops: 0, resMp: 1.5, fps: 50, lanes: 2, chains: 1, torqueNm: 0.15, ip: 54, costMax: 400, leadMax: 21, vendorsMax: 7 }),
    feasibleByDesign: true,
  },
  {
    id: "ex-hale-drone",
    slug: "hale-drone",
    title: "Solar HALE Atmospheric Drone",
    tagline: "Ultra-endurance stratospheric relay — pushes past the KB",
    requirement:
      "A high-altitude long-endurance (HALE) solar relay drone payload meant to loiter for 10+ hours: ultra-low-power compute, a wide-area downlink, and a light imaging sensor — on the smallest possible battery. ≥600 min runtime, −10..+50 °C, ≤700 g.",
    rubric: buildRubric({ powerW: 18, runtimeMin: 600, tempMin: -10, tempMax: 50, massG: 700, env: { l: 150, w: 110, h: 75 }, ramGb: 1.5, tops: 0, resMp: 1.5, fps: 20, lanes: 2, chains: 1, torqueNm: 0.15, ip: 54, costMax: 400, leadMax: 21, vendorsMax: 7 }),
    feasibleByDesign: false, // 600 min exceeds what the seed KB's batteries can deliver
  },
];
