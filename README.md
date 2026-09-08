# Pinta Print Agent

Agente local de impresión para la cocina de Pinta. El runtime activo es Node.js + TypeScript: recibe trabajos mediante HTTPS long polling, conserva el estado en SQLite y no modifica el contrato HTTP, el worker, ACK ni la deduplicación existentes.

La impresora objetivo de producción es una **Nexuspos NX80**, térmica **ESC/POS de 80 mm**, conectada exclusivamente por **USB** e instalada por Windows. El nombre de la cola se define en cada PC después de instalar el driver; no se fija en el código.

## Flujo de producción

```text
PrintJob → renderer ESC/POS → WindowsRawPrinterTransport → cola RAW de Windows → USB → Nexuspos NX80
```

`WindowsRawPrinterTransport` entrega el `Uint8Array` ESC/POS directamente al spooler como un documento `RAW`. Usa `OpenPrinter`, `StartDocPrinter`, `StartPagePrinter`, `WritePrinter`, `EndPagePrinter`, `EndDocPrinter` y `ClosePrinter`. No usa HTML, PDF, imagen, GDI, navegador ni acceso USB por VID/PID.

Los tres modos soportados son:

- `mock`: modo seguro de desarrollo que mantiene `MockPrinter`.
- `escpos-fake`: desarrollo/tests sin hardware; captura bytes en memoria.
- `usb`: producción mediante `WindowsRawPrinterTransport`.

La configuración sólo acepta esos tres modos. Una configuración heredada que declare un modo o ajustes seriales no compatibles falla al iniciar con un error explícito.

## Configuración

Copiá la plantilla y completá los secretos y el nombre de Windows:

```powershell
Copy-Item config.example.json config.json
```

La configuración productiva es:

```json
{
  "server_url": "https://example.com",
  "agent_token": "PASTE_TOKEN_HERE",
  "printer": {
    "mode": "usb",
    "profile": "80mm",
    "supports_cut": true,
    "usb": {
      "printer_name": "REEMPLAZAR_POR_NOMBRE_EXACTO_DE_WINDOWS"
    }
  },
  "location_id": "pinta-main",
  "data_dir": "",
  "long_poll_wait_seconds": 25,
  "request_timeout_seconds": 40
}
```

Para desarrollo seguro puede usarse `"printer": { "mode": "mock" }`. Para ensayar el encoder sin papel, usá `escpos-fake` con `profile`, `supports_cut` y sin backend productivo. Los aliases legacy `driver: "mock"` y `driver: "escpos-fake"` se mantienen sólo para configuraciones de desarrollo ya existentes.

## Cuando llegue la impresora

1. Instalar el driver de la Nexuspos NX80.
2. Conectarla por USB y verificar que Windows la detecte.
3. Ejecutar `./scripts/windows/list-printers.ps1`.
4. Copiar exactamente el nombre listado para la térmica.
5. Configurar `printer.mode = "usb"`, `printer.profile = "80mm"`, `printer.supports_cut = true` y `printer.usb.printer_name = "<nombre exacto>"`.
6. Detener temporalmente el agente productivo si hace falta evitar consumo de cola.
7. Ejecutar `npm run printer:test`.
8. Verificar caracteres, alineación, negrita, tamaño doble, ancho, feed y cutter.
9. Sólo entonces habilitar el agente contra la cola productiva.

`list-printers.ps1` sólo consulta Windows. Prefiere `Get-Printer` y usa `Win32_Printer` como respaldo.

`npm run printer:test` carga la configuración real con la misma lógica del runtime, exige `printer.mode = "usb"` y recorre `renderKitchenTicket → EscPosEncoder → WindowsRawPrinterTransport → EscPosPrinter`. Envía un ticket local de diagnóstico `PEDIDO #999` con texto, negrita, número a doble tamaño, alineación, feed y corte. No crea worker, no consulta la cola, no crea `print_jobs`, no realiza ACK y no toca SQLite. No lo ejecutes hasta que la impresora esté disponible.

El perfil `80mm` de Nexuspos NX80 usa 48 columnas, encoding `ascii-safe`, tres líneas de feed y corte completo ESC/POS (`GS V 0`). El encoder agrega el feed antes del corte y emite el corte una única vez por trabajo cuando `supports_cut` está activado.

## Instalación y validación

Se requiere Windows y Node.js 24 o superior:

```powershell
npm install
npm test
npm run lint
npm run typecheck
npm run build
.\scripts\windows\install.ps1
```

Para revisar el instalador sin modificar Windows:

```powershell
.\scripts\windows\install.ps1 -DryRun
```

La instalación registra la tarea de usuario **Pinta Print Agent**, conserva `%LOCALAPPDATA%\PintaPrintAgent\config.json`, SQLite y logs entre actualizaciones, y no inicia una plantilla nueva hasta que esté configurada.

## Desarrollo sin hardware

```powershell
npm run escpos:demo
```

El demo crea una vista de texto y los bytes ESC/POS en un directorio temporal. `AsciiSafeTextEncoder` translitera caracteres españoles y evita controles no representables.

SQLite continúa siendo la fuente de verdad local. La secuencia conserva `Printer.print → SQLite PRINTED + COMMIT → ACK printed`; ante un error o incertidumbre no se reimprime automáticamente.
