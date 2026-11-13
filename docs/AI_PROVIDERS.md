# Proveedores de IA de Servi Techno

## Decisión de elegibilidad

La documentación oficial distingue entre identidad y uso del plan de ChatGPT. El uso del plan mediante **Sign in with ChatGPT** está disponible para proyectos open source/locales elegibles y determinados clientes privados; el acceso comercial general continúa limitado a socios seleccionados o a un proceso de interés. Servi Techno ERP es una aplicación empresarial privada y no tiene una aprobación o elegibilidad confirmada.

Por esa razón no se implementó OAuth de ChatGPT, no se reutilizaron cookies, sesiones, tokens de escritorio ni credenciales de la suscripción. Tampoco se realizó una prueba de inferencia con el plan ChatGPT.

Fuentes oficiales:

- [Sign in with ChatGPT: quickstart](https://developers.openai.com/siwc/quickstart)
- [Uso del plan en aplicaciones open source/locales](https://developers.openai.com/siwc/token-sharing-open-source)
- [Limitaciones de la versión preliminar](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Solicitud de client ID para integraciones comerciales](https://developers.openai.com/siwc/request-client-id)

## Proveedores implementados

### Ollama

Es el proveedor predeterminado y permanece completamente local:

```env
ASSISTANT_PROVIDER="ollama"
OLLAMA_BASE_URL="http://ollama:11434"
OLLAMA_MODEL="qwen3:4b"
```

### OpenAI API

Es una alternativa opcional mediante la API oficial Responses. Está desactivada mientras no se seleccione explícitamente y no exista una clave válida.

```env
ASSISTANT_PROVIDER="openai"
OPENAI_API_KEY="coloque-aqui-una-clave-de-proyecto"
OPENAI_MODEL="gpt-6-luna"
OPENAI_TIMEOUT_MS="60000"
OPENAI_MAX_REQUESTS_PER_MINUTE="20"
OPENAI_MAX_INPUT_CHARS="24000"
```

Después de editar `.env`:

```bash
pnpm local:restart
pnpm local:check
```

Para regresar al procesamiento local, cambie únicamente `ASSISTANT_PROVIDER="ollama"` y reinicie. No existe conmutación automática: una falla externa produce un error seguro y nunca cambia silenciosamente de proveedor.

La clave solamente llega al contenedor backend. No debe escribirse en React, mensajes, base de datos, archivos versionados ni capturas. Para una aplicación conviene una clave de proyecto perteneciente a una cuenta de servicio; la documentación oficial indica mantenerla en servidor y fuera de código, navegador y logs: [API keys and service accounts](https://developers.openai.com/api/docs/guides/api-keys).

## Contrato de OpenAI

El adaptador usa:

- `POST https://api.openai.com/v1/responses`.
- `store: false`.
- Structured Outputs con el mismo JSON Schema utilizado por Ollama.
- Timeout y límites locales de solicitudes/tamaño.
- Registro de modelo, latencia y tokens, sin prompt, respuesta ni clave.
- Las mismas validaciones de NestJS, permisos, propuestas y confirmaciones.

Structured Outputs asegura la forma del JSON, pero las reglas financieras continúan verificándose en el backend: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). La API no usa datos para entrenamiento salvo adhesión voluntaria, aunque por defecto pueden existir registros de control de abuso de hasta 30 días: [controles de datos](https://developers.openai.com/api/docs/guides/your-data).

## Costos y límites

La suscripción ChatGPT no activa automáticamente la facturación de API. Sin una elegibilidad expresa para plan usage, OpenAI API requiere una organización/proyecto API con facturación o créditos propios.

El modelo predeterminado opcional es `gpt-6-luna` por ser la alternativa enfocada en volumen y costo. La tarifa oficial vigente debe comprobarse antes de activarlo; la página consultada publica precios por millón de tokens y puede cambiar: [modelos](https://developers.openai.com/api/docs/models) y [precios](https://developers.openai.com/api/docs/pricing).

Además de los límites locales, configure un **hard spend limit** para el proyecto en la consola de OpenAI. Los límites duros devuelven HTTP 429 al alcanzarse, aunque la aplicación debe aceptar un pequeño exceso por propagación: [spend limits](https://developers.openai.com/api/docs/guides/spend-limits). Los límites de solicitudes/tokens dependen del modelo, proyecto y nivel: [rate limits](https://developers.openai.com/api/docs/guides/rate-limits).

## Estado de pruebas y comparación

- Ollama `qwen3:4b`: disponible y probado con consultas, compras, ventas y correcciones reales en la base de pruebas.
- OpenAI API: contrato, seguridad y errores probados con transporte simulado; no se ejecutó inferencia real porque no existe una clave/autorización suministrada.
- Sign in with ChatGPT: descartado por ahora al no existir elegibilidad comercial confirmada.

No es válido declarar una comparación de calidad, latencia o consumo entre modelos hasta que el propietario configure conscientemente una clave API y presupuesto. Cuando eso ocurra, la evaluación debe utilizar exclusivamente casos sintéticos y medir acierto estructurado, preguntas faltantes, ambigüedad, latencia y tokens.
