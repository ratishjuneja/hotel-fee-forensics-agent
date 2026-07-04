# TechSpec: FeeForensics (v3 — Vultr Vector Store / RAG API Update)

> **What changed from v2:** v2 assumed we'd manually render document pages to images and call VultronRetriever as a standalone embedding model. Vultr's actual public docs describe something more concrete and directly usable: a **managed Vector Store** product (create a collection, upload files, it handles chunking/embedding internally) plus a dedicated **RAG Chat Completion** endpoint that retrieves from a collection and answers in one call. This is a real, documented, testable API surface — build against this first. VultronRetriever is very likely the embedding model operating *underneath* this managed service (Vultr's own retriever model, used for "your enterprise agent's core reasoning" per the resource sheet), but the docs don't expose a way to pick the embedding model explicitly — see §3 open question.

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

- **Fastify + TypeScript** (or FastAPI + Python if the team is more comfortable there)
- REST endpoints
- Zod for request/response validation
- Standard HTTP client calling the Vultr Serverless Inference API — no custom embedding/vector-search code needed for the MVP (see §4)

### AI / Inference — confirmed API surface

Base URL: `https://api.vultrinference.com/v1`
(Note: this is a **different host** than the account/provisioning API at `api.vultr.com/v2` — don't mix them up when reading docs or writing the client.)

**Standard chat completions** (planning, extraction, decisioning, memo/email generation):
```
POST https://api.vultrinference.com/v1/chat/completions
Authorization: Bearer ${VULTR_INFERENCE_API_KEY}
```
OpenAI-compatible request/response shape.

**Vector Store — Create Collection:**
```
POST https://api.vultrinference.com/v1/vector_store
Content-Type: application/json
{ "name": "feeforensics-demo-hotel" }
```

**Vector Store — List Collections:**
```
GET https://api.vultrinference.com/v1/vector_store
```

**Vector Store — Add File to Collection** (upload the HMA, invoice pack, etc. directly — no manual chunking/embedding code required):
```
POST https://api.vultrinference.com/v1/vector_store/{collection-id}/files
Content-Type: multipart/form-data
-F "file=@hotel-management-agreement.pdf"
```

**Vector Store — List Files in Collection:**
```
GET https://api.vultrinference.com/v1/vector_store/{collection-id}/files
```

There is also an **Add Collection Items** endpoint (for adding structured items directly rather than whole files) — worth checking if we want finer control over what gets embedded (e.g., one item per clause instead of one item per document).

**RAG Chat Completion** (the actual retrieval + reasoning step — this is the one call that replaces our whole custom retriever module from v2):
```
POST https://api.vultrinference.com/v1/chat/completions/RAG
Content-Type: application/json
{
  "collection": "{collection-id}",
  "model": "{model-id}",
  "messages": [
    { "role": "user", "content": "What is the incentive management fee formula and what revenue/profit items are excluded?" }
  ],
  "max_tokens": 512
}
```

This single call retrieves relevant chunks from the collection **and** generates a grounded answer in one step — Vultr's platform is handling the embedding + similarity search internally.

**RAG-compatible models** (confirmed from docs): `deepseek-r1-distill-qwen-32b`, `qwen2.5-32b-instruct`, `qwen2.5-coder-32b-instruct`, `llama-3.1-70b-instruct-fp8`, `llama-3.3-70b-instruct-fp8`, `deepseek-r1-distill-llama-70b`, `deepseek-r1`.
**Not RAG-compatible:** `mistral-7B-v0.3`, `mistral-nemo-instruct-2407` — do not pick these for the retrieval-dependent steps.

**Native tool calling on the RAG endpoint** is currently supported **only** on `kimi-k2-instruct`. We are **not relying on this** — see §5, our deterministic tools (fee calculator, anomaly checker) run entirely in our own backend code, not as LLM-invoked tool calls. This sidesteps a model-choice constraint entirely and keeps arithmetic fully deterministic regardless of which chat model we pick.

## 3. Open Question — Confirm Before Building

The docs don't show a way to explicitly select or confirm which embedding model powers the Vector Store (i.e., whether it's VultronRetriever under the hood, and whether it handles PDFs with scanned/image-heavy pages well, or does a standard text-extraction pass first). Two things to check in the first hour:

1. Check the full API reference at `api.vultrinference.com` (linked from the docs pages) for a `Create Collection` parameter that names an embedding/retriever model — if one exists, explicitly set it to a VultronRetriever variant so the sponsor requirement ("use these via Vultr Serverless Inference for your enterprise agent's core reasoning") is unambiguously satisfied in the code, not just assumed.
2. Upload one real synthetic HMA PDF to a test collection early and run one RAG query against it before building the rest of the pipeline around it — confirm retrieval quality on contract-style, clause-heavy text before committing the whole demo to this path.

If no embedding model can be explicitly selected, that's still fine for the "use Vultr in the core path" requirement — the retrieval and reasoning are still happening entirely on Vultr's Serverless Inference platform, which is the literal requirement. Worth a one-line mention in the pitch either way ("core reasoning and retrieval run on Vultr Serverless Inference, backed by their managed Vector Store").

## 4. Document Handling — Simplified from v2

Because Vultr's Vector Store accepts direct file upload and handles chunking/embedding internally, we no longer need our own PDF-rendering or manual embedding pipeline. Split by type:

| Document type | Handling |
|---|---|
| HMA (contract) | Upload directly to a Vector Store collection via Add Collection Files. Query via RAG Chat Completion. |
| Support / Invoice Pack | Same — upload to collection, query via RAG. |
| Monthly Operating Statement | Keep as structured CSV/JSON, loaded directly into our backend — **not** put into the Vector Store. Financial figures must come from structured data, never from a retrieved/generated chunk. |
| Prior-Month Statement | Same — structured CSV/JSON, not in the Vector Store. |

This keeps the calculator's inputs 100% deterministic: the LLM/RAG layer only ever supplies contract clause text and citations for the agent to reason over and cite; it never supplies a number that goes into the fee math.

## 5. System Architecture

```text
User
  ↓
Next.js Web App
  ↓
Backend API
  ↓
Agent Orchestrator
  ├── Planner: decides investigation steps                    [chat/completions]
  ├── Clause Retrieval + Extraction: RAG query → structured    [chat/completions/RAG]
  │     fee rules JSON
  ├── Fee Calculator: deterministic arithmetic                 [our own backend code]
  │     (structured CSV/JSON inputs only, never RAG output)
  ├── Anomaly Checker: compares prior months                   [our own backend code]
  ├── Conditional re-retrieval: if variance ambiguous,          [chat/completions/RAG]
  │     RAG-query prior-month/support-pack collection again
  ├── Decision Engine: classifies issues                       [chat/completions]
  └── Report Generator: memo + dispute email with citations     [chat/completions]
  ↓
Vultr Serverless Inference
  ├── Vector Store (collection: HMA + support docs)
  ├── RAG Chat Completion (retrieval + grounded answer, one call)
  └── Standard Chat Completion (planning, decisions, memo/email generation)
```

## 6. Key Backend Modules

### `agent/orchestrator.ts`

Coordinates the workflow: plan → RAG-retrieve clauses → extract structured rules → load structured financials → calculate → RAG-retrieve again if ambiguous → check anomalies → decide → generate report. Builds the trace log shown in the UI.

### `agent/tools/ragClient.ts`

Thin wrapper around the RAG Chat Completion endpoint. Given a natural-language query and a collection ID, returns the model's grounded answer plus (if the API response includes them) the underlying retrieved chunk references for citation purposes. **Confirm in testing whether the RAG response exposes the raw retrieved chunks/citations directly, or only the synthesized answer** — if only the latter, we'll need to prompt the model explicitly to quote/cite the source section in its answer text (e.g., "Always state which section of the document supports your answer").

### `agent/tools/ruleExtractor.ts`

Takes the RAG-retrieved clause text/answer and converts it into structured `FeeRules` JSON (rate, base, exclusions, thresholds, citation) via a follow-up standard chat completion call with a strict JSON-output prompt.

### `agent/tools/feeCalculator.ts`

Deterministic calculator — pure backend code, no LLM involved. Never touches RAG output directly; only consumes structured `FeeRules` (from extraction) and structured financial line items (from CSV/JSON).

Inputs: extracted fee rules, monthly financial rows, charged fee amounts.
Outputs: expected base fee, expected incentive fee, expected pass-through amount, charged amount, variance, issue breakdown.

### `agent/tools/anomalyChecker.ts`

Compares current month to prior months (structured data, no LLM/RAG).

### `agent/tools/reportGenerator.ts`

Generates final memo and dispute email via standard chat completion. Must cite retrieved clause sections and structured financial line references. Must avoid unsupported claims.

## 7. API Endpoints (our backend)

### `GET /api/demo-case`

Returns the preloaded synthetic case metadata, including the Vector Store collection ID the demo case's documents were uploaded to (set up once ahead of time, not live during judging).

### `POST /api/cases`

Creates a new case: creates a Vector Store collection, uploads documents to it. MVP can skip this and rely on a preloaded demo case + collection.

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

## 8. Agent Workflow Contract

1. **Plan** investigation (standard chat completion).
2. **RAG-retrieve** base fee and incentive fee clauses from the HMA collection.
3. **RAG-retrieve** revenue exclusions and audit-rights clauses.
4. **Extract** structured fee rules from the RAG answers (standard chat completion, strict JSON output).
5. **Load** monthly financial schedules (structured CSV/JSON, no retrieval).
6. **Calculate** expected fees (deterministic backend code).
7. **RAG-retrieve** again from the support-pack/prior-month collection when a variance is ambiguous — **this conditional re-retrieval loop is the clearest live proof of "agent, not a one-shot RAG chatbot."**
8. **Check** anomalies and pass-through expenses (deterministic backend code).
9. **Decide** findings (standard chat completion, given calculator output).
10. **Generate** memo and email (standard chat completion, with citations).

## 9. Confidence Score

Unchanged in design — transparent, deterministic sum of weighted components:

```text
confidence = weighted average of:
- clause_found: 25%          (RAG returned a relevant, on-topic answer)
- financial_inputs_found: 25%
- calculation_variance_clear: 25%
- cause_explained_by_evidence: 15%
- prior_month_support: 10%
```

Display confidence as a percentage that expands to show each component's contribution. Never render a bare "High/Low" label.

## 10. Development Constraints

- ~20–24 hour build window (confirm actual hacking-to-submission hours against the event schedule — do this math early, don't assume 48 hours).
- Two coders, one lower-code teammate.
- Demo quality is more important than perfect architecture.
- Prefer the managed Vector Store + RAG endpoint over any custom embedding/retrieval code — it's less to build and it's the documented, sponsor-provided path.
- Prefer deterministic calculator over LLM math — always, no exceptions.
- Prefer visible trace over hidden complexity.
- Avoid building a dashboard as the main feature.
- Set up the demo case's Vector Store collection and upload its documents **ahead of time**, not live during the judged demo — only the query-time RAG call and reasoning should happen live.

## 11. Environment Variables

```bash
VULTR_INFERENCE_API_KEY=
VULTR_INFERENCE_BASE_URL=https://api.vultrinference.com/v1
VULTR_INFERENCE_CHAT_MODEL=          # e.g. qwen2.5-32b-instruct (confirmed RAG-compatible)
VULTR_INFERENCE_COLLECTION_ID=       # set once demo collection is created
VULTR_OBJECT_STORAGE_ENDPOINT=
VULTR_OBJECT_STORAGE_ACCESS_KEY=
VULTR_OBJECT_STORAGE_SECRET_KEY=
DATABASE_URL=
NODE_ENV=development
```

Do not commit `.env`.

## 12. Deployment Plan

### Minimum
- Local demo with Vultr Serverless Inference API calls (chat completions + RAG + Vector Store).

### Better
- Deploy backend or full app to Vultr Cloud Compute.

### Best if Time Allows
- Vultr Compute + Vultr Serverless Inference (chat, RAG, Vector Store) + Vultr Object Storage for raw uploaded files.

## 13. Technical Risks

| Risk | Mitigation |
|---|---|
| LLM output inconsistent | Use structured JSON schemas and deterministic tools for all arithmetic |
| **RAG endpoint doesn't expose raw chunk citations, only a synthesized answer** | Prompt the model explicitly to name the section/clause it's drawing from in its answer text; treat that as the citation. Confirm this in Hour 0–1 testing, not later. |
| Vector Store file upload doesn't handle our synthetic PDF format well | Test upload + one RAG query in Hour 0–1 with a real draft document, before building the rest of the pipeline on top of it |
| Non-RAG-compatible model picked by mistake | Hard-code the model list from §2 into a constants file; only ever select from the confirmed RAG-compatible set for any retrieval-dependent step |
| Upload flow takes too long for the demo | Use a preloaded demo case with a Vector Store collection already created and populated ahead of time |
| Calculation errors | Unit test the calculator with known expected output |
| Merge conflicts | Strict file ownership and small PRs |
| Vultr API issue (chat or RAG) during live judging | Keep a graceful fallback message and a cached/pre-recorded replay of the full run; the live attempt should still use Vultr in the final run when possible |
