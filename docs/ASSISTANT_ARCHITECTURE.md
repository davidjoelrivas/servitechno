# Servi Techno AI — arquitectura

## Alcance implementado

Servi Techno AI es un módulo interno del API NestJS y de la interfaz React. No es un proceso con acceso directo a PostgreSQL ni un segundo motor contable. El modelo local interpreta el mensaje y devuelve una intención estructurada; el backend decide si el usuario puede utilizar la herramienta y delega la consulta o escritura a los servicios existentes.

Flujo:

```text
React → AssistantController → AssistantService → IntentResolver → LlmProvider (Ollama)
                                      ↓
                    ToolRegistry / ConfirmationService
                                      ↓
             OperationsService / PerformanceService / Prisma de lectura
```

## Proveedor local

La configuración predeterminada es:

```env
ASSISTANT_PROVIDER="ollama"
OLLAMA_BASE_URL="http://ollama:11434"
OLLAMA_MODEL="qwen3:4b"
ASSISTANT_TIMEOUT_MS="90000"
ASSISTANT_PROPOSAL_TTL_MINUTES="15"
```

Docker Compose mantiene Ollama en `127.0.0.1:11434` y el volumen `servitechno_ollama`. El modelo recomendado ocupa aproximadamente 2.5 GB. Ningún mensaje se envía a un proveedor externo. Si Ollama o el modelo no están disponibles, `/api/assistant/status` lo informa y la interfaz deshabilita el envío; el resto del ERP continúa operativo.

El adaptador usa `POST /api/chat`, `stream: false`, temperatura cero y un JSON Schema estricto. La respuesta vuelve a validarse en el API antes de usarla. `IntentResolver` conserva únicamente el hilo del gasto actual y exige evidencia escrita para importe, concepto y método de pago; un método inferido solo por el modelo se descarta. El modelo no recibe credenciales ni acceso a SQL, Prisma, archivos, comandos o red arbitraria.

`ConfiguredLlmProvider` selecciona explícitamente `ollama` u `openai`. OpenAI API utiliza Responses, `store:false` y el mismo contrato estructurado, pero permanece inactiva sin selección y clave backend. No existe fallback automático ni aumento de privilegios por cambiar de modelo. La investigación y configuración están en `docs/AI_PROVIDERS.md`.

## Herramientas autorizadas

| Intención | Servicio | Permiso efectivo |
| --- | --- | --- |
| Resumen financiero | `OperationsService.dashboard` | `reports.financial.read` |
| Ventas del período | Dashboard o rendimiento propio | Financiero o `performance.self.read` |
| Caja actual | `OperationsService.currentCash` | `cash.read` |
| Inventario bajo | Productos activos | `inventory.read` |
| Reparaciones pendientes | `OperationsService.listRepairs` con alcance por usuario | `repairs.read` |
| Rendimiento propio | `PerformanceService.mine` | `performance.self.read` |
| Rendimiento del equipo | `PerformanceService.team` | `reports.team.read` |
| Preparar/registrar gasto | `OperationsService.createExpense` | `expenses.create` |
| Preparar/registrar compra | `ProcurementService.createPurchase` | `purchases.create` |
| Preparar/registrar venta | `OperationsService.createSale` | `sales.create` |
| Preparar/registrar abono | `OperationsService.paySale/payRepair` | `sales.create` / `repairs.create` |

El backend toma roles, permisos, estado y versión de sesión del JWT validado. El texto «soy administrador» no cambia el alcance.

## Confirmaciones

Un gasto sigue este flujo:

1. El modelo propone importe, concepto, categoría y medio de pago; el backend contrasta los datos sensibles con la conversación.
2. El backend resuelve categoría y método contra catálogos reales.
3. Se comprueba permiso, caja abierta y saldo suficiente de caja o banco.
4. Se crea `AssistantProposal` con propietario, payload validado, resumen, vencimiento, versión de sesión e idempotencia.
5. React muestra una tarjeta separada con impacto y botones Confirmar/Cancelar.
6. Confirmar vuelve a validar usuario, versión de sesión, permiso, catálogos, caja y saldo.
7. `OperationsService.createExpense` ejecuta la transacción financiera normal.
8. `Expense.assistantProposalId` es único; confirmar repetidamente no duplica el gasto.
9. Se guarda resultado, mensaje y `AuditLog`.

Cambios de rol, contraseña, activación o permisos invalidan la propuesta preparada. Las propuestas vencen después de 15 minutos por defecto.

Las propuestas comerciales resuelven productos, clientes y proveedores contra catálogos reales. Una coincidencia inexistente o ambigua produce una pregunta y no una propuesta. Compras revalidan fondos; ventas revalidan stock, cliente e IMEI/serie; abonos revalidan documento y saldo. `Sale`, `Purchase`, `Payment` y `Expense` guardan un `assistantProposalId` único para impedir duplicados incluso si se repite la confirmación.

Las correcciones explícitas crean una propuesta sustitutiva y cancelan la anterior. Cantidades, costos/precios, pago inicial y método pueden revisarse antes de confirmar; una operación ya ejecutada nunca se modifica mediante este mecanismo.

## Persistencia y privacidad

- `AssistantConversation`: pertenece a un solo usuario.
- `AssistantMessage`: conserva el texto y metadatos mínimos del resultado.
- `AssistantProposal`: conserva la operación estructurada y su estado.
- `AuditLog`: registra resolución, preparación, cancelación y ejecución sin contraseñas ni tokens.
- Las consultas filtran siempre por el usuario autenticado.

El historial no debe usarse para guardar contraseñas, tokens o secretos. La retención configurable y herramientas administrativas de archivo serán una etapa posterior.

## Límites actuales

Etapa A y los cuatro flujos de Etapa B están implementados: gastos, compras, ventas y abonos. Las ventas generan recibos/garantías normales y los abonos su comprobante descargable. El módulo de compras actual no emite PDF, por lo que el asistente devuelve número y referencia de compra sin afirmar que existe un comprobante PDF.

Reparaciones conversacionales, cierre de caja, voz, alertas y proveedores externos permanecen deshabilitados hasta implementar sus validaciones y pruebas. La interfaz no muestra botones decorativos para esas acciones.

