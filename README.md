# Pinta Print Agent

Agent local de impresión para la cocina de Pinta. Esta foundation **Node.js + TypeScript** recibe trabajos por HTTPS long polling, preserva el estado localmente en SQLite y por ahora sólo imprime a `MockPrinter`. No incluye USB, ESC/POS, búsqueda de impresoras, servicio de Windows ni interfaz gráfica.

## Arquitectura

```text
pedidos-pinta --HTTPS long polling--> Pinta Print Agent --SQLite local--> MockPrinter
```

El agente usa exclusivamente el contrato congelado: `GET /api/print-agent/health`, `GET /api/print-agent/jobs/next?wait=25` y `POST /api/print-agent/jobs/{job_id}/ack`. No accede a PostgreSQL ni modifica el backend.

## Requisitos y comandos

Node.js 24 o superior (se usa `node:sqlite`, incluido con Node y sin un módulo nativo adicional):

```powershell
npm install
Copy-Item config.example.json config.json
# editar config.json
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

`config.json` nunca se versiona. Para desarrollo o tests, `PINTA_PRINT_AGENT_CONFIG=C:\ruta\config.json` permite seleccionar otra configuración.

```json
{
  "server_url": "https://example.com",
  "agent_token": "PASTE_TOKEN_HERE",
  "printer": { "driver": "mock" },
  "location_id": "pinta-main",
  "data_dir": "",
  "long_poll_wait_seconds": 25,
  "request_timeout_seconds": 40
}
```

Si `data_dir` está vacío, el default de Windows es `%LOCALAPPDATA%\PintaPrintAgent`. Allí se crea `agent.sqlite` y `mock-output\<pedido>_<job_id>.txt`; los nombres no se sobrescriben y reciben un sufijo si ya existen.

## Estado durable y deduplicación

SQLite es la fuente de verdad local, con la tabla `jobs`:

```text
job_id (PK), payload_hash, status, first_seen_at, print_started_at,
printed_at, acked_at, last_claim_token, last_error, updated_at
```

Estados: `RECEIVED → PRINTING → PRINTED → ACKED`. Un error antes de éxito físico produce `FAILED`; un `PRINTING` encontrado al arrancar pasa a `AMBIGUOUS` con `PRINT_STATE_AMBIGUOUS`, y nunca se reimprime automáticamente.

El hash es SHA-256 del JSON canónico (claves ordenadas) de `{ schema_version, order }`; excluye `claim_token`. Un mismo `job_id` con hash distinto se detiene como `PAYLOAD_MISMATCH`. Antes de imprimir se exige `schema_version === 1` y `total_medallions = sum(cheese_counts) + no_cheese_count`; de otro modo no se imprime.

Después de una impresión exitosa el orden es deliberadamente:

```text
MockPrinter.print → SQLite PRINTED + COMMIT → ACK printed
```

Si el ACK se pierde, el job queda `PRINTED`. Cuando el backend lo entrega con un nuevo claim token, el agente no vuelve a llamar la impresora: actualiza el claim y reintenta sólo el ACK. Un ACK `409` mantiene `PRINTED`; `FAILED`, en cambio, sí puede volver a imprimirse si se reclama otra vez.

## Ticket de cocina

`renderKitchenTicket` es independiente del driver. Incluye pedido, hora, ítems, variante, cambios y resumen; renderiza dinámicamente todos los quesos con conteo mayor a cero y `SIN QUESO` sólo cuando corresponde. No muestra cliente, teléfono, dirección, precios, pagos ni datos monetarios, incluso si el payload los contiene.

Ejemplo:

```text
          PEDIDO #146
             22:11

1x BURGER PINTA
   SIMPLE
   - SIN CEBOLLA
   + MEDALLÓN EXTRA
   ADEREZOS: MAYONESA / KETCHUP

MEDALLONES: 13
CHEDDAR: 5
MOZZARELLA: 3
ROQUEFORT: 2
PROVOLONE: 1
SIN QUESO: 2
```

## Red, health y apagado

El health check se realiza una vez al iniciar. `401` (token inválido) y `403` (agente deshabilitado) detienen el loop de forma clara; no reintentan credenciales inválidas. El long poll usa `wait=25` y un timeout configurable de 40 s. `204` abre inmediatamente otro long poll. Errores de red, timeout o 5xx aplican backoff con jitter de 1, 2, 4… hasta 30 s y se reinician tras comunicación correcta. Ningún log contiene token o header Authorization.

`SIGINT`/`SIGTERM` detienen nuevos polls, abortan el fetch pendiente y cierran SQLite tras el loop. Una impresión ya comenzada conserva su transición durable normal.

Esta deduplicación cubre sólo una PC: operar dos agentes para la misma `location_id` no comparte SQLite y no está soportado en esta etapa.

## Pruebas

`npm test` ejecuta un backend falso aislado y casos de configuración, privacidad de logs y ticket, SQLite, deduplicación, fallo de impresora, reclaim, `409`, restart, `AMBIGUOUS`, validación y MockPrinter. El caso determinístico crítico simula ACK A perdido y reclaim B: termina con `MockPrinter.calls === 1` y `ACKED` usando B.

Para integrar el backend de `pedidos-pinta` sólo falta verificar el contrato congelado real contra este cliente. Para la etapa posterior, agregar un driver USB/ESC-POS separado sin mezclarlo con la ledger ni el cliente HTTP.
