# Arquitectura y modelo de datos

## Componentes

- `apps/api`: API REST NestJS. Valida DTO, autentica, autoriza y ejecuta las transacciones financieras.
- `apps/web`: SPA React/Vite en español. React Router, TanStack Query, React Hook Form/Zod, componentes estilo shadcn/ui, Tailwind y Recharts.
- `packages/shared`: contratos TypeScript compartidos.
- PostgreSQL/Prisma: fuente de verdad transaccional.

La API se organiza en `auth`, `operations`, `returns`, `procurement`, `commissions`, `domain` y `prisma`. Los flujos que alteran varias áreas usan transacciones `Serializable`, bloqueo de filas y claves idempotentes donde existe riesgo de concurrencia.

## Modelo principal

- Identidad: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `Employee`.
- Comercial: `Customer`, `Product`, `Category`, `Sale`, `SaleItem`, `SaleReturn`, `SaleReturnItem`, `Payment`, `PaymentMethod`.
- Abastecimiento: `Supplier`, `Purchase`, `PurchaseItem`.
- Taller: `RepairOrder`, `RepairEvent`, `RepairPart`.
- Caja: `CashRegister`, `CashSession`, `CashMovement`.
- Finanzas: `Account`, `JournalEntry`, `JournalLine`, `FinancialAccount`, `Expense`.
- Remuneración: `CommissionRule`, `CommissionAllocation`, `CommissionPayment`.
- Control: `AuditLog`, `BusinessSetting`, `InventoryMovement`.

Los importes son `Decimal(14,2)`; cantidades de inventario son `Decimal(14,3)`. Los documentos usan secuencias de PostgreSQL y los pagos tienen `idempotencyKey` único.

El esquema completo está en `apps/api/prisma/schema.prisma` y la migración reproducible en `apps/api/prisma/migrations`.

