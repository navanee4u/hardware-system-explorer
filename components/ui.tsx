"use client";
/** Small shared presentational components used across tabs. */
import type { Candidate, Check, Component, ScoreCard, Source } from "@/lib/schema";

export function Provenance({ source }: { source: Source }) {
  return <span className={`badge badge-${source}`}>{source}</span>;
}

export function RankBadge({ rank }: { rank?: 1 | 2 | 3 }) {
  if (!rank) return null;
  return <span className={`rank rank-${rank}`}>#{rank}</span>;
}

export function Bar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="bar-track" title={`${pct}%`}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

const SCORE_ROWS: { key: keyof ScoreCard; label: string }[] = [
  { key: "size", label: "Size" },
  { key: "weight", label: "Weight" },
  { key: "power", label: "Power" },
  { key: "cost", label: "Cost" },
  { key: "margin", label: "Margin" },
];

export function Scorecard({ sc }: { sc: ScoreCard }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {SCORE_ROWS.map((r) => (
        <div key={r.key} style={{ display: "grid", gridTemplateColumns: "52px 1fr 34px", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--rf-muted)" }}>{r.label}</span>
          <Bar value={sc[r.key]} />
          <span style={{ fontSize: 11, fontFamily: "var(--rf-mono)", textAlign: "right" }}>{sc[r.key].toFixed(2)}</span>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 34px", gap: 8, alignItems: "center", borderTop: "1px solid var(--rf-border)", paddingTop: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>Composite</span>
        <Bar value={sc.composite} />
        <span style={{ fontSize: 11, fontFamily: "var(--rf-mono)", textAlign: "right", fontWeight: 700 }}>{sc.composite.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function RubricChecklist({ checks, coverage }: { checks: Check[]; coverage: number }) {
  const hard = checks.filter((c) => c.kind === "hard");
  const passed = hard.filter((c) => c.status === "pass").length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span className="eyebrow">Verifier checklist</span>
        <span style={{ fontSize: 11, fontFamily: "var(--rf-mono)", color: coverage >= 1 ? "var(--rf-pass)" : "var(--rf-muted)" }}>
          {passed}/{hard.length} hard · {Math.round(coverage * 100)}%
        </span>
      </div>
      {checks.map((c) => (
        <div className="check" key={c.constraint_id} title={c.reason}>
          <span className={`dot dot-${c.status === "pass" ? "pass" : "fail"}`} />
          <span style={{ color: c.kind === "soft" ? "var(--rf-muted)" : "inherit" }}>
            {c.constraint_id}
            {c.kind === "soft" ? " (soft)" : ""}
            <span style={{ color: "var(--rf-muted)" }}> — obs {String(c.observed)} / req {String(c.required)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function Bom({ bom }: { bom: Candidate["bom"] }) {
  const entries = Object.entries(bom.subsystems).filter(([, list]) => (list ?? []).length > 0);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {entries.map(([subsystem, list]) => (
        <div key={subsystem}>
          <div className="subsys">{subsystem}</div>
          {(list as Component[]).map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 12 }}>
              <Provenance source={c.source} />
              <span>{c.name}</span>
              <span style={{ color: "var(--rf-muted)", fontFamily: "var(--rf-mono)", fontSize: 10 }}>{c.part_number}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function evClass(type: string): string {
  if (type.startsWith("provider")) return "ev-provider";
  if (type === "model.call") return "ev-model";
  if (type === "constraint.fail" || type === "candidate.infeasible") return "ev-fail";
  if (type === "candidate.pass") return "ev-pass";
  if (type.startsWith("fix")) return "ev-fix";
  if (type === "rank.assigned" || type === "run.done") return "ev-rank";
  if (type === "preference.distilled" || type === "human.choice") return "ev-rank";
  return "ev-muted";
}
