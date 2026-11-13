import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type AssistantProposal } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuthUser } from "../auth/current-user.decorator";
import type {
  CreateSaleDto,
  RegisterPaymentDto,
} from "../operations/operations.dto";
import { OperationsService } from "../operations/operations.service";
import type { CreatePurchaseDto } from "../procurement/procurement.dto";
import { ProcurementService } from "../procurement/procurement.service";
import { PrismaService } from "../prisma/prisma.service";
import { AssistantAuditService } from "./assistant-audit.service";
import type { ResolvedIntent } from "./assistant.types";

type Prepared = { question?: string; proposal?: unknown; answer: string };
type PurchasePayload = {
  dto: CreatePurchaseDto;
  supplierName: string;
  paymentMethodName?: string;
  items: Array<{ productId: string; name: string; quantity: string; unitCost: string }>;
};
type SalePayload = {
  dto: CreateSaleDto;
  customerName?: string;
  paymentMethodName?: string;
  items: Array<{
    productId: string;
    name: string;
    quantity: string;
    unitPrice: string;
    serial?: string;
  }>;
};
type PaymentPayload = {
  sourceType: "SALE" | "REPAIR";
  sourceId: string;
  sourceNumber: number;
  customerName: string;
  methodName: string;
  dto: RegisterPaymentDto;
};

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

@Injectable()
export class CommercialConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsService,
    private readonly procurement: ProcurementService,
    private readonly audit: AssistantAuditService,
    private readonly config: ConfigService,
  ) {}

  async preparePurchase(
    conversationId: string,
    intent: ResolvedIntent,
    user: AuthUser,
  ): Promise<Prepared> {
    this.require(user, "purchases.create");
    const draft = intent.purchase ?? {};
    if (!draft.items?.length)
      return question("¿Qué productos compraste, cuántos y a qué costo unitario?");
    if (!draft.supplierQuery)
      return question(`¿A qué proveedor se realizó la compra?${await this.catalogHint("supplier")}`);
    const supplierMatch = await this.matchSupplier(draft.supplierQuery);
    if (!supplierMatch.match) return question(supplierMatch.question);

    const items: PurchasePayload["items"] = [];
    for (const [index, item] of draft.items.entries()) {
      if (!item.productQuery)
        return question(`¿Cuál es el producto del artículo ${index + 1}?`);
      if (!item.quantity)
        return question(`¿Qué cantidad compraste de ${item.productQuery}?`);
      if (!item.unitCost)
        return question(`¿Cuál fue el costo unitario de ${item.productQuery}?`);
      const quantity = positiveNumber(item.quantity, "cantidad");
      const unitCost = money(item.unitCost, "costo unitario", true);
      const productMatch = await this.matchProduct(item.productQuery);
      if (!productMatch.match) return question(productMatch.question);
      items.push({
        productId: productMatch.match.id,
        name: productMatch.match.name,
        quantity,
        unitCost,
      });
    }
    if (new Set(items.map((item) => item.productId)).size !== items.length)
      return question("La solicitud repite un producto. Indica una sola cantidad consolidada por producto.");

    const total = items
      .reduce((sum, item) => sum.plus(D(item.quantity).times(item.unitCost)), D(0))
      .toFixed(2);
    if (!draft.paidAmount)
      return question("¿Cuánto pagaste inicialmente? Puedes indicar el importe, “todo” o “quedó pendiente”.");
    const paid = amountOrTotal(draft.paidAmount, total);
    if (D(paid).greaterThan(total))
      throw new BadRequestException("El pago supera el total de la compra");
    const method = D(paid).greaterThan(0)
      ? await this.requirePaymentMethod(draft.paymentMethodQuery)
      : undefined;
    if (method) await this.ensureOutgoingFunds(method, paid);

    const idempotencyKey = randomUUID();
    const dto: CreatePurchaseDto = {
      supplierId: supplierMatch.match.id,
      items: items.map(({ productId, quantity, unitCost }) => ({
        productId,
        quantity,
        unitCost,
      })),
      payments: method
        ? [{ methodId: method.id, amount: paid, idempotencyKey }]
        : [],
      dueAt: draft.dueAt,
      reference: draft.reference,
      notes: "Preparada mediante Servi Techno AI",
    };
    const payload: PurchasePayload = {
      dto,
      supplierName: supplierMatch.match.name,
      paymentMethodName: method?.name,
      items,
    };
    const summary = {
      title: "Registrar compra",
      supplier: payload.supplierName,
      items: items.map((item) => ({
        product: item.name,
        quantity: item.quantity,
        unitCost: `L ${item.unitCost}`,
      })),
      total: `L ${total}`,
      paid: `L ${paid}`,
      balance: `L ${D(total).minus(paid).toFixed(2)}`,
      paymentMethod: method?.name ?? "Crédito / pendiente",
      impact: "Aumentará inventario y registrará el pago o la cuenta por pagar correspondiente.",
    };
    const proposal = await this.createProposal(
      conversationId,
      user,
      "PURCHASE_CREATE",
      payload,
      summary,
    );
    return {
      proposal,
      answer: `Preparé una compra a ${payload.supplierName} por L ${total}, con pago inicial de L ${paid}. Revisa productos, cantidades y costos antes de confirmar.`,
    };
  }

  async prepareSale(
    conversationId: string,
    intent: ResolvedIntent,
    user: AuthUser,
  ): Promise<Prepared> {
    this.require(user, "sales.create");
    const draft = intent.sale ?? {};
    if (!draft.items?.length)
      return question("¿Qué productos vendiste, cuántos y a qué precio?");
    const items: SalePayload["items"] = [];
    let requiresCustomer = false;
    for (const [index, item] of draft.items.entries()) {
      if (!item.productQuery)
        return question(`¿Cuál es el producto del artículo ${index + 1}?`);
      const productMatch = await this.matchProduct(item.productQuery);
      if (!productMatch.match) return question(productMatch.question);
      const quantity = positiveNumber(item.quantity ?? "1", "cantidad");
      const unitPrice = money(item.unitPrice ?? productMatch.match.salePrice.toString(), "precio unitario");
      if (productMatch.match.stock.lessThan(quantity))
        throw new ConflictException(
          `Solo hay ${productMatch.match.stock.toString()} unidad(es) de ${productMatch.match.name}.`,
        );
      const warrantied = ["PHONE", "COMPUTER"].includes(productMatch.match.documentType);
      if (warrantied) {
        requiresCustomer = true;
        if (D(quantity).greaterThan(1))
          return question(`Registra cada ${productMatch.match.name} por separado con su IMEI o serie.`);
        if (!item.serial?.trim())
          return question(`¿Cuál es el IMEI o número de serie de ${productMatch.match.name}?`);
      }
      items.push({
        productId: productMatch.match.id,
        name: productMatch.match.name,
        quantity,
        unitPrice,
        serial: item.serial?.trim(),
      });
    }
    if (new Set(items.map((item) => item.productId)).size !== items.length)
      return question("La solicitud repite un producto. Indica una sola cantidad consolidada por producto.");
    const subtotal = items.reduce(
      (sum, item) => sum.plus(D(item.quantity).times(item.unitPrice)),
      D(0),
    );
    const discount = money(draft.discount ?? "0", "descuento", true);
    const total = subtotal.minus(discount);
    if (total.lessThanOrEqualTo(0))
      throw new BadRequestException("El total de la venta debe ser mayor que cero");
    if (!draft.paidAmount)
      return question("¿Cuánto pagó el cliente inicialmente? Puedes indicar el importe, “todo” o “quedó pendiente”.");
    const paid = amountOrTotal(draft.paidAmount, total.toFixed(2));
    if (D(paid).greaterThan(total))
      throw new BadRequestException("El cobro supera el total de la venta");
    if (D(paid).lessThan(total)) requiresCustomer = true;
    let customer: { id: string; name: string } | undefined;
    if (draft.customerQuery) {
      const match = await this.matchCustomer(draft.customerQuery);
      if (!match.match) return question(match.question);
      customer = match.match;
    } else if (requiresCustomer) {
      return question(`Esta venta requiere cliente. ¿A quién se realizó?${await this.catalogHint("customer")}`);
    }
    const method = D(paid).greaterThan(0)
      ? await this.requirePaymentMethod(draft.paymentMethodQuery)
      : undefined;
    if (method?.isCash && !(await this.operations.currentCash()))
      throw new ConflictException("Debe abrir una caja antes de recibir efectivo");

    const dto: CreateSaleDto = {
      customerId: customer?.id,
      items: items.map(({ productId, quantity, unitPrice, serial }) => ({
        productId,
        quantity,
        unitPrice,
        serial,
      })),
      payments: method
        ? [{ methodId: method.id, amount: paid, idempotencyKey: randomUUID() }]
        : [],
      discount,
    };
    const payload: SalePayload = {
      dto,
      customerName: customer?.name,
      paymentMethodName: method?.name,
      items,
    };
    const summary = {
      title: "Registrar venta",
      customer: customer?.name ?? "Consumidor final",
      items: items.map((item) => ({
        product: item.name,
        quantity: item.quantity,
        unitPrice: `L ${item.unitPrice}`,
        serial: item.serial,
      })),
      total: `L ${total.toFixed(2)}`,
      paid: `L ${paid}`,
      balance: `L ${total.minus(paid).toFixed(2)}`,
      paymentMethod: method?.name ?? "Crédito / pendiente",
      impact: "Reducirá inventario, registrará ingreso/cobro y generará los documentos normales de la venta.",
    };
    const proposal = await this.createProposal(
      conversationId,
      user,
      "SALE_CREATE",
      payload,
      summary,
    );
    return {
      proposal,
      answer: `Preparé una venta por L ${total.toFixed(2)}, con cobro inicial de L ${paid} y saldo de L ${total.minus(paid).toFixed(2)}. Revisa la propuesta antes de confirmar.`,
    };
  }

  async preparePayment(
    conversationId: string,
    intent: ResolvedIntent,
    user: AuthUser,
  ): Promise<Prepared> {
    const draft = intent.payment ?? {};
    if (!draft.customerQuery) return question("¿Qué cliente realizó el abono?");
    if (!draft.amount) return question("¿Cuál fue el importe del abono?");
    if (!draft.paymentMethodQuery) return question("¿Cómo se recibió el abono?");
    const amount = money(draft.amount, "importe");
    const customerMatch = await this.matchCustomer(draft.customerQuery);
    if (!customerMatch.match) return question(customerMatch.question);
    const method = await this.requirePaymentMethod(draft.paymentMethodQuery);
    if (method.isCash && !(await this.operations.currentCash()))
      throw new ConflictException("Debe abrir una caja antes de recibir efectivo");
    const sources = await this.outstandingSources(customerMatch.match.id, draft.sourceType, user);
    const filtered = draft.sourceQuery
      ? sources.filter((source) => normalize(source.search).includes(normalize(draft.sourceQuery!)))
      : sources;
    if (!filtered.length)
      return question(`No encontré una venta o reparación pendiente para ${customerMatch.match.name} con esa referencia.`);
    if (filtered.length > 1)
      return question(
        `Hay varias cuentas pendientes para ${customerMatch.match.name}: ${filtered
          .slice(0, 8)
          .map((source) => `${source.label}, saldo L ${source.balance}`)
          .join("; ")}. Indica el número exacto.`,
      );
    const source = filtered[0];
    this.require(user, source.type === "SALE" ? "sales.create" : "repairs.create");
    if (D(amount).greaterThan(source.balance))
      throw new BadRequestException(`El abono supera el saldo pendiente de L ${source.balance}`);
    const payload: PaymentPayload = {
      sourceType: source.type,
      sourceId: source.id,
      sourceNumber: source.number,
      customerName: customerMatch.match.name,
      methodName: method.name,
      dto: { methodId: method.id, amount, idempotencyKey: randomUUID() },
    };
    const summary = {
      title: "Registrar abono",
      customer: payload.customerName,
      source: source.label,
      amount: `L ${amount}`,
      previousBalance: `L ${source.balance}`,
      resultingBalance: `L ${D(source.balance).minus(amount).toFixed(2)}`,
      paymentMethod: method.name,
      impact: "Aumentará caja o bancos, reducirá la cuenta por cobrar y generará un comprobante.",
    };
    const proposal = await this.createProposal(
      conversationId,
      user,
      "RECEIVABLE_PAYMENT",
      payload,
      summary,
    );
    return {
      proposal,
      answer: `Preparé un abono de L ${amount} para ${source.label}. El saldo quedaría en L ${D(source.balance).minus(amount).toFixed(2)}.`,
    };
  }

  async amend(
    conversationId: string,
    intent: ResolvedIntent,
    user: AuthUser,
  ): Promise<Prepared> {
    const proposal = await this.prisma.assistantProposal.findFirst({
      where: { conversationId, userId: user.sub, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (!proposal) throw new NotFoundException("No hay una propuesta pendiente para corregir");
    const change = intent.amendment ?? {};
    let next: ResolvedIntent;
    if (proposal.type === "PURCHASE_CREATE") {
      const payload = proposal.payload as unknown as PurchasePayload;
      const items = payload.items.map((item) => ({
        productQuery: item.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
      }));
      const wasPaidInFull = paymentsTotal(payload.dto.payments).equals(
        payload.items.reduce(
          (sum, item) => sum.plus(D(item.quantity).times(item.unitCost)),
          D(0),
        ),
      );
      applyItemChange(items, change, "unitCost");
      next = {
        intent: "PREPARE_PURCHASE",
        purchase: {
          supplierQuery: payload.supplierName,
          paymentMethodQuery: change.paymentMethodQuery ?? payload.paymentMethodName,
          paidAmount:
            change.paidAmount ??
            (wasPaidInFull ? "TOTAL" : paymentAmount(payload.dto.payments)),
          dueAt: payload.dto.dueAt,
          reference: payload.dto.reference,
          items,
        },
      };
      return this.preparePurchase(conversationId, next, user);
    }
    if (proposal.type === "SALE_CREATE") {
      const payload = proposal.payload as unknown as SalePayload;
      const items = payload.items.map((item) => ({
        productQuery: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        serial: item.serial,
      }));
      const oldTotal = payload.items
        .reduce(
          (sum, item) => sum.plus(D(item.quantity).times(item.unitPrice)),
          D(0),
        )
        .minus(payload.dto.discount ?? 0);
      const wasPaidInFull = paymentsTotal(payload.dto.payments).equals(oldTotal);
      applyItemChange(items, change, "unitPrice");
      next = {
        intent: "PREPARE_SALE",
        sale: {
          customerQuery: payload.customerName,
          paymentMethodQuery: change.paymentMethodQuery ?? payload.paymentMethodName,
          paidAmount:
            change.paidAmount ??
            (wasPaidInFull ? "TOTAL" : paymentAmount(payload.dto.payments)),
          discount: payload.dto.discount,
          items,
        },
      };
      return this.prepareSale(conversationId, next, user);
    }
    if (proposal.type === "RECEIVABLE_PAYMENT") {
      const payload = proposal.payload as unknown as PaymentPayload;
      next = {
        intent: "PREPARE_PAYMENT",
        payment: {
          customerQuery: payload.customerName,
          sourceType: payload.sourceType,
          sourceQuery: `#${payload.sourceNumber}`,
          amount: change.paidAmount ?? payload.dto.amount,
          paymentMethodQuery: change.paymentMethodQuery ?? payload.methodName,
        },
      };
      return this.preparePayment(conversationId, next, user);
    }
    throw new BadRequestException("Esta propuesta todavía no admite correcciones conversacionales");
  }

  async execute(proposal: AssistantProposal, user: AuthUser) {
    if (proposal.type === "PURCHASE_CREATE") {
      this.require(user, "purchases.create");
      const payload = proposal.payload as unknown as PurchasePayload;
      if (payload.dto.payments[0]) {
        const method = await this.prisma.paymentMethod.findUniqueOrThrow({
          where: { id: payload.dto.payments[0].methodId },
        });
        await this.ensureOutgoingFunds(method, payload.dto.payments[0].amount);
      }
      const purchase = await this.procurement.createPurchase(
        payload.dto,
        user.sub,
        proposal.id,
      );
      return {
        entityType: "Purchase",
        entityId: purchase.id,
        number: purchase.number,
        total: purchase.total.toFixed(2),
        balance: purchase.balance.toFixed(2),
      };
    }
    if (proposal.type === "SALE_CREATE") {
      this.require(user, "sales.create");
      const payload = proposal.payload as unknown as SalePayload;
      const sale = await this.operations.createSale(payload.dto, user.sub, proposal.id);
      const documents = await this.prisma.businessDocument.findMany({
        where: { sourceType: "SALE", sourceId: sale.id },
        select: { id: true, type: true, number: true },
      });
      return {
        entityType: "Sale",
        entityId: sale.id,
        number: sale.number,
        total: sale.total.toFixed(2),
        balance: sale.balance.toFixed(2),
        documents,
      };
    }
    if (proposal.type === "RECEIVABLE_PAYMENT") {
      const payload = proposal.payload as unknown as PaymentPayload;
      this.require(user, payload.sourceType === "SALE" ? "sales.create" : "repairs.create");
      const result = payload.sourceType === "SALE"
        ? await this.operations.paySale(payload.sourceId, payload.dto, user, proposal.id)
        : await this.operations.payRepair(payload.sourceId, payload.dto, user, proposal.id);
      const document = await this.prisma.businessDocument.findFirst({
        where: {
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
          type: "PAYMENT_RECEIPT",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, number: true },
      });
      return {
        entityType: "Payment",
        entityId: result.paymentId,
        sourceType: payload.sourceType,
        sourceNumber: payload.sourceNumber,
        paid: result.paid,
        balance: result.balance,
        document,
      };
    }
    throw new BadRequestException("Tipo de propuesta comercial no soportado");
  }

  private async createProposal(
    conversationId: string,
    user: AuthUser,
    type: string,
    payload: unknown,
    summary: unknown,
  ) {
    await this.prisma.assistantProposal.updateMany({
      where: { conversationId, userId: user.sub, status: "PENDING" },
      data: { status: "CANCELLED", failureReason: "Reemplazada por una propuesta posterior" },
    });
    const ttl = Number(this.config.get("ASSISTANT_PROPOSAL_TTL_MINUTES") ?? 15);
    const proposal = await this.prisma.assistantProposal.create({
      data: {
        conversationId,
        userId: user.sub,
        type,
        payload: json(payload),
        summary: json(summary),
        idempotencyKey: randomUUID(),
        sessionVersion: user.sessionVersion,
        permissions: [...user.permissions].sort(),
        expiresAt: new Date(Date.now() + ttl * 60_000),
      },
    });
    await this.audit.record({
      userId: user.sub,
      action: "assistant.proposal.prepare",
      entityType: "AssistantProposal",
      entityId: proposal.id,
      after: { type },
    });
    return proposal;
  }

  private async matchProduct(query: string) {
    const products = await this.prisma.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: 500,
    });
    return matchNamed(products, query, "producto", (item) => [item.name, item.sku]);
  }

  private async matchSupplier(query: string) {
    const suppliers = await this.prisma.supplier.findMany({ orderBy: { name: "asc" }, take: 200 });
    return matchNamed(suppliers, query, "proveedor", (item) => [item.name]);
  }

  private async matchCustomer(query: string) {
    const customers = await this.prisma.customer.findMany({ orderBy: { name: "asc" }, take: 500 });
    return matchNamed(customers, query, "cliente", (item) => [item.name, item.phone ?? ""]);
  }

  private async requirePaymentMethod(query?: string) {
    if (!query) throw new BadRequestException("Debe indicar el método de pago");
    const methods = await this.prisma.paymentMethod.findMany({ orderBy: { name: "asc" } });
    const normalized = normalize(query);
    const match = methods.find((method) =>
      method.isCash
        ? /efectivo|caja|cash/.test(normalized)
        : normalize(method.name) === normalized || /transferencia|banco|bank/.test(normalized),
    );
    if (!match)
      throw new BadRequestException(
        `Método de pago no válido. Opciones: ${methods.map((item) => item.name).join(", ")}.`,
      );
    return match;
  }

  private async ensureOutgoingFunds(
    method: { isCash: boolean; name: string },
    amount: string,
  ) {
    if (D(amount).isZero()) return;
    const dashboard = await this.operations.dashboard({});
    const available = method.isCash ? dashboard.cashExpected : dashboard.bankBalance;
    if (D(available).lessThan(amount))
      throw new ConflictException(
        `${method.isCash ? "La caja" : "El banco"} solo tiene L ${available} disponibles.`,
      );
  }

  private async outstandingSources(
    customerId: string,
    sourceType: "SALE" | "REPAIR" | undefined,
    user: AuthUser,
  ) {
    const [sales, repairs] = await Promise.all([
      sourceType === "REPAIR"
        ? []
        : this.prisma.sale.findMany({
            where: {
              customerId,
              balance: { gt: 0 },
              ...(user.roles.includes("ADMIN") ? {} : { userId: user.sub }),
            },
            include: { items: { include: { product: true } } },
          }),
      sourceType === "SALE"
        ? []
        : this.prisma.repairOrder.findMany({
            where: {
              customerId,
              balance: { gt: 0 },
              ...(user.roles.includes("ADMIN") ? {} : { receivedById: user.sub }),
            },
          }),
    ]);
    return [
      ...sales.map((sale) => ({
        type: "SALE" as const,
        id: sale.id,
        number: sale.number,
        balance: sale.balance.toFixed(2),
        label: `venta #${sale.number}`,
        search: `#${sale.number} venta ${sale.items.map((item) => item.product.name).join(" ")}`,
      })),
      ...repairs.map((repair) => ({
        type: "REPAIR" as const,
        id: repair.id,
        number: repair.number,
        balance: repair.balance.toFixed(2),
        label: `reparación #${repair.number} ${repair.brand ?? ""} ${repair.model ?? repair.deviceType}`.trim(),
        search: `#${repair.number} reparacion ${repair.brand ?? ""} ${repair.model ?? ""} ${repair.deviceType}`,
      })),
    ];
  }

  private async catalogHint(kind: "supplier" | "customer") {
    const items = kind === "supplier"
      ? await this.prisma.supplier.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 8 })
      : await this.prisma.customer.findMany({ select: { name: true }, orderBy: { name: "asc" }, take: 8 });
    return items.length ? ` Opciones actuales: ${items.map((item) => item.name).join(", ")}.` : " No hay registros disponibles; créalo primero desde su módulo.";
  }

  private require(user: AuthUser, permission: string) {
    if (!user.permissions.includes(permission))
      throw new ForbiddenException("No tienes permiso para realizar esta operación");
  }
}

function question(value: string): Prepared {
  return { question: value, answer: value };
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function money(value: string, label: string, allowZero = false) {
  const match = value.replace(/,/g, "").match(/^\s*(\d{1,12}(?:\.\d{1,2})?)\s*$/);
  if (!match || (allowZero ? D(match[1]).lessThan(0) : D(match[1]).lessThanOrEqualTo(0)))
    throw new BadRequestException(`El ${label} no es válido`);
  return D(match[1]).toFixed(2);
}

function positiveNumber(value: string, label: string) {
  const match = value.replace(/,/g, "").match(/^\s*(\d{1,10}(?:\.\d{1,3})?)\s*$/);
  if (!match || D(match[1]).lessThanOrEqualTo(0))
    throw new BadRequestException(`La ${label} no es válida`);
  return D(match[1]).toString();
}

function amountOrTotal(value: string, total: string) {
  return normalize(value) === "total" || normalize(value) === "todo"
    ? D(total).toFixed(2)
    : money(value, "pago inicial", true);
}

function matchNamed<T extends { id: string; name: string }>(
  items: T[],
  query: string,
  label: string,
  values: (item: T) => string[],
): { match?: T; question: string } {
  const wanted = normalize(query);
  const exact = items.filter((item) => values(item).some((value) => normalize(value) === wanted));
  if (exact.length === 1) return { match: exact[0], question: "" };
  const matches = items.filter((item) =>
    values(item).some((value) => normalize(value).includes(wanted) || wanted.includes(normalize(value))),
  );
  if (matches.length === 1) return { match: matches[0], question: "" };
  if (!matches.length)
    return {
      question: `No encontré el ${label} “${query}”. Créalo primero en el módulo correspondiente o indica otro nombre.`,
    };
  return {
    question: `“${query}” coincide con varios ${label}s: ${matches.slice(0, 8).map((item) => item.name).join(", ")}. Indica el nombre o SKU exacto.`,
  };
}

function applyItemChange<T extends { productQuery?: string; quantity?: string }>(
  items: T[],
  change: NonNullable<ResolvedIntent["amendment"]>,
  priceKey: "unitCost" | "unitPrice",
) {
  let candidates = items;
  if (change.itemQuery) {
    const wanted = normalize(change.itemQuery);
    const singular = wanted.replace(/s\b/g, "");
    candidates = items.filter((item) =>
      normalize(item.productQuery ?? "").includes(wanted) ||
      normalize(item.productQuery ?? "").includes(singular),
    );
  }
  if (candidates.length !== 1)
    throw new BadRequestException(
      candidates.length ? "Indica qué producto deseas corregir" : "No encontré ese producto en la propuesta",
    );
  if (change.quantity) candidates[0].quantity = change.quantity;
  const price = priceKey === "unitCost" ? change.unitCost : change.unitPrice;
  if (price) (candidates[0] as Record<string, unknown>)[priceKey] = price;
  if (!change.quantity && !price && !change.paidAmount && !change.paymentMethodQuery)
    throw new BadRequestException("No identifiqué qué dato deseas corregir");
}

function paymentAmount(payments: Array<{ amount: string }>) {
  return payments[0]?.amount ?? "0";
}

function paymentsTotal(payments: Array<{ amount: string }>) {
  return payments.reduce((sum, payment) => sum.plus(payment.amount), D(0));
}

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
