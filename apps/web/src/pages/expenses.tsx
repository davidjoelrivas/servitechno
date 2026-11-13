import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Card, CardContent, CardHeader, Empty, Input, Select } from "../components/ui";
import { api } from "../lib/api";
import { dateTime, money } from "../lib/utils";
import type { Expense, IdName, PaymentMethod } from "../types";

const schema = z.object({ concept: z.string().min(3), amount: z.string().regex(/^\d+(\.\d{1,2})?$/), categoryId: z.string().min(1), methodId: z.string().min(1) });
type Form = z.infer<typeof schema>;
export function ExpensesPage() {
  const qc = useQueryClient(); const form = useForm<Form>({ resolver: zodResolver(schema) });
  const { data = [] } = useQuery({ queryKey: ["expenses"], queryFn: () => api<Expense[]>("/expenses") });
  const { data: categories = [] } = useQuery({ queryKey: ["expense-categories"], queryFn: () => api<IdName[]>("/expense-categories") });
  const { data: methods = [] } = useQuery({ queryKey: ["payment-methods"], queryFn: () => api<PaymentMethod[]>("/payment-methods") });
  const mutation = useMutation({ mutationFn: (body: Form) => api("/expenses", { method: "POST", body: JSON.stringify(body) }), onSuccess: () => { form.reset(); qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["cash"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); } });
  return <div className="space-y-6"><div><h1 className="page-title">Gastos</h1><p className="mt-1 text-sm text-muted-foreground">Egresos operativos; las compras de inventario no se registran aquí.</p></div><div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]"><Card><CardHeader title="Historial de gastos" /><CardContent>{data.length ? <table className="data-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Monto</th></tr></thead><tbody>{data.map((e) => <tr key={e.id}><td>{dateTime(e.createdAt)}</td><td>{e.concept}</td><td>{e.category.name}</td><td>{money(e.amount)}</td></tr>)}</tbody></table> : <Empty>No hay gastos en el historial.</Empty>}</CardContent></Card><Card><CardHeader title="Registrar gasto" /><CardContent><form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}><div className="field"><label>Concepto</label><Input {...form.register("concept")} /></div><div className="field"><label>Categoría</label><Select {...form.register("categoryId")}><option value="">Seleccione…</option>{categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</Select></div><div className="field"><label>Monto</label><Input {...form.register("amount")} /></div><div className="field"><label>Método de pago</label><Select {...form.register("methodId")}><option value="">Seleccione…</option>{methods.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</Select></div>{mutation.error && <p className="error">{mutation.error.message}</p>}<Button className="w-full">Registrar egreso</Button></form></CardContent></Card></div></div>;
}
