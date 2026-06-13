export const meta = {
  name: 'hse-move-requirement',
  description: 'Move the requirement intake box to the top-right, beside the 3 example images, on the Design tab',
  phases: [
    { title: 'Implement', detail: 'refactor DesignTab top layout: gallery + requirement side-by-side' },
    { title: 'Verify', detail: 'typecheck + confirm no behavior dropped' },
  ],
}

const ROOT = 'C:\\Users\\navan\\RF\\Claude_Fable_Build\\System-Explorer'
const FILE = `${ROOT}\\components\\DesignTab.tsx`

phase('Implement')

const IMPL = `
You are refactoring ONE file's LAYOUT only (no logic changes): ${FILE}

GOAL: Move the "Requirement" intake box to the TOP, RIGHT NEXT TO the 3 example images.
Currently the Design tab renders, top to bottom:
  1. <ExampleGallery ... />            (full-width card with the 3 example image cards)
  2. a 2-col grid: [ Requirement card (textarea + model <select> + Run button) | <LearningPanel/> (320px) ]
  3. the three system columns, 4. choice bar, 5. <Telemetry/>

CHANGE IT TO:
  1. A TOP ROW that is a 2-column grid placing the ExampleGallery on the LEFT and the Requirement
     intake card on the RIGHT, side by side. Use e.g. gridTemplateColumns: "1.5fr 1fr" (gallery wider,
     requirement narrower) with the same 16px gap, and align them at the top. The Requirement card keeps
     its textarea, the model <select>, the Run button, and the "no API key" hint exactly as-is.
  2. Move <LearningPanel prefs={prefs} /> OUT of the old requirement row into its own full-width row
     placed IMMEDIATELY BELOW the top row (before the three system columns).
  3. Everything else (three system columns grid, choice bar, live Telemetry) stays exactly as-is and in
     the same order after the learning panel.

HARD CONSTRAINTS:
- Read the file first. Change ONLY JSX structure / inline style layout. Do NOT change any logic, state,
  hooks, handlers (loadExample, onRun, confirmChoice), the rubric threading, the model selector, the
  ExampleGallery props (onSelect=loadExample, activeId=activeExample), the LearningPanel component
  definition, or the Telemetry usage. No renamed/removed identifiers.
- Keep it responsive-friendly and use only existing CSS classes/vars + inline styles (match the file's style).
- Do NOT edit any other file. Brand is spelled "Rapidflare".
- After editing, run (PowerShell): cd "${ROOT}"; npx tsc --noEmit   — iterate until it exits clean (0 errors).

Return { summary, tscPassed, linesChanged }.`

const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'tscPassed'],
  properties: {
    summary: { type: 'string' },
    tscPassed: { type: 'boolean' },
    linesChanged: { type: 'number' },
    notes: { type: 'string' },
  },
}

const impl = await agent(IMPL, { label: 'layout-refactor', phase: 'Implement', agentType: 'general-purpose', schema: IMPL_SCHEMA })

phase('Verify')

const VERIFY = `
Verify the layout refactor of ${FILE} preserved all behavior and compiles.

Do ALL of:
1. cd "${ROOT}"; npx tsc --noEmit  — record pass/fail and any errors.
2. Read ${FILE} and confirm ALL of these are still present and wired (report each true/false):
   - imports + use of <ExampleGallery onSelect={loadExample} activeId={activeExample} />
   - loadExample sets requirement + rubric + activeExample
   - streamRun(...) is called with { requirement, model, rubric } (rubric still threaded)
   - <LearningPanel prefs={prefs} /> is rendered exactly once
   - the three system columns still map over candidates/PROFILES
   - the choice bar (Confirm choice) and <Telemetry .../> still render
   - the new TOP ROW puts ExampleGallery and the Requirement card side-by-side (2-col grid)
3. Confirm no other files were modified (git status --porcelain should show only DesignTab.tsx; run: cd "${ROOT}"; git status --porcelain).

Return { tscPassed, allChecksPass, failingChecks (array of strings), otherFilesTouched (array), notes }.`

const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['tscPassed', 'allChecksPass'],
  properties: {
    tscPassed: { type: 'boolean' },
    allChecksPass: { type: 'boolean' },
    failingChecks: { type: 'array', items: { type: 'string' } },
    otherFilesTouched: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const verify = await agent(VERIFY, { label: 'verify', phase: 'Verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA })

return { impl, verify }
