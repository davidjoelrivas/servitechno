import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  CircleDollarSign,
  PackageSearch,
  Plus,
  Send,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { api, downloadPdf } from "../lib/api";
import { Button } from "./ui";

type Status = {
  provider: string;
  configured: boolean;
  available: boolean;
  model?: string;
  message: string;
};
type Proposal = {
  id: string;
  status: string;
  type: string;
  summary: {
    title?: string;
    amount?: string;
    total?: string;
    paid?: string;
    balance?: string;
    concept?: string;
    category?: string;
    paymentMethod?: string;
    supplier?: string;
    customer?: string;
    source?: string;
    previousBalance?: string;
    resultingBalance?: string;
    items?: Array<{
      product?: string;
      quantity?: string;
      unitCost?: string;
      unitPrice?: string;
      serial?: string;
    }>;
    impact?: string;
  };
  expiresAt: string;
};
type Message = {
  id: string;
  role: string;
  content: string;
  metadata?: {
    cards?: Array<{ label: string; value: string; detail?: string }>;
    result?: {
      documents?: Array<{ id: string; type: string; number: number }>;
      document?: { id: string; type: string; number: number };
    };
  };
  createdAt: string;
};
type Conversation = {
  id: string;
  title?: string;
  messages: Message[];
  proposals: Proposal[];
};

const quickActions = [
  { label: "Consultar caja", prompt: "¿Cuánto tengo en caja?", icon: WalletCards },
  { label: "Consultar ventas", prompt: "¿Cuánto vendimos hoy?", icon: CircleDollarSign },
  { label: "Inventario bajo", prompt: "¿Qué productos tienen inventario bajo?", icon: PackageSearch },
  { label: "Reparaciones pendientes", prompt: "¿Cuáles reparaciones están pendientes?", icon: Wrench },
  { label: "Registrar gasto", prompt: "Quiero registrar un gasto.", icon: Plus },
  { label: "Registrar compra", prompt: "Quiero registrar una compra.", icon: PackageSearch },
  { label: "Registrar venta", prompt: "Quiero registrar una venta.", icon: CircleDollarSign },
  { label: "Registrar abono", prompt: "Quiero registrar un abono.", icon: WalletCards },
];

export function AssistantPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const status = useQuery({
    queryKey: ["assistant-status"],
    queryFn: () => api<Status>("/assistant/status"),
    enabled: open,
    retry: false,
  });
  const conversations = useQuery({
    queryKey: ["assistant-conversations"],
    queryFn: () => api<Conversation[]>("/assistant/conversations"),
    enabled: open,
  });
  const current = useQuery({
    queryKey: ["assistant-conversation", conversationId],
    queryFn: () => api<Conversation>(`/assistant/conversations/${conversationId}`),
    enabled: open && Boolean(conversationId),
  });
  const create = useMutation({
    mutationFn: () =>
      api<Conversation>("/assistant/conversations", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (conversation) => {
      setConversationId(conversation.id);
      qc.invalidateQueries({ queryKey: ["assistant-conversations"] });
    },
  });
  useEffect(() => {
    if (!open || conversationId || create.isPending || !conversations.data) return;
    const first = conversations.data[0];
    first ? setConversationId(first.id) : create.mutate();
  }, [open, conversationId, conversations.data, create.isPending]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [current.data?.messages.length, open]);

  const send = useMutation({
    mutationFn: (content: string) =>
      api(`/assistant/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setText("");
      refresh();
    },
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "confirm" | "cancel" }) =>
      api(`/assistant/proposals/${id}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: refresh,
  });
  function refresh() {
    qc.invalidateQueries({ queryKey: ["assistant-conversation", conversationId] });
    qc.invalidateQueries({ queryKey: ["assistant-conversations"] });
  }
  function submit(content = text) {
    const value = content.trim();
    if (!value || !conversationId || send.isPending || !status.data?.available) return;
    send.mutate(value);
  }
  const error = send.error ?? act.error ?? current.error;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-cyan-700"
      >
        <Bot size={20} /> <span className="hidden sm:inline">Asistente Servi Techno AI</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
          <button aria-label="Cerrar asistente" className="flex-1" onClick={() => setOpen(false)} />
          <section className="flex h-full w-full max-w-2xl flex-col bg-slate-50 shadow-2xl">
            <header className="flex items-center gap-3 border-b bg-[#102a43] px-4 py-4 text-white">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500"><Bot /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Servi Techno AI</h2>
                <p className="truncate text-xs text-slate-300">
                  {status.data?.available ? `${status.data.provider} · ${status.data.model}` : "Comprobando modelo local…"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                aria-label="Nueva conversación"
                onClick={() => create.mutate()}
              ><Plus /></Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
              ><X /></Button>
            </header>

            {status.data && !status.data.available && (
              <div className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <strong>Modelo local no disponible.</strong> {status.data.message} El resto del ERP continúa funcionando y no se enviaron datos a servicios externos.
              </div>
            )}

            <div className="border-b bg-white p-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {quickActions.map(({ label, prompt, icon: Icon }) => (
                  <button
                    key={label}
                    disabled={!status.data?.available}
                    onClick={() => submit(prompt)}
                    className="flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs hover:border-cyan-500 disabled:opacity-50"
                  ><Icon size={14} /> {label}</button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {!current.data?.messages.length && (
                <div className="mx-auto mt-12 max-w-md text-center">
                  <Bot className="mx-auto text-cyan-600" size={42} />
                  <h3 className="mt-3 font-semibold">¿En qué puedo ayudarte?</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Consulto datos reales según tus permisos. Las operaciones siempre requieren una confirmación visual.
                  </p>
                </div>
              )}
              {current.data?.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {current.data?.proposals
                .filter((proposal) => proposal.status === "PENDING")
                .map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    busy={act.isPending}
                    onAction={(action) => act.mutate({ id: proposal.id, action })}
                    onModify={() => setText("Quiero corregir esta propuesta: ")}
                  />
                ))}
              {send.isPending && <p className="text-sm text-muted-foreground">Analizando y consultando el ERP…</p>}
              {error && <p className="error">{error.message}</p>}
              <div ref={bottom} />
            </div>

            <form
              className="border-t bg-white p-4"
              onSubmit={(event) => { event.preventDefault(); submit(); }}
            >
              <div className="flex gap-2">
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  maxLength={4000}
                  rows={2}
                  disabled={!status.data?.available}
                  placeholder="Escribe: ¿Cuánto vendimos hoy?"
                  className="min-h-12 flex-1 resize-none rounded-lg border px-3 py-2 text-sm"
                />
                <Button disabled={!text.trim() || send.isPending || !status.data?.available} size="icon" aria-label="Enviar">
                  <Send size={18} />
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Servi Techno AI puede equivocarse al interpretar. Revisa siempre las propuestas antes de confirmar.
              </p>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const mine = message.role === "USER";
  return (
    <div className={mine ? "ml-auto max-w-[85%]" : "mr-auto max-w-[92%]"}>
      <div className={mine ? "rounded-2xl rounded-br-sm bg-cyan-600 px-4 py-3 text-sm text-white" : "rounded-2xl rounded-bl-sm border bg-white px-4 py-3 text-sm shadow-sm"}>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
      {message.metadata?.cards && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {message.metadata.cards.map((card) => (
            <div key={`${card.label}-${card.value}`} className="rounded-lg border bg-white p-3">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <strong className="text-sm">{card.value}</strong>
              {card.detail && <p className="text-xs text-muted-foreground">{card.detail}</p>}
            </div>
          ))}
        </div>
      )}
      {message.metadata?.result && (
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            ...(message.metadata.result.documents ?? []),
            ...(message.metadata.result.document ? [message.metadata.result.document] : []),
          ].map((document) => (
            <Button
              key={document.id}
              size="sm"
              variant="outline"
              onClick={() =>
                downloadPdf(
                  `/documents/${document.id}/pdf`,
                  `servi-techno-${document.number}.pdf`,
                )
              }
            >
              Descargar {document.type === "PAYMENT_RECEIPT" ? "comprobante" : "documento"}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  busy,
  onAction,
  onModify,
}: {
  proposal: Proposal;
  busy: boolean;
  onAction: (action: "confirm" | "cancel") => void;
  onModify: () => void;
}) {
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="text-xs font-semibold uppercase text-amber-800">Confirmación requerida</p>
      <h3 className="mt-1 font-semibold">{proposal.summary.title}</h3>
      {proposal.summary.items?.length ? (
        <div className="mt-3 space-y-2">
          {proposal.summary.items.map((item, index) => (
            <div key={`${item.product}-${index}`} className="rounded-md border border-amber-200 bg-white/70 p-2 text-sm">
              <strong>{item.product}</strong>
              <p>{item.quantity} × {item.unitCost ?? item.unitPrice}{item.serial ? ` · Serie ${item.serial}` : ""}</p>
            </div>
          ))}
        </div>
      ) : null}
      <dl className="mt-3 grid grid-cols-[120px_1fr] gap-1 text-sm">
        {summaryRows(proposal).map(([label, value]) => (
          <span className="contents" key={label}>
            <dt className="text-muted-foreground">{label}</dt><dd>{value}</dd>
          </span>
        ))}
      </dl>
      <p className="mt-3 text-xs text-amber-900">{proposal.summary.impact}</p>
      <div className="mt-4 flex gap-2">
        <Button disabled={busy} onClick={() => onAction("confirm")}><Check size={16} /> Confirmar</Button>
        <Button disabled={busy} variant="outline" onClick={onModify}>Modificar</Button>
        <Button disabled={busy} variant="outline" onClick={() => onAction("cancel")}><X size={16} /> Cancelar</Button>
      </div>
    </div>
  );
}

function summaryRows(proposal: Proposal): Array<[string, string]> {
  const summary = proposal.summary;
  return [
    ["Proveedor", summary.supplier],
    ["Cliente", summary.customer],
    ["Documento", summary.source],
    ["Importe", summary.amount],
    ["Total", summary.total],
    ["Pagado", summary.paid],
    ["Saldo", summary.balance],
    ["Saldo anterior", summary.previousBalance],
    ["Saldo resultante", summary.resultingBalance],
    ["Concepto", summary.concept],
    ["Categoría", summary.category],
    ["Pago", summary.paymentMethod],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

