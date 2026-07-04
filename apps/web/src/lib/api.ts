import type {
  AuditReport,
  DemoCaseResponse,
  RunAuditResponse,
} from "@feeforensics/shared";
import { API_BASE_URL, DEMO_CASE_ID } from "./constants";

/** Thrown on any non-2xx API response; carries the HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      // Always hit the live API — the demo must reflect the real run.
      cache: "no-store",
      ...init,
    });
  } catch (cause) {
    throw new ApiError(0, `Cannot reach API at ${API_BASE_URL} — is it running?`);
  }
  if (!res.ok) {
    throw new ApiError(res.status, `${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

/** GET /api/demo-case — preloaded synthetic case metadata + expected outputs. */
export function getDemoCase(): Promise<DemoCaseResponse> {
  return request<DemoCaseResponse>("/api/demo-case");
}

/** POST /api/cases/:caseId/run-audit — runs the (currently mocked) agent. */
export function runAudit(
  caseId: string = DEMO_CASE_ID,
): Promise<RunAuditResponse> {
  return request<RunAuditResponse>(`/api/cases/${caseId}/run-audit`, {
    method: "POST",
  });
}

/** GET /api/cases/:caseId/report — latest full audit report. */
export function getReport(caseId: string = DEMO_CASE_ID): Promise<AuditReport> {
  return request<AuditReport>(`/api/cases/${caseId}/report`);
}

/**
 * POST /api/cases — create a case from uploaded documents.
 *
 * Forward-compatible: the MVP backend does not implement this yet, so this
 * currently throws `ApiError`. The upload screen catches that and offers the
 * preloaded demo case rather than faking analysis of the uploaded files.
 */
export function createCase(files: File[]): Promise<{ caseId: string }> {
  const form = new FormData();
  for (const f of files) form.append("documents", f, f.name);
  return request<{ caseId: string }>("/api/cases", {
    method: "POST",
    body: form,
  });
}
