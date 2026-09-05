import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage, as the platform sees it.
 *
 * Deliberately the AWS S3 SDK rather than the `minio` package: MinIO speaks
 * the S3 API, so one client serves local development and production without a
 * second code path that only ever runs in one environment.
 *
 * This package holds no Nest decorators. apps/api wraps it in a module and
 * apps/worker constructs it directly — the same split as @rfp-os/db and
 * infrastructure/database, so the worker does not have to import Nest to read
 * a file.
 */

export interface ObjectStorageConfig {
  /** Absent means real AWS S3; set for MinIO or any S3-compatible host. */
  endpoint?: string | undefined;
  /** Browser-reachable endpoint used only for presigned URLs. */
  publicEndpoint?: string | undefined;
  region: string;
  bucket: string;
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
  /**
   * MinIO serves buckets as a path segment (`host/bucket/key`) rather than as
   * a subdomain, which is what AWS does by default. Wrong value here surfaces
   * as DNS failures against `bucket.localhost`, so it defaults to true and is
   * only turned off for real S3.
   */
  forcePathStyle?: boolean | undefined;
}

export interface ObjectHead {
  sizeBytes: number;
  mimeType: string | undefined;
  etag: string | undefined;
}

export interface PresignPutInput {
  objectKey: string;
  mimeType: string;
  expiresInSeconds: number;
}

export interface PresignGetInput {
  objectKey: string;
  expiresInSeconds: number;
  /** Sets Content-Disposition so a browser downloads rather than renders. */
  downloadFilename?: string | undefined;
}

export interface PutObjectInput {
  objectKey: string;
  mimeType: string;
  bytes: Uint8Array;
}

export class ObjectStorage {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  readonly bucket: string;

  constructor(private readonly config: ObjectStorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle ?? true,
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
    this.presignClient = config.publicEndpoint
      ? new S3Client({
          region: config.region,
          endpoint: config.publicEndpoint,
          forcePathStyle: config.forcePathStyle ?? true,
          ...(config.accessKeyId && config.secretAccessKey
            ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
            : {}),
        })
      : this.client;
  }

  /**
   * A URL the client PUTs the bytes to directly.
   *
   * The API never touches the payload: it would otherwise buffer whole
   * documents through the request pipeline, and the global TimeoutInterceptor
   * would kill anything large. The trade — a client can PUT bytes that
   * contradict the declared type — is closed by verifying size on completion
   * and sniffing magic bytes in the parse worker.
   */
  presignPut(input: PresignPutInput): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.mimeType,
    });
    return getSignedUrl(this.presignClient, command, { expiresIn: input.expiresInSeconds });
  }

  presignGet(input: PresignGetInput): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ...(input.downloadFilename
        ? {
            ResponseContentDisposition: `attachment; filename="${sanitizeHeaderFilename(
              input.downloadFilename,
            )}"`,
          }
        : {}),
    });
    return getSignedUrl(this.presignClient, command, { expiresIn: input.expiresInSeconds });
  }

  /**
   * Object metadata, or null when it does not exist.
   *
   * A missing object is a normal outcome — it is how an upload that was
   * started but never completed is detected — so it is reported as null
   * rather than thrown.
   */
  async headObject(objectKey: string): Promise<ObjectHead | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return {
        sizeBytes: result.ContentLength ?? 0,
        mimeType: result.ContentType,
        etag: result.ETag,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /**
   * Reads the first `length` bytes of an object.
   *
   * A ranged GET rather than a full download because the only current caller
   * sniffs magic bytes: pulling a 40MB PDF into worker memory to look at its
   * first eight bytes would make ingestion throughput a function of document
   * size for no benefit.
   *
   * Null when the object is absent, matching headObject — a document whose
   * bytes vanished between completion and processing is a real state, and one
   * the parse job must report as a failure rather than crash on.
   */
  async readObjectPrefix(objectKey: string, length: number): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          // Range is inclusive at both ends, so the last index is length - 1.
          Range: `bytes=0-${Math.max(length - 1, 0)}`,
        }),
      );
      if (!result.Body) return null;
      return await result.Body.transformToByteArray();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.mimeType,
      Body: input.bytes,
    }));
  }

  /**
   * Reads the full object into memory.
   *
   * Phase 6A needs the whole PDF because pdfjs-dist parses from bytes, not
   * from a range request. The worker still owns the memory tradeoff; this
   * just keeps the read behind the existing storage abstraction.
   */
  async readObject(objectKey: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      if (!result.Body) return null;
      return await result.Body.transformToByteArray();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  /** Readiness probe: can this process reach the bucket at all. */
  async bucketReachable(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

/**
 * Content-Disposition is a header, so a filename containing a quote or a
 * newline could terminate the value early and inject another header. Filenames
 * reach us from uploads, so they are untrusted.
 */
function sanitizeHeaderFilename(filename: string): string {
  return filename.replace(/[\r\n"\\]/g, "_");
}
