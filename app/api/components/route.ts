/** GET /api/components — the growing library of every discovered component. */
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getStore();
  const components = await store.listComponents();
  return Response.json({ components });
}
