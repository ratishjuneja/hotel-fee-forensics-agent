/** The only case the MVP API serves (see apps/api/src/data/demoCase.ts). */
export const DEMO_CASE_ID = "case_demo_hotel_001";

/** Base URL of the FeeForensics API. Same var works server- and client-side. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
