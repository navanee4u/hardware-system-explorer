/**
 * GET /api/preferences — the learning panel feed: current learned preferences,
 * the effective ranking weights, and the agreement rate (agent #1 == human pick)
 * trending over runs.
 */
import { getStore } from "@/lib/store";
import { consultPreferences } from "@/lib/preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getStore();
  const [preferences, runs] = await Promise.all([store.listPreferences(), store.listRuns()]);

  const decisions = runs
    .map((r) => r.decision)
    .filter((d): d is NonNullable<typeof d> => d != null)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));

  // Agreement rate over decisions that picked something (rejected-all excluded).
  const picked = decisions.filter((d) => d.chosen != null);
  const agreements = picked.filter((d) => d.agreed).length;
  const agreementRate = picked.length > 0 ? agreements / picked.length : null;

  // Running agreement-rate trend for the chart.
  let cum = 0;
  const trend = picked.map((d, i) => {
    cum += d.agreed ? 1 : 0;
    return { ts: d.ts, rate: cum / (i + 1) };
  });

  const effective = consultPreferences(preferences);
  return Response.json({
    preferences,
    effectiveWeights: effective.weights,
    bias: effective.bias,
    agreementRate,
    decisions: picked.length,
    trend,
  });
}
