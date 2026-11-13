import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { DashboardSummary } from "@servitechno/shared";
import { AlertTriangle, Banknote, Boxes, CircleDollarSign, HandCoins, Receipt, Wrench } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, Input } from "../components/ui";
import { api } from "../lib/api";
import { money } from "../lib/utils";

const cards = [
  ["Ingresos contables", "sales", "Ventas y reparaciones netas de devoluciones", CircleDollarSign, "text-cyan-600 bg-cyan-50"],
  ["Cobros recibidos", "collections", "Dinero efectivamente cobrado en el período", Banknote, "text-emerald-600 bg-emerald-50"],
  ["Gastos operativos", "expenses", "Gastos; no incluye compras de inventario", Receipt, "text-rose-600 bg-rose-50"],
  ["Utilidad bruta", "grossProfit", "Ingresos menos costo de productos y repuestos", HandCoins, "text-violet-600 bg-violet-50"],
  ["Resultado neto", "netProfit", "Utilidad después de gastos y comisiones", HandCoins, "text-indigo-600 bg-indigo-50"],
  ["Efectivo esperado", "cashExpected", "Saldo físico calculado de la caja abierta", Banknote, "text-amber-600 bg-amber-50"],
  ["Saldo bancario", "bankBalance", "Saldo contable registrado en bancos", Banknote, "text-sky-600 bg-sky-50"],
  ["Cuentas por cobrar", "receivables", "Saldos pendientes de clientes", AlertTriangle, "text-orange-600 bg-orange-50"],
  ["Cuentas por pagar", "payables", "Compras pendientes de pago", AlertTriangle, "text-red-600 bg-red-50"],
  ["Comisiones pendientes", "pendingCommissions", "Comisiones reconocidas todavía no pagadas", HandCoins, "text-fuchsia-600 bg-fuchsia-50"],
] as const;

export function DashboardPage() {
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const query = new URLSearchParams(); if (from) query.set("from", `${from}T00:00:00-06:00`); if (to) query.set("to", `${to}T23:59:59-06:00`);
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard", from, to], queryFn: () => api<DashboardSummary>(`/dashboard${query.size ? `?${query}` : ""}`) });
  const chart = data ? [{ name: "Ingresos", valor: Number(data.sales) }, { name: "Cobros", valor: Number(data.collections) }, { name: "Gastos", valor: Number(data.expenses) }, { name: "Utilidad bruta", valor: Number(data.grossProfit) }] : [];
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="page-title">Resumen del negocio</h1><p className="mt-1 text-sm text-muted-foreground">Cifras calculadas desde pagos y asientos contables confirmados.</p></div><div className="flex gap-2"><div className="field"><label>Desde</label><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div className="field"><label>Hasta</label><Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></div></div></div>
    {error && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error.message}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, key, description, Icon, tone]) => <Card key={key}><CardContent className="flex items-center gap-4"><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={22} /></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{isLoading ? "…" : money(data?.[key])}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div></CardContent></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]"><Card><CardHeader title="Movimiento financiero" description="Comparación del período actual" /><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip formatter={(value) => money(Number(value))} /><Bar dataKey="valor" fill="#0891b2" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card><Card><CardHeader title="Operación pendiente" description="Alertas que requieren atención" /><CardContent className="space-y-4"><div className="flex items-center justify-between rounded-lg bg-amber-50 p-4"><span className="flex items-center gap-2 text-sm"><Wrench size={18} /> Reparaciones activas</span><strong>{data?.pendingRepairs ?? 0}</strong></div><div className="flex items-center justify-between rounded-lg bg-rose-50 p-4"><span className="flex items-center gap-2 text-sm"><Boxes size={18} /> Inventario bajo</span><strong>{data?.lowStock ?? 0}</strong></div></CardContent></Card></div>
  </div>;
}

