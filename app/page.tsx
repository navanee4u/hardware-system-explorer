"use client";
import { useState } from "react";
import { DesignTab } from "@/components/DesignTab";
import { PastDesignsTab } from "@/components/PastDesignsTab";
import { ComponentsTab } from "@/components/ComponentsTab";
import { ModelComparisonTab } from "@/components/ModelComparisonTab";
import { LearningTab } from "@/components/LearningTab";

const TABS = ["Design", "Past Designs", "Components", "Model Comparison", "Self Learning Insights"] as const;
type Tab = (typeof TABS)[number];

export default function Page() {
  const [tab, setTab] = useState<Tab>("Design");
  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px 80px" }}>
      <header style={{ marginBottom: 16 }}>
        <span className="eyebrow">Hardware System Explorer</span>
        <h1 style={{ fontSize: 24, margin: "6px 0 6px", lineHeight: 1.25 }}>
          Three verified designs · one human choice · a system that learns
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--rf-muted)", margin: "0 0 16px", maxWidth: 760 }}>
          Describe a hardware system; get three verified, ranked designs; pick one and the system learns your
          preferences.
        </p>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </header>
      {tab === "Design" && <DesignTab />}
      {tab === "Past Designs" && <PastDesignsTab />}
      {tab === "Components" && <ComponentsTab />}
      {tab === "Model Comparison" && <ModelComparisonTab />}
      {tab === "Self Learning Insights" && <LearningTab />}
    </main>
  );
}
