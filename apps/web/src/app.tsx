import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useAuth } from "./auth";
import { AppLayout } from "./components/app-layout";

const LoginPage = lazy(() =>
  import("./pages/login").then((module) => ({ default: module.LoginPage })),
);
const DashboardPage = lazy(() =>
  import("./pages/dashboard").then((module) => ({
    default: module.DashboardPage,
  })),
);
const CashPage = lazy(() =>
  import("./pages/cash").then((module) => ({ default: module.CashPage })),
);
const InventoryPage = lazy(() =>
  import("./pages/inventory").then((module) => ({
    default: module.InventoryPage,
  })),
);
const SalesPage = lazy(() =>
  import("./pages/sales").then((module) => ({ default: module.SalesPage })),
);
const RepairsPage = lazy(() =>
  import("./pages/repairs").then((module) => ({ default: module.RepairsPage })),
);
const ExpensesPage = lazy(() =>
  import("./pages/expenses").then((module) => ({
    default: module.ExpensesPage,
  })),
);
const CustomersPage = lazy(() =>
  import("./pages/customers").then((module) => ({
    default: module.CustomersPage,
  })),
);
const ReturnsPage = lazy(() =>
  import("./pages/returns").then((module) => ({ default: module.ReturnsPage })),
);
const SuppliersPage = lazy(() =>
  import("./pages/suppliers").then((module) => ({
    default: module.SuppliersPage,
  })),
);
const PurchasesPage = lazy(() =>
  import("./pages/purchases").then((module) => ({
    default: module.PurchasesPage,
  })),
);
const CommissionsPage = lazy(() =>
  import("./pages/commissions").then((module) => ({
    default: module.CommissionsPage,
  })),
);
const DocumentsPage = lazy(() =>
  import("./pages/documents").then((module) => ({
    default: module.DocumentsPage,
  })),
);
const PerformancePage = lazy(() =>
  import("./pages/performance").then((module) => ({
    default: module.PerformancePage,
  })),
);
const UsersPage = lazy(() =>
  import("./pages/users").then((module) => ({ default: module.UsersPage })),
);

export function App() {
  const { user, can } = useAuth();
  if (!user)
    return (
      <Suspense
        fallback={
          <div className="grid min-h-screen place-items-center">Cargando…</div>
        }
      >
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Suspense>
    );
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">
          Cargando módulo…
        </div>
      }
    >
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              can("reports.financial.read") ? (
                <DashboardPage />
              ) : (
                <Navigate to="/mi-rendimiento" replace />
              )
            }
          />
          <Route path="caja" element={<CashPage />} />
          <Route path="ventas" element={<SalesPage />} />
          <Route path="reparaciones" element={<RepairsPage />} />
          <Route path="inventario" element={<InventoryPage />} />
          <Route path="gastos" element={<ExpensesPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="devoluciones" element={<ReturnsPage />} />
          <Route path="proveedores" element={<SuppliersPage />} />
          <Route path="compras" element={<PurchasesPage />} />
          <Route path="comisiones" element={<CommissionsPage />} />
          <Route path="documentos" element={<DocumentsPage />} />
          <Route path="rendimiento" element={<PerformancePage />} />
          <Route path="mi-rendimiento" element={<PerformancePage />} />
          <Route
            path="usuarios"
            element={
              can("users.manage") ? <UsersPage /> : <Navigate to="/" replace />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
