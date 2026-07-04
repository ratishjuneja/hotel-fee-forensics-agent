# App Flow: FeeForensics

## 1. MVP Screens

### Screen 1: Landing / Case Start

Purpose: Start the demo quickly.

Required elements:

- Product name: FeeForensics
- One-line description
- Primary button: “Run Demo Audit”
- Secondary option: “Upload Documents” as disabled or stretch
- Short “Built with Vultr Serverless Inference” label

### Screen 2: Case Overview

Purpose: Show what documents the agent will use.

Required sections:

- Hotel name
- Audit month
- Uploaded / preloaded documents
- Expected outputs
- Button: “Start Agent Investigation”

Documents shown:

- Hotel Management Agreement
- Monthly Operating Statement
- P&L Statement
- Gross Revenue Schedule
- Prior Month Statements
- Brand/System Fee Schedule

### Screen 3: Agent Investigation Trace

Purpose: Prove this is an agent, not basic RAG.

Trace rows should show:

- Step number
- Step title
- Tool used
- Result summary
- Status

Example steps:

1. Planning audit workflow
2. Retrieving base and incentive fee clauses
3. Retrieving revenue exclusions
4. Extracting fee rules
5. Running fee calculator
6. Checking prior-month anomalies
7. Investigating pass-through expenses
8. Generating memo

### Screen 4: Findings Summary

Purpose: Show the money impact clearly.

Required elements:

- Total suspected overcharge
- Confidence score
- Finding cards
- Issue severity
- Recommended action

Example finding cards:

- Excluded revenue included in base fee
- Incentive fee calculated on inflated AGOP
- Corporate support charged without approval

### Screen 5: Audit Memo

Purpose: Show enterprise-ready output.

Required sections:

- Executive summary
- Calculation breakdown
- Cited evidence
- Recommended next action

### Screen 6: Draft Dispute Email

Purpose: Show the final action artifact.

Required elements:

- Email subject
- Email body
- Copy button

## 2. Route Structure

Recommended routes:

```text
/                       Landing
/cases/demo             Demo case overview
/cases/demo/run         Agent trace / running state
/cases/demo/report      Final memo and email
```

## 3. Demo Flow Timing

Target live demo time: 3 minutes.

Suggested sequence:

1. 20 seconds: explain problem.
2. 20 seconds: open demo case.
3. 60 seconds: run/show agent trace.
4. 60 seconds: explain findings and calculations.
5. 30 seconds: show memo and email.
6. 10 seconds: close with impact.

## 4. UI Priority

Because judging gives 50% to demo implementation, prioritize working flow over visual polish.

Must look clean enough, but do not overbuild UI.

UI hierarchy:

1. Working demo
2. Clear agent trace
3. Clear money impact
4. Cited final memo
5. Visual polish

Use 21st.dev or similar only after the core flow is stable.

## 5. Loading States

During agent run, show step-by-step progress.

Avoid a single spinner.

Example:

```text
✓ Retrieved incentive fee clause
✓ Extracted AGOP threshold
✓ Recalculated operator fee
⚠ Found suspicious pass-through expense
✓ Generated audit memo
```

## 6. Error States

If Vultr inference call fails:

- Show friendly error.
- Let user retry.
- Keep sample output available only for emergency demo fallback.

If a document is missing:

- Mark missing evidence.
- Lower confidence score.
- Continue with available docs.

## 7. Output Formatting

Finding card format:

```text
Finding: Excluded revenue included in fee base
Impact: $6,000 suspected overcharge
Evidence: Gross Revenue Schedule, line 14
Clause: HMA Section 4.1(b)
Status: Dispute recommended
Confidence: High
```

Memo format:

```text
Executive Summary
Findings Table
Calculation Breakdown
Citation Trail
Recommended Next Action
Draft Email
```
INPUTS (uploaded by user)
   ┌──────────────┬───────────────────┬──────────────┬───────────────┐
   │  HMA (PDF)   │ Current monthly   │ Prior-month  │ Support docs  │
   │  contract    │ operating pkg     │ statement    │ (invoices,    │
   │              │ (USALI P&L)       │              │  approvals)   │
   └──────┬───────┴─────────┬─────────┴──────┬───────┴───────┬───────┘
          │                 │                │               │
          ▼                 ▼                │               │
  ┌─────────────────────────────────────┐   │               │
  │ STEP 0 — PLAN (LLM)                  │   │               │
  │ Reads what was uploaded, identifies  │   │               │
  │ which fee families are present.      │   │               │
  │ out: audit scope list               │   │               │
  └──────────────┬──────────────────────┘   │               │
                 │                            │               │
      ┌──────────┴───────────┐               │               │
      ▼                      ▼               ▼               ▼
┌───────────────┐   ┌──────────────────────────────────────────────┐
│ LEGAL fn      │   │ ACCOUNTING fn                                │
│ (LLM extract) │   │ (deterministic mapper)                       │
│               │   │                                              │
│ in: HMA text  │   │ in: operating statement lines                │
│ does: pull    │   │ does: map each line to USALI schedule slot   │
│  fee clauses  │   │  (departmental / undistributed / below-GOP)  │
│ out: FeeRule  │   │ out: USALI-normalized statement              │
│  JSON per fee │   │                                              │
└──────┬────────┘   └───────────────────┬──────────────────────────┘
       │                                │
       │      (FeeRule)      (normalized statement + prior month + support)
       └──────────────┬─────────────────┘
                      ▼
       ┌───────────────────────────────────────────────┐
       │ FINANCE fn — THE 5 CHECKS (deterministic code) │
       │                                                │
       │ 1 Base recompute:  rate × defined base vs charged
       │ 2 Inclusion check: base line-items vs contract exclusions
       │ 3 GOP/AGOP check:  required deductions applied? (finite list)
       │ 4 Drift check:     effective rate / base mix vs prior month
       │ 5 Reclass check:   line landed in right USALI slot?
       │                                                │
       │ out: one Variance per fee (expected vs charged │
       │      + which check fired + evidence refs)      │
       └───────────────────┬───────────────────────────┘
                           │   (if a line is ambiguous → loop back:
                           │    retrieve support doc / prior month,
                           │    re-run the affected check)
                           ▼
       ┌───────────────────────────────────────────────┐
       │ DECISIONING fn (rules-based classifier)        │
       │                                                │
       │ in: each Variance + evidence                   │
       │ does: classify → valid / overcharge /          │
       │       unsupported / ambiguous / human-review   │
       │       + compute confidence (deterministic sum) │
       │ out: Finding[] with severity, $ impact,        │
       │      citations, confidence                     │
       └───────────────────┬───────────────────────────┘
                           ▼
       ┌───────────────────────────────────────────────┐
       │ OUTPUT fn (LLM writes prose around fixed facts) │
       │                                                │
       │ out: • Fee audit memo (findings + $ + citations)
       │      • Calculation appendix (the math)          │
       │      • Draft dispute email to operator          │
       │      • Confidence score (visible sum of parts)  │
       └───────────────────────────────────────────────┘
