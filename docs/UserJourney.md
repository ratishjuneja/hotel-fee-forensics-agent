# User Journey: FeeForensics

## 1. Main User Persona

**Name:** Maya

**Role:** Hospitality asset manager at a real estate investment group

**Context:** Maya reviews monthly operating packages from hotel operators. She needs to know whether operator fees were calculated correctly before approving payments.

## 2. Current Pain

Maya receives a monthly operating package with:

- P&L statement
- revenue schedule
- GOP/AGOP calculation
- operator fee summary
- brand/system fees
- pass-through expense details

The hotel management agreement is long and clause-heavy. Maya has to manually check:

- fee percentages
- revenue definitions
- exclusions
- incentive fee thresholds
- owner approval requirements
- prior-month anomalies
- whether a disputed line item is allowed

This takes time and is easy to miss under deadline pressure.

## 3. Desired Outcome

Maya wants a first-pass investigation that tells her:

- whether fees appear correct
- where leakage may exist
- which clauses support the finding
- what the recalculated amount should be
- whether she should approve, dispute, or request clarification

## 4. Happy Path Journey

### Step 1: Open App

Maya opens FeeForensics.

She sees a simple page:

- “Start Demo Audit”
- “Upload Case” as a stretch option
- short explanation of what the agent does

### Step 2: Start Demo Case

Maya clicks **Start Demo Audit**.

The app loads a synthetic case:

- Grand Harbor Hotel
- June 2026 operating package
- hotel management agreement
- prior month statements
- brand fee schedule

### Step 3: Agent Plans Investigation

The agent shows a trace item:

> Planning investigation: base fee, incentive fee, excluded revenue, pass-through expenses, prior-month anomalies.

### Step 4: Agent Retrieves Fee Clauses

The agent retrieves:

- base management fee clause
- incentive fee clause
- gross revenue definition
- excluded revenue definition

The UI shows citations next to retrieved snippets.

### Step 5: Agent Extracts Rules

The agent converts clauses into structured rules:

- base fee = 3% of Gross Operating Revenue
- incentive fee = 12% of AGOP above owner priority threshold
- insurance proceeds excluded from revenue
- corporate overhead not reimbursable unless pre-approved

### Step 6: Agent Calls Calculator

The calculator recomputes fees from the operating statement.

It compares:

- charged fees
- expected fees
- variance

### Step 7: Agent Investigates Causes

The agent retrieves more evidence:

- current month revenue schedule
- prior month statement
- pass-through expense detail
- audit rights clause

It finds suspicious issues.

### Step 8: Agent Produces Output

Maya receives:

- fee audit memo
- issue table
- calculation breakdown
- citations
- confidence score
- draft dispute email

### Step 9: User Decides Next Action

Maya can:

- approve fees
- send dispute email
- request operator clarification
- export memo

For hackathon MVP, only memo and email generation are required.

## 5. Demo Story

The demo should tell this story:

> The operator charged fees for June. Our agent investigated the management agreement and monthly operating package. It found that excluded banquet cancellation revenue was included in the fee base and that corporate support was passed through without owner approval. It recalculated the fees and generated a cited dispute memo showing a suspected overcharge.

## 6. Failure / Human Review Journey

If the agent cannot find a clause or the financial schedule is missing, it should not hallucinate.

It should say:

- “Clause not found.”
- “Financial input missing.”
- “Human review required.”
- “Confidence reduced.”

## 7. What the User Should Remember After Demo

The user should remember one thing:

> This is an agent that acts like a first-pass hotel asset-management analyst. It reads the agreement, reruns the math, investigates anomalies, and drafts the memo.
