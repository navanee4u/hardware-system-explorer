"use client";
/** Live (or replayed) telemetry stream — color-coded, tagged by candidate/provider. */
import { useEffect, useRef } from "react";
import type { Event, Profile } from "@/lib/schema";
import { evClass } from "./ui";

const CANDIDATE_COLOR: Record<Profile, string> = {
  Efficiency: "#0284c7",
  Compact: "#6048f0",
  Value: "#b45309",
};

export function Telemetry({ events, height = 320 }: { events: Event[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--rf-border)" }}>
        <span className="eyebrow">Live telemetry</span>
        <span style={{ fontSize: 11, color: "var(--rf-muted)", fontFamily: "var(--rf-mono)" }}>{events.length} events</span>
      </div>
      <div ref={ref} className="telemetry" style={{ height, overflow: "auto", padding: "8px 14px" }}>
        {events.length === 0 && <div className="ev-muted">Awaiting run…</div>}
        {events.map((e, i) => (
          <div className="telemetry-row" key={i}>
            <span className="t-type">{e.type}</span>
            {e.candidate && (
              <span style={{ color: CANDIDATE_COLOR[e.candidate], flex: "none", width: 78 }}>{e.candidate}</span>
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
