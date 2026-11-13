export type Money = string;

export type ApiError = {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp?: string;
};

export type DashboardSummary = {
  sales: Money;
  collections: Money;
  expenses: Money;
  grossProfit: Money;
  netProfit: Money;
  cashExpected: Money;
  bankBalance: Money;
  receivables: Money;
  payables: Money;
  pendingCommissions: Money;
  pendingRepairs: number;
  lowStock: number;
};

export const REPAIR_STATUSES = [
  "RECEIVED",
  "PENDING_DIAGNOSIS",
  "DIAGNOSING",
  "WAITING_APPROVAL",
  "APPROVED",
  "REPAIRING",
  "WAITING_PART",
  "REPAIRED",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type RepairStatus = (typeof REPAIR_STATUSES)[number];

