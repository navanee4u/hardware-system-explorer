/**
 * verifier.ts — the deterministic single source of truth.
 *
 * NO LLM. Pure functions over (BOM, Rubric). Each ConstraintDimension maps to one
 * checker. verify() routes each Constraint to its checker by constraint.dimension
 * and returns exactly one Check per constraint.
 *
 * Engineering rules:
 *  - Missing spec data needed for a HARD check => status "fail" naming the missing
 *    field. Never a silent pass.
 *  - All numbers are honest: no invented specs, no fudge factors.
 *  - Voltage rails match within a ±0.25 V tolerance band.
 */

import type {
  BOM,
  Check,
  Component,
  Constraint,
  ConstraintDimension,
  RailSpec,
  Required,
  Rubric,
} from "@/lib/schema";

const VOLTAGE_TOLERANCE_V = 0.25;

/** Consumer subsystems that draw power. */
const CONSUMER_SUBSYSTEMS = ["compute", "sensing", "comms", "actuation"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flatten every component across all subsystems in the BOM. */
function allComponents(bom: BOM): Component[] {
  const out: Component[] = [];
  for (const key of Object.keys(bom.subsystems)) {
    const list = bom.subsystems[key as keyof BOM["subsystems"]];
    if (list) out.push(...list);
  }
  return out;
}

/** Components in the named consumer subsystems. */
function consumers(bom: BOM): Component[] {
  const out: Component[] = [];
  for (const sub of CONSUMER_SUBSYSTEMS) {
    const list = bom.subsystems[sub];
    if (list) out.push(...list);
  }
  return out;
}

/** Power-subsystem components (batteries / PMICs / regulators). */
function supplies(bom: BOM): Component[] {
  return bom.subsystems.power ?? [];
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

interface CheckResult {
  status: "pass" | "fail";
  observed: number | string;
  required: number | string;
  reason: string;
}

function mkCheck(c: Constraint, r: CheckResult): Check {
  return {
    constraint_id: c.id,
    dimension: c.dimension,
    kind: c.kind,
    status: r.status,
    observed: r.observed,
    required: r.required,
    reason: r.reason,
  };
}

// ---------------------------------------------------------------------------
// Checkers — one pure function per ConstraintDimension
// ---------------------------------------------------------------------------

function checkPowerBudget(bom: BOM, req: Required): CheckResult {
  if (req.max == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "power_budget requires required.max (W) but it was not provided in the rubric.",
    };
  }
  const cons = consumers(bom);
  const missing = cons.filter((c) => c.specs.active_w == null);
  if (missing.length > 0) {
    const names = missing.map((c) => c.name).join(", ");
    return {
      status: "fail",
      observed: "missing active_w",
      required: req.max,
      reason: `Missing specs.active_w on consumer component(s): ${names}. Cannot compute power budget.`,
    };
  }
  const total = round(cons.reduce((s, c) => s + (c.specs.active_w ?? 0), 0));
  const pass = total <= req.max;
  return {
    status: pass ? "pass" : "fail",
    observed: total,
    required: req.max,
    reason: pass
      ? `Total active power ${total} W across ${cons.length} consumer(s) is within the ${req.max} W budget.`
      : `Total active power ${total} W exceeds the ${req.max} W budget by ${round(total - req.max)} W.`,
  };
}

function checkPeakPowerRail(bom: BOM, req: Required): CheckResult {
  const cons = consumers(bom);
  const sup = supplies(bom);
  // Peak draw of each consumer: peak_w where present, else active_w.
  const missing = cons.filter((c) => c.specs.peak_w == null && c.specs.active_w == null);
  if (missing.length > 0) {
    const names = missing.map((c) => c.name).join(", ");
    return {
      status: "fail",
      observed: "missing peak_w/active_w",
      required: "n/a",
      reason: `Missing specs.peak_w and specs.active_w on consumer(s): ${names}. Cannot compute peak draw.`,
    };
  }
  const totalPeak = round(cons.reduce((s, c) => s + (c.specs.peak_w ?? c.specs.active_w ?? 0), 0));

  // Determine the rail capacity ceiling.
  // Prefer required.rails (P = I*V summed), else supply peak_supply_w, else required.max.
  let capacity: number | null = null;
  let capacitySource = "";

  const rails: RailSpec[] | undefined =
    req.rails && req.rails.length > 0
      ? req.rails
      : sup.flatMap((s) => s.specs.rails_out ?? []);

  if (rails && rails.length > 0) {
    capacity = round(rails.reduce((s, r) => s + r.max_current_a * r.voltage_v, 0));
    capacitySource = `rail capacity (sum of I*V across ${rails.length} rail(s))`;
  } else {
    const peakSupply = sup
      .map((s) => s.specs.peak_supply_w)
      .filter((v): v is number => v != null);
    if (peakSupply.length > 0) {
      capacity = round(peakSupply.reduce((s, v) => s + v, 0));
      capacitySource = "supply peak_supply_w";
    } else if (req.max != null) {
      capacity = req.max;
      capacitySource = "required.max";
    }
  }

  if (capacity == null) {
    return {
      status: "fail",
      observed: totalPeak,
      required: "n/a",
      reason:
        "peak_power_rail needs a capacity source: required.rails, a supply's specs.rails_out, specs.peak_supply_w, or required.max. None present.",
    };
  }

  const pass = totalPeak <= capacity;
  return {
    status: pass ? "pass" : "fail",
    observed: totalPeak,
    required: capacity,
    reason: pass
      ? `Peak draw ${totalPeak} W is within ${capacity} W (${capacitySource}).`
      : `Peak draw ${totalPeak} W exceeds ${capacity} W (${capacitySource}) by ${round(totalPeak - capacity)} W.`,
  };
}

function checkVoltageRails(bom: BOM, req: Required): CheckResult {
  if (!req.rails || req.rails.length === 0) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "voltage_rails requires required.rails but none were provided in the rubric.",
    };
  }
  const provided: RailSpec[] = supplies(bom).flatMap((s) => s.specs.rails_out ?? []);
  if (provided.length === 0) {
    return {
      status: "fail",
      observed: "no rails_out",
      required: req.rails.map((r) => `${r.voltage_v}V@${r.max_current_a}A`).join(", "),
      reason:
        "No power supply provides specs.rails_out. Cannot satisfy required voltage rails.",
    };
  }
  const unmet: string[] = [];
  for (const need of req.rails) {
    const ok = provided.some(
      (p) =>
        Math.abs(p.voltage_v - need.voltage_v) <= VOLTAGE_TOLERANCE_V &&
        p.max_current_a >= need.max_current_a,
    );
    if (!ok) unmet.push(`${need.voltage_v}V@${need.max_current_a}A`);
  }
  const reqStr = req.rails.map((r) => `${r.voltage_v}V@${r.max_current_a}A`).join(", ");
  const pass = unmet.length === 0;
  return {
    status: pass ? "pass" : "fail",
    observed: provided.map((p) => `${p.voltage_v}V@${p.max_current_a}A`).join(", "),
    required: reqStr,
    reason: pass
      ? `All ${req.rails.length} required rail(s) provided within ±${VOLTAGE_TOLERANCE_V}V and adequate current.`
      : `Unmet rail(s): ${unmet.join(", ")} (no supply offers matching voltage within ±${VOLTAGE_TOLERANCE_V}V with enough current).`,
  };
}

function checkEndurance(bom: BOM, req: Required): CheckResult {
  if (req.runtime_min == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "endurance requires required.runtime_min but it was not provided in the rubric.",
    };
  }
  const batteries = supplies(bom).filter((s) => s.specs.capacity_wh != null);
  if (batteries.length === 0) {
    return {
      status: "fail",
      observed: "no capacity_wh",
      required: req.runtime_min,
      reason:
        "No power-subsystem component declares specs.capacity_wh. Cannot compute endurance.",
    };
  }
  const capacityWh = round(batteries.reduce((s, b) => s + (b.specs.capacity_wh ?? 0), 0));
  const cons = consumers(bom);
  const missing = cons.filter((c) => c.specs.active_w == null);
  if (missing.length > 0) {
    const names = missing.map((c) => c.name).join(", ");
    return {
      status: "fail",
      observed: "missing active_w",
      required: req.runtime_min,
      reason: `Missing specs.active_w on consumer(s): ${names}. Cannot compute average draw for endurance.`,
    };
  }
  const avgW = round(cons.reduce((s, c) => s + (c.specs.active_w ?? 0), 0));
  if (avgW <= 0) {
    return {
      status: "fail",
      observed: 0,
      required: req.runtime_min,
      reason: "Average power draw is 0 W — no consumers to size endurance against.",
    };
  }
  const minutes = round((capacityWh / avgW) * 60, 1);
  const pass = minutes >= req.runtime_min;
  return {
    status: pass ? "pass" : "fail",
    observed: minutes,
    required: req.runtime_min,
    reason: pass
      ? `${capacityWh} Wh at ${avgW} W average yields ${minutes} min, meeting the ${req.runtime_min} min requirement.`
      : `${capacityWh} Wh at ${avgW} W average yields only ${minutes} min, short of the ${req.runtime_min} min requirement.`,
  };
}

function checkThermal(bom: BOM, req: Required): CheckResult {
  if (!req.env_temp_c) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "thermal requires required.env_temp_c but it was not provided in the rubric.",
    };
  }
  const env = req.env_temp_c;
  const parts = allComponents(bom);
  const noRange = parts.filter((p) => p.specs.temp_range_c == null);
  if (noRange.length > 0) {
    const names = noRange.map((p) => p.name).join(", ");
    return {
      status: "fail",
      observed: "missing temp_range_c",
      required: `${env.min}..${env.max}C`,
      reason: `Missing specs.temp_range_c on: ${names}. Cannot verify thermal coverage.`,
    };
  }
  const failing = parts.filter((p) => {
    const t = p.specs.temp_range_c!;
    return !(t.min <= env.min && t.max >= env.max);
  });
  const pass = failing.length === 0;
  return {
    status: pass ? "pass" : "fail",
    observed: pass
      ? "all parts cover env"
      : failing
          .map((p) => `${p.name}[${p.specs.temp_range_c!.min}..${p.specs.temp_range_c!.max}C]`)
          .join(", "),
    required: `${env.min}..${env.max}C`,
    reason: pass
      ? `All ${parts.length} component(s) operate across ${env.min}..${env.max}C.`
      : `Component(s) not rated for ${env.min}..${env.max}C: ${failing
          .map((p) => `${p.name}(${p.specs.temp_range_c!.min}..${p.specs.temp_range_c!.max}C)`)
          .join(", ")}.`,
  };
}

function checkMass(bom: BOM, req: Required): CheckResult {
  if (req.max == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "mass requires required.max (g) but it was not provided in the rubric.",
    };
  }
  const parts = allComponents(bom);
  const missing = parts.filter((p) => p.specs.mass_g == null);
  if (missing.length > 0) {
    const names = missing.map((p) => p.name).join(", ");
    return {
      status: "fail",
      observed: "missing mass_g",
      required: req.max,
      reason: `Missing specs.mass_g on: ${names}. Cannot compute total mass.`,
    };
  }
  const total = round(parts.reduce((s, p) => s + (p.specs.mass_g ?? 0), 0));
  const pass = total <= req.max;
  return {
    status: pass ? "pass" : "fail",
    observed: total,
    required: req.max,
    reason: pass
      ? `Total mass ${total} g across ${parts.length} part(s) is within the ${req.max} g budget.`
      : `Total mass ${total} g exceeds the ${req.max} g budget by ${round(total - req.max)} g.`,
  };
}

function checkSize(bom: BOM, req: Required): CheckResult {
  if (!req.envelope_mm) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "size requires required.envelope_mm but it was not provided in the rubric.",
    };
  }
  const env = req.envelope_mm;
  const parts = allComponents(bom);
  const missing = parts.filter((p) => p.specs.dims_mm == null);
  if (missing.length > 0) {
    const names = missing.map((p) => p.name).join(", ");
    return {
      status: "fail",
      observed: "missing dims_mm",
      required: `${env.l}x${env.w}x${env.h}mm`,
      reason: `Missing specs.dims_mm on: ${names}. Cannot perform stack/pack check.`,
    };
  }
  // The chassis IS the envelope's container — it must itself fit the envelope on
  // every axis. Internal components must (a) each fit the envelope footprint and
  // (b) collectively fit by packed volume (conservative: no nesting credit). This
  // replaces a naive "sum every height into one tower" model, which would treat
  // a side-by-side payload as if stacked vertically.
  const envVol = env.l * env.w * env.h;
  const chassis = parts.filter((p) => p.subsystem === "chassis");
  const internal = parts.filter((p) => p.subsystem !== "chassis");

  const chassisOversize = chassis.filter((p) => {
    const d = p.specs.dims_mm!;
    return d.l > env.l || d.w > env.w || d.h > env.h;
  });
  const tooWide = internal.filter((p) => {
    const d = p.specs.dims_mm!;
    return d.l > env.l || d.w > env.w;
  });
  const internalVol = round(
    internal.reduce((s, p) => {
      const d = p.specs.dims_mm!;
      return s + d.l * d.w * d.h;
    }, 0),
  );

  const volFits = internalVol <= envVol;
  const footprintFits = tooWide.length === 0;
  const chassisFits = chassisOversize.length === 0;
  const pass = volFits && footprintFits && chassisFits;
  const observed = `internal packed volume ${internalVol}mm^3 of ${round(envVol)}mm^3 envelope`;
  let reason: string;
  if (pass) {
    reason = `Chassis fits the ${env.l}x${env.w}x${env.h}mm envelope; internal parts fit by footprint and pack into ${internalVol}mm^3 of the ${round(envVol)}mm^3 envelope.`;
  } else {
    const probs: string[] = [];
    if (!chassisFits) {
      probs.push(
        `chassis exceeds envelope: ${chassisOversize
          .map((p) => `${p.name}(${p.specs.dims_mm!.l}x${p.specs.dims_mm!.w}x${p.specs.dims_mm!.h}mm)`)
          .join(", ")}`,
      );
    }
    if (!footprintFits) {
      probs.push(
        `oversized footprint: ${tooWide
          .map((p) => `${p.name}(${p.specs.dims_mm!.l}x${p.specs.dims_mm!.w}mm)`)
          .join(", ")}`,
      );
    }
    if (!volFits) {
      probs.push(`internal packed volume ${internalVol}mm^3 exceeds envelope ${round(envVol)}mm^3`);
    }
    reason = `Size fails: ${probs.join("; ")}.`;
  }
  return {
    status: pass ? "pass" : "fail",
    observed,
    required: `${env.l}x${env.w}x${env.h}mm`,
    reason,
  };
}

function checkCompute(bom: BOM, req: Required): CheckResult {
  if (req.tops == null || req.ram_gb == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason:
        "compute requires required.tops and required.ram_gb; one or both were not provided in the rubric.",
    };
  }
  const computeParts = bom.subsystems.compute ?? [];
  if (computeParts.length === 0) {
    return {
      status: "fail",
      observed: "no compute component",
      required: `${req.tops} TOPS, ${req.ram_gb} GB`,
      reason: "No compute-subsystem component present to satisfy the compute requirement.",
    };
  }
  const match = computeParts.find(
    (c) =>
      c.specs.tops != null &&
      c.specs.ram_gb != null &&
      c.specs.tops >= req.tops! &&
      c.specs.ram_gb >= req.ram_gb!,
  );
  const best = computeParts.reduce((b, c) => ((c.specs.tops ?? 0) > (b.specs.tops ?? 0) ? c : b));
  const pass = match != null;
  return {
    status: pass ? "pass" : "fail",
    observed: pass
      ? `${match!.name}: ${match!.specs.tops} TOPS, ${match!.specs.ram_gb} GB`
      : `best: ${best.name} ${best.specs.tops ?? "?"} TOPS, ${best.specs.ram_gb ?? "?"} GB`,
    required: `${req.tops} TOPS, ${req.ram_gb} GB`,
    reason: pass
      ? `${match!.name} provides ${match!.specs.tops} TOPS and ${match!.specs.ram_gb} GB RAM, meeting ${req.tops} TOPS / ${req.ram_gb} GB.`
      : `No compute component meets both ${req.tops} TOPS and ${req.ram_gb} GB RAM (best: ${best.name} with ${best.specs.tops ?? "missing"} TOPS / ${best.specs.ram_gb ?? "missing"} GB).`,
  };
}

function checkSensing(bom: BOM, req: Required): CheckResult {
  if (req.resolution_mp == null || req.fps == null || req.interface == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason:
        "sensing requires required.resolution_mp, required.fps and required.interface; one or more were not provided.",
    };
  }
  const parts = bom.subsystems.sensing ?? [];
  if (parts.length === 0) {
    return {
      status: "fail",
      observed: "no sensing component",
      required: `${req.resolution_mp}MP @${req.fps}fps via ${req.interface}${req.lanes != null ? ` x${req.lanes} lanes` : ""}`,
      reason: "No sensing-subsystem component present to satisfy the sensing requirement.",
    };
  }
  const match = parts.find(
    (c) =>
      c.specs.resolution_mp != null &&
      c.specs.fps != null &&
      c.specs.resolution_mp >= req.resolution_mp! &&
      c.specs.fps >= req.fps! &&
      c.specs.sensor_interface === req.interface &&
      (req.lanes == null || (c.specs.lanes != null && c.specs.lanes >= req.lanes)),
  );
  const reqStr = `${req.resolution_mp}MP @${req.fps}fps via ${req.interface}${req.lanes != null ? ` x${req.lanes} lanes` : ""}`;
  const pass = match != null;
  return {
    status: pass ? "pass" : "fail",
    observed: pass
      ? `${match!.name}: ${match!.specs.resolution_mp}MP @${match!.specs.fps}fps via ${match!.specs.sensor_interface}${match!.specs.lanes != null ? ` x${match!.specs.lanes} lanes` : ""}`
      : parts
          .map(
            (c) =>
              `${c.name}(${c.specs.resolution_mp ?? "?"}MP/${c.specs.fps ?? "?"}fps/${c.specs.sensor_interface ?? "?"})`,
          )
          .join(", "),
    required: reqStr,
    reason: pass
      ? `${match!.name} meets ${reqStr}.`
      : `No sensing component satisfies ${reqStr} (resolution, fps, interface, and lane requirements all must hold).`,
  };
}

function checkComms(bom: BOM, req: Required): CheckResult {
  // A downlink requirement is band-agnostic by default: bands are OPTIONAL. When
  // the rubric names specific bands they must be covered; otherwise only the
  // chain count (and antenna connector, if named) gate the check.
  const reqBands = req.bands ?? [];
  const parts = bom.subsystems.comms ?? [];
  if (parts.length === 0) {
    return {
      status: "fail",
      observed: "no comms component",
      required: reqBands.length > 0 ? reqBands.join(", ") : `chains>=${req.chains ?? 1}`,
      reason: "No comms-subsystem component present to satisfy the comms requirement.",
    };
  }
  const reqStr =
    `${reqBands.length > 0 ? `bands [${reqBands.join(", ")}]` : "any band"}` +
    `${req.antenna_connector ? `, antenna ${req.antenna_connector}` : ""}` +
    `${req.chains != null ? `, chains>=${req.chains}` : ""}`;
  const match = parts.find((c) => {
    const bands = c.specs.bands ?? [];
    const coversBands = reqBands.length === 0 || reqBands.every((b) => bands.includes(b));
    const antennaOk =
      req.antenna_connector == null || c.specs.antenna_connector === req.antenna_connector;
    const chainsOk = req.chains == null || (c.specs.chains != null && c.specs.chains >= req.chains);
    return coversBands && antennaOk && chainsOk;
  });
  const pass = match != null;
  return {
    status: pass ? "pass" : "fail",
    observed: pass
      ? `${match!.name}: bands [${(match!.specs.bands ?? []).join(", ")}], antenna ${match!.specs.antenna_connector ?? "?"}, chains ${match!.specs.chains ?? "?"}`
      : parts.map((c) => `${c.name}[${(c.specs.bands ?? []).join("/") || "no bands"}]`).join(", "),
    required: reqStr,
    reason: pass
      ? `${match!.name} covers ${reqStr}.`
      : `No comms component covers ${reqStr} (all bands, antenna connector, and chain count must hold).`,
  };
}

function checkActuation(bom: BOM, req: Required): CheckResult {
  if (req.torque_nm == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "actuation requires required.torque_nm but it was not provided in the rubric.",
    };
  }
  const parts = bom.subsystems.actuation ?? [];
  if (parts.length === 0) {
    return {
      status: "fail",
      observed: "no actuation component",
      required: `${req.torque_nm} Nm`,
      reason: "No actuation-subsystem component present to satisfy the actuation requirement.",
    };
  }
  const match = parts.find(
    (c) =>
      c.specs.torque_nm != null &&
      c.specs.torque_nm >= req.torque_nm! &&
      c.specs.driver_current_a != null &&
      c.specs.stall_current_a != null &&
      c.specs.driver_current_a >= c.specs.stall_current_a,
  );
  const pass = match != null;
  // Build an honest failure description.
  let observed: string;
  let reason: string;
  if (pass) {
    observed = `${match!.name}: ${match!.specs.torque_nm} Nm, driver ${match!.specs.driver_current_a}A >= stall ${match!.specs.stall_current_a}A`;
    reason = `${match!.name} delivers ${match!.specs.torque_nm} Nm (>= ${req.torque_nm} Nm) and its driver (${match!.specs.driver_current_a}A) survives stall (${match!.specs.stall_current_a}A).`;
  } else {
    observed = parts
      .map(
        (c) =>
          `${c.name}(${c.specs.torque_nm ?? "?"}Nm, drv ${c.specs.driver_current_a ?? "?"}A/stall ${c.specs.stall_current_a ?? "?"}A)`,
      )
      .join(", ");
    reason = `No actuation component meets >=${req.torque_nm} Nm with a driver rated at or above its stall current. Check torque_nm, driver_current_a and stall_current_a.`;
  }
  return {
    status: pass ? "pass" : "fail",
    observed,
    required: `${req.torque_nm} Nm, driver>=stall`,
    reason,
  };
}

function checkConnectors(bom: BOM): CheckResult {
  const parts = allComponents(bom);
  const provided = new Set<string>();
  for (const p of parts) for (const c of p.specs.connectors_provided ?? []) provided.add(c);

  const requiredPairs: { part: string; conn: string }[] = [];
  for (const p of parts) {
    for (const c of p.specs.connectors_required ?? []) requiredPairs.push({ part: p.name, conn: c });
  }
  if (requiredPairs.length === 0) {
    return {
      status: "pass",
      observed: "no connectors required",
      required: "all mates present",
      reason: "No component declares specs.connectors_required; nothing to mate.",
    };
  }
  const unmet = requiredPairs.filter((r) => !provided.has(r.conn));
  const pass = unmet.length === 0;
  return {
    status: pass ? "pass" : "fail",
    observed: pass ? `${provided.size} connector type(s) provided` : `missing: ${unmet.map((u) => `${u.conn}(for ${u.part})`).join(", ")}`,
    required: [...new Set(requiredPairs.map((r) => r.conn))].join(", "),
    reason: pass
      ? `All ${requiredPairs.length} required connector mate(s) are provided somewhere in the BOM.`
      : `Unmated connector(s): ${unmet.map((u) => `${u.conn} required by ${u.part}`).join(", ")}. No component provides them.`,
  };
}

function checkEnvironment(bom: BOM, req: Required): CheckResult {
  if (req.ip_rating == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "environment requires required.ip_rating but it was not provided in the rubric.",
    };
  }
  const parts = allComponents(bom);
  const rated = parts.filter((p) => p.specs.ip_rating != null);
  if (rated.length === 0) {
    return {
      status: "fail",
      observed: "no ip_rating",
      required: `IP${req.ip_rating}`,
      reason: "No exposed component declares specs.ip_rating. Cannot verify environment sealing.",
    };
  }
  const minRating = Math.min(...rated.map((p) => p.specs.ip_rating!));
  const weakest = rated.reduce((w, p) => (p.specs.ip_rating! < w.specs.ip_rating! ? p : w));
  const pass = minRating >= req.ip_rating;
  return {
    status: pass ? "pass" : "fail",
    observed: `IP${minRating}`,
    required: `IP${req.ip_rating}`,
    reason: pass
      ? `Weakest rated component is IP${minRating}, meeting the IP${req.ip_rating} requirement.`
      : `Weakest rated component ${weakest.name} is only IP${minRating}, below the required IP${req.ip_rating}.`,
  };
}

function checkCost(bom: BOM, req: Required): CheckResult {
  if (req.max == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "cost requires required.max (USD) but it was not provided in the rubric.",
    };
  }
  const parts = allComponents(bom);
  const missing = parts.filter((p) => p.specs.cost_usd == null);
  if (missing.length > 0) {
    const names = missing.map((p) => p.name).join(", ");
    return {
      status: "fail",
      observed: "missing cost_usd",
      required: req.max,
      reason: `Missing specs.cost_usd on: ${names}. Cannot compute total cost.`,
    };
  }
  const total = round(parts.reduce((s, p) => s + (p.specs.cost_usd ?? 0), 0));
  const pass = total <= req.max;
  return {
    status: pass ? "pass" : "fail",
    observed: total,
    required: req.max,
    reason: pass
      ? `Total BOM cost $${total} is within the $${req.max} budget.`
      : `Total BOM cost $${total} exceeds the $${req.max} budget by $${round(total - req.max)}.`,
  };
}

function checkLeadTime(bom: BOM, req: Required): CheckResult {
  if (req.max == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason: "lead_time requires required.max (days) but it was not provided in the rubric.",
    };
  }
  const parts = allComponents(bom);
  const missing = parts.filter((p) => p.specs.lead_time_days == null);
  if (missing.length > 0) {
    const names = missing.map((p) => p.name).join(", ");
    return {
      status: "fail",
      observed: "missing lead_time_days",
      required: req.max,
      reason: `Missing specs.lead_time_days on: ${names}. Cannot compute the critical lead time.`,
    };
  }
  const maxLead = Math.max(...parts.map((p) => p.specs.lead_time_days!));
  const driver = parts.reduce((d, p) =>
    p.specs.lead_time_days! > d.specs.lead_time_days! ? p : d,
  );
  const pass = maxLead <= req.max;
  return {
    status: pass ? "pass" : "fail",
    observed: maxLead,
    required: req.max,
    reason: pass
      ? `Longest lead time ${maxLead} days (${driver.name}) is within the ${req.max} day budget.`
      : `Longest lead time ${maxLead} days (${driver.name}) exceeds the ${req.max} day budget.`,
  };
}

function checkVendorConsolidation(bom: BOM, req: Required): CheckResult {
  if (req.vendors_max == null) {
    return {
      status: "fail",
      observed: "n/a",
      required: "n/a",
      reason:
        "vendor_consolidation requires required.vendors_max but it was not provided in the rubric.",
    };
  }
  const parts = allComponents(bom);
  const vendors = new Set(parts.map((p) => p.vendor).filter((v) => v && v.length > 0));
  const count = vendors.size;
  const pass = count <= req.vendors_max;
  return {
    status: pass ? "pass" : "fail",
    observed: count,
    required: req.vendors_max,
    reason: pass
      ? `BOM uses ${count} distinct vendor(s) (${[...vendors].join(", ")}), within the limit of ${req.vendors_max}.`
      : `BOM uses ${count} distinct vendors (${[...vendors].join(", ")}), exceeding the limit of ${req.vendors_max}.`,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function evaluate(c: Constraint, bom: BOM): CheckResult {
  const req = c.required;
  switch (c.dimension) {
    case "power_budget":
      return checkPowerBudget(bom, req);
    case "peak_power_rail":
      return checkPeakPowerRail(bom, req);
    case "voltage_rails":
      return checkVoltageRails(bom, req);
    case "endurance":
      return checkEndurance(bom, req);
    case "thermal":
      return checkThermal(bom, req);
    case "mass":
      return checkMass(bom, req);
    case "size":
      return checkSize(bom, req);
    case "compute":
      return checkCompute(bom, req);
    case "sensing":
      return checkSensing(bom, req);
    case "comms":
      return checkComms(bom, req);
    case "actuation":
      return checkActuation(bom, req);
    case "connectors":
      return checkConnectors(bom);
    case "environment":
      return checkEnvironment(bom, req);
    case "cost":
      return checkCost(bom, req);
    case "lead_time":
      return checkLeadTime(bom, req);
    case "vendor_consolidation":
      return checkVendorConsolidation(bom, req);
    default: {
      // Exhaustiveness guard: a new ConstraintDimension must add a checker.
      const _exhaustive: never = c.dimension;
      return {
        status: "fail",
        observed: "unknown dimension",
        required: "n/a",
        reason: `No checker registered for constraint dimension "${_exhaustive}".`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify a BOM against a Rubric. Returns exactly one Check per constraint, in the
 * same order as the rubric. Pure and deterministic — no LLM, no I/O.
 */
export function verify(bom: BOM, rubric: Rubric): Check[] {
  return rubric.map((c) => mkCheck(c, evaluate(c, bom)));
}

/**
 * Fraction of HARD-kind checks with status "pass", in 0..1.
 * Returns 1 when there are no hard checks (nothing to gate on).
 */
export function hardCoverage(checks: Check[]): number {
  const hard = checks.filter((c) => c.kind === "hard");
  if (hard.length === 0) return 1;
  const passed = hard.filter((c) => c.status === "pass").length;
  return passed / hard.length;
}

/** The first HARD check that failed (rubric order), or undefined if none. */
export function firstHardFailure(checks: Check[]): Check | undefined {
  return checks.find((c) => c.kind === "hard" && c.status === "fail");
}
