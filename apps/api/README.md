# @feeforensics/api

Fastify + TypeScript backend for FeeForensics.

## Run

From the repo root:

```bash
npm install            # installs all workspaces
cp .env.example .env   # optional; API boots without Vultr keys
npm run dev:api        # starts the API on http://localhost:4000
```

## Endpoints (v1)

| Method | Path              | Purpose                                              |
| ------ | ----------------- | ---------------------------------------------------- |
| GET    | `/health`         | Liveness + non-secret config (incl. Vultr status).   |
| GET    | `/api/demo-case`  | Preloaded synthetic demo case metadata.              |

Planned next: `POST /api/cases`, `POST /api/cases/:caseId/run-audit`,
`GET /api/cases/:caseId/report` (see docs/TechSpec.md §6).

## Vultr

All LLM calls go through `src/lib/vultr.ts` (OpenAI-compatible). The API boots
without Vultr credentials so frontend work isn't blocked, but inference calls
throw `VultrNotConfiguredError` until `VULTR_INFERENCE_*` env vars are set.
