# App Flow: FeeForensics

## 0. Design Rule (read before building any screen)

One rule governs every screen below: **the LLM reads and writes; deterministic code maps, calculates, and decides.** The UI must make this visible, not hide it. Every number and every classification on screen comes from deterministic code. The model only (a) extracts contract clauses into structured rules and (b) writes prose around already-fixed facts. When a judge asks "how do I trust the numbers," the trace itself should already answer it. If a screen makes the calculator look like just another AI step, that screen is wrong.

## 1. MVP Screens

### Screen 1: Landing / Case Start
Purpose: Start the demo quickly.
Required elements:
- Product name: FeeForensics
- One-line description
- Primary button: “Run Demo Audit”
- Secondary option: “Upload Documents” shown as disabled (stretch only)
- Short “Built with Vultr Serverless Inference” label

### Screen 2: Case Overview
Purpose: Show what documents the agent will use.
Required sections:
- Hotel name
- Audit month
- Preloaded documents (audited vs. reference-only, clearly labeled)
- Expected outputs
- Button: “Start Agent Investigation”

Documents shown (four audited + reference):
- Hotel Management Agreement — *audited (source of rules)*
- Monthly Operating Statement (USALI format) — *audited*
- Prior-Month Operating Statement — *audited (anomaly baseline)*
- Support / Invoice Pack — *audited (evidence for pass-throughs)*

Note: show only what the demo actually exercises. Do not list documents the agent will not open — every document displayed must reconcile with the others, or the seam is visible to a judge. P&L / gross-revenue detail live *inside* the operating package, not as separate uploads.

### Screen 3: Agent Investigation Trace
Purpose: Prove this is an agent (conditional, multi-step, tool-using), not linear RAG.

Each trace row shows:
- Step number
- Step title
- **Type badge: `LLM` (reasoning/extraction) or `TOOL` (deterministic)** — this badge is required; it is what visibly separates this from RAG
- Result summary
- Status (running / done / flagged)

The trace must show at least one **conditional re-retrieval loop** — a step that comes back inconclusive and sends the agent *back* to fetch more evidence before continuing. That back-loop is the single clearest proof of "agent, not chatbot."

Example steps (note the badges and the loop at 6→7→8):
1. `LLM` — Plan audit scope (identify fee families present)
2. `LLM` — Retrieve base + incentive fee clauses from HMA
3. `LLM` — Retrieve revenue exclusions + AGOP deduction clauses
4. `LLM` — Extract fee rules → structured JSON (rate, base, exclusions, thresholds)
5. `TOOL` — Recompute base + incentive fees (deterministic calculator)
6. `TOOL` — Run inclusion + AGOP-deduction checks → **incentive-fee variance found**
7. `LLM` — Variance ambiguous → **retrieve prior-month statement + support pack** *(this is the loop)*
8. `TOOL` — Re-run checks with new evidence → confirm anomaly, no approval on file
9. `TOOL` — Classify findings + compute deterministic confidence
10. `LLM` — Generate audit memo + dispute email

Make `TOOL` rows visually distinct (different color/icon). A judge scanning the trace should instantly see that every number came from a deterministic step.

### Screen 4: Findings Summary
Purpose: Show the money impact clearly, and prove each finding came from a *method*.

Required elements:
- Total suspected overcharge (sum of deterministic variances)
- Overall confidence (deterministic sum — expandable to components; see §7)
- Finding cards, each **labeled with the check that produced it**
- Issue severity
- Recommended action

Example finding cards (each tagged with its detection check):
- Excluded revenue included in incentive base — *(Check 2: Inclusion)*
- Incentive fee calculated on under-deducted AGOP — *(Check 3: GOP/AGOP)*
- Corporate support charged without required approval — *(Check 5: Reclassification/approval)*

### Screen 5: Audit Memo
Purpose: Show enterprise-ready output.
Required sections:
- Executive summary
- Calculation breakdown (the actual math per fee)
- Cited evidence (clause + statement line per finding)
- Recommended next action
- **Download button** (an artifact the owner keeps reads more enterprise than on-screen text)

### Screen 6: Draft Dispute Email
Purpose: Show the final action artifact.
Required elements:
- Email subject
- Email body (references the audit window / true-up deadline)
- Copy button

## 2. Route Structure
```text
/                       Landing
/cases/demo             Demo case overview
/cases/demo/run         Agent trace / running state
/cases/demo/report      Final memo and email
```
(No upload route — the upload path is disabled for the demo; do not build it.)

## 3. Demo Flow Timing
Target live demo time: 3 minutes.
1. 20s — explain the problem (monthly gap: fast shallow review vs. slow annual audit)
2. 20s — open demo case, show the four audited docs
3. 60s — run the trace; **narrate the TOOL badges and the re-retrieval loop**
4. 60s — walk the findings; point at the calculator's numbers and the check labels
5. 30s — show memo + dispute email
6. 10s — close on impact

Rehearse whether the real trace completes inside 60s on Vultr's endpoint. If not, the cached replay (§6) is the plan, not the panic.

## 4. UI Priority
Judging gives 50% to demo implementation → prioritize working flow over polish.
1. Working end-to-end flow
2. Clear agent trace (with LLM/TOOL split + visible loop)
3. Clear money impact tied to checks
4. Cited, downloadable final memo
5. Visual polish
Use 21st.dev or similar only after the core flow is stable.

## 5. Loading States
During the run, stream step-by-step progress. Never a single spinner. Reflect the LLM/TOOL split and the loop:
```text
✓ [LLM]  Retrieved incentive fee clause
✓ [LLM]  Extracted AGOP threshold + exclusions
✓ [TOOL] Recalculated operator fee
⚠ [TOOL] Incentive-fee variance detected
↩ [LLM]  Ambiguous — retrieving prior month + support pack
✓ [TOOL] Re-checked: anomaly confirmed, no approval on file
✓ [LLM]  Generated audit memo
```

## 6. Error / Fallback States
Vultr inference call fails:
- Show a friendly error with retry.
- Keep a cached, pre-recorded run as a **silent replay** the presenter can trigger. Pre-decide the trigger: if the first trace event hasn't appeared within ~10s, switch to replay without commentary. This is a normal fallback, not an "error" the audience sees.

Document required for a specific check is missing:
- That check returns **“Cannot assess — evidence missing,”** NOT a lowered score.
- Confidence is not a dial you turn down; it is a statement of which checks actually ran. Never imply a check passed when its evidence was absent.
- Continue with the checks that *can* run, and label the untested ones explicitly.

## 7. Output Formatting

Finding card (note: check attribution + expandable confidence, not a vibe label):
```text
Finding:     Excluded revenue included in incentive base
Detected by: Check 2 — Inclusion
Impact:      $6,000 suspected overcharge
Evidence:    Operating Statement, Gross Revenue line 14
Clause:      HMA §4.1(b) (banquet cancellation revenue excluded)
Status:      Dispute recommended
Confidence:  0.86  ▸ (expand: clarity +25 / data +25 / calc-match +20 /
                       evidence +16 / prior-month +0)
```
Confidence is the deterministic sum of its components (per build spec §9), displayed as a number that expands to show the parts. Do not render a bare "High/Low."

Memo format:
```text
Executive Summary
Findings Table        (each row tagged with its detection check)
Calculation Breakdown (per-fee math, deterministic)
Citation Trail        (clause + statement line per finding)
Recommended Next Action (references audit-window deadline)
Draft Email
```
