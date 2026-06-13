# Multi-agent workflow scripts

The actual scripts Claude Code (Opus 4.8) ran to build this project. Each is a deterministic
orchestration that fans work out across parallel sub-agents against frozen contracts, then verifies
the result (typecheck + production build + golden-run gate) before it lands.

| # | Script | What it orchestrated |
|---|--------|----------------------|
| 01 | [`01-spine-fanout.js`](01-spine-fanout.js) | 4 parallel agents build the deterministic spine — verifier+tests, seed KB, provider layer, SWAP-C ranking — against frozen contracts |
| 02 | [`02-ui-tabs.js`](02-ui-tabs.js) | 3 agents build the read-only tabs (Past Designs, Components, Model Comparison) on a shared UI foundation |
| 03 | [`03-example-art.js`](03-example-art.js) | 10 agents author cohesive SVG hero illustrations for the example gallery |
| 04 | [`04-move-requirement.js`](04-move-requirement.js) | implement → verify: relocate the requirement intake |
| 05 | [`05-ui-clarity-polish.js`](05-ui-clarity-polish.js) | 5 agents polish copy + legibility across every tab against one clarity contract |
| 06 | [`06-designs-logs-sidebyside.js`](06-designs-logs-sidebyside.js) | implement → verify: three designs left, live System Logs right |
| 07 | [`07-fix-run-jank.js`](07-fix-run-jank.js) | reproduce-in-browser → fix → verify: layout fixes after Run |

Strategy: a frozen brief + rubric ([`../../CLAUDE.md`](../../CLAUDE.md)), contracts authored first,
then **freeze-contracts-then-fan-out** workflows with an **implement → verify** pattern, and a
**deterministic verifier + golden run** as the source of truth that gates every change.
