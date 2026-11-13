import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CashMovementType, CommissionStatus, Prisma } from "@prisma/client";
import { FinanceService } from "../operations/finance.service";
import { PrismaService } from "../prisma/prisma.service";
import type { PayCommissionDto } from "./commissions.dto";
import { isSerializationFailure, isUniqueViolation } from "../common/prisma-errors";

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

@Injectable()
export class CommissionsService {
  constructor(private prisma: PrismaService, private finance: FinanceService) {}

  list() {
    return this.prisma.commissionAllocation.findMany({
      include: { employee: true, repair: { include: { customer: true } }, payments: { include: { method: true }, orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" }, take: 200,
    });
  }

  async approve(id: string, userId: string) {
    const allocation = await this.prisma.commissionAllocation.findUnique({ where: { id } });
    if (!allocation) throw new NotFoundException("Comisión no encontrada");
    if (allocation.status !== CommissionStatus.PENDING) throw new ConflictException("La comisión no está pendiente de aprobación");
    const updated = await this.prisma.commissionAllocation.update({ where: { id }, data: { status: CommissionStatus.APPROVED } });
    await this.prisma.auditLog.create({ data: { userId, action: "commissions.approve", entityType: "CommissionAllocation", entityId: id, before: { status: allocation.status }, after: { status: updated.status } } });
    return updated;
  }

  async pay(id: string, dto: PayCommissionDto, userId: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "CommissionAllocation" WHERE id = ${id} FOR UPDATE`;
        const allocation = await tx.commissionAllocation.findUnique({ where: { id }, include: { employee: true } });
        if (!allocation) throw new NotFoundException("Comisión no encontrada");
        if (!([CommissionStatus.APPROVED, CommissionStatus.PARTIALLY_PAID] as CommissionStatus[]).includes(allocation.status)) throw new ConflictException("La comisión no está disponible para pago");
        const amount = D(dto.amount); const pending = allocation.amount.minus(allocation.paidAmount);
        if (amount.lessThanOrEqualTo(0) || amount.greaterThan(pending)) throw new BadRequestException("El pago supera el saldo pendiente de la comisión");
        const method = await tx.paymentMethod.findUnique({ where: { id: dto.methodId } });
        if (!method) throw new NotFoundException("Método de pago no encontrado");
        const payment = await tx.commissionPayment.create({ data: { allocationId: id, methodId: dto.methodId, amount, idempotencyKey: dto.idempotencyKey, userId, note: dto.note } });
        if (method.isCash) {
          const session = await tx.cashSession.findFirst({ where: { status: "OPEN" }, orderBy: { openedAt: "desc" } });
          if (!session) throw new ConflictException("Debe abrir una caja para pagar en efectivo");
          await tx.cashMovement.create({ data: { sessionId: session.id, type: CashMovementType.COMMISSION_PAYMENT, amount, description: `Pago de comisión a ${allocation.employee.name}`, referenceType: "COMMISSION_PAYMENT", referenceId: payment.id, userId } });
        }
        const paidAmount = allocation.paidAmount.plus(amount); const status = paidAmount.equals(allocation.amount) ? CommissionStatus.PAID : CommissionStatus.PARTIALLY_PAID;
        const updated = await tx.commissionAllocation.update({ where: { id }, data: { paidAmount, status } });
        await this.finance.post(tx, { description: `Pago de comisión a ${allocation.employee.name}`, referenceType: "COMMISSION_PAYMENT", referenceId: payment.id, lines: [
          { accountCode: "2102", debit: amount }, { accountCode: method.isCash ? "1101" : "1102", credit: amount },
        ] });
        await tx.auditLog.create({ data: { userId, action: "commissions.pay", entityType: "CommissionAllocation", entityId: id, after: { paymentId: payment.id, amount: amount.toString(), paidAmount: paidAmount.toString(), status } } });
        return updated;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (isSerializationFailure(error) && attempt === 0) continue;
        if (isUniqueViolation(error)) throw new ConflictException("Este pago de comisión ya fue procesado");
        throw error;
      }
    }
    throw new ConflictException("La comisión fue modificada por otra operación; inténtelo de nuevo");
  }
}

