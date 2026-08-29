import { afterEach, describe, expect, mock, test } from "bun:test";

import { GroqAnswerProvider } from "./grounded-answer.provider";

const originalEnv = {
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL,
  GROQ_BASE_URL: process.env.GROQ_BASE_URL,
  GROQ_TIMEOUT_MS: process.env.GROQ_TIMEOUT_MS,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY;
  process.env.GROQ_MODEL = originalEnv.GROQ_MODEL;
  process.env.GROQ_BASE_URL = originalEnv.GROQ_BASE_URL;
  process.env.GROQ_TIMEOUT_MS = originalEnv.GROQ_TIMEOUT_MS;
  globalThis.fetch = originalFetch;
});

describe("GroqAnswerProvider", () => {
  test("calls the Groq chat-completions endpoint with the configured model and grounded envelope", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GROQ_MODEL = "llama-3.1-8b-instant";
    process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1";
    process.env.GROQ_TIMEOUT_MS = "1000";

    const fetchMock = mock(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(String(input)).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(String(init?.body ?? "{}")) as {
        model?: string;
        messages?: Array<{ role: string; content: string }>;
        max_completion_tokens?: number;
        response_format?: { type?: string };
      };

      expect(body.model).toBe("llama-3.1-8b-instant");
      expect(body.max_completion_tokens).toBe(160);
      expect(body.response_format?.type).toBe("json_object");
      expect(body.messages?.[0]?.content).toContain("PROMPT: TenderAnswerPrompt");
      expect(body.messages?.[0]?.content).toContain("VERSION: 1.0.0");
      expect(body.messages?.at(-1)?.content ?? "").toContain("CONTEXT_JSON:");

      return new Response(
        JSON.stringify({
          id: "chatcmpl-groq-test",
          model: "llama-3.1-8b-instant",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  answer: "SCIM provisioning is supported.",
                  confidence: 0.98,
                  evidenceIds: ["ev-1"],
                  risk: "LOW",
                  status: "AI_DRAFT",
                  metadata: { requestId: "chatcmpl-groq-test" },
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 32,
            completion_tokens: 18,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new GroqAnswerProvider();
    const response = await provider.complete({
      model: "tendyy-grounded-draft-v1",
      temperature: 0,
      maxTokens: 160,
      messages: [
        { role: "system", content: "PROMPT: TenderAnswerPrompt VERSION: 1.0.0" },
        {
          role: "user",
          content: [
            "CONTEXT_JSON:",
            "```json",
            JSON.stringify(
              {
                question: "Does your platform support SCIM?",
                requirement: { title: "Provide SCIM support details" },
                evidence: [{ evidenceId: "ev-1", title: "Identity policy", content: "SCIM is supported." }],
              },
              null,
              2,
            ),
            "```",
          ].join("\n"),
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.model).toBe("llama-3.1-8b-instant");
    expect(JSON.parse(response.content)).toMatchObject({
      answer: "SCIM provisioning is supported.",
      status: "AI_DRAFT",
      risk: "LOW",
      evidenceIds: ["ev-1"],
    });
    expect(response.usage).toMatchObject({
      inputTokens: 32,
      outputTokens: 18,
    });
  });

  test("uses a compact hidden reasoning configuration for GPT-OSS", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GROQ_MODEL = "openai/gpt-oss-20b";
    process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1";

    const fetchMock = mock(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        max_completion_tokens?: number;
        reasoning_effort?: string;
        reasoning_format?: string;
        response_format?: { type?: string };
      };

      expect(body.max_completion_tokens).toBe(1_024);
      expect(body.reasoning_effort).toBe("low");
      expect(body.reasoning_format).toBe("hidden");
      expect(body.response_format?.type).toBe("json_object");

      return new Response(
        JSON.stringify({
          id: "chatcmpl-gpt-oss-test",
          model: "openai/gpt-oss-20b",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"ok":true}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new GroqAnswerProvider();
    const response = await provider.complete({
      model: "tendyy-grounded-draft-v1",
      maxTokens: 1_024,
      messages: [{ role: "system", content: "PROMPT: TenderBriefPrompt VERSION: 1.0.0" }],
    });

    expect(response.content).toBe('{"ok":true}');
  });

  test("surfaces Groq API failures clearly", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GROQ_MODEL = "llama-3.1-8b-instant";
    process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1";

    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ error: { message: "model unavailable" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const provider = new GroqAnswerProvider();

    await expect(
      provider.complete({
        model: "tendyy-grounded-draft-v1",
        temperature: 0,
        maxTokens: 120,
        messages: [{ role: "system", content: "PROMPT: TenderAnswerPrompt VERSION: 1.0.0" }],
      }),
    ).rejects.toThrow(/Groq chat completion failed \(500 GROQ_ERROR\)/i);
  });

  test("surfaces Groq rate-limit failures clearly", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GROQ_MODEL = "llama-3.1-8b-instant";
    process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1";

    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ error: { message: "rate limit reached" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const provider = new GroqAnswerProvider();

    await expect(
      provider.complete({
        model: "tendyy-grounded-draft-v1",
        temperature: 0,
        maxTokens: 120,
        messages: [{ role: "system", content: "PROMPT: TenderAnswerPrompt VERSION: 1.0.0" }],
      }),
    ).rejects.toThrow(/Groq chat completion failed \(429 RATE_LIMITED\)/i);
  });

  test("fails on empty Groq output rather than fabricating an answer", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.GROQ_MODEL = "llama-3.1-8b-instant";
    process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1";

    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          id: "chatcmpl-empty",
          model: "llama-3.1-8b-instant",
          choices: [{ index: 0, message: { role: "assistant", content: "   " } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const provider = new GroqAnswerProvider();

    await expect(
      provider.complete({
        model: "tendyy-grounded-draft-v1",
        temperature: 0,
        maxTokens: 120,
        messages: [{ role: "system", content: "PROMPT: TenderAnswerPrompt VERSION: 1.0.0" }],
      }),
    ).rejects.toThrow(/empty chat completion/i);
  });
});

const groqSmokeTest =
  process.env.GROQ_API_KEY && process.env.GROQ_MODEL && process.env.RUN_GROQ_SMOKE_TEST === "1" ? test : test.skip;

groqSmokeTest("optional real Groq smoke test", async () => {
  const smokeModel = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";
  const provider = new GroqAnswerProvider();
  const response = await provider.complete({
    model: smokeModel,
    temperature: 0,
    maxTokens: 64,
    messages: [
      { role: "system", content: "PROMPT: TenderAnswerPrompt VERSION: 1.0.0" },
      {
        role: "user",
        content: [
          "CONTEXT_JSON:",
          "```json",
          JSON.stringify(
            {
              question: "State the disaster recovery test frequency.",
              requirement: { title: "Describe disaster recovery testing" },
              evidence: [{ evidenceId: "ev-1", title: "DR policy", content: "Tests are performed quarterly." }],
            },
            null,
            2,
          ),
          "```",
        ].join("\n"),
      },
    ],
  });

  expect(response.model).toBe(smokeModel);
  expect(response.content.trim().length).toBeGreaterThan(0);
});
