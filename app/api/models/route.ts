/**
 * GET /api/models — selectable models and current sourcing capability.
 *
 * Surfaces honestly whether the LLM proposer / web search / Rapidflare provider
 * are live (keys present) or whether the run falls back to the deterministic
 * proposer + KB only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELS = [
  { id: "claude-fable-5", label: "Claude Fable 5" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (default)" },
  { id: "deterministic", label: "Deterministic (no LLM)" },
];

export async function GET() {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  return Response.json({
    models: MODELS,
    defaultModel: hasAnthropic ? process.env.DEFAULT_MODEL ?? "claude-sonnet-4-6" : "deterministic",
    capability: {
      llmProposer: hasAnthropic,
      webSearch: hasAnthropic,
      rapidflare: Boolean(process.env.RAPIDFLARE_API_KEY),
      durableStore: Boolean(process.env.POSTGRES_URL),
    },
  });
}
