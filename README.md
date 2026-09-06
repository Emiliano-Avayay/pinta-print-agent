# Pinta Print Agent

Agent local de impresión para la cocina de Pinta. El runtime activo es **Node.js + TypeScript**: recibe trabajos por HTTPS long polling, conserva el estado localmente en SQLite y separa el ticket de cocina de los drivers de impresión.

Esta etapa agrega una foundation ESC/POS independiente del hardware y dos transportes físicos Windows configurables: RAW por spooler para USB y serial virtual para Bluetooth SPP. No hay autodetección ni fallback automático.

## Arquitectura

```text
pedidos-pinta --HTTPS--> PrintWorker --SQLite local--> ACK
                           |
                           v
                  renderKitchenTicket
                           |
                           v
                    RenderedTicket
                           |
                           v
                        Printer
                     /             \
            MockPrinter          EscPosPrinter
                                      |
                                      v
                                EscPosEncoder
                                      |
                                 Uint8Array
                                      |
                                      v
                               PrinterTransport
                                      |
                                      v
                 FakeTransport / WindowsRawPrinterTransport / BluetoothSerialTransport
```

Las responsabilidades permanecen separadas:

- `PrintWorker` maneja durabilidad, deduplicación y ACK; no contiene comandos ESC/POS.
- `renderKitchenTicket` decide el contenido, los estilos semánticos y el layout por columnas.
- `EscPosEncoder` convierte un `RenderedTicket` a bytes; no conoce USB ni Windows.
- `PrinterTransport` sólo expone `open`, `write` y `close`.
- `WindowsRawPrinterTransport` encapsula el spooler de Windows y entrega los bytes como un documento `RAW`.
- `BluetoothSerialTransport` encapsula un puerto serial virtual Bluetooth SPP y espera el `drain` antes de terminar la escritura.
- `FakeTransport` captura bytes en memoria para desarrollo y tests.
- `MockPrinter` sigue disponible y guarda el texto plano como antes.

El árbol Python bajo `src/pinta_print_agent/` es una implementación heredada y no forma parte del runtime ni de la validación npm de esta foundation.

El agente usa exclusivamente el contrato congelado del backend: `GET /api/print-agent/health`, `GET /api/print-agent/jobs/next?wait=25` y `POST /api/print-agent/jobs/{job_id}/ack`. No accede a PostgreSQL ni modifica `pedidos-pinta`.

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
npm run escpos:demo
npm start
```

`npm run typecheck` valida `src`, `scripts` y `tests`; `npm run build` compila únicamente el runtime de `src`.

## Instalación en la PC de Pinta

Esta primera versión instalable requiere **Windows y Node.js >=24**. Desde una copia del repositorio, abrí PowerShell una única vez y ejecutá:

```powershell
.\scripts\windows\install.ps1
```

La instalación compila el runtime, instala únicamente las dependencias de producción en `%LOCALAPPDATA%\PintaPrintAgent\app\` y registra la tarea **Pinta Print Agent**. La tarea se activa al iniciar sesión del usuario, ejecuta `node.exe dist\main.js` desde esa carpeta instalada sin consola visible, no permite instancias simultáneas (`IgnoreNew`) y, ante una terminación inesperada, intenta hasta tres reinicios con un minuto entre intentos. No es un Windows Service: así conserva acceso a la sesión, spooler y Bluetooth/COM del usuario.

Los datos que sobreviven una actualización o desinstalación normal son:

```text
%LOCALAPPDATA%\PintaPrintAgent\
├── config.json       configuración real (no se distribuye ni se sobrescribe)
├── agent.sqlite      deduplicación y estado durable
├── logs\agent.log    logs JSONL rotados (hasta 5 archivos de 5 MiB)
└── app\              runtime instalado que se puede reemplazar
```

Si todavía no existe `config.json`, el instalador copia una plantilla sin secretos y lo indica claramente; en ese caso registra la tarea pero no la inicia hasta que completes la configuración y ejecutes `start.ps1`. Completá `agent_token`, URL y la impresora antes de usar producción. Se respeta `PINTA_PRINT_AGENT_CONFIG` para una ubicación alternativa. Nunca agregues un token real al repositorio.

Para USB configurá `printer.mode = "usb"` y el nombre exacto de la impresora Windows en `printer.usb.printer_name`. Para Bluetooth SPP, emparejá primero la impresora en Windows, obtené el COM virtual y configurá `printer.mode = "bluetooth"`, `printer.bluetooth.port` y `printer.bluetooth.baud_rate`. Esto sólo selecciona los transportes existentes; no cambia la lógica ESC/POS.

Administración cotidiana:

```powershell
.\scripts\windows\status.ps1
.\scripts\windows\restart.ps1
.\scripts\windows\stop.ps1
.\scripts\windows\start.ps1
Get-Content "$env:LOCALAPPDATA\PintaPrintAgent\logs\agent.log" -Tail 100
```

`status.ps1` informa si la tarea existe, su estado, última ejecución y resultado. Si falta la configuración, es inválida, el servidor no responde o la impresora falla, el motivo queda en `logs\agent.log`; los logs redactan campos `token` y `Authorization`.

Para actualizar, ejecutá otra vez `install.ps1` desde la versión nueva del repositorio: reemplaza sólo `app\`, conserva config/SQLite/logs y actualiza la tarea sin duplicarla. Para desinstalar sin perder el estado:

```powershell
.\scripts\windows\uninstall.ps1
```

El borrado total requiere la opción explícita y peligrosa `-PurgeData`. Para revisar una instalación sin modificar la PC usá ` .\scripts\windows\install.ps1 -DryRun`.

## Configuración de impresión

`config.json` nunca se versiona. Para desarrollo o tests, `PINTA_PRINT_AGENT_CONFIG=C:\ruta\config.json` permite seleccionar otra configuración.

MockPrinter continúa siendo el modo seguro por defecto para desarrollo. Los bloques USB y Bluetooth pueden convivir: cambiar sólo `printer.mode` elige el transporte, sin tocar código.

```json
{
  "server_url": "https://example.com",
  "agent_token": "PASTE_TOKEN_HERE",
  "printer": { "mode": "mock" },
  "location_id": "pinta-main",
  "data_dir": "",
  "long_poll_wait_seconds": 25,
  "request_timeout_seconds": 40
}
```

USB (impresora instalada en Windows; los bytes ESC/POS se mandan sin conversión a HTML/PDF/gráficos):

```json
{
  "server_url": "https://example.com",
  "agent_token": "PASTE_TOKEN_HERE",
  "printer": {
    "mode": "usb",
    "profile": "80mm",
    "supports_cut": true,
    "usb": { "printer_name": "Pinta POS" },
    "bluetooth": { "port": "COM5", "baud_rate": 9600 }
  }
}
```

Bluetooth SPP (Windows debe haber asignado previamente un COM virtual):

```json
{
  "server_url": "https://example.com",
  "agent_token": "PASTE_TOKEN_HERE",
  "printer": {
    "mode": "bluetooth",
    "profile": "80mm",
    "supports_cut": true,
    "usb": { "printer_name": "Pinta POS" },
    "bluetooth": { "port": "COM5", "baud_rate": 9600 }
  }
}
```

Para volver a USB basta con cambiar `"mode": "usb"`. La configuración es estricta: USB exige `usb.printer_name`; Bluetooth exige `bluetooth.port` y `bluetooth.baud_rate`; `mode` y el alias legado `driver` no se pueden mezclar. `driver: "mock"` y `driver: "escpos-fake"` se aceptan sólo para compatibilidad con configuraciones de desarrollo existentes.

La composición ESC/POS sin hardware se habilita explícitamente así:

```json
{
  "server_url": "https://example.com",
  "agent_token": "DEVELOPMENT_ONLY",
  "printer": {
    "mode": "escpos-fake",
    "profile": "80mm",
    "supports_cut": false
  }
}
```

`escpos-fake` es exclusivamente de desarrollo: captura los bytes pero no produce papel. No debe ejecutarse contra una cola productiva, porque un flujo exitoso podría confirmar el pedido como impreso.

Si `data_dir` está vacío, el default de Windows es `%LOCALAPPDATA%\PintaPrintAgent`. MockPrinter crea `agent.sqlite` y `mock-output\<pedido>_<job_id>.txt`; los nombres no se sobrescriben y reciben un sufijo si ya existen.

## PrinterTransport y FakeTransport

El puerto para transportes presentes y futuros es:

```ts
interface PrinterTransport {
  open(): Promise<void>
  write(data: Uint8Array): Promise<void>
  close(): Promise<void>
}
```

`EscPosPrinter` codifica primero y luego ejecuta exactamente un `open`, un `write(bytes)` y un `close` en `finally`. `FakeTransport` mantiene copias defensivas de cada escritura, contadores de apertura/escritura/cierre, estado abierto/cerrado, fallo configurable y delay configurable. El reloj se puede inyectar para que sus tests sean determinísticos.

`WindowsRawPrinterTransport` usa un pequeño adaptador PowerShell/Win32 aislado que llama a `OpenPrinter`, `StartDocPrinter` con tipo `RAW`, `WritePrinter` y cierra el documento y handle en `finally`. No agrega un módulo nativo de Node. Cada `write` es un único documento de spooler, y no hay reintentos internos: si el spooler falla, el error llega al worker y se conserva la semántica conservadora existente.

`BluetoothSerialTransport` usa la dependencia mantenida `serialport` 13.0.0 (Node >=20; este proyecto requiere Node >=24). Su binding C++ se instala mediante binario precompilado cuando está disponible y puede requerir toolchain de compilación en instalaciones sin prebuild; por eso queda limitado a este adapter. Abre el COM configurado, envía exactamente el `Uint8Array`, espera `drain` y lo cierra. Bluetooth aquí significa exclusivamente **SPP con puerto serie virtual de Windows**. No todas las impresoras Bluetooth ofrecen SPP; si el modelo final usa BLE u otro protocolo, se reemplaza sólo este transporte, sin tocar encoder, renderer, worker ni SQLite.

## Perfiles y ancho de papel

`PrinterProfile` contiene `paperWidthMm`, `columns`, `supportsCut`, `characterEncoding` y `finalFeedLines`. Hay dos presets de **desarrollo**, no valores productivos:

| Preset | Ancho declarado | Columnas | Cut por defecto | Encoding | Feed final |
| --- | ---: | ---: | --- | --- | ---: |
| `58mm` | 58 mm | 32 | deshabilitado | `ascii-safe` | 3 líneas |
| `80mm` | 80 mm | 48 | deshabilitado | `ascii-safe` | 3 líneas |

El renderer ajusta separadores y envuelve líneas largas sin truncarlas. Las columnas reales dependen de la impresora, la fuente y la densidad; se confirmarán cuando exista un modelo concreto.

## Encoder ESC/POS

`EscPosEncoder` soporta actualmente:

| Función | Secuencia |
| --- | --- |
| Inicializar/reset | `ESC @` |
| Alinear izquierda/centro/derecha | `ESC a n` |
| Negrita on/off | `ESC E n` |
| Tamaño normal/doble | `GS ! n` |
| Salto de línea | `LF` |
| Feed final | `ESC d n` |
| Corte opcional | `GS V 0` |

El número `PEDIDO #N` se centra, imprime en negrita y en tamaño doble; luego se restauran los estilos. Al terminar también se fuerza izquierda, negrita off y tamaño normal. El comando de corte sólo se agrega cuando `supportsCut` es `true`; ambos presets lo dejan apagado. Esto prueba la estructura de bytes, no la compatibilidad de un cutter físico.

## Encoding de texto

La conversión texto → bytes está detrás de `TextEncoderStrategy`. En esta etapa se usa `AsciiSafeTextEncoder`, una estrategia deliberadamente conservadora:

- produce ASCII imprimible, no UTF-8 crudo;
- translitera diacríticos (`áéíóúü` → `aeiouu`, `ñ` → `n`);
- convierte puntuación tipográfica común a equivalentes ASCII;
- reemplaza caracteres o controles no representables con `?`, evitando que texto recibido inyecte comandos ESC/POS;
- es determinística para el mismo input.

Por ejemplo, `ÑANDÚ / medallón / tártara` se envía como `NANDU / medallon / tartara`. El `.txt` del renderer conserva Unicode; el `.bin` usa la estrategia anterior. Esto **no afirma compatibilidad física**: la estrategia se reemplazará por la code page confirmada para la impresora real.

## Ticket de cocina

Se conserva la semántica vigente: pedido, hora, cantidad, nombre, variante, removidos, extras, aderezos, total de medallones, todos los `cheese_counts` positivos y `SIN QUESO` cuando su conteo es mayor a cero. Los quesos se recorren dinámicamente; Tybo o cualquier queso futuro debe llegar dentro de `cheese_counts` y no requiere cambiar el renderer.

Ejemplo textual de 58 mm:

```text
================================
          PEDIDO #146
             22:11
================================

1x BURGER PINTA
   SIMPLE
   - SIN CEBOLLA
   + MEDALLÓN EXTRA
   ADEREZOS: MAYONESA / KETCHUP

--------------------------------
MEDALLONES: 13

CHEDDAR: 5
MOZZARELLA: 3
ROQUEFORT: 2
PROVOLONE: 1
SIN QUESO: 2
--------------------------------
```

El parser y el renderer trabajan por allowlist. No agregan cliente, teléfono, dirección, precios, pago, efectivo, vuelto ni transferencia.

## Dry run sin hardware

```powershell
npm run escpos:demo
```

El comando usa datos ficticios, recorre `RenderedTicket → EscPosEncoder → EscPosPrinter → FakeTransport` y crea un directorio único bajo la carpeta temporal del sistema. Informa la ruta absoluta y genera:

- `ticket.txt`: vista Unicode legible;
- `ticket.bin`: bytes ESC/POS exactos;
- `ticket.hex.txt`: offsets, hexadecimal y columna ASCII.

Nada se escribe dentro del repositorio ni se guarda en Git.

## Estado durable y deduplicación

SQLite es la fuente de verdad local. Los estados son `RECEIVED → PRINTING → PRINTED → ACKED`. Un error antes de éxito produce `FAILED`; un `PRINTING` encontrado al arrancar pasa a `AMBIGUOUS` y nunca se reimprime automáticamente.

Después de una impresión exitosa el orden es deliberadamente:

```text
Printer.print → SQLite PRINTED + COMMIT → ACK printed
```

Si el ACK se pierde, un reclaim actualiza el claim y reintenta sólo el ACK. Un mismo `job_id` con payload distinto se rechaza. Antes de imprimir se exige `schema_version === 1` y que `total_medallions` sea igual a la suma de `cheese_counts` más `no_cheese_count`.

La deduplicación cubre sólo una PC: dos agentes para la misma `location_id` no comparten SQLite.

## Red, health y apagado

El health check se realiza una vez al iniciar. `401` (token inválido) y `403` (agente deshabilitado) detienen el loop; el long poll usa `wait=25` y un timeout configurable. Errores de red, timeout o 5xx aplican backoff con jitter de 1, 2, 4… hasta 30 s y se reinician tras una comunicación correcta. Ningún log contiene el token ni el header `Authorization`.

`SIGINT` y `SIGTERM` detienen nuevos polls, abortan el fetch pendiente y cierran SQLite tras el loop. Una impresión ya iniciada conserva su transición durable normal.

## Qué está probado

Los tests cubren comandos ESC/POS, reset de estilos, cut habilitado/deshabilitado, perfiles 58/80 mm, wrapping, pedido destacado, todos los campos operativos del item, resumen dinámico con quesos actuales y futuros, `SIN QUESO`, privacidad administrativa, transliteración española, determinismo, copias defensivas, delay/fallo de FakeTransport, un único write y convivencia con MockPrinter. También siguen cubriendo HTTP falso, SQLite, deduplicación, reclaim y ACK.

No está probado físicamente:

- compatibilidad ESC/POS de una impresora concreta;
- cantidad real de columnas o márgenes;
- code page para acentos y `ñ`;
- compatibilidad del driver/spooler RAW de la impresora USB concreta;
- emparejamiento Bluetooth SPP, COM y baud rate reales;
- estado físico, papel, tapa, cutter, drawer o buzzer.

## Decisiones pendientes para la impresora real

Cuando Pinta compre la impresora harán falta exactamente estos datos:

- marca y modelo;
- papel de 58 u 80 mm y ancho imprimible/columnas reales;
- conexión USB instalada en Windows o emparejamiento Bluetooth SPP (COM y baud rate);
- presencia y comando compatible de autocutter;
- driver disponible para Windows y método RAW soportado;
- compatibilidad ESC/POS declarada y diferencias del fabricante;
- code page/configuración necesaria para español.

Con esa información se podrá agregar un transporte real (por ejemplo, `escpos-windows`) sin cambiar el worker, la lógica de negocio ni la semántica del renderer.
