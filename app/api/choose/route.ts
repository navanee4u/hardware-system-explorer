/**
 * POST /api/choose — record the human's choice and LEARN from it.
 *
 * Body: { runId, chosen?, notes? }. `chosen` undefined => rejected all three.
 * Records the DecisionRecord, distills durable Preferences, and returns both so
 * the UI can surface the distilled preference live.
 */

import type { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { recordDecisionAndLearn } from "@/lib/preferences";
import type { Profile } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { runId, chosen, notes } = (await req.json()) as {
    runId: string;
    chosen?: Profile;
    notes?: string;
  };
  if (!runId) return Response.json({ error: "runId required" }, { status: 400 });

  const store = await getStore();
  const run = await store.getRun(runId);
  if (!run) return Response.json({ error: `run ${runId} not found` }, { status: 404 });

  const { decision, preferences } = await recordDecisionAndLearn(store, run, { chosen, notes });
  return Response.json({ decision, preferences });
}
