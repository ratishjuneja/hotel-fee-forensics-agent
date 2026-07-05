import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  NoSuchKey,
} from "@aws-sdk/client-s3";

import type { BlobStore } from "./blobStore.js";

export interface S3BlobStoreConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * `BlobStore` backed by **Vultr Object Storage** (S3-compatible).
 *
 * Vultr uses a custom endpoint (e.g. `https://blr1.vultrobjects.com`), so we
 * force path-style addressing (`bucket` in the path, not the host) which is the
 * reliable mode for non-AWS S3 endpoints. `region` is required by the SDK but
 * ignored by Vultr, so a placeholder is fine.
 */
export class S3BlobStore implements BlobStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3BlobStoreConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: "us-east-1",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      // Some S3-compatible stores surface a missing key as a 404 without the
      // typed error; treat that as "not found", rethrow anything else.
      if (
        typeof err === "object" &&
        err !== null &&
        "$metadata" in err &&
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw err;
    }
  }
}
