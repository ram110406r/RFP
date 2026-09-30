import { Injectable, Logger } from "@nestjs/common";
import { GroqChatProvider } from "@rfp-os/ai";

/**
 * The API's Groq provider: the shared framework-free client from @rfp-os/ai
 * (also used by the worker for claim extraction) with Nest's logger and DI.
 */
@Injectable()
export class GroqAnswerProvider extends GroqChatProvider {
  constructor() {
    const logger = new Logger(GroqAnswerProvider.name);
    super({
      log: (message) => logger.log(message),
      warn: (message) => logger.warn(message),
      error: (message) => logger.error(message),
    });
  }
}
