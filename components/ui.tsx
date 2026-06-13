"use client";
/** Small shared presentational components used across tabs. */
import type { Candidate, Check, Component, ScoreCard, Source } from "@/lib/schema";

const SOURCE_LABEL: Record<string, string> = {
  kb: "From the internal parts knowledge base",
  web: "Sourced from the web",
  rapidflare: "Rapidflare catalog part",
};

export function Provenance({ source }: { source: Source }) {
  return (
    <span className={`badge badge-${source}`} title={SOURCE_LABEL[source] ?? `Source: ${source}`}>
      {source}
    </span>
  );
}

export function RankBadge({ rank }: { rank?: 1 | 2 | 3 }) {
  if (!rank) return null;
  return (
    <span
      className={`rank rank-${rank}`}
      title={rank === 1 ? "Best overall — top-ranked design" : `Ranked #${rank} of 3`}
    >
      {rank === 1 ? "#1 · Best" : `#${rank}`}
    </span>
  );
}

export function Bar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="bar-track" title={`${pct}%`}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

const SCORE_ROWS: { key: keyof ScoreCard; label: string; hint: string }[] = [
  { key: "size", label: "Size", hint: "How well it fits the size envelope" },
  { key: "weight", label: "Weight", hint: "How light it is vs. the mass limit" },
  { key: "power", label: "Power / endurance", hint: "Power draw and battery runtime" },
  { key: "cost", label: "Cost", hint: "How cheap the bill of materials is" },
  { key: "margin", label: "Margin / headroom", hint: "Safety margin left on the hard limits" },
];

export function Scorecard({ sc }: { sc: ScoreCard }) {
  return (
    <div style={{ display: "grid", gap: 7 }}>
      <div style={{ fontSize: 11.5, color: "var(--rf-muted)", lineHeight: 1.35 }}>
        SWAP-C sub-scores — higher = better (0–1).
      </div>
      {SCORE_ROWS.map((r) => (
        <div key={r.key} style={{ display: "grid", gridTemplateColumns: "118px 1fr 34px", gap: 8, alignItems: "center" }} title={r.hint}>
          <span style={{ fontSize: 12, color: "var(--rf-muted)", lineHeight: 1.25 }}>{r.label}</span>
          <Bar value={sc[r.key]} />
          <span style={{ fontSize: 12, fontFamily: "var(--rf-mono)", textAlign: "right" }}>{sc[r.key].toFixed(2)}</span>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "118px 1fr 34px", gap: 8, alignItems: "center", borderTop: "1px solid var(--rf-border)", paddingTop: 7 }} title="Weighted blend of the sub-scores above — drives the ranking">
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>Overall score</span>
        <Bar value={sc.composite} />
        <span style={{ fontSize: 12.5, fontFamily: "var(--rf-mono)", textAlign: "right", fontWeight: 700 }}>{sc.composite.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function RubricChecklist({ checks, coverage }: { checks: Check[]; coverage: number }) {
  const hard = checks.filter((c) => c.kind === "hard");
  const passed = hard.filter((c) => c.status === "pass").length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span className="eyebrow">Requirement checks</span>
        <span style={{ fontSize: 12, fontFamily: "var(--rf-mono)", color: coverage >= 1 ? "var(--rf-pass)" : "var(--rf-muted)" }} title="Hard requirements that must all pass for a design to be valid">
          {passed}/{hard.length} hard requirements met · {Math.round(coverage * 100)}%
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--rf-muted)", lineHeight: 1.35, marginBottom: 8 }}>
        Every hard requirement must pass; soft goals are nice-to-have.
      </div>
      {checks.map((c) => (
        <div className="check" key={c.constraint_id} title={c.reason} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
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
      <div>
        <div className="eyebrow">Bill of materials</div>
        <div style={{ fontSize: 12, color: "var(--rf-muted)", lineHeight: 1.35, marginTop: 2 }}>
          Every part in this design, grouped by subsystem. Badges show where each part came from:
          {" "}<span style={{ fontFamily: "var(--rf-mono)" }}>kb</span> = parts knowledge base,
          {" "}<span style={{ fontFamily: "var(--rf-mono)" }}>web</span> = web,
          {" "}<span style={{ fontFamily: "var(--rf-mono)" }}>rapidflare</span> = Rapidflare catalog.
        </div>
      </div>
      {entries.map(([subsystem, list]) => (
        <div key={subsystem}>
          <div className="subsys">{subsystem}</div>
          {(list as Component[]).map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 13, lineHeight: 1.4 }}>
              <Provenance source={c.source} />
              <span>{c.name}</span>
              <span style={{ color: "var(--rf-muted)", fontFamily: "var(--rf-mono)", fontSize: 12 }}>{c.part_number}</span>
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
