import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  Plus,
  Save,
  Search,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useAuth } from "../auth";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Empty,
  Input,
  Select,
} from "../components/ui";
import { api } from "../lib/api";
import { dateTime, money } from "../lib/utils";
import type {
  ManagedUser,
  PerformanceMember,
  UserActivity,
  UsersMeta,
} from "../types";

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  active: boolean;
  roleNames: string[];
  position: string;
  baseSalary: string;
  commissionPercentage: string;
  commissionBasis: string;
  commissionNote: string;
  permissionCodes: string[];
};
const emptyForm: UserForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  active: true,
  roleNames: ["SELLER"],
  position: "Vendedor",
  baseSalary: "",
  commissionPercentage: "",
  commissionBasis: "CONTRIBUTION_MARGIN",
  commissionNote: "",
  permissionCodes: [],
};
const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  TECHNICIAN: "Técnico",
  SELLER: "Vendedor",
};

export function UsersPage() {
  const qc = useQueryClient();
  const { user: currentUser, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [password, setPassword] = useState("");
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (roleFilter) params.set("role", roleFilter);
  if (activeFilter) params.set("active", activeFilter);
  const { data: meta } = useQuery({
    queryKey: ["users-meta"],
    queryFn: () => api<UsersMeta>("/admin/users/meta"),
  });
  useEffect(() => {
    if (meta && !selectedId)
      setForm((current) =>
        current.name || current.email || current.permissionCodes.length
          ? current
          : defaults(meta),
      );
  }, [meta, selectedId]);
  const { data: users = [] } = useQuery({
    queryKey: ["users", search, roleFilter, activeFilter],
    queryFn: () => api<ManagedUser[]>(`/admin/users?${params}`),
  });
  const selected = users.find((item) => item.id === selectedId);
  const { data: activity } = useQuery({
    queryKey: ["user-activity", selectedId],
    queryFn: () => api<UserActivity>(`/admin/users/${selectedId}/activity`),
    enabled: Boolean(selectedId),
  });
  const { data: performance } = useQuery({
    queryKey: ["user-performance", selected?.employee?.id],
    queryFn: () =>
      api<{ member: PerformanceMember }>(
        `/performance/${selected!.employee!.id}`,
      ),
    enabled: Boolean(selected?.employee?.id),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["user-activity"] });
    qc.invalidateQueries({ queryKey: ["performance"] });
  };
  const create = useMutation({
    mutationFn: () =>
      api<ManagedUser>("/admin/users", {
        method: "POST",
        body: JSON.stringify(payload(form, true)),
      }),
    onSuccess: (created) => {
      refresh();
      setSelectedId(created.id);
      setForm(fromUser(created));
    },
  });
  const update = useMutation({
    mutationFn: () =>
      api<ManagedUser>(`/admin/users/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify(payload(form, false)),
      }),
    onSuccess: (saved) => {
      refresh();
      setForm(fromUser(saved));
      if (saved.id === currentUser?.sub) logout();
    },
  });
  const resetPassword = useMutation({
    mutationFn: () =>
      api(`/admin/users/${selectedId}/password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      setPassword("");
      refresh();
      if (selectedId === currentUser?.sub) logout();
    },
  });
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, UsersMeta["permissions"]>();
    for (const permission of meta?.permissions ?? []) {
      const group = permission.code.split(".")[0];
      groups.set(group, [...(groups.get(group) ?? []), permission]);
    }
    return [...groups.entries()];
  }, [meta]);

  const choose = (item?: ManagedUser) => {
    setSelectedId(item?.id);
    setForm(item ? fromUser(item) : defaults(meta));
    setPassword("");
  };
  const toggleRole = (name: string) =>
    setForm((current) => {
      const roleNames = current.roleNames.includes(name)
        ? current.roleNames.filter((role) => role !== name)
        : [...current.roleNames, name];
      const permissions = new Set<string>();
      for (const role of meta?.roles ?? [])
        if (roleNames.includes(role.name))
          for (const entry of role.permissions)
            permissions.add(entry.permission.code);
      return {
        ...current,
        roleNames,
        permissionCodes: [...permissions],
        position:
          name === "TECHNICIAN" && !current.roleNames.includes(name)
            ? "Técnico"
            : name === "SELLER" && !current.roleNames.includes(name)
              ? "Vendedor"
              : current.position,
      };
    });
  const error = create.error ?? update.error ?? resetPassword.error;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Usuarios y personal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuentas, roles, permisos, comisiones, actividad y resultados
            individuales.
          </p>
        </div>
        <Button onClick={() => choose()}>
          <Plus size={16} /> Nuevo usuario
        </Button>
      </div>
      <Card>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_220px_180px]">
          <div className="relative">
            <Search
              className="absolute left-3 top-3 text-muted-foreground"
              size={16}
            />
            <Input
              className="pl-9"
              placeholder="Buscar nombre o correo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="">Todos los roles</option>
            {meta?.roles.map((role) => (
              <option key={role.id} value={role.name}>
                {roleLabels[role.name] ?? role.name}
              </option>
            ))}
          </Select>
          <Select
            value={activeFilter}
            onChange={(event) => setActiveFilter(event.target.value)}
          >
            <option value="">Activos e inactivos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </Select>
        </CardContent>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader
            title={`Personal (${users.length})`}
            description="No se eliminan cuentas con historial; se desactivan."
          />
          <CardContent className="space-y-2">
            {users.length ? (
              users.map((item) => (
                <button
                  key={item.id}
                  onClick={() => choose(item)}
                  className={`w-full rounded-lg border p-3 text-left transition hover:border-primary ${selectedId === item.id ? "border-primary bg-cyan-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.email}
                      </p>
                    </div>
                    <Badge tone={item.active ? "success" : "neutral"}>
                      {item.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.roles.map((role) => (
                      <Badge key={role.id}>
                        {roleLabels[role.name] ?? role.name}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.employee?.position ?? "Cuenta administrativa"}
                  </p>
                </button>
              ))
            ) : (
              <Empty>No hay usuarios con esos filtros.</Empty>
            )}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader
              title={selectedId ? "Editar usuario" : "Crear usuario"}
              description="Los cambios de acceso revocan inmediatamente las sesiones anteriores."
            />
            <CardContent>
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  selectedId ? update.mutate() : create.mutate();
                }}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Nombre">
                    <Input
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      required
                    />
                  </Field>
                  <Field label="Correo de inicio de sesión">
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      required
                    />
                  </Field>
                  <Field label="Teléfono">
                    <Input
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                    />
                  </Field>
                  {!selectedId && (
                    <Field label="Contraseña inicial (mínimo 12)">
                      <Input
                        type="password"
                        minLength={12}
                        value={form.password}
                        onChange={(e) =>
                          setForm({ ...form, password: e.target.value })
                        }
                        required
                      />
                    </Field>
                  )}
                  <Field label="Cargo">
                    <Input
                      value={form.position}
                      onChange={(e) =>
                        setForm({ ...form, position: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Salario base opcional">
                    <Input
                      value={form.baseSalary}
                      onChange={(e) =>
                        setForm({ ...form, baseSalary: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">
                    Roles (puede seleccionar varios)
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {meta?.roles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.roleNames.includes(role.name)}
                          onChange={() => toggleRole(role.name)}
                        />{" "}
                        {roleLabels[role.name] ?? role.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Comisión individual (%)">
                    <Input
                      value={form.commissionPercentage}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          commissionPercentage: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Base de comisión">
                    <Select
                      value={form.commissionBasis}
                      onChange={(e) =>
                        setForm({ ...form, commissionBasis: e.target.value })
                      }
                    >
                      <option value="CONTRIBUTION_MARGIN">
                        Margen de contribución
                      </option>
                      <option value="LABOR">Mano de obra</option>
                    </Select>
                  </Field>
                  <Field label="Nota del acuerdo">
                    <Input
                      value={form.commissionNote}
                      onChange={(e) =>
                        setForm({ ...form, commissionNote: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">Permisos efectivos</p>
                    <span className="text-xs text-muted-foreground">
                      {form.permissionCodes.length} autorizados
                    </span>
                  </div>
                  <div className="max-h-80 space-y-3 overflow-auto rounded-lg border p-3">
                    {groupedPermissions.map(([group, permissions]) => (
                      <div key={group}>
                        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                          {group}
                        </p>
                        <div className="grid gap-1 md:grid-cols-2">
                          {permissions.map((permission) => (
                            <label
                              key={permission.id}
                              className="flex items-center gap-2 rounded p-1.5 text-xs hover:bg-muted"
                            >
                              <input
                                type="checkbox"
                                checked={form.permissionCodes.includes(
                                  permission.code,
                                )}
                                onChange={() =>
                                  setForm((current) => ({
                                    ...current,
                                    permissionCodes:
                                      current.permissionCodes.includes(
                                        permission.code,
                                      )
                                        ? current.permissionCodes.filter(
                                            (code) => code !== permission.code,
                                          )
                                        : [
                                            ...current.permissionCodes,
                                            permission.code,
                                          ],
                                  }))
                                }
                              />
                              {permission.code}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) =>
                      setForm({ ...form, active: e.target.checked })
                    }
                  />{" "}
                  Usuario activo
                </label>
                {error && <p className="error">{error.message}</p>}
                <Button
                  disabled={
                    create.isPending ||
                    update.isPending ||
                    !form.roleNames.length
                  }
                >
                  <Save size={16} />{" "}
                  {selectedId ? "Guardar cambios" : "Crear cuenta"}
                </Button>
              </form>
            </CardContent>
          </Card>
          {selectedId && (
            <Card>
              <CardHeader
                title="Seguridad"
                description="Restablecer la contraseña revoca todas las sesiones actuales de esta cuenta."
              />
              <CardContent>
                <form
                  className="flex gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    resetPassword.mutate();
                  }}
                >
                  <Input
                    type="password"
                    minLength={12}
                    placeholder="Nueva contraseña segura"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <Button variant="outline">
                    <KeyRound size={16} /> Restablecer
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
          {selectedId && (
            <StaffOverview activity={activity} member={performance?.member} />
          )}
        </div>
      </div>
    </div>
  );
}

function StaffOverview({
  activity,
  member,
}: {
  activity?: UserActivity;
  member?: PerformanceMember;
}) {
  return (
    <Card>
      <CardHeader
        title="Actividad y resultados"
        description="Las cifras se atribuyen una sola vez al responsable de la operación."
      />
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Small
            label="Ventas"
            value={String(activity?.summary.sales ?? 0)}
            icon={<UserCheck size={16} />}
          />
          <Small
            label="Reparaciones asignadas"
            value={String(activity?.summary.assignedRepairs ?? 0)}
            icon={<ShieldCheck size={16} />}
          />
          <Small
            label="Cobros"
            value={String(activity?.summary.payments ?? 0)}
          />
          <Small
            label="Comisiones"
            value={String(activity?.summary.commissions ?? 0)}
          />
          <Small
            label="Recepciones"
            value={String(activity?.summary.receivedRepairs ?? 0)}
          />
        </div>
        {member && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Small label="Monto vendido" value={money(member.soldAmount)} />
            <Small
              label="Ingresos atribuibles"
              value={money(member.attributableRevenue)}
            />
            <Small label="Costos directos" value={money(member.directCosts)} />
            <Small label="Margen" value={money(member.margin)} />
            <Small
              label="Comisión generada"
              value={money(member.commissionsGenerated)}
            />
            <Small
              label="Comisión pagada"
              value={money(member.commissionsPaid)}
            />
            <Small
              label="Saldo pendiente"
              value={money(member.commissionsPending)}
            />
            <Small
              label="Ticket promedio"
              value={money(member.averageTicket)}
            />
          </div>
        )}
        <div>
          <p className="mb-2 text-sm font-semibold">Historial reciente</p>
          {activity?.logs.length ? (
            <div className="max-h-72 overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Acción</th>
                    <th>Entidad</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.logs.map((log) => (
                    <tr key={log.id}>
                      <td>{dateTime(log.createdAt)}</td>
                      <td>{log.action}</td>
                      <td>{log.entityType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Sin actividad registrada.</Empty>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
function payload(form: UserForm, creating: boolean) {
  return {
    name: form.name,
    email: form.email,
    phone: form.phone || undefined,
    ...(creating ? { password: form.password } : {}),
    active: form.active,
    roleNames: form.roleNames,
    position: form.position || undefined,
    baseSalary: form.baseSalary || undefined,
    commissionPercentage: form.commissionPercentage || undefined,
    commissionBasis: form.commissionBasis,
    commissionNote: form.commissionNote || undefined,
    permissionCodes: form.permissionCodes,
  };
}
function fromUser(user: ManagedUser): UserForm {
  return {
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    password: "",
    active: user.active,
    roleNames: user.roles.map((role) => role.name),
    position: user.employee?.position ?? "",
    baseSalary: user.employee?.baseSalary ?? "",
    commissionPercentage: user.employee?.commissionPercentage ?? "",
    commissionBasis: user.employee?.commissionBasis ?? "CONTRIBUTION_MARGIN",
    commissionNote: user.employee?.commissionNote ?? "",
    permissionCodes: user.permissionCodes,
  };
}
function defaults(meta?: UsersMeta): UserForm {
  const role = meta?.roles.find((item) => item.name === "SELLER");
  return {
    ...emptyForm,
    roleNames: ["SELLER"],
    permissionCodes:
      role?.permissions.map((entry) => entry.permission.code) ?? [],
  };
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
function Small({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <strong>{value}</strong>
    </div>
  );
}
