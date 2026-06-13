"use client";
/**
 * Browser-side API client: typed fetch helpers + an SSE reader for the live run
 * stream. Types come from the shared contract (@/lib/schema).
 */
import type {
  Component,
  DesignRun,
  Event,
  Preference,
  Profile,
  RankWeights,
  Rubric,
} from "@/lib/schema";

export interface ModelsInfo {
  models: { id: string; label: string }[];
  defaultModel: string;
  capability: { llmProposer: boolean; webSearch: boolean; rapidflare: boolean; durableStore: boolean };
}

export interface PreferencesInfo {
  preferences: Preference[];
  effectiveWeights: RankWeights;
  bias: { favor_vendors?: string[]; avoid_vendors?: string[]; favor_tags?: string[] };
  agreementRate: number | null;
  decisions: number;
  trend: { ts: string; rate: number }[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  models: () => getJson<ModelsInfo>("/api/models"),
  runs: () => getJson<{ runs: DesignRun[] }>("/api/runs").then((d) => d.runs),
  run: (id: string) => getJson<{ run: DesignRun }>(`/api/runs/${id}`).then((d) => d.run),
  components: () => getJson<{ components: Component[] }>("/api/components").then((d) => d.components),
  preferences: () => getJson<PreferencesInfo>("/api/preferences"),
  choose: (body: { runId: string; chosen?: Profile; notes?: string }) =>
    fetch("/api/choose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
};

/**
 * POST /api/run and stream SSE events. Calls onEvent for each event and resolves
 * with the runId (from the X-Run-Id header) when the stream closes.
 */
export async function streamRun(
  body: { requirement?: string; model?: string; weights?: RankWeights; rubric?: Rubric },
  onEvent: (e: Event) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const runId = res.headers.get("X-Run-Id");
  const reader = res.body?.getReader();
  if (!reader) return runId;
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(5).trim()) as Event);
      } catch {
        /* ignore keepalive / partial */
      }
    }
  }
  return runId;
}
