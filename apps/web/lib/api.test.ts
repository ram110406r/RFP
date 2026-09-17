/// <reference types="bun-types" />

import { afterEach, describe, expect, test } from "bun:test";

import { uploadTenderSourceBytes } from "./api";

const originalFetch = globalThis.fetch;

describe("api upload helpers", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("uses the resolved MIME type for presigned tender source uploads", async () => {
    let captured: RequestInit | undefined;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      captured = init;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const file = new File(["docx bytes"], "requirements.docx", { type: "" });

    await uploadTenderSourceBytes(
      "https://storage.example.com/rfp-os-documents/requirements.docx",
      file,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    expect(captured?.method).toBe("PUT");
    expect(captured?.body).toBe(file);
    expect(captured?.headers).toEqual({
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });
});
