import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuthUser } from "../auth/current-user.decorator";
import type { CreateExpenseDto } from "../operations/operations.dto";
import { OperationsService } from "../operations/operations.service";
import { PrismaService } from "../prisma/prisma.service";
import { AssistantAuditService } from "./assistant-audit.service";
import type { ResolvedIntent } from "./assistant.types";
import { CommercialConfirmationService } from "./commercial-confirmation.service";

@Injectable()
export class ConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsService,
    private readonly audit: AssistantAuditService,
    private readonly config: ConfigService,
    private readonly commercial: CommercialConfirmationService,
  ) {}

  async prepareExpense(
    conversationId: string,
    intent: ResolvedIntent,
    user: AuthUser,
  ): Promise<{ question?: string; proposal?: unknown; answer: string }> {
    this.require(user, "expenses.create");
    const expense = intent.expense ?? {};
    if (!expense.amount)
      return { question: "¿Cuál fue el importe del gasto?", answer: "Necesito el importe para preparar el gasto." };
    const amount = normalizeMoney(expense.amount);
    if (!amount || Number(amount) <= 0)
      throw new BadRequestException("El importe del gasto no es válido");
    if (!expense.concept?.trim())
      return { question: "¿Cuál fue el concepto del gasto?", answer: "Necesito saber en qué se gastó." };

    const [categories, methods] = await Promise.all([
      this.prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
      this.prisma.paymentMethod.findMany({ orderBy: { name: "asc" } }),
    ]);
    const category = matchOne(categories, expense.categoryQuery);
    if (!category)
      return {
        question: `¿Qué categoría corresponde? Opciones: ${categories.map((item) => item.name).join(", ")}.`,
        answer: "Necesito una categoría válida antes de preparar el gasto.",
      };
    const method = matchPayment(methods, expense.paymentMethodQuery);
    if (!method)
      return {
        question: `¿Cómo se pagó? Opciones: ${methods.map((item) => item.name).join(", ")}.`,
        answer: "Necesito el método de pago antes de preparar el gasto.",
      };
    await this.ensureFunds(method, amount);

    await this.prisma.assistantProposal.updateMany({
      where: { conversationId, userId: user.sub, status: "PENDING" },
      data: { status: "CANCELLED", failureReason: "Reemplazada por una propuesta posterior" },
    });
    const ttlMinutes = Number(this.config.get("ASSISTANT_PROPOSAL_TTL_MINUTES") ?? 15);
    const payload: CreateExpenseDto = {
      categoryId: category.id,
      concept: expense.concept.trim().slice(0, 300),
      amount,
      methodId: method.id,
    };
    const summary = {
      title: "Registrar gasto",
      amount: `L ${amount}`,
      concept: payload.concept,
      category: category.name,
      paymentMethod: method.name,
      impact: method.isCash
        ? "Disminuirá la caja y reconocerá un gasto operativo."
        : "Disminuirá el saldo bancario registrado y reconocerá un gasto operativo.",
    };
    const proposal = await this.prisma.assistantProposal.create({
      data: {
        conversationId,
        userId: user.sub,
        type: "EXPENSE_CREATE",
        payload: payload as unknown as Prisma.InputJsonValue,
        summary,
        idempotencyKey: randomUUID(),
        sessionVersion: user.sessionVersion,
        permissions: [...user.permissions].sort(),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    });
    await this.audit.record({
      userId: user.sub,
      action: "assistant.proposal.prepare",
      entityType: "AssistantProposal",
      entityId: proposal.id,
      after: { type: proposal.type, amount, category: category.name, method: method.name },
    });
    return {
      proposal,
      answer: `Preparé un gasto de L ${amount} por ${payload.concept}, categoría ${category.name}, pagado mediante ${method.name}. ${summary.impact} Revísalo y confirma de forma explícita.`,
    };
  }

  async confirm(id: string, user: AuthUser) {
    const proposal = await this.getOwned(id, user.sub);
    if (proposal.status === "EXECUTED") return proposal;
    if (proposal.status !== "PENDING")
      throw new ConflictException(`La propuesta está en estado ${proposal.status}`);
    if (proposal.expiresAt <= new Date()) {
      await this.prisma.assistantProposal.update({
        where: { id },
        data: { status: "EXPIRED", failureReason: "Venció antes de confirmarse" },
      });
      throw new ConflictException("La propuesta venció; solicite una nueva");
    }
    const current = await this.prisma.user.findUnique({ where: { id: user.sub } });
    if (!current?.active || current.sessionVersion !== proposal.sessionVersion) {
      await this.invalidate(id, "Los permisos o la sesión cambiaron");
      throw new ForbiddenException(
        "La sesión o los permisos cambiaron. Prepare nuevamente la operación.",
      );
    }
    const claimed = await this.prisma.assistantProposal.updateMany({
      where: { id, userId: user.sub, status: "PENDING" },
      data: { status: "EXECUTING" },
    });
    if (claimed.count !== 1)
      throw new ConflictException("La propuesta ya está siendo procesada");
    try {
      let result: Record<string, unknown>;
      if (proposal.type === "EXPENSE_CREATE") {
        this.require(user, "expenses.create");
        const payload = proposal.payload as unknown as CreateExpenseDto;
        const [category, method] = await Promise.all([
          this.prisma.expenseCategory.findUnique({ where: { id: payload.categoryId } }),
          this.prisma.paymentMethod.findUnique({ where: { id: payload.methodId } }),
        ]);
        if (!category || !method)
          throw new ConflictException("La categoría o el método ya no están disponibles");
        await this.ensureFunds(method, payload.amount);
        const expense = await this.operations.createExpense(payload, user.sub, proposal.id);
        result = {
          entityType: "Expense",
          entityId: expense.id,
          amount: expense.amount.toString(),
        };
      } else {
        result = await this.commercial.execute(proposal, user);
      }
      const executed = await this.prisma.assistantProposal.update({
        where: { id },
        data: {
          status: "EXECUTED",
          executedAt: new Date(),
          result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
          failureReason: null,
        },
      });
      await this.audit.record({
        userId: user.sub,
        action: "assistant.proposal.execute",
        entityType: String(result.entityType ?? "AssistantOperation"),
        entityId: String(result.entityId ?? proposal.id),
        after: JSON.parse(JSON.stringify({ proposalId: id, result })) as Prisma.InputJsonValue,
      });
      return executed;
    } catch (error) {
      await this.prisma.assistantProposal.updateMany({
        where: { id, status: "EXECUTING" },
        data: {
          status: "FAILED",
          failureReason: error instanceof Error ? error.message.slice(0, 500) : "Error desconocido",
        },
      });
      throw error;
    }
  }

  async cancel(id: string, user: AuthUser) {
    const proposal = await this.getOwned(id, user.sub);
    if (proposal.status === "CANCELLED") return proposal;
    if (proposal.status !== "PENDING")
      throw new ConflictException("Solo puede cancelarse una propuesta pendiente");
    const cancelled = await this.prisma.assistantProposal.update({
      where: { id },
      data: { status: "CANCELLED", failureReason: "Cancelada por el usuario" },
    });
    await this.audit.record({
      userId: user.sub,
      action: "assistant.proposal.cancel",
      entityType: "AssistantProposal",
      entityId: id,
    });
    return cancelled;
  }

  private async getOwned(id: string, userId: string) {
    const proposal = await this.prisma.assistantProposal.findFirst({ where: { id, userId } });
    if (!proposal) throw new NotFoundException("Propuesta no encontrada");
    return proposal;
  }

  private invalidate(id: string, reason: string) {
    return this.prisma.assistantProposal.update({
      where: { id },
      data: { status: "INVALIDATED", failureReason: reason },
    });
  }

  private require(user: AuthUser, permission: string) {
    if (!user.permissions.includes(permission))
      throw new ForbiddenException("No tienes permiso para realizar esta operación");
  }

  private async ensureFunds(
    method: { isCash: boolean; name: string },
    amount: string,
  ) {
    if (method.isCash) {
      const cash = await this.operations.currentCash();
      if (!cash)
        throw new ConflictException(
          "No hay una caja abierta. Ábrela antes de registrar un gasto en efectivo.",
        );
      const incoming = new Set([
        "OPENING",
        "SALE_COLLECTION",
        "REPAIR_COLLECTION",
        "CASH_IN",
        "TRANSFER_IN",
      ]);
      const expected = cash.movements.reduce(
        (sum, item) =>
          sum + (incoming.has(item.type) ? Number(item.amount) : -Number(item.amount)),
        0,
      );
      if (expected < Number(amount))
        throw new ConflictException(
          `La caja solo tiene L ${expected.toFixed(2)} disponibles para este gasto.`,
        );
      return;
    }
    const dashboard = await this.operations.dashboard({});
    if (Number(dashboard.bankBalance) < Number(amount))
      throw new ConflictException(
        `El saldo bancario registrado es L ${dashboard.bankBalance}, insuficiente para este gasto.`,
      );
  }
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizeMoney(value: string) {
  const match = value.replace(/,/g, "").match(/\d{1,12}(?:\.\d{1,2})?/);
  return match?.[0];
}

function matchOne<T extends { name: string }>(items: T[], query?: string): T | undefined {
  if (!query) return undefined;
  const wanted = normalize(query);
  const exact = items.find((item) => normalize(item.name) === wanted);
  if (exact) return exact;
  const matches = items.filter(
    (item) => normalize(item.name).includes(wanted) || wanted.includes(normalize(item.name)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function matchPayment<T extends { name: string; code: string; isCash: boolean }>(
  items: T[],
  query?: string,
) {
  if (!query) return undefined;
  const wanted = normalize(query);
  if (["caja", "efectivo", "cash"].some((word) => wanted.includes(word)))
    return items.find((item) => item.isCash);
  if (["transferencia", "banco", "bank"].some((word) => wanted.includes(word)))
    return items.find((item) => item.code === "TRANSFER") ?? items.find((item) => !item.isCash);
  return matchOne(items, query);
}

