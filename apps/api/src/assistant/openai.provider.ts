import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AssistantContext,
  ConversationTurn,
} from "./assistant.types";
import { LlmProvider } from "./llm.provider";
import {
  assistantOutputSchema,
  buildAssistantSystemPrompt,
  validateResolvedIntent,
} from "./ollama.provider";

@Injectable()
export class OpenAiLlmProvider extends LlmProvider {
  private readonly logger = new Logger(OpenAiLlmProvider.name);
  private readonly requests: number[] = [];

  constructor(private readonly config: ConfigService) {
    super();
  }

  async status() {
    const key = this.apiKey();
    const model = this.model();
    if (!key)
      return {
        provider: "openai",
        configured: false,
        available: false,
        model,
        message: "Falta OPENAI_API_KEY. No se realizó ninguna conexión externa.",
      };
    try {
      const response = await fetch(
        `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
        {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(5000),
        },
      );
      return {
        provider: "openai",
        configured: true,
        available: response.ok,
        model,
        message: response.ok
          ? "OpenAI API disponible. Las solicitudes se facturan en la plataforma API."
          : `OpenAI API rechazó la configuración (HTTP ${response.status}).`,
      };
    } catch {
      return {
        provider: "openai",
        configured: true,
        available: false,
        model,
        message: "No fue posible conectar con OpenAI API.",
      };
    }
  }

  async resolve(messages: ConversationTurn[], context: AssistantContext) {
    const key = this.apiKey();
    if (!key)
      throw new ServiceUnavailableException(
        "OpenAI API no está configurada. Ollama continúa disponible seleccionando ASSISTANT_PROVIDER=ollama.",
      );
    this.enforceLocalLimits(messages);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model(),
          store: false,
          instructions: buildAssistantSystemPrompt(context),
          input: messages.slice(-16).map((message) => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
          })),
          text: {
            format: {
              type: "json_schema",
              name: "servitechno_intent",
              strict: true,
              schema: assistantOutputSchema,
            },
          },
        }),
        signal: AbortSignal.timeout(this.timeout()),
      });
    } catch {
      this.logUsage(startedAt, "network_error");
      throw new ServiceUnavailableException(
        "OpenAI API no respondió. No se ejecutó ninguna operación y el resto del ERP continúa disponible.",
      );
    }
    const body = (await response.json().catch(() => ({}))) as OpenAiResponse;
    this.logUsage(startedAt, response.ok ? "ok" : `http_${response.status}`, body.usage);
    if (!response.ok)
      throw new ServiceUnavailableException(
        `OpenAI API rechazó la solicitud (HTTP ${response.status}). No se ejecutó ninguna operación.`,
      );
    const output = extractOutputText(body);
    try {
      return validateResolvedIntent(JSON.parse(output) as unknown);
    } catch {
      throw new ServiceUnavailableException(
        "OpenAI devolvió una respuesta estructurada no válida. No se ejecutó ninguna operación.",
      );
    }
  }

  private apiKey() {
    return this.config.get<string>("OPENAI_API_KEY")?.trim();
  }

  private model() {
    return this.config.get<string>("OPENAI_MODEL")?.trim() || "gpt-6-luna";
  }

  private timeout() {
    return Number(this.config.get("OPENAI_TIMEOUT_MS") ?? 60000);
  }

  private enforceLocalLimits(messages: ConversationTurn[]) {
    const now = Date.now();
    const limit = Number(this.config.get("OPENAI_MAX_REQUESTS_PER_MINUTE") ?? 20);
    while (this.requests[0] && this.requests[0] < now - 60_000) this.requests.shift();
    if (this.requests.length >= limit)
      throw new ServiceUnavailableException(
        "Se alcanzó el límite local de solicitudes a OpenAI. Inténtelo en un minuto.",
      );
    const characters = messages.reduce((sum, message) => sum + message.content.length, 0);
    const maxCharacters = Number(this.config.get("OPENAI_MAX_INPUT_CHARS") ?? 24000);
    if (characters > maxCharacters)
      throw new ServiceUnavailableException(
        "La conversación supera el límite local configurado para envío externo.",
      );
    this.requests.push(now);
  }

  private logUsage(
    startedAt: number,
    status: string,
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number },
  ) {
    this.logger.log(
      JSON.stringify({
        event: "assistant.openai.request",
        model: this.model(),
        status,
        latencyMs: Date.now() - startedAt,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        totalTokens: usage?.total_tokens,
      }),
    );
  }
}

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

function extractOutputText(body: OpenAiResponse) {
  if (body.output_text) return body.output_text;
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text)
    .join("");
}
