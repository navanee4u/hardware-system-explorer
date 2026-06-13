"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PROFILES, type DesignRun, type Event, type Profile } from "@/lib/schema";
import { api, streamRun, type ModelsInfo, type PreferencesInfo } from "./api";
import { Bom, RankBadge, RubricChecklist, Scorecard } from "./ui";
import { Telemetry } from "./Telemetry";

const SAMPLE_REQUIREMENT =
  "Design a self-contained outdoor inspection drone payload that captures imagery of power lines and rooftops " +
  "and streams a downlink to a ground station. ≥30 min runtime, −10..+50 °C, IP54, ≤~600 g and a 150×110×75 mm " +
  "envelope. Needs a Linux-class compute node, a MIPI-CSI camera ≥1.5 MP @20 fps, a wireless downlink, and a " +
  "steerable single-axis mount — from connectorized, reasonably-priced, in-stock parts.";

const CANDIDATE_COLOR: Record<Profile, string> = {
  Efficiency: "#0284c7",
  Compact: "#6048f0",
  Value: "#b45309",
};

export function DesignTab() {
  const [models, setModels] = useState<ModelsInfo | null>(null);
  const [model, setModel] = useState<string>("");
  const [requirement, setRequirement] = useState(SAMPLE_REQUIREMENT);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [run, setRun] = useState<DesignRun | null>(null);
  const [prefs, setPrefs] = useState<PreferencesInfo | null>(null);
  const [chosen, setChosen] = useState<Profile | "none" | null>(null);
  const [notes, setNotes] = useState("");
  const [distilled, setDistilled] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.models().then((m) => {
      setModels(m);
      setModel(m.defaultModel);
    });
    refreshPrefs();
  }, []);

  function refreshPrefs() {
    api.preferences().then(setPrefs).catch(() => {});
  }

  async function onRun() {
    setRunning(true);
    setEvents([]);
    setRun(null);
    setChosen(null);
    setNotes("");
    setDistilled(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const runId = await streamRun(
        { requirement, model },
        (e) => setEvents((prev) => [...prev, e]),
        ac.signal,
      );
      if (runId) {
        const full = await api.run(runId);
        setRun(full);
        refreshPrefs();
      }
    } catch {
      /* aborted or network */
    } finally {
      setRunning(false);
    }
  }

  // Live per-candidate state derived from the event stream (pre-completion).
  const live = useMemo(() => {
    const m: Record<string, { coverage: number; status: string }> = {};
    for (const e of events) {
      if (!e.candidate) continue;
      m[e.candidate] ??= { coverage: 0, status: "proposing" };
      if (e.type === "verify.result" && typeof e.data?.coverage === "number") m[e.candidate].coverage = e.data.coverage as number;
      if (e.type === "candidate.pass") m[e.candidate].status = "feasible";
      if (e.type === "candidate.infeasible") m[e.candidate].status = "infeasible";
    }
    return m;
  }, [events]);

  const orderedCandidates = run
    ? [...run.candidates].sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9))
    : [];
  const agentTop = run?.candidates.find((c) => c.rank === 1)?.profile;

  async function confirmChoice() {
    if (!run || !chosen) return;
    const body = { runId: run.id, chosen: chosen === "none" ? undefined : chosen, notes: notes || undefined };
    const res = await api.choose(body);
    setDistilled((res.preferences ?? []).map((p: { statement: string }) => p.statement));
    refreshPrefs();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* header: intake + model + learning panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div className="card">
          <span className="eyebrow">Requirement</span>
          <textarea
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            rows={4}
            style={{ width: "100%", marginTop: 8, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={running}>
              {models?.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={onRun} disabled={running || !model}>
              {running ? "Running…" : "Run — generate 3 designs"}
            </button>
            {models && !models.capability.llmProposer && (
              <span style={{ fontSize: 11, color: "var(--rf-muted)" }}>no API key → deterministic</span>
            )}
          </div>
        </div>
        <LearningPanel prefs={prefs} />
      </div>

      {/* three systems side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {(run ? orderedCandidates.map((c) => c.profile) : (PROFILES as readonly Profile[])).map((profile) => {
          const cand = run?.candidates.find((c) => c.profile === profile);
          const l = live[profile];
          return (
            <div className="card" key={profile} style={{ borderTop: `3px solid ${CANDIDATE_COLOR[profile]}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span className="col-tag" style={{ color: CANDIDATE_COLOR[profile] }}>{profile}</span>
                  {cand && !cand.feasible && (
                    <span style={{ fontSize: 11, color: "var(--rf-fail)", marginLeft: 8 }}>infeasible</span>
                  )}
                </div>
                {cand ? <RankBadge rank={cand.rank} /> : l && <span style={{ fontSize: 11, color: "var(--rf-muted)" }}>{l.status}</span>}
              </div>

              {cand ? (
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
                    {cand.iterations} iter{cand.latency_ms ? ` · ${cand.latency_ms}ms` : ""}
                    {cand.tokens ? ` · ${cand.tokens} tok` : ""}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 16, fontSize: 12, color: "var(--rf-muted)" }}>
                  {running || l ? (
                    <>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round((l?.coverage ?? 0) * 100)}%` }} /></div>
                      <div style={{ marginTop: 6 }}>{l?.status ?? "waiting"} · {Math.round((l?.coverage ?? 0) * 100)}% coverage</div>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* choice bar */}
      {run && (
        <div className="card" style={{ borderColor: "var(--rf-primary)" }}>
          <span className="eyebrow">Your choice — the system learns from this</span>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            {orderedCandidates.map((c) => (
              <label key={c.profile} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="radio" name="choice" checked={chosen === c.profile} onChange={() => setChosen(c.profile)} style={{ padding: 0 }} />
                {c.profile} <span className="rank-1 rank" style={{ display: c.rank === 1 ? "inline" : "none" }}>agent #1</span>
              </label>
            ))}
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--rf-muted)", cursor: "pointer" }}>
              <input type="radio" name="choice" checked={chosen === "none"} onChange={() => setChosen("none")} style={{ padding: 0 }} />
              None fit
            </label>
            <input
              placeholder="Optional note (why this one / what you'd change)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ flex: 1, minWidth: 220 }}
            />
            <button className="btn btn-primary" disabled={!chosen} onClick={confirmChoice}>Confirm choice</button>
          </div>
          {chosen && chosen !== "none" && agentTop && (
            <div style={{ fontSize: 12, marginTop: 8, color: chosen === agentTop ? "var(--rf-pass)" : "var(--rf-secondary)" }}>
              {chosen === agentTop ? "✓ You agree with the agent's #1." : `↔ Disagreement: you prefer ${chosen} over the agent's #1 (${agentTop}) — the strongest learning signal.`}
            </div>
          )}
          {distilled && (
            <div style={{ marginTop: 10, borderTop: "1px solid var(--rf-border)", paddingTop: 10 }}>
              <span className="eyebrow">Preferences distilled</span>
              {distilled.length === 0 && <div style={{ fontSize: 12, color: "var(--rf-muted)" }}>(recorded; no new preference)</div>}
              {distilled.map((s, i) => (
                <div key={i} style={{ fontSize: 12, marginTop: 4 }}>• {s}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* live telemetry — the co-hero */}
      <Telemetry events={events.length ? events : run?.telemetry ?? []} height={340} />
    </div>
  );
}

function LearningPanel({ prefs }: { prefs: PreferencesInfo | null }) {
  return (
    <div className="card">
      <span className="eyebrow">Learning</span>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--rf-muted)" }}>Agreement rate</span>
          <span style={{ fontFamily: "var(--rf-mono)", fontWeight: 700 }}>
            {prefs?.agreementRate == null ? "—" : `${Math.round(prefs.agreementRate * 100)}%`}
            <span style={{ color: "var(--rf-muted)", fontWeight: 400 }}> ({prefs?.decisions ?? 0})</span>
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{ color: "var(--rf-muted)" }}>Learned preferences</span>
          {(prefs?.preferences ?? []).length === 0 && <div style={{ color: "var(--rf-muted)", marginTop: 4 }}>None yet — make a choice.</div>}
          <div style={{ maxHeight: 90, overflow: "auto", marginTop: 4 }}>
            {(prefs?.preferences ?? []).slice(-6).map((p) => (
              <div key={p.id} style={{ fontSize: 11, marginTop: 3 }}>• {p.statement}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
