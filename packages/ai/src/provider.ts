export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface EmbeddingRequest {
  model: string;
  input: string[];
  /**
   * Retrieval models embed stored passages and search queries slightly
   * differently; providers that do not distinguish ignore it.
   */
  inputType?: "document" | "query";
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
}

/**
 * Every concrete AI vendor (OpenAI, Anthropic, Gemini, ...) implements this
 * interface. Business logic must never import a vendor SDK directly — it
 * goes through the ModelRouter, which resolves an AiProvider by model id.
 */
export interface AiProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
