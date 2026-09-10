# Pinta Print Agent

Agente local de impresión de Pinta para Windows 10/11 x64. La impresión de producción permanece en el flujo validado:

```text
PrintJob → renderer ESC/POS → WindowsRawPrinterTransport → cola RAW de Windows → USB → impresora POS 80 mm
```

La cola de Windows (por ejemplo, `POS-80`) es la fuente de verdad. El agente nunca depende de `USB001`, `USB002`, VID/PID ni acceso USB directo.

## Instalación en una PC de Pinta

La PC no necesita Node.js, npm, Git, Python ni una consola. Conectá la impresora USB y ejecutá como administrador `PintaPrintAgent-Setup.exe`.

1. Dejá activada la opción **Instalar/reinstalar driver POS**, salvo que el driver ya esté correctamente instalado. El Setup abre el instalador del fabricante de manera interactiva porque no se asumieron argumentos silenciosos no verificados.
2. En el configurador, elegí la cola de Windows, normalmente `POS-80`. Se muestran driver, puerto y estado sólo para diagnóstico; el puerto no se guarda.
3. Completá servidor (por defecto `https://pedidopinta.com.ar`), Location ID (`pinta-main`) y token. El token queda oculto.
4. Usá **Probar conexión** y **Imprimir prueba**. Esta última usa el mismo renderer ESC/POS y `WindowsRawPrinterTransport` que producción, incluido feed y corte.
5. Elegí **Guardar y finalizar**. Se crea la tarea oculta **Pinta Print Agent**, que arranca al iniciar sesión y reinicia hasta tres veces con un intervalo de un minuto ante fallos.

El menú Inicio incluye Configurar, Imprimir prueba, Ver estado, Ver logs, Reiniciar agente y Desinstalar. El diagnóstico no muestra el token e informa ruta, servidor, location, impresora, driver, puerto, estado de tarea, conectividad y últimas líneas del log.

Los datos persistentes se guardan en `%LOCALAPPDATA%\PintaPrintAgent\`: `config.json`, `agent.sqlite` y `logs`. Las actualizaciones reemplazan sólo `app` y `scripts`, por lo que no borran configuración, ledger ni logs. El desinstalador detiene y elimina la tarea y conserva esos datos como medida segura; se pueden borrar manualmente después de confirmar que ya no se necesitan.

## Desarrollo

Requiere Node.js 24 o superior.

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

La plantilla de configuración es `config.example.json`. El modo de producción es `printer.mode = "usb"`, que significa cola RAW de Windows hacia USB; `mock` y `escpos-fake` son sólo para desarrollo. El perfil de 80 mm usa 48 columnas, codificación segura ASCII, tres líneas de feed y corte completo cuando `supports_cut` está activado.

### Contratos del protocolo Print Agent

Los esquemas de los recursos se versionan de forma independiente. `GET /api/print-agent/health` usa estrictamente `schema_version: 2`, junto con `status: "ok"` y el `location_id` configurado. `GET /api/print-agent/jobs/next` entrega actualmente `PrintJob` con `schema_version: 1`; `parsePrintJob` lo valida de forma estricta y no se actualiza al cambiar health. Los ACK no tienen un campo `schema_version`: se validan por su estado HTTP y llevan el `claim_token` y resultado correspondientes.

### Generar el instalador (Windows)

1. Copiá localmente el instalador validado del fabricante en:

   `vendor\pos-driver\POS Printer Driver Setup V11.3.0.3.exe`

   Ese ejecutable está excluido por `.gitignore` y no debe subirse al repositorio.
2. Instalá [Inno Setup 6](https://jrsoftware.org/isinfo.php) en la máquina de build.
3. Ejecutá:

   ```powershell
   npm ci
   npm run installer:win
   ```

`installer:prepare` descarga el runtime privado fijado de Node `v24.12.0` para Windows x64, y verifica su SHA-256 contra el manifiesto oficial. También falla antes de empaquetar si faltan el driver, el build, el runtime o `ISCC.exe`. El resultado es `release\PintaPrintAgent-Setup-<versión>.exe` y la copia de entrega `release\PintaPrintAgent-Setup.exe`.

El proyecto puede editarse desde macOS, pero `npm run installer:win` debe ejecutarse en Windows para usar el compilador estable de Inno Setup. La validación final de driver, cola, ancho, corte y arranque automático requiere una prueba física con la NexusPOS/POS 80 mm.
