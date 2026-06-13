"use client";
/**
 * ExampleGallery — a visual picker of pre-loaded hardware systems. Clicking a card
 * loads its requirement + rubric into the Design tab (the user then picks a model
 * and runs). Card art lives at /examples/<slug>.jpg; until an image is present a
 * per-card gradient stands in, so the gallery looks intentional either way.
 */
import { EXAMPLES, type Example } from "@/lib/examples";

// Distinct fallback gradients (Rapidflare-adjacent hues) keyed by index.
const GRADIENTS = [
  "linear-gradient(135deg,#0284c7,#0369a1)",
  "linear-gradient(135deg,#6048f0,#4338ca)",
  "linear-gradient(135deg,#0891b2,#0e7490)",
  "linear-gradient(135deg,#7c3aed,#6d28d9)",
  "linear-gradient(135deg,#0284c7,#6048f0)",
  "linear-gradient(135deg,#b45309,#92400e)",
  "linear-gradient(135deg,#0d9488,#0f766e)",
  "linear-gradient(135deg,#1d4ed8,#1e40af)",
  "linear-gradient(135deg,#db2777,#9d174d)",
  "linear-gradient(135deg,#334155,#0f172a)",
];

export function ExampleGallery({
  onSelect,
  activeId,
}: {
  onSelect: (ex: Example) => void;
  activeId?: string | null;
}) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="eyebrow">Example systems</span>
        <span style={{ fontSize: 11, color: "var(--rf-muted)" }}>
          Click a platform to load its requirement
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(176px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        {EXAMPLES.map((ex, i) => {
          const active = ex.id === activeId;
          return (
            <button
              key={ex.id}
              onClick={() => onSelect(ex)}
              title={ex.tagline}
              style={{
                textAlign: "left",
                padding: 0,
                overflow: "hidden",
                borderRadius: 12,
                border: active ? "2px solid var(--rf-primary)" : "1px solid var(--rf-border)",
                background: "var(--rf-bg, #fff)",
                cursor: "pointer",
                boxShadow: active ? "0 0 0 3px rgba(2,132,199,0.15)" : "none",
                transition: "transform .08s ease, box-shadow .12s ease",
              }}
            >
              <div
                style={{
                  position: "relative",
                  aspectRatio: "16 / 10",
                  background: `${GRADIENTS[i % GRADIENTS.length]}, #e2e8f0`,
                  backgroundImage: `url(/examples/${ex.slug}.png), ${GRADIENTS[i % GRADIENTS.length]}`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {!ex.feasibleByDesign && (
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      fontSize: 9,
                      fontFamily: "var(--rf-mono)",
                      background: "rgba(15,23,42,0.78)",
                      color: "#fff",
                      padding: "2px 6px",
                      borderRadius: 6,
                    }}
                  >
                    STRESS TEST
                  </span>
                )}
              </div>
              <div style={{ padding: "8px 10px 10px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{ex.title}</div>
                <div style={{ fontSize: 11, color: "var(--rf-muted)", marginTop: 3, lineHeight: 1.3 }}>
                  {ex.tagline}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
