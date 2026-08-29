import { Injectable, Logger } from "@nestjs/common";
import type {
  AiProvider,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "@rfp-os/ai";

type GroqChatCompletionResponse = {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    finish_reason?: string | null;
    message?: {
      role?: string;
      content?: string | null;
      reasoning?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string | null;
  };
};

@Injectable()
export class GroqAnswerProvider implements AiProvider {
  readonly name = "groq";

  private readonly logger = new Logger(GroqAnswerProvider.name);
  private readonly apiKey = readEnv("GROQ_API_KEY");
  private readonly model = readEnv("GROQ_MODEL") ?? "openai/gpt-oss-20b";
  private readonly baseUrl = (readEnv("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  private readonly requestTimeoutMs = readNumberEnv("GROQ_TIMEOUT_MS") ?? 60_000;

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = this.resolveModel(request.model);
    const startedAt = Date.now();
    const isGptOss = model.startsWith("openai/gpt-oss-");
    const response = await this.postJson<GroqChatCompletionResponse>(
      `${this.baseUrl}/chat/completions`,
      {
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0,
        max_completion_tokens: request.maxTokens,
        response_format: { type: "json_object" },
        ...(isGptOss
          ? {
              reasoning_effort: "low",
              reasoning_format: "hidden",
            }
          : {}),
      },
      "chat completion",
    );

    const choice = response.choices[0];
    const content = choice?.message?.content ?? "";
    if (!content.trim()) {
      const completionTokens = response.usage?.completion_tokens ?? 0;
      throw new Error(
        `Groq returned an empty chat completion for model "${model}" ` +
          `(finishReason=${choice?.finish_reason ?? "unknown"}, completionTokens=${completionTokens}).`,
      );
    }

    this.logger.log(
      `Groq completion success provider=${this.name} model=${response.model} requestId=${response.id} durationMs=${
        Date.now() - startedAt
      }`,
    );

    return {
      content,
      model: response.model ?? model,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens ?? 0,
            outputTokens: response.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }

  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error("GroqAnswerProvider does not support embeddings in this repo.");
  }

  private resolveModel(requestModel: string) {
    if (!requestModel) {
      throw new Error("Missing request model for AI completion.");
    }
    if (!this.apiKey) {
      throw new Error("GROQ_API_KEY is required to call the real GroqCloud provider.");
    }
    return this.model;
  }

  private async postJson<T>(path: string, body: Record<string, unknown>, operation: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string; code?: string } };
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload ? payload.error?.message : null;
        const code = response.status === 429 ? "RATE_LIMITED" : response.status === 401 || response.status === 403 ? "AUTH_ERROR" : "GROQ_ERROR";
        throw new Error(`Groq ${operation} failed (${response.status} ${code}): ${message ?? response.statusText}`);
      }
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Groq ${operation} failed provider=${this.name}: ${message}`);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readEnv(name: string) {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

function readNumberEnv(name: string) {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
