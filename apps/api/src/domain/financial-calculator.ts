import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

export function calculateExpectedCash(input: { opening: Prisma.Decimal.Value; cashIn: Prisma.Decimal.Value; cashOut: Prisma.Decimal.Value }) {
  return D(input.opening).plus(input.cashIn).minus(input.cashOut).toDecimalPlaces(2);
}

export function calculateCommission(input: { revenue: Prisma.Decimal.Value; attributableCosts: Prisma.Decimal.Value; percentage: Prisma.Decimal.Value }) {
  const percentage = D(input.percentage);
  if (percentage.lessThan(0) || percentage.greaterThan(100)) throw new BadRequestException("Porcentaje fuera de rango");
  const base = D(input.revenue).minus(input.attributableCosts);
  if (base.lessThan(0)) throw new BadRequestException("No existe base repartible");
  return { base, amount: base.times(percentage).dividedBy(100).toDecimalPlaces(2) };
}

export function calculateNetProfit(input: { revenue: Prisma.Decimal.Value; costOfSales: Prisma.Decimal.Value; expenses: Prisma.Decimal.Value; commissions: Prisma.Decimal.Value }) {
  return D(input.revenue).minus(input.costOfSales).minus(input.expenses).minus(input.commissions).toDecimalPlaces(2);
}

export function assertBalanced(lines: Array<{ debit: Prisma.Decimal.Value; credit: Prisma.Decimal.Value }>) {
  const debit = lines.reduce((sum, line) => sum.plus(line.debit), D(0));
  const credit = lines.reduce((sum, line) => sum.plus(line.credit), D(0));
  if (!debit.equals(credit)) throw new BadRequestException("El asiento contable no está balanceado");
  return true;
}

