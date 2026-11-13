import { ServiceUnavailableException } from "@nestjs/common";
import type {
  AssistantContext,
  ConversationTurn,
  ResolvedIntent,
} from "./assistant.types";

export const LLM_PROVIDER = Symbol("LLM_PROVIDER");

export abstract class LlmProvider {
  abstract resolve(
    messages: ConversationTurn[],
    context: AssistantContext,
  ): Promise<ResolvedIntent>;
  abstract status(): Promise<{
    provider: string;
    configured: boolean;
    available: boolean;
    model?: string;
    message: string;
  }>;

  protected unavailable(message: string): never {
    throw new ServiceUnavailableException(message);
  }
}

