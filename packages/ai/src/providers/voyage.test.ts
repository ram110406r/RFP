import { afterEach, describe, expect, mock, test } from "bun:test";

import { hashEmbedding, knowledgeEmbedderFromEnv, VoyageEmbeddingProvider } from "./voyage";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("VoyageEmbeddingProvider", () => {
  test("batches inputs, pins the output dimension and keeps order", async () => {
    const bodies: Array<{ input: string[]; input_type: string; output_dimension: number }> = [];
    globalThis.fetch = mock(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const data = body.input.map((_: string, index: number) => ({ index, embedding: [index, 0, 0] })).reverse();
      return new Response(JSON.stringify({ data, model: "voyage-3.5" }), { status: 200 });
    }) as unknown as typeof fetch;

    const provider = new VoyageEmbeddingProvider({ apiKey: "k", model: "voyage-3.5", dimensions: 3, batchSize: 2 });
    const result = await provider.embed({ model: "tendyy-embed-v1", input: ["a", "b", "c"], inputType: "query" });

    expect(bodies.map((body) => body.input)).toEqual([["a", "b"], ["c"]]);
    expect(bodies[0]).toMatchObject({ input_type: "query", output_dimension: 3 });
    expect(result.embeddings).toEqual([[0, 0, 0], [1, 0, 0], [0, 0, 0]]);
  });

  test("rejects vectors of the wrong dimension instead of storing them", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }], model: "m" }))) as unknown as typeof fetch;
    const provider = new VoyageEmbeddingProvider({ apiKey: "k", model: "m", dimensions: 3 });
    await expect(provider.embed({ model: "x", input: ["a"] })).rejects.toThrow("expected 3");
  });

  test("retries rate limits, not auth failures", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ detail: "slow down" }), { status: 429 })
        : new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0, 0] }], model: "m" }));
    }) as unknown as typeof fetch;
    const logger = { log: () => {}, warn: () => {}, error: () => {} };
    const provider = new VoyageEmbeddingProvider({ apiKey: "k", model: "m", dimensions: 3, logger });
    await provider.embed({ model: "x", input: ["a"] });
    expect(calls).toBe(2);

    calls = 0;
    globalThis.fetch = mock(async () => {
      calls += 1;
      return new Response(JSON.stringify({ detail: "bad key" }), { status: 401 });
    }) as unknown as typeof fetch;
    await expect(provider.embed({ model: "x", input: ["a"] })).rejects.toThrow("401");
    expect(calls).toBe(1);
  });
});

describe("knowledgeEmbedderFromEnv", () => {
  test("mock mode uses deterministic hash embeddings; no key means none", () => {
    expect(knowledgeEmbedderFromEnv(1024, { AI_PROVIDER: "mock" })?.vendorModel).toBe("hash-embedding-v1");
    expect(knowledgeEmbedderFromEnv(1024, { AI_PROVIDER: "groq" })).toBeNull();
    expect(knowledgeEmbedderFromEnv(1024, { AI_PROVIDER: "groq", VOYAGE_API_KEY: "k" })?.vendorModel).toBe("voyage-3.5");
    expect(() => knowledgeEmbedderFromEnv(1024, { VOYAGE_API_KEY: "k", EMBEDDING_DIMENSIONS: "512" })).toThrow("migration");
  });

  test("hash embeddings are unit length and put similar text closer", () => {
    const a = hashEmbedding("data encrypted at rest with aes", 256);
    const b = hashEmbedding("aes encryption of data at rest", 256);
    const c = hashEmbedding("support desk hours and phone numbers", 256);
    const dot = (x: number[], y: number[]) => x.reduce((sum, value, index) => sum + value * y[index]!, 0);
    expect(Math.abs(dot(a, a) - 1)).toBeLessThan(1e-9);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });
});
