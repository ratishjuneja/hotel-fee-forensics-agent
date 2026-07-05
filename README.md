# BellBoy

**An owner-side enterprise agent that audits hotel operator fees.**

BellBoy reads a hotel management agreement (HMA), recalculates operator fees from the
monthly operating package, finds fee leakage, and generates a cited, dispute-ready audit
memo plus a draft dispute email.

> Hotel owners pay operators using formulas buried in long agreements. Small definition
> errors — the wrong revenue base, an excluded item counted in, an un-approved
> pass-through — cause real fee leakage. Our agent reruns the math, finds the leakage,
> and produces a dispute-ready memo with citations.

Built for a hackathon, with **Vultr** in the core path — Serverless Inference for retrieval
scoring, Managed PostgreSQL and Object Storage for persistence, and Cloud Compute for the
deployed demo.

**▶ Live demo: <https://bellboy-cv.duckdns.org>**

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
trace** is visible in the UI so judges can see the agent reasoning across steps. Findings
the agent can't settle on evidence alone **pause the run** with cited questions for a
human-in-the-loop answer, then replay.

### Leakage scenarios

- Excluded revenue included in the fee base
- Incentive fee calculated on inflated GOP/AGOP
- Improper pass-through expense charged without owner approval

## Status

✅ **Built, tested, and deployed live.** The full agent pipeline in `packages/agent` runs
the 10-step traced audit loop (plan → retrieve fee clauses → retrieve exclusions → extract
rules → deterministic recompute → anomaly checks → conditional re-retrieval of prior month
+ support pack → evidence check → decide + confidence → memo/email) and reproduces the
**$36,580 / 96%** golden ground truth from the synthetic documents in `data/demo/`.
`POST /api/cases/:id/run-audit` executes that pipeline live on **Vultr Serverless
Inference**, and the pipeline's **only model is VultronRetrieverPrime** (Vultr's dedicated
retrieval model, via `/v1/rerank`): it scores the clauses behind every citation, while rule
extraction, fee math, decisions, and the memo/email are deterministic, fully-cited code.

The app is **upload-driven** — bring your own HMA + operating statements (PDF / CSV / TXT,
digital or scanned via an offline OCR ladder). Uploads land in **Vultr Object Storage** and
case metadata / parse status / reports persist to **Vultr Managed PostgreSQL** (no
in-memory fallback — the API returns 503 if the database is unconfigured). The web app
(upload → agent trace → findings → memo → dispute email) runs end-to-end and is deployed
behind Caddy on **Vultr Cloud Compute** at <https://bellboy-cv.duckdns.org>.

See [`docs/tracker.md`](docs/tracker.md) for live status.

## Tech stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind
- **Backend:** Fastify + TypeScript + Zod
- **Inference:** Vultr Serverless Inference (OpenAI-compatible) — VultronRetrieverPrime reranker
- **Storage:** Vultr Object Storage (uploads) + Vultr Managed PostgreSQL (case metadata & reports)
- **Deploy:** Vultr Cloud Compute behind Caddy → <https://bellboy-cv.duckdns.org>

## Getting started

```bash
cp .env.example .env   # then fill in your Vultr credentials
npm install            # from the repo root

npm run dev:api                              # terminal 1 — API on :4000
npm run dev --workspace=@feeforensics/web    # terminal 2 — web on :3000
```

Open <http://localhost:3000>, upload a hotel management agreement + the month's operating
statement, and follow **Upload → Run Audit → Report**. Persistence requires the Vultr
Object Storage and PostgreSQL credentials in `.env` — the API returns 503 when
`DATABASE_URL` is unset (there is no in-memory fallback). See [`CLAUDE.md`](CLAUDE.md) for
architecture and working conventions, and [`docs/`](docs/) for the full spec.

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
| [LICENSE](LICENSE) | MIT open-source license |
| [TERMS.md](TERMS.md) | Terms of use for the hosted demo |

## Important notes for judges

- **All demo documents and financials are synthetic.** No real hotel contracts, real
  customer data, or proprietary assets are used.
- **All code in this repo was built during the hackathon.**
- **Open source** under the [MIT License](LICENSE); use of the hosted demo is governed by
  [TERMS.md](TERMS.md).
- No secrets are committed; environment variables are documented in
  [`.env.example`](.env.example).

## License

BellBoy is released under the [MIT License](LICENSE). Use of the hosted demo is subject to
the [Terms of Use](TERMS.md) — it is a demonstration, and its output is informational only,
not legal, financial, or professional advice.
