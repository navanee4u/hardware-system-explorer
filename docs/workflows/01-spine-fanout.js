export const meta = {
  name: 'hse-spine-fanout',
  description: 'Build the four independent spine modules (verifier, KB, providers, rank) against frozen contracts',
  phases: [
    { title: 'Build modules', detail: 'verifier+tests, KB seed, provider layer, ranking — disjoint files, parallel' },
  ],
}

const ROOT = 'C:\\Users\\navan\\RF\\Claude_Fable_Build\\System-Explorer'

const CONTRACT_PREAMBLE = `
You are building ONE module of the "Hardware System Explorer" — an agent that produces three
verified SWAP-C hardware designs, ranks them, learns from a human's choice, and streams telemetry.

CRITICAL CONTEXT — the contracts are ALREADY FROZEN. Before writing anything:
1. Read ${ROOT}\\lib\\schema.ts   (the shared type contract — import from "@/lib/schema", NEVER redefine types)
2. Read ${ROOT}\\lib\\telemetry.ts        (EventBus + emit + SSE)
3. Read ${ROOT}\\lib\\providers\\types.ts  (ComponentProvider / ComponentRegistry / ProviderContext)

Hard rules:
- Import ALL shared types from "@/lib/schema". Do not create competing type definitions.
- Write ONLY the files listed in your task. Other modules are being written concurrently by peers —
  do NOT create or edit their files, and do NOT run a full-project "tsc --noEmit" (sibling files may be
  incomplete and it will report spurious errors). You MAY run a typecheck/test scoped to your own files.
- Spelling: the brand is "Rapidflare" (one word, capital R only). Never "RapidFlare".
- Real engineering only. No invented specs. Honest numbers.
- Use absolute Windows paths under ${ROOT}. The repo uses path alias "@/*" -> project root.
`

phase('Build modules')

const VERIFIER = `${CONTRACT_PREAMBLE}

YOUR MODULE: the VERIFIER — the deterministic single source of truth. NO LLM, pure functions over (BOM, Rubric).

Files to create:
- ${ROOT}\\lib\\verifier.ts
- ${ROOT}\\tests\\verifier.test.ts

lib/verifier.ts must export:
- export function verify(bom: BOM, rubric: Rubric): Check[]
- export function hardCoverage(checks: Check[]): number   // fraction of HARD-kind checks with status "pass", 0..1 (1 if no hard checks)
- export function firstHardFailure(checks: Check[]): Check | undefined

Implement a checker per ConstraintDimension (see schema's ConstraintDimension union). verify() routes each
Constraint to its checker by constraint.dimension and returns one Check per constraint. Each Check must set
constraint_id, dimension, kind, status, observed, required, and a plain-English reason. Missing spec data
needed for a hard check => status "fail" with a reason naming the missing field (never a silent pass).

Engineering math to get RIGHT (sum across all components in bom.subsystems, flattened):
- power_budget: sum of specs.active_w over consumer subsystems (compute, sensing, comms, actuation) <= required.max
- peak_power_rail: P=I*V. For each required rail (or the supply's rails_out), peak draw <= rail max_current_a * voltage_v.
  Use specs.peak_w where present else active_w. Compare total peak against supply peak_supply_w if given, else required.max.
- voltage_rails: every rail in required.rails is provided by some supply's specs.rails_out (voltage match within 0.25V and adequate current).
- endurance: pick the battery (power subsystem) capacity_wh; avg_w = sum of active_w of consumers; minutes = capacity_wh/avg_w*60; pass if >= required.runtime_min.
- thermal: every component's specs.temp_range_c must cover required.env_temp_c (component.min <= env.min AND component.max >= env.max).
- mass: sum specs.mass_g over all components <= required.max.
- size: stack/pack check — for envelope_mm, ensure each board fits (l,w <= envelope l,w) and summed height (h) <= envelope h. Report observed packed height/footprint.
- compute: a compute component with specs.tops >= required.tops AND specs.ram_gb >= required.ram_gb.
- sensing: a sensing component with resolution_mp >= required.resolution_mp AND fps >= required.fps AND sensor_interface === required.interface AND lanes >= required.lanes (when specified).
- comms: a comms component covering all required.bands, antenna_connector === required.antenna_connector (if specified), chains >= required.chains.
- actuation: actuation component torque_nm >= required.torque_nm AND driver_current_a >= stall_current_a (driver must survive stall).
- connectors: every string in any component's specs.connectors_required is present in some component's specs.connectors_provided (mating pairs).
- environment: min specs.ip_rating across exposed components >= required.ip_rating.
- cost: sum specs.cost_usd <= required.max (usually soft).
- lead_time: max specs.lead_time_days <= required.max (usually soft).
- vendor_consolidation: count of distinct vendors <= required.vendors_max (soft).

tests/verifier.test.ts (vitest): for EVERY ConstraintDimension above, write at least one PASS case and one
FAIL case using small hand-built BOMs + single-constraint rubrics. Assert status and that reason is non-empty.
Also test hardCoverage (mixed pass/fail) and firstHardFailure.

After writing, run EXACTLY (PowerShell): cd "${ROOT}"; npx vitest run tests/verifier.test.ts
Iterate until ALL tests pass.

Return a manifest: files written, number of checkers, test count, and the final "passed/failed" line from vitest.`

const KB = `${CONTRACT_PREAMBLE}

YOUR MODULE: the seed KNOWLEDGE BASE of real components + a golden drone-payload rubric.

Files to create:
- ${ROOT}\\lib\\kb\\parts.ts
- ${ROOT}\\lib\\kb\\sample-rubric.ts

lib/kb/parts.ts must export:  export const KB_COMPONENTS: Component[]
Curate REAL, well-known parts with HONEST specs (you know these from training; do not fabricate part numbers).
Cover ALL 8 subsystems (compute, power, sensing, comms, actuation, thermal, connectors, chassis) with enough
variety that THREE distinct SWAP-C leanings are each satisfiable:
  - Efficiency lean: low active_w SoMs (e.g. low-power compute modules), higher-Wh battery options.
  - Compact lean: smallest boards / lightest cells (smaller dims_mm, lower mass_g).
  - Value lean: cheaper, in-stock, fewer vendors (lower cost_usd, lower lead_time_days).
Provide for each subsystem AT LEAST 3 alternatives that trade off differently on size/mass/power/cost so the
proposer has real choices. Compute modules: include tops + ram_gb + active_w + voltage_in. Batteries (power
subsystem): capacity_wh + mass_g + dims_mm + rails_out (e.g. a 5V and 12V rail with realistic max_current_a)
+ peak_supply_w. Cameras (sensing): resolution_mp, fps, sensor_interface (e.g. "MIPI-CSI"), lanes, mass_g,
active_w. Comms: bands, antenna_connector, chains, active_w. Actuation: torque_nm, stall_current_a,
driver_current_a. Every component needs id, subsystem, name, vendor, part_number, source:"kb",
specs{ mass_g, dims_mm, cost_usd, lead_time_days, temp_range_c, ...subsystem-specific }, and useful tags
(e.g. "low-power","connectorized","automotive","in-stock"). Set temp_range_c to honest industrial/commercial ranges.

lib/kb/sample-rubric.ts must export:
  export const DRONE_PAYLOAD_REQUIREMENT: string   // a realistic outdoor inspection drone payload requirement
  export const DRONE_PAYLOAD_RUBRIC: Rubric         // machine-checkable constraints matching schema
The rubric MUST be SATISFIABLE by KB_COMPONENTS for all three SWAP-C leanings (verify the numbers are
internally consistent — e.g. the power budget is meetable by at least one low-power compute + camera + comms
combo on an available battery). Include a mix of HARD constraints (power_budget, voltage_rails, endurance,
thermal, mass, size, compute, sensing, comms, environment, connectors) and SOFT (cost, lead_time,
vendor_consolidation) with sensible weights. Use realistic numbers for an outdoor inspection drone payload
(e.g. env_temp_c -10..50, ip_rating 54, runtime_min 30+, mass budget a few hundred grams to ~1kg, a power
budget of a handful to ~25 W). Add a short comment above each constraint explaining the number.

Do NOT run the full project typecheck. Sanity-check your own files compile in isolation if you can.
Return a manifest: counts of components per subsystem, total components, and the rubric's constraint count
(hard vs soft), plus a one-line confirmation that you traced at least one feasible BOM by hand.`

const PROVIDERS = `${CONTRACT_PREAMBLE}

YOUR MODULE: the PROVIDER LAYER (registry + 3 adapters). Telemetry on EVERY call.

Files to create:
- ${ROOT}\\lib\\providers\\kb.ts
- ${ROOT}\\lib\\providers\\websearch.ts
- ${ROOT}\\lib\\providers\\rapidflare.ts
- ${ROOT}\\lib\\providers\\registry.ts

All adapters implement ComponentProvider from "@/lib/providers/types". Each search() must, via ctx.bus.emit:
  - emit { type:"provider.query", provider, source, candidate, data:{subsystem, required} } before searching
  - emit { type:"provider.result", provider, source, candidate, data:{count, parts:[part_numbers], latency_ms} } after
  - emit { type:"provider.error", ... } on failure (and return [] — never throw out of search)
Tag every returned Component with the provider's source.

lib/providers/kb.ts — KBProvider:
  name="kb", source="kb", available()=>true. search(query) filters KB_COMPONENTS (import { KB_COMPONENTS } from "@/lib/kb/parts")
  by query.subsystem, then ranks by how well specs meet query.required (simple scoring: prefer parts that meet
  thresholds; return up to query.limit ?? 8). Trusted/offline.

lib/providers/websearch.ts — WebSearchProvider:
  name="websearch", source="web". available()=> Boolean(process.env.ANTHROPIC_API_KEY). When unavailable,
  search() emits a provider.query then a provider.result with count:0 and a note "websearch unavailable (no ANTHROPIC_API_KEY)"
  and returns []. Leave a clearly-marked TODO block showing where the Anthropic SDK web_search call + verbatim
  spec extraction (with source_url) will go in Phase 3. Do NOT call the network now. Any returned part must carry
  source:"web" and a source_url.

lib/providers/rapidflare.ts — RapidflareProvider (clean adapter, one small file so wiring the real endpoint is a 10-min job):
  name="rapidflare", source="rapidflare". available()=> Boolean(process.env.RAPIDFLARE_API_KEY).
  Read base URL from process.env.RAPIDFLARE_API_BASE. When unavailable, mark unavailable and return [] gracefully
  (with telemetry). Provide a single private mapResponse(raw): Component[] function that maps a hypothetical
  Rapidflare API payload to our Component shape, isolated so swapping in the real schema is trivial. Do NOT call
  the network now; guard behind available() and a TODO. (Brand is "Rapidflare", one word.)

lib/providers/registry.ts — ProviderRegistry implements ComponentRegistry:
  - constructor(providers: ComponentProvider[], config: RegistryConfig)
  - activeProviders(): providers whose name is in config.order AND available(), sorted by config.order priority.
  - search(query, ctx): fan out to activeProviders() (priority order; may run concurrently), concat results,
    dedup by config.dedupBy ?? "part_number" (first-seen by priority wins), return merged list.
  - export function buildRegistry(config: RegistryConfig, providers?: ComponentProvider[]): ProviderRegistry
    that defaults providers to [new KBProvider(), new WebSearchProvider(), new RapidflareProvider()].

Do NOT run the full project typecheck (kb.ts dependency lib/kb/parts.ts is being written concurrently).
Return a manifest of files written and the exported class/function names.`

const RANK = `${CONTRACT_PREAMBLE}

YOUR MODULE: SWAP-C SCORING + RANKING. Pure functions, no LLM.

File to create:
- ${ROOT}\\lib\\rank.ts

Must export:
- export const DEFAULT_WEIGHTS: RankWeights   // balanced defaults, e.g. size .2 weight .2 power .2 cost .2 margin .2
- export function normalizeWeights(w: RankWeights): RankWeights   // scales so the five fields sum to 1 (guard divide-by-zero)
- export function scoreCandidate(args: { bom: BOM; checks: Check[]; rubric: Rubric; weights: RankWeights }): ScoreCard
- export function rankCandidates(candidates: Candidate[], weights: RankWeights): Candidate[]   // returns same objects with rank set

SCORING — normalize each sub-score to 0..1 where 1 = BEST, using RUBRIC BUDGETS as the denominator (stable,
explainable — NOT min/max across candidates):
  - size: observed packed footprint/volume from the bom vs the size constraint's envelope budget => score = clamp(1 - used/budget, 0, 1).
  - weight: total mass_g vs the mass constraint's required.max => clamp(1 - total/budget, 0, 1).
  - power: total active_w vs the power_budget required.max => clamp(1 - total/budget, 0, 1).
  - cost: total cost_usd vs the cost constraint's required.max (if no cost constraint, normalize against a sane default) => clamp(1 - total/budget, 0, 1).
  - margin: average normalized headroom across the HARD checks that passed; infeasible designs get low margin.
  - composite: weighted sum of the five sub-scores using normalizeWeights(weights). 0..1.
Be defensive: missing budgets or specs => treat that sub-score as 0.5 (neutral) and never NaN.

RANKING — rankCandidates: FEASIBLE candidates (feasible===true) always outrank infeasible ones. Among feasible,
sort by composite DESC and assign rank 1,2,3. Infeasible candidates take remaining ranks by composite but stay
marked feasible:false. Assign rank as 1|2|3. Document in a comment that rankCandidates assumes scorecard is
already set (the loop calls scoreCandidate first); if a candidate has a zeroed scorecard, call scoreCandidate
is NOT this function's job — just rank by existing composite.

This file imports ONLY from "@/lib/schema".
Return a manifest of exported names and a one-line description of the normalization basis you used.`

const MANIFEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['module', 'files', 'summary'],
  properties: {
    module: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: 'what was built, key exports, and any test results' },
    selfCheckPassed: { type: 'boolean', description: 'true if your own scoped tests/typecheck passed' },
    notes: { type: 'string', description: 'anything the integrator should know (assumptions, gaps)' },
  },
}

const results = await parallel([
  () => agent(VERIFIER,  { label: 'verifier+tests', phase: 'Build modules', schema: MANIFEST_SCHEMA }),
  () => agent(KB,        { label: 'kb seed+rubric',  phase: 'Build modules', schema: MANIFEST_SCHEMA }),
  () => agent(PROVIDERS, { label: 'provider layer',  phase: 'Build modules', schema: MANIFEST_SCHEMA }),
  () => agent(RANK,      { label: 'swap-c ranking',  phase: 'Build modules', schema: MANIFEST_SCHEMA }),
])

return { built: results.filter(Boolean) }
