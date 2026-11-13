import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CashMovementType, InventoryMovementType, PaymentDirection, Prisma, PurchaseStatus } from "@prisma/client";
import { FinanceService, type LedgerLine } from "../operations/finance.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreatePurchaseDto, CreateSupplierDto, PayPurchaseDto, PurchasePaymentDto, UpdateSupplierDto } from "./procurement.dto";

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService, private finance: FinanceService) {}

  listSuppliers() {
    return this.prisma.supplier.findMany({ include: { _count: { select: { purchases: true, products: true } }, purchases: { select: { balance: true } } }, orderBy: { name: "asc" }, take: 200 });
  }

  async createSupplier(dto: CreateSupplierDto, userId: string) {
    const duplicate = await this.prisma.supplier.findFirst({ where: { name: { equals: dto.name.trim(), mode: "insensitive" } } });
    if (duplicate) throw new ConflictException("Ya existe un proveedor con ese nombre");
    const supplier = await this.prisma.supplier.create({ data: { ...dto, name: dto.name.trim() } });
    await this.prisma.auditLog.create({ data: { userId, action: "suppliers.create", entityType: "Supplier", entityId: supplier.id, after: dto as unknown as Prisma.InputJsonValue } });
    return supplier;
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, userId: string) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Proveedor no encontrado");
    const duplicate = await this.prisma.supplier.findFirst({ where: { id: { not: id }, name: { equals: dto.name.trim(), mode: "insensitive" } } });
    if (duplicate) throw new ConflictException("Ya existe otro proveedor con ese nombre");
    const updated = await this.prisma.supplier.update({ where: { id }, data: { ...dto, name: dto.name.trim() } });
    await this.prisma.auditLog.create({ data: { userId, action: "suppliers.update", entityType: "Supplier", entityId: id, before: existing as unknown as Prisma.InputJsonValue, after: dto as unknown as Prisma.InputJsonValue } });
    return updated;
  }

  listPurchases() {
    return this.prisma.purchase.findMany({ include: { supplier: true, items: { include: { product: true } }, payments: { include: { method: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async createPurchase(dto: CreatePurchaseDto, userId: string, assistantProposalId?: string) {
    if (new Set(dto.items.map((item) => item.productId)).size !== dto.items.length) throw new BadRequestException("Consolide los productos repetidos");
    if (new Set(dto.payments.map((payment) => payment.idempotencyKey)).size !== dto.payments.length) throw new BadRequestException("Hay claves de pago duplicadas");
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (assistantProposalId) {
          const existing = await tx.purchase.findUnique({
            where: { assistantProposalId },
            include: { supplier: true, items: { include: { product: true } }, payments: { include: { method: true } } },
          });
          if (existing) return existing;
        }
        const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
        if (!supplier) throw new NotFoundException("Proveedor no encontrado");
        const productIds = dto.items.map((item) => item.productId);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(productIds)}) FOR UPDATE`);
        const products = await tx.product.findMany({ where: { id: { in: productIds }, active: true } });
        if (products.length !== dto.items.length) throw new NotFoundException("Uno o más productos no existen");
        const byId = new Map(products.map((product) => [product.id, product]));
        const total = dto.items.reduce((sum, item) => {
          const quantity = D(item.quantity); const cost = D(item.unitCost);
          if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException("Las cantidades deben ser mayores que cero");
          if (cost.lessThan(0)) throw new BadRequestException("El costo no puede ser negativo");
          return sum.plus(quantity.times(cost));
        }, D(0)).toDecimalPlaces(2);
        const paid = dto.payments.reduce((sum, payment) => sum.plus(payment.amount), D(0));
        if (total.lessThanOrEqualTo(0)) throw new BadRequestException("La compra debe tener un valor mayor que cero");
        if (paid.greaterThan(total)) throw new BadRequestException("El pago supera el total de la compra");
        const purchase = await tx.purchase.create({ data: {
          supplierId: dto.supplierId, userId, assistantProposalId, subtotal: total, total, paid, balance: total.minus(paid),
          status: paid.equals(total) ? PurchaseStatus.PAID : paid.greaterThan(0) ? PurchaseStatus.PARTIALLY_PAID : PurchaseStatus.CONFIRMED,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined, reference: dto.reference, notes: dto.notes,
        } });
        for (const item of dto.items) {
          const product = byId.get(item.productId)!; const quantity = D(item.quantity); const unitCost = D(item.unitCost);
          const newStock = product.stock.plus(quantity);
          const newAverage = product.stock.times(product.averageCost).plus(quantity.times(unitCost)).dividedBy(newStock).toDecimalPlaces(2);
          await tx.product.update({ where: { id: product.id }, data: { stock: newStock, averageCost: newAverage, supplierId: dto.supplierId } });
          await tx.purchaseItem.create({ data: { purchaseId: purchase.id, productId: product.id, quantity, unitCost, total: quantity.times(unitCost).toDecimalPlaces(2) } });
          await tx.inventoryMovement.create({ data: { productId: product.id, type: InventoryMovementType.PURCHASE, quantity, unitCost, referenceType: "PURCHASE", referenceId: purchase.id } });
        }
        const paymentLines = await this.recordPayments(tx, purchase.id, purchase.number, dto.payments, userId);
        const lines: LedgerLine[] = [{ accountCode: "1104", debit: total }, ...paymentLines];
        if (total.greaterThan(paid)) lines.push({ accountCode: "2101", credit: total.minus(paid), memo: "Cuenta por pagar" });
        await this.finance.post(tx, { description: `Compra #${purchase.number}`, referenceType: "PURCHASE", referenceId: purchase.id, lines });
        await tx.auditLog.create({ data: { userId, action: "purchases.create", entityType: "Purchase", entityId: purchase.id, after: { total: total.toString(), paid: paid.toString(), supplierId: dto.supplierId } } });
        return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: { supplier: true, items: { include: { product: true } }, payments: { include: { method: true } } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("El pago de compra ya fue procesado");
      throw error;
    }
  }

  async payPurchase(id: string, dto: PayPurchaseDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${id} FOR UPDATE`;
        const purchase = await tx.purchase.findUnique({ where: { id } });
        if (!purchase) throw new NotFoundException("Compra no encontrada");
        if (purchase.status === PurchaseStatus.VOIDED || purchase.balance.lessThanOrEqualTo(0)) throw new ConflictException("La compra no tiene saldo pendiente");
        const amount = D(dto.amount);
        if (amount.lessThanOrEqualTo(0) || amount.greaterThan(purchase.balance)) throw new BadRequestException("El abono no es válido para el saldo pendiente");
        const paymentLines = await this.recordPayments(tx, purchase.id, purchase.number, [dto], userId);
        const newPaid = purchase.paid.plus(amount); const newBalance = purchase.balance.minus(amount);
        const updated = await tx.purchase.update({ where: { id }, data: { paid: newPaid, balance: newBalance, status: newBalance.isZero() ? PurchaseStatus.PAID : PurchaseStatus.PARTIALLY_PAID } });
        await this.finance.post(tx, { description: `Abono a compra #${purchase.number}`, referenceType: "PURCHASE_PAYMENT", referenceId: dto.idempotencyKey, lines: [{ accountCode: "2101", debit: amount }, ...paymentLines] });
        await tx.auditLog.create({ data: { userId, action: "purchases.pay", entityType: "Purchase", entityId: id, after: { amount: amount.toString(), balance: newBalance.toString() } } });
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Este abono ya fue procesado");
      throw error;
    }
  }

  private async recordPayments(tx: Prisma.TransactionClient, purchaseId: string, number: number, payments: PurchasePaymentDto[], userId: string) {
    const methods = await tx.paymentMethod.findMany({ where: { id: { in: payments.map((payment) => payment.methodId) } } });
    if (methods.length !== new Set(payments.map((payment) => payment.methodId)).size) throw new NotFoundException("Método de pago no encontrado");
    const byId = new Map(methods.map((method) => [method.id, method]));
    let cash = D(0); let bank = D(0);
    for (const payment of payments) {
      if (D(payment.amount).lessThanOrEqualTo(0)) throw new BadRequestException("Los pagos deben ser mayores que cero");
      const method = byId.get(payment.methodId)!;
      await tx.payment.create({ data: { methodId: payment.methodId, amount: payment.amount, idempotencyKey: payment.idempotencyKey, direction: PaymentDirection.OUT, purchaseId } });
      if (method.isCash) cash = cash.plus(payment.amount); else bank = bank.plus(payment.amount);
    }
    if (cash.greaterThan(0)) {
      const session = await tx.cashSession.findFirst({ where: { status: "OPEN" }, orderBy: { openedAt: "desc" } });
      if (!session) throw new ConflictException("Debe abrir una caja para pagar en efectivo");
      await tx.cashMovement.create({ data: { sessionId: session.id, type: CashMovementType.PURCHASE_PAYMENT, amount: cash, description: `Pago de compra #${number}`, referenceType: "PURCHASE", referenceId: purchaseId, userId } });
    }
    const lines: LedgerLine[] = [];
    if (cash.greaterThan(0)) lines.push({ accountCode: "1101", credit: cash });
    if (bank.greaterThan(0)) lines.push({ accountCode: "1102", credit: bank });
    return lines;
  }
}

