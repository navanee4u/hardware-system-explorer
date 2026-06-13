export const meta = {
  name: 'hse-ui-clarity-polish',
  description: 'Polish copy + legibility across the app so a 60-second judge instantly understands it',
  phases: [
    { title: 'Polish', detail: '5 agents, disjoint files — descriptive copy, bigger text, clear profile names' },
    { title: 'Verify', detail: 'typecheck + production build + no-logic-change checks' },
  ],
}

const ROOT = 'C:\\Users\\navan\\RF\\Claude_Fable_Build\\System-Explorer'

const SPEC = `
CONTEXT: "Hardware System Explorer" web app (Next.js 15 + TS, Rapidflare brand). A HACKATHON JUDGE will
look at this UI for ~60 SECONDS and must instantly understand it. Right now the copy is too terse — e.g.
the three result columns are labeled only "Efficiency", "Compact", "Value" with no hint that they are
THREE ALTERNATIVE DESIGNS of the same system. Your job: make the text self-explanatory and more legible.

SINGLE SOURCE OF TRUTH (already created — import it, do NOT redefine):
  import { PROFILE_META, THREE_DESIGNS_BLURB } from "@/lib/profiles";
  PROFILE_META[profile] => { label, tagline, description, color }  (Profile = "Efficiency"|"Compact"|"Value")
Wherever a bare profile name is shown as a heading/label, show PROFILE_META[p].label PLUS its .tagline
(e.g. "Efficiency — Lowest power · longest runtime"), and surface .description as a subtitle or title=
tooltip where there's room. Where the three columns/designs are introduced, use THREE_DESIGNS_BLURB so it's
obvious they're 3 ranked alternatives that all pass the hard requirements.

CLARITY RULES:
- Expand terse eyebrows/labels into descriptive ones (keep the bracketed [ … ] eyebrow style if present),
  e.g. "[ REQUIREMENT ]" -> "[ 1 · YOUR REQUIREMENT ]", "[ LEARNING ]" -> "[ WHAT THE SYSTEM HAS LEARNED ]".
  Add short helper sentences under section headers explaining what the user is looking at.
- Buttons/CTAs say what happens: e.g. "Run — generate 3 ranked designs".
- LEGIBILITY: bump small font sizes up. No body/label text below ~12px; primary copy 14-15px; section
  helper text ~12.5-13px. Increase line-height where dense. Keep layout intact (don't break grids/columns).
- Keep the Rapidflare aesthetic (sky #0284c7, violet #6048f0, zinc neutrals, mono for data). Spelling:
  "Rapidflare" (one word, capital R only) — never "RapidFlare".

HARD CONSTRAINTS:
- Read each file before editing. Change ONLY user-facing TEXT, labels, helper copy, tooltips, and
  font-size/line-height/spacing styles. Do NOT change logic, state, hooks, handlers, props, data shapes,
  identifiers, imports of logic, API calls, or component behavior. No renamed/removed variables.
- Do NOT edit files outside your assigned list. Other agents own the others.
- After editing, run (PowerShell): cd "${ROOT}"; npx tsc --noEmit  — and iterate until your files compile
  clean (0 errors). (A clean full-project tsc is fine; siblings are complete.)
Return { files (array), changes (short bullet summary string), tscPassed (bool) }.
`

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['files', 'tscPassed'],
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    changes: { type: 'string' },
    tscPassed: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

const AGENTS = [
  {
    label: 'design-tab',
    files: [`${ROOT}\\components\\DesignTab.tsx`],
    focus: `THE HERO TAB — most important. (a) Above the three result columns, add a clear intro line using
      THREE_DESIGNS_BLURB. (b) Each of the three column headers must show PROFILE_META[profile].label + its
      .tagline (so "Efficiency — Lowest power · longest runtime"), with .description as a title tooltip; keep
      the rank badge. (c) Make the requirement intake, model selector, and Run button self-explanatory
      (label the model dropdown e.g. "AI model:", helper under the requirement box like "Describe your
      hardware system, or pick an example above."). (d) Clarify the choice bar ("Pick the winning design —
      the system learns from your choice") and the learning panel header. (e) Bump font sizes for legibility.`,
  },
  {
    label: 'shell-and-css',
    files: [`${ROOT}\\app\\page.tsx`, `${ROOT}\\app\\globals.css`],
    focus: `(a) page.tsx: keep the H1 but add a one-line plain-English subtitle under it explaining the app
      ("Describe a hardware system; get three verified, ranked designs; pick one and the system learns your
      preferences."). Make tab labels clear (e.g. "Model Comparison" stays; consider "Self-Learning" ->
      "What It Learned"). Slightly enlarge the H1 and tab text. (b) globals.css: raise the base/body font
      size for legibility (e.g. body to ~15px), nudge up small utility classes (.eyebrow, .col-tag, table
      cells) so nothing is tiny, increase default line-height a touch. Do NOT break the layout or remove
      classes — only adjust sizes/line-heights/weights. PROFILE_META not needed here unless useful.`,
  },
  {
    label: 'ui-and-gallery',
    files: [`${ROOT}\\components\\ui.tsx`, `${ROOT}\\components\\ExampleGallery.tsx`],
    focus: `(a) ui.tsx: the Scorecard renders SWAP-C sub-scores — make the axis labels descriptive and
      readable (Size, Weight, Power/endurance, Cost, Margin/headroom) with a tiny "higher = better" hint,
      and ensure the composite is clearly labeled "Overall score". RankBadge: keep #1/#2/#3 but make the #1
      read as the recommended pick (e.g. a "Best" cue). Bom: a clear "Bill of materials" heading; label the
      provenance badges meaning (kb/web/rapidflare = where the part came from). RubricChecklist: a heading
      like "Requirement checks" + show coverage as e.g. "11/12 hard requirements met". (b) ExampleGallery:
      make the header explain these are starting-point examples ("Start from an example system"). Bump small
      text. Use PROFILE_META where a profile is shown.`,
  },
  {
    label: 'past-components-telemetry',
    files: [`${ROOT}\\components\\PastDesignsTab.tsx`, `${ROOT}\\components\\ComponentsTab.tsx`, `${ROOT}\\components\\Telemetry.tsx`],
    focus: `Add descriptive intros + clearer column/label copy and bigger text. PastDesignsTab: header
      explains "Every past run — the three designs, the human's pick, and the full replay." ComponentsTab:
      explain it's "the growing library of every real part discovered across runs" and clarify the source
      badges. Telemetry: a clear header like "Live activity — everything the engine is doing right now" and
      a one-line legend for the event types/colors so a newcomer knows what they're watching. Use
      PROFILE_META[p].label where a profile name is shown.`,
  },
  {
    label: 'modelcompare-learning',
    files: [`${ROOT}\\components\\ModelComparisonTab.tsx`, `${ROOT}\\components\\LearningTab.tsx`],
    focus: `Tighten copy + legibility (LearningTab is already verbose — light touch, mainly bump sizes and
      make sure profile names use PROFILE_META.label + tagline in the design-example headers and tables).
      ModelComparisonTab: add a plain intro ("How the different AI models compare at producing the best
      designs — same requirement, different model.") and make chart/section captions readable; ensure each
      profile reference uses PROFILE_META. Bump small fonts.`,
  },
]

phase('Polish')
const results = await parallel(
  AGENTS.map((a) => () =>
    agent(`${SPEC}\n\n=== YOUR FILES (edit ONLY these) ===\n${a.files.join('\n')}\n\n=== YOUR FOCUS ===\n${a.focus}`, {
      label: a.label,
      phase: 'Polish',
      agentType: 'general-purpose',
      schema: SCHEMA,
    }),
  ),
)

phase('Verify')
const VERIFY = `
Verify the UI copy/legibility polish across the app is correct and safe.
Do ALL of, in "${ROOT}" (PowerShell):
1. npx tsc --noEmit  — record pass/fail + any errors.
2. npx next build    — record pass/fail + any errors (no dev server is running, safe).
3. git status --porcelain — list changed files; the ONLY changed files should be:
   components/DesignTab.tsx, app/page.tsx, app/globals.css, components/ui.tsx, components/ExampleGallery.tsx,
   components/PastDesignsTab.tsx, components/ComponentsTab.tsx, components/Telemetry.tsx,
   components/ModelComparisonTab.tsx, components/LearningTab.tsx  (lib/profiles.ts already existed). Flag any
   OTHER changed file (e.g. anything in lib/ besides profiles.ts, or app/api/*) as a problem.
4. Spot-check: grep that PROFILE_META is imported/used in DesignTab.tsx; that streamRun is still called with
   { requirement, model, rubric } in DesignTab.tsx; that no api.* call signatures changed.
Return { tscPassed, buildPassed, changedFiles (array), unexpectedFiles (array), checks (string), issues (array) }.
`
const verify = await agent(VERIFY, { label: 'verify', phase: 'Verify', agentType: 'general-purpose', schema: {
  type: 'object', additionalProperties: false,
  required: ['tscPassed', 'buildPassed'],
  properties: {
    tscPassed: { type: 'boolean' }, buildPassed: { type: 'boolean' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    unexpectedFiles: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } },
  },
} })

return { polish: results.filter(Boolean), verify }
