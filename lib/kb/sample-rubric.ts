/**
 * kb/sample-rubric.ts — a golden, realistic outdoor inspection drone payload.
 *
 * DRONE_PAYLOAD_REQUIREMENT is the human-readable brief.
 * DRONE_PAYLOAD_RUBRIC is the machine-checkable Rubric (frozen schema) the
 * verifier consumes. It is deliberately SATISFIABLE by KB_COMPONENTS under all
 * three SWAP-C leanings (Efficiency / Compact / Value) — see the hand-trace note
 * at the bottom of this file.
 *
 * Types come from the frozen contract — never redefined here.
 */

import type { Rubric } from "@/lib/schema";

export const DRONE_PAYLOAD_REQUIREMENT: string =
  "Design a self-contained outdoor inspection drone payload that captures imagery " +
  "of power lines and rooftops and streams a downlink to a ground station. It must " +
  "run on its own battery for at least 30 minutes per sortie, operate outdoors from " +
  "-10 C to +50 C, survive splash and dust (IP54), and stay under ~600 g and a " +
  "150 x 110 x 75 mm envelope so it can be slung under a mid-size multirotor. It " +
  "needs a Linux-class (or capable MCU) compute node, at least one MIPI-CSI camera " +
  "of 1.5 MP+ at 20 fps+, a wireless downlink, a steerable single-axis mount, and " +
  "must be buildable from connectorized, reasonably-priced, in-stock parts on a " +
  "short lead time with few distinct vendors.";

export const DRONE_PAYLOAD_RUBRIC: Rubric = [
  // ---- HARD constraints (the feasibility gate) -----------------------------

  // Total active draw of all consumers must fit a modest payload budget. A
  // low-power compute + camera + radio + mount lands around 9-15 W; 25 W gives
  // honest headroom for the higher-compute leaning without admitting waste.
  {
    id: "h-power-budget",
    dimension: "power_budget",
    kind: "hard",
    label: "Total active power draw <= 25 W",
    required: { max: 25 },
  },

  // The payload runs on a single small pack, so every consumer must be served by
  // a 5 V logic/sensor rail and a 12 V higher-power rail. All three battery
  // packs in the KB expose both rails.
  {
    id: "h-voltage-rails",
    dimension: "voltage_rails",
    kind: "hard",
    label: "Supplies a 5 V and a 12 V regulated rail",
    required: {
      rails: [
        { voltage_v: 5, max_current_a: 3 }, // 5V logic+sensors; smallest pack gives 4A
        { voltage_v: 12, max_current_a: 1.5 }, // 12V for radio/motor; smallest pack gives 2A
      ],
    },
  },

  // A sortie is 30 minutes minimum. Even the lightest 2S 16.3 Wh pack at ~9 W
  // active gives ~108 min, so all leanings clear this comfortably.
  {
    id: "h-endurance",
    dimension: "endurance",
    kind: "hard",
    label: "Battery runtime >= 30 min on active load",
    required: { runtime_min: 30 },
  },

  // Outdoor temperate-climate inspection envelope. Every KB part's temp_range_c
  // spans at least -10..60, so all cover this.
  {
    id: "h-thermal",
    dimension: "thermal",
    kind: "hard",
    label: "All parts operate across -10 C..+50 C",
    required: { env_temp_c: { min: -10, max: 50 } },
  },

  // Mass budget for a payload slung under a mid-size multirotor. ~600 g is the
  // target; 700 g is the hard ceiling so a high-endurance (4S) build remains
  // admissible while the scorecard still rewards lighter designs. A Compact build
  // is ~310 g; an endurance build with the 4S pack lands ~660 g, under the cap.
  {
    id: "h-mass",
    dimension: "mass",
    kind: "hard",
    label: "Total payload mass <= 700 g",
    required: { max: 700 },
  },

  // Physical envelope under the airframe. The largest chassis (150x110x70) fits
  // inside this with margin; component packing is checked against this box.
  {
    id: "h-size",
    dimension: "size",
    kind: "hard",
    label: "Fits a 150 x 110 x 75 mm envelope",
    required: { envelope_mm: { l: 150, w: 110, h: 75 } },
  },

  // Minimum compute: enough RAM to run a Linux capture/stream stack OR a capable
  // MCU pipeline. 0.0002 GB (the Pico, 264 KB) is intentionally below this so the
  // proposer must pick CM4-class or better; no TOPS required (vision can be CPU).
  {
    id: "h-compute",
    dimension: "compute",
    kind: "hard",
    label: "Compute >= 1.5 GB RAM (no NPU mandated)",
    required: { ram_gb: 1.5, tops: 0 },
  },

  // Inspection imaging floor: a global-shutter 1.58 MP @ 60 fps, an 8 MP @ 30 fps,
  // or a 12 MP @ 30 fps all clear this. Requires a 2-lane MIPI-CSI sensor, which
  // every KB camera provides.
  {
    id: "h-sensing",
    dimension: "sensing",
    kind: "hard",
    label: "MIPI-CSI camera >= 1.5 MP @ 20 fps, 2 lanes",
    required: {
      resolution_mp: 1.5,
      fps: 20,
      interface: "MIPI-CSI",
      lanes: 2,
    },
  },

  // Wireless downlink with at least one radio chain on a band the KB radios cover
  // (Wi-Fi 2.4GHz, 915MHz telemetry, or LTE-B3 all qualify via at least one band).
  {
    id: "h-comms",
    dimension: "comms",
    kind: "hard",
    label: "Wireless downlink, >= 1 radio chain",
    required: { chains: 1 },
  },

  // A single steerable mount axis to aim the camera. The micro servo (0.27 Nm)
  // is sufficient for a sub-50 g camera mount; heavier servos exceed this.
  {
    id: "h-actuation",
    dimension: "actuation",
    kind: "hard",
    label: "Steering torque >= 0.15 Nm on one axis",
    required: { torque_nm: 0.15 },
  },

  // Connectorized build: every mate a chosen part needs (JST-GH, U.FL/SMA, FFC)
  // must be provided by some part in the BOM. The three connector kits cover all
  // the mates used by the KB consumers.
  {
    id: "h-connectors",
    dimension: "connectors",
    kind: "hard",
    label: "All required connector mates are provided",
    required: {},
  },

  // Splash/dust protection for outdoor work. IP54 is met by the CF frame and alu
  // tray; the sealed enclosure (IP67) exceeds it.
  {
    id: "h-environment",
    dimension: "environment",
    kind: "hard",
    label: "Ingress protection >= IP54",
    required: { ip_rating: 54 },
  },

  // ---- SOFT constraints (scored, weighted; never gate feasibility) ---------

  // Cost target for a buildable prototype payload. A Value build is well under
  // this; weighted highest among soft goals because budget drives the program.
  {
    id: "s-cost",
    dimension: "cost",
    kind: "soft",
    label: "Total BOM cost <= $400 (lower is better)",
    required: { max: 400 },
    weight: 0.45,
  },

  // Lead-time target so a build can ship in weeks. In-stock KB parts (lead <=14d)
  // satisfy this; the thermal core (35d) would push a build over, so it nudges
  // the ranker toward stocked alternatives.
  {
    id: "s-lead-time",
    dimension: "lead_time",
    kind: "soft",
    label: "Max part lead time <= 21 days (shorter is better)",
    required: { max: 21 },
    weight: 0.3,
  },

  // Supply-chain consolidation: prefer few distinct vendors to simplify
  // procurement. Achievable around 5-7 vendors; weighted lowest of the soft set.
  {
    id: "s-vendor-consolidation",
    dimension: "vendor_consolidation",
    kind: "soft",
    label: "Few distinct vendors (<= 7 preferred)",
    required: { vendors_max: 7 },
    weight: 0.25,
  },
];

/*
 * HAND-TRACED FEASIBLE BOM (Compact lean) — confirms satisfiability:
 *   compute  = RPi CM4 2GB (5W, 12g, 2GB RAM, MIPI-CSI)
 *   sensing  = IMX219 8MP (0.5W, 3g, 8MP@30fps, MIPI-CSI x2)
 *   comms    = RFD900x 915MHz (3W, 14g, 1 chain)
 *   thermal  = Al heatsink (0W, 22g)
 *   actuation= Savox micro servo (0.4W, 16g, 0.27 Nm)
 *   power    = 2S 2200mAh (16.3 Wh, 130g, 5V@4A + 12V@2A, 45W peak)
 *   connectors = JST-GH kit + RF pigtail kit + FFC kit (36g)
 *   chassis  = CF frame (85g, IP54)
 * Checks: active power 8.9W <= 25W; rails 5V+12V present; endurance
 * 16.3/8.9 = 1.83h = 110min >= 30; all temp ranges cover -10..50; mass 318g <=
 * 600; fits 150x110x75; RAM 2GB >= 1.5; sensing 8MP@30fps x2 lanes; 1 chain;
 * 0.27 >= 0.15 Nm; all mates provided; IP54 >= IP54. FEASIBLE.
 * Efficiency lean swaps in Orin Nano + 4S 5200mAh; Value lean keeps cheap
 * in-stock parts (CM4 + IMX219 + AX210 Wi-Fi + 3S pack). All three satisfiable.
 */
