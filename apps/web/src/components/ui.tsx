import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50", {
  variants: { variant: { default: "bg-primary text-primary-foreground hover:brightness-95", outline: "border bg-white hover:bg-muted", ghost: "hover:bg-muted", destructive: "bg-destructive text-destructive-foreground" }, size: { default: "h-10 px-4", sm: "h-9 px-3", icon: "h-10 w-10" } },
  defaultVariants: { variant: "default", size: "default" },
});

export function Button({ className, variant, size, asChild, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />; }
export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className="flex items-start justify-between gap-4 border-b p-5"><div><h2 className="font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{action}</div>; }
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("p-5", className)} {...props} />; }
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn("h-10 w-full", className)} {...props} />; }
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn("h-10 w-full", className)} {...props}>{children}</select>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" }) { return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tone === "success" && "bg-emerald-100 text-emerald-700", tone === "warning" && "bg-amber-100 text-amber-700", tone === "neutral" && "bg-slate-100 text-slate-700")}>{children}</span>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="grid min-h-32 place-items-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>; }

