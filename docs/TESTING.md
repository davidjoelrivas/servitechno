# Pruebas

## Unitarias

```bash
pnpm test
```

Incluyen autorización, asiento balanceado, límites de comisión, escenario financiero y formato monetario.

La Iteración 8.5 añade pruebas del proveedor OpenAI: sin clave no realiza conexiones y, con transporte simulado, utiliza Responses, `store:false`, JSON Schema estricto y conserva la clave fuera del cuerpo.

## Integración completa

La prueba se niega a ejecutar si `DATABASE_URL` no contiene `servitechno_test`.

Con el entorno local iniciado, el flujo recomendado es:

```bash
pnpm local:test
```

`local:test` prepara primero la base aislada, ejecuta la regresión y deja los datos `[DEMO]` disponibles. Las contraseñas se guardan localmente en archivos ignorados por Git.

La regresión usa exclusivamente `servitechno_test`. El frontend de aceptación manual usa `servitechno_demo`; por ello ejecutar la suite no limpia ni contamina la jornada manual. Para vaciar deliberadamente el entorno manual use `pnpm local:reset-demo`.

```bash
docker exec servitechno-postgres-1 createdb -U servitechno servitechno_test
DATABASE_URL='postgresql://servitechno:servitechno@localhost:55432/servitechno_test?schema=public' pnpm --filter @servitechno/api prisma:deploy
DATABASE_URL='postgresql://servitechno:servitechno@localhost:55432/servitechno_test?schema=public' ADMIN_EMAIL='admin@servitechno.local' ADMIN_PASSWORD='defina-una-clave-de-prueba-segura' pnpm --filter @servitechno/api prisma:seed
DATABASE_URL='postgresql://servitechno:servitechno@localhost:55432/servitechno_test?schema=public' JWT_SECRET='defina-un-secreto-de-prueba-de-32-caracteres' ADMIN_EMAIL='admin@servitechno.local' ADMIN_PASSWORD='defina-una-clave-de-prueba-segura' pnpm --filter @servitechno/api test:e2e
```

La suite limpia únicamente los datos operativos de la base cuyo nombre contiene `servitechno_test` y conserva catálogos/roles del seed. Valida además devolución e inventario, compra y costo promedio, abono parcial, pago concurrente idempotente de comisión, conciliación y permisos administrativos.

La regresión de Iteración 4 también valida:

- Recibo y garantía para teléfono seminuevo.
- Mínimo configurado de 60 días.
- Descarga de PDF autenticada.
- Regeneración sin duplicar documentos.
- Ticket de recepción, recibo y garantía de reparación.
- Repuesto manual sin producto, costo/precio históricos y contabilidad balanceada.

La regresión de Iteración 5 añade:

- Abono posterior de venta y reparación, CxC, asiento y comprobante único.
- Rechazo de sobrepago e idempotencia.
- Carga autenticada de fotografía y descarga privada.
- Migración automática de la base de pruebas antes de ejecutar Jest.

La regresión de administración de personal añade:

- Creación de técnico y vendedor mediante el API administrativo usado por la interfaz.
- Login por rol, permisos propios y rechazo del dashboard financiero.
- Venta registrada por el vendedor y resultados atribuibles consultados por el administrador.
- Roles múltiples, revocación de tokens anteriores y bloqueo de login al desactivar.
- Protección del último administrador activo e historial individual.

La regresión de Servi Techno AI añade:

- Intenciones estructuradas mediante un proveedor controlado exclusivo de pruebas; producción usa Ollama real.
- Consultas con datos financieros reales y tarjetas de resultado.
- Preguntas por datos faltantes y rechazo por saldo insuficiente.
- Preparación, cancelación y confirmación explícita de gastos.
- Confirmación repetida sin duplicar el gasto.
- Invalidación de una propuesta cuando cambia la versión de sesión.
- Rechazo de información administrativa a técnico y vendedor aunque el mensaje intente alterar las instrucciones.
- Fallo del modelo con HTTP 503 sin registrar operaciones ni afectar el resto del ERP.
- Compra conversacional, corrección de cantidad, compra multiproducto y actualización de inventario/costo.
- Venta de teléfono con IMEI, pago parcial, recibo y garantía.
- Abono posterior, saldo en cero y comprobante de pago.
- Producto ambiguo, campos faltantes y vendedor sin permiso de compras.
- Confirmación repetida de compra, venta y abono sin duplicados.

## Navegador real

`scripts/browser-qa.mjs` usa el Google Chrome instalado y `playwright-core`. Trabaja contra `servitechno_test` mediante un API temporal, nunca contra los datos operativos. Valida ADMIN, TECHNICIAN y SELLER, las 14 rutas, creación de un técnico desde la interfaz, login de esa cuenta, venta mixta, reparación, abonos, evidencia, PDF/capturas y viewport móvil. El último resultado está en `artifacts/iteration5/result.json` y terminó con `ok: true` y cero fallos.

`scripts/assistant-browser-qa.mjs` realiza una comprobación de solo lectura del asistente local: abre el panel como administrador, verifica `ollama · qwen3:4b`, consulta ventas y guarda `artifacts/iteration7/assistant-admin-sales.png`. Requiere `QA_ADMIN_PASSWORD` y no confirma propuestas ni registra operaciones.

Con `QA_API_URL` y `QA_COMMERCIAL=true`, el mismo script puede apuntar a un API temporal sobre `servitechno_test`. La Iteración 8 guardó `assistant-purchase-corrected.png` y `assistant-purchase-confirmed.png`: preparó una compra, corrigió 1→2 unidades y confirmó L 180 sin tocar demo ni principal.

## Verificación local rápida

```bash
pnpm local:check
pnpm typecheck
pnpm test
pnpm local:test
```
