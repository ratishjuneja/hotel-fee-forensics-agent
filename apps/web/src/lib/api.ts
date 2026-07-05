import type {
  AuditReport,
  CaseDocumentsResponse,
  CaseStatusResponse,
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

/** Upload slots accepted by POST /api/cases (multipart field names). */
export interface NewCaseUpload {
  hma: File;
  statement: File;
  statementPrior?: File;
  supportPack?: File;
  supplementary?: File;
  ownerNotes?: string;
  /** Generate the draft dispute email (backend default: true). */
  draftEmail: boolean;
}

/**
 * POST /api/cases — create a case from uploaded documents (typed role slots).
 * Files land in Vultr Object Storage; an async parse job flips the case status,
 * which the parsing screen polls via {@link getCaseStatus}.
 */
export function createCase(
  upload: NewCaseUpload,
): Promise<{ caseId: string; status: "parsing" }> {
  const form = new FormData();
  form.append("hma", upload.hma, upload.hma.name);
  form.append("statement", upload.statement, upload.statement.name);
  if (upload.statementPrior) {
    form.append("statement_prior", upload.statementPrior, upload.statementPrior.name);
  }
  if (upload.supportPack) {
    form.append("support_pack", upload.supportPack, upload.supportPack.name);
  }
  if (upload.supplementary) {
    form.append("supplementary", upload.supplementary, upload.supplementary.name);
  }
  if (upload.ownerNotes?.trim()) form.append("ownerNotes", upload.ownerNotes.trim());
  form.append("draftEmail", String(upload.draftEmail));
  return request<{ caseId: string; status: "parsing" }>("/api/cases", {
    method: "POST",
    body: form,
  });
}

/** GET /api/cases/:caseId — upload parse status (polled by the parsing screen). */
export function getCaseStatus(caseId: string): Promise<CaseStatusResponse> {
  return request<CaseStatusResponse>(`/api/cases/${caseId}`);
}

/** GET /api/cases/:caseId/documents — the parsed source documents, verbatim. */
export function getCaseDocuments(caseId: string): Promise<CaseDocumentsResponse> {
  return request<CaseDocumentsResponse>(`/api/cases/${caseId}/documents`);
}
