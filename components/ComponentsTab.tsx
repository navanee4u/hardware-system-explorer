"use client";
/**
 * Components tab — the growing component library.
 *
 * Read-only view over every component ever discovered across all runs/providers.
 * Filterable (text + subsystem), sortable (mass / cost / power), and — as a bonus —
 * annotated with how many design runs each part appears in.
 */
import { useEffect, useMemo, useState } from "react";
import type { Component, DesignRun, Subsystem } from "@/lib/schema";
import { api } from "./api";
import { Provenance } from "./ui";

type SortKey = "mass_g" | "cost_usd" | "active_w";
type SortDir = "asc" | "desc";

/** Subsystem-relevant extra specs to surface in the "key specs" column. */
const SUBSYSTEM_SPECS: Record<string, { key: string; label: string; unit?: string }[]> = {
  compute: [
    { key: "tops", label: "TOPS" },
    { key: "ram_gb", label: "RAM", unit: "GB" },
  ],
  power: [
    { key: "capacity_wh", label: "cap", unit: "Wh" },
    { key: "peak_supply_w", label: "supply", unit: "W" },
  ],
  sensing: [
    { key: "resolution_mp", label: "res", unit: "MP" },
    { key: "fps", label: "fps" },
  ],
  comms: [{ key: "chains", label: "chains" }],
  actuation: [
    { key: "torque_nm", label: "torque", unit: "Nm" },
    { key: "driver_current_a", label: "drive", unit: "A" },
  ],
  thermal: [{ key: "ip_rating", label: "IP" }],
};

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** Format a spec value compactly for the mono spec cells. */
function fmt(v: number | undefined): string {
  if (v === undefined) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 2 : 1);
}

export function ComponentsTab() {
  const [components, setComponents] = useState<Component[] | null>(null);
  const [runs, setRuns] = useState<DesignRun[]>([]);
  const [query, setQuery] = useState("");
  const [subsystem, setSubsystem] = useState<"all" | Subsystem>("all");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .components()
      .then(setComponents)
      .catch(() => {
        setError(true);
        setComponents([]);
      });
    // Bonus: which runs used each part. Failure here is non-fatal.
    api.runs().then(setRuns).catch(() => {});
  }, []);

  /** part_number -> set of run ids that used it (matched across every BOM). */
  const usageByPart = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const run of runs) {
      const seen = new Set<string>();
      for (const cand of run.candidates) {
        for (const list of Object.values(cand.bom.subsystems)) {
          for (const c of list ?? []) seen.add(c.part_number);
        }
      }
      for (const pn of seen) {
        if (!m.has(pn)) m.set(pn, new Set());
        m.get(pn)!.add(run.id);
      }
    }
    return m;
  }, [runs]);

  const subsystems = useMemo(() => {
    const set = new Set<Subsystem>();
    for (const c of components ?? []) set.add(c.subsystem);
    return [...set].sort();
  }, [components]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = (components ?? []).filter((c) => {
      if (subsystem !== "all" && c.subsystem !== subsystem) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.vendor.toLowerCase().includes(q) ||
        c.part_number.toLowerCase().includes(q)
      );
    });
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const av = num(a.specs[sortKey]);
        const bv = num(b.specs[sortKey]);
        // Components missing the sorted spec sink to the bottom either way.
        if (av === undefined && bv === undefined) return 0;
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        return (av - bv) * dir;
      });
    }
    return list;
  }, [components, query, subsystem, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortArrow(key: SortKey): string {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  const total = components?.length ?? 0;
  const loading = components === null;

  const headerCell: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 10px",
    fontFamily: "var(--rf-mono)",
    fontSize: 12,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--rf-muted)",
    borderBottom: "1px solid var(--rf-border)",
    whiteSpace: "nowrap",
  };
  const sortableHeader: React.CSSProperties = { ...headerCell, cursor: "pointer", userSelect: "none" };
  const numHeader: React.CSSProperties = { ...sortableHeader, textAlign: "right" };
  const cell: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: 13,
    borderBottom: "1px solid var(--rf-border)",
    verticalAlign: "top",
  };
  const monoCell: React.CSSProperties = {
    ...cell,
    fontFamily: "var(--rf-mono)",
    fontSize: 12,
    textAlign: "right",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* controls + count */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <span className="eyebrow">COMPONENT LIBRARY</span>
            <div style={{ fontSize: 13.5, color: "var(--rf-muted)", marginTop: 5, lineHeight: 1.5, maxWidth: 620 }}>
              The growing library of every real part the engine has discovered across all runs — it keeps
              learning new parts and reusing them in future designs. Search or filter to explore it.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--rf-mono)" }}>
              {loading ? "—" : filtered.length}
            </span>
            <span style={{ fontSize: 13, color: "var(--rf-muted)" }}>
              {filtered.length === total ? `component${total === 1 ? "" : "s"}` : `of ${total}`}
            </span>
          </div>
        </div>

        {/* legend explaining where each part came from (the Source column) */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 16px",
            marginTop: 12,
            fontSize: 12.5,
            color: "var(--rf-muted)",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--rf-text)" }}>Where parts come from:</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="badge badge-kb">kb</span> curated internal catalog
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="badge badge-web">web</span> found via live web search
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="badge badge-rapidflare">rapidflare</span> Rapidflare in-house part
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Search name, vendor, part number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <select value={subsystem} onChange={(e) => setSubsystem(e.target.value as "all" | Subsystem)}>
            <option value="all">All subsystems</option>
            {subsystems.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {(query || subsystem !== "all" || sortKey) && (
            <button
              className="btn"
              onClick={() => {
                setQuery("");
                setSubsystem("all");
                setSortKey(null);
                setSortDir("asc");
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headerCell}>Component</th>
                <th style={headerCell}>Vendor</th>
                <th style={headerCell}>Part #</th>
                <th style={headerCell}>Subsystem</th>
                <th style={headerCell} title="Where this part was discovered: internal catalog, web search, or a Rapidflare in-house part">
                  Source
                </th>
                <th style={numHeader} onClick={() => toggleSort("mass_g")} title="Sort by mass">
                  Mass g {sortArrow("mass_g")}
                </th>
                <th style={numHeader} onClick={() => toggleSort("cost_usd")} title="Sort by cost">
                  Cost $ {sortArrow("cost_usd")}
                </th>
                <th style={numHeader} onClick={() => toggleSort("active_w")} title="Sort by power">
                  Power W {sortArrow("active_w")}
                </th>
                <th style={headerCell}>Key specs</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const extras = SUBSYSTEM_SPECS[c.subsystem] ?? [];
                const usedIn = usageByPart.get(c.part_number)?.size ?? 0;
                const specStr = extras
                  .map((s) => {
                    const v = num((c.specs as Record<string, unknown>)[s.key]);
                    if (v === undefined) return null;
                    return `${s.label} ${fmt(v)}${s.unit ?? ""}`;
                  })
                  .filter(Boolean)
                  .join("  ");
                return (
                  <tr key={c.id}>
                    <td style={cell}>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      {usedIn > 0 && (
                        <div style={{ fontSize: 11.5, color: "var(--rf-muted)", marginTop: 2 }}>
                          used in {usedIn} design{usedIn === 1 ? "" : "s"}
                        </div>
                      )}
                      {c.tags && c.tags.length > 0 && (
                        <div style={{ fontSize: 11.5, color: "var(--rf-muted)", marginTop: 2 }}>
                          {c.tags.join(" · ")}
                        </div>
                      )}
                    </td>
                    <td style={cell}>{c.vendor}</td>
                    <td style={{ ...cell, fontFamily: "var(--rf-mono)", fontSize: 12, color: "var(--rf-muted)" }}>
                      {c.part_number}
                    </td>
                    <td style={cell}>
                      <span className="subsys">{c.subsystem}</span>
                    </td>
                    <td style={cell}>
                      <Provenance source={c.source} />
                    </td>
                    <td style={monoCell}>{fmt(num(c.specs.mass_g))}</td>
                    <td style={monoCell}>{fmt(num(c.specs.cost_usd))}</td>
                    <td style={monoCell}>{fmt(num(c.specs.active_w))}</td>
                    <td style={{ ...cell, fontFamily: "var(--rf-mono)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {specStr ? specStr : <span style={{ color: "var(--rf-muted)" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* empty / loading states */}
        {loading && (
          <div style={{ padding: "24px 14px", fontSize: 13, color: "var(--rf-muted)" }}>Loading library…</div>
        )}
        {!loading && total === 0 && (
          <div style={{ padding: "32px 14px", textAlign: "center", color: "var(--rf-muted)" }}>
            <div style={{ fontSize: 14 }}>
              {error
                ? "Could not load components."
                : "No components yet — run a design first and the parts it finds will be saved here."}
            </div>
          </div>
        )}
        {!loading && total > 0 && filtered.length === 0 && (
          <div style={{ padding: "24px 14px", textAlign: "center", fontSize: 13, color: "var(--rf-muted)" }}>
            No components match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
