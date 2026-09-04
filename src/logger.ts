export interface Logger { info(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void; error(event: string, fields?: Record<string, unknown>): void }
const redact = (fields: Record<string, unknown> = {}) => Object.fromEntries(Object.entries(fields).filter(([key]) => !/token|authorization/i.test(key)));
export class ConsoleLogger implements Logger {
  private write(level: string, event: string, fields?: Record<string, unknown>) { console.log(JSON.stringify({ time: new Date().toISOString(), level, event, ...redact(fields) })); }
  info(event: string, fields?: Record<string, unknown>) { this.write('info', event, fields); }
  warn(event: string, fields?: Record<string, unknown>) { this.write('warn', event, fields); }
  error(event: string, fields?: Record<string, unknown>) { this.write('error', event, fields); }
}
