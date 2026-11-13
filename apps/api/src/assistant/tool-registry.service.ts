import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthUser } from "../auth/current-user.decorator";
import { OperationsService } from "../operations/operations.service";
import { PerformanceService } from "../performance/performance.service";
import type { AssistantCard, AssistantPeriod, ResolvedIntent } from "./assistant.types";

type ToolResult = { answer: string; cards?: AssistantCard[]; data?: unknown };

@Injectable()
export class ToolRegistry {
  constructor(
    private readonly operations: OperationsService,
    private readonly performance: PerformanceService,
    private readonly config: ConfigService,
  ) {}

  async execute(intent: ResolvedIntent, user: AuthUser): Promise<ToolResult> {
    const range = this.range(intent.period ?? "TODAY", intent.from, intent.to);
    switch (intent.intent) {
      case "BUSINESS_SUMMARY":
        this.require(user, "reports.financial.read");
        return this.businessSummary(range);
      case "SALES_SUMMARY":
        return user.permissions.includes("reports.financial.read")
          ? this.businessSummary(range, true)
          : this.personalSales(user, range);
      case "CASH_STATUS":
        this.require(user, "cash.read");
        return this.cashStatus();
      case "LOW_STOCK":
        this.require(user, "inventory.read");
        return this.lowStock();
      case "PENDING_REPAIRS":
        this.require(user, "repairs.read");
        return this.pendingRepairs(user);
      case "TEAM_PERFORMANCE":
        this.require(user, "reports.team.read");
        return this.teamPerformance(range);
      case "MY_PERFORMANCE":
        this.require(user, "performance.self.read");
        return this.myPerformance(user, range);
      default:
        throw new ForbiddenException("La herramienta solicitada no está autorizada");
    }
  }

  private async businessSummary(
    range: { from: string; to: string },
    salesOnly = false,
  ): Promise<ToolResult> {
    const data = await this.operations.dashboard(range);
    if (salesOnly)
      return {
        answer: `En el período consultado se registraron ingresos por ventas y reparaciones de L ${data.sales}. Se cobraron L ${data.collections} y permanecen L ${data.receivables} por cobrar.`,
        cards: [
          { label: "Ingresos", value: `L ${data.sales}` },
          { label: "Cobrado", value: `L ${data.collections}` },
          { label: "Por cobrar", value: `L ${data.receivables}` },
        ],
        data,
      };
    return {
      answer: `En el período consultado se registraron ingresos de L ${data.sales}, cobros de L ${data.collections} y gastos operativos de L ${data.expenses}. La utilidad neta contable registrada es L ${data.netProfit}. Este resultado no equivale necesariamente a dinero disponible para retirar.`,
      cards: [
        { label: "Ingresos", value: `L ${data.sales}` },
        { label: "Cobros", value: `L ${data.collections}` },
        { label: "Gastos", value: `L ${data.expenses}` },
        { label: "Utilidad neta", value: `L ${data.netProfit}` },
        { label: "Caja esperada", value: `L ${data.cashExpected}` },
        { label: "Bancos", value: `L ${data.bankBalance}` },
        { label: "Por cobrar", value: `L ${data.receivables}` },
        { label: "Por pagar", value: `L ${data.payables}` },
      ],
      data,
    };
  }

  private async cashStatus(): Promise<ToolResult> {
    const cash = await this.operations.currentCash();
    if (!cash)
      return { answer: "No hay una caja abierta actualmente.", cards: [{ label: "Caja", value: "Cerrada" }] };
    const incoming = new Set(["OPENING", "SALE_COLLECTION", "REPAIR_COLLECTION", "CASH_IN", "TRANSFER_IN"]);
    const expected = cash.movements.reduce(
      (sum, item) => sum + (incoming.has(item.type) ? Number(item.amount) : -Number(item.amount)),
      0,
    );
    return {
      answer: `La ${cash.register.name} está abierta y tiene un efectivo esperado de L ${expected.toFixed(2)}. El fondo inicial fue L ${Number(cash.openingBalance).toFixed(2)}.`,
      cards: [
        { label: "Estado", value: "Abierta" },
        { label: "Efectivo esperado", value: `L ${expected.toFixed(2)}` },
      ],
      data: { id: cash.id, expected: expected.toFixed(2) },
    };
  }

  private async lowStock(): Promise<ToolResult> {
    const products = (await this.operations.listProducts()).filter(
      (product) => Number(product.stock) <= Number(product.minimumStock),
    );
    return {
      answer: products.length
        ? `${products.length} producto(s) están en o por debajo del inventario mínimo: ${products.slice(0, 8).map((item) => `${item.name} (${item.stock})`).join(", ")}.`
        : "No hay productos por debajo del inventario mínimo.",
      cards: [{ label: "Inventario bajo", value: String(products.length) }],
      data: products.slice(0, 20),
    };
  }

  private async pendingRepairs(user: AuthUser): Promise<ToolResult> {
    const repairs = (await this.operations.listRepairs(user)).filter(
      (repair) => !["DELIVERED", "CANCELLED"].includes(repair.status),
    );
    return {
      answer: repairs.length
        ? `Hay ${repairs.length} reparación(es) pendiente(s) dentro de tu alcance. Las primeras son: ${repairs.slice(0, 6).map((item) => `#${item.number} ${item.deviceType} (${item.status})`).join(", ")}.`
        : "No hay reparaciones pendientes dentro de tu alcance.",
      cards: [{ label: "Reparaciones pendientes", value: String(repairs.length) }],
      data: repairs.slice(0, 20),
    };
  }

  private async personalSales(user: AuthUser, range: { from: string; to: string }) {
    this.require(user, "performance.self.read");
    const { member } = await this.performance.mine(user.sub, range);
    return {
      answer: `En el período consultado registraste ${member.salesCount} venta(s) por L ${member.soldAmount} y cobros por L ${member.collectedAmount}. Tu margen atribuible registrado es L ${member.margin}.`,
      cards: [
        { label: "Ventas", value: member.soldAmount },
        { label: "Cobros", value: member.collectedAmount },
        { label: "Margen", value: member.margin },
      ],
      data: member,
    };
  }

  private async myPerformance(user: AuthUser, range: { from: string; to: string }) {
    const { member } = await this.performance.mine(user.sub, range);
    return {
      answer: `Tus resultados del período son L ${member.attributableRevenue} en ingresos atribuibles, margen de L ${member.margin} y L ${member.commissionsPending} en comisiones pendientes.`,
      cards: [
        { label: "Ingresos atribuibles", value: `L ${member.attributableRevenue}` },
        { label: "Margen", value: `L ${member.margin}` },
        { label: "Comisión pendiente", value: `L ${member.commissionsPending}` },
      ],
      data: member,
    };
  }

  private async teamPerformance(range: { from: string; to: string }) {
    const data = await this.performance.team(range);
    const ordered = [...data.members].sort(
      (a, b) => Number(b.attributableRevenue) - Number(a.attributableRevenue),
    );
    return {
      answer: ordered.length
        ? `Resultados del equipo: ${ordered.map((item) => `${item.name}: L ${item.attributableRevenue} en ingresos atribuibles`).join("; ")}.`
        : "No hay integrantes activos con resultados en el período.",
      cards: ordered.slice(0, 6).map((item) => ({
        label: item.name,
        value: `L ${item.attributableRevenue}`,
        detail: `Margen L ${item.margin}`,
      })),
      data,
    };
  }

  private require(user: AuthUser, permission: string) {
    if (!user.permissions.includes(permission))
      throw new ForbiddenException("No tienes permiso para consultar esa información");
  }

  private range(period: AssistantPeriod, from?: string, to?: string) {
    if (period === "CUSTOM" && from && to)
      return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
    const timeZone = this.config.get("BUSINESS_TIMEZONE") ?? "America/Tegucigalpa";
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
    const local = new Date(Date.UTC(value("year"), value("month") - 1, value("day"), 6));
    let start = new Date(local);
    let end = now;
    if (period === "YESTERDAY") {
      start.setUTCDate(start.getUTCDate() - 1);
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      end.setUTCMilliseconds(-1);
    } else if (period === "THIS_WEEK") {
      const day = start.getUTCDay() || 7;
      start.setUTCDate(start.getUTCDate() - day + 1);
    } else if (period === "THIS_MONTH") {
      start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 6));
    }
    return { from: start.toISOString(), to: end.toISOString() };
  }
}

