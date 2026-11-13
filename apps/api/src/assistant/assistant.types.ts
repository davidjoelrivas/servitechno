import type { AuthUser } from "../auth/current-user.decorator";

export const ASSISTANT_INTENTS = [
  "BUSINESS_SUMMARY",
  "SALES_SUMMARY",
  "CASH_STATUS",
  "LOW_STOCK",
  "PENDING_REPAIRS",
  "MY_PERFORMANCE",
  "TEAM_PERFORMANCE",
  "PREPARE_EXPENSE",
  "PREPARE_PURCHASE",
  "PREPARE_SALE",
  "PREPARE_PAYMENT",
  "AMEND_PROPOSAL",
  "HELP",
  "UNKNOWN",
] as const;

export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];
export type AssistantPeriod =
  | "TODAY"
  | "YESTERDAY"
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "CUSTOM";

export type ResolvedIntent = {
  intent: AssistantIntent;
  period?: AssistantPeriod;
  from?: string;
  to?: string;
  expense?: {
    amount?: string;
    concept?: string;
    categoryQuery?: string;
    paymentMethodQuery?: string;
  };
  purchase?: {
    supplierQuery?: string;
    paymentMethodQuery?: string;
    paidAmount?: string;
    dueAt?: string;
    reference?: string;
    items?: Array<{
      productQuery?: string;
      quantity?: string;
      unitCost?: string;
    }>;
  };
  sale?: {
    customerQuery?: string;
    paymentMethodQuery?: string;
    paidAmount?: string;
    discount?: string;
    items?: Array<{
      productQuery?: string;
      quantity?: string;
      unitPrice?: string;
      serial?: string;
    }>;
  };
  payment?: {
    customerQuery?: string;
    sourceType?: "SALE" | "REPAIR";
    sourceQuery?: string;
    amount?: string;
    paymentMethodQuery?: string;
  };
  amendment?: {
    itemQuery?: string;
    quantity?: string;
    unitCost?: string;
    unitPrice?: string;
    paidAmount?: string;
    paymentMethodQuery?: string;
  };
  question?: string;
};

export type AssistantContext = {
  user: AuthUser;
  timezone: string;
  now: string;
  expenseCategories: Array<{ id: string; name: string }>;
  paymentMethods: Array<{
    id: string;
    code: string;
    name: string;
    isCash: boolean;
  }>;
};

export type ConversationTurn = { role: string; content: string };

export type AssistantCard = {
  label: string;
  value: string;
  detail?: string;
};

export type AssistantResponse = {
  message: {
    id: string;
    role: string;
    content: string;
    metadata: unknown;
    createdAt: Date;
  };
  cards?: AssistantCard[];
  proposal?: unknown;
};

