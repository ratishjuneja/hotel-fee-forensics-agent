# FeeForensics — Pre-UAT Test Kit

Reusable QA inputs + an executable [UAT script](./UAT-script.md) for the
FeeForensics deployment. Everything here is **synthetic** and clearly labelled —
no real hotel, contract, or customer data. Use it to prove the four behaviours
that matter before user-acceptance testing:

1. **Leakage** — the golden regression: real math, cited memo, no pause.
2. **Clean** — the "doesn't invent findings" proof: $0 leakage, honest empty state.
3. **Human-in-the-loop (HITL)** — the agent pauses on a charge it can't verify and
   asks the owner; answering resumes the run.
4. **Malformed** — bad input is honestly rejected; nothing is analysed or fabricated.

- **Deployed target:** http://65.20.86.52 (web + API behind Caddy).
- **API base:** `http://65.20.86.52/api` · health at `http://65.20.86.52/health`.
- **Drive results & go/no-go:** [FINDINGS.md](./FINDINGS.md).
- **Automated drives:** Playwright specs in [`apps/web/e2e/`](../../apps/web/e2e/).

> ⚠️ Every file under `qa/uat/cases/` is FICTIONAL, authored for testing. The
> `SYNTHETIC` tag in each filename and a banner in each document say so. Driving
> the live site creates real (synthetic) cases in Vultr Postgres — expected, and
> harmless; a handful of runs is enough.

---

## The four cases

| # | Case | Files to upload | Expected live outcome |
|---|------|-----------------|-----------------------|
| 1 | **Leakage** (golden) | `data/demo/` (read-only, do **not** edit) — see mapping below | Completes, **$36,580**, 3 findings **[1,980 / 6,600 / 28,000]**, confidence **0.96 (96%)**, trace **3 LLM + 7 TOOL**, **no pause**, full memo + dispute email |
| 2 | **Clean — no leakage** | `cases/clean-no-leakage/` (HMA + statement) | Completes, **$0** overcharge, **0 findings**, variance **$0**, confidence **73%**, memo says **"No fee issues identified"** — the honest no-leakage state |
| 3 | **HITL — pause** | `cases/hitl-pause/` (HMA + statement) | **Pauses** (HTTP 202 `awaiting_input`), **1 pending question** ("Did the owner authorize the Centralized Services charge of $25,000?"). Answer it → replay → **completes**, 1 finding, **HUMAN** trace badge |
| 4 | **Malformed** | `cases/malformed/` (+ the missing-doc procedure) | Honest rejection — see the three variants below. Nothing analysed/fabricated |

All outcomes above were **verified live via the API** against the exact files in
this kit (see FINDINGS.md for the case IDs used as evidence).

---

## Case 1 — Leakage (golden regression)

Do **not** copy or modify the golden files; upload them straight from `data/demo/`.
Role → upload slot mapping:

| Upload slot (UI) / multipart field | File |
|---|---|
| Hotel Management Agreement / `hma` | `data/demo/01_HMA_excerpt.txt` |
| Operating Statement / `statement` | `data/demo/02_operating_statement_june.csv` |
| Past Operating Statement / `statement_prior` | `data/demo/03_operating_statement_may.csv` |
| Collated Invoices / `support_pack` | `data/demo/04_support_invoice_pack.csv` |
| Supplementary schedule / `supplementary` | `data/demo/02b_misc_income_breakout_june.csv` |

**Expected:** `$36,580` total; findings F1 excluded-revenue `$1,980` (dispute),
F2 inflated-GOP `$6,600` (dispute), F3 centralized-services `$28,000`
(request-explanation); confidence `0.96`; trace exactly **3 LLM + 7 TOOL**; the
run does **not** pause. This is the immovable regression from `CLAUDE.md`.

---

## Case 2 — Clean, no leakage

Files: `cases/clean-no-leakage/` — HMA + one June statement where **every fee is
charged correctly**:

- Base fee = 3.0% × Total Operating Revenue = 3.0% × $1,400,000 = **$42,000** (charged $42,000).
- Incentive = 10% × GOP; GOP = $1,400,000 − $480,000 dept − $220,000 undistributed = $700,000 → 10% = **$70,000** (charged $70,000).
- No §4.3-excluded revenue is in the fee base; **no centralized-services / pass-through charge** (see note ‡).
- Every schedule foots. Total fees charged $112,000 = expected $112,000 → variance **$0**.

**Expected:** completes, **$0** overcharge, **0 findings**, memo header
**"No fee issues identified"**, confidence 73%.

> ‡ **Why no reimbursable line in the clean case.** The calculator recomputes only
> base + incentive fees; any charge in the `MANAGEMENT FEES` block that it can't
> reproduce becomes variance. A centralized/pass-through charge is therefore
> **never** silently "clean": above the $10k threshold it is a finding, and below
> it, its dollars surface as unexplained variance (a NEEDS_REVIEW pause). So a
> genuinely $0 statement omits it. This behaviour is written up in FINDINGS.md.

---

## Case 3 — Human-in-the-loop pause

Files: `cases/hitl-pause/` — the same HMA + a statement identical to the clean one
**plus a Centralized Services charge of $25,000** and **no support/invoice pack**.

**Why it pauses (the trigger):** $25,000 > the HMA §5.1 **$10,000** approval
threshold, so it's flagged as a pass-through charge. With **no support pack** to
verify it, the decision engine will not assert or dismiss it — it emits a
`human_review` finding, which the run turns into a cited **PendingQuestion** and
**pauses** (`awaiting_input`, HTTP 202) instead of finishing.

**Expected:**
- Run page shows **"Needs your input"** + the question *"Did the owner authorize
  the Centralized Services charge of $25,000?"* with options **authorized** /
  **not_authorized**.
- Answer **"No — there is no approval on file"** → the run replays and **completes**;
  the finding resolves to *request explanation* ($25,000), and a **HUMAN** ("Apply
  owner instructions") badge appears in the trace.
- Answer **"Yes — the owner authorized this charge"** instead → the finding is
  approved and drops out of the dispute total.

To reproduce the pause with a fresh case, do **not** upload a Collated-Invoices file.

---

## Case 4 — Malformed input (three honest-rejection variants)

Files: `cases/malformed/`.

| Variant | How to trigger | Expected |
|---|---|---|
| **a. Corrupt export** | Upload `corrupt_export_SYNTHETIC.csv` in the Operating Statement slot | Parse status **failed**, warning *"File is not a readable CSV (binary/PDF content)."* Parsing screen shows **Failed**; nothing analysed |
| **b. Wrong-columns CSV** | Upload `wrong_columns_SYNTHETIC.csv` in the Operating Statement slot | Parse status **ready** → run-audit returns **HTTP 500** (generic error). Run page shows *"The audit could not run."* Nothing is fabricated, **but** the failure is ungraceful — logged as a bug in FINDINGS.md |
| **c. Missing required doc** | Upload only the HMA (omit the statement) | `POST /api/cases` → **HTTP 400** `missing_required_document`. In the UI the **Upload** button stays disabled until both required docs are attached |

All three prove the product refuses to invent an analysis for input it can't read.

---

## How to run

### Via the deployed UI (what a UAT tester does)
1. Open http://65.20.86.52 → **Upload documents & run audit**.
2. Attach the files for the case (HMA + Operating Statement required; others optional).
3. Watch the parsing screen → agent trace → open the report. Follow
   [UAT-script.md](./UAT-script.md) step by step.

### Via the API (quick regression, no browser)
```bash
BASE=http://65.20.86.52
# 1) upload -> {caseId, status:"parsing"} (HTTP 202)
resp=$(curl -s -X POST $BASE/api/cases \
  -F "hma=@qa/uat/cases/clean-no-leakage/Cedarcliff_HMA_SYNTHETIC.txt" \
  -F "statement=@qa/uat/cases/clean-no-leakage/Cedarcliff_June_statement_CLEAN_SYNTHETIC.csv" \
  -F "draftEmail=true")
cid=$(echo "$resp" | jq -r .caseId)
# 2) poll until status == ready | failed
curl -s $BASE/api/cases/$cid | jq '{status, parseWarnings}'
# 3) run the audit -> 200 completed | 202 awaiting_input | 409 parsing | 422 failed
curl -s -X POST $BASE/api/cases/$cid/run-audit | jq '{status, n:(.findings|length), total:([.findings[].suspectedImpact]|add)}'
# 4) if awaiting_input: answer, then it replays
#    curl -s -X POST $BASE/api/cases/$cid/answers -H 'content-type: application/json' \
#      -d '{"answers":{"<questionId>":"not_authorized"}}'
# 5) full report
curl -s $BASE/api/cases/$cid/report | jq '.totalSuspectedOvercharge'
```

There is a convenience runner used during kit authoring at
`scripts/uat-run-case.sh` (poll → run → summarise a caseId).
