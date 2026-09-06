import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Logger { info(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void; error(event: string, fields?: Record<string, unknown>): void }

const secretKey = /token|authorization/i;
const secretText = /(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+|(bearer\s+)[^\s,;]+/gi;

/** Removes credentials before serialising structured log fields. */
export function redact(fields: Record<string, unknown> = {}): Record<string, unknown> {
  const clean = (value: unknown): unknown => {
    if (typeof value === 'string') return value.replace(secretText, '$1$2[REDACTED]');
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, secretKey.test(key) ? '[REDACTED]' : clean(nested)]));
    return value;
  };
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, secretKey.test(key) ? '[REDACTED]' : clean(value)]));
}

const line = (level: string, event: string, fields?: Record<string, unknown>) => JSON.stringify({ time: new Date().toISOString(), level, event, ...redact(fields) });
export class ConsoleLogger implements Logger {
  private write(level: string, event: string, fields?: Record<string, unknown>) { console.log(line(level, event, fields)); }
  info(event: string, fields?: Record<string, unknown>) { this.write('info', event, fields); }
  warn(event: string, fields?: Record<string, unknown>) { this.write('warn', event, fields); }
  error(event: string, fields?: Record<string, unknown>) { this.write('error', event, fields); }
}

export interface FileLoggerOptions { maxBytes?: number; maxFiles?: number; fileName?: string }
/** Synchronous writes keep startup and fatal-error logging reliable without a logging dependency. */
export class FileLogger implements Logger {
  private readonly path: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  constructor(directory: string, options: FileLoggerOptions = {}) {
    mkdirSync(directory, { recursive: true });
    this.path = join(directory, options.fileName ?? 'agent.log');
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 5;
  }
  private rotate() {
    if (!existsSync(this.path) || statSync(this.path).size < this.maxBytes) return;
    const oldest = `${this.path}.${this.maxFiles}`;
    if (existsSync(oldest)) rmSync(oldest);
    for (let index = this.maxFiles - 1; index >= 1; index--) {
      const source = `${this.path}.${index}`; const target = `${this.path}.${index + 1}`;
      if (existsSync(source)) renameSync(source, target);
    }
    renameSync(this.path, `${this.path}.1`);
  }
  private write(level: string, event: string, fields?: Record<string, unknown>) { this.rotate(); appendFileSync(this.path, `${line(level, event, fields)}\n`, 'utf8'); }
  info(event: string, fields?: Record<string, unknown>) { this.write('info', event, fields); }
  warn(event: string, fields?: Record<string, unknown>) { this.write('warn', event, fields); }
  error(event: string, fields?: Record<string, unknown>) { this.write('error', event, fields); }
}

export class CompositeLogger implements Logger {
  constructor(private readonly loggers: readonly Logger[]) {}
  info(event: string, fields?: Record<string, unknown>) { this.loggers.forEach((logger) => logger.info(event, fields)); }
  warn(event: string, fields?: Record<string, unknown>) { this.loggers.forEach((logger) => logger.warn(event, fields)); }
  error(event: string, fields?: Record<string, unknown>) { this.loggers.forEach((logger) => logger.error(event, fields)); }
}

/** Adds runtime-known secrets (such as the configured agent token) to the redaction boundary. */
export class SecretRedactingLogger implements Logger {
  constructor(private readonly logger: Logger, private readonly secrets: readonly string[]) {}
  private clean(fields: Record<string, unknown> = {}): Record<string, unknown> {
    const replace = (value: unknown): unknown => {
      if (typeof value === 'string') return this.secrets.filter(Boolean).reduce((text, secret) => text.split(secret).join('[REDACTED]'), value);
      if (Array.isArray(value)) return value.map(replace);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, replace(nested)]));
      return value;
    };
    return replace(fields) as Record<string, unknown>;
  }
  info(event: string, fields?: Record<string, unknown>) { this.logger.info(event, this.clean(fields)); }
  warn(event: string, fields?: Record<string, unknown>) { this.logger.warn(event, this.clean(fields)); }
  error(event: string, fields?: Record<string, unknown>) { this.logger.error(event, this.clean(fields)); }
}
