# FeeForensics — UAT Script (one page)

**Target:** http://65.20.86.52 · **Files:** `qa/uat/cases/` and `data/demo/` ·
**Format:** each step is **Action → Expected → Pass/Fail**. No engineering
knowledge required. Tick each box. Stop and note anything that doesn't match.

> Tip: open the browser dev-tools **Network** tab (F12) for the API-down check (§7).

---

### 1 · Happy path — upload the leakage case
1. Go to http://65.20.86.52 → click **Upload documents & run audit**. → *A page with five upload slots appears.* ☐ Pass ☐ Fail
2. Attach: **HMA** = `data/demo/01_HMA_excerpt.txt`; **Operating Statement** = `02_operating_statement_june.csv`; **Past Operating Statement** = `03_operating_statement_may.csv`; **Collated Invoices** = `04_support_invoice_pack.csv`; **Supplementary** = `02b_misc_income_breakout_june.csv`. → *Each slot turns green with the file name.* ☐ Pass ☐ Fail
3. Click **Upload & run audit**. → *Parsing screen shows every document "Parsed cleanly", then auto-advances.* ☐ Pass ☐ Fail
4. Watch the **Agent Investigation** trace. → *Steps appear one by one; badges include LLM and TOOL steps; status ends **Complete**; the summary card shows **$36,580** and **96% confidence**.* ☐ Pass ☐ Fail
5. Click **View findings & memo**. → *Report shows **Total suspected overcharge $36,580**, **3 findings**, and three cards: excluded revenue **$1,980**, inflated GOP **$6,600**, centralized services **$28,000**.* ☐ Pass ☐ Fail

### 2 · Interactive report checks (do these on the Case-1 report)
6. Under a finding, click a **citation pill** (grey box, e.g. "HMA §4.3" or a statement line). → *A drawer slides in from the right showing the source document with the cited clause/line **highlighted**.* Press **Esc** to close. ☐ Pass ☐ Fail
7. Click the **confidence % / chevron** in the top-right strip. → *It expands to the per-component breakdown (Contract clarity +25, Data completeness +25, Calculation match +20, Evidence support +16, Prior-month +10).* ☐ Pass ☐ Fail
8. Scroll to **Build dispute packet** → click **Copy email**. → *Button confirms copied; paste elsewhere shows a dispute email with a Subject line and the finding amounts.* ☐ Pass ☐ Fail
9. Click **Download packet**. → *A markdown file (`dispute-packet-*.md`) downloads.* Click **Download memo** → *a memo `.md` downloads.* ☐ Pass ☐ Fail
10. In **Build dispute packet**, untick one finding. → *The dispute total and the email preview update instantly (lower total).* ☐ Pass ☐ Fail

### 3 · Human-in-the-loop — the pause & answer form
11. Start a new audit (**Upload documents**). Attach **HMA** = `qa/uat/cases/hitl-pause/Cedarcliff_HMA_SYNTHETIC.txt` and **Operating Statement** = `qa/uat/cases/hitl-pause/Cedarcliff_June_statement_HITL_SYNTHETIC.csv`. **Do not** attach a Collated-Invoices file. Run it. → *The run ends with an amber **"Needs your input"** badge and a question: "Did the owner authorize the Centralized Services charge of $25,000?"* ☐ Pass ☐ Fail
12. Select **"No — there is no approval on file"** and click **Submit answer & resume audit**. → *The run replays and finishes; a trace step **"Apply owner instructions"** appears; the report shows 1 finding ($25,000, "Request explanation").* ☐ Pass ☐ Fail

### 4 · Clean case — honest "no leakage"
13. New audit. Attach **HMA** + **Operating Statement** from `qa/uat/cases/clean-no-leakage/`. Run it. → *Completes with **$0** / **0 findings**; **Variance (overcharge) $0**; the memo header reads **"No fee issues identified"**.* ☐ Pass ☐ Fail
    *(Note the empty "Findings" section — no crash, but flag if it looks unfinished.)*

### 5 · Malformed input — honest rejection
14. New audit. Attach a valid HMA + **Operating Statement** = `qa/uat/cases/malformed/corrupt_export_SYNTHETIC.csv`. Run. → *Parsing screen shows **Failed** with "File is not a readable CSV…"; nothing is analysed.* ☐ Pass ☐ Fail
15. Try to submit with **only** an HMA (no statement). → *The **Upload & run audit** button stays **disabled**; a hint says the HMA and statement are required.* ☐ Pass ☐ Fail

### 6 · No seeded data anywhere
16. On the landing page and throughout, confirm there is **no "demo" link/route** and **no pre-filled numbers** (no `$36,580`, no "Harborline") before you upload anything. → *Landing shows only the Upload call-to-action; every number seen earlier came from a real upload.* ☐ Pass ☐ Fail

### 7 · API-down behaviour (fails honestly, no canned results)
17. With dev-tools **Network** open, block requests to `/api/*` (right-click a request → Block request domain/URL, or go offline) and start/refresh a run. → *The app shows an honest error ("Cannot reach API…" / "The audit could not run"), **never** a fabricated report or seeded numbers.* Re-enable network to continue. ☐ Pass ☐ Fail

---
**Result:** ___ / 17 Pass. Any Fail → record the step #, what you saw, and a
screenshot in FINDINGS.md. Overall UAT recommendation: ☐ Go ☐ Fix-first.
