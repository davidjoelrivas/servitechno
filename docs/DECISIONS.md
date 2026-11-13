# Decisiones técnicas

1. **Monolito modular:** NestJS + React en monorepo. Reduce operación inicial sin impedir separar módulos más adelante.
2. **JWT Bearer en `sessionStorage`:** evita persistencia entre sesiones del navegador. Para producción se recomienda evolucionar a cookies HttpOnly con CSRF o rotación de refresh tokens.
3. **Costo promedio registrado:** cada salida congela `averageCost`. La actualización automática por compras llegará con el módulo de abastecimiento.
4. **Devengo al confirmar/finalizar:** ventas se devengan al confirmarse; reparaciones al completarse. Entrega y cobro pueden ocurrir después sin duplicar ingreso.
5. **HNL y Tegucigalpa por defecto:** configurables y sin inventar impuestos. El seed usa tasa cero.
6. **Puerto PostgreSQL 55432:** 5432–5434 estaban ocupados en el entorno; se eligió un puerto local alto y enlazado solo a loopback.
7. **Sin publicación automática:** el encargo exige un repositorio local completo y despliegue documentado, no autorización para publicar un sistema financiero.
8. **Reversos como documentos:** una devolución o anulación nunca modifica silenciosamente el asiento original; crea `SaleReturn`, movimientos y un asiento con referencia propia.
9. **Concurrencia financiera:** caja abierta tiene índice único parcial; pagos de comisiones bloquean la asignación y reintentan una vez los conflictos de serialización antes de devolver 409.
10. **Migración aditiva:** `20261110205146_returns_purchases_commissions` no elimina ni renombra columnas; añade tablas, restricciones, cuentas y permisos idempotentes.

