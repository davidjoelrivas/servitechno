# Despliegue local

## Requisitos

- Docker con Compose.
- Node.js 22, Corepack y pnpm 10.20.
- Puertos libres: `5173`, `3010` y `55432` en loopback.

El puerto 3000 está ocupado por otro proyecto en este equipo; Servi Techno usa 3010 sin interferir con él.

## Inicio seguro

Desde `/home/david/Desktop/Desarrollo/servitechno`:

```bash
pnpm local:up
```

El modo predeterminado y actualmente activo es `demo`. El comando lee `.local-mode`, construye las imágenes, aplica migraciones, ejecuta únicamente el seed de configuración/usuarios y verifica el login. Los secretos no se guardan en Git.

Bases separadas:

- `servitechno_demo`: prueba manual desde el frontend.
- `servitechno_test`: regresiones automatizadas; `pnpm local:test` puede limpiarla.
- `servitechno`: base principal, no usada por defecto ni por el reinicio demo.

Acceso:

- Frontend: http://localhost:5173
- API: http://localhost:3010/api
- Swagger: http://localhost:3010/api/docs
- Health: http://localhost:3010/api/health

Usuario: `admin@servitechno.local`. Consulte la contraseña con:

```bash
cat .local-admin-password
```

## Operación

```bash
pnpm local:check    # contenedores, HTTP, PostgreSQL y migraciones
pnpm local:logs     # logs en seguimiento
pnpm local:restart  # reinicia y vuelve a verificar
pnpm local:down     # detiene; conserva el volumen y los datos
```

## Cambiar de entorno

```bash
pnpm local:use-demo  # conecta a servitechno_demo
pnpm local:use-main  # exige escribir una confirmación exacta antes de conectar servitechno
```

`pnpm local:check` muestra y verifica la base que realmente utiliza el API. No ejecute Compose directamente: los scripts cargan las variables que aíslan base y volumen de evidencias. No utilice `down -v`.

## Reinicio limpio de demostración

```bash
pnpm local:reset-demo
```

El comando acepta únicamente `servitechno_demo`, exige escribir `RESTABLECER servitechno_demo`, crea un respaldo previo, elimina datos operativos y evidencias solo del entorno demo y valida usuarios, permisos, migraciones, APIs y dashboard en cero. Conserva configuración empresarial, cuentas, roles, permisos, políticas, categorías y métodos de pago.

## Entorno de pruebas

```bash
pnpm local:test:prepare
pnpm local:test
```

La base independiente de regresión es `servitechno_test`. Puede contener datos `[DEMO]` y nunca es la base conectada al frontend de prueba manual. La contraseña de usuarios de prueba está en `.local-test-password`.

## Modelo local del asistente

El entorno incluye un servicio Ollama limitado a `127.0.0.1:11434`. Para comprobar y descargar el modelo configurado:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d ollama
docker compose -f docker-compose.yml -f docker-compose.local.yml exec ollama ollama pull qwen3:4b
docker compose -f docker-compose.yml -f docker-compose.local.yml exec ollama ollama list
```

El modelo se conserva en el volumen `servitechno_ollama`. La descarga no contiene ni transmite datos del ERP. Las conversaciones permanecen en PostgreSQL local y el API nunca activa un proveedor externo automáticamente.

## Respaldo

```bash
pnpm local:backup
```

Crea un archivo PostgreSQL comprimido de la base activa dentro de `backups/`, sin detener el servicio.

Para verificar/restaurar sin tocar la base principal, restaure siempre primero en una base nueva:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml exec postgres createdb -U servitechno servitechno_restore_check
docker compose -f docker-compose.yml -f docker-compose.local.yml exec -T postgres pg_restore -U servitechno -d servitechno_restore_check --clean --if-exists < backups/ARCHIVO.dump
```

No restaure sobre `servitechno` sin un respaldo reciente, una ventana de mantenimiento y confirmación explícita.

## Solución rápida de problemas

```bash
pnpm local:check
docker compose -f docker-compose.yml -f docker-compose.local.yml logs --tail=200 api web postgres
```

Si cambia código o dependencias, ejecute nuevamente `pnpm local:up`; Compose reconstruirá las imágenes necesarias sin borrar datos.
