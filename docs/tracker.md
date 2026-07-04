# Tracker: FeeForensics Hackathon Build

## 1. Current Status

| Area | Owner | Status | Notes |
|---|---|---|---|
| PRD/docs | Person C | Not started | Push early |
| Demo data | Person C | Not started | Synthetic only |
| Backend API | Person A | In progress | Skeleton + `/api/demo-case` (PR #3); mock `run-audit`/`report` (PR #4) |
| Vultr inference | Person A | In progress | OpenAI-compatible client stub (PR #3); not yet in live path |
| Retrieval | Person A | Not started | Needs citations |
| Fee calculator | Person A | Done | Deterministic math in `packages/agent`; TDD, reproduces $18,750 |
| Frontend shell | Person B | ✅ Scaffolded | Next.js+TS+Tailwind on :3000, wired to live API (see §8) |
| Agent trace UI | Person B | 🟡 Baseline | Staged reveal + LLM/TOOL badges + loop highlight; polish left |
| Findings UI | Person B | 🟡 Baseline | Cards + check tags + $ impact + citations; polish left |
| Memo/email output | Person B | 🟡 Baseline | Memo (markdown + download) + email (copy) render from API |
| Pitch | Person C | Not started | 3-minute script |
| Deployment | Person A/B | Not started | Local acceptable if Vultr inference works, deploy if time |

## 2. Must-Have Tasks

### Product / Data

- [ ] Create synthetic Hotel Management Agreement
- [ ] Create current month operating statement CSV
- [ ] Create P&L CSV
- [ ] Create revenue schedule CSV
- [ ] Create prior month statements CSV
- [ ] Create brand/system fee schedule
- [ ] Write expected answer manually
- [ ] Write pitch script

### Backend

- [x] Create API skeleton
- [x] Create Vultr inference client (stub; not yet wired into a live path)
- [x] Add demo case endpoint
- [ ] Add document chunker
- [ ] Add retrieval tool
- [ ] Add fee rule extractor
- [x] Add deterministic fee calculator
- [ ] Add anomaly checker
- [ ] Add agent orchestrator
- [ ] Add report generator
- [ ] Add confidence scoring

### Frontend

- [x] Landing page
- [x] Demo case overview page
- [x] Run audit button (auto-runs on `/cases/demo/run`)
- [x] Agent trace UI (baseline — staged reveal, LLM/TOOL badges, loop)
- [x] Findings cards (baseline — severity, check tag, citations)
- [x] Calculation breakdown
- [x] Memo viewer (markdown + download)
- [x] Draft email viewer
- [x] Copy button
- [ ] Final UI polish

> Detailed frontend BRD + remaining work lives in **§8** below (Person B tracker).

### Repo / Submission

- [x] Public repo
- [x] `.env.example`
- [x] No `.env` committed
- [ ] README with demo instructions
- [ ] Sources and acknowledgements
- [ ] Clear note: all demo docs are synthetic
- [ ] Final commit pushed

## 3. Nice-to-Have Tasks

- [ ] Upload flow
- [ ] Vultr Object Storage upload
- [ ] Vultr deployment
- [ ] Export memo as PDF
- [ ] More leakage scenarios
- [ ] 21st.dev UI polish

## 4. Known Demo Case Expected Findings

Use this section once synthetic data is created.

Numbers below are the **mock/target** authored in the backend demo (PR #4). Person C:
build the synthetic `data/demo/` financials so the real calculator reproduces these.

| Finding | Expected Impact | Evidence | Status |
|---|---:|---|---|
| Banquet cancellation revenue in base-fee base | $6,000 | HMA §4.1(b) + operating statement | Mock authored (needs data) |
| Incentive fee on AGOP inflated by insurance proceeds | $9,750 | HMA §4.2 + operating statement | Mock authored (needs data) |
| Corporate support passed through without approval | $3,000 | HMA §6.3 + support pack | Mock authored (needs data) |
| **Total suspected overcharge** | **$18,750** | — | Confidence 86% |

## 5. Merge Conflict Guardrails

- Person A owns `apps/api/` and `packages/agent/`.
- Person B owns `apps/web/`.
- Person C owns `docs/`, `data/demo/`, and `pitch/`.
- Shared types should be agreed before implementation.
- Do not edit another person’s directory without asking.
- No global formatter after hour 16.
- All PRs should be small and merged quickly.

## 6. Hourly Checkpoints

| Time | Goal | Done? |
|---|---|---|
| Hour 1 | Repo + docs + task split | [ ] |
| Hour 3 | Skeleton app + demo data draft | [ ] |
| Hour 6 | Retrieval working | [ ] |
| Hour 10 | Agent + calculator working | [ ] |
| Hour 14 | Report and email working | [ ] |
| Hour 17 | Vultr path verified | [ ] |
| Hour 19 | Demo rehearsed | [ ] |
| Hour 20 | Submit | [ ] |

## 7. Demo Readiness Checklist

- [ ] App opens without errors
- [ ] Demo case loads instantly
- [ ] Agent trace shows multiple steps
- [ ] Vultr inference call is used
- [ ] Retrieval occurs more than once
- [ ] Calculator is called
- [ ] Final memo has citations
- [ ] Dollar impact is clear
- [ ] Draft email is generated
- [ ] Pitch is under time
- [ ] Repo is public
- [ ] No secrets in repo

## 8. Frontend BRD & Build Tracker (Person B)

Living tracker for `apps/web/`. Legend: ✅ done · 🟡 baseline (works, needs polish) ·
⬜ not started. Update this section in every frontend PR.

### 8.1 Goal & non-negotiables

Make three things undeniable on screen (per `docs/Design.md` / `docs/AppFlow.md`):
1. This is a **multi-step agent** — visible `LLM`/`TOOL` badges + a **re-retrieval loop**.
2. Every **number** came from **deterministic code**, not the model.
3. The **dollar impact** is real and above the fold.

Hard traps to avoid (disqualifiers): must NOT read as a basic RAG app, and must NOT
become a dashboard-as-the-main-feature. Demo-first: working flow beats polish.

### 8.2 Stack (as built)

Next.js 15 (App Router) · TypeScript · Tailwind v3 · lucide-react · react-markdown +
remark-gfm · `@tailwindcss/typography`. Types imported from `@feeforensics/shared`
(never hand-rolled). API base via `NEXT_PUBLIC_API_BASE_URL` (default
`http://localhost:4000`). Web runs on `:3000` (CORS pre-allowed by the API).

### 8.3 Routes & screens

| Route | Screen | Data source | Status |
|---|---|---|---|
| `/` | Landing | static | ✅ |
| `/cases/demo` | Case Overview | `GET /api/demo-case` (server) | ✅ |
| `/cases/demo/run` | Agent Trace | `POST …/run-audit` (client) + staged reveal | 🟡 |
| `/cases/demo/report` | Findings + Calc + Memo + Email | `GET …/report` (server) | 🟡 |

### 8.4 Component inventory

| Component | Purpose | Status |
|---|---|---|
| `layout.tsx` (shell) | Header (Vultr label + demo status) + synthetic-data footer | ✅ |
| `lib/api.ts` | Typed client: `getDemoCase` / `runAudit` / `getReport` + `ApiError` | ✅ |
| `TraceRow` + `KindBadge` | Step row with LLM/TOOL badge, status, loop highlight | 🟡 |
| `FindingCard` | Title, severity, **check attribution**, impact, citations | 🟡 |
| `CalculationBreakdown` (table) | Expected vs charged vs variance | ✅ |
| `CitationPill` | Clause/line label + quote (visible, no click) | ✅ |
| `ConfidenceMeter` | 86% + expandable heuristic components (static — see §8.6) | 🟡 |
| `Markdown` | Memo renderer (GFM tables) | ✅ |
| `CopyButton` / `DownloadButton` | Email copy / memo download | ✅ |
| `ApiErrorPanel` | Friendly "API not running" fallback | ✅ |

### 8.5 Build phases

**Phase 0 — Scaffold** ✅
- [x] `apps/web` Next.js app, Tailwind, workspace dep on `@feeforensics/shared`
- [x] Typed API client + constants
- [x] App shell (header/footer, enterprise navy theme)
- [x] `typecheck` + `next build` green; end-to-end verified against live API

**Phase 1 — Core flow (demo baseline)** ✅
- [x] Landing → Case Overview → Run → Report all navigable
- [x] Server pages render live API data; run page POSTs + reveals 10 steps
- [x] Findings, calc breakdown, memo, email all render from the contract

**Phase 2 — Fidelity / "agent, not RAG" proof** 🟡
- [ ] Trace: connector rail between steps; smoother reveal timing/pauses
- [ ] Trace: **cached fallback replay** — if no first step in ~10s, swap to a
      bundled run silently (`docs/AppFlow.md` §6). *Highest demo-safety item.*
- [ ] Findings: expandable confidence backed by real data once contract adds it (§8.6)
- [ ] "Cannot assess — evidence missing" state for checks with no evidence
- [ ] `error.tsx` + `not-found.tsx` boundaries; loading skeletons

**Phase 3 — Polish & ship** ⬜
- [ ] Responsive/mobile QA; a11y pass (focus, contrast, aria)
- [ ] Visual polish pass (spacing, hierarchy, motion) — 21st.dev prompts
- [ ] Deploy (Vultr Cloud Compute / Vercel) + point `NEXT_PUBLIC_API_BASE_URL` at it
- [ ] Rehearse: confirm run reads well in <60s; fallback replay tested

### 8.6 Contract gaps to coordinate with Person A (owns `@feeforensics/shared`)

1. **`confidenceBreakdown`** — AppFlow §7 wants the confidence number to expand into
   its heuristic components. `Finding.confidence` is a bare number today, so
   `ConfidenceMeter` shows a **static** breakdown. Ask A to return real components.
2. **Finding → check link** — findings carry no `issueType`. The report currently
   **zips `findings` with `calculationResult.lineItemImpacts` by index** to derive the
   "Check N" tag (fragile). Ask A to add `issueType`/`checkLabel` onto `Finding`.
3. **Streaming (later)** — real agent may stream the trace. Keep `RunAuditResponse`
   shape stable; the staged reveal already models a live run, so streaming is a
   drop-in upgrade, not a rewrite.

### 8.7 How to run

```bash
npm install                 # from repo root (once)
npm run dev:api             # terminal 1 — API on :4000
npm run dev --workspace=@feeforensics/web   # terminal 2 — web on :3000
```

> DX nit: consider a root `dev:web` + combined `dev` script (touches root
> `package.json`, Person A's file) — coordinate before adding.
