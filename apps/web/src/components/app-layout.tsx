import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorCog,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "../auth";
import { Button } from "./ui";
import { cn } from "../lib/utils";
import { AssistantPanel } from "./assistant-panel";

const items = [
  {
    to: "/",
    label: "Inicio",
    icon: LayoutDashboard,
    permission: "reports.financial.read",
  },
  {
    to: "/rendimiento",
    label: "Rendimiento",
    icon: BarChart3,
    permission: "reports.team.read",
  },
  {
    to: "/mi-rendimiento",
    label: "Mis resultados",
    icon: BarChart3,
    permission: "performance.self.read",
  },
  { to: "/caja", label: "Caja", icon: WalletCards, permission: "cash.read" },
  {
    to: "/ventas",
    label: "Ventas",
    icon: ShoppingCart,
    permission: "sales.read",
  },
  {
    to: "/reparaciones",
    label: "Reparaciones",
    icon: Wrench,
    permission: "repairs.read",
  },
  {
    to: "/inventario",
    label: "Inventario",
    icon: Boxes,
    permission: "inventory.read",
  },
  {
    to: "/gastos",
    label: "Gastos",
    icon: ReceiptText,
    permission: "expenses.read",
  },
  {
    to: "/clientes",
    label: "Clientes",
    icon: Users,
    permission: "customers.read",
  },
  {
    to: "/devoluciones",
    label: "Devoluciones",
    icon: RotateCcw,
    permission: "returns.read",
  },
  {
    to: "/compras",
    label: "Compras",
    icon: ClipboardList,
    permission: "purchases.read",
  },
  {
    to: "/proveedores",
    label: "Proveedores",
    icon: Truck,
    permission: "suppliers.read",
  },
  {
    to: "/comisiones",
    label: "Comisiones",
    icon: HandCoins,
    permission: "commissions.read",
  },
  {
    to: "/documentos",
    label: "Documentos",
    icon: FileText,
    permission: "documents.read",
  },
  {
    to: "/usuarios",
    label: "Usuarios y personal",
    icon: UserCog,
    permission: "users.manage",
  },
];

export function AppLayout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      {open && (
        <button
          aria-label="Cerrar navegación"
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[250px] -translate-x-full flex-col bg-[#102a43] text-white transition lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500">
            <MonitorCog size={22} />
          </div>
          <div>
            <p className="font-semibold">Servi Techno</p>
            <p className="text-xs text-slate-300">ERP empresarial</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-white lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items
            .filter(
              (item) =>
                can(item.permission) &&
                !(
                  item.to === "/mi-rendimiento" && user?.roles.includes("ADMIN")
                ),
            )
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white",
                    isActive && "bg-cyan-500/20 text-cyan-200",
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-slate-400">
            {user?.roles.join(" · ")}
          </p>
          <button
            onClick={logout}
            className="mt-4 flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b bg-white/90 px-4 backdrop-blur lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <p className="ml-auto text-sm text-muted-foreground">
            Operación con datos reales
          </p>
        </header>
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
        {can("assistant.use") && <AssistantPanel />}
      </div>
    </div>
  );
}
