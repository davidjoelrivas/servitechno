import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Empty,
  Input,
  Select,
  Badge,
} from "../components/ui";
import { api } from "../lib/api";
import { dateTime, money } from "../lib/utils";
import type { Customer, PaymentMethod, Product, Sale } from "../types";

const moneyValue = z.string().regex(/^\d+(\.\d{1,2})?$/, "Monto inválido");
const schema = z.object({
  customerId: z.string().optional(),
  discount: moneyValue,
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Seleccione un producto"),
        quantity: z.string().regex(/^\d+(\.\d{1,3})?$/),
        unitPrice: moneyValue,
        serial: z.string().optional(),
        color: z.string().optional(),
        capacity: z.string().optional(),
        specifications: z.string().optional(),
      }),
    )
    .min(1),
  payments: z
    .array(
      z.object({
        methodId: z.string().min(1),
        amount: moneyValue,
        idempotencyKey: z.string().min(8),
      }),
    )
    .min(1),
});
type Form = z.infer<typeof schema>;
const key = () => crypto.randomUUID();

export function SalesPage() {
  const qc = useQueryClient();
  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: () => api<Sale[]>("/sales"),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => api<Customer[]>("/customers"),
  });
  const { data: methods = [] } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => api<PaymentMethod[]>("/payment-methods"),
  });
  const emptyItem = {
    productId: "",
    quantity: "1",
    unitPrice: "0",
    serial: "",
    color: "",
    capacity: "",
    specifications: "",
  };
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: "",
      discount: "0",
      items: [emptyItem],
      payments: [{ methodId: "", amount: "0", idempotencyKey: key() }],
    },
  });
  const items = useFieldArray({ control: form.control, name: "items" });
  const payments = useFieldArray({ control: form.control, name: "payments" });
  const mutation = useMutation({
    mutationFn: (body: Form) =>
      api("/sales", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          customerId: body.customerId || undefined,
        }),
      }),
    onSuccess: () => {
      form.reset({
        customerId: "",
        discount: "0",
        items: [emptyItem],
        payments: [{ methodId: "", amount: "0", idempotencyKey: key() }],
      });
      [
        "sales",
        "products",
        "cash",
        "dashboard",
        "documents",
        "performance",
      ].forEach((queryKey) => qc.invalidateQueries({ queryKey: [queryKey] }));
    },
  });
  const [paymentSaleId, setPaymentSaleId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("0");
  const laterPayment = useMutation({
    mutationFn: () =>
      api(`/sales/${paymentSaleId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          methodId: paymentMethodId,
          amount: paymentAmount,
          idempotencyKey: key(),
        }),
      }),
    onSuccess: () => {
      setPaymentSaleId("");
      setPaymentMethodId("");
      setPaymentAmount("0");
      ["sales", "cash", "dashboard", "documents"].forEach((queryKey) =>
        qc.invalidateQueries({ queryKey: [queryKey] }),
      );
    },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Ventas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Genera recibos y garantías según el tipo de producto.
        </p>
      </div>
      <div className="grid gap-5 2xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader
            title="Nueva venta"
            description="Teléfonos y computadoras requieren cliente e IMEI/serie."
          />
          <CardContent>
            <form
              className="space-y-5"
              onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="field">
                  <label>Cliente</label>
                  <Select {...form.register("customerId")}>
                    <option value="">Consumidor final</option>
                    {customers.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="field">
                  <label>Descuento total</label>
                  <Input {...form.register("discount")} />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <h3 className="text-sm font-semibold">Artículos</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => items.append(emptyItem)}
                  >
                    <Plus size={15} /> Agregar
                  </Button>
                </div>
                {items.fields.map((field, index) => (
                  <div
                    className="grid gap-2 rounded-lg border p-3 md:grid-cols-2"
                    key={field.id}
                  >
                    <Select
                      {...form.register(`items.${index}.productId`)}
                      onChange={(event) => {
                        form.setValue(
                          `items.${index}.productId`,
                          event.target.value,
                        );
                        const product = products.find(
                          (p) => p.id === event.target.value,
                        );
                        if (product)
                          form.setValue(
                            `items.${index}.unitPrice`,
                            product.salePrice,
                          );
                      }}
                    >
                      <option value="">Producto…</option>
                      {products.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name} ({p.stock})
                        </option>
                      ))}
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        aria-label="Cantidad"
                        placeholder="Cantidad"
                        {...form.register(`items.${index}.quantity`)}
                      />
                      <Input
                        aria-label="Precio unitario"
                        placeholder="Precio"
                        {...form.register(`items.${index}.unitPrice`)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={items.fields.length === 1}
                        onClick={() => items.remove(index)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    <Input
                      placeholder="IMEI o serie"
                      {...form.register(`items.${index}.serial`)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Color"
                        {...form.register(`items.${index}.color`)}
                      />
                      <Input
                        placeholder="Capacidad"
                        {...form.register(`items.${index}.capacity`)}
                      />
                    </div>
                    <Input
                      className="md:col-span-2"
                      placeholder="Especificaciones (computadoras)"
                      {...form.register(`items.${index}.specifications`)}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <h3 className="text-sm font-semibold">Pagos</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      payments.append({
                        methodId: "",
                        amount: "0",
                        idempotencyKey: key(),
                      })
                    }
                  >
                    <Plus size={15} /> Pago mixto
                  </Button>
                </div>
                {payments.fields.map((field, index) => (
                  <div
                    className="grid gap-2 md:grid-cols-[1fr_150px_40px]"
                    key={field.id}
                  >
                    <Select {...form.register(`payments.${index}.methodId`)}>
                      <option value="">Método…</option>
                      {methods.map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label="Monto pagado"
                      {...form.register(`payments.${index}.amount`)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={payments.fields.length === 1}
                      onClick={() => payments.remove(index)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
              {mutation.error && (
                <p className="error">{mutation.error.message}</p>
              )}
              <Button className="w-full" disabled={mutation.isPending}>
                Confirmar venta y generar documentos
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Ventas recientes" />
          <CardContent>
            {sales.length ? (
              <div className="space-y-3">
                {sales.map((sale) => (
                  <div key={sale.id} className="rounded-lg border p-4">
                    <div className="flex justify-between">
                      <div>
                        <p className="font-semibold">Venta #{sale.number}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateTime(sale.createdAt)} ·{" "}
                          {sale.customer?.name ?? "Consumidor final"}
                        </p>
                      </div>
                      <Badge
                        tone={
                          Number(sale.balance) === 0 ? "success" : "warning"
                        }
                      >
                        {sale.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex justify-between text-sm">
                      <span>{sale.items.length} artículo(s)</span>
                      <strong>{money(sale.total)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>No hay ventas registradas.</Empty>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Registrar abono posterior"
          description="Reduce la cuenta por cobrar y genera un comprobante independiente."
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
              value={paymentSaleId}
              onChange={(event) => setPaymentSaleId(event.target.value)}
              required
            >
              <option value="">Venta con saldo…</option>
              {sales
                .filter((sale) => Number(sale.balance) > 0)
                .map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    #{sale.number} · {sale.customer?.name ?? "Consumidor final"}{" "}
                    · saldo {money(sale.balance)}
                  </option>
                ))}
            </Select>
            <Select
              value={paymentMethodId}
              onChange={(event) => setPaymentMethodId(event.target.value)}
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
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
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
    </div>
  );
}
