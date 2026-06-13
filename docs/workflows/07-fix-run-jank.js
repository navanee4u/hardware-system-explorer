export const meta = {
  name: 'hse-fix-run-jank',
  description: 'Fix Design-tab layout jankiness that appears after clicking Run (double brackets + cramped design cards)',
  phases: [
    { title: 'Fix', detail: 'reproduce in-browser, fix double-bracket eyebrows + cramped design cards' },
    { title: 'Verify', detail: 'fresh build + typecheck + checks' },
  ],
}

const ROOT = 'C:\\Users\\navan\\RF\\Claude_Fable_Build\\System-Explorer'

phase('Fix')

const FIX = `
Fix layout JANKINESS on the Design tab of this Next.js 15 app that appears AFTER the user clicks
"Run — generate 3 ranked designs". On initial load the page looks fine; after Run the layout goes off.
Primary file: ${ROOT}\\components\\DesignTab.tsx (also ${ROOT}\\components\\ui.tsx and ${ROOT}\\app\\globals.css if needed).

CONFIRMED DEFECTS TO FIX (seen in screenshots):

1) DOUBLE-BRACKETED SECTION HEADERS. The shared CSS class ".eyebrow" ALREADY injects "[ " and " ]" via
   ::before / ::after pseudo-elements. Several eyebrow strings in DesignTab.tsx ALSO contain literal
   brackets, so they render as "[ [ 2 · THREE CANDIDATE DESIGNS ] ]". Remove the LITERAL brackets from
   every <span className="eyebrow"> text in DesignTab.tsx so they read single-bracketed, e.g.
   "[ 1 · YOUR REQUIREMENT ]" not "[ [ 1 · YOUR REQUIREMENT ] ]". Affected eyebrows include:
   "1 · YOUR REQUIREMENT", "2 · THREE CANDIDATE DESIGNS", "3 · PICK THE WINNING DESIGN",
   "WHAT THE SYSTEM HAS LEARNED", "PREFERENCES DISTILLED FROM YOUR CHOICE".
   Then GREP all components for the same double-bracket bug (literal "[" inside any className="eyebrow"
   text) and fix any others you find. (Telemetry's "SYSTEM LOGS …" is already correct — leave it.)

2) CRAMPED / JANKY DESIGN CARDS AFTER RUN. The three design cards live in the LEFT column of a
   "1.5fr 1fr" side-by-side grid (designs left, sticky System Logs right), so each card is only ~230px
   wide. After Run:
   - the profile label and the live status ("proposing"/"feasible") collide on one line (renders like
     "Efficiency^proposing"); the rank badge / status should sit cleanly (own line or a tidy chip), never
     overlapping or crammed against the label;
   - the tagline and the "… · 0% coverage" / "… · 100% coverage" status text wrap awkwardly into many
     short lines;
   - once the full Scorecard + Bom + RubricChecklist stream in, the content is too dense for ~230px and
     overflows / wraps badly; verbose labels added recently (e.g. "SWAP-C sub-scores — higher = better
     (0–1)") wrap into a mess at this width.
   FIX so the three cards are clean and legible at this narrow width across ALL states (initial / streaming
   / completed): tidy the card header (label + tagline stacked; rank/status on its own line or as a small
   chip; never overlapping), make the live coverage row compact, prevent text overflow, and condense or
   wrap the dense Scorecard/Bom/RubricChecklist labels so nothing clips. Eliminate layout shift between the
   landing state and the post-Run state. You MAY adjust the column ratio (e.g. "1.7fr 1fr") and per-card
   spacing/font-size for legibility, BUT keep the designs-LEFT / System-Logs-RIGHT side-by-side intent and
   the sticky logs column. Ensure NO horizontal scrollbar / overflow at desktop width.

REPRODUCE + VERIFY IN-BROWSER (do this — it's a visual bug):
  - Use the Claude_Preview MCP tools (load their schemas via ToolSearch: query "select:mcp__Claude_Preview__preview_start,mcp__Claude_Preview__preview_eval,mcp__Claude_Preview__preview_resize,mcp__Claude_Preview__preview_screenshot,mcp__Claude_Preview__preview_console_logs").
  - preview_start name "hse"; preview_resize width 1320 height 900; load the Design tab.
  - In the model <select>, set value "deterministic" (use the native value setter + dispatch a bubbling
    'change' event), then click the Run button. Wait ~5s (deterministic completes fast).
  - Inspect: confirm single-bracket headers, no overlapping label/status, no clipped/overflowing card text,
    no horizontal scroll, and designs + logs both visible and tidy. Iterate on the CSS until clean.
  - When done, STOP your dev server (preview_stop or kill the port) so the next phase can build cleanly.

CONSTRAINTS: change layout/CSS + minimal JSX only. Do NOT change logic, state, hooks, handlers, the
streamRun({requirement,model,rubric}) call, Telemetry props (events, running), PROFILE_META usage, or the
candidate/run data flow. No renamed/removed identifiers. Spelling "Rapidflare". Run npx tsc --noEmit clean.
Return { summary, filesChanged (array), tscPassed, browserVerified (bool), notes }.`

const fix = await agent(FIX, { label: 'fix-jank', phase: 'Fix', agentType: 'general-purpose', schema: {
  type: 'object', additionalProperties: false,
  required: ['summary', 'tscPassed'],
  properties: { summary: { type: 'string' }, filesChanged: { type: 'array', items: { type: 'string' } }, tscPassed: { type: 'boolean' }, browserVerified: { type: 'boolean' }, notes: { type: 'string' } },
} })

phase('Verify')

const VERIFY = `
Verify the Design-tab jank fix. In "${ROOT}" (PowerShell), do ALL:
1. Ensure no 'next dev' server is running, then: Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
2. npx tsc --noEmit  — pass/fail + errors.
3. npx next build    — pass/fail + errors.
4. Grep for the double-bracket bug: in every components/*.tsx, no string passed as <span className="eyebrow">
   text should contain a literal "[" or "]" (the CSS adds them). Report any remaining offenders.
5. Read components/DesignTab.tsx and confirm still intact: streamRun(...) called with { requirement, model,
   rubric }; <Telemetry ... running={running} /> once; three design cards map over (run ? orderedCandidates
   : PROFILES) rendering Scorecard/Bom/RubricChecklist; <LearningPanel prefs={prefs}/> once; the designs-left
   / logs-right "Nfr 1fr" work-area grid is still present.
6. git status --porcelain — list changed files (expected: components/DesignTab.tsx and possibly
   components/ui.tsx and/or app/globals.css). Flag anything else.
Return { tscPassed, buildPassed, doubleBracketOffenders (array), changedFiles (array), checks (string), issues (array) }.`

const verify = await agent(VERIFY, { label: 'verify', phase: 'Verify', agentType: 'general-purpose', schema: {
  type: 'object', additionalProperties: false,
  required: ['tscPassed', 'buildPassed'],
  properties: {
    tscPassed: { type: 'boolean' }, buildPassed: { type: 'boolean' },
    doubleBracketOffenders: { type: 'array', items: { type: 'string' } },
    changedFiles: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } },
  },
} })

return { fix, verify }
