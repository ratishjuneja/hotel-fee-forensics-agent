# Rules — sponsor requirements & non-negotiables (source of truth)

This file is the **canonical record** of the hackathon's hard requirements. We keep drifting
off them, so every agent and teammate should treat this as authoritative and re-check it
before making architecture or scoping decisions. `CLAUDE.md` restates the highlights; when
the two disagree, **this file wins** (and fix `CLAUDE.md`).

## Developer Expectations (as given by the sponsor)

Each team must provide:

- **GitHub repository** with setup steps and documentation
- **Backend deployed on Vultr** (VM or Vultr services)
- Use of the **VultronRetriever Models for document retrieval**
- Use of **VultronRetriever Models via Vultr Serverless Inference for all core LLM
  reasoning steps**
- **Public demo URL**
- **Recorded demo video**
- **Clear explanation** of the architecture, the agent workflow, and the use case

## Technology

- Use any language or framework you like.
- **VultronRetriever Models via Vultr Serverless Inference** (OpenAI-compatible) for **all
  core LLM reasoning steps**.
- Other agents/models may be used **only** for chat facilitation, UI, or secondary tasks —
  **never in the audit path**.
- **Bonus points** for creative multi-agent or tool-using designs, and for handling messy
  real-world documents well.

## How this project honors the above (non-negotiable)

- **The audit pipeline's only model is the VultronRetrieverPrime reranker** on Vultr's
  `/v1/rerank` — it scores document chunks on retrieval steps 2, 3, and the step-7
  re-retrieval loop, and it **never generates**. Planning, rule extraction, fee math,
  decisions, and the memo/email are **deterministic code**. Do not put a chat model in the
  audit path.
- **Persistence runs on Vultr with no in-memory fallback.** Case metadata, parse status,
  assembled input, and audit reports live in **Vultr Managed PostgreSQL**; uploaded files
  live in **Vultr Object Storage** — behind a thin repository layer. An in-memory store
  standing in for the database reads as "faking the DB" under open-source judging and is not
  allowed in production. Tests may inject an in-memory *fake* repository as a test double.
- **Deployment is in scope.** Backend + web run on the Vultr VM behind Caddy at the public
  demo URL; deployment is not optional or "if time permits."
- **Secrets never touch the repo.** Document env vars in `.env.example` only. The
  account-level `VULTR_API_KEY` stays on the developer laptop — never on the VM or in git.

## Synthetic-data & originality rules

- All demo documents and financials must be **synthetic** (fictional content, no real
  hotel's confidential contract) — this is a rights rule, distinct from "preloaded." A real
  upload flow fed synthetic sample documents satisfies it.
- All code is new work built during the event, with a clear commit history. Original
  contributions must be obvious; don't blur our work with library code.

## Golden regression (must never move)

The synthetic Harborline case is the regression anchor:

- Harborline June-vs-May total suspected overcharge → **$36,580**
- Findings: **1980 / 6600 / 28000** (dispute / dispute / request_explanation; F3 is
  `IMPROPER_PASS_THROUGH`)
- Confidence **0.96** = components `[25, 25, 20, 16, 10]`
- Memo cites `APPROVAL-0612-03`
- Trace shows exactly **3 LLM + 7 TOOL** badges
- The demo run **does not pause** (no `human_review` finding)

Any change that moves these numbers is a regression, not a feature.
