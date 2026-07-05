# Tracker: FeeForensics Hackathon Build

> **Non-negotiable requirements live in [`docs/Rules.md`](Rules.md)** (sponsor Developer
> Expectations + the golden regression). Re-read them before scoping — Vultr persistence
> (Postgres + Object Storage, no in-memory fallback), VultronRetriever-only audit path, and
> a deployed public demo URL are all **required, not stretch**.

## 1. Current Status

| Area | Owner | Status | Notes |
|---|---|---|---|
| PRD/docs | Person C | ✅ Landed | Planning docs in `docs/` since kickoff (source of truth); tracker updated per PR |
| Demo data | Person C | ✅ Landed | Synthetic case in `data/demo/` (Harborline, Jun vs May); ground truth $36,580 / 96% — see §4 |
| Backend API | Person A | ✅ Wired | Skeleton + `/api/demo-case` (PR #3); hardened in PR #16 (per-IP rate limit, body cap, global error handler, security headers); PR-10 replaced the mock — `run-audit` executes the real agent pipeline over `data/demo/`, mock deleted; **PR-14a** persists reports to **Vultr Managed PostgreSQL** via an injected `CaseRepository` (no in-memory fallback — routes 503 when `DATABASE_URL` is unset; tests inject an in-memory fake double) |
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
| Deployment | Person A/B | ✅ Live (required) | Vultr VM `feeforensics-demo` behind Caddy → public demo URL http://65.20.86.52; deployment is a **required** deliverable (`docs/Rules.md`), not "if time" |

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

- [x] Human-in-the-loop via replay (PR-17: a finding the engine cannot decide on evidence alone — an unverified pass-through, or a fee it could not recompute (`human_review`) — no longer emits silently. New deterministic `packages/agent/src/tools/humanReview.ts` `planHumanReview(caseId, findings, answers)` turns each into a **cited** `PendingQuestion` (stable id keyed on issue type, `subject`, options with `resultingAction` + `consequence`, the clause/line citations) and the orchestrator **stops** the run: returns `status: "awaiting_input"` + `pendingQuestions`, NO memo finalized. Owner answers arrive via `input.humanAnswers` (question id → option id) and are resolved on **REPLAY** — `runAudit` re-runs with them merged, no mid-run state serialized; an answered finding takes the option's disposition, its explanation gets `Owner instruction: …`, and a **HUMAN**-badged trace step (`tool: "human_input"`) records it. API: `run-audit` returns **202** + pendingQuestions when paused (no report persisted); new **POST /api/cases/:id/answers** validates a string→string map, accumulates answers on the case, and replays → 200 (report finalized) or 202 (more open). Shared types: `CaseStatus += "awaiting_input"`, `TraceStepKind += "HUMAN"`, `AgentTool += "human_input"`, new `PendingQuestion`/`PendingQuestionOption`, `RunAuditResponse.pendingQuestions?`, `AnswerQuestionsRequest`; `CaseRecord.humanAnswers?` (stored in the existing jsonb blob — no migration). Totals stay coherent for free: `computeTotals` already keys on `recommendedAction`, so approve→excluded, dispute/request_explanation→counted. TDD +13 tests (7 humanReview unit + 3 orchestrator awaiting/replay + 3 api route 202/answers/validation); 206 green (157 agent + 49 api), typecheck ×4. **GOLDEN UNCHANGED — the demo HAS its support pack so F3 verifies to request_explanation (never human_review); zero questions, no pause, $36,580 / [1980,6600,28000] / 0.96 / 3 LLM + 7 TOOL, no HUMAN step.** Frontend answer-form UI is the follow-up (backend contract is stable).

- [x] OCR ladder for scanned PDFs (PR-16: a **scanned (image-only) PDF** upload now parses instead of being rejected — the "handle messy real-world documents" sponsor bonus. A per-page ladder sits behind documentParser's existing `PdfExtractor` seam: **rung 1** is the pdfjs text layer (fast, exact — a digital page is used as-is); **rung 2**, only for a page with no/negligible text, rasterizes just that page and OCRs it. Decided **per page**, so a MIXED doc (some digital, some scanned) routes each page correctly and PR-15 page-level citations still line up. A fully-digital doc — the golden demo, every .txt/.md/digital-PDF — triggers **zero** rasterizer/OCR load (no added latency); only a truly blank/garbage scan (OCR also empty) is reported unreadable — never empty chunks. **OCR is deterministic transcription, NOT a model in the audit path**: tesseract.js maps pixels→characters as a pre-processing step, exactly like the pdfjs extractor — it does not reason/generate/decide. The pipeline's only model remains the VultronRetrieverPrime reranker (a vision LLM for OCR WOULD violate `docs/Rules.md`; this does not — stated in code + PR body). Engines are injected boundaries (`type Ocr`, `PageRasterizer`) so the pure ladder (`ocrExtractor.ts`) unit-tests with fakes — NO real WASM in vitest. Rasterizer = pdfjs (our existing 4.x build) + **@napi-rs/canvas** (prebuilt NAPI binary — `npm ci` runs no C compiler, unlike `node-canvas`; a 2nd pdfjs copy via `pdf-to-img` was rejected for a fake-worker version clash). OCR = **tesseract.js** with the WASM core from `node_modules` + **eng.traineddata bundled in-repo** (`apps/api/tessdata/`, standard 4.0.0 model) so OCR is **offline + deterministic** (the VM allows no arbitrary outbound; a judge may be offline) — verified with `npm run smoke:ocr` on a committed synthetic image-only fixture. Safety cap: OCR at most N scanned pages/doc with an honest "OCR limited to first N" warning (1-vCPU VM). TDD: +7 api tests (pure-ladder fakes: fully-scanned / mixed / all-digital-zero-cost / OCR-also-empty / page-cap / un-rasterizable; plus a scanned-PDF driven through the parse job to `status:ready`). Adds `@feeforensics/api` deps `tesseract.js`, `@napi-rs/canvas`. Golden demo path is `.txt`+CSV so OCR never touches it — $36,580 / [1980,6600,28000] / 0.96 unchanged)

- [x] Verifiable citation provenance (PR-15: every citation now resolves to an exact location — shared `Citation` gains `row?` (1-based CSV row, header = row 1) + `lineLabel?` alongside the existing `page?`. `statementParser` + `caseHistoryRetriever` stamp each line item / charged fee / support record with its source CSV row and line label (Centralized Services → row 21, `APPROVAL-0612-03` → support row 5); `documentParser` chunks now carry `page` via a page-aware chunker (`chunkPages` over per-page PDF text from PR-14c's extractor — same clause splitting, so chunk text is unchanged), and `ruleExtractor` threads `chunk.page` into every clause citation. A single `formatCitation` helper renders the provenance — `§4.2 Incentive Management Fee (doc_hma, p.12)` for clauses, `… (doc_operating_statement, row 21: Centralized Services)` for lines — and the `reportGenerator` memo Citation trail uses it. Golden UNCHANGED: $36,580 / [1980,6600,28000] / 0.96 / memo still cites `APPROVAL-0612-03` (its sectionLabel leads every rendered cite) — the demo HMA is `.txt` so its clause cites carry no page; only CSV-derived cites gain rows. TDD, +14 agent tests (147 agent + 39 api green). No new deps)

- [x] Digital-PDF text extraction (PR-14c: `pdfjsExtractor` (pdfjs-dist legacy build, pure-JS) plugged into documentParser's injected `PdfExtractor` seam and the upload parse path — reconstructs line breaks from pdfjs `hasEOL` markers so the clause chunker still works, returns per-page text for PR-15 provenance; a scanned PDF (no text layer) is rejected with an OCR hint (OCR = PR-16). `caseAssembler` is now async and takes the injected extractor; a PDF HMA gets text-extracted, statements stay CSV. Verified: real extractor on a committed PDF fixture, and uploading the demo HMA **as a PDF** reproduces $36,580. Adds `@feeforensics/api` dep `pdfjs-dist`)

- [x] BYO case upload backend (PR-14b: `POST /api/cases` — `@fastify/multipart` typed roles **hma**(req)/**statement**(req)/**statement_prior**/**support_pack**/**supplementary** + `ownerNotes`/`draftEmail`/`hotelName`/`auditMonth` text fields, 10MB/file cap on this route only (global JSON bodyLimit untouched); raw files stored to **Vultr Object Storage** (`S3BlobStore`, path-style — verified live PUT/GET), case created `status:parsing`, async parse job assembles `RunAuditInput` (roles→documents; **supplementary→miscBreakout**; txt/CSV now, digital-PDF text in PR-14c) → `ready`/`failed` with per-doc warnings; `GET /api/cases/:id` reports status+warnings for polling; `run-audit` looks up the stored assembled input (409 while parsing, 422 if parse failed) and falls back to the demo loader for `case_demo_hotel_001`, `GET report` works for any case id; `draftEmail:false` skips the email (orchestrator omits `emailDraft`); `ownerNotes` carried on the input (retrievable/cited integration is follow-up). Adds `@feeforensics/api` deps `@fastify/multipart`, `@aws-sdk/client-s3`. Tests inject in-memory fake repo+blob doubles; a route test drives the **real demo files through the upload → parse → run path and reproduces $36,580**)

- [x] Wire Vultr-backed persistence (PR-14a: reports persist to **Vultr Managed PostgreSQL** behind an injected `CaseRepository` boundary — `PostgresCaseRepository` (jsonb, upsert, boot-time `CREATE TABLE IF NOT EXISTS`; strips `sslmode` from the URL and drives TLS via the `ssl` option so the self-signed managed CA doesn't throw `SELF_SIGNED_CERT_IN_CHAIN` — verified against the live Vultr DB), factory `createCaseRepository()` resolves it from `DATABASE_URL` or `null`; **no in-memory production fallback** — `run-audit` 503s `persistence_not_configured` before spending a Vultr call, `GET report` 503s too, when `DATABASE_URL` is unset; the in-memory `reports` Map is gone; tests inject an in-memory fake double and a shared repository contract test runs against both fake (always) and Postgres (when `DATABASE_URL` set); adds `@feeforensics/api` dep `pg`; foundation for the BYO-upload case store in PR-14b)

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
| `/cases/new` | BYO upload (labeled role slots + notes + email opt-out) | `POST /api/cases` (client) | ✅ |
| `/cases/demo` | Case Overview | `GET /api/demo-case` (server) | ✅ |
| `/cases/demo/run` | Agent Trace | `POST …/run-audit` (client) + staged reveal | 🟡 |
| `/cases/demo/report` | Findings + Calc + Memo + Email | `GET …/report` (server) | 🟡 |
| `/cases/[caseId]` | Upload parse status (polls, per-doc warnings) | `GET /api/cases/:id` (client) | ✅ |
| `/cases/[caseId]/run` | Agent Trace (uploaded case — no bundled replay) | `POST …/run-audit` (client) | ✅ |
| `/cases/[caseId]/report` | Findings + Calc + Memo (uploaded docs in evidence viewer) | `GET …/report` + `…/documents` (server) | ✅ |

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
- [x] **Upload flow (real, PR-18)** — `/cases/new` posts labeled role slots (HMA,
      Operating Statement, Past Operating Statement, Collated Invoices + optional
      supplementary) + Additional-info notes + "Draft dispute email" (default on) to
      `POST /api/cases`; a parsing screen (`/cases/[caseId]`) polls `GET /api/cases/:id`
      with per-document warnings, then hands off to dynamic `/cases/[caseId]/{run,report}`.
      The uploaded run does **not** replay the bundled Harborline output (that would fake
      an analysis) — failures surface honestly. The evidence viewer renders the *uploaded*
      documents via the new `GET /api/cases/:id/documents` (`lib/caseDocuments.ts` →
      `resolveCitation` registry). Fallback copy fixed to "files were not stored or
      analyzed." Report body shared via `components/ReportView.tsx` (demo + uploaded).
- [x] **Human-in-the-loop answer form (PR-19)** — when an uploaded run pauses
      (`status: "awaiting_input"`), the run page renders the agent's cited
      question(s) with option buttons in the agent's voice ("The agent needs your
      input to continue — it won't guess"); answering POSTs
      `POST /api/cases/:id/answers` and the audit **replays** to completion
      (`components/PendingQuestions.tsx` + `answerQuestions()` in `lib/api.ts`). The
      demo case never pauses (golden untouched). Backend (PR-17 polish): the
      pending-question **subject reads the charge's real name from the uploaded
      document's line label** — data-driven, works for any uploaded case, nothing
      hardcoded; stays neutral when a line has no label rather than inventing one.
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
