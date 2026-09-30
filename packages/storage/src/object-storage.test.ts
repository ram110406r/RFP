import { describe, expect, test } from "bun:test";

import { ObjectStorage } from "./object-storage";

describe("ObjectStorage", () => {
  test("presigned URLs can use the app origin with the bucket as the route", async () => {
    const storage = new ObjectStorage({
      region: "us-east-1",
      bucket: "test-bucket",
      endpoint: "http://minio:9000",
      publicEndpoint: "https://app.example.com",
      accessKeyId: "access",
      secretAccessKey: "secret",
      forcePathStyle: true,
    });

    const url = await storage.presignPut({
      objectKey: "docs/test.pdf",
      mimeType: "application/pdf",
      expiresInSeconds: 60,
    });

    expect(url).toStartWith("https://app.example.com/test-bucket/docs/test.pdf?");
  });

  test("presigned PUT URLs do not pin a checksum of the empty presign body", async () => {
    const storage = new ObjectStorage({
      region: "us-east-1",
      bucket: "test-bucket",
      endpoint: "http://minio:9000",
      accessKeyId: "access",
      secretAccessKey: "secret",
    });

    const url = await storage.presignPut({
      objectKey: "docs/test.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      expiresInSeconds: 60,
    });

    expect(url).not.toContain("x-amz-checksum-crc32");
    expect(url).not.toContain("x-amz-sdk-checksum-algorithm");
  });

  test("readObject returns the full payload bytes", async () => {
    const storage = makeStorage(async () => ({
      Body: {
        transformToByteArray: async () => new TextEncoder().encode("full object"),
      },
    }));

    const bytes = await storage.readObject("docs/test.pdf");
    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe("full object");
  });

  test("readObject returns null for a missing object", async () => {
    const storage = makeStorage(async () => {
      const error = new Error("missing");
      (error as Error & { name?: string }).name = "NoSuchKey";
      throw error;
    });

    await expect(storage.readObject("docs/missing.pdf")).resolves.toBeNull();
  });
});

function makeStorage(send: (command: unknown) => Promise<unknown>) {
  const storage = new ObjectStorage({
    region: "us-east-1",
    bucket: "test-bucket",
    endpoint: "http://localhost:9000",
    accessKeyId: "access",
    secretAccessKey: "secret",
    forcePathStyle: true,
  });

  (storage as unknown as { client: { send: typeof send } }).client = { send };
  return storage;
}
