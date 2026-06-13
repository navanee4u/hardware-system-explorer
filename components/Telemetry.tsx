"use client";
/** Live (or replayed) telemetry stream — color-coded, tagged by candidate/provider. */
import { useEffect, useRef } from "react";
import type { Event, Profile } from "@/lib/schema";
import { evClass } from "./ui";
import { PROFILE_META } from "@/lib/profiles";

const CANDIDATE_COLOR: Record<Profile, string> = {
  Efficiency: "#0284c7",
  Compact: "#6048f0",
  Value: "#b45309",
};

/** One-line legend so a newcomer can read the color-coded stream at a glance. */
const LEGEND: { cls: string; label: string }[] = [
  { cls: "ev-provider", label: "sourcing parts" },
  { cls: "ev-model", label: "asking the model" },
  { cls: "ev-fix", label: "fixing a design" },
  { cls: "ev-fail", label: "failed a check" },
  { cls: "ev-pass", label: "passed all checks" },
  { cls: "ev-rank", label: "ranked / decided" },
];

export function Telemetry({ events, height = 320, running = false }: { events: Event[]; height?: number; running?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--rf-border)", display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <span className="eyebrow">SYSTEM LOGS — EVERYTHING THE ENGINE IS DOING RIGHT NOW</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flex: "none" }}>
            {running && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--rf-pass)", fontSize: 12, fontWeight: 600 }}>
                <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />
                live
              </span>
            )}
            <span style={{ fontSize: 12, color: "var(--rf-muted)", fontFamily: "var(--rf-mono)" }}>{events.length} events</span>
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--rf-muted)", lineHeight: 1.5 }}>
          A step-by-step trace of the run. Each color marks what kind of step it is:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12 }}>
          {LEGEND.map((l) => (
            <span key={l.cls} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span
                aria-hidden
                style={{ width: 9, height: 9, borderRadius: 2, flex: "none", background: "currentColor" }}
                className={l.cls}
              />
              <span className={l.cls} style={{ fontWeight: 500 }}>{l.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div ref={ref} className="telemetry" style={{ height, overflow: "auto", padding: "8px 14px", fontSize: 12.5, lineHeight: 1.55 }}>
        {events.length === 0 && <div className="ev-muted">Awaiting run… steps will stream in here as the engine works.</div>}
        {events.map((e, i) => (
          <div className="telemetry-row" key={i}>
            <span className="t-type">{e.type}</span>
            {e.candidate && (
              <span
                style={{ color: CANDIDATE_COLOR[e.candidate], flex: "none", width: 78 }}
                title={`${PROFILE_META[e.candidate].label} design — ${PROFILE_META[e.candidate].tagline}`}
              >
                {PROFILE_META[e.candidate].label}
              </span>
            )}
            <span className={evClass(e.type)} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {e.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
