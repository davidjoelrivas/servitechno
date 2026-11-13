import { useFieldArray, useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Trash2 } from "lucide-react";
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
import { api, apiFormData, authenticatedBlob } from "../lib/api";
import { dateTime, money } from "../lib/utils";
import type {
  Customer,
  Employee,
  PaymentMethod,
  Product,
  Repair,
  RepairEvidence,
  Supplier,
} from "../types";

const amount = z.string().regex(/^\d+(\.\d{1,2})?$/, "Monto inválido");
const createSchema = z.object({
  customerId: z.string().min(1),
  technicianId: z.string().optional(),
  deviceType: z.string().min(2),
  brand: z.string().optional(),
  model: z.string().optional(),
  serial: z.string().optional(),
  reportedProblem: z.string().min(3),
  serviceRequested: z.string().optional(),
  physicalCondition: z.string().optional(),
  accessories: z.string().optional(),
  screen: z.string().optional(),
  housing: z.string().optional(),
  chargingPort: z.string().optional(),
  visibleDamage: z.string().optional(),
});
const partSchema = z.object({
  source: z.enum(["INVENTORY", "MANUAL"]),
  productId: z.string().optional(),
  description: z.string().optional(),
  quantity: z.string().regex(/^\d+(\.\d{1,3})?$/),
  unitCost: amount,
  unitPrice: amount,
  supplierId: z.string().optional(),
  costAlreadyRecorded: z.boolean(),
});
const completeSchema = z
  .object({
    repairId: z.string().min(1),
    laborPrice: amount,
    workPerformed: z.string().min(3),
    parts: z.array(partSchema),
    methodId: z.string().optional(),
    paymentAmount: amount,
    commissionPercentage: z.string().optional(),
  })
  .refine((v) => Number(v.paymentAmount) === 0 || Boolean(v.methodId), {
    path: ["methodId"],
    message: "Seleccione el método del cobro",
  });
type CreateForm = z.infer<typeof createSchema>;
type CompleteForm = z.infer<typeof completeSchema>;
const emptyPart = {
  source: "INVENTORY" as const,
  productId: "",
  description: "",
  quantity: "1",
  unitCost: "0",
  unitPrice: "0",
  supplierId: "",
  costAlreadyRecorded: false,
};

export function RepairsPage() {
  const qc = useQueryClient();
  const refresh = () =>
    [
      "repairs",
      "products",
      "cash",
      "dashboard",
      "documents",
      "performance",
    ].forEach((q) => qc.invalidateQueries({ queryKey: [q] }));
  const { data: repairs = [] } = useQuery({
    queryKey: ["repairs"],
    queryFn: () => api<Repair[]>("/repairs"),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => api<Customer[]>("/customers"),
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api<Employee[]>("/employees"),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<Supplier[]>("/suppliers"),
  });
  const { data: methods = [] } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => api<PaymentMethod[]>("/payment-methods"),
  });
  const [evidenceRepairId, setEvidenceRepairId] = useState("");
  const { data: evidence = [] } = useQuery({
    queryKey: ["repair-evidence", evidenceRepairId],
    queryFn: () =>
      api<RepairEvidence[]>(`/repairs/${evidenceRepairId}/evidence`),
    enabled: Boolean(evidenceRepairId),
  });
  const uploadEvidence = useMutation({
    mutationFn: async (files: FileList) => {
      const body = new FormData();
      for (const file of Array.from(files)) body.append("photos", file);
      return apiFormData<RepairEvidence[]>(
        `/repairs/${evidenceRepairId}/evidence`,
        body,
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["repair-evidence", evidenceRepairId] }),
  });
  const [laterRepairId, setLaterRepairId] = useState("");
  const [laterMethodId, setLaterMethodId] = useState("");
  const [laterAmount, setLaterAmount] = useState("0");
  const laterPayment = useMutation({
    mutationFn: () =>
      api(`/repairs/${laterRepairId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          methodId: laterMethodId,
          amount: laterAmount,
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    onSuccess: () => {
      setLaterRepairId("");
      setLaterMethodId("");
      setLaterAmount("0");
      refresh();
    },
  });
  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });
  const completeForm = useForm<CompleteForm>({
    resolver: zodResolver(completeSchema),
    defaultValues: {
      laborPrice: "0",
      paymentAmount: "0",
      commissionPercentage: "30",
      parts: [],
    },
  });
  const parts = useFieldArray({ control: completeForm.control, name: "parts" });
  const create = useMutation({
    mutationFn: (v: CreateForm) =>
      api("/repairs", {
        method: "POST",
        body: JSON.stringify({
          customerId: v.customerId,
          technicianId: v.technicianId || undefined,
          deviceType: v.deviceType,
          brand: v.brand,
          model: v.model,
          serial: v.serial,
          reportedProblem: v.reportedProblem,
          serviceRequested: v.serviceRequested,
          physicalCondition: v.physicalCondition,
          accessories: v.accessories,
          conditionChecklist: {
            screen: v.screen,
            housing: v.housing,
            chargingPort: v.chargingPort,
            visibleDamage: v.visibleDamage,
          },
        }),
      }),
    onSuccess: () => {
      createForm.reset();
      refresh();
    },
  });
  const complete = useMutation({
    mutationFn: (v: CompleteForm) =>
      api(`/repairs/${v.repairId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          laborPrice: v.laborPrice,
          workPerformed: v.workPerformed,
          parts: v.parts.map((part) => {
            const product = products.find((p) => p.id === part.productId);
            return {
              ...part,
              productId:
                part.source === "INVENTORY" ? part.productId : undefined,
              description: part.description || product?.name,
              unitCost: part.source === "INVENTORY" ? undefined : part.unitCost,
              supplierId: part.supplierId || undefined,
            };
          }),
          payments:
            Number(v.paymentAmount) > 0
              ? [
                  {
                    methodId: v.methodId!,
                    amount: v.paymentAmount,
                    idempotencyKey: crypto.randomUUID(),
                  },
                ]
              : [],
          commissionPercentage: v.commissionPercentage || undefined,
        }),
      }),
    onSuccess: () => {
      completeForm.reset({
        laborPrice: "0",
        paymentAmount: "0",
        commissionPercentage: "30",
        parts: [],
      });
      refresh();
    },
  });
  const active = repairs.filter(
    (r) => !["REPAIRED", "READY", "DELIVERED", "CANCELLED"].includes(r.status),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Reparaciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recepción documentada, costos flexibles, rentabilidad y garantía.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Recibir equipo"
            description="Al guardar se genera el ticket de recepción."
          />
          <CardContent>
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={createForm.handleSubmit((v) => create.mutate(v))}
            >
              <Field label="Cliente">
                <Select {...createForm.register("customerId")}>
                  <option value="">Seleccione…</option>
                  {customers.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Técnico asignado">
                <Select {...createForm.register("technicianId")}>
                  <option value="">Sin asignar</option>
                  {employees.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tipo de dispositivo">
                <Input {...createForm.register("deviceType")} />
              </Field>
              <Field label="Marca">
                <Input {...createForm.register("brand")} />
              </Field>
              <Field label="Modelo">
                <Input {...createForm.register("model")} />
              </Field>
              <Field label="IMEI / serie">
                <Input {...createForm.register("serial")} />
              </Field>
              <Field label="Falla reportada">
                <Input {...createForm.register("reportedProblem")} />
              </Field>
              <Field label="Servicio solicitado">
                <Input {...createForm.register("serviceRequested")} />
              </Field>
              <Field label="Estado físico general">
                <Input {...createForm.register("physicalCondition")} />
              </Field>
              <Field label="Accesorios entregados">
                <Input {...createForm.register("accessories")} />
              </Field>
              <Field label="Pantalla / cristal">
                <Input {...createForm.register("screen")} />
              </Field>
              <Field label="Carcasa / botones">
                <Input {...createForm.register("housing")} />
              </Field>
              <Field label="Puerto de carga">
                <Input {...createForm.register("chargingPort")} />
              </Field>
              <Field label="Daños visibles / humedad">
                <Input {...createForm.register("visibleDamage")} />
              </Field>
              {create.error && (
                <p className="error md:col-span-2">{create.error.message}</p>
              )}
              <Button className="md:col-span-2">Crear orden y ticket</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Completar reparación"
            description="Mano de obra + precio de repuestos forman el importe final."
          />
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={completeForm.handleSubmit((v) => complete.mutate(v))}
            >
              <Field label="Orden activa">
                <Select {...completeForm.register("repairId")}>
                  <option value="">Seleccione…</option>
                  {active.map((r) => (
                    <option value={r.id} key={r.id}>
                      #{r.number} · {r.customer.name} · {r.deviceType}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Mano de obra">
                  <Input {...completeForm.register("laborPrice")} />
                </Field>
                <Field label="Trabajo realizado">
                  <Input {...completeForm.register("workPerformed")} />
                </Field>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Repuestos</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => parts.append(emptyPart)}
                  >
                    <Plus size={15} /> Repuesto
                  </Button>
                </div>
                {parts.fields.map((row, index) => {
                  const source = completeForm.watch(`parts.${index}.source`);
                  return (
                    <div
                      className="grid gap-2 rounded-lg border p-3 md:grid-cols-2"
                      key={row.id}
                    >
                      <Select
                        {...completeForm.register(`parts.${index}.source`)}
                      >
                        <option value="INVENTORY">Desde inventario</option>
                        <option value="MANUAL">Compra/costo manual</option>
                      </Select>
                      {source === "INVENTORY" ? (
                        <Select
                          {...completeForm.register(`parts.${index}.productId`)}
                          onChange={(event) => {
                            completeForm.setValue(
                              `parts.${index}.productId`,
                              event.target.value,
                            );
                            const p = products.find(
                              (item) => item.id === event.target.value,
                            );
                            if (p) {
                              completeForm.setValue(
                                `parts.${index}.description`,
                                p.name,
                              );
                              completeForm.setValue(
                                `parts.${index}.unitPrice`,
                                p.salePrice,
                              );
                            }
                          }}
                        >
                          <option value="">Producto…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.stock})
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          placeholder="Descripción del repuesto"
                          {...completeForm.register(
                            `parts.${index}.description`,
                          )}
                        />
                      )}
                      <Input
                        placeholder="Cantidad"
                        {...completeForm.register(`parts.${index}.quantity`)}
                      />
                      <Input
                        placeholder={
                          source === "INVENTORY"
                            ? "Costo: promedio contable"
                            : "Costo real unitario"
                        }
                        disabled={source === "INVENTORY"}
                        {...completeForm.register(`parts.${index}.unitCost`)}
                      />
                      <Input
                        placeholder="Precio unitario cobrado"
                        {...completeForm.register(`parts.${index}.unitPrice`)}
                      />
                      <Select
                        {...completeForm.register(`parts.${index}.supplierId`)}
                      >
                        <option value="">Proveedor opcional</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                      {source === "MANUAL" && (
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            {...completeForm.register(
                              `parts.${index}.costAlreadyRecorded`,
                            )}
                          />{" "}
                          El costo ya fue contabilizado
                        </label>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => parts.remove(index)}
                      >
                        <Trash2 size={15} /> Quitar
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Método de cobro">
                  <Select {...completeForm.register("methodId")}>
                    <option value="">Sin cobro</option>
                    {methods.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Monto cobrado">
                  <Input {...completeForm.register("paymentAmount")} />
                </Field>
                <Field label="Comisión sobre margen (%)">
                  <Input {...completeForm.register("commissionPercentage")} />
                </Field>
              </div>
              {complete.error && (
                <p className="error">{complete.error.message}</p>
              )}
              <Button className="w-full">Finalizar y generar documentos</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Registrar abono de reparación"
          description="Registra un cobro posterior y genera su comprobante."
        />
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              laterPayment.mutate();
            }}
          >
            <Select
              value={laterRepairId}
              onChange={(event) => setLaterRepairId(event.target.value)}
              required
            >
              <option value="">Orden con saldo…</option>
              {repairs
                .filter((repair) => Number(repair.balance) > 0)
                .map((repair) => (
                  <option key={repair.id} value={repair.id}>
                    #{repair.number} · {repair.customer.name} · saldo{" "}
                    {money(repair.balance)}
                  </option>
                ))}
            </Select>
            <Select
              value={laterMethodId}
              onChange={(event) => setLaterMethodId(event.target.value)}
              required
            >
              <option value="">Método de cobro…</option>
              {methods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Monto del abono"
              value={laterAmount}
              onChange={(event) => setLaterAmount(event.target.value)}
              pattern="\d+(\.\d{1,2})?"
              required
            />
            <Button disabled={laterPayment.isPending}>Registrar abono</Button>
          </form>
          {laterPayment.error && (
            <p className="error mt-3">{laterPayment.error.message}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title="Evidencia fotográfica"
          description="Archivos privados ligados a la orden, con fecha y responsable."
        />
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Select
                value={evidenceRepairId}
                onChange={(event) => setEvidenceRepairId(event.target.value)}
              >
                <option value="">Seleccione una orden…</option>
                {repairs.map((repair) => (
                  <option key={repair.id} value={repair.id}>
                    #{repair.number} · {repair.customer.name} ·{" "}
                    {repair.deviceType}
                  </option>
                ))}
              </Select>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                <Camera size={16} /> Adjuntar fotos
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={!evidenceRepairId || uploadEvidence.isPending}
                  onChange={(event) => {
                    if (event.target.files?.length)
                      uploadEvidence.mutate(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Máximo 6 fotos por carga, 5 MB cada una; formatos JPEG, PNG o
              WebP.
            </p>
            {uploadEvidence.error && (
              <p className="error">{uploadEvidence.error.message}</p>
            )}
            {evidenceRepairId &&
              (evidence.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {evidence.map((item) => (
                    <EvidencePhoto key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <Empty>Esta orden todavía no tiene fotografías.</Empty>
              ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Órdenes recientes" />
        <CardContent>
          {repairs.length ? (
            <div className="overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Cliente/equipo</th>
                    <th>Estado</th>
                    <th>Técnico</th>
                    <th>Importe</th>
                    <th>Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.map((r) => (
                    <tr key={r.id}>
                      <td>#{r.number}</td>
                      <td>
                        <p>{r.customer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.brand} {r.model} · {r.deviceType}
                        </p>
                      </td>
                      <td>
                        <Badge
                          tone={r.status === "REPAIRED" ? "success" : "neutral"}
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td>{r.technician?.name ?? "—"}</td>
                      <td>{r.finalPrice ? money(r.finalPrice) : "—"}</td>
                      <td>{dateTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No hay órdenes registradas.</Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EvidencePhoto({ item }: { item: RepairEvidence }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let currentUrl = "";
    void authenticatedBlob(`/repair-evidence/${item.id}/file`).then((blob) => {
      currentUrl = URL.createObjectURL(blob);
      setUrl(currentUrl);
    });
    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [item.id]);
  return (
    <figure className="overflow-hidden rounded-lg border bg-muted/20">
      {url ? (
        <img
          src={url}
          alt={item.originalName}
          className="h-40 w-full object-cover"
        />
      ) : (
        <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
          Cargando foto…
        </div>
      )}
      <figcaption className="space-y-1 p-3 text-xs">
        <p className="truncate font-medium">{item.originalName}</p>
        <p className="text-muted-foreground">{item.createdBy.name}</p>
        <p className="text-muted-foreground">{dateTime(item.createdAt)}</p>
      </figcaption>
    </figure>
  );
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
