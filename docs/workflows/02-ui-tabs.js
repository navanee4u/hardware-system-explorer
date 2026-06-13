export const meta = {
  name: 'hse-ui-tabs',
  description: 'Build the three read-only UI tabs (Past Designs, Components, Model Comparison) against the frozen UI foundation',
  phases: [{ title: 'Build tabs', detail: 'Past Designs, Components, Model Comparison — disjoint client components, parallel' }],
}

const ROOT = 'C:\\Users\\navan\\RF\\Claude_Fable_Build\\System-Explorer'

const FOUNDATION = `
You are building ONE read-only React tab for the "Hardware System Explorer" (Next.js 15 App Router, TypeScript).
The app shows three verified SWAP-C hardware designs, ranked; a human picks one; the system learns; telemetry streams live.

READ THESE FIRST (the frozen foundation you build against — do NOT modify them):
1. ${ROOT}\\lib\\schema.ts            — shared types: DesignRun, Candidate, Component, ScoreCard, Profile, Preference, DecisionRecord, Event
2. ${ROOT}\\components\\api.ts         — browser API client: api.runs(), api.run(id), api.components(), api.preferences(), api.models(); types ModelsInfo, PreferencesInfo
3. ${ROOT}\\components\\ui.tsx         — shared presentational: Provenance, RankBadge, Bar, Scorecard, RubricChecklist, Bom, evClass
4. ${ROOT}\\components\\Telemetry.tsx  — <Telemetry events={Event[]} height?={number} /> renders a color-coded event stream
5. ${ROOT}\\components\\DesignTab.tsx  — reference for STYLE/PATTERNS (useEffect fetch, card layout, inline styles + CSS vars). Match its look.
6. ${ROOT}\\app\\globals.css           — design tokens: classes .card .eyebrow .btn .btn-primary .badge .rank .bar-track/.bar-fill .subsys; CSS vars --rf-primary(#0284c7) --rf-secondary(#6048f0) --rf-muted --rf-pass --rf-fail --rf-mono --rf-border. Rapidflare light theme, Geist/Geist Mono, bracketed [ EYEBROW ] labels.

Hard rules:
- File must start with "use client"; export the named function component exactly as specified.
- Import types from "@/lib/schema", data from "@/components/api", shared UI from "@/components/ui" and "@/components/Telemetry". REUSE these — do not reinvent Scorecard/Bom/RubricChecklist/Telemetry/Provenance.
- Use inline styles + the existing CSS classes/vars. NO new dependencies, NO Tailwind, NO chart libraries — hand-roll any charts as inline SVG.
- Write ONLY your one file. Do not edit other files. Spelling: "Rapidflare" (one word).
- Keep it clean and minimal (the project principle). Handle empty/loading states gracefully (no runs yet, no components yet).
- After writing, you MAY run: cd "${ROOT}"; npx tsc --noEmit  — and fix any errors IN YOUR FILE ONLY (ignore errors that originate in sibling tab files being written concurrently).
`

phase('Build tabs')

const PAST = `${FOUNDATION}

YOUR TAB: Past Designs. File: ${ROOT}\\components\\PastDesignsTab.tsx  — export function PastDesignsTab().

Browse every previous DesignRun in depth. On mount, api.runs() (newest first). Render a list; clicking a run expands it. For each run show:
- requirement (truncated in the list, full when expanded), model, created timestamp, and the agent's #1 profile.
- The human's decision badge if run.decision exists: chosen profile (or "rejected all"), agreed/disagreed (run.decision.agreed), and notes. Make agreement visually clear (green = agreed, violet = disagreed). If no decision, show "no choice recorded".
- When expanded: the three candidates side by side (reuse <Scorecard>, <Bom>, <RubricChecklist>, <RankBadge>) sorted by rank, each labeled with its profile; and the FULL replayable telemetry via <Telemetry events={run.telemetry} />.
Empty state: "No runs yet — run a design on the Design tab."`

const COMPONENTS = `${FOUNDATION}

YOUR TAB: Components. File: ${ROOT}\\components\\ComponentsTab.tsx  — export function ComponentsTab().

The complete library of every component ever discovered across all runs/providers (the growing asset). On mount, api.components(). Render a filterable/sortable table:
- Columns: name, vendor, part_number, subsystem, source (use <Provenance source={c.source}/>), and key specs (mass_g, cost_usd, active_w, plus subsystem-relevant ones from c.specs).
- A text search (name/vendor/part_number), a subsystem filter (dropdown over the distinct subsystems present), and sortable columns (click header to sort by mass/cost/power asc/desc).
- BONUS (do if clean): also api.runs() and, for each component, show which run ids used it (match part_number across run.candidates[].bom.subsystems). Small "used in N designs" hint.
- Show a count "N components" and make the library visibly substantial. Empty state: "No components yet — run a design first."
Keep the table readable with the mono font for specs and the .subsys class for subsystem labels.`

const MODELS = `${FOUNDATION}

YOUR TAB: Model Comparison. File: ${ROOT}\\components\\ModelComparisonTab.tsx  — export function ModelComparisonTab().

How the available Claude models differ at producing the BEST designs. PURE AGGREGATION over stored runs (api.runs()) — no extra compute. Group runs by run.model. For each model compute and chart (hand-rolled inline SVG, lightweight — grouped bars / simple lines / a small radar are all fine; keep it crisp and on-theme):
1. Best-design quality by dimension — per model, average the RANK#1 (feasible) candidate's normalized SWAP-C sub-scores (size/weight/power/cost/composite from candidate.scorecard). Grouped bars or overlaid radar so you can see e.g. one model finds lower-power designs while another finds cheaper ones.
2. Iterations to converge — average (and show spread/min-max if easy) of candidate.iterations per model to reach feasibility. Fewer = better self-correction.
3. Feasibility rate — % of candidates per model with candidate.feasible === true.
4. Cost of thinking — tokens + wall-clock per run by model (sum candidate.tokens and candidate.latency_ms across a run, averaged per model; tokens may be undefined for deterministic runs — handle gracefully).
5. Agreement rate — per model, how often run.decision.agreed === true (over runs that have a decision with a chosen pick).
Add a legend mapping model -> color. Use --rf-primary / --rf-secondary / a third accent for up to ~4 models. Filterable by requirement or time is a nice-to-have, not required. Empty state: "No runs yet — run designs across models (try the model selector on the Design tab) to compare."`

const MANIFEST = {
  type: 'object', additionalProperties: false,
  required: ['file', 'summary'],
  properties: {
    file: { type: 'string' },
    summary: { type: 'string', description: 'what was built + key UI elements' },
    selfCheckPassed: { type: 'boolean', description: 'true if tsc on your file was clean (ignoring sibling-file errors)' },
    notes: { type: 'string' },
  },
}

const results = await parallel([
  () => agent(PAST,       { label: 'past-designs tab', phase: 'Build tabs', schema: MANIFEST }),
  () => agent(COMPONENTS, { label: 'components tab',   phase: 'Build tabs', schema: MANIFEST }),
  () => agent(MODELS,     { label: 'model-compare tab',phase: 'Build tabs', schema: MANIFEST }),
])

return { tabs: results.filter(Boolean) }
