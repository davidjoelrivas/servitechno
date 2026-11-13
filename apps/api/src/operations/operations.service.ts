import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CashMovementType,
  CommissionStatus,
  InventoryMovementType,
  PaymentDirection,
  Prisma,
  RepairPartSource,
  RepairStatus,
  SaleStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentsService } from "../documents/documents.service";
import { FinanceService, type LedgerLine } from "./finance.service";
import type {
  CloseCashDto,
  CompleteRepairDto,
  CreateCustomerDto,
  CreateExpenseDto,
  CreateProductDto,
  CreateRepairDto,
  CreateSaleDto,
  DateRangeDto,
  OpenCashDto,
  RegisterPaymentDto,
  UpdateRepairDto,
} from "./operations.dto";
import type { AuthUser } from "../auth/current-user.decorator";

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

@Injectable()
export class OperationsService {
  constructor(
    private prisma: PrismaService,
    private finance: FinanceService,
    private documents: DocumentsService,
  ) {}

  getSettings() {
    return this.prisma.businessSetting.findUnique({ where: { id: "default" } });
  }
  listCustomers() {
    return this.prisma.customer.findMany({
      orderBy: { name: "asc" },
      take: 100,
    });
  }
  createCustomer(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }
  listProducts() {
    return this.prisma.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: 200,
    });
  }
  listPaymentMethods() {
    return this.prisma.paymentMethod.findMany({ orderBy: { name: "asc" } });
  }
  listCashRegisters() {
    return this.prisma.cashRegister.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
  }
  listExpenseCategories() {
    return this.prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
  }
  listEmployees() {
    return this.prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
  }

  async createProduct(dto: CreateProductDto, userId: string) {
    if (
      ["PHONE", "COMPUTER"].includes(dto.documentType ?? "OTHER") &&
      dto.warrantyDays !== undefined &&
      dto.warrantyDays < 60
    )
      throw new BadRequestException(
        "La garantía de bienes durables no puede configurarse por debajo de 60 días",
      );
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sku: dto.sku.toUpperCase(),
          name: dto.name,
          salePrice: dto.salePrice,
          averageCost: dto.averageCost,
          stock: dto.stock,
          minimumStock: dto.minimumStock,
          documentType: dto.documentType,
          condition: dto.condition,
          warrantyDays: dto.warrantyDays,
        },
      });
      if (D(dto.stock).greaterThan(0))
        await tx.inventoryMovement.create({
          data: {
            productId: created.id,
            type: InventoryMovementType.ADJUSTMENT,
            quantity: dto.stock,
            unitCost: dto.averageCost,
            referenceType: "INITIAL_STOCK",
            referenceId: created.id,
          },
        });
      await tx.auditLog.create({
        data: {
          userId,
          action: "product.create",
          entityType: "Product",
          entityId: created.id,
          after: dto as unknown as Prisma.InputJsonValue,
        },
      });
      return created;
    });
    return product;
  }

  async openCash(dto: OpenCashDto, userId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const register = await tx.cashRegister.findUnique({
            where: { id: dto.registerId },
          });
          if (!register?.active)
            throw new NotFoundException("Caja no encontrada");
          const open = await tx.cashSession.findFirst({
            where: { registerId: dto.registerId, status: "OPEN" },
          });
          if (open)
            throw new ConflictException(
              "Esta caja ya tiene una sesión abierta",
            );
          const session = await tx.cashSession.create({
            data: {
              registerId: dto.registerId,
              openedById: userId,
              openingBalance: dto.openingBalance,
            },
          });
          await tx.cashMovement.create({
            data: {
              sessionId: session.id,
              type: "OPENING",
              amount: dto.openingBalance,
              description: "Fondo inicial (no constituye ingreso)",
              userId,
            },
          });
          await tx.auditLog.create({
            data: {
              userId,
              action: "cash.open",
              entityType: "CashSession",
              entityId: session.id,
              after: dto as unknown as Prisma.InputJsonValue,
            },
          });
          return session;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("Esta caja ya tiene una sesión abierta");
      throw error;
    }
  }

  currentCash() {
    return this.prisma.cashSession.findFirst({
      where: { status: "OPEN" },
      include: {
        register: true,
        movements: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { openedAt: "desc" },
    });
  }

  async closeCash(id: string, dto: CloseCashDto, userId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const session = await tx.cashSession.findUnique({
          where: { id },
          include: { movements: true },
        });
        if (!session || session.status !== "OPEN")
          throw new ConflictException("La sesión no está abierta");
        const incoming = new Set<CashMovementType>([
          "OPENING",
          "SALE_COLLECTION",
          "REPAIR_COLLECTION",
          "CASH_IN",
          "TRANSFER_IN",
        ]);
        const expected = session.movements.reduce(
          (sum, movement) =>
            incoming.has(movement.type)
              ? sum.plus(movement.amount)
              : sum.minus(movement.amount),
          D(0),
        );
        const counted = D(dto.countedCash);
        const updated = await tx.cashSession.update({
          where: { id },
          data: {
            status: "CLOSED",
            closedById: userId,
            expectedCash: expected,
            countedCash: counted,
            difference: counted.minus(expected),
            closingNote: dto.note,
            closedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: "cash.close",
            entityType: "CashSession",
            entityId: id,
            after: {
              expected: expected.toString(),
              counted: counted.toString(),
              note: dto.note ?? null,
            },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createSale(dto: CreateSaleDto, userId: string, assistantProposalId?: string) {
    if (
      new Set(dto.payments.map((p) => p.idempotencyKey)).size !==
      dto.payments.length
    )
      throw new BadRequestException("Hay claves de pago duplicadas");
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (assistantProposalId) {
            const existing = await tx.sale.findUnique({
              where: { assistantProposalId },
              include: {
                items: { include: { product: true } },
                payments: { include: { method: true } },
              },
            });
            if (existing) return existing;
          }
          const productIds = dto.items.map((item) => item.productId);
          if (new Set(productIds).size !== productIds.length)
            throw new BadRequestException("Consolide los productos repetidos");
          const products = await tx.product.findMany({
            where: { id: { in: productIds }, active: true },
          });
          if (products.length !== productIds.length)
            throw new NotFoundException("Uno o más productos no existen");
          const byId = new Map(products.map((p) => [p.id, p]));
          const warrantied = dto.items.filter((item) =>
            ["PHONE", "COMPUTER"].includes(
              byId.get(item.productId)!.documentType,
            ),
          );
          if (warrantied.length && !dto.customerId)
            throw new BadRequestException(
              "Los artículos con garantía requieren un cliente",
            );
          if (warrantied.some((item) => !item.serial?.trim()))
            throw new BadRequestException(
              "Registre IMEI o serie para cada artículo con garantía",
            );
          const subtotal = dto.items.reduce((sum, item) => {
            if (
              D(item.quantity).lessThanOrEqualTo(0) ||
              D(item.unitPrice).lessThanOrEqualTo(0)
            )
              throw new BadRequestException(
                "Cantidades y precios deben ser mayores que cero",
              );
            return sum.plus(D(item.quantity).times(item.unitPrice));
          }, D(0));
          const discount = D(dto.discount ?? 0);
          if (discount.greaterThan(subtotal))
            throw new BadRequestException("El descuento supera el subtotal");
          const total = subtotal.minus(discount);
          const paid = dto.payments.reduce(
            (sum, payment) => sum.plus(payment.amount),
            D(0),
          );
          if (paid.greaterThan(total))
            throw new BadRequestException(
              "El pago supera el total de la venta",
            );
          if (paid.lessThan(total) && !dto.customerId)
            throw new BadRequestException(
              "Una venta a crédito requiere cliente",
            );
          const sale = await tx.sale.create({
            data: {
              customerId: dto.customerId,
              userId,
              assistantProposalId,
              subtotal,
              discount,
              tax: 0,
              total,
              paid,
              balance: total.minus(paid),
              status: paid.equals(total)
                ? SaleStatus.PAID
                : paid.isZero()
                  ? SaleStatus.CONFIRMED
                  : SaleStatus.PARTIALLY_PAID,
              confirmedAt: new Date(),
            },
          });
          if (total.lessThanOrEqualTo(0))
            throw new BadRequestException(
              "El total de la venta debe ser mayor que cero",
            );
          let cogs = D(0);
          let allocatedDiscount = D(0);
          for (const [index, item] of dto.items.entries()) {
            const product = byId.get(item.productId)!;
            const quantity = D(item.quantity);
            const changed = await tx.product.updateMany({
              where: { id: product.id, stock: { gte: quantity } },
              data: { stock: { decrement: quantity } },
            });
            if (changed.count !== 1)
              throw new ConflictException(
                `Inventario insuficiente para ${product.name}`,
              );
            const gross = quantity.times(item.unitPrice);
            const lineDiscount =
              index === dto.items.length - 1
                ? discount.minus(allocatedDiscount)
                : discount.times(gross).dividedBy(subtotal).toDecimalPlaces(2);
            allocatedDiscount = allocatedDiscount.plus(lineDiscount);
            const lineTotal = gross.minus(lineDiscount);
            await tx.saleItem.create({
              data: {
                saleId: sale.id,
                productId: product.id,
                quantity,
                unitPrice: item.unitPrice,
                unitCost: product.averageCost,
                discount: lineDiscount,
                total: lineTotal,
                serial: item.serial?.trim(),
                color: item.color,
                capacity: item.capacity,
                specifications: item.specifications,
                warrantyDays: product.warrantyDays,
              },
            });
            await tx.inventoryMovement.create({
              data: {
                productId: product.id,
                type: InventoryMovementType.SALE,
                quantity: quantity.negated(),
                unitCost: product.averageCost,
                referenceType: "SALE",
                referenceId: sale.id,
              },
            });
            cogs = cogs.plus(quantity.times(product.averageCost));
          }
          const paymentResult = await this.recordIncomingPayments(
            tx,
            dto.payments,
            userId,
            {
              saleId: sale.id,
              referenceType: "SALE",
              movementType: "SALE_COLLECTION",
            },
          );
          const lines: LedgerLine[] = [...paymentResult.ledgerLines];
          if (total.greaterThan(paid))
            lines.push({
              accountCode: "1103",
              debit: total.minus(paid),
              memo: "Cuenta por cobrar",
            });
          lines.push({
            accountCode: "4101",
            credit: total,
            memo: "Ingreso por venta",
          });
          if (cogs.greaterThan(0))
            lines.push(
              { accountCode: "5101", debit: cogs },
              { accountCode: "1104", credit: cogs },
            );
          await this.finance.post(tx, {
            description: `Venta #${sale.number}`,
            referenceType: "SALE",
            referenceId: sale.id,
            lines,
          });
          await this.documents.createSaleDocuments(tx, sale.id, userId);
          await tx.auditLog.create({
            data: {
              userId,
              action: "sales.create",
              entityType: "Sale",
              entityId: sale.id,
              after: { total: total.toString(), cogs: cogs.toString() },
            },
          });
          return tx.sale.findUniqueOrThrow({
            where: { id: sale.id },
            include: {
              items: { include: { product: true } },
              payments: { include: { method: true } },
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("Uno de los pagos ya fue procesado");
      throw error;
    }
  }

  listSales(user: AuthUser) {
    return this.prisma.sale.findMany({
      where: user.roles.includes("ADMIN") ? {} : { userId: user.sub },
      include: {
        customer: true,
        items: { include: { product: true } },
        payments: { include: { method: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async paySale(id: string, dto: RegisterPaymentDto, user: AuthUser, assistantProposalId?: string) {
    return this.registerLaterPayment("SALE", id, dto, user, assistantProposalId);
  }

  async createRepair(dto: CreateRepairDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const repair = await tx.repairOrder.create({
        data: {
          ...dto,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          receivedById: userId,
        },
      });
      await tx.repairEvent.create({
        data: {
          repairId: repair.id,
          status: RepairStatus.RECEIVED,
          note: "Equipo recibido",
          userId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "repairs.create",
          entityType: "RepairOrder",
          entityId: repair.id,
        },
      });
      await this.documents.createRepairIntake(tx, repair.id, userId);
      return repair;
    });
  }

  async listRepairs(user: AuthUser) {
    const employee = user.roles.includes("ADMIN")
      ? null
      : await this.prisma.employee.findUnique({ where: { userId: user.sub } });
    const where = user.roles.includes("ADMIN")
      ? {}
      : user.roles.includes("TECHNICIAN") && employee
        ? { technicianId: employee.id }
        : { receivedById: user.sub };
    return this.prisma.repairOrder.findMany({
      where,
      include: {
        customer: true,
        technician: true,
        parts: { include: { product: true, supplier: true } },
        events: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async payRepair(id: string, dto: RegisterPaymentDto, user: AuthUser, assistantProposalId?: string) {
    return this.registerLaterPayment("REPAIR", id, dto, user, assistantProposalId);
  }

  async updateRepair(id: string, dto: UpdateRepairDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.repairOrder.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("Reparación no encontrada");
      if (
        (
          [RepairStatus.DELIVERED, RepairStatus.CANCELLED] as RepairStatus[]
        ).includes(existing.status)
      )
        throw new ConflictException(
          "Una orden finalizada requiere un proceso de reversión",
        );
      const updated = await tx.repairOrder.update({
        where: { id },
        data: {
          status: dto.status,
          diagnosis: dto.diagnosis,
          workPerformed: dto.workPerformed,
          estimatedPrice: dto.estimatedPrice,
        },
      });
      await tx.repairEvent.create({
        data: { repairId: id, status: dto.status, note: dto.note, userId },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "repairs.update",
          entityType: "RepairOrder",
          entityId: id,
          before: { status: existing.status },
          after: { status: dto.status },
        },
      });
      return updated;
    });
  }

  async completeRepair(id: string, dto: CompleteRepairDto, user: AuthUser) {
    const userId = user.sub;
    const inventoryIds = dto.parts
      .filter(
        (part) =>
          (part.source ?? RepairPartSource.INVENTORY) ===
          RepairPartSource.INVENTORY,
      )
      .map((part) => part.productId)
      .filter(Boolean) as string[];
    if (new Set(inventoryIds).size !== inventoryIds.length)
      throw new BadRequestException(
        "Consolide los repuestos de inventario repetidos",
      );
    if (
      new Set(dto.payments.map((payment) => payment.idempotencyKey)).size !==
      dto.payments.length
    )
      throw new BadRequestException("Hay claves de pago duplicadas");
    return this.prisma.$transaction(
      async (tx) => {
        const repair = await tx.repairOrder.findUnique({
          where: { id },
          include: { technician: true },
        });
        if (!repair) throw new NotFoundException("Reparación no encontrada");
        if (!user.roles.includes("ADMIN")) {
          const employee = await tx.employee.findUnique({ where: { userId } });
          if (!employee || repair.technicianId !== employee.id)
            throw new NotFoundException("Reparación no encontrada");
        }
        if (
          (
            [
              RepairStatus.REPAIRED,
              RepairStatus.READY,
              RepairStatus.DELIVERED,
            ] as RepairStatus[]
          ).includes(repair.status)
        )
          throw new ConflictException("Esta reparación ya fue completada");
        const products = await tx.product.findMany({
          where: { id: { in: inventoryIds } },
        });
        if (products.length !== new Set(inventoryIds).size)
          throw new NotFoundException("Uno o más repuestos no existen");
        const byId = new Map(products.map((p) => [p.id, p]));
        let partsCost = D(0);
        let partsRevenue = D(0);
        let inventoryCost = D(0);
        let newManualCost = D(0);
        for (const part of dto.parts) {
          const quantity = D(part.quantity);
          if (quantity.lessThanOrEqualTo(0))
            throw new BadRequestException(
              "La cantidad de repuesto debe ser mayor que cero",
            );
          const source = part.source ?? RepairPartSource.INVENTORY;
          if (source === RepairPartSource.INVENTORY) {
            if (!part.productId)
              throw new BadRequestException(
                "Seleccione el repuesto de inventario",
              );
            const product = byId.get(part.productId)!;
            const changed = await tx.product.updateMany({
              where: { id: product.id, stock: { gte: quantity } },
              data: { stock: { decrement: quantity } },
            });
            if (changed.count !== 1)
              throw new ConflictException(
                `Inventario insuficiente para ${product.name}`,
              );
            const unitPrice = D(part.unitPrice ?? product.salePrice);
            await tx.repairPart.create({
              data: {
                repairId: id,
                source,
                productId: product.id,
                description: part.description?.trim() || product.name,
                quantity,
                unitCost: product.averageCost,
                unitPrice,
                supplierId: part.supplierId,
                registeredById: userId,
              },
            });
            await tx.inventoryMovement.create({
              data: {
                productId: product.id,
                type: "REPAIR_CONSUMPTION",
                quantity: quantity.negated(),
                unitCost: product.averageCost,
                referenceType: "REPAIR",
                referenceId: id,
              },
            });
            const cost = quantity.times(product.averageCost);
            partsCost = partsCost.plus(cost);
            inventoryCost = inventoryCost.plus(cost);
            partsRevenue = partsRevenue.plus(quantity.times(unitPrice));
          } else {
            if (!part.description?.trim() || part.unitCost === undefined)
              throw new BadRequestException(
                "El repuesto manual requiere descripción y costo real",
              );
            const unitCost = D(part.unitCost);
            const unitPrice = D(part.unitPrice ?? 0);
            await tx.repairPart.create({
              data: {
                repairId: id,
                source,
                description: part.description.trim(),
                quantity,
                unitCost,
                unitPrice,
                supplierId: part.supplierId,
                costAlreadyRecorded: part.costAlreadyRecorded ?? false,
                registeredById: userId,
              },
            });
            const cost = quantity.times(unitCost);
            partsCost = partsCost.plus(cost);
            partsRevenue = partsRevenue.plus(quantity.times(unitPrice));
            if (!part.costAlreadyRecorded)
              newManualCost = newManualCost.plus(cost);
          }
        }
        const laborPrice = D(dto.laborPrice ?? dto.finalPrice ?? 0);
        const finalPrice =
          dto.laborPrice !== undefined
            ? laborPrice.plus(partsRevenue)
            : D(dto.finalPrice ?? 0);
        if (finalPrice.lessThanOrEqualTo(0))
          throw new BadRequestException(
            "El precio final debe ser mayor que cero",
          );
        const paid = dto.payments.reduce((sum, p) => sum.plus(p.amount), D(0));
        if (paid.greaterThan(finalPrice))
          throw new BadRequestException("El cobro supera el precio final");
        const updated = await tx.repairOrder.update({
          where: { id },
          data: {
            status: "DELIVERED",
            deliveredAt: new Date(),
            workPerformed: dto.workPerformed,
            finalPrice,
            partsCost,
            paid,
            balance: finalPrice.minus(paid),
          },
        });
        await tx.repairEvent.create({
          data: {
            repairId: id,
            status: "DELIVERED",
            note: "Trabajo completado y equipo entregado",
            userId,
          },
        });
        const paymentResult = await this.recordIncomingPayments(
          tx,
          dto.payments,
          userId,
          {
            repairId: id,
            referenceType: "REPAIR",
            movementType: "REPAIR_COLLECTION",
          },
        );
        const lines: LedgerLine[] = [...paymentResult.ledgerLines];
        if (finalPrice.greaterThan(paid))
          lines.push({ accountCode: "1103", debit: finalPrice.minus(paid) });
        lines.push({ accountCode: "4102", credit: finalPrice });
        if (inventoryCost.greaterThan(0))
          lines.push(
            { accountCode: "5102", debit: inventoryCost },
            { accountCode: "1104", credit: inventoryCost },
          );
        if (newManualCost.greaterThan(0))
          lines.push(
            { accountCode: "5102", debit: newManualCost },
            {
              accountCode: "2101",
              credit: newManualCost,
              memo: "Repuesto específico pendiente de conciliación",
            },
          );
        const configuredPercentage =
          repair.technician?.commissionPercentage ?? dto.commissionPercentage;
        if (
          configuredPercentage !== undefined &&
          D(configuredPercentage).greaterThan(0) &&
          repair.technicianId
        ) {
          const percentage = D(configuredPercentage);
          if (percentage.greaterThan(100))
            throw new BadRequestException(
              "La comisión no puede superar el 100%",
            );
          const basis = repair.technician?.commissionPercentage
            ? repair.technician.commissionBasis
            : "CONTRIBUTION_MARGIN";
          const base =
            basis === "LABOR" ? laborPrice : finalPrice.minus(partsCost);
          if (base.lessThan(0))
            throw new BadRequestException(
              "La reparación no tiene margen repartible",
            );
          const amount = base
            .times(percentage)
            .dividedBy(100)
            .toDecimalPlaces(2);
          await tx.commissionAllocation.create({
            data: {
              repairId: id,
              employeeId: repair.technicianId,
              baseAmount: base,
              percentageSnapshot: percentage,
              amount,
              ruleSnapshot: {
                basis,
                source: repair.technician?.commissionPercentage
                  ? "EMPLOYEE_CONFIGURATION"
                  : "OPERATION_INPUT",
                percentage: percentage.toString(),
                finalPrice: finalPrice.toString(),
                partsCost: partsCost.toString(),
              },
              status: CommissionStatus.APPROVED,
            },
          });
          lines.push(
            { accountCode: "6102", debit: amount },
            { accountCode: "2102", credit: amount },
          );
        }
        await this.finance.post(tx, {
          description: `Reparación #${repair.number}`,
          referenceType: "REPAIR",
          referenceId: id,
          lines,
        });
        await this.documents.createRepairCompletionDocuments(tx, id, userId);
        await tx.auditLog.create({
          data: {
            userId,
            action: "repairs.complete",
            entityType: "RepairOrder",
            entityId: id,
            after: {
              finalPrice: finalPrice.toString(),
              partsCost: partsCost.toString(),
            },
          },
        });
        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
  }

  async createExpense(
    dto: CreateExpenseDto,
    userId: string,
    assistantProposalId?: string,
  ) {
    if (D(dto.amount).lessThanOrEqualTo(0))
      throw new BadRequestException("El gasto debe ser mayor que cero");
    return this.prisma.$transaction(async (tx) => {
      if (assistantProposalId) {
        const existing = await tx.expense.findUnique({
          where: { assistantProposalId },
        });
        if (existing) return existing;
      }
      const [category, method] = await Promise.all([
        tx.expenseCategory.findUnique({ where: { id: dto.categoryId } }),
        tx.paymentMethod.findUnique({ where: { id: dto.methodId } }),
      ]);
      if (!category || !method)
        throw new NotFoundException("Categoría o método de pago no encontrado");
      const expense = await tx.expense.create({
        data: { ...dto, userId, assistantProposalId },
      });
      if (method.isCash)
        await this.addCashMovement(tx, {
          type: "EXPENSE",
          amount: dto.amount,
          description: dto.concept,
          referenceType: "EXPENSE",
          referenceId: expense.id,
          userId,
        });
      await this.finance.post(tx, {
        description: dto.concept,
        referenceType: "EXPENSE",
        referenceId: expense.id,
        lines: [
          { accountCode: category.accountCode, debit: dto.amount },
          { accountCode: method.isCash ? "1101" : "1102", credit: dto.amount },
        ],
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "expenses.create",
          entityType: "Expense",
          entityId: expense.id,
          after: dto as unknown as Prisma.InputJsonValue,
        },
      });
      return expense;
    });
  }

  listExpenses() {
    return this.prisma.expense.findMany({
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async dashboard(range: DateRangeDto) {
    const now = new Date();
    const from = range.from
      ? new Date(range.from)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = range.to ? new Date(range.to) : now;
    if (from > to)
      throw new BadRequestException("El rango de fechas no es válido");
    const date = { gte: from, lte: to };
    const [
      periodLines,
      incomingPayments,
      pendingRepairs,
      lowStock,
      openCash,
      bankLines,
      payables,
      commissions,
    ] = await Promise.all([
      this.prisma.journalLine.findMany({
        where: { entry: { postedAt: date, status: "POSTED" } },
        include: { account: true },
      }),
      this.prisma.payment.aggregate({
        where: { createdAt: date, direction: "IN" },
        _sum: { amount: true },
      }),
      this.prisma.repairOrder.count({
        where: { status: { notIn: ["DELIVERED", "CANCELLED"] } },
      }),
      this.prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT COUNT(*)::bigint AS count FROM "Product" WHERE active = true AND stock <= "minimumStock"`,
      this.currentCash(),
      this.prisma.journalLine.findMany({
        where: { account: { code: "1102" }, entry: { status: "POSTED" } },
      }),
      this.prisma.purchase.aggregate({
        where: { status: { not: "VOIDED" } },
        _sum: { balance: true },
      }),
      this.prisma.commissionAllocation.findMany({
        where: { status: { in: ["APPROVED", "PARTIALLY_PAID"] } },
        select: { amount: true, paidAmount: true },
      }),
    ]);
    const revenue = periodLines
      .filter((line) => line.account.type === "REVENUE")
      .reduce((sum, line) => sum.plus(line.credit).minus(line.debit), D(0));
    const cogs = periodLines
      .filter((line) => ["5101", "5102"].includes(line.account.code))
      .reduce((sum, line) => sum.plus(line.debit).minus(line.credit), D(0));
    const operatingExpenses = periodLines
      .filter((line) => line.account.code === "6101")
      .reduce((sum, line) => sum.plus(line.debit).minus(line.credit), D(0));
    const commissionExpenses = periodLines
      .filter((line) => line.account.code === "6102")
      .reduce((sum, line) => sum.plus(line.debit).minus(line.credit), D(0));
    const receivables =
      (await this.prisma.sale.aggregate({ _sum: { balance: true } }))._sum
        .balance ?? D(0);
    const repairReceivables =
      (await this.prisma.repairOrder.aggregate({ _sum: { balance: true } }))
        ._sum.balance ?? D(0);
    const cashExpected = openCash
      ? openCash.movements.reduce(
          (sum, m) =>
            [
              "OPENING",
              "SALE_COLLECTION",
              "REPAIR_COLLECTION",
              "CASH_IN",
              "TRANSFER_IN",
            ].includes(m.type)
              ? sum.plus(m.amount)
              : sum.minus(m.amount),
          D(0),
        )
      : D(0);
    const bankBalance = bankLines.reduce(
      (sum, line) => sum.plus(line.debit).minus(line.credit),
      D(0),
    );
    const pendingCommissions = commissions.reduce(
      (sum, commission) =>
        sum.plus(commission.amount).minus(commission.paidAmount),
      D(0),
    );
    return {
      sales: revenue.toFixed(2),
      collections: (incomingPayments._sum.amount ?? D(0)).toFixed(2),
      expenses: operatingExpenses.toFixed(2),
      grossProfit: revenue.minus(cogs).toFixed(2),
      netProfit: revenue
        .minus(cogs)
        .minus(operatingExpenses)
        .minus(commissionExpenses)
        .toFixed(2),
      cashExpected: cashExpected.toFixed(2),
      bankBalance: bankBalance.toFixed(2),
      receivables: D(receivables).plus(repairReceivables).toFixed(2),
      payables: (payables._sum.balance ?? D(0)).toFixed(2),
      pendingCommissions: pendingCommissions.toFixed(2),
      pendingRepairs,
      lowStock: Number(lowStock[0]?.count ?? 0),
    };
  }

  private async registerLaterPayment(
    sourceType: "SALE" | "REPAIR",
    id: string,
    dto: RegisterPaymentDto,
    user: AuthUser,
    assistantProposalId?: string,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (assistantProposalId) {
            const existing = await tx.payment.findUnique({
              where: { assistantProposalId },
            });
            if (existing) {
              const current = sourceType === "SALE"
                ? await tx.sale.findUniqueOrThrow({ where: { id } })
                : await tx.repairOrder.findUniqueOrThrow({ where: { id } });
              return {
                paymentId: existing.id,
                paid: current.paid.toFixed(2),
                balance: current.balance.toFixed(2),
              };
            }
          }
          const amount = D(dto.amount);
          if (amount.lessThanOrEqualTo(0))
            throw new BadRequestException("El abono debe ser mayor que cero");
          const method = await tx.paymentMethod.findUnique({
            where: { id: dto.methodId },
          });
          if (!method)
            throw new NotFoundException("Método de pago no encontrado");
          const isSale = sourceType === "SALE";
          const source = isSale
            ? await tx.sale.findUnique({
                where: { id },
                include: { customer: true },
              })
            : await tx.repairOrder.findUnique({
                where: { id },
                include: { customer: true },
              });
          if (!source)
            throw new NotFoundException(
              isSale ? "Venta no encontrada" : "Reparación no encontrada",
            );
          if (
            !user.roles.includes("ADMIN") &&
            (isSale
              ? (source as any).userId !== user.sub
              : (source as any).receivedById !== user.sub)
          )
            throw new NotFoundException(
              isSale ? "Venta no encontrada" : "Reparación no encontrada",
            );
          if (amount.greaterThan(source.balance))
            throw new BadRequestException("El abono supera el saldo pendiente");
          const payment = await tx.payment.create({
            data: {
              methodId: dto.methodId,
              amount,
              idempotencyKey: dto.idempotencyKey,
              direction: PaymentDirection.IN,
              saleId: isSale ? id : undefined,
              repairId: isSale ? undefined : id,
              receivedById: user.sub,
              assistantProposalId,
            },
          });
          const paid = source.paid.plus(amount);
          const balance = source.balance.minus(amount);
          if (isSale)
            await tx.sale.update({
              where: { id },
              data: {
                paid,
                balance,
                status: balance.isZero()
                  ? SaleStatus.PAID
                  : SaleStatus.PARTIALLY_PAID,
              },
            });
          else
            await tx.repairOrder.update({
              where: { id },
              data: { paid, balance },
            });
          if (method.isCash)
            await this.addCashMovement(tx, {
              type: isSale ? "SALE_COLLECTION" : "REPAIR_COLLECTION",
              amount,
              description: `Abono a ${isSale ? "venta" : "reparación"} #${source.number}`,
              referenceType: `${sourceType}_PAYMENT`,
              referenceId: payment.id,
              userId: user.sub,
            });
          await this.finance.post(tx, {
            description: `Abono a ${isSale ? "venta" : "reparación"} #${source.number}`,
            referenceType: `${sourceType}_PAYMENT`,
            referenceId: payment.id,
            lines: [
              { accountCode: method.isCash ? "1101" : "1102", debit: amount },
              { accountCode: "1103", credit: amount },
            ],
          });
          await this.documents.createPaymentReceipt(tx, {
            sourceType,
            sourceId: id,
            paymentId: payment.id,
            userId: user.sub,
            paid,
            balance,
          });
          await tx.auditLog.create({
            data: {
              userId: user.sub,
              action: `${sourceType.toLowerCase()}.payment.create`,
              entityType: isSale ? "Sale" : "RepairOrder",
              entityId: id,
              after: {
                paymentId: payment.id,
                amount: amount.toString(),
                balance: balance.toString(),
              },
            },
          });
          return {
            paymentId: payment.id,
            paid: paid.toFixed(2),
            balance: balance.toFixed(2),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("Este abono ya fue procesado");
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        throw new ConflictException(
          "El saldo cambió mientras se registraba el abono; actualice e intente nuevamente",
        );
      throw error;
    }
  }

  private async recordIncomingPayments(
    tx: Prisma.TransactionClient,
    payments: CreateSaleDto["payments"],
    userId: string,
    source: {
      saleId?: string;
      repairId?: string;
      referenceType: string;
      movementType: "SALE_COLLECTION" | "REPAIR_COLLECTION";
    },
  ) {
    const methods = await tx.paymentMethod.findMany({
      where: { id: { in: payments.map((p) => p.methodId) } },
    });
    if (methods.length !== new Set(payments.map((p) => p.methodId)).size)
      throw new NotFoundException("Método de pago no encontrado");
    const byId = new Map(methods.map((method) => [method.id, method]));
    if (payments.some((payment) => D(payment.amount).lessThanOrEqualTo(0)))
      throw new BadRequestException("Los pagos deben ser mayores que cero");
    const cashTotal = payments
      .filter((p) => byId.get(p.methodId)!.isCash)
      .reduce((sum, p) => sum.plus(p.amount), D(0));
    const bankTotal = payments
      .filter((p) => !byId.get(p.methodId)!.isCash)
      .reduce((sum, p) => sum.plus(p.amount), D(0));
    for (const payment of payments)
      await tx.payment.create({
        data: {
          ...payment,
          direction: PaymentDirection.IN,
          saleId: source.saleId,
          repairId: source.repairId,
          receivedById: userId,
        },
      });
    if (cashTotal.greaterThan(0))
      await this.addCashMovement(tx, {
        type: source.movementType,
        amount: cashTotal,
        description: `Cobro de ${source.referenceType.toLowerCase()}`,
        referenceType: source.referenceType,
        referenceId: source.saleId ?? source.repairId,
        userId,
      });
    const ledgerLines: LedgerLine[] = [];
    if (cashTotal.greaterThan(0))
      ledgerLines.push({ accountCode: "1101", debit: cashTotal });
    if (bankTotal.greaterThan(0))
      ledgerLines.push({ accountCode: "1102", debit: bankTotal });
    return { ledgerLines };
  }

  private async addCashMovement(
    tx: Prisma.TransactionClient,
    data: {
      type: CashMovementType;
      amount: Prisma.Decimal.Value;
      description: string;
      referenceType?: string;
      referenceId?: string;
      userId: string;
    },
  ) {
    const session = await tx.cashSession.findFirst({
      where: { status: "OPEN" },
      orderBy: { openedAt: "desc" },
    });
    if (!session)
      throw new ConflictException(
        "Debe abrir una caja para registrar movimientos en efectivo",
      );
    return tx.cashMovement.create({ data: { ...data, sessionId: session.id } });
  }
}
