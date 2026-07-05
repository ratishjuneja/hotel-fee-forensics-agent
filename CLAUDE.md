# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository.

## ⚠️ Non-negotiable requirements (Vultr) — read first

The full sponsor "Developer Expectations" live in **[`docs/Rules.md`](docs/Rules.md)** (the
source of truth). We keep drifting off these, so they are restated here where every agent
sees them. **Do not deviate without the human's explicit say-so.**

- **VultronRetriever via Vultr Serverless Inference is THE model.** All core LLM reasoning
  and document retrieval go through VultronRetriever models on Vultr Serverless Inference
  (OpenAI-compatible). Other models are allowed ONLY for chat facilitation / UI / secondary
  tasks — **never in the audit path**. The pipeline's only model is the VultronRetrieverPrime
  reranker on `/v1/rerank` (it scores, it never generates); everything else is deterministic
  code.
- **Persistence runs on Vultr — no in-memory fallback.** Case metadata, parse status,
  assembled input, and audit reports live in **Vultr Managed PostgreSQL**; uploaded files
  live in **Vultr Object Storage**, behind a thin repository layer. In-memory stores that
  stand in for the DB read as "faking it" under open-source judging and are not allowed in
  production code. (Tests may inject an in-memory *fake* repository — that's a legitimate
  test double, not a production path.)
- **Backend deployed on Vultr + a public demo URL.** Deployment is in scope, not optional.
- **No secrets in the repo.** `.env` / keys / credentials never get committed; document env
  vars in `.env.example` only. The account-level `VULTR_API_KEY` stays on the laptop — never
  on the VM or in the repo.
- **Golden regression must never move.** Harborline June-vs-May → **$36,580**; findings
  1980 / 6600 / 28000; confidence **0.96** = [25,25,20,16,10]; memo cites `APPROVAL-0612-03`;
  trace exactly 3 LLM + 7 TOOL badges; the demo run does NOT pause.

## What this is

**FeeForensics** — an owner-side enterprise agent that audits hotel operator fees. It
reads a hotel management agreement (HMA), recalculates fees from monthly operating
statements, finds fee leakage, and generates a cited, dispute-ready audit memo plus a
draft dispute email.

This is a **hackathon project** (20-hour build window). The single most important goal
is a smooth, end-to-end **live demo** of one synthetic hotel case. Demo quality beats
architectural perfection.

One-line pitch: *"Hotel owners pay operators using complex agreements. Our agent reruns
the math, finds leakage, and produces a dispute-ready memo with citations."*

## Hackathon rules — hard constraints

These are non-negotiable. Violating them causes **disqualification**. Keep every
suggestion inside these lines.

- **Public repo, new work only.** All code must be built during the event. Do not import
  an existing project and present it as new. Keep a clear commit history so judges can
  see what was built here.
- **Original contributions must be obvious.** The demo may only highlight features, code,
  and functionality this team built. Do not blur the line between our work and libraries.
- **No rights violations.** Do not use code, data, or assets we don't have rights to. All
  demo documents and financials must be **synthetic** — never real hotel contracts, real
  customer data, or proprietary assets.
- **Vultr must be in the core path.** All LLM calls go through **Vultr Serverless
  Inference** (OpenAI-compatible API). It must not be a decorative add-on. Persistence is
  **required, not stretch**: **Vultr Object Storage** for uploads and **Vultr Managed
  PostgreSQL** for case metadata / reports (no in-memory fallback), plus **Vultr Cloud
  Compute** for deployment. See the non-negotiable section above and `docs/Rules.md`.
- **No secrets in the repo.** Never commit `.env`, API keys, or credentials. Document env
  vars in `.env.example` only.
- **Avoid the banned-project traps.** This must NOT read as a basic RAG app, an image
  analyzer, or (critically) **a dashboard as the main feature**. The agentic multi-step
  workflow and the deterministic calculator are what make it not-a-basic-RAG-app —
  protect that framing in code and UI. Do not let a dashboard become the centerpiece.

## Core design principles

- **Agent, not single-shot RAG.** The system must visibly plan, retrieve documents more
  than once, extract structured rules, call deterministic tools, decide, and only then
  answer. An operational **agent trace** must be visible in the UI.
- **Deterministic math, never LLM arithmetic.** The fee calculator does all arithmetic in
  code. The pipeline's only model is a VultronRetriever reranker (hackathon requirement)
  scoring document chunks for retrieval — it never generates. Rule extraction parses
  clause text deterministically (rates, thresholds, windows, exclusion synonyms) and the
  memo/email render from cited templates. Unit-test the calculator against a known
  expected answer.
- **Everything is cited.** Findings, memo claims, and calculations reference specific
  clauses and financial lines (e.g. `HMA §4.2 — Incentive Fee`). No unsupported claims.
- **Don't hallucinate on missing data.** If a clause or financial input is absent, say
  "clause not found" / "input missing" / "human review required" and lower confidence —
  never invent values.
- **Demo-first.** Prefer a preloaded synthetic case over an upload flow. Prefer a visible
  trace over hidden cleverness. Cut auth, accounts, prod DB, OCR, and heavy charts if time
  is short.

## The audit workflow (agent contract)

The orchestrator should not answer after one retrieval. It follows roughly:

1. **Plan** the investigation.
2. **Retrieve** base-fee and incentive-fee clauses.
3. **Retrieve** revenue definitions and exclusions.
4. **Extract** structured fee rules (JSON).
5. **Retrieve** monthly financial schedules.
6. **Calculate** expected fees (deterministic tool).
7. **Retrieve** prior months and audit-rights clause.
8. **Check** anomalies and pass-through expenses.
9. **Decide** findings (valid / suspicious / needs review).
10. **Generate** the memo and dispute email.

### Leakage scenarios to support (MVP)

1. Excluded revenue included in the fee base (e.g. insurance proceeds, banquet
   cancellation revenue counted in gross operating revenue).
2. Incentive fee calculated on inflated GOP/AGOP (one-time revenue or misclassified
   expense pushes profit over the incentive threshold).
3. Improper pass-through expense (corporate support/software/travel passed through when it
   should be covered by the base fee or required owner approval).

Stretch: wrong revenue base for brand/system fee, capex booked as opex, un-refunded
prior-period adjustment.

## Intended architecture

Recommended stack (see `docs/TechSpec.md` for detail):

- **Frontend:** Next.js + TypeScript + Tailwind, shadcn/ui.
- **Backend:** Fastify + TypeScript + Zod (alt: FastAPI + Pydantic if the team is more
  Python-comfortable — pick one and commit).
- **Inference:** Vultr Serverless Inference (OpenAI-compatible chat completions).
- **Storage (MVP):** local JSON + files under `data/demo/`. Stretch: Vultr Object Storage
  / Managed PostgreSQL.

Planned layout (not yet built):

```text
hotel-fee-forensics-agent/
  apps/
    web/            # Next.js frontend  (Person B)
    api/            # Fastify backend   (Person A)
  packages/
    agent/          # orchestrator + tools (Person A)
    shared/         # shared types
  data/demo/        # synthetic case + financial CSVs (Person C)
  docs/             # planning docs (source of truth for scope)
  pitch/            # demo script
  .env.example
  README.md
```

Key backend modules: `agent/orchestrator.ts`, `agent/tools/retriever.ts`,
`agent/tools/feeCalculator.ts`, `agent/tools/anomalyChecker.ts`,
`agent/tools/reportGenerator.ts`.

Key API endpoints: `GET /api/demo-case`, `POST /api/cases`,
`POST /api/cases/:caseId/run-audit`, `GET /api/cases/:caseId/report`.

Core data types live in `docs/Schema.md` (Case, DocumentRef, DocumentChunk, FeeRules,
FinancialLineItem, ChargedFee, CalculationResult, Finding, Citation, AgentTraceStep,
AuditReport). Agree shared types before implementing.

## Confidence score

Transparent heuristic, shown as a percentage with a short explanation:

```text
confidence = weighted average of:
  clause_found                 25%
  financial_inputs_found       25%
  calculation_variance_clear   25%
  cause_explained_by_evidence  15%
  prior_month_support          10%
```

## Environment variables

Copy `.env.example` → `.env` (never commit `.env`):

```bash
VULTR_INFERENCE_API_KEY=
VULTR_INFERENCE_BASE_URL=
VULTR_INFERENCE_MODEL=
VULTR_OBJECT_STORAGE_ENDPOINT=
VULTR_OBJECT_STORAGE_ACCESS_KEY=
VULTR_OBJECT_STORAGE_SECRET_KEY=
DATABASE_URL=
NODE_ENV=development
```

## Working conventions

- **Directory ownership** (to avoid merge conflicts): Person A owns `apps/api/` +
  `packages/agent/`; Person B owns `apps/web/`; Person C owns `docs/`, `data/demo/`,
  `pitch/`. Don't edit another owner's files without asking.
- **Small PRs, merged quickly.** Suggested merge order: docs/data → backend shell →
  frontend shell → integration. No global formatter runs late in the build.
- **Synthetic data only** under `data/demo/`. Label it clearly as synthetic.
- Match the surrounding code's style, naming, and comment density when editing.

## Source of truth

The `docs/` folder is the authoritative spec. Start there:

- `docs/PRD.md` — product requirements, features, success criteria.
- `docs/TechSpec.md` — stack, modules, API, Vultr usage.
- `docs/Schema.md` — data model / TypeScript types.
- `docs/AppFlow.md` — screens and routes.
- `docs/UserJourney.md` — persona (Maya) and happy path.
- `docs/Design.md` — UI/visual guidance.
- `docs/Workflow.md` — 20-hour plan, task split, PR order.
- `docs/tracker.md` — live status and checklists.
