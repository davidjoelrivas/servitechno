import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../auth";
import { Card, CardContent, CardHeader, Input, Select } from "../components/ui";
import { api } from "../lib/api";
import { money } from "../lib/utils";
import type { PerformanceMember } from "../types";

export function PerformancePage() {
  const { can } = useAuth();
  const team = can("reports.team.read");
  const now = new Date();
  const [from, setFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [selectedId, setSelectedId] = useState("");
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const params = new URLSearchParams({
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59`).toISOString(),
  });
  const { data } = useQuery({
    queryKey: ["performance", team, from, to],
    queryFn: () =>
      api<{ members?: PerformanceMember[]; member?: PerformanceMember }>(
        `/performance${team ? "" : "/me"}?${params}`,
      ),
  });
  const all = data?.members ?? (data?.member ? [data.member] : []);
  useEffect(() => {
    if (team && !selectedId && all[0]) setSelectedId(all[0].id);
  }, [team, selectedId, all]);
  const members =
    team && selectedId ? all.filter((member) => member.id === selectedId) : all;
  const selected = members[0];
  const chart = selected
    ? period === "daily"
      ? selected.daily.map((row) => ({
          period: row.date,
          ventas: Number(row.sales),
          margen: Number(row.margin),
          reparaciones: row.repairs,
        }))
      : selected[period].map((row) => ({
          period: row.period,
          ventas: Number(row.sales),
          margen: Number(row.margin),
          reparaciones: row.repairs,
        }))
    : [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">
            {team ? "Rendimiento del equipo" : "Mis resultados"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ventas, reparaciones, cobros, costos, margen y comisiones sin
            duplicar atribuciones.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {team && (
            <Select
              className="min-w-56"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {all.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          )}
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <Select
            value={period}
            onChange={(event) => setPeriod(event.target.value as typeof period)}
          >
            <option value="daily">Diario</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => (
          <Card key={member.id}>
            <CardHeader title={member.name} description={member.position} />
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Monto vendido" value={money(member.soldAmount)} />
              <Metric label="Cobrado" value={money(member.collectedAmount)} />
              <Metric
                label="Reparaciones"
                value={String(member.completedRepairs)}
              />
              <Metric
                label="Pendientes"
                value={String(member.pendingRepairs)}
              />
              <Metric
                label="Ingresos atribuibles"
                value={money(member.attributableRevenue)}
              />
              <Metric
                label="Costos directos"
                value={money(member.directCosts)}
              />
              <Metric label="Margen" value={money(member.margin)} />
              <Metric
                label="Ticket promedio"
                value={money(member.averageTicket)}
              />
              <Metric
                label="Comisión generada"
                value={money(member.commissionsGenerated)}
              />
              <Metric
                label="Comisión pagada"
                value={money(member.commissionsPaid)}
              />
              <Metric
                label="Comisión pendiente"
                value={money(member.commissionsPending)}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader
          title={`Evolución ${period === "daily" ? "diaria" : period === "weekly" ? "semanal" : "mensual"}`}
          description={selected ? selected.name : "Sin integrante vinculado"}
        />
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip
                formatter={(value, name) =>
                  name === "reparaciones" ? String(value) : money(Number(value))
                }
              />
              <Legend />
              <Bar dataKey="ventas" fill="#0891b2" radius={[5, 5, 0, 0]} />
              <Bar dataKey="margen" fill="#f59e0b" radius={[5, 5, 0, 0]} />
              <Bar
                dataKey="reparaciones"
                fill="#7c3aed"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong>{value}</strong>
    </div>
  );
}
