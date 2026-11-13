import { Inject, Injectable } from "@nestjs/common";
import type {
  AssistantContext,
  ConversationTurn,
  ResolvedIntent,
} from "./assistant.types";
import { LLM_PROVIDER, type LlmProvider } from "./llm.provider";

@Injectable()
export class IntentResolver {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  status() {
    return this.llm.status();
  }

  async resolve(
    messages: ConversationTurn[],
    context: AssistantContext,
  ): Promise<ResolvedIntent> {
    const resolved = await this.llm.resolve(messages, context);
    const amendment = extractExplicitAmendment(messages);
    if (amendment) return { intent: "AMEND_PROPOSAL", amendment };
    const expense = this.completeExpenseFromConversation(resolved, messages, context);
    return this.validateCommercialEvidence(expense, messages);
  }

  private validateCommercialEvidence(
    resolved: ResolvedIntent,
    messages: ConversationTurn[],
  ): ResolvedIntent {
    if (!["PREPARE_PURCHASE", "PREPARE_SALE", "PREPARE_PAYMENT"].includes(resolved.intent))
      return resolved;
    const users = messages.filter((message) => message.role !== "assistant").slice(-12);
    const initiator =
      resolved.intent === "PREPARE_PURCHASE"
        ? /\b(compre|compra|comprar)\b/
        : resolved.intent === "PREPARE_SALE"
          ? /\b(vendi|venta|vender)\b/
          : /\b(abono|abonar|pago posterior)\b/;
    let start = users.length - 1;
    for (let index = users.length - 1; index >= 0; index -= 1)
      if (initiator.test(normalize(users[index].content))) {
        start = index;
        break;
      }
    const text = users.slice(start).map((message) => message.content).join("\n");
    const paymentMethod = extractPaymentMethod(text);

    if (resolved.purchase) {
      resolved.purchase = {
        ...resolved.purchase,
        supplierQuery: supportedByConversation(resolved.purchase.supplierQuery, text),
        paymentMethodQuery: paymentMethod,
        items: resolved.purchase.items?.map((item) => ({
          ...item,
          productQuery: supportedByConversation(item.productQuery, text),
        })),
      };
    }
    if (resolved.sale) {
      resolved.sale = {
        ...resolved.sale,
        customerQuery: supportedByConversation(resolved.sale.customerQuery, text),
        paymentMethodQuery: paymentMethod,
        items: resolved.sale.items?.map((item) => ({
          ...item,
          productQuery: supportedByConversation(item.productQuery, text),
          serial: supportedByConversation(item.serial, text),
        })),
      };
    }
    if (resolved.payment) {
      resolved.payment = {
        ...resolved.payment,
        customerQuery: supportedByConversation(resolved.payment.customerQuery, text),
        sourceQuery: supportedByConversation(resolved.payment.sourceQuery, text),
        paymentMethodQuery: paymentMethod,
      };
    }
    return resolved;
  }

  private completeExpenseFromConversation(
    resolved: ResolvedIntent,
    messages: ConversationTurn[],
    context: AssistantContext,
  ): ResolvedIntent {
    const userMessages = messages
      .filter((message) => message.role !== "assistant")
      .slice(-8);
    let expenseStart = userMessages.length - 1;
    for (let index = userMessages.length - 1; index >= 0; index -= 1) {
      const text = normalize(userMessages[index].content);
      if (
        /\b(gaste|gasto|registrar(?: un)? gasto|compra de insumos)\b/.test(text) ||
        /\bpague\b[^\n]*\d/.test(text)
      ) {
        expenseStart = index;
        break;
      }
    }
    const userText = userMessages
      .slice(expenseStart)
      .map((message) => message.content)
      .join("\n");
    const normalized = normalize(userText);
    const hasExpenseContext =
      /\b(gaste|gasto|registrar(?: un)? gasto|pague|compra de insumos)\b/.test(
        normalized,
      );
    const latest = normalize(
      [...messages].reverse().find((message) => message.role !== "assistant")
        ?.content ?? "",
    );
    const isExpenseContinuation =
      hasExpenseContext &&
      /\b(efectivo|caja|transferencia|banco|lempiras?|lps?|categoria|concepto)\b/.test(
        latest,
      );

    if (
      resolved.intent !== "PREPARE_EXPENSE" &&
      !(resolved.intent === "UNKNOWN" && isExpenseContinuation)
    )
      return resolved;

    const modelExpense = resolved.expense ?? {};
    const expense = {
      ...modelExpense,
      amount:
        extractExpenseAmount(userText) ??
        supportedByConversation(modelExpense.amount, userText),
      concept:
        extractExpenseConcept(userText) ??
        supportedByConversation(modelExpense.concept, userText),
      // A payment source changes a real balance. Never accept one inferred only
      // by the model: the user must have named it in the conversation.
      paymentMethodQuery: extractPaymentMethod(userText),
    };
    expense.categoryQuery ??= extractExpenseCategory(
      expense.concept,
      context.expenseCategories.map((item) => item.name),
    );

    return {
      ...resolved,
      intent: "PREPARE_EXPENSE",
      expense,
      question: undefined,
    };
  }
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractExpenseAmount(text: string) {
  const normalized = normalize(text);
  const patterns = [
    /\b(?:gaste|gasto(?: de)?|pague|importe(?: de)?|monto(?: de)?)\s*(?:l\.?|lps?\.?)?\s*([\d,.]+)(?:\s*(?:lempiras?|lps?))?/,
    /\b([\d,.]+)\s*(?:lempiras?|lps?)\b/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1] && /^\d[\d,.]*$/.test(match[1])) return match[1];
  }
  return undefined;
}

function extractExpenseConcept(text: string) {
  const normalized = normalize(text);
  const match = normalized.match(
    /\b(?:gaste|pague)\s*(?:l\.?|lps?\.?)?\s*[\d,.]+(?:\s*(?:lempiras?|lps?))?\s+(?:en|por|de)\s+([^\n.!?]+)/,
  );
  if (!match?.[1]) return undefined;
  const concept = match[1]
    .replace(/\s+(?:y\s+)?(?:lo\s+)?pague\s+(?:por\s+)?(?:transferencia|banco|caja|efectivo).*$/, "")
    .trim();
  return concept ? concept.slice(0, 300) : undefined;
}

function extractPaymentMethod(text: string) {
  const normalized = normalize(text);
  const mentions = [...normalized.matchAll(/\b(transferencia|banco|efectivo|caja)\b/g)];
  const latest = mentions.at(-1)?.[1];
  if (latest === "transferencia" || latest === "banco") return "Transferencia";
  if (latest === "efectivo" || latest === "caja") return "Efectivo";
  return undefined;
}

function extractExpenseCategory(concept: string | undefined, categories: string[]) {
  if (!concept) return undefined;
  const normalizedConcept = normalize(concept);
  const direct = categories.find((category) =>
    normalizedConcept.includes(normalize(category)),
  );
  if (direct) return direct;
  if (/\b(gasolina|combustible|transporte|taxi|bus)\b/.test(normalizedConcept))
    return categories.find((category) => normalize(category) === "transporte");
  return undefined;
}

function supportedByConversation(value: string | undefined, text: string) {
  if (!value?.trim()) return undefined;
  const wanted = normalize(value).trim();
  return normalize(text).includes(wanted) ? value.trim() : undefined;
}

function extractExplicitAmendment(messages: ConversationTurn[]) {
  const latest = [...messages]
    .reverse()
    .find((message) => message.role !== "assistant")?.content;
  if (!latest) return undefined;
  const text = normalize(latest).trim();
  if (!/^(no\b|corrige\b|corregir\b|cambia\b|cambiar\b)|\b(en realidad|eran|era)\b/.test(text))
    return undefined;
  const amendment: NonNullable<ResolvedIntent["amendment"]> = {};
  const quantity = text.match(
    /\b(?:eran|era|son|cantidad(?:\s+era)?|cambia(?:r)?(?:\s+la cantidad)?\s+a)\s+(\d+(?:\.\d+)?|un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/,
  );
  if (quantity) {
    amendment.quantity = spanishNumber(quantity[1]);
    const after = text.slice((quantity.index ?? 0) + quantity[0].length);
    const item = after
      .split(/[,.;]|\bno\s+(?:un[ao]?|dos|tres|cuatro|cinco|\d+)\b/)[0]
      .replace(/^(?:de\s+)?/, "")
      .trim();
    if (item) amendment.itemQuery = item;
  }
  const cost = text.match(/\b(?:costo|costaban?|a)\s+(\d+(?:[.,]\d{1,2})?)\b/);
  if (cost && /\b(costo|costaban?)\b/.test(text)) amendment.unitCost = cost[1].replace(",", ".");
  const price = text.match(/\b(?:precio|vendi(?:do)?\s+en)\s+(\d+(?:[.,]\d{1,2})?)\b/);
  if (price) amendment.unitPrice = price[1].replace(",", ".");
  const paid = text.match(/\b(?:pago|pagado|cobro|abonado|importe)\s+(?:era|es|a)?\s*(\d+(?:[.,]\d{1,2})?)\b/);
  if (paid) amendment.paidAmount = paid[1].replace(",", ".");
  amendment.paymentMethodQuery = extractPaymentMethod(latest);
  return Object.values(amendment).some(Boolean) ? amendment : undefined;
}

function spanishNumber(value: string) {
  const values: Record<string, string> = {
    un: "1",
    uno: "1",
    una: "1",
    dos: "2",
    tres: "3",
    cuatro: "4",
    cinco: "5",
    seis: "6",
    siete: "7",
    ocho: "8",
    nueve: "9",
    diez: "10",
  };
  return values[value] ?? value;
}
