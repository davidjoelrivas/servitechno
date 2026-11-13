import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Card, CardContent, CardHeader, Empty, Input } from "../components/ui";
import { api } from "../lib/api";
import type { Customer } from "../types";

const schema = z.object({ name: z.string().min(2), phone: z.string().optional(), email: z.union([z.literal(""), z.email()]).optional() });
type Form = z.infer<typeof schema>;
export function CustomersPage() {
  const queryClient = useQueryClient(); const { data = [] } = useQuery({ queryKey: ["customers"], queryFn: () => api<Customer[]>("/customers") });
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  const mutation = useMutation({ mutationFn: (body: Form) => api("/customers", { method: "POST", body: JSON.stringify(body) }), onSuccess: () => { form.reset(); queryClient.invalidateQueries({ queryKey: ["customers"] }); } });
  return <div className="space-y-6"><div><h1 className="page-title">Clientes</h1><p className="mt-1 text-sm text-muted-foreground">Directorio utilizado por ventas a crédito y órdenes de reparación.</p></div><div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]"><Card><CardHeader title="Directorio" /><CardContent>{data.length ? <table className="data-table"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Correo</th></tr></thead><tbody>{data.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.phone || "—"}</td><td>{c.email || "—"}</td></tr>)}</tbody></table> : <Empty>No hay clientes registrados.</Empty>}</CardContent></Card><Card><CardHeader title="Nuevo cliente" /><CardContent><form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}><div className="field"><label>Nombre</label><Input {...form.register("name")} /></div><div className="field"><label>Teléfono</label><Input {...form.register("phone")} /></div><div className="field"><label>Correo</label><Input type="email" {...form.register("email")} /></div>{mutation.error && <p className="error">{mutation.error.message}</p>}<Button className="w-full">Guardar cliente</Button></form></CardContent></Card></div></div>;
}

