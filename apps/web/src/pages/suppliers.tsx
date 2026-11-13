import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Card, CardContent, CardHeader, Empty, Input } from "../components/ui";
import { api } from "../lib/api";
import { money } from "../lib/utils";
import type { Supplier } from "../types";

const schema = z.object({ name: z.string().min(2), contact: z.string().optional(), phone: z.string().optional(), email: z.union([z.literal(""), z.email()]).optional() });
type Form = z.infer<typeof schema>;

export function SuppliersPage() {
  const qc = useQueryClient(); const [editing, setEditing] = useState<string | null>(null);
  const { data = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  const mutation = useMutation({ mutationFn: (values: Form) => api(editing ? `/suppliers/${editing}` : "/suppliers", { method: editing ? "PATCH" : "POST", body: JSON.stringify(values) }), onSuccess: () => { setEditing(null); form.reset(); qc.invalidateQueries({ queryKey: ["suppliers"] }); } });
  const edit = (supplier: Supplier) => { setEditing(supplier.id); form.reset({ name: supplier.name, contact: supplier.contact ?? "", phone: supplier.phone ?? "", email: supplier.email ?? "" }); };
  return <div className="space-y-6"><div><h1 className="page-title">Proveedores</h1><p className="mt-1 text-sm text-muted-foreground">Directorio, productos suministrados y obligaciones acumuladas.</p></div><div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]"><Card><CardHeader title="Directorio de proveedores" /><CardContent>{data.length ? <div className="overflow-auto"><table className="data-table"><thead><tr><th>Proveedor</th><th>Contacto</th><th>Compras</th><th>Saldo pendiente</th><th></th></tr></thead><tbody>{data.map((supplier) => <tr key={supplier.id}><td><p className="font-medium">{supplier.name}</p><p className="text-xs text-muted-foreground">{supplier.email || "Sin correo"}</p></td><td>{supplier.contact || supplier.phone || "—"}</td><td>{supplier._count?.purchases ?? 0}</td><td>{money(supplier.purchases?.reduce((sum, purchase) => sum + Number(purchase.balance), 0) ?? 0)}</td><td><Button variant="ghost" size="icon" onClick={() => edit(supplier)} aria-label={`Editar ${supplier.name}`}><Pencil size={16} /></Button></td></tr>)}</tbody></table></div> : <Empty>No hay proveedores registrados.</Empty>}</CardContent></Card><Card><CardHeader title={editing ? "Editar proveedor" : "Nuevo proveedor"} action={editing ? <Button variant="ghost" size="sm" onClick={() => { setEditing(null); form.reset(); }}>Cancelar</Button> : undefined} /><CardContent><form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}><div className="field"><label>Nombre</label><Input {...form.register("name")} /></div><div className="field"><label>Contacto</label><Input {...form.register("contact")} /></div><div className="field"><label>Teléfono</label><Input {...form.register("phone")} /></div><div className="field"><label>Correo</label><Input type="email" {...form.register("email")} /></div>{mutation.error && <p className="error">{mutation.error.message}</p>}<Button className="w-full" disabled={mutation.isPending}>{editing ? "Guardar cambios" : "Crear proveedor"}</Button></form></CardContent></Card></div></div>;
}
