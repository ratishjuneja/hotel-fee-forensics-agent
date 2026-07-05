import type { BlobStore } from "./blobStore.js";

/**
 * TEST DOUBLE — never wired into production (`buildServer`'s default is the S3
 * store or `null`; see docs/Rules.md, "no in-memory fallback").
 *
 * An in-memory `BlobStore` for route/unit tests so uploads can be exercised
 * without a live Vultr Object Storage bucket. Copies the buffer on the way in and
 * out so a test can't mutate stored bytes through a shared reference.
 */
export class InMemoryBlobStore implements BlobStore {
  private readonly objects = new Map<string, Buffer>();

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    this.objects.set(key, Buffer.from(body));
  }

  async get(key: string): Promise<Buffer | null> {
    const buf = this.objects.get(key);
    return buf ? Buffer.from(buf) : null;
  }
}
