import { Module } from "@nestjs/common";
import { OperationsModule } from "../operations/operations.module";
import { PerformanceModule } from "../performance/performance.module";
import { AssistantAuditService } from "./assistant-audit.service";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";
import { ConfirmationService } from "./confirmation.service";
import { CommercialConfirmationService } from "./commercial-confirmation.service";
import { ProcurementModule } from "../procurement/procurement.module";
import { ContextBuilder } from "./context-builder.service";
import { ConversationRepository } from "./conversation.repository";
import { LLM_PROVIDER } from "./llm.provider";
import { IntentResolver } from "./intent-resolver.service";
import { OllamaLlmProvider } from "./ollama.provider";
import { OpenAiLlmProvider } from "./openai.provider";
import { ConfiguredLlmProvider } from "./configured-llm.provider";
import { ToolRegistry } from "./tool-registry.service";

@Module({
  imports: [OperationsModule, PerformanceModule, ProcurementModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    ConversationRepository,
    ContextBuilder,
    ToolRegistry,
    ConfirmationService,
    CommercialConfirmationService,
    AssistantAuditService,
    IntentResolver,
    OllamaLlmProvider,
    OpenAiLlmProvider,
    ConfiguredLlmProvider,
    { provide: LLM_PROVIDER, useExisting: ConfiguredLlmProvider },
  ],
  exports: [AssistantService, LLM_PROVIDER],
})
export class AssistantModule {}

