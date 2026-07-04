# TechSpec: FeeForensics

## 1. Technical Goal

Build a web-based enterprise agent that investigates hotel operator fee leakage from documents and financial schedules.

The system must demonstrate a multi-step agentic workflow:

- plan
- retrieve documents multiple times
- extract structured fee rules
- call deterministic tools
- make decisions
- generate a cited outcome

## 2. Recommended Stack

### Frontend

- **Next.js** with TypeScript
- Tailwind CSS
- shadcn/ui or simple component library
- Optional later polish using 21st.dev or similar UI tooling

### Backend

Choose one simple backend path and stick to it.

Recommended for speed:

- **Fastify + TypeScript**
- REST endpoints
- Zod for request/response validation
- Node-based document parsing for text/PDF/CSV

Alternative if team is more Python-comfortable:

- FastAPI + Python
- Pydantic
- pandas for CSV calculations

Do not split into too many services unless absolutely necessary.

### AI / Inference

- **Vultr Serverless Inference** for LLM calls.
- It offers an OpenAI-compatible API, making it easy to integrate through standard chat completion style clients. [Source: Vultr Serverless Inference](https://www.vultr.com/products/cloud-inference/)

### Storage

MVP options:

1. **Simplest:** local file storage and JSON metadata for demo.
2. **Better:** Vultr Object Storage for uploaded documents.
3. **Stretch:** Vultr Managed PostgreSQL for persistent case metadata.

Vultr Object Storage supports S3-compatible APIs, which makes it suitable for storing uploaded documents and sample files. [Source: Vultr Object Storage](https://www.vultr.com/products/object-storage/)

Vultr also offers Managed Databases, including PostgreSQL setup and management documentation. [Source: Vultr Managed Databases](https://docs.vultr.com/products/storage/databases)

## 3. Vultr Usage Requirement

For judging, Vultr should be in the core path, not a decorative add-on.

### Required Vultr Integration

- All LLM calls go through Vultr Serverless Inference.

### Strong Demo Add-On

- Deploy backend or full app on Vultr Cloud Compute.

### Stretch Vultr Integrations

- Store uploaded documents in Vultr Object Storage.
- Store case metadata and agent runs in Vultr Managed PostgreSQL.

## 4. System Architecture

```text
User
  ↓
Next.js Web App
  ↓
Backend API
  ↓
Agent Orchestrator
  ├── Planner Tool: decides investigation steps
  ├── Retrieval Tool: searches contract and financial docs
  ├── Rule Extractor: converts clauses into structured fee rules
  ├── Fee Calculator: deterministic arithmetic
  ├── Anomaly Checker: compares prior months
  ├── Decision Engine: classifies issues
  └── Report Generator: memo + dispute email
  ↓
Vultr Serverless Inference
  ↓
Document Store / Local Files / Object Storage
```

## 5. Key Backend Modules

### `agent/orchestrator.ts`

Coordinates the workflow.

Responsibilities:

- Create investigation plan.
- Call retrieval tool with different queries.
- Call fee rule extractor.
- Call calculation tool.
- Call anomaly tool.
- Build agent trace.
- Generate final report.

### `agent/tools/retriever.ts`

Searches document chunks.

MVP retrieval options:

- keyword/BM25-style search over chunks
- optional embedding search if available
- LLM reranking as stretch

Each retrieved chunk must include:

- document name
- page or section if available
- chunk ID
- text snippet
- citation label

### `agent/tools/feeCalculator.ts`

Deterministic calculator.

Inputs:

- extracted fee rules
- monthly financial rows
- charged fee amounts

Outputs:

- expected base fee
- expected incentive fee
- expected pass-through amount
- charged amount
- variance
- issue breakdown

### `agent/tools/anomalyChecker.ts`

Compares current month to prior months.

Examples:

- management fee increased more than revenue
- incentive fee triggered after one-time revenue
- pass-through expenses spiked
- brand/system fees changed unexpectedly

### `agent/tools/reportGenerator.ts`

Generates final memo and dispute email.

Must include citations and avoid unsupported claims.

## 6. API Endpoints

### `GET /api/demo-case`

Returns the preloaded synthetic case metadata.

### `POST /api/cases`

Creates a new case from uploaded documents.

MVP can skip upload and rely on preloaded demo case.

### `POST /api/cases/:caseId/run-audit`

Runs the full agent investigation.

Response:

```json
{
  "caseId": "case_demo_hotel_001",
  "status": "completed",
  "trace": [],
  "findings": [],
  "memo": "...",
  "emailDraft": "...",
  "confidence": 0.86
}
```

### `GET /api/cases/:caseId/report`

Returns the latest memo/report.

## 7. Agent Workflow Contract

The agent should not answer directly after one retrieval. It must follow this rough contract:

1. **Plan** investigation.
2. **Retrieve** base fee and incentive fee clauses.
3. **Retrieve** definitions and exclusions.
4. **Extract** structured fee rules.
5. **Retrieve** monthly financial schedules.
6. **Calculate** expected fees.
7. **Retrieve** prior months and audit rights.
8. **Check** anomalies and pass-through expenses.
9. **Decide** findings.
10. **Generate** memo and email.

## 8. Confidence Score

Use a transparent heuristic for the MVP.

Example:

```text
confidence = weighted average of:
- clause_found: 25%
- financial_inputs_found: 25%
- calculation_variance_clear: 25%
- cause_explained_by_evidence: 15%
- prior_month_support: 10%
```

Display confidence as a percentage with a short explanation.

## 9. Development Constraints

- 20-hour build window.
- Two coders, one lower-code teammate.
- Demo quality is more important than perfect architecture.
- Prefer preloaded data over complex upload flows.
- Prefer deterministic calculator over LLM math.
- Prefer visible trace over hidden complexity.
- Avoid building a dashboard as the main feature.

## 10. Environment Variables

Create `.env.example` with:

```bash
VULTR_INFERENCE_API_KEY=
VULTR_INFERENCE_BASE_URL=
VULTR_INFERENCE_MODEL=
VULTR_OBJECT_STORAGE_ENDPOINT=
VULTR_OBJECT_STORAGE_ACCESS_KEY=
VULTR_OBJECT_STORAGE_SECRET_KEY=
DATABASE_URL=
NODE_ENV=development
```

Do not commit `.env`.

## 11. Deployment Plan

### Minimum

- Local demo with Vultr Serverless Inference API calls.

### Better

- Deploy backend or full app to Vultr Cloud Compute.

### Best if Time Allows

- Vultr Compute + Vultr Serverless Inference + Vultr Object Storage.

## 12. Technical Risks

| Risk | Mitigation |
|---|---|
| LLM output inconsistent | Use structured JSON schemas and deterministic tools |
| Document parsing fails | Use preprocessed synthetic text/markdown for demo |
| Upload flow takes too long | Use preloaded demo case |
| Calculation errors | Unit test calculator with known expected output |
| Merge conflicts | Strict file ownership and small PRs |
| Vultr API issue | Keep graceful fallback message, but demo should use Vultr in final run |
