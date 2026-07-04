# Tracker: FeeForensics Hackathon Build

## 1. Current Status

| Area | Owner | Status | Notes |
|---|---|---|---|
| PRD/docs | Person C | ✅ Landed | Planning docs in `docs/` since kickoff (source of truth); tracker updated per PR |
| Demo data | Person C | ✅ Landed | Synthetic case in `data/demo/` (Harborline, Jun vs May); ground truth $36,580 / 96% — see §4 |
| Backend API | Person A | ✅ Wired | Skeleton + `/api/demo-case` (PR #3); hardened in PR #16 (per-IP rate limit, body cap, global error handler, security headers); PR-10 replaced the mock — `run-audit` executes the real agent pipeline over `data/demo/`, `report` serves the latest real run (in-memory per case), mock deleted |
| Vultr inference | Person A | ✅ In live path | OpenAI-compatible client (PR #3); 30s timeout + `max_tokens` cap + https enforcement (PR #16); PR-10 wires `chatComplete` (temp 0, one transient retry) into `runAudit` as the injected LLM boundary — unconfigured env → loud 503, never a fake audit; **live smoke PASSED 2026-07-04** — repeated golden runs ($36,580 / 96%, zero warnings); **the pipeline's ONLY model is VultronRetrieverPrime via `/v1/rerank`** (hackathon requirement — the sponsor models are retrieval scorers and cannot chat); planning, rule extraction, decisions, and memo/email are deterministic code; a chat model is no longer in the audit path at all |
| Retrieval | Person A | ✅ Live on VultronRetriever | `retriever.ts` — PR-13: all retrieval steps (2, 3, and the step-7 loop) score chunks on **VultronRetrieverPrime-Qwen3.5-8B via Vultr's `/v1/rerank`** (the models are late-interaction retrieval scorers — they don't serve chat); compound queries split on `;` per intent (top-1 precision on every sub-query live); failure ladder rerank → chat selection → all-clauses superset; 3 consecutive golden live runs |
| Agent orchestrator | Person A | ✅ Built | `orchestrator.ts` `runAudit` — 10-step traced loop composing all 8 tools, conditional re-retrieval (steps 7–8 only on `triggersReview`), golden $36,580 / 96% end-to-end from `data/demo/`; live Vultr wiring landed in PR-10 |
| Fee calculator | Person A | Done | Deterministic math in `packages/agent`; golden test re-based to Harborline **$36,580** (`harborlineCase.ts`); excluded-revenue sets now rule-driven (`FeeRules.*.excludedCategories`) |
| Anomaly + evidence checks | Person A | ✅ Wired | `anomalyChecker.ts` (PR-5) + `caseHistoryRetriever.ts` support-pack Check 5 (PR-6 / PR #17); deterministic, tested against the demo pack; wired into orchestrator steps 6–8 |
| Security hardening | Person A | ✅ Done | PR #16 — prompt-injection delimiting in agent tools, error info-leak fixes, markdown exfil guards, rate limiting, vitest bump |
| Frontend shell | Person B | ✅ Scaffolded | Next.js+TS+Tailwind on :3000, wired to live API (see §8) |
| Agent trace UI | Person B | 🟡 Baseline | Staged reveal + LLM/TOOL badges + loop highlight; polish left |
| Findings UI | Person B | 🟡 Baseline | Cards + check tags + $ impact + citations; polish left |
| Memo/email output | Person B | 🟡 Baseline | Memo (markdown + download) + email (copy) render from API |
| Pitch | Person C | Not started | 3-minute script |
| Deployment | Person A/B | Not started | Local acceptable if Vultr inference works, deploy if time |

## 2. Must-Have Tasks

### Product / Data

Demo case landed in `data/demo/` (synthetic — see `data/demo/README.md`). Property:
The Harborline Hotel, audit month June vs prior month May.

- [x] Create synthetic Hotel Management Agreement — `01_HMA_excerpt.txt`
- [x] Create current month operating statement CSV — `02_operating_statement_june.csv`
- [x] Create P&L CSV — USALI operating statement above doubles as the P&L
- [x] Create revenue schedule CSV — `02b_misc_income_breakout_june.csv` (Misc Income breakout)
- [x] Create prior month statements CSV — `03_operating_statement_may.csv`
- [x] Add support/approval pack — `04_support_invoice_pack.csv` (drives F3 re-retrieval loop)
- [ ] Create brand/system fee schedule — not in this case (stretch scenario only)
- [x] Write expected answer manually — `05_expected_answer.md`
- [ ] Write pitch script — pending (`pitch/`)

### Backend

- [x] Create API skeleton
- [x] Create Vultr inference client (wired into the live run-audit path in PR-10)
- [x] Add demo case endpoint
- [x] Add CSV statement parser (`packages/agent` `statementParser.ts`: data/demo operating statement + misc breakout → `FinancialLineItem[]` + `ChargedFee[]`; tolerant headers/currency, category synonym map, unknown→OTHER+warning)
- [x] Add document parser + clause-aware chunker (`packages/agent` `documentParser.ts`: .md/.txt/digital-.pdf → `DocumentChunk[]` with citation labels like `HMA §4.2 — Incentive Management Fee`; PDF via injected extractor, scanned-PDF rejected clearly)
- [x] Add retrieval tool (`packages/agent` `retriever.ts`: model-driven chunk selection via a VultronRetriever chat model — injected `RetrieverLlm` boundary; ranks by model score, drops hallucinated indices, tolerant JSON, topK/minScore)
- [x] Add fee rule extractor (`packages/agent` `ruleExtractor.ts`: HMA chunks → `FeeRules` on a VultronRetriever model — injected LLM boundary, zod-validated envelope; LLM extracts, code normalizes `3.0%`→`0.03` (never computes); each rule cited to its chunk; missing clause omitted not invented; extracted rules feed the calculator to reproduce $36,580)
- [x] Add deterministic fee calculator
- [x] Add anomaly checker (`packages/agent` `anomalyChecker.ts`: deterministic June-vs-May comparison — line items summed by `normalizedCategory`, charged fees by `feeType`; flags only when BOTH gates clear (|Δ%| ≥ 50% AND |Δ$| ≥ $5k) so rooms +2%/+$50k stays quiet while centralized services $7,500→$28,000 (+273%) flags high + `triggersReview`, feeding the orchestrator's re-retrieval loop; new items (prior $0) gate on dollars with `percentChange: null`; citations carried from both months)
- [x] Add case-history / support-pack evidence tool (`packages/agent` `caseHistoryRetriever.ts`: deterministic Check 5 — `parseSupportPack` turns `04_support_invoice_pack.csv` into cited `SupportRecord[]` (including documented absences like `APPROVAL-0612-03` MISSING); `checkSupport` verifies a flagged charge: invoice on file? approval required per §5.1 threshold? → `supported` / `unsupported` (dispute-ready) / `needs_review` (no evidence or amount mismatch — never invented) / `not_required`; this is the evidence half of the anomaly → re-retrieval loop)
- [x] Add decision engine + confidence scoring (`packages/agent` `decisionEngine.ts`: deterministic — `decideFindings` merges calculator impacts per issue type into cited `Finding`s (F1 $1,980 dispute / F2 $6,600 dispute / F3 $28,000 request_explanation = approval-or-reversal, never auto-clawback; unverified pass-through or NEEDS_REVIEW → human_review), tagging each with `issueType` + `checkLabel`; `scoreConfidence` renders the CLAUDE.md heuristic as a visible sum — Harborline 25+25+20+16+10 = **96** with per-component explanations; `@feeforensics/shared` gained optional `Finding.issueType`/`checkLabel` + `ConfidenceComponent`/`confidenceBreakdown` — closes contract gaps §8.6 (1) and (2))
- [x] Add report generator (`packages/agent` `reportGenerator.ts`: memo + dispute email — the memo skeleton (headline totals, findings table w/ check tags + clause refs, calculation breakdown, visible confidence sum table, citation trail, recommended action w/ §9.2 audit window) renders deterministically from tool outputs; the LLM (injected `ReportLlm` boundary) drafts ONLY the executive summary + email body, and a **number guard** rejects any prose dollar amount not present in the provided context (even a correct sum — the model never computes) with deterministic template fallbacks on guard/parse/transport failure so the demo never breaks; untrusted finding text sanitized + `<<< >>>`-delimited per the PR #16 conventions)
- [x] Add agent orchestrator (`packages/agent` `orchestrator.ts`: `runAudit` composes all 8 tools into the traced 10-step loop matching the mock trace shape (planner → retrieve fee clauses → retrieve exclusions/GOP → extract rules → deterministic recompute → month-over-month checks → **conditional** re-retrieval of prior month + support pack → support verification → decide + confidence → memo/email); steps 7–8 run only when an anomaly `triggersReview`, so stable months skip the loop and the trace renumbers — the audit branches on tool output, not a script; one injected LLM boundary shared by every tool (apps/api wires the real Vultr `chatComplete` in PR-10) with deterministic fallbacks on every model failure — failed rule extraction routes the whole variance to a NEEDS_REVIEW/human-review finding, never invented rules; closes the category gap that broke an end-to-end recompute: `NormalizedCategory` gained `OTHER_OPERATED_REVENUE` + `MISC_INCOME` across the shared enum, statement-parser synonym map, calculator base/AGOP sets, and rule-extractor schema, so the parsed fee base foots to the clean $3,474,000; the misc-income breakout **replaces** the statement's roll-up line (with a footing check) so the $140k never double-counts; golden end-to-end test reproduces **$36,580 / 96%** with the three findings, memo citing `APPROVAL-0612-03`, and retrieval appearing 3× in the trace)

- [x] Wire the real pipeline into the API (PR-10: `apps/api` `run-audit` now executes `runAudit` from `@feeforensics/agent` over the five `data/demo/` documents — loader keys `documentId`s to the frontend evidence viewer (`doc_hma`, `doc_operating_statement`, `doc_misc_breakout`, `doc_prior_month`, `doc_support_pack`); live Vultr `chatComplete` injected as the LLM boundary (temperature 0 + one transient retry, `buildServer({ llm })` override for tests); `report` serves the latest real run from an in-memory per-case store (404 `report_not_ready` before a run); unconfigured Vultr → 503, mid-run transport failure → 200 with warnings + a single NEEDS_REVIEW/human-review finding; `mockAudit.ts` deleted; 10 route tests incl. PR #16 rate-limit/body-cap smoke checks)

- [x] Live-model hardening from the first real Vultr runs (PR-12: extraction prompt now pins the exact JSON envelope with bounded ≤200-char quotes — the loose prompt let live models invent field names and blow the 1,500-token cap; free-text exclusions normalize to categories in code with the retrieved exclusions clause as a deterministic fallback; the orchestrator unions exclusion-labeled clauses into the extraction input so a flaky model-driven retrieval can't drop §4.3; the calculator flags above-threshold pass-throughs from the $ threshold alone and treats category-only exclusion declarations as declared — result: 3 consecutive golden live runs, zero warnings)

- [x] Make VultronRetriever the pipeline's ONLY model (PR-13: the sponsor's models are retrieval scorers, not chat models — `/chat/completions` 404s for them and the HF cards say visual-document-retrieval — so all three retrieval steps score chunks on `vultr/VultronRetrieverPrime-Qwen3.5-8B` via Vultr's `/v1/rerank` (`rankRelevantChunks`, injected `ChunkRanker` boundary, compound queries split per intent for top-1 precision), and every generation task was moved to deterministic code: the plan is fixed, `extractFeeRulesDeterministic` parses rates/thresholds/windows/exclusions from the retrieved clause text, and the memo/email render from the cited templates (now a mode, not a fallback — zero warnings); `deps.llm` survives only as optional prose polish, unused in production; `buildServer({ ranker })` keeps tests transport-free; even a total inference outage still lands the golden numbers on deterministic supersets — tested at both orchestrator and route layers)

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
- [x] No `.env` committed (`.gitignore` covers all `.env*` variants since PR #16)
- [x] Security hardening pass (PR #16: prompt-injection delimiters in agent tools, per-IP rate limit + body caps, error info-leak fixes, markdown image/URL restrictions, CSV formula-injection neutralized, vitest ^3.2.6)
- [x] README with demo instructions (status + run commands current as of PR-6)
- [ ] Sources and acknowledgements
- [x] Clear note: all demo docs are synthetic (`data/demo/README.md`)
- [ ] Final commit pushed

## 3. Nice-to-Have Tasks

- [x] Upload flow (UI + honest fallback to demo — see §8.5)
- [ ] Vultr Object Storage upload
- [ ] Vultr deployment
- [x] Export memo as PDF (print route — see §8.5)
- [ ] More leakage scenarios
- [ ] 21st.dev UI polish

## 4. Known Demo Case Expected Findings

✅ **Reconciled — the whole flow is on the Harborline numbers below.** The synthetic
`data/demo/` ground truth (`05_expected_answer.md`) is now the single source of truth.
The API mock (`apps/api/src/data/mockAudit.ts` + `demoCase.ts`), the bundled fallback
(`apps/web/src/lib/cachedRun.ts`), the evidence viewer (`apps/web/src/lib/documents.ts`),
and the `ConfidenceMeter` (now **96**) all render **$36,580 / 96%**. ✅ The
`packages/agent` calculator golden test is now re-based to this case
(`packages/agent/src/fixtures/harborlineCase.ts`; old `grandHarborCase.ts` removed) —
the deterministic recompute reproduces $36,580 (F1 $1,980 + F2 $6,600 + F3 $28,000),
expected fees $239,620 vs charged $276,200. Excluded-revenue categories are now
rule-driven (`FeeRules.baseManagementFee.excludedCategories` /
`incentiveFee.excludedCategories`), since Harborline §4.3 excludes the same $66k
(insurance + cancellation) from both the base and GOP.

### Authoritative — synthetic `data/demo/` ground truth (use this)

Property: The Harborline Hotel · Audit month June · Prior month May.

| Finding | Impact | Type | Evidence | Detected by |
|---|---:|---|---|---|
| F1 — Excluded revenue (insurance + cancellation, $66k) in base-fee base | $1,980 | overcharge | HMA §4.3(a)/(c) + Misc Income breakout | Check 2 |
| F2 — Incentive fee on inflated GOP (same $66k not backed out) | $6,600 | overcharge | HMA §4.2 + GOP | Check 3 |
| F3 — Centralized services charged without required owner approval | $28,000 | unsupported | HMA §5.1 + missing `APPROVAL-0612-03` | Check 4 anomaly → Check 5 |
| **Total identified fee issues** | **$36,580** | $8,580 overcharge + $28,000 unsupported | — | Confidence **96** |

### Superseded — old Grand Harbor mock (PR #4 / PR #7 `grandHarborCase.ts`; replaced by the above, kept for history)

| Finding | Expected Impact | Evidence |
|---|---:|---|
| Banquet cancellation revenue in base-fee base | $6,000 | HMA §4.1(b) + operating statement |
| Incentive fee on AGOP inflated by insurance proceeds | $9,750 | HMA §4.2 + operating statement |
| Corporate support passed through without approval | $3,000 | HMA §6.3 + support pack |
| **Total suspected overcharge** | **$18,750** | Confidence 86% |

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
- [x] Vultr inference call is used (verified live 2026-07-04 — 3 golden end-to-end runs)
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
| `CitationPill` | Clause/line label + quote; **clickable → opens source-doc drawer** | ✅ |
| `EvidenceProvider` + `lib/documents.ts` | Slide-over drawer: citation → bundled source doc, exact clause/line highlighted | ✅ |
| `DisputeBuilder` + `lib/disputePacket.ts` | Owner selects findings → tailored dispute email + downloadable packet; totals recompute from selection (sums calculator numbers) | ✅ |
| `ConfidenceMeter` | **96** + expandable heuristic components (static, matches ground truth — see §8.6) | 🟡 |
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
- [x] Trace: **cached fallback replay** — run page races the live run vs a ~10s
      stall guard; on timeout *or* unreachable API it replays the bundled run
      silently (`lib/cachedRun.ts`, `docs/AppFlow.md` §6). Report page also serves
      the bundled report on API failure, so the whole flow survives an outage.
      *(Gap: `/cases/demo` overview still shows the retry panel if the API is down.)*
- [x] **Evidence viewer** — citations are clickable; a drawer opens the bundled source
      doc with the cited clause/line highlighted (`EvidenceProvider`, `lib/documents.ts`)
- [x] **Dispute builder** — owner picks findings; a tailored email + downloadable packet
      assemble from the selection (`DisputeBuilder`, `lib/disputePacket.ts`)
- [x] **PDF export** — print-styled `/cases/demo/report/print` route + auto-print,
      linked from the report as "Export PDF" (browser Save-as-PDF, zero deps)
- [x] **Upload flow** — `/cases/new` accepts documents, attempts `POST /api/cases`,
      falls back honestly to the demo case when the MVP backend has no endpoint
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
   `ConfidenceMeter` shows a **static** breakdown (now hard-coded to the Harborline
   96 = 25+25+20+16+10 from `05_expected_answer.md`). Ask A to return real components.
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
