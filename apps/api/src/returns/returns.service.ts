import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CashMovementType, InventoryMovementType, PaymentDirection, Prisma, SaleReturnType, SaleStatus } from "@prisma/client";
import { FinanceService, type LedgerLine } from "../operations/finance.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateSaleReturnDto } from "./returns.dto";

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

@Injectable()
export class ReturnsService {
  constructor(private prisma: PrismaService, private finance: FinanceService) {}

  list() {
    return this.prisma.saleReturn.findMany({
      include: { sale: { include: { customer: true } }, items: { include: { product: true } }, payments: { include: { method: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  }

  async create(saleId: string, dto: CreateSaleReturnDto, userId: string) {
    if (new Set(dto.items.map((item) => item.saleItemId)).size !== dto.items.length) throw new BadRequestException("Consolide los artículos repetidos");
    if (new Set(dto.refunds.map((payment) => payment.idempotencyKey)).size !== dto.refunds.length) throw new BadRequestException("Hay claves de reembolso duplicadas");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
        const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true, customer: true } });
        if (!sale) throw new NotFoundException("Venta no encontrada");
        if (([SaleStatus.VOIDED, SaleStatus.REFUNDED] as SaleStatus[]).includes(sale.status)) throw new ConflictException("La venta ya fue revertida totalmente");
        const byId = new Map(sale.items.map((item) => [item.id, item]));
        const storedLinesTotal = sale.items.reduce((sum, item) => sum.plus(item.total), D(0));
        const historicalDiscountRatio = storedLinesTotal.greaterThan(0) ? sale.total.dividedBy(storedLinesTotal) : D(1);
        let total = D(0); let restockedCost = D(0);
        const calculated = dto.items.map((input) => {
          const item = byId.get(input.saleItemId);
          if (!item) throw new BadRequestException("El artículo no pertenece a la venta");
          const quantity = D(input.quantity);
          if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException("La cantidad devuelta debe ser mayor que cero");
          if (quantity.greaterThan(item.quantity.minus(item.returnedQuantity))) throw new BadRequestException("La devolución supera la cantidad disponible");
          const unitPrice = item.total.dividedBy(item.quantity).times(historicalDiscountRatio).toDecimalPlaces(2);
          const lineTotal = unitPrice.times(quantity).toDecimalPlaces(2);
          total = total.plus(lineTotal);
          if (input.restock) restockedCost = restockedCost.plus(item.unitCost.times(quantity));
          return { input, item, quantity, unitPrice, lineTotal };
        });
        const availableTotal = sale.total.minus(sale.returnedTotal);
        if (total.greaterThan(availableTotal)) throw new BadRequestException("El importe devuelto supera el saldo disponible de la venta");
        if (total.lessThanOrEqualTo(0)) throw new BadRequestException("No existe importe disponible para devolver");
        if (dto.type === SaleReturnType.VOID) {
          const allReturned = sale.items.every((item) => {
            const requested = calculated.find((entry) => entry.item.id === item.id)?.quantity ?? D(0);
            return requested.equals(item.quantity.minus(item.returnedQuantity));
          });
          if (!allReturned || !total.equals(availableTotal)) throw new BadRequestException("La anulación debe revertir la totalidad restante de la venta");
        }
        const refundTotal = dto.refunds.reduce((sum, payment) => sum.plus(payment.amount), D(0));
        const arReduction = Prisma.Decimal.min(sale.balance, total);
        const refundable = total.minus(arReduction);
        if (refundTotal.greaterThan(refundable)) throw new BadRequestException("El reembolso supera el importe efectivamente cobrado");
        const creditAmount = refundable.minus(refundTotal);
        if (creditAmount.greaterThan(0) && !sale.customerId) throw new BadRequestException("Una venta sin cliente no puede generar saldo a favor; reembolse el importe completo");

        const methods = await tx.paymentMethod.findMany({ where: { id: { in: dto.refunds.map((payment) => payment.methodId) } } });
        if (methods.length !== new Set(dto.refunds.map((payment) => payment.methodId)).size) throw new NotFoundException("Método de reembolso no encontrado");
        const methodById = new Map(methods.map((method) => [method.id, method]));
        const saleReturn = await tx.saleReturn.create({ data: { saleId, type: dto.type, reason: dto.reason, total, arReduction, refundAmount: refundTotal, creditAmount, createdById: userId } });

        for (const entry of calculated) {
          await tx.saleReturnItem.create({ data: {
            saleReturnId: saleReturn.id, saleItemId: entry.item.id, productId: entry.item.productId,
            quantity: entry.quantity, unitPrice: entry.unitPrice, unitCost: entry.item.unitCost, total: entry.lineTotal, restocked: entry.input.restock,
          } });
          await tx.saleItem.update({ where: { id: entry.item.id }, data: { returnedQuantity: { increment: entry.quantity } } });
          if (entry.input.restock) {
            await tx.product.update({ where: { id: entry.item.productId }, data: { stock: { increment: entry.quantity } } });
            await tx.inventoryMovement.create({ data: { productId: entry.item.productId, type: InventoryMovementType.RETURN, quantity: entry.quantity, unitCost: entry.item.unitCost, referenceType: "SALE_RETURN", referenceId: saleReturn.id } });
          }
        }

        const newReturnedTotal = sale.returnedTotal.plus(total);
        const full = newReturnedTotal.equals(sale.total);
        await tx.sale.update({ where: { id: saleId }, data: {
          returnedTotal: newReturnedTotal, balance: sale.balance.minus(arReduction),
          status: full ? dto.type === SaleReturnType.VOID ? SaleStatus.VOIDED : SaleStatus.REFUNDED : SaleStatus.PARTIALLY_REFUNDED,
        } });

        const lines: LedgerLine[] = [{ accountCode: "4103", debit: total, memo: dto.type === SaleReturnType.VOID ? "Anulación" : "Devolución" }];
        if (arReduction.greaterThan(0)) lines.push({ accountCode: "1103", credit: arReduction, memo: "Reducción de cuenta por cobrar" });
        if (creditAmount.greaterThan(0)) lines.push({ accountCode: "2103", credit: creditAmount, memo: "Saldo a favor del cliente" });
        let cashRefund = D(0); let bankRefund = D(0);
        for (const payment of dto.refunds) {
          const method = methodById.get(payment.methodId)!;
          await tx.payment.create({ data: { ...payment, direction: PaymentDirection.OUT, saleReturnId: saleReturn.id, reference: dto.note } });
          if (method.isCash) cashRefund = cashRefund.plus(payment.amount); else bankRefund = bankRefund.plus(payment.amount);
        }
        if (cashRefund.greaterThan(0)) {
          const session = await tx.cashSession.findFirst({ where: { status: "OPEN" }, orderBy: { openedAt: "desc" } });
          if (!session) throw new ConflictException("Debe abrir una caja para reembolsar en efectivo");
          await tx.cashMovement.create({ data: { sessionId: session.id, type: CashMovementType.REFUND, amount: cashRefund, description: `Devolución #${saleReturn.number}`, referenceType: "SALE_RETURN", referenceId: saleReturn.id, userId } });
          lines.push({ accountCode: "1101", credit: cashRefund });
        }
        if (bankRefund.greaterThan(0)) lines.push({ accountCode: "1102", credit: bankRefund });
        if (restockedCost.greaterThan(0)) lines.push({ accountCode: "1104", debit: restockedCost }, { accountCode: "5101", credit: restockedCost });
        await this.finance.post(tx, { description: `${dto.type === SaleReturnType.VOID ? "Anulación" : "Devolución"} de venta #${sale.number}`, referenceType: "SALE_RETURN", referenceId: saleReturn.id, lines });
        await tx.auditLog.create({ data: { userId, action: dto.type === SaleReturnType.VOID ? "sales.void" : "sales.return", entityType: "SaleReturn", entityId: saleReturn.id, after: { saleId, total: total.toString(), refund: refundTotal.toString(), restockedCost: restockedCost.toString() } } });
        return tx.saleReturn.findUniqueOrThrow({ where: { id: saleReturn.id }, include: { items: { include: { product: true } }, payments: { include: { method: true } } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("El reembolso ya fue procesado");
      throw error;
    }
  }
}

