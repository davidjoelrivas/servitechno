# Pruebas de aceptación del propietario

Use datos ficticios y, de ser posible, la base de demostración. No registre información real hasta completar este checklist.

## Preparación

1. Ejecute `pnpm local:up` y confirme con `pnpm local:check` que aparece `Modo activo: demo | Base del API verificada: servitechno_demo`.
2. Si desea borrar y comenzar otra vez, ejecute `pnpm local:reset-demo` y escriba la confirmación solicitada.
3. Abra `http://localhost:5173`.
4. Ingrese como administrador con la contraseña guardada en `.local-admin-password`.
5. Los perfiles de Técnico 1, Técnico 2 y Vendedor usan la contraseña local guardada en `.local-test-password`.

## Usuarios y personal

- [ ] Como administrador, abrir `Usuarios y personal`, pulsar `Nuevo usuario` y crear una cuenta con uno o varios roles.
- [ ] Confirmar que el nuevo usuario puede iniciar sesión desde la pantalla común y solo ve las opciones autorizadas.
- [ ] Editar porcentaje/base de comisión y comprobar que no cambian comisiones históricas ya generadas.
- [ ] Restablecer la contraseña y comprobar que la sesión anterior queda revocada.
- [ ] Desactivar la cuenta y comprobar que no puede iniciar sesión ni continuar usando una sesión abierta.
- [ ] Seleccionar un integrante y revisar actividad, ventas, reparaciones, ingresos, costos, margen y saldo de comisión.

## Checklist ADMIN

- [ ] Abrir Inicio y confirmar que aparecen ventas, cobros, utilidad, caja, banco, CxC, CxP y alertas.
- [ ] Crear cliente y tres productos ficticios: teléfono, accesorio y computadora con existencia.
- [ ] Registrar una venta mixta con IMEI/serie y pago parcial. Resultado: un recibo, dos garantías individuales y saldo pendiente.
- [ ] En Ventas, registrar el saldo como abono. Resultado: saldo actualizado y un nuevo “Comprobante de abono” descargable en Documentos.
- [ ] Recibir un teléfono, describir pantalla/carcasa/puerto/humedad y adjuntar dos fotos. Resultado: miniaturas con fecha y responsable, solo visibles con sesión autorizada.
- [ ] Completar la reparación con mano de obra y repuesto manual. Resultado: costo, margen, comisión, recibo y garantía coherentes.
- [ ] Dejar saldo en la reparación y registrar luego un abono. Resultado: CxC menor y comprobante independiente sin duplicar ingreso.
- [ ] Abrir Documentos y descargar ticket, recibos y garantías. Resultado: PDF de una página, textos completos, vencimiento, importes y líneas de firma.
- [ ] Reducir el navegador a ancho de teléfono y abrir el menú. Resultado: navegación usable, sin desbordamiento horizontal crítico.

## Checklist TÉCNICO

- [ ] Entrar con `demo.tech1@servitechno.local` y abrir Mis resultados.
- [ ] Confirmar que solo ve reparaciones asignadas, sus documentos y sus resultados.
- [ ] Abrir una reparación asignada, consultar evidencia y registrar trabajo/repuesto permitido.
- [ ] Intentar abrir `http://localhost:3010/api/dashboard` con su token mediante una herramienta API. Resultado esperado: HTTP 403.

## Checklist VENDEDOR

- [ ] Entrar con `demo.seller@servitechno.local`.
- [ ] Registrar cliente, venta y cobro; descargar el recibo propio.
- [ ] Confirmar acceso a caja solo mediante las opciones visibles y ausencia de dashboard financiero/comisiones globales.
- [ ] Confirmar que no puede consultar ventas, reparaciones o documentos de otro responsable por URL/API.

## Cierre de jornada ficticia

- [ ] Abrir caja, registrar una venta en efectivo, un cobro bancario, un gasto y cerrar caja.
- [ ] Comparar efectivo contado con efectivo esperado y revisar banco, CxC, utilidad y comisión.
- [ ] Ejecute `pnpm local:test` antes de iniciar la jornada manual o después de terminarla: usa exclusivamente `servitechno_test` y no modifica `servitechno_demo`.

## Cómo reportar un error

Anote: perfil usado, hora, pantalla, pasos exactos, dato ficticio ingresado, resultado esperado, resultado observado y una captura. Adjunte además la salida de `pnpm local:check` y, si aplica, las últimas líneas de `pnpm local:logs`. No comparta `.env`, `.local-admin-password`, `.local-test-password` ni tokens.
