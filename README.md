# Pinta Print Agent

Aplicación local de Windows para recibir comandas de cocina del backend Pinta por HTTPS y enviarlas a una impresora térmica de 80 mm. Esta primera etapa funciona íntegramente sin backend ni impresora: usa `MockApiClient`, `MockPrinter` y SQLite.

No accede a PostgreSQL, no contiene pagos/stock, no implementa USB físico, WebSockets, instalador ni servicio de Windows.

## Arquitectura

`Backend Pinta (HTTPS) -> HttpApiClient -> AgentWorker -> Renderer -> Printer`.

El worker síncrono vive en un `threading.Thread`; la bandeja del sistema (`pystray`) queda independiente. `PrintJob` se valida con dataclasses y su schema es `1`. El renderer textual genera únicamente comanda de cocina ASCII a 42 caracteres: encabezado `#numero`/hora, productos, quitados, extras, aderezos y resumen de medallones/quesos. Ninguna línea supera el ancho configurado.

`EscPosReceiptRenderer` genera comandos estándar INIT, alineación, negrita, tamaño, feed y cut. `EscPosPrinter` no toca hardware y responde `NOT_CONFIGURED`/`PrinterNotConfiguredError` hasta que exista un perfil físico.

## Quick start - sin backend ni impresora

Requiere Python **3.12** (el proyecto declara `>=3.12,<3.13`).

```powershell
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
python run.py --test-print
python run.py --demo-flow
python run.py --demo-ack-loss
pytest
```

Opcionalmente `--runtime-dir C:\ruta\temporal` aísla los datos de desarrollo. `python run.py --no-tray` arranca el agente sin UI. `python run.py` inicia worker y tray.

## Configuración y runtime

El repositorio sólo incluye [config.example.json](config/config.example.json). Copiarlo a `%LOCALAPPDATA%\PintaPrintAgent\config.json` y completar el token antes de usar backend real. En entornos sin `LOCALAPPDATA`, se usa `~/.local/PintaPrintAgent`.

El runtime contiene:

```text
%LOCALAPPDATA%\PintaPrintAgent\
  config.json              # nunca versionado
  data\agent.db            # SQLite WAL
  logs\pinta-print-agent.log (2 MB, 5 backups)
  mock_output\             # comandas .txt
```

La configuración valida URL HTTP(S), timeouts positivos, modo `mock|escpos`, ancho, location/agent name y nivel de log. El token nunca se registra: los logs sólo indican `configured` o `not configured`.

## Contrato HTTP

`HttpApiClient` usa `httpx.Client` síncrono, `Authorization: Bearer <token>`, `User-Agent: PintaPrintAgent/0.1.0`, `Accept: application/json`, y timeouts configurables.

- `GET /api/print-agent/health`: exige `status=ok`, `schema_version=1` y el `location_id` local.
- `GET /api/print-agent/jobs/next`: `204` significa cola vacía; `200` contiene `PrintJob`.
- `POST /api/print-agent/jobs/{job_id}/ack`: envía `printed` o `failed`; cualquier 2xx es éxito.

401/403 espera 30 s (`AUTH_ERROR`); 404/schema inválido es `PROTOCOL_ERROR`; 429, 5xx, timeouts y errores de red usan backoff 2, 4, 8, 16, 30 s. Un ACK 409 se registra como stale claim y no causa reimpresión. El método se llama `wait_for_print_job()` para sustituir polling por long polling después; hoy, un 204 espera `idle_delay_seconds`.

## Dedupe y resiliencia

La tabla SQLite es:

```sql
printed_jobs(job_id TEXT PRIMARY KEY, payload_sha256 TEXT NOT NULL,
 printed_at TEXT NOT NULL, acked_at TEXT NULL,
 last_claim_token TEXT NULL, last_ack_error TEXT NULL)
```

`payload_sha256` es SHA-256 del JSON canónico, ordenado y compacto de `{schema_version, order}`, excluyendo `claim_token`. Después de que la impresora informa éxito, el job se persiste antes del ACK. Si el mismo `job_id`/hash vuelve con otro claim, no imprime otra vez: usa el claim actual para ACK. Si el hash cambia, se detiene con error crítico sin sobrescribir ni imprimir. Existe una ventana física residual entre que la impresora termina y SQLite confirma; se resolverá sólo al integrar hardware.

`MockPrinter` escribe `order_<numero>_<job_id corto>.txt` exactamente con `TextReceiptRenderer`. Puede configurarse para fallar; entonces no se guarda en SQLite y se intenta ACK `failed` con `PRINTER_OFFLINE`.

`--demo-flow` ejecuta job #146 completo con Mock API/Printer/SQLite. `--demo-ack-loss` fuerza una pérdida de red en el primer ACK y vuelve a entregar el mismo job con claim nuevo; termina con exactamente **una** impresión mock y un ACK con el claim nuevo. Borre el runtime de desarrollo o use `--runtime-dir` nuevo si desea repetir demos desde cero.

## Pruebas

`pytest` no requiere Internet, Docker, backend ni impresora. Cubre validación de config/modelos, renderer/ancho ASCII, MockPrinter, SQLite/dedupe, HTTP con `httpx.MockTransport`, ACK conflict, ACK perdido y fallo de impresora. También ejecutar:

```powershell
python -m compileall src
```

## Pendiente exclusivamente para producción física

Agregar configuración de dispositivo y perfil de impresora, transporte USB/spooler/driver y pruebas con el modelo real; después ajustar el renderer ESC/POS. El backend deberá mantener `jobs/next` abierto 20–30 segundos para activar long polling real y reducir el polling provisional.
