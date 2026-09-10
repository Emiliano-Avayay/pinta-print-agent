import { defaultConfigPath } from './runtime-paths.js';
import { loadConfig } from './config.js';
import { writeConfigAtomically } from './config-writer.js';
import { HttpError, HttpPrintApi } from './http-client.js';
import { runPrinterTest } from './printer-test.js';

function fail(message: string): never { console.error(message); process.exitCode = 1; throw new Error(message); }
function configPath(value?: string): string { return value || process.env.PINTA_PRINT_AGENT_CONFIG || defaultConfigPath(); }

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'write') {
    const [path, serverUrl, locationId, agentToken, printerName] = args;
    if (!path || !serverUrl || !agentToken || !printerName) fail('Missing required configuration fields.');
    writeConfigAtomically(path, { serverUrl, locationId, agentToken, printerName });
    console.log('Configuración guardada.');
    return;
  }
  if (command === 'health') {
    const config = loadConfig(configPath(args[0]));
    const api = new HttpPrintApi(config);
    try { await api.health(); console.log('Servidor conectado correctamente.'); }
    catch (error) {
      if (error instanceof HttpError) {
        const friendly: Record<string, string> = { AUTH: 'Token rechazado.', DISABLED: 'El agente está deshabilitado.', TEMPORARY: 'Servidor no disponible o no se pudo resolver.', PROTOCOL: 'El servidor respondió con datos no válidos.' };
        fail(friendly[error.kind] ?? 'No se pudo conectar al servidor.');
      }
      throw error;
    } finally { api.close(); }
    return;
  }
  if (command === 'print-test') { await runPrinterTest(configPath(args[0])); return; }
  fail('Uso: configurator-cli.js <write|health|print-test>');
}

await main().catch((error) => {
  if (process.exitCode) return;
  // Do not include command arguments here: they can contain the token.
  console.error(error instanceof Error ? error.message : 'Error inesperado.');
  process.exitCode = 1;
});
