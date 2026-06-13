"use client";
import { useState } from "react";
import { DesignTab } from "@/components/DesignTab";
import { PastDesignsTab } from "@/components/PastDesignsTab";
import { ComponentsTab } from "@/components/ComponentsTab";
import { ModelComparisonTab } from "@/components/ModelComparisonTab";

const TABS = ["Design", "Past Designs", "Components", "Model Comparison"] as const;
type Tab = (typeof TABS)[number];

export default function Page() {
  const [tab, setTab] = useState<Tab>("Design");
  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px 80px" }}>
      <header style={{ marginBottom: 16 }}>
        <span className="eyebrow">Hardware System Explorer</span>
        <h1 style={{ fontSize: 20, margin: "4px 0 14px" }}>
          Three verified designs · one human choice · a system that learns
        </h1>
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
    </main>
  );
}
