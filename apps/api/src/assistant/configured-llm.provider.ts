import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AssistantContext, ConversationTurn } from "./assistant.types";
import { LlmProvider } from "./llm.provider";
import { OllamaLlmProvider } from "./ollama.provider";
import { OpenAiLlmProvider } from "./openai.provider";

@Injectable()
export class ConfiguredLlmProvider extends LlmProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly ollama: OllamaLlmProvider,
    private readonly openai: OpenAiLlmProvider,
  ) {
    super();
  }

  status() {
    return this.selected().status();
  }

  resolve(messages: ConversationTurn[], context: AssistantContext) {
    return this.selected().resolve(messages, context);
  }

  private selected() {
    const provider = (this.config.get<string>("ASSISTANT_PROVIDER") ?? "ollama")
      .trim()
      .toLowerCase();
    if (provider === "ollama") return this.ollama;
    if (provider === "openai") return this.openai;
    throw new ServiceUnavailableException(
      `Proveedor de IA no soportado: ${provider}. Use ollama u openai.`,
    );
  }
}
