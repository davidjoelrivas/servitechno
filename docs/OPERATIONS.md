# Flujos de operación

## Jornada

1. Un usuario con permiso abre la caja y registra el fondo inicial.
2. Las ventas en efectivo crean movimientos `SALE_COLLECTION`; otros métodos llegan a banco.
3. Los gastos en efectivo crean movimientos `EXPENSE`.
4. Al cerrar, el sistema calcula fondo + entradas de efectivo − salidas, solicita el conteo y conserva la diferencia y justificación.

## Venta

La interfaz admite varios productos y pagos. El backend bloquea inventario insuficiente, importes no positivos, sobrepago, productos repetidos y crédito sin cliente. Los descuentos se distribuyen por línea para conservar una base exacta de devolución.

## Devolución o anulación

Una devolución puede ser parcial. Una anulación exige revertir todo el saldo restante. Se registra un documento independiente, se ajusta el ingreso, se reduce la cuenta por cobrar antes de reembolsar y solo se devuelve stock cuando el artículo es apto. Los reembolsos en efectivo exigen caja abierta.

## Compra

Una compra recibe varios productos, recalcula el costo promedio móvil, registra pagos iniciales y conserva el saldo por pagar. Los abonos posteriores disminuyen `2101` sin duplicar inventario ni el asiento de compra.

## Comisión

La comisión se reconoce al completar la reparación. Aprobarla no mueve efectivo. Cada pago disminuye la obligación `2102`; puede ser parcial y una clave idempotente impide repetirlo. La pantalla permite exportar el historial a CSV.

## Reparación

Se recibe equipo con cliente, falla y técnico opcional. Cada cambio crea `RepairEvent`. Al completar: consume repuestos, congela sus costos, registra cobros/saldo, devenga ingreso, contabiliza costos y crea la comisión aprobada cuando corresponde.

## Formatos locales

La interfaz usa español, moneda HNL y zona horaria `America/Tegucigalpa`. Moneda, nombre y zona horaria existen en `BusinessSetting` para una configuración futura desde UI.

