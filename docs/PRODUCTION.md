# Producción y seguridad

- Use secretos generados fuera del repositorio, PostgreSQL administrado o con respaldo y TLS en el proxy inverso.
- Ejecute `prisma migrate deploy`, nunca `migrate dev`, en producción.
- No publique PostgreSQL; el Compose local lo enlaza solo a `127.0.0.1`.
- Configure CORS con el dominio real en `WEB_ORIGIN`.
- Sirva `apps/web/dist` desde un servidor estático y `apps/api/dist/main.js` con un supervisor.
- Realice copias de seguridad, pruebas de restauración, rotación de secretos y retención de auditoría.
- Antes de facturación oficial deben confirmarse requisitos fiscales hondureños; los comprobantes actuales no se presentan como factura fiscal.

El login está limitado a cinco intentos por minuto por instancia. Pendientes de endurecimiento antes de producción pública: rate limiting distribuido, refresh tokens/rotación de sesión, carga segura de evidencias, política de retención, recuperación de contraseña y pruebas de penetración.

