import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { DateRangeDto } from "../operations/operations.dto";

const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2).toFixed(2);

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async team(range: DateRangeDto) {
    const dates = this.dates(range);
    const employees = await this.prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
    return {
      from: dates.gte,
      to: dates.lte,
      members: await Promise.all(
        employees.map((employee) => this.member(employee, dates)),
      ),
    };
  }

  async mine(userId: string, range: DateRangeDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    if (!employee)
      throw new NotFoundException(
        "El usuario no está vinculado a un integrante",
      );
    const dates = this.dates(range);
    return {
      from: dates.gte,
      to: dates.lte,
      member: await this.member(employee, dates),
    };
  }

  async one(employeeId: string, range: DateRangeDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException("Integrante no encontrado");
    const dates = this.dates(range);
    return {
      from: dates.gte,
      to: dates.lte,
      member: await this.member(employee, dates),
    };
  }

  private async member(
    employee: {
      id: string;
      userId: string | null;
      name: string;
      position: string;
    },
    dates: { gte: Date; lte: Date },
  ) {
    const [sales, collections, repairs, commissions] = await Promise.all([
      employee.userId
        ? this.prisma.sale.findMany({
            where: {
              userId: employee.userId,
              createdAt: dates,
              status: { notIn: ["VOIDED", "REFUNDED"] },
            },
            select: {
              total: true,
              returnedTotal: true,
              createdAt: true,
              items: {
                select: {
                  quantity: true,
                  returnedQuantity: true,
                  unitCost: true,
                },
              },
            },
          })
        : [],
      employee.userId
        ? this.prisma.payment.aggregate({
            where: {
              receivedById: employee.userId,
              direction: "IN",
              createdAt: dates,
            },
            _sum: { amount: true },
          })
        : { _sum: { amount: null } },
      this.prisma.repairOrder.findMany({
        where: {
          technicianId: employee.id,
          createdAt: dates,
          status: { not: "CANCELLED" },
        },
        select: {
          status: true,
          finalPrice: true,
          partsCost: true,
          createdAt: true,
        },
      }),
      this.prisma.commissionAllocation.findMany({
        where: {
          employeeId: employee.id,
          createdAt: dates,
          status: { not: "VOIDED" },
        },
        select: { amount: true, paidAmount: true },
      }),
    ]);
    const sold = sales.reduce(
      (sum, sale) => sum.plus(sale.total).minus(sale.returnedTotal),
      D(),
    );
    const salesCosts = sales.reduce(
      (sum, sale) =>
        sum.plus(
          sale.items.reduce(
            (cost, item) =>
              cost.plus(
                item.quantity.minus(item.returnedQuantity).times(item.unitCost),
              ),
            D(),
          ),
        ),
      D(),
    );
    const completed = repairs.filter((repair) =>
      ["REPAIRED", "READY", "DELIVERED"].includes(repair.status),
    );
    const repairRevenue = completed.reduce(
      (sum, repair) => sum.plus(repair.finalPrice ?? 0),
      D(),
    );
    const repairCosts = completed.reduce(
      (sum, repair) => sum.plus(repair.partsCost),
      D(),
    );
    const directCosts = salesCosts.plus(repairCosts);
    const generated = commissions.reduce(
      (sum, item) => sum.plus(item.amount),
      D(),
    );
    const paid = commissions.reduce(
      (sum, item) => sum.plus(item.paidAmount),
      D(),
    );
    const daily = new Map<
      string,
      { sales: Prisma.Decimal; repairs: number; margin: Prisma.Decimal }
    >();
    for (const sale of sales) {
      const key = sale.createdAt.toISOString().slice(0, 10);
      const row = daily.get(key) ?? { sales: D(), repairs: 0, margin: D() };
      const net = sale.total.minus(sale.returnedTotal);
      const cost = sale.items.reduce(
        (sum, item) =>
          sum.plus(
            item.quantity.minus(item.returnedQuantity).times(item.unitCost),
          ),
        D(),
      );
      row.sales = row.sales.plus(net);
      row.margin = row.margin.plus(net.minus(cost));
      daily.set(key, row);
    }
    for (const repair of completed) {
      const key = repair.createdAt.toISOString().slice(0, 10);
      const row = daily.get(key) ?? { sales: D(), repairs: 0, margin: D() };
      row.repairs += 1;
      row.margin = row.margin.plus(
        D(repair.finalPrice ?? 0).minus(repair.partsCost),
      );
      daily.set(key, row);
    }
    const dailyRows = [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({
        date,
        sales: money(row.sales),
        repairs: row.repairs,
        margin: money(row.margin),
      }));
    return {
      id: employee.id,
      name: employee.name,
      position: employee.position,
      salesCount: sales.length,
      soldAmount: money(sold),
      collectedAmount: money(D(collections._sum.amount ?? 0)),
      assignedRepairs: repairs.length,
      completedRepairs: completed.length,
      pendingRepairs: repairs.length - completed.length,
      attributableRevenue: money(sold.plus(repairRevenue)),
      directCosts: money(directCosts),
      margin: money(sold.plus(repairRevenue).minus(directCosts)),
      commissionsGenerated: money(generated),
      commissionsPaid: money(paid),
      commissionsPending: money(generated.minus(paid)),
      averageTicket: money(sales.length ? sold.dividedBy(sales.length) : D()),
      daily: dailyRows,
      weekly: this.group(dailyRows, (date) => {
        const value = new Date(`${date}T12:00:00Z`);
        const day = value.getUTCDay() || 7;
        value.setUTCDate(value.getUTCDate() - day + 1);
        return value.toISOString().slice(0, 10);
      }),
      monthly: this.group(dailyRows, (date) => date.slice(0, 7)),
    };
  }

  private group(
    rows: Array<{
      date: string;
      sales: string;
      repairs: number;
      margin: string;
    }>,
    key: (date: string) => string,
  ) {
    const grouped = new Map<
      string,
      { sales: Prisma.Decimal; repairs: number; margin: Prisma.Decimal }
    >();
    for (const row of rows) {
      const label = key(row.date);
      const current = grouped.get(label) ?? {
        sales: D(),
        repairs: 0,
        margin: D(),
      };
      current.sales = current.sales.plus(row.sales);
      current.repairs += row.repairs;
      current.margin = current.margin.plus(row.margin);
      grouped.set(label, current);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, row]) => ({
        period,
        sales: money(row.sales),
        repairs: row.repairs,
        margin: money(row.margin),
      }));
  }

  private dates(range: DateRangeDto) {
    const now = new Date();
    const gte = range.from
      ? new Date(range.from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const lte = range.to ? new Date(range.to) : now;
    if (gte > lte)
      throw new NotFoundException("El rango de fechas no es válido");
    return { gte, lte };
  }
}
