import { describe, expect, it } from "vitest";
import type {
  BOM,
  Component,
  ComponentSpecs,
  Constraint,
  ConstraintDimension,
  ConstraintKind,
  Required,
  Subsystem,
} from "@/lib/schema";
import { firstHardFailure, hardCoverage, verify } from "@/lib/verifier";

// ---------------------------------------------------------------------------
// Tiny builders
// ---------------------------------------------------------------------------

let idc = 0;
function comp(subsystem: Subsystem, specs: ComponentSpecs, over: Partial<Component> = {}): Component {
  idc++;
  return {
    id: `c${idc}`,
    subsystem,
    name: over.name ?? `${subsystem}-${idc}`,
    vendor: over.vendor ?? "VendorA",
    part_number: over.part_number ?? `PN-${idc}`,
    source: over.source ?? "kb",
    specs,
    ...over,
  };
}

function bomOf(...components: Component[]): BOM {
  const subsystems: BOM["subsystems"] = {};
  for (const c of components) {
    (subsystems[c.subsystem] ??= []).push(c);
  }
  return { subsystems };
}

let cc = 0;
function constraint(
  dimension: ConstraintDimension,
  required: Required,
  kind: ConstraintKind = "hard",
): Constraint {
  cc++;
  return { id: `k${cc}`, dimension, kind, label: `${dimension} check`, required };
}

/** Verify one constraint and return the single check. */
function one(bom: BOM, c: Constraint) {
  const checks = verify(bom, [c]);
  expect(checks).toHaveLength(1);
  return checks[0];
}

function expectPass(bom: BOM, c: Constraint) {
  const check = one(bom, c);
  expect(check.status, check.reason).toBe("pass");
  expect(check.reason.length).toBeGreaterThan(0);
  expect(check.constraint_id).toBe(c.id);
  expect(check.dimension).toBe(c.dimension);
  expect(check.kind).toBe(c.kind);
  return check;
}

function expectFail(bom: BOM, c: Constraint) {
  const check = one(bom, c);
  expect(check.status, check.reason).toBe("fail");
  expect(check.reason.length).toBeGreaterThan(0);
  return check;
}

// ---------------------------------------------------------------------------
// power_budget
// ---------------------------------------------------------------------------

describe("power_budget", () => {
  it("passes when total active draw is within budget", () => {
    const bom = bomOf(comp("compute", { active_w: 5 }), comp("sensing", { active_w: 2 }));
    expectPass(bom, constraint("power_budget", { max: 10 }));
  });
  it("fails when total active draw exceeds budget", () => {
    const bom = bomOf(comp("compute", { active_w: 8 }), comp("comms", { active_w: 5 }));
    expectFail(bom, constraint("power_budget", { max: 10 }));
  });
  it("fails when a consumer is missing active_w", () => {
    const bom = bomOf(comp("compute", {}, { name: "SoM" }));
    const check = expectFail(bom, constraint("power_budget", { max: 10 }));
    expect(check.reason).toContain("active_w");
  });
});

// ---------------------------------------------------------------------------
// peak_power_rail
// ---------------------------------------------------------------------------

describe("peak_power_rail", () => {
  it("passes when peak draw is within summed rail capacity (P=I*V)", () => {
    // 5V @ 3A = 15W rail capacity.
    const supply = comp("power", { rails_out: [{ voltage_v: 5, max_current_a: 3 }] });
    const bom = bomOf(supply, comp("compute", { active_w: 5, peak_w: 10 }));
    expectPass(bom, constraint("peak_power_rail", {}));
  });
  it("fails when peak draw exceeds rail capacity", () => {
    const supply = comp("power", { rails_out: [{ voltage_v: 5, max_current_a: 2 }] }); // 10W
    const bom = bomOf(supply, comp("compute", { active_w: 5, peak_w: 14 }));
    expectFail(bom, constraint("peak_power_rail", {}));
  });
  it("fails when no capacity source is present", () => {
    const bom = bomOf(comp("compute", { active_w: 5, peak_w: 14 }));
    const check = expectFail(bom, constraint("peak_power_rail", {}));
    expect(check.reason).toContain("capacity");
  });
});

// ---------------------------------------------------------------------------
// voltage_rails
// ---------------------------------------------------------------------------

describe("voltage_rails", () => {
  it("passes when every required rail is provided within tolerance and current", () => {
    const supply = comp("power", {
      rails_out: [
        { voltage_v: 5.0, max_current_a: 3 },
        { voltage_v: 3.3, max_current_a: 2 },
      ],
    });
    const bom = bomOf(supply);
    const req: Required = {
      rails: [
        { voltage_v: 5.1, max_current_a: 2 }, // within 0.25V
        { voltage_v: 3.3, max_current_a: 1 },
      ],
    };
    expectPass(bom, constraint("voltage_rails", req));
  });
  it("fails when a required rail current is unmet", () => {
    const supply = comp("power", { rails_out: [{ voltage_v: 5, max_current_a: 1 }] });
    const bom = bomOf(supply);
    expectFail(bom, constraint("voltage_rails", { rails: [{ voltage_v: 5, max_current_a: 3 }] }));
  });
  it("fails when no supply provides rails_out", () => {
    const bom = bomOf(comp("power", { capacity_wh: 50 }));
    const check = expectFail(
      bom,
      constraint("voltage_rails", { rails: [{ voltage_v: 5, max_current_a: 1 }] }),
    );
    expect(check.reason).toContain("rails_out");
  });
});

// ---------------------------------------------------------------------------
// endurance
// ---------------------------------------------------------------------------

describe("endurance", () => {
  it("passes when capacity_wh/avg_w*60 meets runtime", () => {
    // 100Wh / 10W * 60 = 600 min
    const bom = bomOf(comp("power", { capacity_wh: 100 }), comp("compute", { active_w: 10 }));
    expectPass(bom, constraint("endurance", { runtime_min: 120 }));
  });
  it("fails when runtime falls short", () => {
    // 10Wh / 10W * 60 = 60 min
    const bom = bomOf(comp("power", { capacity_wh: 10 }), comp("compute", { active_w: 10 }));
    expectFail(bom, constraint("endurance", { runtime_min: 120 }));
  });
  it("fails when no battery declares capacity_wh", () => {
    const bom = bomOf(comp("power", {}), comp("compute", { active_w: 10 }));
    const check = expectFail(bom, constraint("endurance", { runtime_min: 60 }));
    expect(check.reason).toContain("capacity_wh");
  });
});

// ---------------------------------------------------------------------------
// thermal
// ---------------------------------------------------------------------------

describe("thermal", () => {
  it("passes when every part covers the environment range", () => {
    const bom = bomOf(
      comp("compute", { temp_range_c: { min: -40, max: 85 } }),
      comp("sensing", { temp_range_c: { min: -20, max: 70 } }),
    );
    expectPass(bom, constraint("thermal", { env_temp_c: { min: -10, max: 60 } }));
  });
  it("fails when a part cannot cover the environment range", () => {
    const bom = bomOf(comp("compute", { temp_range_c: { min: 0, max: 50 } }, { name: "HotSoM" }));
    const check = expectFail(bom, constraint("thermal", { env_temp_c: { min: -10, max: 60 } }));
    expect(check.reason).toContain("HotSoM");
  });
  it("fails when a part is missing temp_range_c", () => {
    const bom = bomOf(comp("compute", {}, { name: "NoTemp" }));
    const check = expectFail(bom, constraint("thermal", { env_temp_c: { min: 0, max: 40 } }));
    expect(check.reason).toContain("temp_range_c");
  });
});

// ---------------------------------------------------------------------------
// mass
// ---------------------------------------------------------------------------

describe("mass", () => {
  it("passes when total mass is within budget", () => {
    const bom = bomOf(comp("compute", { mass_g: 50 }), comp("chassis", { mass_g: 100 }));
    expectPass(bom, constraint("mass", { max: 200 }));
  });
  it("fails when total mass exceeds budget", () => {
    const bom = bomOf(comp("compute", { mass_g: 150 }), comp("chassis", { mass_g: 100 }));
    expectFail(bom, constraint("mass", { max: 200 }));
  });
  it("fails when a part is missing mass_g", () => {
    const bom = bomOf(comp("chassis", {}, { name: "Frame" }));
    const check = expectFail(bom, constraint("mass", { max: 200 }));
    expect(check.reason).toContain("mass_g");
  });
});

// ---------------------------------------------------------------------------
// size
// ---------------------------------------------------------------------------

describe("size", () => {
  it("passes when footprints fit and stacked height fits envelope", () => {
    const bom = bomOf(
      comp("compute", { dims_mm: { l: 40, w: 40, h: 10 } }),
      comp("sensing", { dims_mm: { l: 20, w: 20, h: 5 } }),
    );
    expectPass(bom, constraint("size", { envelope_mm: { l: 50, w: 50, h: 20 } }));
  });
  it("fails when internal packed volume exceeds the envelope", () => {
    // Two boards that each fit the footprint but together overflow the envelope
    // volume (28,800mm^3 x2 = 57,600 > 50,000mm^3 envelope).
    const bom = bomOf(
      comp("compute", { dims_mm: { l: 40, w: 40, h: 18 } }),
      comp("sensing", { dims_mm: { l: 40, w: 40, h: 18 } }),
    );
    const check = expectFail(bom, constraint("size", { envelope_mm: { l: 50, w: 50, h: 20 } }));
    expect(check.reason).toContain("volume");
  });
  it("fails when the chassis itself exceeds the envelope", () => {
    const bom = bomOf(comp("chassis", { dims_mm: { l: 60, w: 50, h: 20 } }, { name: "BigCase" }));
    const check = expectFail(bom, constraint("size", { envelope_mm: { l: 50, w: 50, h: 20 } }));
    expect(check.reason).toContain("BigCase");
  });
  it("fails when a board footprint is too large", () => {
    const bom = bomOf(comp("compute", { dims_mm: { l: 60, w: 40, h: 5 } }, { name: "BigBoard" }));
    const check = expectFail(bom, constraint("size", { envelope_mm: { l: 50, w: 50, h: 20 } }));
    expect(check.reason).toContain("BigBoard");
  });
  it("fails when a part is missing dims_mm", () => {
    const bom = bomOf(comp("compute", {}, { name: "NoDims" }));
    const check = expectFail(bom, constraint("size", { envelope_mm: { l: 50, w: 50, h: 20 } }));
    expect(check.reason).toContain("dims_mm");
  });
});

// ---------------------------------------------------------------------------
// compute
// ---------------------------------------------------------------------------

describe("compute", () => {
  it("passes when a compute part meets TOPS and RAM", () => {
    const bom = bomOf(comp("compute", { tops: 100, ram_gb: 16 }));
    expectPass(bom, constraint("compute", { tops: 50, ram_gb: 8 }));
  });
  it("fails when RAM is insufficient", () => {
    const bom = bomOf(comp("compute", { tops: 100, ram_gb: 4 }));
    expectFail(bom, constraint("compute", { tops: 50, ram_gb: 8 }));
  });
  it("fails when no compute component is present", () => {
    const bom = bomOf(comp("sensing", { resolution_mp: 12 }));
    const check = expectFail(bom, constraint("compute", { tops: 50, ram_gb: 8 }));
    expect(check.reason).toContain("compute");
  });
});

// ---------------------------------------------------------------------------
// sensing
// ---------------------------------------------------------------------------

describe("sensing", () => {
  it("passes when resolution, fps, interface and lanes are met", () => {
    const bom = bomOf(
      comp("sensing", { resolution_mp: 12, fps: 60, sensor_interface: "MIPI-CSI", lanes: 4 }),
    );
    expectPass(
      bom,
      constraint("sensing", { resolution_mp: 8, fps: 30, interface: "MIPI-CSI", lanes: 2 }),
    );
  });
  it("fails when the interface does not match", () => {
    const bom = bomOf(
      comp("sensing", { resolution_mp: 12, fps: 60, sensor_interface: "USB3", lanes: 4 }),
    );
    expectFail(
      bom,
      constraint("sensing", { resolution_mp: 8, fps: 30, interface: "MIPI-CSI", lanes: 2 }),
    );
  });
  it("fails when no sensing component is present", () => {
    const bom = bomOf(comp("compute", { tops: 100 }));
    const check = expectFail(
      bom,
      constraint("sensing", { resolution_mp: 8, fps: 30, interface: "MIPI-CSI" }),
    );
    expect(check.reason).toContain("sensing");
  });
});

// ---------------------------------------------------------------------------
// comms
// ---------------------------------------------------------------------------

describe("comms", () => {
  it("passes when bands, antenna connector and chains are covered", () => {
    const bom = bomOf(
      comp("comms", {
        bands: ["2.4GHz", "5.8GHz"],
        antenna_connector: "U.FL",
        chains: 2,
      }),
    );
    expectPass(
      bom,
      constraint("comms", {
        bands: ["2.4GHz", "5.8GHz"],
        antenna_connector: "U.FL",
        chains: 2,
      }),
    );
  });
  it("fails when a required band is not covered", () => {
    const bom = bomOf(comp("comms", { bands: ["2.4GHz"], antenna_connector: "U.FL", chains: 1 }));
    expectFail(bom, constraint("comms", { bands: ["2.4GHz", "5.8GHz"] }));
  });
  it("fails when no comms component is present", () => {
    const bom = bomOf(comp("compute", { tops: 50 }));
    const check = expectFail(bom, constraint("comms", { bands: ["2.4GHz"] }));
    expect(check.reason).toContain("comms");
  });
});

// ---------------------------------------------------------------------------
// actuation
// ---------------------------------------------------------------------------

describe("actuation", () => {
  it("passes when torque met and driver survives stall", () => {
    const bom = bomOf(
      comp("actuation", { torque_nm: 5, stall_current_a: 8, driver_current_a: 10 }),
    );
    expectPass(bom, constraint("actuation", { torque_nm: 4 }));
  });
  it("fails when driver cannot survive stall current", () => {
    const bom = bomOf(
      comp("actuation", { torque_nm: 5, stall_current_a: 12, driver_current_a: 10 }),
    );
    expectFail(bom, constraint("actuation", { torque_nm: 4 }));
  });
  it("fails when no actuation component is present", () => {
    const bom = bomOf(comp("compute", { tops: 50 }));
    const check = expectFail(bom, constraint("actuation", { torque_nm: 4 }));
    expect(check.reason).toContain("actuation");
  });
});

// ---------------------------------------------------------------------------
// connectors
// ---------------------------------------------------------------------------

describe("connectors", () => {
  it("passes when every required mate is provided somewhere", () => {
    const bom = bomOf(
      comp("compute", { connectors_required: ["JST-GH-4"] }),
      comp("power", { connectors_provided: ["JST-GH-4", "U.FL"] }),
    );
    expectPass(bom, constraint("connectors", {}));
  });
  it("fails when a required mate is missing", () => {
    const bom = bomOf(comp("compute", { connectors_required: ["JST-GH-4"] }, { name: "SoM" }));
    const check = expectFail(bom, constraint("connectors", {}));
    expect(check.reason).toContain("JST-GH-4");
  });
});

// ---------------------------------------------------------------------------
// environment
// ---------------------------------------------------------------------------

describe("environment", () => {
  it("passes when the weakest IP rating meets the requirement", () => {
    const bom = bomOf(comp("chassis", { ip_rating: 67 }), comp("comms", { ip_rating: 65 }));
    expectPass(bom, constraint("environment", { ip_rating: 54 }));
  });
  it("fails when a component is below the required IP rating", () => {
    const bom = bomOf(comp("chassis", { ip_rating: 67 }), comp("comms", { ip_rating: 40 }, { name: "Radio" }));
    const check = expectFail(bom, constraint("environment", { ip_rating: 54 }));
    expect(check.reason).toContain("Radio");
  });
  it("fails when no component declares ip_rating", () => {
    const bom = bomOf(comp("chassis", {}));
    const check = expectFail(bom, constraint("environment", { ip_rating: 54 }));
    expect(check.reason).toContain("ip_rating");
  });
});

// ---------------------------------------------------------------------------
// cost
// ---------------------------------------------------------------------------

describe("cost", () => {
  it("passes when total cost is within budget", () => {
    const bom = bomOf(comp("compute", { cost_usd: 200 }), comp("sensing", { cost_usd: 50 }));
    expectPass(bom, constraint("cost", { max: 300 }, "soft"));
  });
  it("fails when total cost exceeds budget", () => {
    const bom = bomOf(comp("compute", { cost_usd: 400 }));
    expectFail(bom, constraint("cost", { max: 300 }, "soft"));
  });
  it("fails when a part is missing cost_usd", () => {
    const bom = bomOf(comp("compute", {}, { name: "NoCost" }));
    const check = expectFail(bom, constraint("cost", { max: 300 }, "soft"));
    expect(check.reason).toContain("cost_usd");
  });
});

// ---------------------------------------------------------------------------
// lead_time
// ---------------------------------------------------------------------------

describe("lead_time", () => {
  it("passes when the longest lead time is within budget", () => {
    const bom = bomOf(comp("compute", { lead_time_days: 30 }), comp("sensing", { lead_time_days: 14 }));
    expectPass(bom, constraint("lead_time", { max: 45 }, "soft"));
  });
  it("fails when the longest lead time exceeds budget", () => {
    const bom = bomOf(comp("compute", { lead_time_days: 60 }, { name: "LongLead" }));
    const check = expectFail(bom, constraint("lead_time", { max: 45 }, "soft"));
    expect(check.reason).toContain("LongLead");
  });
  it("fails when a part is missing lead_time_days", () => {
    const bom = bomOf(comp("compute", {}, { name: "NoLead" }));
    const check = expectFail(bom, constraint("lead_time", { max: 45 }, "soft"));
    expect(check.reason).toContain("lead_time_days");
  });
});

// ---------------------------------------------------------------------------
// vendor_consolidation
// ---------------------------------------------------------------------------

describe("vendor_consolidation", () => {
  it("passes when distinct vendor count is within the cap", () => {
    const bom = bomOf(
      comp("compute", { tops: 50 }, { vendor: "Acme" }),
      comp("sensing", { resolution_mp: 12 }, { vendor: "Acme" }),
    );
    expectPass(bom, constraint("vendor_consolidation", { vendors_max: 2 }, "soft"));
  });
  it("fails when too many distinct vendors are used", () => {
    const bom = bomOf(
      comp("compute", { tops: 50 }, { vendor: "Acme" }),
      comp("sensing", { resolution_mp: 12 }, { vendor: "Bravo" }),
      comp("comms", { bands: ["2.4GHz"] }, { vendor: "Charlie" }),
    );
    expectFail(bom, constraint("vendor_consolidation", { vendors_max: 2 }, "soft"));
  });
});

// ---------------------------------------------------------------------------
// hardCoverage + firstHardFailure
// ---------------------------------------------------------------------------

describe("hardCoverage", () => {
  it("returns 1 when there are no hard checks", () => {
    const bom = bomOf(comp("compute", { cost_usd: 100 }));
    const checks = verify(bom, [constraint("cost", { max: 200 }, "soft")]);
    expect(hardCoverage(checks)).toBe(1);
  });
  it("computes the pass fraction across mixed hard checks", () => {
    const bom = bomOf(
      comp("power", { capacity_wh: 100 }),
      comp("compute", { active_w: 10, tops: 100, ram_gb: 16, mass_g: 500 }),
    );
    const rubric = [
      constraint("power_budget", { max: 20 }, "hard"), // pass (10 <= 20)
      constraint("compute", { tops: 50, ram_gb: 8 }, "hard"), // pass
      constraint("mass", { max: 100 }, "hard"), // fail (500 > 100)
      constraint("cost", { max: 10 }, "soft"), // soft fail, ignored by coverage
    ];
    const checks = verify(bom, rubric);
    // 2 of 3 hard pass.
    expect(hardCoverage(checks)).toBeCloseTo(2 / 3, 5);
  });

  it("returns 0 when all hard checks fail", () => {
    const bom = bomOf(comp("compute", { active_w: 50, mass_g: 999 }));
    const rubric = [
      constraint("power_budget", { max: 10 }, "hard"),
      constraint("mass", { max: 100 }, "hard"),
    ];
    expect(hardCoverage(verify(bom, rubric))).toBe(0);
  });
});

describe("firstHardFailure", () => {
  it("returns the first failing hard check in rubric order", () => {
    const bom = bomOf(comp("compute", { active_w: 5, mass_g: 999 }));
    const rubric = [
      constraint("power_budget", { max: 10 }, "hard"), // pass
      constraint("mass", { max: 100 }, "hard"), // first hard fail
    ];
    const checks = verify(bom, rubric);
    const f = firstHardFailure(checks);
    expect(f).toBeDefined();
    expect(f!.dimension).toBe("mass");
  });
  it("ignores soft failures", () => {
    const bom = bomOf(comp("compute", { active_w: 5, cost_usd: 999 }));
    const rubric = [
      constraint("power_budget", { max: 10 }, "hard"), // pass
      constraint("cost", { max: 100 }, "soft"), // soft fail
    ];
    expect(firstHardFailure(verify(bom, rubric))).toBeUndefined();
  });
  it("returns undefined when all hard checks pass", () => {
    const bom = bomOf(comp("compute", { active_w: 5 }));
    expect(firstHardFailure(verify(bom, [constraint("power_budget", { max: 10 })]))).toBeUndefined();
  });
});
