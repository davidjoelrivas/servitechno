# Reglas financieras y comisiones

## Fuentes de verdad

- Una venta confirmada guarda precio y costo unitario histórico, reduce inventario, registra el cobro y crea el asiento en una sola transacción.
- Una reparación se devenga una sola vez al completarse. Reintentar la finalización es rechazado.
- El fondo inicial de caja solo participa en la conciliación física; no genera ingreso contable.
- Transferencias bancarias no se agregan al efectivo físico.
- Un gasto en efectivo exige caja abierta y genera salida de caja.
- Las compras de inventario no se modelan como gasto operativo.
- Los registros confirmados no se borran desde la API. Las devoluciones y anulaciones generan documentos y asientos separados.
- Una devolución reduce primero la cuenta por cobrar; el excedente se reembolsa o queda como saldo a favor del cliente.
- El inventario solo se restituye cuando el usuario confirma que el artículo regresó en condiciones válidas.
- Una compra carga inventario y acredita caja/banco o cuentas por pagar; nunca se registra automáticamente como gasto.
- El costo promedio se recalcula al recibir mercancía usando el valor previo y el costo de la nueva entrada.

## Partida doble

Cada asiento se valida antes de guardarse: total débito = total crédito. La combinación `referenceType + referenceId` es única, lo que evita contabilizar dos veces una operación.

Cuentas iniciales relevantes: caja `1101`, bancos `1102`, cuentas por cobrar `1103`, inventario `1104`, comisiones por pagar `2102`, ventas `4101`, reparaciones `4102`, costos `5101/5102` y gastos/comisiones `6101/6102`.

## Comisión implementada

La finalización de una reparación puede calcular una comisión sobre margen de contribución:

`base = precio final sin impuesto - costo de repuestos`

`comisión = base × porcentaje / 100`

Se guarda `ruleSnapshot`, base, porcentaje e importe. Un cambio posterior no modifica la asignación histórica. Los pagos parciales reducen la cuenta `2102` y se protegen con bloqueo de fila e idempotencia. Los ajustes manuales y comisiones originadas por ventas siguen pendientes.

## Escenario de aceptación

La prueba automatizada valida: ingresos L 1,600; efectivo cobrado L 400; transferencia L 1,200; cierre esperado L 1,750; costos L 520; gasto L 150; margen de reparación L 900; comisión L 270; utilidad final L 660.

