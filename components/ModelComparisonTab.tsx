"use client";
/**
 * Model Comparison — pure aggregation over stored runs (api.runs()).
 * Groups runs by run.model and contrasts how each Claude model produces the
 * BEST designs: quality by SWAP-C dimension, iterations to converge,
 * feasibility rate, cost of thinking (tokens + wall-clock), and agreement rate.
 * No extra compute, no chart libs — every chart is hand-rolled inline SVG.
 */
import { useEffect, useMemo, useState } from "react";
import type { Candidate, DesignRun, ModelId, ScoreCard } from "@/lib/schema";
import { api, type ModelsInfo } from "./api";

// Up to ~4 models: primary, secondary, a warm accent, a teal neutral.
const PALETTE = ["var(--rf-primary)", "var(--rf-secondary)", "#b45309", "#0f766e"];

const DIMENSIONS: { key: keyof ScoreCard; label: string }[] = [
  { key: "size", label: "Size" },
  { key: "weight", label: "Weight" },
  { key: "power", label: "Power" },
  { key: "cost", label: "Cost" },
  { key: "composite", label: "Composite" },
];

interface ModelAgg {
  model: ModelId;
  label: string;
  color: string;
  runs: number;
  // averaged rank#1-feasible normalized sub-scores
  quality: Record<keyof ScoreCard, number>;
  qualitySamples: number;
  // iterations to feasibility
  iterAvg: number | null;
  iterMin: number | null;
  iterMax: number | null;
  // feasibility rate over all candidates
  feasibleRate: number | null;
  candidates: number;
  // cost of thinking (per-run sums, averaged)
  tokensAvg: number | null;
  latencyAvg: number | null;
  // agreement rate over runs with a decided pick
  agreementRate: number | null;
  decisions: number;
}

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function rank1Feasible(c: DesignRun["candidates"]): Candidate | undefined {
  return c.find((x) => x.rank === 1 && x.feasible) ?? c.find((x) => x.feasible);
}

export function ModelComparisonTab() {
  const [runs, setRuns] = useState<DesignRun[] | null>(null);
  const [models, setModels] = useState<ModelsInfo | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    Promise.all([api.runs(), api.models().catch(() => null)])
      .then(([r, m]) => {
        setRuns(r);
        setModels(m);
      })
      .catch(() => setErr(true));
  }, []);

  const labelFor = useMemo(() => {
    const map = new Map<string, string>();
    models?.models.forEach((m) => map.set(m.id, m.label));
    return (id: ModelId) => map.get(id) ?? id;
  }, [models]);

  const aggs = useMemo<ModelAgg[]>(() => {
    if (!runs) return [];
    const byModel = new Map<ModelId, DesignRun[]>();
    for (const run of runs) {
      const list = byModel.get(run.model) ?? [];
      list.push(run);
      byModel.set(run.model, list);
    }
    const out: ModelAgg[] = [];
    let i = 0;
    for (const [model, mRuns] of byModel) {
      // quality: average rank#1-feasible scorecards across runs
      const qAcc: Record<keyof ScoreCard, number[]> = {
        size: [], weight: [], power: [], cost: [], margin: [], composite: [],
      };
      const iters: number[] = [];
      const tokensPerRun: number[] = [];
      const latencyPerRun: number[] = [];
      let candidates = 0;
      let feasibleCount = 0;
      let decisions = 0;
      let agreed = 0;

      for (const run of mRuns) {
        const top = rank1Feasible(run.candidates);
        if (top) {
          (Object.keys(qAcc) as (keyof ScoreCard)[]).forEach((k) =>
            qAcc[k].push(top.scorecard[k]),
          );
        }
        let runTokens = 0;
        let runTokensSeen = false;
        let runLatency = 0;
        let runLatencySeen = false;
        for (const c of run.candidates) {
          candidates++;
          if (c.feasible) {
            feasibleCount++;
            iters.push(c.iterations);
          }
          if (typeof c.tokens === "number") {
            runTokens += c.tokens;
            runTokensSeen = true;
          }
          if (typeof c.latency_ms === "number") {
            runLatency += c.latency_ms;
            runLatencySeen = true;
          }
        }
        if (runTokensSeen) tokensPerRun.push(runTokens);
        if (runLatencySeen) latencyPerRun.push(runLatency);

        if (run.decision && run.decision.chosen) {
          decisions++;
          if (run.decision.agreed) agreed++;
        }
      }

      const quality = {} as Record<keyof ScoreCard, number>;
      (Object.keys(qAcc) as (keyof ScoreCard)[]).forEach((k) => {
        quality[k] = avg(qAcc[k]) ?? 0;
      });

      out.push({
        model,
        label: labelFor(model),
        color: PALETTE[i % PALETTE.length],
        runs: mRuns.length,
        quality,
        qualitySamples: qAcc.composite.length,
        iterAvg: avg(iters),
        iterMin: iters.length ? Math.min(...iters) : null,
        iterMax: iters.length ? Math.max(...iters) : null,
        feasibleRate: candidates ? feasibleCount / candidates : null,
        candidates,
        tokensAvg: avg(tokensPerRun),
        latencyAvg: avg(latencyPerRun),
        agreementRate: decisions ? agreed / decisions : null,
        decisions,
      });
      i++;
    }
    // stable, friendly ordering: most runs first
    return out.sort((a, b) => b.runs - a.runs);
  }, [runs, labelFor]);

  if (err) {
    return (
      <div className="card">
        <span className="eyebrow">Model comparison</span>
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--rf-fail)" }}>
          Could not load runs.
        </div>
      </div>
    );
  }

  if (!runs) {
    return (
      <div className="card">
        <span className="eyebrow">Model comparison</span>
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--rf-muted)" }}>Loading…</div>
      </div>
    );
  }

  if (runs.length === 0 || aggs.length === 0) {
    return (
      <div className="card">
        <span className="eyebrow">Model comparison</span>
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--rf-muted)" }}>
          No runs yet — run designs across models (try the model selector on the Design tab) to
          compare.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* header + legend */}
      <div className="card">
        <span className="eyebrow">Model comparison</span>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--rf-muted)" }}>
          Aggregated across {runs.length} stored run{runs.length === 1 ? "" : "s"} ·{" "}
          {aggs.length} model{aggs.length === 1 ? "" : "s"}. How each Claude model produces the best
          verified designs.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
          {aggs.map((a) => (
            <div key={a.model} style={{ display: "flex", gap: 7, alignItems: "center" }}>
              <span
                style={{ width: 12, height: 12, borderRadius: 3, background: a.color, flex: "none" }}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</span>
              <span
                style={{ fontSize: 11, color: "var(--rf-muted)", fontFamily: "var(--rf-mono)" }}
              >
                {a.runs} run{a.runs === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 1. Best-design quality by dimension — grouped bars */}
      <div className="card">
        <span className="eyebrow">Best-design quality by dimension</span>
        <div style={{ fontSize: 12, color: "var(--rf-muted)", marginTop: 4, marginBottom: 6 }}>
          Average normalized SWAP-C sub-scores of each model&apos;s rank #1 feasible design (1 =
          best).
        </div>
        <GroupedBars aggs={aggs} />
      </div>

      {/* 2-5. metric panels */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}
      >
        {/* 2. iterations to converge */}
        <div className="card">
          <span className="eyebrow">Iterations to converge</span>
          <div style={{ fontSize: 12, color: "var(--rf-muted)", marginTop: 4, marginBottom: 10 }}>
            Avg inner-loop passes to feasibility (with min–max spread). Fewer = better
            self-correction.
          </div>
          <IterChart aggs={aggs} />
        </div>

        {/* 3. feasibility rate */}
        <div className="card">
          <span className="eyebrow">Feasibility rate</span>
          <div style={{ fontSize: 12, color: "var(--rf-muted)", marginTop: 4, marginBottom: 10 }}>
            Share of candidates that reach a feasible design.
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {aggs.map((a) => (
              <RateRow
                key={a.model}
                label={a.label}
                color={a.color}
                value={a.feasibleRate}
                caption={
                  a.feasibleRate == null
                    ? "no candidates"
                    : `${Math.round(a.feasibleRate * 100)}% · ${a.candidates} cand`
                }
              />
            ))}
          </div>
        </div>

        {/* 4. cost of thinking */}
        <div className="card">
          <span className="eyebrow">Cost of thinking</span>
          <div style={{ fontSize: 12, color: "var(--rf-muted)", marginTop: 4, marginBottom: 10 }}>
            Tokens &amp; wall-clock per run, averaged. Deterministic runs report no tokens.
          </div>
          <CostTable aggs={aggs} />
        </div>

        {/* 5. agreement rate */}
        <div className="card">
          <span className="eyebrow">Agreement rate</span>
          <div style={{ fontSize: 12, color: "var(--rf-muted)", marginTop: 4, marginBottom: 10 }}>
            How often the human kept the agent&apos;s #1 pick.
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {aggs.map((a) => (
              <RateRow
                key={a.model}
                label={a.label}
                color={a.color}
                value={a.agreementRate}
                caption={
                  a.agreementRate == null
                    ? "no decisions yet"
                    : `${Math.round(a.agreementRate * 100)}% · ${a.decisions} decision${
                        a.decisions === 1 ? "" : "s"
                      }`
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- charts (hand-rolled inline SVG) ---------- */

function GroupedBars({ aggs }: { aggs: ModelAgg[] }) {
  const W = 720;
  const H = 240;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const groups = DIMENSIONS.length;
  const groupW = plotW / groups;
  const innerPad = 10;
  const barAreaW = groupW - innerPad;
  const barW = barAreaW / Math.max(aggs.length, 1);
  const y = (v: number) => padT + plotH * (1 - Math.max(0, Math.min(1, v)));

  const anySamples = aggs.some((a) => a.qualitySamples > 0);
  if (!anySamples) {
    return (
      <div style={{ fontSize: 12, color: "var(--rf-muted)" }}>
        No feasible rank #1 designs recorded yet.
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Quality by dimension">
      {/* gridlines + y labels at 0, .5, 1 */}
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="var(--rf-border)" strokeWidth={1} />
          <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill="var(--rf-muted)" fontFamily="var(--rf-mono)">
            {g.toFixed(1)}
          </text>
        </g>
      ))}
      {DIMENSIONS.map((dim, gi) => {
        const gx = padL + gi * groupW + innerPad / 2;
        return (
          <g key={dim.key}>
            {aggs.map((a, ai) => {
              const v = a.qualitySamples > 0 ? a.quality[dim.key] : 0;
              const bx = gx + ai * barW;
              const bh = plotH * Math.max(0, Math.min(1, v));
              return (
                <rect
                  key={a.model}
                  x={bx + 1}
                  y={padT + plotH - bh}
                  width={Math.max(barW - 2, 1)}
                  height={bh}
                  fill={a.color}
                  rx={2}
                >
                  <title>{`${a.label} · ${dim.label}: ${v.toFixed(2)}`}</title>
                </rect>
              );
            })}
            <text
              x={padL + gi * groupW + groupW / 2}
              y={H - padB + 16}
              textAnchor="middle"
              fontSize={11}
              fill="var(--rf-text)"
            >
              {dim.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function IterChart({ aggs }: { aggs: ModelAgg[] }) {
  const withData = aggs.filter((a) => a.iterAvg != null);
  if (withData.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--rf-muted)" }}>No feasible candidates yet.</div>
    );
  }
  const maxIter = Math.max(...withData.map((a) => a.iterMax ?? 0), 1);
  const W = 320;
  const rowH = 40;
  const H = withData.length * rowH + 24;
  const padL = 8;
  const padR = 36;
  const trackX = padL + 96;
  const trackW = W - trackX - padR;
  const x = (v: number) => trackX + (trackW * v) / maxIter;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Iterations to converge">
      {/* axis ticks */}
      {[0, Math.round(maxIter / 2), maxIter].map((t, i) => (
        <text key={i} x={x(t)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--rf-muted)" fontFamily="var(--rf-mono)">
          {t}
        </text>
      ))}
      {withData.map((a, i) => {
        const cy = 14 + i * rowH;
        const lo = a.iterMin ?? a.iterAvg ?? 0;
        const hi = a.iterMax ?? a.iterAvg ?? 0;
        const av = a.iterAvg ?? 0;
        return (
          <g key={a.model}>
            <text x={padL} y={cy + 4} fontSize={11} fill="var(--rf-text)">
              {a.label.length > 16 ? a.label.slice(0, 15) + "…" : a.label}
            </text>
            {/* base track */}
            <line x1={trackX} y1={cy} x2={trackX + trackW} y2={cy} stroke="var(--rf-border)" strokeWidth={6} strokeLinecap="round" />
            {/* min-max spread */}
            <line x1={x(lo)} y1={cy} x2={x(hi)} y2={cy} stroke={a.color} strokeWidth={6} strokeLinecap="round" opacity={0.35} />
            {/* avg marker */}
            <circle cx={x(av)} cy={cy} r={5} fill={a.color}>
              <title>{`${a.label}: avg ${av.toFixed(1)} (min ${lo}, max ${hi})`}</title>
            </circle>
            <text x={trackX + trackW + 6} y={cy + 4} fontSize={10} fill="var(--rf-text)" fontFamily="var(--rf-mono)">
              {av.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RateRow({
  label,
  color,
  value,
  caption,
}: {
  label: string;
  color: string;
  value: number | null;
  caption: string;
}) {
  const pct = value == null ? 0 : Math.round(value * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--rf-muted)", fontFamily: "var(--rf-mono)" }}>
          {caption}
        </span>
      </div>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ width: `${pct}%`, background: value == null ? "var(--rf-pending)" : color }}
        />
      </div>
    </div>
  );
}

function CostTable({ aggs }: { aggs: ModelAgg[] }) {
  const fmtTokens = (n: number | null) =>
    n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
  const fmtMs = (n: number | null) =>
    n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 64px 64px",
          gap: 8,
          fontSize: 10,
          color: "var(--rf-muted)",
          fontFamily: "var(--rf-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <span>Model</span>
        <span style={{ textAlign: "right" }}>Tokens</span>
        <span style={{ textAlign: "right" }}>Wall</span>
      </div>
      {aggs.map((a) => (
        <div
          key={a.model}
          style={{ display: "grid", gridTemplateColumns: "1fr 64px 64px", gap: 8, alignItems: "center" }}
        >
          <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <span
              style={{ width: 9, height: 9, borderRadius: 2, background: a.color, flex: "none" }}
            />
            {a.label}
          </span>
          <span style={{ textAlign: "right", fontSize: 12, fontFamily: "var(--rf-mono)" }}>
            {fmtTokens(a.tokensAvg)}
          </span>
          <span style={{ textAlign: "right", fontSize: 12, fontFamily: "var(--rf-mono)" }}>
            {fmtMs(a.latencyAvg)}
          </span>
        </div>
      ))}
    </div>
  );
}
