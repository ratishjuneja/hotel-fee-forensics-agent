# Workflow / Implementation Plan: FeeForensics

## 1. Core Principle

Build the demo path first.

The hackathon is 20 hours and demo is 50% of judging. The MVP should make one synthetic case work extremely well instead of supporting every possible hotel contract.

## 2. Recommended Repo Folder Name

Use this repo/folder name:

```text
hotel-fee-forensics-agent
```

Recommended structure:

```text
hotel-fee-forensics-agent/
  apps/
    web/
    api/
  packages/
    agent/
    shared/
  data/
    demo/
  docs/
  pitch/
  .env.example
  README.md
```

Put these planning docs in:

```text
docs/
```

## 3. Should These Docs Be Pushed to Remote?

Yes.

Because the rules require a public repository and new work, push these docs early.

Push:

- PRD
- TechSpec
- UserJourney
- AppFlow
- Design
- Schema
- Workflow
- tracker
- synthetic sample data
- source code built during the hackathon

Do not push:

- `.env`
- API keys
- real hotel contracts
- real financial statements
- private team notes with sensitive info
- any paid/proprietary assets you do not have rights to

Use `.env.example` instead.

## 4. 20-Hour Implementation Plan

### Hour 0–1: Alignment and Repo Setup

Owner: all team members

Tasks:

- Confirm idea and demo story.
- Create public GitHub repo.
- Add docs folder.
- Add `.env.example`.
- Decide stack.
- Create branches.
- Assign file ownership.

Exit criteria:

- Everyone knows their lane.
- Remote repo exists.
- First commit pushed.

### Hour 1–3: Skeleton App

Coder 1:

- Backend API skeleton.
- Vultr inference client stub.
- Demo case endpoint.

Coder 2:

- Frontend skeleton.
- Landing page.
- Demo case page.

Person 3:

- Synthetic hotel case docs.
- Expected overcharge answer.
- Pitch draft.

Exit criteria:

- Web app runs locally.
- API returns demo case.
- Synthetic documents exist.

### Hour 3–6: Document Retrieval and Demo Data

Coder 1:

- Document parser/chunker.
- Retrieval function.
- Citation objects.

Coder 2:

- Document list UI.
- Agent trace UI with mock data.

Person 3:

- Validate synthetic data.
- Create manually calculated expected answer.
- Add sample citations/clauses.

Exit criteria:

- Backend can retrieve relevant chunks.
- UI can show document list and trace.

### Hour 6–10: Agent Workflow and Calculator

Coder 1:

- Agent orchestrator.
- Fee rule extraction.
- Fee calculator.
- Anomaly checker.

Coder 2:

- Run audit button.
- Live or staged trace updates.
- Findings UI.

Person 3:

- Test agent output against expected answer.
- Write pitch talking points.
- Update tracker.

Exit criteria:

- Agent produces findings and calculation variance.
- Trace shows multiple steps.

### Hour 10–14: Report and Email Output

Coder 1:

- Report generator.
- Dispute email generator.
- Confidence scoring.

Coder 2:

- Memo viewer.
- Email draft viewer.
- Copy/export button.

Person 3:

- QA the memo wording.
- Make sure claims have citations.
- Prepare demo script.

Exit criteria:

- End-to-end demo works locally.

### Hour 14–17: Vultr Integration and Deployment

Coder 1:

- Ensure LLM calls go through Vultr Serverless Inference.
- Add error handling.

Coder 2:

- Deploy frontend/backend if feasible.
- Polish loading states.

Person 3:

- Record backup demo if allowed.
- Prepare final pitch.
- Validate public repo contents.

Exit criteria:

- Demo works with Vultr in the path.
- Repo is clean.

### Hour 17–19: UI Polish and Rehearsal

Coder 1:

- Fix bugs.
- Add unit tests for calculator if not already done.

Coder 2:

- Apply final UI polish.
- Use 21st.dev only now if core demo is stable.

Person 3:

- Time the pitch.
- Prepare judging answers.
- Confirm original contributions are clear.

Exit criteria:

- Demo can be completed in under 3 minutes.

### Hour 19–20: Freeze and Submit

All:

- Stop large changes.
- Only critical fixes.
- Submit repo.
- Rehearse once more.

Exit criteria:

- No broken main branch.
- No secrets committed.
- Clear README/demo instructions.

## 5. Three-Person Task Split

### Person A: Backend / Agent Engineer

Coding-heavy.

Owns:

- backend API
- Vultr inference integration
- document chunking/retrieval
- agent orchestrator
- fee calculator
- confidence scoring

Directories owned:

```text
apps/api/
packages/agent/
packages/shared/types.ts
```

Branches:

```text
feat/backend-api
feat/agent-orchestrator
feat/fee-calculator
```

### Person B: Frontend / Demo Engineer

Coding-heavy.

Owns:

- Next.js frontend
- case overview page
- agent trace UI
- findings UI
- memo/email UI
- final UI polish

Directories owned:

```text
apps/web/
```

Branches:

```text
feat/frontend-shell
feat/agent-trace-ui
feat/report-ui
chore/ui-polish
```

### Person C: Product / Data / QA / Pitch

Lower-code teammate.

Owns:

- synthetic hotel documents
- CSV financial schedules
- expected calculation answer
- pitch script
- README/demo instructions
- tracker updates
- QA checklist
- judging criteria alignment

Directories owned:

```text
docs/
data/demo/
pitch/
```

Branches:

```text
docs/prd-pack
feat/demo-data
pitch/final-script
```

Person C can also help by:

- manually checking calculations
- writing finding descriptions
- testing the app as a judge
- recording bugs in tracker
- making sure citations match claims

## 6. Merge Conflict Prevention Rules

1. One owner per directory.
2. Do not edit another person’s owned files without asking.
3. Create shared API types early and avoid changing them without coordination.
4. No global formatting runs late in the hackathon.
5. Use small PRs.
6. Rebase or pull latest main before opening PR.
7. Merge docs/data first, then backend shell, then frontend shell, then integration.
8. Use one integration branch near the end if needed.
9. Freeze major changes in the last hour.

## 7. Suggested PR Order

1. `docs/prd-pack` → main
2. `feat/demo-data` → main
3. `feat/backend-api` → main
4. `feat/frontend-shell` → main
5. `feat/fee-calculator` → main
6. `feat/agent-orchestrator` → main
7. `feat/agent-trace-ui` → main
8. `feat/report-ui` → main
9. `chore/ui-polish` → main
10. `pitch/final-script` → main

## 8. What to Discuss With Co-Dev Before Coding

Discuss these before writing code:

1. Final stack: Fastify or FastAPI, Next.js or other frontend.
2. Exact API contract for `run-audit`.
3. Whether sample data is preprocessed markdown/CSV or uploaded PDFs.
4. How citations are represented.
5. Where Vultr is used in the live path.
6. Who owns shared types.
7. Whether the agent trace is streamed or returned all at once.
8. Final expected overcharge number for demo.
9. Branch ownership and PR order.
10. What is MVP versus stretch.

## 9. MVP Cutline

If time is short, keep only:

- Preloaded demo case
- Vultr LLM call
- Retriever
- Fee calculator
- Agent trace
- Findings
- Memo
- Email

Cut:

- Auth
- User accounts
- Complex file upload
- Production DB
- Complex charts
- Full OCR
- Advanced UI animations

## 10. Final Demo Script

Simple script:

1. “Hotel owners pay operators using formulas buried in long agreements.”
2. “Small definition errors can cause real fee leakage.”
3. “Our agent reviews the agreement and monthly operating package.”
4. “It retrieves clauses, extracts rules, reruns the math, checks anomalies, and generates a cited dispute memo.”
5. “Here it found a suspected overcharge and produced an email the owner can send.”
