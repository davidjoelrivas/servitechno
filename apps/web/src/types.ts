export type IdName = { id: string; name: string };
export type Product = {
  id: string;
  sku: string;
  name: string;
  salePrice: string;
  averageCost: string;
  stock: string;
  minimumStock: string;
  documentType: "OTHER" | "PHONE" | "ACCESSORY" | "COMPUTER";
  condition: "NEW" | "USED";
  warrantyDays?: number;
};
export type Customer = IdName & { phone?: string; email?: string };
export type PaymentMethod = IdName & { code: string; isCash: boolean };
export type Employee = IdName & { position: string };
export type ManagedEmployee = Employee & {
  active: boolean;
  baseSalary?: string;
  commissionPercentage?: string;
  commissionBasis: string;
  commissionNote?: string;
};
export type ManagedUser = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  active: boolean;
  roles: Array<{ id: string; name: string }>;
  permissionCodes: string[];
  employee?: ManagedEmployee;
  createdAt: string;
  updatedAt: string;
  _count: { auditLogs: number; repairEvidence: number };
};
export type UsersMeta = {
  roles: Array<{
    id: string;
    name: string;
    description?: string;
    permissions: Array<{
      permission: { id: string; code: string; description?: string };
    }>;
  }>;
  permissions: Array<{ id: string; code: string; description?: string }>;
};
export type UserActivity = {
  summary: {
    sales: number;
    receivedRepairs: number;
    assignedRepairs: number;
    payments: number;
    commissions: number;
  };
  logs: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId?: string;
    createdAt: string;
    before?: unknown;
    after?: unknown;
  }>;
};
export type CashRegister = IdName;
export type CashMovement = {
  id: string;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
};
export type CashSession = {
  id: string;
  openingBalance: string;
  openedAt: string;
  register: CashRegister;
  movements: CashMovement[];
};
export type Sale = {
  id: string;
  number: number;
  total: string;
  paid: string;
  balance: string;
  returnedTotal: string;
  status: string;
  createdAt: string;
  customer?: Customer;
  items: Array<{
    id: string;
    quantity: string;
    returnedQuantity: string;
    unitPrice: string;
    unitCost: string;
    total: string;
    product: Product;
  }>;
};
export type Repair = {
  id: string;
  number: number;
  deviceType: string;
  brand?: string;
  model?: string;
  serial?: string;
  reportedProblem: string;
  status: string;
  finalPrice?: string;
  partsCost: string;
  paid: string;
  balance: string;
  createdAt: string;
  customer: Customer;
  technician?: Employee;
  parts?: Array<{
    id: string;
    source: string;
    description: string;
    quantity: string;
    unitCost: string;
    unitPrice: string;
  }>;
};
export type RepairEvidence = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  createdBy: { name: string };
};
export type Expense = {
  id: string;
  concept: string;
  amount: string;
  createdAt: string;
  category: IdName;
};
export type Supplier = IdName & {
  contact?: string;
  phone?: string;
  email?: string;
  _count?: { purchases: number; products: number };
  purchases?: Array<{ balance: string }>;
};
export type Purchase = {
  id: string;
  number: number;
  total: string;
  paid: string;
  balance: string;
  status: string;
  dueAt?: string;
  createdAt: string;
  supplier: Supplier;
  items: Array<{
    id: string;
    quantity: string;
    unitCost: string;
    total: string;
    product: Product;
  }>;
  payments: Array<{ id: string; amount: string; method: PaymentMethod }>;
};
export type SaleReturn = {
  id: string;
  number: number;
  type: string;
  reason: string;
  total: string;
  refundAmount: string;
  arReduction: string;
  creditAmount: string;
  createdAt: string;
  sale: Sale & { customer?: Customer };
  items: Array<{
    id: string;
    quantity: string;
    restocked: boolean;
    product: Product;
  }>;
};
export type CommissionAllocation = {
  id: string;
  baseAmount: string;
  percentageSnapshot: string;
  amount: string;
  paidAmount: string;
  status: string;
  createdAt: string;
  employee: Employee;
  repair: Repair;
  payments: Array<{
    id: string;
    amount: string;
    createdAt: string;
    method: PaymentMethod;
  }>;
};
export type BusinessDocument = {
  id: string;
  number: number;
  type: string;
  sourceType: string;
  sourceId: string;
  warrantyStart?: string;
  warrantyEnd?: string;
  createdAt: string;
  snapshot: Record<string, unknown>;
};
export type PerformanceMember = {
  id: string;
  name: string;
  position: string;
  salesCount: number;
  soldAmount: string;
  collectedAmount: string;
  assignedRepairs: number;
  completedRepairs: number;
  pendingRepairs: number;
  attributableRevenue: string;
  directCosts: string;
  margin: string;
  commissionsGenerated: string;
  commissionsPaid: string;
  commissionsPending: string;
  averageTicket: string;
  daily: Array<{
    date: string;
    sales: string;
    repairs: number;
    margin: string;
  }>;
  weekly: Array<{
    period: string;
    sales: string;
    repairs: number;
    margin: string;
  }>;
  monthly: Array<{
    period: string;
    sales: string;
    repairs: number;
    margin: string;
  }>;
};
