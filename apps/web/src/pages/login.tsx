import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, MonitorCog } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../auth";
import { Button, Card, CardContent, Input } from "../components/ui";

const schema = z.object({ email: z.email("Ingrese un correo válido"), password: z.string().min(8, "Mínimo 8 caracteres") });
type Form = z.infer<typeof schema>;
export function LoginPage() {
  const { login } = useAuth();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: "admin@servitechno.local" } });
  return <div className="grid min-h-screen bg-[#0b1f33] lg:grid-cols-2"><section className="hidden place-content-center p-12 text-white lg:grid"><div className="max-w-lg"><div className="mb-8 grid h-16 w-16 place-items-center rounded-2xl bg-cyan-500"><MonitorCog size={34} /></div><h1 className="text-5xl font-semibold leading-tight">Control claro para un negocio que crece.</h1><p className="mt-5 text-lg text-slate-300">Ventas, reparaciones, inventario, caja y finanzas en una sola fuente de verdad.</p></div></section><section className="grid place-items-center bg-background p-5"><Card className="w-full max-w-md"><CardContent className="p-7"><div className="mb-7 lg:hidden"><div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary text-white"><MonitorCog /></div></div><h2 className="text-2xl font-semibold">Bienvenido</h2><p className="mt-1 text-sm text-muted-foreground">Ingrese sus credenciales de Servi Techno ERP.</p><form className="mt-7 space-y-5" onSubmit={handleSubmit(async (values) => { try { await login(values.email, values.password); } catch (error) { setError("root", { message: error instanceof Error ? error.message : "No fue posible iniciar sesión" }); } })}><div className="field"><label>Correo electrónico</label><Input type="email" autoComplete="username" {...register("email")} />{errors.email && <p className="error">{errors.email.message}</p>}</div><div className="field"><label>Contraseña</label><Input type="password" autoComplete="current-password" {...register("password")} />{errors.password && <p className="error">{errors.password.message}</p>}</div>{errors.root && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errors.root.message}</p>}<Button className="w-full" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="animate-spin" size={17} />} Iniciar sesión</Button></form></CardContent></Card></section></div>;
}
