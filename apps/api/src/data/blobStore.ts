/**
 * Object-storage boundary for uploaded case files.
 *
 * The production implementation talks to **Vultr Object Storage** (S3-compatible)
 * — see `S3BlobStore`. As with `CaseRepository`, there is no in-memory production
 * implementation (uploaded files must survive a restart and be re-fetchable by the
 * evidence viewer); tests inject the in-memory fake, a test double only.
 *
 * `buildServer` resolves this to a real S3 store when the `VULTR_OBJECT_STORAGE_*`
 * vars are configured, or `null` otherwise — in which case the upload route fails
 * loudly with 503 rather than silently dropping files.
 */
export interface BlobStore {
  /** Store bytes under a key (overwrites). */
  put(key: string, body: Buffer, contentType: string): Promise<void>;

  /** Retrieve the bytes for a key, or `null` if it does not exist. */
  get(key: string): Promise<Buffer | null>;
}
