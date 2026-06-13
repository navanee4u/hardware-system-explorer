# Hardware System Explorer

A tradeoff-ranking hardware architect. Given a hardware requirement, it generates **three complete, verified system designs** — each tuned to a different SWAP-C tradeoff (Size, Weight, Power, Cost) — ranks them, lets a human choose the winner, **learns from that choice**, and **shows every step of its work live**.

**Live:** https://hardware-system-explorer.vercel.app

## What it does

1. A requirement becomes a machine-checkable **rubric**.
2. The agent generates **three designs** (Efficiency / Compact / Value), each gated by every hard constraint.
3. A deterministic **verifier** — never the LLM — decides every pass/fail.
4. The three are **ranked** by a transparent SWAP-C scorecard.
5. A human **picks a winner** (or rejects all) with optional notes.
6. The choice is **distilled into preferences** that reshape the next run's ranking — the agent's #1 converges on the human's taste over time.
7. Every backend action streams live over **SSE**.

## Architecture

- **Verifier** (`lib/verifier.ts`) — deterministic source of truth; pure functions over `(BOM, Rubric)`. No LLM.
- **Proposer** — deterministic (`lib/proposer.ts`) and LLM (`lib/proposer.llm.ts`), profile- and preference-biased.
- **Inner loop** (`lib/loop.ts`) — propose → verify → revise until 100% hard coverage, then score + rank.
- **Outer loop** (`lib/preferences.ts`) — distill decisions into durable preferences; consult at run start.
- **Provider layer** (`lib/providers/`) — pluggable component sourcing (KB / web search / Rapidflare), KB-first with fallback.
- **Store** (`lib/store.ts`, `lib/store.postgres.ts`) — `FileStore` (local) or `PostgresStore` (Supabase/Neon/Vercel), swappable.
- **UI** — Next.js 15 App Router, four tabs (Design, Past Designs, Components, Model Comparison).

The verifier owns feasibility; learned preferences only reorder *feasible* designs — they can never admit an infeasible one.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # verifier + golden run (62 tests)
npm run golden       # the CI gate: 3 ranked feasible candidates + learning reorders the next run
```

## Environment

Copy `.env.example` to `.env.local` and fill in as needed. All keys are optional — absent keys degrade gracefully (deterministic proposer, file-based store).

| Var | Effect when set |
| --- | --- |
| `ANTHROPIC_API_KEY` | enables the LLM proposer + web-search provider (else deterministic + KB only) |
| `POSTGRES_URL` | durable Postgres store (Supabase IPv4 pooler URL) instead of local files |
| `RAPIDFLARE_API_KEY` / `RAPIDFLARE_API_BASE` | activates the Rapidflare component provider |
| `PG_POOL_MAX` | per-instance Postgres pool size (1 for serverless) |

Helper scripts: `npm run db:check` (Supabase health) and `node scripts/db-reset.mjs` (clear tables).

## Deployment

Deployed on Vercel; durable state in Supabase Postgres. Pushes to `main` auto-deploy.

> Built with [Claude Code](https://claude.com/claude-code).
