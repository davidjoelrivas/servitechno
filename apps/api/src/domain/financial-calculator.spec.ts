import { BadRequestException } from "@nestjs/common";
import { assertBalanced, calculateCommission, calculateExpectedCash, calculateNetProfit } from "./financial-calculator";

describe("integridad financiera", () => {
  it("reproduce el escenario integral solicitado", () => {
    const cash = calculateExpectedCash({ opening: "1500", cashIn: "400", cashOut: "150" });
    const commission = calculateCommission({ revenue: "1200", attributableCosts: "300", percentage: "30" });
    const profit = calculateNetProfit({ revenue: "1600", costOfSales: "520", expenses: "150", commissions: commission.amount });
    expect(cash.toFixed(2)).toBe("1750.00");
    expect(commission.base.toFixed(2)).toBe("900.00");
    expect(commission.amount.toFixed(2)).toBe("270.00");
    expect(profit.toFixed(2)).toBe("660.00");
  });

  it("rechaza porcentajes superiores al fondo repartible", () => {
    expect(() => calculateCommission({ revenue: "100", attributableCosts: "10", percentage: "101" })).toThrow(BadRequestException);
  });

  it("acepta asientos balanceados y rechaza los desbalanceados", () => {
    expect(assertBalanced([{ debit: "400", credit: "0" }, { debit: "0", credit: "400" }])).toBe(true);
    expect(() => assertBalanced([{ debit: "400", credit: "0" }, { debit: "0", credit: "399" }])).toThrow(BadRequestException);
  });
});

