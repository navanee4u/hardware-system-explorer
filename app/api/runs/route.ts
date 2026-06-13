/** GET /api/runs — list all design runs (newest first) for the Past Designs tab. */
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getStore();
  const runs = await store.listRuns();
  runs.sort((a, b) => (a.created < b.created ? 1 : -1));
  return Response.json({ runs });
}
