# PRD: Hotel Owner Fee Forensics Agent

## 1. Product Name

**Working product name:** FeeForensics

**One-line pitch:** An owner-side enterprise agent that audits hotel operator fees by reading hotel management agreements, recalculating fees from monthly operating statements, finding leakage, and generating a cited dispute-ready memo.

## 2. Problem Statement

Hotel owners, real estate investment groups, and hospitality asset managers pay operators every month based on formulas buried in long hotel management agreements. These formulas often include base management fees, incentive management fees, brand/system fees, reservation fees, and reimbursable/pass-through expenses.

The issue is not only the fee percentage. The hard part is determining the correct fee base: what counts as gross operating revenue, what is excluded, how GOP/AGOP/NOI is calculated, whether owner approval was required, and whether expenses were passed through correctly.

Today, this work is usually reviewed manually by asset managers, accountants, lawyers, or finance teams. A small misclassification can create meaningful overcharges across one property and can compound across a hotel portfolio.

## 3. Why This Problem Is Real

Public industry sources support the underlying workflow:

- Hotel management agreements commonly pay operators a base fee of roughly 2% to 4% of total operating revenue, plus incentive fees. HVS notes that 3% is common and that incentive management fees are often layered on top. [Source: HVS](https://www.hvs.com/article/9912-a-new-approach-to-hotel-management-fees)
- Real hotel management agreements can include audit rights for incentive fee calculations and correction mechanisms when overpayments or underpayments are found. [Source: SEC filing](https://www.sec.gov/Archives/edgar/data/1745032/000155837021011697/tmb-20210630xex10d45.htm)
- Hospitality asset managers already validate operator claims, enforce management agreement rights, and verify whether incentive fees reflect real value creation. [Source: Mews](https://www.mews.com/en/blog/hospitality-asset-management)
- HMA fee structures typically include base fees tied to revenue and incentive fees tied to adjusted gross operating profit or similar profitability metrics. [Source: DLA Piper](https://www.dlapiperintelligence.com/hotelmanagement/countries/index.html?t=fees)

## 4. Target Users

### Primary Users

1. **Hotel owners**
   - Own one or more hotel properties.
   - Need confidence that operator fees are being charged correctly.

2. **Hospitality asset managers**
   - Review monthly operating packages.
   - Challenge budget assumptions, operator claims, and unexplained fee spikes.

3. **Real estate investment groups / hotel REIT finance teams**
   - Manage portfolios of properties.
   - Need scalable review across many monthly statements.

### Secondary Users

1. **Hospitality lawyers**
   - Need clause-backed fee analysis for disputes.

2. **Controllers / finance operations teams**
   - Need reconciliation between contracts, statements, and payment records.

## 5. Core User Story

As a hotel owner or asset manager, I want to upload a hotel management agreement and monthly operating package so that an agent can investigate whether operator fees were calculated correctly, explain any suspected leakage with citations, and generate a dispute-ready audit memo.

## 6. Core Features for Hackathon MVP

### Feature 1: Demo Dataset Loader

The app should include a preloaded synthetic hotel case so judges can run the demo instantly without uploading files.

Required sample documents:

- Synthetic hotel management agreement
- Current month operating statement
- Current month P&L
- Gross revenue schedule
- GOP/AGOP calculation
- Prior month statements
- Brand/system fee schedule

### Feature 2: Document-Grounded Retrieval

The system must retrieve relevant passages from uploaded or preloaded documents.

Required retrieval targets:

- Base management fee clause
- Incentive fee clause
- Gross revenue definition
- Excluded revenue definition
- Reimbursable expense clause
- Owner approval threshold clause
- Audit/correction rights clause

### Feature 3: Agentic Multi-Step Workflow

The demo must clearly show an agent, not a single RAG response.

Minimum agent steps:

1. Plan investigation.
2. Retrieve fee clauses.
3. Extract fee rules into structured JSON.
4. Retrieve monthly financial inputs.
5. Call deterministic fee calculator.
6. Retrieve prior month statements to detect anomalies.
7. Check suspicious line items against exclusions/approval clauses.
8. Decide whether each issue is valid, suspicious, or needs human review.
9. Generate cited audit memo and draft dispute email.

### Feature 4: Deterministic Fee Calculator Tool

The calculator must not rely on the LLM for arithmetic.

It should calculate:

- Base management fee
- Incentive management fee
- Allowed versus charged fee
- Overcharge / undercharge amount
- Line-item impact by issue

### Feature 5: Agent Trace Viewer

The UI should show the agent’s reasoning workflow at a high level.

Show:

- Step name
- Tool used
- Retrieval query or calculation input
- Short result
- Status: completed / warning / needs review

Do not expose private chain-of-thought. Show an operational trace only.

### Feature 6: Fee Audit Memo

The final memo should include:

- Executive summary
- Total suspected overcharge
- Issue table
- Calculation breakdown
- Clause citations
- Evidence citations
- Confidence score
- Recommended next action

### Feature 7: Draft Dispute Email

Generate a short, professional email the owner could send to the operator.

The email should reference:

- suspected overcharge amount
- relevant fee clause
- supporting schedule
- request for correction or explanation

## 7. Leakage Types to Support in Demo

MVP should support 3 leakage scenarios:

1. **Excluded revenue included in fee base**
   - Example: insurance proceeds or banquet cancellation revenue included in gross operating revenue.

2. **Incentive fee calculated on inflated GOP/AGOP**
   - Example: one-time revenue or misclassified expenses push profit above the incentive threshold.

3. **Improper pass-through expense**
   - Example: corporate support, software, or travel passed through even though it should be covered by the base management fee or required owner approval.

Stretch leakage scenarios:

4. Brand/system fee applied to the wrong revenue base.
5. Capital expenditure treated as operating expense.
6. Prior-period adjustment not refunded.

## 8. Out of Scope for Hackathon MVP

- Real hotel contracts or real customer data
- Legal advice
- Automated payment recovery
- Fully general contract analysis across every HMA format
- Production authentication and role-based access control
- Full accounting system integration
- Complex OCR for scanned documents
- Dashboard as the main product

## 9. Success Criteria

### Demo Success Criteria

Because demo is 50% of judging, success means the demo works smoothly end-to-end.

The demo should:

- Run from a preloaded sample case in under 3 minutes.
- Show at least 6 agent steps.
- Retrieve from documents more than once.
- Call at least one deterministic calculation tool.
- Produce a final memo with citations.
- Show a confidence score.
- Identify at least one correct leakage issue.
- Produce a draft dispute email.

### Product Success Criteria

- The value proposition is clear within 30 seconds.
- A judge can understand who uses it and why.
- The output feels like something an owner, asset manager, or finance team could actually use.
- The project is clearly not a basic RAG app or a dashboard.

### Technical Success Criteria

- Uses Vultr in the core path, preferably Vultr Serverless Inference for LLM calls.
- Public repository.
- Clear commit history showing hackathon work.
- No real contracts, real hotel data, or secrets committed.
- Environment variables documented in `.env.example`.

## 10. Judging Alignment

### Impact: 25%

FeeForensics helps hotel owners and asset managers recover or prevent fee leakage. The long-term version could support property portfolios, recurring monthly audits, and integration with accounting systems.

### Demo: 50%

The MVP is optimized for a live demo: preloaded case, visible agent trace, deterministic calculator, cited memo, and dispute email.

### Creativity: 15%

The idea is not hotel pricing, not revenue management, not generic finance RAG, and not a dashboard. It applies agentic document-grounded investigation to a specific hospitality-finance workflow.

### Pitch: 10%

The pitch should focus on a simple sentence: “Hotel owners pay operators using complex agreements. Our agent reruns the math, finds leakage, and produces a dispute-ready memo with citations.”
