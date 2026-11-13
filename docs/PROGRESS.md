# Progreso

Actualizado: 13 de noviembre de 2026 (America/Tegucigalpa).

## Estado verificado antes de esta ejecución

- La migración inicial estaba aplicada y PostgreSQL 16 estaba saludable.
- Autenticación, permisos, caja, clientes, inventario, ventas, reparaciones, gastos, comisión calculada, contabilidad y dashboard superaban la regresión existente.
- Devoluciones, compras/proveedores y pagos de comisiones no tenían flujo API/UI.
- No existían remotos Git; todo el trabajo permanecía local.

## Correcciones de calidad

- Los descuentos de venta ahora se distribuyen por línea, preservando el importe neto restituible.
- Se rechazan cantidades, precios, pagos y gastos no positivos en backend.
- Caja tiene un índice único parcial que impide dos sesiones abiertas por registro incluso bajo concurrencia.
- Pagos duplicados se convierten en conflictos 409 en vez de errores internos.
- Pagos concurrentes de comisión reintentan conflictos de serialización y conservan idempotencia.
- El dashboard usa líneas contables para ingresos, costos, gastos y utilidad, en vez de recomponer cifras incompatibles desde documentos.

## Módulos nuevos integrados

### Devoluciones y anulaciones — núcleo completo

- Devolución parcial/total y anulación total diferenciadas.
- Reposición opcional de inventario, reembolso, reducción de CxC y saldo a favor.
- Asiento de reverso, movimiento de caja, documento numerado y auditoría.
- API, permisos, navegación y pantalla funcional.

Pendiente asociado: PDF del comprobante y consumo posterior del saldo a favor.

### Compras y proveedores — núcleo completo

- Alta/edición de proveedores e historial resumido.
- Compra multiproducto, costo promedio móvil, pago inicial y cuenta por pagar.
- Abonos parciales posteriores, caja/banco, asientos, idempotencia y auditoría.
- API, permisos, navegación y pantallas funcionales.

Pendiente opcional: devolución a proveedor.

### Pagos de comisiones — operación principal completa

- Consulta, aprobación, pagos parciales/completos, historial y CSV.
- Reconocimiento separado del pago efectivo y prevención de duplicados concurrentes.

Pendiente: ajustes manuales autorizados y comisiones originadas directamente por ventas.

### Dashboard mejorado

- Filtros por fechas.
- Ingresos contables netos, cobros, gastos, utilidad bruta/neta, caja, banco, CxC, CxP y comisiones pendientes.
- Cada tarjeta explica la naturaleza de su cifra.

## Migraciones

- `20261110205146_returns_purchases_commissions`: aplicada mediante `prisma migrate deploy` en las bases locales `servitechno` y `servitechno_test`.
- Es aditiva; no se ejecutó reset, borrado de volumen ni eliminación de datos principales.

## Pruebas ejecutadas

- `pnpm typecheck`: correcto.
- `pnpm test`: 5 pruebas correctas (4 API, 1 web).
- `pnpm build`: API, shared y web correctos.
- `test:e2e`: 3 pruebas correctas.
  - Regresión original: efectivo L 1,750, comisión L 270 y utilidad L 660.
  - Devolución, reposición, compra parcial, costo promedio, abono y conciliación.
  - Dos pagos concurrentes con la misma clave producen exactamente un pago y un 409.
  - Usuario sin permiso administrativo recibe 403.

## Pendiente en orden prioritario

1. Ajustes de comisión y comisiones por ventas.
2. Planilla, liquidaciones, anticipos, deducciones y tipos de pago a integrantes.
3. Comprobantes PDF e impresión.
4. Estados financieros completos, mayor, flujo de efectivo, rentabilidades y exportación.
5. Administración UI de usuarios, roles, configuración y reglas de comisión.
6. Evidencias, importador CSV/XLSX y exportaciones adicionales.

## Limitaciones conocidas

- No se emiten facturas fiscales ni se afirma cumplimiento tributario/laboral.
- Los comprobantes PDF y la planilla todavía no están implementados.
- Las comisiones actuales se originan en reparaciones; la pantalla de ventas aún no genera comisión.
- La revisión visual se verificó por compilación responsive; este entorno no proporcionó automatización de navegador local para una prueba visual completa.

## Próximo paso

Completar ajustes/origen de comisiones antes de iniciar planilla, respetando el orden incremental solicitado.

## Iteración 3 — entorno local verificado

- Se agregó un despliegue compilado con Docker Compose para PostgreSQL, NestJS y Nginx/React.
- `pnpm local:up`, `local:down`, `local:check`, `local:logs`, `local:restart`, `local:backup`, `local:test:prepare` y `local:test` ejecutan operaciones reales.
- Healthchecks de los tres servicios están activos; `/api/health` comprueba también PostgreSQL.
- El seed ya no cambia la contraseña de un administrador existente salvo `RESET_ADMIN_PASSWORD=true`.
- Existe una base aislada `servitechno_test` con administrador, dos técnicos, vendedor, cliente, productos e inventario `[DEMO]`.
- Se corrigió el script de inicio compilado del API (`dist/src/main.js`) y se añadió OpenSSL a la imagen para Prisma.
- El puerto 3000 estaba ocupado por otro proyecto; para no alterarlo, la API se expone en `http://localhost:3010`.
- Verificación real completada: frontend, Swagger, health, login ADMIN, `auth/me`, dashboard, migraciones, reinicio y respaldo.
- Planilla, PDF y estados financieros avanzados permanecen pendientes; no se iniciaron para preservar la estabilidad y las pruebas obligatorias.

Última validación: typecheck correcto; 5 pruebas unitarias y 3 pruebas e2e aprobadas; build API/web correcto.

## Iteración 4 — garantías, documentos y productividad

- Repuestos de reparación desde inventario o manuales, con descripción, costo real, precio cobrado, cantidad, proveedor, responsable e instantánea histórica.
- Los costos manuales no alteran el costo promedio del inventario; el costo nuevo se reconoce contra cuentas por pagar y puede marcarse como previamente contabilizado para evitar duplicación.
- Rendimiento individual separa ventas registradas, cobros recibidos, reparaciones ejecutadas, costos, margen y comisiones.
- Técnicos y vendedores tienen resultados propios; el dashboard financiero exige permiso financiero y el backend limita ventas, reparaciones y documentos por responsable.
- Venta genera recibo; teléfonos y computadoras generan además garantía individual por artículo. Accesorios generan solo recibo.
- Recepción de reparación genera ticket; finalización/entrega genera recibo y garantía de reparación.
- Los PDF se regeneran desde instantáneas inmutables y claves únicas, sin crear documentos duplicados.
- La política inicial de bienes durables se corrigió a 60 días para nuevos y usados conforme a la revisión oficial documentada en `LEGAL_REVIEW_HONDURAS.md`.
- Migración aditiva `20261111153000_iteration4_documents` aplicada a `servitechno` y `servitechno_test`, con respaldo previo.

Pendientes reales: fotografías de recepción, comprobantes de abonos posteriores, panel avanzado de reclamos/configuración, filtros visuales adicionales de rendimiento, CAI/facturación fiscal y revisión jurídica profesional final.

Última validación de Iteración 4: typecheck y build correctos; 5 pruebas unitarias y 4 pruebas e2e aprobadas.

## Iteración 5 — auditoría real y estabilización

- Se recorrieron en Google Chrome real las 13 rutas administrativas, los paneles de técnico y vendedor, descarga de PDF y menú móvil (390 × 844).
- El backend rechazó con 403 el dashboard financiero solicitado directamente por técnico y vendedor; sus menús tampoco muestran módulos financieros no autorizados.
- Se corrigió la captura prematura de pantallas en la automatización y el orden de `local:test`, que ahora prepara/migra `servitechno_test` antes de ejecutar la regresión.
- Fotografías de recepción: carga múltiple, JPEG/PNG/WebP, máximo 5 MB por archivo y 20 por orden, almacenamiento privado persistente, validación de firma binaria, acceso autenticado por alcance de reparación, fecha, responsable, historial y auditoría.
- Abonos posteriores: ventas y reparaciones aceptan abonos contra saldo, actualizan CxC, caja/banco y asiento una sola vez, conservan idempotencia y generan un `PAYMENT_RECEIPT` independiente.
- Se revisaron visualmente recibos, garantías de teléfono/computadora/reparación, ticket de recepción y comprobante de abono. Todos quedaron legibles, en una página, con identidad, importes, condiciones y firmas.
- Migración aditiva `20261111190000_repair_evidence` aplicada en `servitechno` y `servitechno_test`. Las fotos viven en el volumen separado `servitechno_evidence`; no se eliminó ni reinició el volumen de PostgreSQL.

Validación final: typecheck y build correctos; 5 pruebas unitarias, 5 pruebas e2e y auditoría de navegador sin fallos. La regresión conserva efectivo L 1,750, comisión L 270 y utilidad L 660.

Pendientes confirmados: administración UI de usuarios/roles, detalle histórico de comisiones propias, reclamos de garantía, facturación fiscal/CAI, miniaturas dentro del PDF (el ticket mantiene referencia a la orden) y revisión jurídica profesional de políticas.

## Reinicio limpio para aceptación manual

- El ERP quedó en modo `demo` y el API fue verificado contra `servitechno_demo`; `servitechno` permanece separada e intacta y `servitechno_test` queda reservada para regresiones.
- `pnpm local:reset-demo` valida base/host/modo, rechaza la base principal, solicita confirmación exacta, crea respaldo, limpia relaciones operativas y evidencias del volumen demo, vuelve a sembrar únicamente configuración/usuarios y comprueba el estado final.
- Se conservaron 4 usuarios, 3 roles, 36 permisos, 15 cuentas contables, 5 políticas de garantía, configuración empresarial, cajas, métodos de pago y categorías de gasto.
- Estado final comprobado por SQL, API y Chrome: 0 ventas, reparaciones, compras, gastos, cobros, caja, devoluciones, comisiones, asientos, documentos, evidencias, clientes y productos; dashboard y alertas en cero.
- Acceso confirmado para administrador, Técnico 1, Técnico 2 y Vendedor, sin registrar operaciones después de la limpieza.

## Administración completa de usuarios y personal

- Nueva pantalla administrativa `Usuarios y personal`: búsqueda, filtros, alta y edición de cuentas, activación, varios roles por persona y permisos efectivos individuales.
- Restablecer contraseña, desactivar una cuenta o modificar sus accesos incrementa la versión de sesión; los tokens anteriores dejan de funcionar inmediatamente.
- No existe borrado de usuarios desde la API. El backend impide desactivar o retirar el rol al último administrador activo.
- Cada técnico o vendedor queda asociado a un registro de personal con cargo, salario opcional, porcentaje, base y nota de comisión individual.
- Las reglas nuevas se aplican solamente al generar una comisión; las asignaciones confirmadas conservan su porcentaje, base e instantánea histórica.
- El administrador consulta actividad y resultados por integrante. Ventas y reparaciones se atribuyen una vez a su responsable, con ingresos, costos, margen y comisiones generadas, pagadas y pendientes.
- Técnico y vendedor comparten el mismo login, reciben navegación por permisos y solo consultan su propio rendimiento. El backend vuelve a validar estado, versión y permisos en cada solicitud.
- Migración aditiva `20261113103000_user_administration` aplicada a `servitechno_demo` y `servitechno_test`; la base principal no se modificó durante esta iteración.
- Validación: typecheck, build, 5 pruebas unitarias, 6 pruebas e2e y Google Chrome real sin fallos. Chrome recorrió las 14 rutas administrativas, creó un técnico desde la interfaz, inició sesión con esa cuenta y comprobó restricciones por rol.

## Iteración 7 — Servi Techno AI

- Núcleo conversacional integrado en NestJS/React, sin proyecto separado ni acceso arbitrario a SQL, Prisma o comandos.
- Proveedor local Ollama configurable con JSON Schema estricto, comprobación de disponibilidad y error seguro cuando falta el modelo.
- Conversaciones privadas por usuario, contexto de varios turnos, auditoría y catálogo de herramientas limitado por permisos reales.
- Consultas reales: resumen financiero, ventas, caja, inventario bajo, reparaciones pendientes y rendimiento propio/del equipo.
- Primer flujo de escritura completo: gasto con datos faltantes, resolución de catálogos, vista previa, vencimiento, confirmación/cancelación, revalidación, saldo suficiente e idempotencia persistente.
- Panel responsive permanente con tarjetas financieras, acciones rápidas funcionales y estado del modelo local.
- Normalización conversacional segura: conserva datos entre turnos del mismo gasto, no hereda importes de gastos anteriores y nunca supone caja/banco sin que el usuario lo indique.
- La migración `20261113170000_assistant_core` es aditiva. Las pruebas automatizadas se ejecutaron primero en `servitechno_test`; no se reinicializó `servitechno_demo` ni se tocó `servitechno`.
- Validación final: typecheck, build, 5 pruebas unitarias, 7 pruebas e2e y Google Chrome real. Ollama `qwen3:4b` respondió una consulta real de ventas; el gasto de prueba fue rechazado por saldo bancario insuficiente y no creó movimientos.
- En el corte de Iteración 7 quedaban pendientes compras, ventas y abonos; se completaron en Iteración 8. Continúan pendientes reparaciones, cierre diario, voz, alertas y retención administrativa del historial.

## Iteración 8 — operaciones comerciales inteligentes

- Compras conversacionales de uno o varios artículos con proveedor existente, cantidad, costo, pago/crédito, actualización de inventario, costo promedio, bancos/caja, cuenta por pagar y contabilidad.
- Ventas conversacionales con producto y stock reales, cliente cuando corresponde, IMEI/serie, precio, pago parcial, cuenta por cobrar, documentos y garantías del flujo normal.
- Abonos posteriores a ventas o reparaciones con resolución de cliente/documento, saldo, método, idempotencia y comprobante descargable.
- Corrección previa a confirmación de cantidad, costo/precio, pago y método. La propuesta anterior se cancela y la revisada requiere confirmación nueva.
- Coincidencias inexistentes o ambiguas no crean registros. Productos, clientes, proveedores y métodos deben estar respaldados por la conversación y catálogos reales.
- Migración aditiva `20261113210000_assistant_commercial_operations` aplicada primero a `servitechno_test` y después a `servitechno_demo`, con respaldo previo. `servitechno` permanece sin cambios.
- Validación: 5 pruebas unitarias, 8 E2E y Chrome real. Chrome preparó, corrigió de una a dos unidades y confirmó una compra de L 180 exclusivamente en `servitechno_test`.
- Pendiente: PDF específico de compra, reparaciones conversacionales, cierre diario, voz y alertas proactivas.

## Iteración 8.5 — proveedores de IA

- Investigación oficial: Sign in with ChatGPT no se activó porque Servi Techno es un ERP privado/comercial sin elegibilidad confirmada; no se usaron cookies, sesiones ni tokens de ChatGPT.
- Ollama `qwen3:4b` continúa como proveedor local predeterminado.
- Adaptador opcional OpenAI Responses con selección explícita, clave solo backend, `store:false`, Structured Outputs, timeout, límites locales y telemetría sin contenido.
- Sin clave no hay conexión externa. No se configuró ni inventó una credencial y no se realizó facturación.
- Pruebas del contrato OpenAI mediante transporte simulado; comparación real pendiente de autorización, clave y presupuesto del propietario.
