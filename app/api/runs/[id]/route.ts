/** GET /api/runs/:id — one full design run (candidates + telemetry + decision). */
import type { NextRequest } from "next/server";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = await getStore();
  const run = await store.getRun(id);
  if (!run) return Response.json({ error: `run ${id} not found` }, { status: 404 });
  return Response.json({ run });
}
