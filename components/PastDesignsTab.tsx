"use client";
/** Past Designs — browse every previous DesignRun in depth; expand to replay. */
import { useEffect, useMemo, useState } from "react";
import type { DesignRun, Profile } from "@/lib/schema";
import { api } from "./api";
import { Bom, RankBadge, RubricChecklist, Scorecard } from "./ui";
import { Telemetry } from "./Telemetry";

const CANDIDATE_COLOR: Record<Profile, string> = {
  Efficiency: "#0284c7",
  Compact: "#6048f0",
  Value: "#b45309",
};

function fmtTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function PastDesignsTab() {
  const [runs, setRuns] = useState<DesignRun[] | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api
      .runs()
      .then((r) => setRuns(r))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="card" style={{ color: "var(--rf-fail)", fontSize: 13 }}>
        Failed to load past designs.
      </div>
    );
  }

  if (runs === null) {
    return (
      <div className="card" style={{ color: "var(--rf-muted)", fontSize: 13 }}>
        Loading past designs…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="card" style={{ color: "var(--rf-muted)", fontSize: 13 }}>
        No runs yet — run a design on the Design tab.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="eyebrow">Past designs</span>
        <span style={{ fontSize: 11, color: "var(--rf-muted)", fontFamily: "var(--rf-mono)" }}>
          {runs.length} run{runs.length === 1 ? "" : "s"}
        </span>
      </div>
      {runs.map((run) => (
        <RunRow
          key={run.id}
          run={run}
          open={openId === run.id}
          onToggle={() => setOpenId((cur) => (cur === run.id ? null : run.id))}
        />
      ))}
    </div>
  );
}

function DecisionBadge({ run }: { run: DesignRun }) {
  const d = run.decision;
  if (!d) {
    return (
      <span style={{ fontSize: 11, color: "var(--rf-muted)", fontFamily: "var(--rf-mono)" }}>
        no choice recorded
      </span>
    );
  }
  const agreed = d.agreed;
  const accent = agreed ? "var(--rf-pass)" : "var(--rf-secondary)";
  const chosenLabel = d.chosen ?? "rejected all";
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--rf-mono)",
          fontWeight: 700,
          padding: "2px 9px",
          borderRadius: 999,
          color: "#fff",
          background: accent,
        }}
        title={d.chosen ? `Human chose ${d.chosen}` : "Human rejected all three"}
      >
        {agreed ? "✓ agreed" : "↔ disagreed"}
      </span>
      <span style={{ fontSize: 11, color: "var(--rf-muted)" }}>
        chose <strong style={{ color: "var(--rf-text)" }}>{chosenLabel}</strong>
      </span>
    </span>
  );
}

function RunRow({ run, open, onToggle }: { run: DesignRun; open: boolean; onToggle: () => void }) {
  const agentTop = useMemo(
    () => run.candidates.find((c) => c.rank === 1)?.profile,
    [run.candidates],
  );
  const ordered = useMemo(
    () => [...run.candidates].sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9)),
    [run.candidates],
  );

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* summary header (clickable) */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          textAlign: "left",
          border: "none",
          background: "none",
          padding: 16,
          cursor: "pointer",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
            <span style={{ color: "var(--rf-muted)", marginRight: 8 }}>{open ? "▾" : "▸"}</span>
            {open ? run.requirement : truncate(run.requirement, 120)}
          </span>
          <span style={{ flex: "none" }}>
            <DecisionBadge run={run} />
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 11,
            color: "var(--rf-muted)",
            fontFamily: "var(--rf-mono)",
          }}
        >
          <span>{fmtTs(run.created)}</span>
          <span>· {run.model}</span>
          {agentTop && (
            <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              · agent #1
              <span style={{ color: CANDIDATE_COLOR[agentTop], fontWeight: 700 }}>{agentTop}</span>
            </span>
          )}
        </div>
        {run.decision?.notes && (
          <div style={{ fontSize: 12, color: "var(--rf-text)", fontStyle: "italic" }}>
            “{run.decision.notes}”
          </div>
        )}
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--rf-border)", padding: 16, display: "grid", gap: 16 }}>
          {/* three candidates side by side, sorted by rank */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {ordered.map((cand) => (
              <div
                key={cand.profile}
                className="card"
                style={{ borderTop: `3px solid ${CANDIDATE_COLOR[cand.profile]}` }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span className="col-tag" style={{ color: CANDIDATE_COLOR[cand.profile] }}>
                      {cand.profile}
                    </span>
                    {!cand.feasible && (
                      <span style={{ fontSize: 11, color: "var(--rf-fail)", marginLeft: 8 }}>infeasible</span>
                    )}
                  </div>
                  <RankBadge rank={cand.rank} />
                </div>
                <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
                  <Scorecard sc={cand.scorecard} />
                  <Bom bom={cand.bom} />
                  <div style={{ borderTop: "1px solid var(--rf-border)", paddingTop: 10 }}>
                    <RubricChecklist checks={cand.checks} coverage={cand.coverage} />
                  </div>
                  {cand.infeasible_reason && (
                    <div style={{ fontSize: 11, color: "var(--rf-fail)" }}>⚠ {cand.infeasible_reason}</div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--rf-muted)", fontFamily: "var(--rf-mono)" }}>
                    {cand.iterations} iter
                    {cand.latency_ms ? ` · ${cand.latency_ms}ms` : ""}
                    {cand.tokens ? ` · ${cand.tokens} tok` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* full replayable telemetry */}
          <Telemetry events={run.telemetry} height={300} />
        </div>
      )}
    </div>
  );
}
