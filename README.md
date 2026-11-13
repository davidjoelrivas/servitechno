# Servi Techno ERP

Versión funcional local del ERP para ventas, devoluciones, reparaciones, inventario, compras, proveedores, caja, gastos, comisiones, documentos PDF, garantías, rendimiento y contabilidad de Servi Techno. Es un monorepo `pnpm` con NestJS, Prisma/PostgreSQL y React/Vite.

## Requisitos

- Node.js 22+
- Corepack
- Docker con Compose

## Instalación desde cero

```bash
corepack enable
corepack prepare pnpm@10.20.0 --activate
pnpm install
cp .env.example .env
```

Edite `.env` y configure obligatoriamente:

- `JWT_SECRET`: valor aleatorio de al menos 32 caracteres.
- `ADMIN_PASSWORD`: contraseña inicial de al menos 12 caracteres. No se incluye ninguna contraseña predeterminada.

Después ejecute:

```bash
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Aplicación: http://localhost:5173
- API: http://localhost:3010/api
- Swagger: http://localhost:3010/api/docs

El usuario inicial es el valor de `ADMIN_EMAIL` (por defecto `admin@servitechno.local`) y la contraseña es la que usted definió en `ADMIN_PASSWORD` antes del seed.

## Ejecución local recomendada

```bash
pnpm local:up
```

Este comando genera `.env` y credenciales locales si faltan, compila API/web en contenedores, aplica migraciones, ejecuta el seed y verifica el login. Debido a que otro proyecto ocupa el puerto 3000 en este equipo, la API local usa `3010`.

- Frontend: http://localhost:5173
- API: http://localhost:3010/api
- Swagger: http://localhost:3010/api/docs
- Contraseña generada: `.local-admin-password`

Consulte [docs/LOCAL_DEPLOYMENT.md](docs/LOCAL_DEPLOYMENT.md) para operación, pruebas y respaldos.

## Comandos

```bash
pnpm dev          # API y web en modo desarrollo
pnpm build        # compilación de producción
pnpm typecheck    # comprobación TypeScript
pnpm test         # pruebas unitarias
pnpm db:migrate   # crea/aplica migraciones de desarrollo
pnpm db:seed      # catálogo base y administrador
pnpm local:check  # salud, rutas y migraciones
pnpm local:down   # detiene servicios sin borrar PostgreSQL
pnpm local:logs   # logs de PostgreSQL, API y web
```

La prueba integral usa una base separada llamada `servitechno_test`; vea [docs/TESTING.md](docs/TESTING.md).

## Alcance real de esta versión

Funcionan de extremo a extremo: autenticación JWT, permisos backend, clientes, inventario, caja, ventas y pagos mixtos, devoluciones/anulaciones, proveedores, compras y cuentas por pagar, reparaciones con costos flexibles, gastos, comisiones, recibos/garantías PDF, tickets de recepción, rendimiento individual, asientos automáticos y dashboard contable.

Consulte [docs/PROGRESS.md](docs/PROGRESS.md) para distinguir lo terminado de lo pendiente.

