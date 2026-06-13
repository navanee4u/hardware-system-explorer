"use client";
/**
 * LearningTab — the proof of the outer loop. Aggregates every human decision and
 * the preferences distilled from it: the agreement-rate trend, the learned vs
 * default ranking weights, a timestamped decision timeline, the distilled
 * preferences, and side-by-side "agent #1 vs human pick" design examples that
 * show WHY each shift happened. Pure aggregation over stored runs + preferences.
 */
import { useEffect, useMemo, useState } from "react";
import type { DesignRun, Preference, Profile, RankWeights, ScoreCard } from "@/lib/schema";
import { api, type PreferencesInfo } from "./api";
import { Scorecard } from "./ui";
import { PROFILE_META } from "@/lib/profiles";

const CANDIDATE_COLOR: Record<Profile, string> = {
  Efficiency: "#0284c7",
  Compact: "#6048f0",
  Value: "#b45309",
};
const AXES: (keyof RankWeights)[] = ["size", "weight", "power", "cost", "margin"];
const AXIS_LABEL: Record<keyof RankWeights, string> = {
  size: "Size",
  weight: "Weight",
  power: "Power / endurance",
  cost: "Cost",
  margin: "Margin",
};

function fmt(ts?: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts.slice(0, 16);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LearningTab() {
  const [runs, setRuns] = useState<DesignRun[] | null>(null);
  const [prefs, setPrefs] = useState<PreferencesInfo | null>(null);

  useEffect(() => {
    api.runs().then(setRuns).catch(() => setRuns([]));
    api.preferences().then(setPrefs).catch(() => {});
  }, []);

  const decisions = useMemo(
    () =>
      (runs ?? [])
        .filter((r) => r.decision)
        .map((r) => ({ d: r.decision!, run: r }))
        .sort((a, b) => (a.d.ts < b.d.ts ? -1 : 1)),
    [runs],
  );

  if (runs === null) {
    return (
      <div className="card">
        <span className="eyebrow">Self-learning loop</span>
        <div style={{ marginTop: 8, color: "var(--rf-muted)" }}>Loading learning history…</div>
      </div>
    );
  }

  const picked = decisions.filter((x) => x.d.chosen != null);
  const agreements = picked.filter((x) => x.d.agreed).length;
  const agreementRate = picked.length ? agreements / picked.length : null;
  const disagreements = picked.filter((x) => !x.d.agreed);

  // Examples worth showing: disagreements first (they drove the learning), then a
  // recent agreement to show convergence. Up to 3.
  const recentAgreement = [...picked].reverse().find((x) => x.d.agreed);
  const examples = [...disagreements];
  if (recentAgreement && !examples.includes(recentAgreement)) examples.push(recentAgreement);
  const shownExamples = examples.slice(0, 3);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* intro + why it matters */}
      <div className="card">
        <span className="eyebrow">WHAT THE SYSTEM HAS LEARNED</span>
        <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6, maxWidth: 760 }}>
          Ranking proposes; the human disposes — and the system <strong>learns from the disposition</strong>.
          Every choice is recorded, distilled into durable preferences, and consulted at the start of the
          next run. Over time the agent&apos;s #1 converges on your taste. Preferences only ever reshape{" "}
          <em>soft</em> ranking weights — the verifier still gates every hard constraint, so learning can
          reorder feasible designs but never admit an infeasible one.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--rf-muted)", fontFamily: "var(--rf-mono)" }}>
          {["1 · human picks a winner (+ notes)", "2 · record decision", "3 · distill → preferences", "4 · consult at next run → #1 converges"].map((s) => (
            <span key={s} style={{ border: "1px solid var(--rf-border)", borderRadius: 6, padding: "4px 8px" }}>{s}</span>
          ))}
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <StatTile label="Human decisions" value={`${decisions.length}`} sub={`${picked.length} picked · ${decisions.length - picked.length} rejected all`} />
        <StatTile
          label="Agreement rate"
          value={agreementRate == null ? "—" : `${Math.round(agreementRate * 100)}%`}
          sub={`${agreements}/${picked.length} agent #1 = human pick`}
          trend={prefs?.trend}
        />
        <StatTile label="Preferences learned" value={`${prefs?.preferences.length ?? 0}`} sub="durable, consulted every run" />
        <StatTile label="Design runs" value={`${runs.length}`} sub="all gated by the verifier" />
      </div>

      {/* learned weights */}
      <div className="card">
        <span className="eyebrow">LEARNED RANKING WEIGHTS</span>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--rf-muted)", margin: "6px 0 12px" }}>
          How your past choices have reshaped the SWAP-C composite the agent uses to rank designs.
          Each axis starts equal at 0.20; green ▲ means the loop learned to weight it more.
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {AXES.map((axis) => {
            const w = prefs?.effectiveWeights?.[axis] ?? 0.2;
            const delta = w - 0.2;
            return (
              <div key={axis} style={{ display: "grid", gridTemplateColumns: "150px 1fr 120px", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13.5 }}>{AXIS_LABEL[axis]}</span>
                <div className="bar-track" style={{ height: 14 }}>
                  <div className="bar-fill" style={{ width: `${Math.round(w * 100 / 0.6 * 100) / 100}%`, background: delta > 0.001 ? "var(--rf-primary)" : delta < -0.001 ? "#94a3b8" : "var(--rf-secondary)" }} />
                </div>
                <span style={{ fontFamily: "var(--rf-mono)", fontSize: 12 }}>
                  {w.toFixed(3)}{" "}
                  <span style={{ color: delta > 0.001 ? "var(--rf-pass)" : delta < -0.001 ? "var(--rf-fail)" : "var(--rf-muted)" }}>
                    {delta > 0.001 ? `▲ +${delta.toFixed(3)}` : delta < -0.001 ? `▼ ${delta.toFixed(3)}` : "= default"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* decision timeline */}
      <div className="card">
        <span className="eyebrow">DECISION TIMELINE</span>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--rf-muted)", margin: "6px 0 0" }}>
          Every winner the human picked, in order — what the agent ranked #1 versus what was actually
          chosen, and the note that explained why.
        </div>
        {decisions.length === 0 ? (
          <div style={{ marginTop: 8, color: "var(--rf-muted)", fontSize: 13 }}>
            No decisions yet — pick a winner on the Design tab and it will appear here.
          </div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--rf-muted)", fontSize: 12 }}>
                  <Th>When</Th><Th>Requirement</Th><Th>Agent #1</Th><Th>Human pick</Th><Th>Outcome</Th><Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {decisions.map(({ d, run }) => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--rf-border)" }}>
                    <Td mono>{fmt(d.ts)}</Td>
                    <Td><span style={{ color: "var(--rf-muted)" }}>{run.requirement.slice(0, 56)}…</span></Td>
                    <Td><Profile p={d.agentTop} /></Td>
                    <Td>{d.chosen ? <Profile p={d.chosen} /> : <span style={{ color: "var(--rf-muted)" }}>none</span>}</Td>
                    <Td>
                      {d.chosen == null ? (
                        <span style={{ color: "var(--rf-fail)" }}>rejected all</span>
                      ) : d.agreed ? (
                        <span style={{ color: "var(--rf-pass)" }}>✓ agreed</span>
                      ) : (
                        <span style={{ color: "var(--rf-secondary)" }}>↔ disagreed</span>
                      )}
                    </Td>
                    <Td><span style={{ color: "var(--rf-muted)", fontStyle: "italic" }}>{d.notes || "—"}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* distilled preferences */}
      <div className="card">
        <span className="eyebrow">DISTILLED PREFERENCES</span>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--rf-muted)", margin: "6px 0 0" }}>
          The durable rules the system extracted from those decisions. These are consulted at the
          start of every future run to reshape the soft ranking weights.
        </div>
        {(prefs?.preferences.length ?? 0) === 0 ? (
          <div style={{ marginTop: 8, color: "var(--rf-muted)", fontSize: 13 }}>
            None yet — a disagreement or a note distills the system&apos;s first preference.
          </div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--rf-muted)", fontSize: 12 }}>
                  <Th>When</Th><Th>Kind</Th><Th>Source</Th><Th>What it learned</Th><Th>Adjustment</Th>
                </tr>
              </thead>
              <tbody>
                {prefs!.preferences.map((p: Preference) => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--rf-border)" }}>
                    <Td mono>{fmt(p.ts)}</Td>
                    <Td><span className="rank" style={{ background: "var(--rf-bg-alt, #f1f5f9)", padding: "1px 6px", borderRadius: 5 }}>{p.kind}</span></Td>
                    <Td mono>{p.source}</Td>
                    <Td>{p.statement}</Td>
                    <Td mono>{p.weights ? nudgeStr(p.weights) : p.bias ? biasStr(p.bias) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* design examples */}
      {shownExamples.length > 0 && (
        <div className="card">
          <span className="eyebrow">WHAT CHANGED ITS MIND — DESIGN EXAMPLES</span>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--rf-muted)", margin: "6px 0 14px" }}>
            Side by side: the design the agent ranked #1 vs the one the human actually chose. The
            axes where the human&apos;s pick scored higher are exactly what the loop learned to weight
            more.
          </div>
          <div style={{ display: "grid", gap: 18 }}>
            {shownExamples.map(({ d, run }) => {
              const top = d.scorecards?.[d.agentTop];
              const pick = d.chosen ? d.scorecards?.[d.chosen] : undefined;
              const favored = top && pick ? AXES.filter((a) => pick[a] - top[a] > 0.01).sort((x, y) => (pick[y] - top[y]) - (pick[x] - top[x])) : [];
              return (
                <div key={d.id} style={{ borderTop: "1px solid var(--rf-border)", paddingTop: 14 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
                    <span style={{ color: "var(--rf-muted)", fontFamily: "var(--rf-mono)" }}>{fmt(d.ts)}</span>{" "}
                    — {run.requirement.slice(0, 64)}…
                    {d.agreed ? (
                      <span style={{ color: "var(--rf-pass)", marginLeft: 6 }}>✓ converged (agreed with #1)</span>
                    ) : (
                      <span style={{ color: "var(--rf-secondary)", marginLeft: 6 }}>
                        ↔ chose {d.chosen ? PROFILE_META[d.chosen].label : d.chosen} over #1 {PROFILE_META[d.agentTop].label}
                        {favored.length ? ` → favored ${favored.map((a) => AXIS_LABEL[a].toLowerCase()).join(", ")}` : ""}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <ExampleDesign label={`Agent #1 · ${PROFILE_META[d.agentTop].label}`} sub={PROFILE_META[d.agentTop].tagline} profile={d.agentTop} sc={top} dim={!d.agreed} />
                    {d.chosen && <ExampleDesign label={`Human chose · ${PROFILE_META[d.chosen].label}`} sub={PROFILE_META[d.chosen].tagline} profile={d.chosen} sc={pick} highlight={!d.agreed} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: { ts: string; rate: number }[] }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12.5, color: "var(--rf-muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--rf-mono)", marginTop: 2 }}>{value}</div>
      {trend && trend.length > 1 && <Sparkline points={trend.map((t) => t.rate)} />}
      {sub && <div style={{ fontSize: 12, lineHeight: 1.4, color: "var(--rf-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 120, h = 24, n = points.length;
  const path = points.map((p, i) => `${(i / (n - 1)) * w},${h - p * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ marginTop: 6, display: "block" }}>
      <polyline points={path} fill="none" stroke="var(--rf-primary)" strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle key={i} cx={(i / (n - 1)) * w} cy={h - p * h} r={1.8} fill="var(--rf-primary)" />
      ))}
    </svg>
  );
}

function ExampleDesign({ label, sub, profile, sc, dim, highlight }: { label: string; sub?: string; profile: Profile; sc?: ScoreCard; dim?: boolean; highlight?: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${highlight ? "var(--rf-primary)" : "var(--rf-border)"}`,
        borderRadius: 10,
        padding: 12,
        opacity: dim ? 0.7 : 1,
        boxShadow: highlight ? "0 0 0 3px rgba(2,132,199,0.12)" : "none",
      }}
      title={PROFILE_META[profile].description}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: CANDIDATE_COLOR[profile] }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--rf-muted)", marginTop: 1, marginBottom: 8 }}>{sub}</div>}
      {!sub && <div style={{ marginBottom: 8 }} />}
      {sc ? <Scorecard sc={sc} /> : <div style={{ fontSize: 12.5, color: "var(--rf-muted)" }}>scorecard unavailable</div>}
    </div>
  );
}

function Profile({ p }: { p: Profile }) {
  return (
    <span style={{ color: CANDIDATE_COLOR[p], fontWeight: 600 }} title={PROFILE_META[p].description}>
      {PROFILE_META[p].label}
    </span>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "6px 10px 6px 0", fontWeight: 500 }}>{children}</th>;
}
function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td style={{ padding: "7px 10px 7px 0", fontFamily: mono ? "var(--rf-mono)" : undefined, verticalAlign: "top" }}>{children}</td>;
}
function nudgeStr(w: Partial<RankWeights>): string {
  return Object.entries(w).map(([k, v]) => `${k} ${(v as number) > 0 ? "+" : ""}${v}`).join(", ");
}
function biasStr(b: { favor_vendors?: string[]; avoid_vendors?: string[]; favor_tags?: string[] }): string {
  const parts: string[] = [];
  if (b.favor_tags?.length) parts.push(`+tags: ${b.favor_tags.join("/")}`);
  if (b.favor_vendors?.length) parts.push(`+vendors: ${b.favor_vendors.join("/")}`);
  if (b.avoid_vendors?.length) parts.push(`−vendors: ${b.avoid_vendors.join("/")}`);
  return parts.join("  ") || "—";
}
