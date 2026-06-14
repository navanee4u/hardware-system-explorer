/**
 * POST /api/run — run a design and STREAM every event over SSE (the co-hero).
 *
 * Consults learned preferences first (so each run starts from everything learned
 * so far), then drives the three candidates, streaming each telemetry event live
 * as it happens. Persists the run + discovered components at the end.
 *
 * Body (all optional): { requirement?, rubric?, weights?, model? }. Defaults to
 * the golden drone-payload requirement so the endpoint is demoable with no body.
 */

import type { NextRequest } from "next/server";
import { runDesign } from "@/lib/loop";
import { EventBus, encodeSSE } from "@/lib/telemetry";
import { getStore } from "@/lib/store";
import { loadEffective } from "@/lib/preferences";
import { DEFAULT_WEIGHTS } from "@/lib/rank";
import { DRONE_PAYLOAD_REQUIREMENT } from "@/lib/kb/sample-rubric";
import { buildRubricFromText } from "@/lib/intake";
import type { ModelId, RankWeights, Rubric } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel function ceiling. A 3-candidate LLM run can be slow; on Pro the cap is
// 300s (800s with Fluid Compute), which comfortably covers an Opus run.
// Deterministic runs finish in well under a second.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    requirement?: string;
    rubric?: Rubric;
    weights?: RankWeights;
    model?: ModelId;
  };

  const requirement = body.requirement ?? DRONE_PAYLOAD_REQUIREMENT;
  // An example card supplies its own rubric; a free-text requirement is parsed
  // into one (intake) so typed constraints are actually tracked by the verifier.
  const rubric = body.rubric ?? buildRubricFromText(requirement);
  const runId = `run_${Date.now().toString(36)}`;
  const bus = new EventBus(runId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: string) => {
        try {
          controller.enqueue(enc.encode(data));
        } catch {
          /* client disconnected */
        }
      };
      const unsubscribe = bus.subscribe((e) => send(encodeSSE(e)));

      try {
        const store = await getStore();
        // Outer loop: consult learned preferences -> effective weights + bias.
        const eff = await loadEffective(store, body.weights ?? DEFAULT_WEIGHTS);
        await runDesign({
          requirement,
          rubric,
          weights: eff.weights,
          bias: eff.bias,
          preferenceStatements: eff.statements,
          model: body.model ?? (process.env.ANTHROPIC_API_KEY ? "claude-sonnet-4-6" : "deterministic"),
          bus,
          store,
          runId,
        });
      } catch (err) {
        send(
          encodeSSE({
            ts: new Date().toISOString(),
            type: "run.done",
            runId,
            message: `run failed: ${err instanceof Error ? err.message : String(err)}`,
            data: { error: true },
          }),
        );
      } finally {
        unsubscribe();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Run-Id": runId,
    },
  });
}
