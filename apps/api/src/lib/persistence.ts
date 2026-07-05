import { env, isBlobStoreConfigured, isPersistenceConfigured } from "../config/env.js";
import type { BlobStore } from "../data/blobStore.js";
import type { CaseRepository } from "../data/caseRepository.js";
import { PostgresCaseRepository } from "../data/postgresCaseRepository.js";
import { S3BlobStore } from "../data/s3BlobStore.js";

/**
 * Resolve the production persistence boundary from the environment (dependency
 * points app → package; the agent package never imports the database).
 *
 * Returns a Vultr Managed PostgreSQL repository when `DATABASE_URL` is set, or
 * `null` when it is not — in which case the audit routes 503 rather than fall
 * back to an in-memory store (there is no in-memory production path; see
 * docs/Rules.md). Tests bypass this factory and inject the in-memory fake.
 */
export function createCaseRepository(): CaseRepository | null {
  if (!isPersistenceConfigured || !env.DATABASE_URL) return null;
  return new PostgresCaseRepository(env.DATABASE_URL);
}

/**
 * Resolve the object-storage boundary (Vultr Object Storage) from the
 * environment. Returns `null` when unconfigured — the upload route then 503s
 * rather than dropping files. Tests inject the in-memory fake.
 */
export function createBlobStore(): BlobStore | null {
  if (
    !isBlobStoreConfigured ||
    !env.VULTR_OBJECT_STORAGE_ENDPOINT ||
    !env.VULTR_OBJECT_STORAGE_ACCESS_KEY ||
    !env.VULTR_OBJECT_STORAGE_SECRET_KEY ||
    !env.VULTR_OBJECT_STORAGE_BUCKET
  ) {
    return null;
  }
  return new S3BlobStore({
    endpoint: env.VULTR_OBJECT_STORAGE_ENDPOINT,
    accessKeyId: env.VULTR_OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: env.VULTR_OBJECT_STORAGE_SECRET_KEY,
    bucket: env.VULTR_OBJECT_STORAGE_BUCKET,
  });
}
