import type {
  AiProvider,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "./provider";

/**
 * Resolves a model id (e.g. "claude-sonnet-5", "gpt-5") to the AiProvider
 * that serves it, so callers never hard-code a vendor SDK. Providers
 * register themselves at app bootstrap (see each app's AI module).
 */
export class ModelRouter {
  private readonly providersByModel = new Map<string, AiProvider>();

  registerProvider(provider: AiProvider, models: string[]) {
    for (const model of models) {
      this.providersByModel.set(model, provider);
    }
  }

  private resolve(model: string): AiProvider {
    const provider = this.providersByModel.get(model);
    if (!provider) {
      throw new Error(`No AI provider registered for model "${model}".`);
    }
    return provider;
  }

  complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.resolve(request.model).complete(request);
  }

  embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.resolve(request.model).embed(request);
  }
}
