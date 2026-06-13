export const meta = {
  name: 'hse-designs-logs-sidebyside',
  description: 'Design tab: three designs on the left, System Logs on the right at the Requirement width',
  phases: [
    { title: 'Implement', detail: 'refactor DesignTab into a 2-col work area (designs | logs)' },
    { title: 'Verify', detail: 'typecheck + build + no-logic-change checks' },
  ],
}

const ROOT = 'C:\\Users\\navan\\RF\\Claude_Fable_Build\\System-Explorer'
const FILE = `${ROOT}\\components\\DesignTab.tsx`

phase('Implement')

const IMPL = `
Refactor the LAYOUT of ${FILE} (layout/JSX + inline styles ONLY — no logic changes). Read it first.

CURRENT top-to-bottom order of the returned JSX:
  1. TOP ROW: a 2-col grid (gridTemplateColumns "1.5fr 1fr") = [ <ExampleGallery/> (left) | Requirement
     intake card (right: textarea + "AI model:" select + Run button) ].
  2. <Telemetry ... running={running} /> (currently FULL WIDTH, labeled "System Logs").
  3. <LearningPanel prefs={prefs} /> (full width).
  4. A header block ("2 · THREE CANDIDATE DESIGNS" + THREE_DESIGNS_BLURB) then the THREE design cards in a
     grid (gridTemplateColumns "1fr 1fr 1fr").
  5. The choice bar (only when {run}).

DESIRED new order:
  1. TOP ROW: unchanged — [ ExampleGallery (left) | Requirement card (right) ] at "1.5fr 1fr".
  2. A NEW "work area" 2-col grid using the SAME column template "1.5fr 1fr" with alignItems:"start" and the
     same 16px gap, so its columns line up under the top row:
       - LEFT column (the 1.5fr, under the gallery): the "2 · THREE CANDIDATE DESIGNS" header + blurb, then
         the three design cards. The three cards now live INSIDE this left column, so their inner grid should
         become "1fr 1fr 1fr" within the (narrower) left column — keep all three side by side; let the cards
         get narrower but stay legible (they contain Scorecard, Bom, RubricChecklist).
       - RIGHT column (the 1fr, under the Requirement — so the logs are the SAME WIDTH as the Requirement
         section and aligned beneath it): the <Telemetry ... running={running} /> panel. Give it a tall,
         prominent height so it shows many streaming lines next to the designs (e.g. height ~560, and make
         the right column sticky to the top — position:"sticky", top:16 — so the logs stay in view while the
         user scrolls the designs). The Telemetry events source and running prop must be preserved exactly.
  3. The choice bar (when {run}) — FULL WIDTH, below the work area (unchanged content).
  4. <LearningPanel prefs={prefs} /> — FULL WIDTH, below the choice bar (unchanged content).

The goal: the user sees the three designs (left) and the live System Logs (right, requirement-width) AT THE
SAME TIME while a run streams.

HARD CONSTRAINTS:
- Change ONLY JSX structure + inline style layout. Do NOT change logic, state, hooks, handlers (onRun,
  loadExample, confirmChoice), the events/run wiring, the Telemetry props (events=..., running={running}),
  PROFILE_META usage, the per-card live coverage/progress rendering, identifiers, or imports of logic.
- Keep using existing CSS classes/vars + inline styles. Don't touch other files. Spelling "Rapidflare".
- After editing: cd "${ROOT}"; npx tsc --noEmit — iterate until clean (0 errors).
Return { summary, tscPassed, notes }.`

const impl = await agent(IMPL, { label: 'designs-logs-layout', phase: 'Implement', agentType: 'general-purpose', schema: {
  type: 'object', additionalProperties: false,
  required: ['summary', 'tscPassed'],
  properties: { summary: { type: 'string' }, tscPassed: { type: 'boolean' }, notes: { type: 'string' } },
} })

phase('Verify')

const VERIFY = `
Verify the Design tab layout refactor in ${FILE}. In "${ROOT}" (PowerShell), do ALL:
1. npx tsc --noEmit — pass/fail + errors.
2. npx next build — pass/fail + errors (no dev server is running; safe).
3. git status --porcelain — confirm the ONLY changed file is components/DesignTab.tsx; flag any other.
4. Read ${FILE} and confirm (report each true/false):
   - <Telemetry ... running={running} /> still rendered exactly once, with events from the same expression.
   - streamRun(...) still called with { requirement, model, rubric }.
   - The three design cards still map over (run ? orderedCandidates : PROFILES) and render Scorecard/Bom/RubricChecklist.
   - <LearningPanel prefs={prefs} /> still rendered once; choice bar still gated by {run}.
   - There is a 2-col work-area grid (template "1.5fr 1fr") containing the designs on the left and Telemetry on the right.
Return { tscPassed, buildPassed, onlyDesignTabChanged, checks (string), issues (array) }.`

const verify = await agent(VERIFY, { label: 'verify', phase: 'Verify', agentType: 'general-purpose', schema: {
  type: 'object', additionalProperties: false,
  required: ['tscPassed', 'buildPassed'],
  properties: {
    tscPassed: { type: 'boolean' }, buildPassed: { type: 'boolean' },
    onlyDesignTabChanged: { type: 'boolean' }, checks: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } },
  },
} })

return { impl, verify }
