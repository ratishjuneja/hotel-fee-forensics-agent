# Design: FeeForensics

## 1. Design Goal

Build a credible enterprise demo that feels like a finance investigation tool, not a chatbot and not a dashboard.

The UI should make three things obvious:

1. The agent is doing multiple steps.
2. The output is grounded in documents.
3. The result has business value in dollars.

## 2. Visual Style

Recommended style:

- Clean enterprise SaaS
- Dark/navy or neutral background
- White cards
- Green/red financial indicators
- Minimal animations
- Professional typography

Do not spend too much time here before the workflow works.

## 3. Information Architecture

### Top-level layout

```text
Header
  Product name
  Built with Vultr label
  Demo status

Main content
  Left: Documents / Case inputs
  Middle: Agent trace
  Right or bottom: Findings / Memo
```

For speed, a single-column layout is acceptable:

1. Case summary
2. Agent trace
3. Findings
4. Memo
5. Email

## 4. Key Components

### Component: CaseHeader

Displays:

- Hotel name
- Audit month
- Total charged fees
- Status

### Component: DocumentList

Displays:

- document name
- type
- status loaded / missing
- short purpose

### Component: AgentTrace

Displays operational trace only.

Fields:

- step number
- step name
- tool called
- summary
- evidence count
- status

### Component: FindingCard

Displays:

- issue title
- suspected amount
- severity
- evidence citation
- recommended action

### Component: CalculationBreakdown

Displays:

- charged amount
- recalculated amount
- variance
- formula

### Component: CitationPill

Displays:

- document label
- section/page/chunk

Example:

```text
HMA §4.2 — Incentive Fee
```

### Component: MemoViewer

Displays final memo in readable sections.

### Component: EmailDraft

Displays generated email with copy button.

## 5. Demo-First Design Rules

1. Agent trace must be visible.
2. Dollar impact must be visible above the fold.
3. Citations must be visible without clicking too much.
4. Avoid charts unless they directly support the finding.
5. Do not make a dashboard the main feature.
6. Use preloaded demo data to avoid file-upload risk during judging.

## 6. Suggested Page Layout

### Landing Page

```text
FeeForensics
Owner-side hotel fee audit agent
[Run Demo Audit]

What it does:
- Reads hotel management agreements
- Recalculates operator fees
- Finds fee leakage
- Generates cited dispute memo
```

### Agent Run Page

```text
Grand Harbor Hotel — June 2026 Fee Audit

Documents loaded: 6
Agent status: Running

[Agent Trace]
1. Planning audit
2. Retrieved fee clauses
3. Extracted rules
4. Ran fee calculator
5. Checked anomalies
6. Generated memo
```

### Report Page

```text
Suspected overcharge: $18,750
Confidence: 86%
Recommended action: Dispute and request correction

Findings
Memo
Draft Email
Citation Trail
```

## 7. 21st.dev / UI Polish Plan

Only use UI polish tooling after:

- backend agent works
- calculation tool works
- report renders
- demo case runs end-to-end

Potential polish prompts:

- “Make this look like an enterprise finance audit product.”
- “Improve card hierarchy and spacing.”
- “Make the agent trace feel premium but not flashy.”

Do not let UI polish cause merge conflicts late in the hackathon. One person should own visual cleanup in one branch near the end.
