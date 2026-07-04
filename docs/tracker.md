# Tracker: FeeForensics Hackathon Build

## 1. Current Status

| Area | Owner | Status | Notes |
|---|---|---|---|
| PRD/docs | Person C | Not started | Push early |
| Demo data | Person C | Not started | Synthetic only |
| Backend API | Person A | In progress | Skeleton + `/api/demo-case` (PR #3); mock `run-audit`/`report` (PR #4) |
| Vultr inference | Person A | In progress | OpenAI-compatible client stub (PR #3); not yet in live path |
| Retrieval | Person A | Not started | Needs citations |
| Fee calculator | Person A | Not started | Deterministic math |
| Frontend shell | Person B | Not started | Demo-first |
| Agent trace UI | Person B | Not started | Must prove agentic flow |
| Findings UI | Person B | Not started | Dollar impact visible |
| Memo/email output | Person B | Not started | Final artifact |
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
- [ ] Add deterministic fee calculator
- [ ] Add anomaly checker
- [ ] Add agent orchestrator
- [ ] Add report generator
- [ ] Add confidence scoring

### Frontend

- [ ] Landing page
- [ ] Demo case overview page
- [ ] Run audit button
- [ ] Agent trace UI
- [ ] Findings cards
- [ ] Calculation breakdown
- [ ] Memo viewer
- [ ] Draft email viewer
- [ ] Copy button
- [ ] Final UI polish

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
