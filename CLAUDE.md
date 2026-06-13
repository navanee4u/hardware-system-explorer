# CLAUDE.md — Hardware System Explorer
> A tradeoff-ranking hardware architect.
> Build brief + persistent guidance for Claude Code.
> One line: *Given a hardware requirement, the system generates three complete, verified
> system designs — each tuned to a different SWAP-C tradeoff — ranks them, lets a human
> choose the winner, learns from that choice, and shows every step of its work live.*
>
> This file is both the build brief and the rubric Claude Code was given.

---

## 0. What this is and is NOT
- An **autonomous design agent that produces ranked alternatives, learns from human choices, and
  shows its work.** Three things are the product: (1) **three verified designs ranked by SWAP-C
  tradeoff**, (2) a **human-in-the-loop choice the system learns from**, and (3) a **live window
  into everything the agent does**.
- It is **NOT a dashboard** and **NOT a single-answer generator.** The value is *choice with
  evidence, then learning from the choice*.
- **Non-negotiable:** simplicity is the result of profound thought. Minimal files, thin glue, one
  place where the real IP lives (the loop + verifier + provider layer).

## 1. The brief (problem / user / done)
**Problem.** Specifying hardware means balancing **SWAP-C** — Size, Weight, Power, Cost — against
dozens of hard constraints. There is rarely one right answer; there are tradeoffs.
**User.** A hardware engineer who has *requirements* and wants *ranked, defensible options* — fast,
with the work shown — and a tool that **gets better the more they use it.**
**Done.** Requirement → machine-checkable rubric → **three complete designs**, each optimized for a
different SWAP-C profile and each gated by all hard constraints → **ranked** with per-design
scorecards → the **human picks a winner** (with optional notes) → that decision is **recorded and
distilled into preferences that improve the next run.** Throughout, a **live telemetry stream** of
every backend action.

## 2. Core architecture (deliberately minimal)
- **Proposer (LLM).** Selects/revises components for a SWAP-C profile via the provider layer,
  pre-loaded with learned preferences. *Never* judges its own pass/fail.
- **Verifier (deterministic, no LLM).** `(BOM, Rubric)` → per-constraint result. The **single
  source of truth.**
- **Provider layer (pluggable).** Uniform interface over component sources (Rapidflare API, web
  search, KB). Every call logged + streamed.

**Inner loop** (per SWAP-C profile): propose BOM → verify → feed failures back → re-source + revise
→ repeat until all HARD constraints pass or MAX_ITERS; then score + rank the three.

**Outer loop** (across runs): human picks a winner (+ notes) → record decision → distill into
preferences → consult at the start of the next run → the agent's #1 converges on the human's taste.

## 3. Three-candidate SWAP-C generation & ranking
Produce **exactly three** complete designs — default profiles **Efficiency / Compact / Value**
(configurable). All three must pass every HARD constraint or be reported *infeasible* with the
specific failing constraint. Score each with a transparent SWAP-C scorecard; rank #1/#2/#3 by
composite; the human makes the final call. Profiles + weights are data-driven.

## 4. Human choice & the outer improvement loop
Capture the choice as a first-class action; persist a **DecisionRecord** (agent #1 vs human pick,
agreed?, notes). Distill into durable **Preferences** (ranking-weight nudges, proposer bias).
**Disagreement is the strongest signal.** Load preferences at the start of every run. Track an
**agreement rate** trending up. **Hard rule:** preferences shape *soft* scoring/bias only — they
never override the verifier's hard-constraint gate.

## 5. Modular component sourcing — the provider layer
`ComponentProvider { name; available(); search(query) }`. Implementations: **KBProvider** (local
curated parts), **WebSearchProvider** (LLM web_search, honest specs), **RapidflareProvider** (calls
a Rapidflare component API; clean adapter; falls back if creds absent). A **ProviderRegistry** with
per-run config (enabled providers, priority, dedup by part number). Provenance shows on every part.

## 6. Data contracts (define first)
Components, rubric (Constraint[]), BOM, Check, ScoreCard, Profile, Candidate, DesignRun,
DecisionRecord, Preference, Event. The contract every module shares.

## 7. The verifier (source of truth)
Deterministic pure functions over `(BOM, Rubric)`, **no LLM.** Hard checks: power budget; peak
power per rail (P=I·V); voltage rails; endurance (Wh/avg W ≥ runtime); thermal; mass; size/packing;
compute (TOPS + RAM); sensing (resolution/fps + lanes); comms (chains/band); actuation (torque +
driver vs stall current); connectors (mating pairs); environment (IP rating). **Unit-test a pass +
fail case for every constraint.** The verifier — never the LLM, never a learned preference —
decides pass/fail. Always.

## 8. Live observability — log & stream EVERYTHING
Emit a structured event for every meaningful action, streamed to the UI over **SSE** and persisted
per run. Event types include run.start, rubric.built, preferences.consulted, candidate.start,
provider.query, provider.result, part.selected, model.call, verify.result, constraint.fail,
fix.swap, candidate.pass, candidate.infeasible, rank.assigned, run.done, human.choice,
preference.distilled. Log everything to disk/store. The stream is per-candidate.

## 9. UI — tabs
**Design** (requirement intake; three system columns with BOM + scorecard + rank; rubric checklist;
choice bar; live telemetry; learning panel), **Past Designs**, **Components** (growing library),
**Model Comparison** (how Claude models differ — bench mode). Aesthetic: Rapidflare design language
(light theme, sky-blue `#0284c7`, violet `#6048f0`, zinc scale, Geist / Geist Mono, bracketed
`[ EYEBROW ]` labels).

## 10. Persistence & the growing library
Every run persisted as a **DesignRun** (candidates incl. iterations/tokens/latency + model, full
telemetry, all provider/model I/O, DecisionRecord). **Preferences** persist as their own growing
set. Discovered components accumulate into a durable library (dedup by part number). A small
**Store** abstraction: file-based local; durable backend (Postgres) for cloud.

## 11. Model selection (runtime)
Dropdown sets the Claude model per run. Valid IDs: `claude-fable-5`, `claude-opus-4-8`,
`claude-sonnet-4-6`. Read `ANTHROPIC_API_KEY`; if absent, a deterministic proposer closes the loop.
**Bench mode:** run the same requirement across all models — feeds Model Comparison.

## 12. Tech stack + structure
Next.js 15 (App Router) + TypeScript, single deployable app. Backend logic in pure TS modules
(`lib/`) exposed via route handlers; SSE for streaming; Anthropic SDK. Store abstraction so
file/db both work. `lib/{verifier,proposer,loop,rank,preferences}.ts`, `lib/providers/*`,
`lib/store.ts`, `lib/schema.ts`, `tests/`.

## 13. Build sequence
1. Schema + seed KB. 2. Verifier + unit tests (pass+fail per constraint). 3. Provider layer
(registry + KB first). 4. Single-candidate inner loop, deterministic — golden run → 100%.
5. SWAP-C scoring + ranking. 6. Telemetry + SSE. 7. Human choice + outer loop (distill →
consult → weights flow into ranking). 8. LLM proposer (model-selectable, preference-aware).
9. UI tabs. 10. Persistence/Store + component library. 11. Polish + deploy. Wire a **golden run**
into CI: a fixed requirement yields 3 feasible, correctly-ranked candidates; a fixed decision
distills a preference that demonstrably changes the next run's ranking.

## 15. Guardrails — what NOT to do
- Don't let the LLM decide pass/fail. The **verifier** decides. Always.
- Don't let learned **preferences override hard constraints** — they reorder *feasible* designs only.
- Don't return one answer — always three, gated identically, ranked transparently. Report infeasible
  profiles honestly; never fabricate a passing design.
- Don't drop the human in the loop — capture choice + notes; record disagreement and rejected-all.
- Don't hardcode component sourcing — go through the provider layer.
- Don't hide the work — stream and log everything.
- Don't invent specs. Real parts only, with provenance.
- Simplicity is the result of profound thought.

---

> Built with Claude Code (Opus 4.8). The multi-agent workflow scripts Claude ran to build this are in
> [`docs/workflows/`](docs/workflows/).
