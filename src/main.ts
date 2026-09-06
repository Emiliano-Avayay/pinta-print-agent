import { join } from 'node:path';
import { loadConfig } from './config.js';
import { HttpPrintApi } from './http-client.js';
import { JobLedger } from './ledger.js';
import { CompositeLogger, ConsoleLogger, FileLogger, SecretRedactingLogger } from './logger.js';
import { createPrinterRuntime } from './printer-factory.js';
import { defaultLogDir } from './runtime-paths.js';
import { PrintWorker } from './worker.js';

const bootstrapLogger = new FileLogger(defaultLogDir());
try {
  const config = loadConfig();
  const logger = new SecretRedactingLogger(new CompositeLogger([new ConsoleLogger(), bootstrapLogger]), [config.agentToken]);
  const api = new HttpPrintApi(config); const ledger = new JobLedger(join(config.dataDir, 'agent.sqlite')); const runtime = createPrinterRuntime(config); const worker = new PrintWorker(config, api, runtime.printer, ledger, logger, { renderTicket: runtime.renderTicket });
  process.once('SIGINT', () => worker.stop()); process.once('SIGTERM', () => worker.stop());
  await worker.run();
} catch (error) {
  bootstrapLogger.error('startup_failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
