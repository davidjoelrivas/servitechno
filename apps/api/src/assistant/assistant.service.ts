import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/current-user.decorator";
import { AssistantAuditService } from "./assistant-audit.service";
import { ConfirmationService } from "./confirmation.service";
import { ContextBuilder } from "./context-builder.service";
import { ConversationRepository } from "./conversation.repository";
import { IntentResolver } from "./intent-resolver.service";
import { ToolRegistry } from "./tool-registry.service";
import { CommercialConfirmationService } from "./commercial-confirmation.service";

@Injectable()
export class AssistantService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly contextBuilder: ContextBuilder,
    private readonly tools: ToolRegistry,
    private readonly confirmations: ConfirmationService,
    private readonly audit: AssistantAuditService,
    private readonly intentResolver: IntentResolver,
    private readonly commercial: CommercialConfirmationService,
  ) {}

  status() {
    return this.intentResolver.status();
  }
  list(user: AuthUser) {
    return this.conversations.list(user.sub);
  }
  create(user: AuthUser, title?: string) {
    return this.conversations.create(user.sub, title);
  }
  get(id: string, user: AuthUser) {
    return this.conversations.getOwned(id, user.sub);
  }

  async send(conversationId: string, content: string, user: AuthUser) {
    await this.conversations.addMessage(conversationId, user.sub, "USER", content.trim());
    const [turns, context] = await Promise.all([
      this.conversations.turns(conversationId, user.sub),
      this.contextBuilder.build(user),
    ]);
    const intent = await this.intentResolver.resolve(turns, context);
    await this.audit.record({
      userId: user.sub,
      action: "assistant.intent.resolve",
      entityType: "AssistantConversation",
      entityId: conversationId,
      after: { intent: intent.intent },
    });

    let answer: string;
    let cards: unknown;
    let proposal: unknown;
    if (
      [
        "BUSINESS_SUMMARY",
        "SALES_SUMMARY",
        "CASH_STATUS",
        "LOW_STOCK",
        "PENDING_REPAIRS",
        "MY_PERFORMANCE",
        "TEAM_PERFORMANCE",
      ].includes(intent.intent)
    ) {
      const result = await this.tools.execute(intent, user);
      answer = result.answer;
      cards = result.cards;
    } else if (intent.intent === "PREPARE_EXPENSE") {
      const result = await this.confirmations.prepareExpense(conversationId, intent, user);
      answer = result.question ?? result.answer;
      proposal = result.proposal;
    } else if (intent.intent === "PREPARE_PURCHASE") {
      const result = await this.commercial.preparePurchase(conversationId, intent, user);
      answer = result.question ?? result.answer;
      proposal = result.proposal;
    } else if (intent.intent === "PREPARE_SALE") {
      const result = await this.commercial.prepareSale(conversationId, intent, user);
      answer = result.question ?? result.answer;
      proposal = result.proposal;
    } else if (intent.intent === "PREPARE_PAYMENT") {
      const result = await this.commercial.preparePayment(conversationId, intent, user);
      answer = result.question ?? result.answer;
      proposal = result.proposal;
    } else if (intent.intent === "AMEND_PROPOSAL") {
      const result = await this.commercial.amend(conversationId, intent, user);
      answer = result.question ?? result.answer;
      proposal = result.proposal;
    } else if (intent.intent === "HELP") {
      answer =
        "Puedo consultar ventas, cobros, caja, bancos, utilidad, inventario bajo, reparaciones y rendimiento según tus permisos. También puedo preparar gastos, compras, ventas y abonos. Toda operación se registra únicamente después de que revises y confirmes su propuesta.";
    } else {
      answer =
        intent.question ??
        "No pude identificar una operación segura. Reformula la solicitud indicando qué deseas consultar o registrar.";
    }
    const metadata = cleanJson({ intent: intent.intent, cards, proposal });
    const message = await this.conversations.addMessage(
      conversationId,
      user.sub,
      "ASSISTANT",
      answer,
      metadata,
    );
    return { message, cards, proposal };
  }

  async confirm(proposalId: string, user: AuthUser) {
    const proposal = await this.confirmations.confirm(proposalId, user);
    if (proposal.status === "EXECUTED") {
      const result = proposal.result as Record<string, unknown> | null;
      const amount = result?.amount ?? result?.total;
      const number = result?.number ?? result?.sourceNumber;
      await this.conversations.addMessage(
        proposal.conversationId,
        user.sub,
        "ASSISTANT",
        `Operación registrada correctamente${number ? ` #${number}` : ""}${amount ? ` por L ${amount}` : ""}. Referencia: ${String(result?.entityId ?? proposal.id)}.`,
        cleanJson({
          proposalId: proposal.id,
          status: proposal.status,
          result,
        }),
      );
    }
    return proposal;
  }

  async cancel(proposalId: string, user: AuthUser) {
    const proposal = await this.confirmations.cancel(proposalId, user);
    await this.conversations.addMessage(
      proposal.conversationId,
      user.sub,
      "ASSISTANT",
      "La propuesta fue cancelada. No se registró ninguna operación.",
      cleanJson({ proposalId: proposal.id, status: proposal.status }),
    );
    return proposal;
  }
}

function cleanJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

