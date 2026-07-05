# FeeForensics — Pre-UAT Drive Findings

**Target:** http://65.20.86.52 (deployed web + API behind Caddy) · **Date:** 2026-07-05
· **Kit:** [`qa/uat/`](./README.md) · **Specs:** [`apps/web/e2e/`](../../apps/web/e2e/)

## TL;DR recommendation

**GO for the scripted demo. FIX-FIRST (top 3) before wide UAT.**
The golden regression is intact and every core path — leakage, clean, HITL,
malformed — behaves **honestly** (nothing is ever fabricated; failures surface as
failures). No blocker. But three MEDIUM issues a tester **will** hit are listed
below; fix #1–#3 before putting the app in front of many UAT users.

---

## What was actually driven, and how

| Path | Real browser (Playwright, live site) | API-verified (curl, live site) |
|---|:---:|:---:|
| Happy path / leakage — upload→parse→trace→report | ✅ `happy-path.spec.ts` | ✅ |
| Interactive: citation drawer + highlight, confidence breakdown expand, download packet | ✅ `happy-path.spec.ts` | — |
| Interactive: **copy email** | ✅ (see Finding 3) | — |
| HITL: pause → answer form → replay → resolved report | ✅ `hitl.spec.ts` | ✅ |
| Clean: $0 / 0 findings / honest empty state | ✅ `clean.spec.ts` | ✅ |
| Malformed: corrupt file rejected at parse; submit disabled w/o required docs | ✅ `malformed.spec.ts` | ✅ (400 / failed / 500) |

`npx playwright test` → **5 passed** in headless Chromium against the deployed
URL. Every spec uploads **synthetic** files and creates a real (synthetic) case
in Vultr Postgres — expected and harmless.

Also verified: `npm run typecheck` green across all 4 workspaces; `next build`
green (5/5 pages). No source in `packages/*`, `apps/api`, or `@feeforensics/shared`
was changed — this PR adds test assets + docs + `apps/web/e2e/` only.

---

## Regression: the golden invariant is intact ✅

Uploading `data/demo/` (via the API and via the browser) reproduces exactly:

- Total **$36,580**; findings **[$1,980, $6,600, $28,000]**
- Confidence **0.96 (96%)**; trace **3 LLM + 7 TOOL** (0 HUMAN); **no pause**
- Full memo + dispute email; citation drawer + confidence breakdown interactive.

Evidence: API case `case_93d69889-…`; browser `happy-path.spec.ts`.

## Case results vs. expected

| Case | Expected | Actual (live) | Verdict |
|---|---|---|---|
| 1 Leakage (golden) | $36,580 / 3 findings / 0.96 / 3 LLM+7 TOOL / no pause | exactly that | ✅ PASS |
| 2 Clean | $0 / 0 findings / honest no-leakage | $0, 0 findings, variance $0, 73%, memo "No fee issues identified" | ✅ PASS (see Finding 4) |
| 3 HITL | pause (202) → answer → completes | 202 + 1 question → "not_authorized" → completes, HUMAN badge, $25k `request_explanation` | ✅ PASS |
| 4 Malformed | honest rejection, nothing fabricated | corrupt→`failed`; missing-doc→400; wrong-cols→500 (see Finding 2) | ✅ PASS (rejected honestly) |

---

## Findings (ranked)

### 1 — [MEDIUM · correctness] A fully-supported, owner-approved pass-through is mislabeled and forced to human review
A centralized-services charge of $25,000 (> the §5.1 $10k threshold) with **both
an invoice AND an owner approval marked `present`** in the support pack still:
- returns `recommendedAction: human_review` and **pauses**, and
- titles the finding **"Centralized Services passed through without verified support"**
  and asks **"…found no supporting approval on file"** — **both statements are false**;
  the approval *is* on file.

**Evidence (live):** `case_438a0830-bd6f-4554-9c0a-2570b16c89fd` — support check
returns `verdict: "supported"`, yet the finding says the opposite.
**Root cause:** `packages/agent/src/tools/decisionEngine.ts` special-cases only
`verdict === "unsupported"` → `request_explanation`; **every** other verdict
(`supported`, `not_required`, `needs_review`) falls to the same `else` branch →
`human_review` with a hard-coded "without verified support" title.
**Impact:** owners see a scary, false "unsupported/no approval" message on charges
that are fully documented; a legitimately-approved reimbursable can never
auto-resolve to *approved*. **Fix:** add a `supported` → `approve` (and
`not_required` → drop) branch, and title from the actual verdict.

### 2 — [MEDIUM · robustness] A structurally-invalid CSV 500s at run-audit instead of a clean rejection
A statement CSV that decodes as text but lacks the `line_item`/`amount` columns
passes the parse stage (status **`ready`**) and then `POST …/run-audit` returns
**HTTP 500 `internal_error`**. The run page shows "The audit could not run" — so
nothing is fabricated — but a generic 500 is ungraceful and not the honest
`failed`/422 the empty/binary paths give.
**Evidence (live):** `case_34a4663a-…` (kit file `cases/malformed/wrong_columns_SYNTHETIC.csv`).
**Root cause:** `parseOperatingStatement` throws on missing columns *inside*
`runAudit`; the audit route doesn't catch it, so it becomes a 500.
**Fix:** validate CSV structure at parse time (→ status `failed` with a warning),
or catch the parse error in the run-audit route and return 422.

### 3 — [MEDIUM · UX, prod] "Copy email" silently does nothing on the HTTP deployment
The deployment is **HTTP-only** (`isSecureContext = false`, `navigator.clipboard`
is `undefined`). `CopyButton` calls `navigator.clipboard.writeText` inside a
try/catch, so the click is a **silent no-op** — the button never flips to
"Copied" and nothing reaches the clipboard. (Download memo/packet works — it uses
a Blob + anchor, not the clipboard.)
**Evidence (live):** `window.isSecureContext=false`, `navigator.clipboard=undefined`
at `http://65.20.86.52`.
**Fix:** serve over HTTPS (also Finding 6), and/or add a `document.execCommand('copy')`
/ selectable-textarea fallback, and surface a visible failure instead of a no-op.

### 4 — [LOW · UX] 0-findings report has no "no leakage found" state
On the clean case the report renders **without crashing** and is honest
($0, "0 findings", variance $0, and the memo says **"No fee issues identified"**).
**But** the on-page **"Findings"** heading renders with an **empty body** (no
affirmation), and **"Build dispute packet"** still shows "0 of 0 findings" and a
"select a finding" prompt — awkward for a genuinely clean audit.
**Evidence (live):** `case_f493d65b-…`, rendered report HTML.
**Fix:** render an explicit "No fee leakage found — every fee reconciles" empty
state under Findings, and hide/soften the dispute builder when there are 0 findings.

### 5 — [LOW · design] A legitimate below-threshold reimbursable cannot be represented as "clean"
The calculator recomputes only base + incentive fees; any charge in the
`MANAGEMENT FEES` block it can't reproduce becomes variance. A centralized/
pass-through charge is therefore never silently clean: **above** $10k it's a
finding (Finding 1), and **below** $10k its dollars surface as unexplained
variance → a `NEEDS_REVIEW` **pause**. So a truly $0 statement must omit
reimbursables (which is why the clean kit case does).
**Fix:** treat a below-threshold, in-contract reimbursable as an expected/allowed
charge rather than unexplained variance.

### 6 — [MEDIUM · infra/security] Deployment is HTTP-only (no TLS)
`https://65.20.86.52` refuses; the app is served over plain HTTP. This is the root
cause of Finding 3 and means any uploaded HMA/financials and case data travel in
the clear. Acceptable for a throwaway hackathon demo; **must** be fixed (HTTPS via
Caddy/Let's Encrypt) before real documents are uploaded in UAT.

---

## Also confirmed (no issue)
- **No seeded data / no demo route.** Landing shows only the Upload CTA; no
  `cases/demo` link, no pre-filled `$36,580`, no "Harborline" anywhere before an
  upload. Every number comes from a real run. ✅
- **API-down fails honestly.** With `/api/*` unreachable the client shows
  "Cannot reach API…" / "The audit could not run" and never a canned result. ✅
  (verified by code + the ApiError path; the run page has no bundled-replay fallback.)
- **Persistence is real.** Uploads 503 without Vultr Object Storage / Postgres —
  no in-memory fallback; every case above persisted and re-read from Postgres.

## Prioritized fix list for UAT-readiness
1. **Finding 1** — stop mislabeling supported/approved pass-throughs (correctness).
2. **Finding 2** — reject malformed CSVs at parse time, not a 500.
3. **Finding 3 / 6** — HTTPS + a working/honest Copy control.
4. **Finding 4** — a real "no leakage found" empty state.
5. **Finding 5** — represent allowed below-threshold reimbursables as clean.

None of the above fabricates results or breaks the golden demo, so: **GO for the
demo; fix #1–#3 before broad UAT.**
