# API, roles y permisos

Swagger se expone en `/api/docs`. Todas las rutas salvo login y health requieren `Authorization: Bearer <token>`.

## Endpoints principales

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET|POST /api/customers`
- `GET|POST /api/products`
- `GET /api/cash-registers`, `GET /api/cash/current`
- `POST /api/cash/open`, `POST /api/cash/:id/close`
- `GET|POST /api/sales`
- `GET|POST /api/repairs`, `PATCH /api/repairs/:id`, `POST /api/repairs/:id/complete`
- `GET|POST /api/expenses`
- `GET /api/returns`, `POST /api/returns/sales/:saleId`
- `GET|POST /api/suppliers`, `PATCH /api/suppliers/:id`
- `GET|POST /api/purchases`, `POST /api/purchases/:id/payments`
- `GET /api/commissions`, `POST /api/commissions/:id/approve`, `POST /api/commissions/:id/payments`
- `GET /api/dashboard`
- `GET /api/payment-methods`, `/api/employees`, `/api/expense-categories`, `/api/settings`

## Roles iniciales

- `ADMIN`: todos los permisos.
- `SELLER`: clientes, inventario de consulta, caja, ventas, recepción de reparaciones y gastos operativos.
- `TECHNICIAN`: inventario de consulta y consulta/actualización/finalización de reparaciones.

La navegación oculta opciones no autorizadas, pero la seguridad definitiva está en los guards del backend. Se añadieron permisos específicos `returns.*`, `suppliers.*`, `purchases.*` y `commissions.read|approve|pay`.

