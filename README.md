# FeeForensics

**An owner-side enterprise agent that audits hotel operator fees.**

FeeForensics reads a hotel management agreement (HMA), recalculates operator fees from
the monthly operating package, finds fee leakage, and generates a cited, dispute-ready
audit memo plus a draft dispute email.

> Hotel owners pay operators using formulas buried in long agreements. Small definition
> errors — the wrong revenue base, an excluded item counted in, an un-approved
> pass-through — cause real fee leakage. Our agent reruns the math, finds the leakage,
> and produces a dispute-ready memo with citations.

Built for a hackathon, with **Vultr Serverless Inference** in the core path.

## Why it isn't a basic RAG app

It runs a **multi-step agent**, not a single retrieval + answer:

1. Plan the investigation
2. Retrieve base-fee & incentive-fee clauses
3. Retrieve revenue definitions & exclusions
4. Extract structured fee rules (JSON)
5. Retrieve monthly financial schedules
6. **Recalculate fees with a deterministic calculator** (never LLM arithmetic)
7. Retrieve prior months & audit-rights clause
8. Check anomalies & pass-through expenses
9. Decide findings (valid / suspicious / needs review)
10. Generate a cited memo + dispute email

Every finding is grounded in a specific clause and financial line. An operational **agent
trace** is visible in the UI so judges can see the agent reasoning across steps.

### Leakage scenarios (MVP demo)

- Excluded revenue included in the fee base
- Incentive fee calculated on inflated GOP/AGOP
- Improper pass-through expense charged without owner approval

## Status

🚧 Mid-build. The agent toolchain in `packages/agent` is built and tested — CSV statement
parser, clause-aware document chunker, model-driven retriever, fee-rule extractor,
deterministic fee calculator, month-over-month anomaly checker, and support-pack evidence
tool — plus a security-hardening pass across the agent prompts, API, and web rendering.
The API serves the demo case with a mock audit, and the frontend demo flow (case overview
→ agent trace → findings → memo → dispute email) runs end-to-end. Remaining: decision
engine + confidence scoring, report generator, the orchestrator loop, and wiring live
Vultr inference into the audit path. See [`docs/tracker.md`](docs/tracker.md) for live
status.

## Tech stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind
- **Backend:** Fastify + TypeScript + Zod
- **Inference:** Vultr Serverless Inference (OpenAI-compatible)
- **Storage (MVP):** local JSON + files; Vultr Object Storage / Managed PostgreSQL as stretch

## Getting started

```bash
cp .env.example .env   # then fill in your Vultr credentials
npm install            # from the repo root

npm run dev:api                              # terminal 1 — API on :4000
npm run dev --workspace=@feeforensics/web    # terminal 2 — web on :3000
```

Open <http://localhost:3000> and follow the demo case (Landing → Case Overview → Run
Audit → Report). See [`CLAUDE.md`](CLAUDE.md) for architecture and working conventions,
and [`docs/`](docs/) for the full spec.

## Documentation

| Doc | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Architecture, constraints, and conventions for contributors/agents |
| [docs/PRD.md](docs/PRD.md) | Product requirements & success criteria |
| [docs/TechSpec.md](docs/TechSpec.md) | Stack, modules, API, Vultr usage |
| [docs/Schema.md](docs/Schema.md) | Data model / types |
| [docs/AppFlow.md](docs/AppFlow.md) | Screens & routes |
| [docs/UserJourney.md](docs/UserJourney.md) | Persona & happy path |
| [docs/Design.md](docs/Design.md) | UI/visual guidance |
| [docs/Workflow.md](docs/Workflow.md) | Build plan, task split, PR order |
| [docs/tracker.md](docs/tracker.md) | Live status & checklists |

## Important notes for judges

- **All demo documents and financials are synthetic.** No real hotel contracts, real
  customer data, or proprietary assets are used.
- **All code in this repo was built during the hackathon.**
- No secrets are committed; environment variables are documented in
  [`.env.example`](.env.example).
